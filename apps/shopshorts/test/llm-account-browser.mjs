// Integration browser test: real HTTP API, encrypted SQLite vault and queue worker;
// only provider login/generation are fixtures (no subscription credentials needed).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { accountAction, accountRunner } from '../../credential-broker/llm-accounts.mjs';
import { llmAccountApi } from '../lib/llm-account-api.js';
import { signSession } from '../lib/google-auth.js';
import { startAccountWorker } from '../studio-account-worker.mjs';
import { recommendBrief } from '../lib/studio-recommendations.js';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const db = new Database(':memory:');
db.exec('CREATE TABLE credential_vault(name TEXT PRIMARY KEY, revision INTEGER, payload TEXT, updated_at TEXT)');
const env = { SHOPSHORTS_SESSION_SECRET: 'fixture-session-secret'.repeat(3), SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS: '1',
  VAULT_KEY: { get: async () => Buffer.alloc(32, 6).toString('base64') }, DB: { prepare(sql) { return { bind(...args) { return {
    first: async () => db.prepare(sql).get(...args), all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
  }; } }; } } };
const suggestions = Array.from({ length: 3 }, (_, i) => ({ topic: `집중력 추천 ${i + 1}`, direction: '차분한 설명', reason: '테스트 검색 근거' }));
let finishLogin, generated = 0, generatedProvider;
const worker = startAccountWorker({ intervalMs: 20, call: (_, input) => accountRunner(env, input), execute: async (value, { signal, update, read }) => {
  if (value.job.kind === 'connect') {
    if (value.job.provider === 'claude') {
      await update({ job: { manual: { url: 'https://claude.com/cai/oauth/authorize?state=fixture-state', state: 'fixture-state' } } });
      while (!signal.aborted) {
        const fresh = await read();
        if (fresh.job.code) { assert.equal(fresh.job.code, 'authorization-fixture#fixture-state'); await update({ credential: { fixture: true }, provider: 'claude', account: 'claude@example.test', job: { state: 'done', manual: null, code: null } }); return; }
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return;
    }
    await update({ job: { device: { url: 'https://auth.openai.com/codex/device', code: 'TEST-CODE' } } });
    await new Promise(resolve => { finishLogin = resolve; signal.addEventListener('abort', resolve, { once: true }); });
    if (signal.aborted) return;
    await update({ credential: { fixture: true }, account: 'browser@example.test', job: { state: 'done', device: null } });
  } else {
    assert.equal(value.job.input.category, '심리학'); assert.equal(value.job.input.topic, '내가 쓴 주제');
    const result = await recommendBrief(value.job.input, {}, { provider: value.job.provider, generate: async () => ({ searched: true, value: { suggestions, sources: [{ title: '검색 출처 테스트', url: 'https://example.org/source' }] } }) });
    generated++; generatedProvider = result.provider; await update({ job: { state: 'done', result } });
  }
} });
const server = createServer(async (req, res) => {
  try {
    const origin = `http://127.0.0.1:${server.address().port}`, chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = new Request(origin + req.url, { method: req.method, headers: req.headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) });
    let response = await llmAccountApi(request, env, (owner, operation, input) => accountAction(env, owner, operation, input));
    if (!response) {
      const path = new URL(request.url).pathname;
      if (path === '/api/studio/config') response = Response.json({ categories: ['심리학', '건축학'], execution: 'local', capabilities: {} });
      else if (path === '/api/studio') response = Response.json({ projects: [] });
      else if (path === '/auth/status') response = Response.json({ authenticated: true, user: { name: '테스트' } });
      else {
        const file = path === '/studio' ? 'studio.html' : path.slice(1);
        if (!/^[a-zA-Z0-9.-]+$/.test(file)) throw Error('not found');
        response = new Response(await readFile(join(import.meta.dirname, '../public', file)), { headers: { 'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' } });
      }
    }
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('fixture server error'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await context.addCookies([{ name: 'ss_google', value: await signSession({ type: 'user', sub: 'browser-user', email: 'browser@example.test', exp: Date.now() + 600000 }, env), url: origin }]);
  const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin + '/studio?new=1');
  await page.locator('#topic').fill('내가 쓴 주제'); await page.locator('#direction').fill('내가 쓴 요청사항');
  await page.locator('[data-recommend="topic"]').click();
  await page.getByRole('dialog').waitFor();
  assert.match(await page.getByRole('dialog').innerText(), /Claude/);
  await page.screenshot({ path: '/private/tmp/cak-connection-chooser-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Codex 연결', exact: true }).click();
  await page.getByText('TEST-CODE', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: /ChatGPT 인증 화면 열기/ }).getAttribute('href'), 'https://auth.openai.com/codex/device');
  await page.screenshot({ path: '/private/tmp/cak-llm-account-desktop.png', fullPage: true });
  finishLogin();
  await page.locator('.recommendation-card').first().waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.recommendation-card').count(), 3); assert.equal(generated, 1);
  assert.equal(await page.locator('#topic').inputValue(), '내가 쓴 주제');
  await page.getByRole('button', { name: '주제·분위기 적용', exact: true }).first().click();
  assert.equal(await page.locator('#topic').inputValue(), '집중력 추천 1');
  await page.getByRole('button', { name: 'AI 계정 연결 관리', exact: true }).click();
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  await page.getByRole('button', { name: 'Codex 연결', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#topic').inputValue(), '집중력 추천 1');
  await page.locator('[data-recommend="topic"]').click();
  await page.getByRole('button', { name: 'Codex 연결', exact: true }).click();
  await page.getByText('TEST-CODE', { exact: true }).waitFor();
  await page.keyboard.press('Escape');
  for (let i = 0; i < 30; i++) {
    const status = await (await page.request.get(origin + '/api/studio/llm/status')).json();
    if (!status.job) break;
    if (i === 29) throw Error('Escape did not cancel pending authentication');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-recommend="topic"]').click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('dialog').evaluate(node => node.scrollWidth <= node.clientWidth), true);
  await page.screenshot({ path: '/private/tmp/cak-llm-account-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-recommend="topic"]').isEnabled(), true);
  assert.equal(await page.locator('#topic').inputValue(), '집중력 추천 1');
  await page.locator('#topic').fill('내가 쓴 주제');
  await page.locator('[data-recommend="topic"]').click();
  await page.getByRole('button', { name: 'Claude 연결', exact: true }).click();
  await page.getByRole('link', { name: /Claude 인증 화면 열기/ }).waitFor();
  await page.getByLabel('일회용 인증 코드', { exact: true }).fill('authorization-fixture#wrong-state');
  await page.getByRole('button', { name: '연결 완료', exact: true }).click();
  await page.getByText('다른 연결 요청의 인증 코드입니다.', { exact: false }).waitFor();
  await page.getByLabel('일회용 인증 코드', { exact: true }).fill('authorization-fixture#fixture-state');
  await page.waitForTimeout(1800); // Verify polling does not erase the code or focus.
  assert.equal(await page.getByLabel('일회용 인증 코드', { exact: true }).inputValue(), 'authorization-fixture#fixture-state');
  assert.equal(await page.getByLabel('일회용 인증 코드', { exact: true }).evaluate(node => node === document.activeElement), true);
  assert.equal(await page.getByRole('dialog').evaluate(node => node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight), true);
  await page.screenshot({ path: '/private/tmp/cak-llm-claude-mobile.png', fullPage: true });
  await page.getByRole('button', { name: '연결 완료', exact: true }).click();
  await page.locator('.recommendation-card').first().waitFor({ timeout: 15000 });
  assert.equal(generatedProvider, 'claude'); assert.equal(generated, 2);
  assert.equal(await page.locator('#topic').inputValue(), '내가 쓴 주제');
  await page.getByRole('button', { name: 'AI 계정 연결 관리', exact: true }).click();
  await page.getByText('claude@example.test', { exact: true }).waitFor();
  await page.getByRole('button', { name: '연결 해제', exact: true }).click();
  await page.keyboard.press('Escape');
  await worker.stop(); db.prepare('DELETE FROM credential_vault WHERE name = ?').run('llm/runtime');
  await page.locator('[data-recommend="topic"]').click();
  await page.getByText('LLM 실행기가 오프라인입니다.', { exact: false }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Codex 연결', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: 'Chrome', checks: ['provider selection', 'Codex device code', 'automatic continuation', 'three recommendations', 'apply suggestion', 'disconnect', 'cancel pending login', 'mobile layout', 'escape preserves input', 'Claude authorization code', 'wrong-state rejection', 'polling preserves code', 'Claude recommendation', 'offline runtime'], provider: 'fixture', passed: true }));
} finally {
  if (browser) await browser.close(); await worker.stop();
  await new Promise(resolve => server.close(resolve)); db.close();
}
