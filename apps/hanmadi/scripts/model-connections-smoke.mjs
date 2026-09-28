/** Browser -> Next -> real account API/SQLite; ONLY model/OAuth upstream mocked. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, symlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const service = resolve(source, '../../services/ai-gateway');
const temp = mkdtempSync(join(tmpdir(), 'hanmadi-models-'));
const app = join(temp, 'app'), origin = 'http://127.0.0.1:3194';
const invocations = join(temp, 'calls.jsonl'); writeFileSync(invocations, '');
let defaults = 0, browser, page;
const children = [];
const mock = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const input = JSON.parse(raw);
  assert.equal(req.headers.authorization, 'Bearer model-fixture');
  assert.equal(input.model, 'hanmadi-chat'); defaults++;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ choices: [{ message: { content: 'こんにちは。\n곤니치와.\n안녕하세요.' } }] }));
});
const fakeProvider = `import asyncio,json,os,time,uvicorn
from fastapi import HTTPException
from account_service import create_app
async def run(action,id,model,messages,store):
 if action=='connect':
  if store.get(id)['provider']=='codex':
   store.update(id,challenge={'url':'https://auth.openai.com/codex/device','code':'TEST-1234','expiresAt':time.time()+120})
   await asyncio.sleep(2)
  store.update(id,state='connected',secret={'fixture':'not-real-credentials'},challenge={})
  return {'reply':'OK'}
 with open(os.environ['QA_CALLS'],'a') as f: f.write(json.dumps({'id':id,'model':model,'subject':store.get(id)['subject']})+'\\n')
 if messages[-1]['content']=='quota-check':
  store.update(id,state='quota_exceeded')
  raise HTTPException(429,'quota_exceeded')
 return {'reply':'こんにちは。\\n곤니치와.\\n안녕하세요.'}
uvicorn.run(create_app(runner=run),host='127.0.0.1',port=4197,access_log=False)
`;
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM'); await Promise.race([ended, delay(5000)]);
  if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await ended; }
}
try {
  cpSync(source, app, { recursive: true, filter: path => !relative(source, path).split(sep).some(part => part.startsWith('.env') || ['node_modules', '.next', '.data', '.litellm', 'ops', '.vercel'].includes(part)) });
  symlinkSync(join(source, 'node_modules'), join(app, 'node_modules'), 'dir');
  await new Promise(resolve => mock.listen(4198, '127.0.0.1', resolve));
  children.push(spawn(process.env.ACCOUNT_TEST_PYTHON || 'python3', ['-c', fakeProvider], { cwd: service, stdio: 'inherit', env: {
    PATH: process.env.PATH, ACCOUNT_DATA_DIR: join(temp, 'accounts'), ACCOUNT_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    ACCOUNT_PLATFORM_KEYS: JSON.stringify({ hanmadi: 'h'.repeat(40) }), ACCOUNT_MODELS: JSON.stringify({ codex: ['gpt-test', 'gpt-second'], claude: ['claude-test'] }), QA_CALLS: invocations,
  } }));
  children.push(spawn(process.execPath, [join(app, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3194'], { cwd: app, stdio: 'inherit', env: {
    PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', TUTOR_PINS: 'Smoke:864209,Other:753108', AUTH_SECRET: 'model-flow-fixture-no-production-auth',
    CONVERSATION_PROVIDER: 'litellm', LITELLM_BASE_URL: 'http://127.0.0.1:4198/v1', LITELLM_API_KEY: 'model-fixture', LITELLM_MODEL: 'hanmadi-chat',
    AI_ACCOUNTS_URL: 'http://127.0.0.1:4197', AI_ACCOUNTS_KEY: 'h'.repeat(40), AI_ACCOUNTS_SUBJECT_SECRET: 's'.repeat(40),
  } }));
  let ready = false;
  for (let n = 0; n < 90; n++) {
    try { if ((await fetch(origin + '/login', { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch { /* Cold compile. */ }
    if (children.some(c => c.exitCode !== null)) break;
    await delay(1000);
  }
  assert.ok(ready, 'test server ready');
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await context.newPage(); page.setDefaultTimeout(30000);
  const errors = []; page.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR', e.message); });
  async function login(pin) {
    await page.goto(origin + '/login'); await page.getByPlaceholder('PIN', { exact: true }).fill(pin);
    await page.getByRole('button', { name: '열기', exact: true }).click(); await page.waitForURL('**/languages**');
  }
  await login('864209');
  await page.getByRole('button', { name: /일본어 시작하기/ }).click();
  await page.waitForURL('**/assessment**');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: '처음이에요 · 듣고 말하기부터', exact: true }).click();
  const [assessment] = await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/learning-profile') && r.request().method() === 'POST'),
    page.getByRole('button', { name: '듣고 말하기로 시작', exact: true }).click(),
  ]);
  const profile = (await assessment.json()).profile;
  await page.getByRole('link', { name: '듣고 말하기 시작 →', exact: true }).click();
  await page.getByRole('heading', { name: '먼저 소리를 들어요' }).waitFor();
  assert.equal(await page.getByLabel('함께 연습할 AI').inputValue(), 'default');
  await page.goto(origin + '/conversation?language=ja&mode=free');
  async function chat(text, expected = 200) {
    await page.locator('textarea').fill(text);
    const [response] = await Promise.all([
      page.waitForResponse(r => r.url().endsWith('/api/conversation') && r.request().method() === 'POST'),
      page.getByRole('button', { name: '보내기', exact: true }).click(),
    ]);
    assert.equal(response.status(), expected);
  }
  await chat('こんにちは'); assert.equal(defaults, 1);
  await page.getByText('내 AI 계정 연결 · 선택', { exact: true }).click();
  await page.getByLabel(/선택한 AI에 대화가 전달되고/).check();
  await page.getByRole('button', { name: 'Codex 계정 연결', exact: true }).click();
  await page.getByText('TEST-1234', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: /공식 로그인 화면 열기/ }).getAttribute('href'), 'https://auth.openai.com/codex/device');
  await page.getByText('Codex · 연결됨', { exact: true }).waitFor();
  let records = (await (await page.request.get(origin + '/api/model-connections')).json()).connections;
  const codex = records.find(c => c.provider === 'codex').id;
  await page.getByLabel('함께 연습할 AI').selectOption(codex + ':gpt-second');
  assert.equal(await page.locator('textarea').inputValue(), '');
  await chat('よろしくお願いします'); assert.equal(defaults, 1);
  assert.equal(JSON.parse(readFileSync(invocations, 'utf8').trim().split('\n').at(-1)).model, 'gpt-second');
  await page.getByLabel('Claude API 키', { exact: true }).fill('sk-ant-api03-' + 'x'.repeat(40));
  await page.getByRole('button', { name: 'Claude API 연결', exact: true }).click();
  await page.getByText('Claude · 연결됨', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Claude API 키', { exact: true }).inputValue(), '');
  records = (await (await page.request.get(origin + '/api/model-connections')).json()).connections;
  const claude = records.find(c => c.provider === 'claude').id;
  await page.getByLabel('함께 연습할 AI').selectOption(claude + ':claude-test'); await chat('こんにちは');
  await page.getByRole('listitem').filter({ hasText: 'Claude · 연결됨' }).getByRole('button', { name: '연결 해제', exact: true }).click();
  await page.getByText('선택한 계정을 사용할 수 없어요. 연결을 확인하거나 위에서 기본 Gemini를 선택해 주세요.', { exact: true }).waitFor();
  assert.equal(defaults, 1, 'disconnect never falls back');
  await page.getByLabel('함께 연습할 AI').selectOption(codex + ':gpt-test');
  const guided = await page.request.post(origin + '/api/conversation', { headers: { Origin: origin }, data: { language: 'ja', lessonId: 'greetings', level: 'beginner', learningRevision: profile.revision, guidedStep: 0, messages: [{ role: 'user', content: 'こんにちは' }], modelSelection: codex + ':gpt-test' } });
  assert.equal(guided.status(), 200, await guided.text());
  await chat('quota-check', 429);
  assert.equal(defaults, 1, 'quota never falls back');
  for (const width of [390, 1280]) { await page.setViewportSize({ width, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
  if (process.env.HANMADI_QA_OUTPUT) await page.screenshot({ path: join(process.env.HANMADI_QA_OUTPUT, 'model-connections.png'), fullPage: true });
  await page.request.delete(origin + '/api/auth'); await login('753108');
  assert.deepEqual((await (await page.request.get(origin + '/api/model-connections')).json()).connections, []);
  const forged = await page.request.post(origin + '/api/conversation', { headers: { Origin: origin }, data: { language: 'ja', lessonId: 'greetings', level: 'beginner', messages: [{ role: 'user', content: 'hi' }], modelSelection: codex + ':gpt-test' } });
  assert.equal(forged.status(), 409);
  const csrf = await page.request.post(origin + '/api/model-connections', { headers: { Origin: 'https://evil.test' }, data: { provider: 'codex' } }); assert.equal(csrf.status(), 403);
  assert.deepEqual(errors, []);
  console.log('PASS browser -> Next -> real account service: default Gemini, device challenge, Codex/Claude selection, guided request, revocation, quota, no fallback, user isolation, CSRF, mobile/desktop');
} catch (error) {
  if (page) { console.log(await page.locator('body').innerText()); await page.screenshot({ path: join(tmpdir(), 'hanmadi-model-failure.png'), fullPage: true }); }
  throw error;
} finally {
  await browser?.close();
  for (const child of children.reverse()) await stop(child);
  mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
