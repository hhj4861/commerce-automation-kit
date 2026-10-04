import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { chromium } from 'playwright';
const out = process.env.HANMADI_E2E_SCREENSHOTS;
assert(out, 'Set HANMADI_E2E_SCREENSHOTS to the approved artifact directory');
await mkdir(out, { recursive: true });
const dataFile = join(resolve(out), `google-fixture-${Date.now()}.json`);
await writeFile(dataFile, '{}', { flag: 'wx' });
const portServer = createServer().listen(0, '127.0.0.1');
await once(portServer, 'listening');
const port = portServer.address().port; await new Promise(resolve => portServer.close(resolve));
const base = `http://localhost:${port}`, clientId = 'fixture.apps.googleusercontent.com';
const { privateKey, publicKey } = await generateKeyPair('RS256');
const jwks = { keys: [{ ...await exportJWK(publicKey), kid: 'test', alg: 'RS256' }] };
const env = { ...process.env, AUTH_SECRET: randomBytes(32).toString('hex'),
  NODE_ENV: 'development', HANMADI_GOOGLE_CLIENT_ID: clientId, HANMADI_GOOGLE_E2E_JWKS: JSON.stringify(jwks),
  HANMADI_LOCAL_DATA_FILE: dataFile, HANMADI_DEPLOYMENT: '',
  NODE_OPTIONS: `--import=${pathToFileURL(resolve('scripts/google-login-test-keys.mjs')).href}`,
  UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', KV_REST_API_URL: '', KV_REST_API_TOKEN: '',
  TUTOR_PIN: 'fixture-only', TUTOR_PINS: '',
};
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '--hostname', 'localhost'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; app.stdout.on('data', b => logs += b); app.stderr.on('data', b => logs += b);
let browser;
const sign = (nonce, subject = 'google-user-1') => new SignJWT({ nonce, email: 'same@example.com', email_verified: true, name: 'Google 학습자' })
  .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer('https://accounts.google.com').setAudience(clientId)
  .setSubject(subject).setIssuedAt().setExpirationTime('5m').sign(privateKey);
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (app.exitCode !== null) throw new Error('Fixture app exited');
    try { if ((await fetch(base + '/api/study/account/google')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, 'Fixture app did not start');
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  // Stub only the external GIS browser SDK. Browser challenge -> signed token ->
  // real route -> real RS256/JWKS validation -> real persistence/cookies are exercised.
  let invalidNonce = true;
  await page.exposeFunction('fixtureCredential', nonce => sign(invalidNonce ? 'wrong-browser' : nonce));
  await page.route('https://accounts.google.com/gsi/client*', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.google = { accounts: { id: {
      initialize(c) { this.config = c; },
      renderButton(node) { const b = document.createElement('button'); b.type='button'; b.textContent='Google 계정으로 계속하기';
        b.onclick=async()=>this.config.callback({credential:await window.fixtureCredential(this.config.nonce)}); node.append(b); }
    } } };` }));
  // OAuth disclosures must be reachable before a learner has a session.
  const privacy = await context.request.get(base + '/privacy', { maxRedirects: 0 });
  assert.equal(privacy.status(), 200);
  assert.match(await privacy.text(), /개인정보 처리방침/);
  await page.goto(base + '/privacy');
  assert.equal(await page.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: join(out, 'privacy-mobile.png'), fullPage: true });
  await page.goto(base + '/study');
  const button = page.getByRole('button', { name: 'Google 계정으로 계속하기' });
  await button.waitFor();
  assert.equal(await page.getByRole('link', { name: '개인정보 처리방침 (새 창)', exact: true }).getAttribute('href'), '/privacy');
  assert.equal(await page.getByLabel('학습자 아이디', { exact: true }).count(), 1);
  assert.equal(await page.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth), true);
  await page.screenshot({ path: join(out, 'google-login-mobile.png'), fullPage: true });
  const denied = page.waitForResponse(r => r.url().endsWith('/api/study/account/google') && r.request().postDataJSON()?.action === 'credential');
  await button.click(); assert.equal((await denied).status(), 401);
  await page.getByRole('alert').filter({ hasText: 'Google 인증이 만료' }).waitFor();
  assert(!(await context.cookies()).some(c => c.name === 'hanmadi_google_flow'));
  assert.equal(await page.getByLabel('학습자 아이디', { exact: true }).isEnabled(), true);
  await page.screenshot({ path: join(out, 'google-login-error.png'), fullPage: true });
  invalidNonce = false; await page.reload(); await button.waitFor();
  await context.addCookies([{ name: 'hanmadi_tutor', value: 'previous-tutor-session', url: base }, { name: 'hanmadi_language', value: 'ja', url: base }]);
  const login = page.waitForResponse(r => r.url().endsWith('/api/study/account/google') && r.request().postDataJSON()?.action === 'credential');
  await button.click(); const signedIn = await login; assert.equal(signedIn.status(), 200);
  const cookieHeaders = (await signedIn.headersArray()).filter(h => h.name.toLowerCase() === 'set-cookie').map(h => h.value.replace(/^[^;]+/, h.value.split('=')[0] + '=<redacted>'));
  await page.getByRole('heading', { name: '한마디 시작하기', exact: true }).waitFor({ state: 'hidden' });
  const cookies = await context.cookies();
  const learnerCookie = cookies.find(c => c.name === 'hanmadi_learner');
  assert(learnerCookie?.httpOnly); assert.equal(learnerCookie.sameSite, 'Lax');
  assert.deepEqual(cookies.filter(c => ['hanmadi_google_flow', 'hanmadi_tutor', 'hanmadi_language'].includes(c.name)).map(c => ({ name: c.name, path: c.path, expires: c.expires, empty: c.value === '' })), [], JSON.stringify(cookieHeaders));
  const account = await (await context.request.get(base + '/api/study/account')).json();
  assert.equal(account.owner, false); assert.equal(account.name, 'Google 학습자');
  assert.equal((await context.request.get(base + '/api/study/admin')).status(), 403);
  const post = (ctx, path, body) => ctx.request.post(base + path, { headers: { origin: base }, data: body });
  const saved = await post(context, '/api/study', { action: 'save-word', language: 'ja', phrase: { text: 'ありがとう', reading: '아리가토오', meaning: '고마워요' } });
  assert.equal(saved.status(), 200); assert.equal((await saved.json()).saved, true);
  await post(context, '/api/study/account', { action: 'logout' });
  assert.equal((await context.request.get(base + '/api/study/account')).status(), 401);
  async function apiLogin(ctx, subject) {
    const challenge = await post(ctx, '/api/study/account/google', { action: 'challenge' });
    assert.equal(challenge.status(), 200);
    const { nonce } = await challenge.json(), credential = await sign(nonce, subject);
    const response = await post(ctx, '/api/study/account/google', { action: 'credential', credential });
    assert.equal(response.status(), 200);
    assert.equal((await post(ctx, '/api/study/account/google', { action: 'credential', credential })).status(), 401);
  }
  await apiLogin(context, 'google-user-1');
  const restored = await (await context.request.get(base + '/api/study')).json();
  assert.equal(restored.identity.actor, account.actor);
  assert(restored.state.expressions.some(p => p.text === 'ありがとう'));
  const other = await browser.newContext();
  await apiLogin(other, 'google-user-2');
  const isolated = await (await other.request.get(base + '/api/study')).json();
  assert.notEqual(isolated.identity.actor, account.actor); assert.equal(isolated.state.expressions.length, 0);
  const password = await browser.newContext();
  assert.equal((await post(password, '/api/study/account', { action: 'signup', name: 'existing', password: 'fixture-password-1234' })).status(), 200);
  await post(password, '/api/study/account', { action: 'logout' });
  assert.equal((await post(password, '/api/study/account', { action: 'login', name: 'existing', password: 'fixture-password-1234' })).status(), 200);
  assert.equal((await (await password.request.get(base + '/api/study/account')).json()).owner, false);
  console.log('PASS: browser Google fixture -> RS256 validation -> learner cookie -> private vocabulary -> logout/relogin; same-email isolation; password regression. Live Google consent is not tested.');
} finally {
  await browser?.close(); app.kill('SIGTERM');
  await Promise.race([once(app, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]);
  if (app.exitCode === null) app.kill('SIGKILL');
  await writeFile(join(out, 'google-e2e-server.log'), logs);
}
