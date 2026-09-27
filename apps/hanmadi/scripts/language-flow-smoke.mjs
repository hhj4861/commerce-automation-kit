/** Browser -> Next -> mock Dify regression; no production credentials or student data. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'hanmadi-language-'));
const app = join(temp, 'app');
const origin = 'http://127.0.0.1:3190';
const requests = [];
const answers = { '일본어': 'こんにちは。\n한글 발음: 곤니치와\n뜻: 안녕하세요.', '태국어': 'สวัสดีค่ะ\n한글 발음: 싸왓디이 카\n뜻: 안녕하세요.', '한국어': '안녕하세요. 만나서 반가워요.' };
const mock = createServer(async (req, res) => {
  assert.equal(req.headers.authorization, 'Bearer language-smoke-only');
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); requests.push(body);
  assert.ok(answers[body.inputs.language]);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ answer: answers[body.inputs.language], conversation_id: body.conversation_id || randomUUID() }));
});
let child, browser;
async function cleanup() {
  await browser?.close(); browser = undefined;
  if (child && child.exitCode === null && child.signalCode === null) {
    const ended = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM'); await Promise.race([ended, delay(5000)]);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await ended; }
  }
  mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void cleanup().then(() => process.exit(0)));
try {
  cpSync(source, app, { recursive: true, filter: path => !relative(source, path).split(sep).some(part =>
    part.startsWith('.env') || ['node_modules', '.next', '.data', '.litellm', 'ops', '.vercel'].includes(part)) });
  symlinkSync(join(source, 'node_modules'), join(app, 'node_modules'), 'dir');
  await new Promise((resolve, reject) => { mock.once('error', reject); mock.listen(4196, '127.0.0.1', resolve); });
  child = spawn(process.execPath, [join(app, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3190'], {
    cwd: app, stdio: 'inherit', env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
      TUTOR_PINS: 'Smoke:864209', AUTH_SECRET: 'isolated-language-flow-never-use-in-production', CONVERSATION_PROVIDER: 'dify',
      DIFY_BASE_URL: 'http://127.0.0.1:4196', DIFY_API_KEY: 'language-smoke-only', DIFY_USER_SECRET: 'isolated-language-flow-secret-not-production' },
  });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(origin + '/languages', { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch { /* Cold compilation. */ }
    if (child.exitCode !== null) break;
    await delay(1000);
  }
  assert.ok(ready, 'Next server did not start');
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const [code, name, pronunciation] of [['th', '태국어', '싸왓디이'], ['ja', '일본어', '곤니치와'], ['ko', '한국어', null]]) {
    await page.goto(origin + '/login');
    await page.getByPlaceholder('PIN', { exact: true }).fill('864209');
    await page.getByRole('button', { name: '열기', exact: true }).click();
    await page.waitForURL('**/languages**');
    await page.getByRole('button', { name: new RegExp(name + ' 시작하기') }).click();
    await page.waitForURL('**/learn?language=' + code);
    assert.ok(await page.getByRole('heading', { name: name + '로 한마디씩' }).isVisible());
    if (pronunciation) assert.ok((await page.locator('body').innerText()).includes('한글 발음 · ' + pronunciation));
    const cookie = (await context.cookies()).find(c => c.name === 'hanmadi_language');
    assert.equal(cookie.value, code); assert.equal(cookie.httpOnly, true);
    await page.getByRole('link', { name: 'AI 회화', exact: true }).click();
    await page.waitForURL('**/conversation?language=' + code);
    assert.ok((await page.locator('body').innerText()).includes(name + ' · 인사와 자기소개'));
    await page.reload();
    await page.getByLabel('대화가 회화 서버에 저장되는 것에 동의해요.').check();
    await page.locator('textarea').fill('안녕하세요');
    const pending = page.waitForResponse(r => r.url().endsWith('/api/conversation') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    assert.equal((await pending).status(), 200);
    await page.getByRole('log').getByText(answers[name], { exact: true }).waitFor();
    assert.equal(requests.at(-1).inputs.language, name);
    if (code !== 'ko') assert.match(requests.at(-1).inputs.scenario, /한글 발음과 한국어 뜻/);
    await page.goto(origin + '/learn');
    assert.ok(await page.getByRole('heading', { name: name + '로 한마디씩' }).isVisible());
    await page.goto(origin + '/conversation');
    assert.ok((await page.locator('body').innerText()).includes(name + ' · 인사와 자기소개'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile viewport overflow');
    await page.getByRole('link', { name: name + ' · 변경', exact: true }).click();
    await page.waitForURL('**/languages**');
    await page.getByRole('button', { name: '일본어 시작하기', exact: false }).click();
    await page.waitForURL('**/conversation?language=ja');
    assert.equal(await page.getByRole('log').getByText('첫 한마디를 건네 보세요.').count(), 1);
    await page.request.delete(origin + '/api/auth');
    await page.goto(origin + '/learn'); await page.waitForURL('**/languages**');
  }
  // Guest study links retain the private student context through selection (no auth privilege granted).
  await page.goto(origin + '/conversation?s=synthetic-student&lesson=cafe');
  await page.waitForURL('**/languages**');
  await page.getByRole('button', { name: /태국어 시작하기/ }).click();
  await page.waitForURL('**/conversation?s=synthetic-student&lesson=cafe&language=th');
  const invalid = await page.request.post(origin + '/api/learning-language', { headers: { Origin: origin }, form: { language: 'xx' } });
  assert.equal(invalid.status(), 400);
  const crossOrigin = await page.request.post(origin + '/api/learning-language', { headers: { Origin: 'https://invalid.example' }, form: { language: 'ja' } });
  assert.equal(crossOrigin.status(), 403);
  assert.deepEqual(errors, []);
  console.log('PASS: login -> language selection -> study -> header conversation -> mock Dify, 3 languages, Hangul aids, refresh, bare URLs, switch/reset, mobile, logout, student context, validation and origin checks.');
  if (process.argv.includes('--serve')) { console.log('LANGUAGE_SMOKE_URL=' + origin + '/login (synthetic PIN 864209)'); await new Promise(() => {}); }
} finally { await cleanup(); }
