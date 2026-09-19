import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { verifyGoogleIdToken } from '../lib/google-id-token.js';
import { authConfig, authRoute, googleUser, readSession } from '../lib/google-auth.js';

const env = { GOOGLE_AUTH_MODE: 'gis', GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com', SHOPSHORTS_ORIGIN: 'http://127.0.0.1:5198', SHOPSHORTS_SESSION_SECRET: 'fixture-session-secret-'.repeat(3), SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS: '1' };
const origin = env.SHOPSHORTS_ORIGIN;
const { privateKey, publicKey } = await generateKeyPair('RS256');
const now = Math.floor(Date.now() / 1000);
async function token(nonce, overrides = {}, key = privateKey) {
  return new SignJWT({ iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, sub: 'google-user-123', email: 'new@example.org', email_verified: true, nonce, iat: now, exp: now + 3600, ...overrides }).setProtectedHeader({ alg: 'RS256' }).sign(key);
}
const verify = (credential, client, nonce) => verifyGoogleIdToken(credential, client, nonce, publicKey);
async function challenge() {
  const response = await authRoute(new Request(origin + '/auth/google/challenge'), env);
  assert.equal(response.status, 200);
  return { ...(await response.json()), cookie: response.headers.get('set-cookie').split(';')[0] };
}
function submit(credential, cookie, requestOrigin = origin) {
  return new Request(origin + '/auth/google/credential', { method: 'POST', headers: { 'content-type': 'application/json', origin: requestOrigin, cookie }, body: JSON.stringify({ credential }) });
}

test('GIS public signup needs no client secret or email allowlist; default admission remains closed', () => {
  assert.equal(authConfig(env).ready, true);
  assert.equal(authConfig(env).mode, 'gis');
  assert.equal(authConfig({ ...env, SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS: '0' }).ready, false);
  assert.equal(authConfig({ ...env, SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS: 'yes' }).ready, false);
});

test('verified Gmail and external Google accounts sign in, get HttpOnly session, and return home', async () => {
  for (const email of ['new@gmail.com', 'new@example.org']) {
    const c = await challenge();
    const response = await authRoute(submit(await token(c.nonce, { email }), c.cookie), env, undefined, verify);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).redirect, '/');
    const cookie = response.headers.getSetCookie().find(value => value.startsWith('ss_google='));
    assert.match(cookie, /HttpOnly; SameSite=Lax/);
    const session = cookie.split(';')[0];
    assert.equal((await googleUser(new Request(origin, { headers: { cookie: session } }), env)).email, email);
    assert.equal(await googleUser(new Request(origin, { headers: { cookie: session } }), { ...env, SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS: '0', SHOPSHORTS_GOOGLE_ALLOWED_EMAILS: 'owner@example.com' }), null);
    assert.ok(response.headers.getSetCookie().some(value => value.startsWith('ss_oauth=;') && value.includes('Max-Age=0')));
  }
});

test('Google signature, issuer, audience, expiry, nonce and email verification are mandatory', async () => {
  const c = await challenge();
  for (const bad of [
    { iss: 'https://attacker.example' }, { aud: 'other-client' }, { exp: now - 10 },
    { nonce: 'different-browser' }, { email_verified: false }, { sub: '' },
    { email: '' }, { azp: 'other-client' }, { iat: now + 300 }
  ]) {
    const response = await authRoute(submit(await token(c.nonce, bad), c.cookie), env, undefined, verify);
    assert.equal(response.status, 401, JSON.stringify(bad));
    assert.ok(!response.headers.getSetCookie().some(value => value.startsWith('ss_google=')));
  }
  const other = await generateKeyPair('RS256');
  await assert.rejects(verify(await token(c.nonce, {}, other.privateKey), env.GOOGLE_CLIENT_ID, c.nonce));
});

test('cross-site, missing challenge, wrong challenge type, malformed body and oversized credentials are rejected', async () => {
  const c = await challenge();
  const credential = await token(c.nonce);
  assert.equal((await authRoute(submit(credential, c.cookie, 'https://attacker.example'), env, undefined, verify)).status, 403);
  assert.equal((await authRoute(submit(credential, ''), env, undefined, verify)).status, 401);
  const signedFlow = c.cookie.slice('ss_oauth='.length);
  assert.equal((await readSession(signedFlow, env)).type, 'gis');
  assert.equal((await authRoute(submit('x'.repeat(16001), c.cookie), env, undefined, verify)).status, 401);
  const invalid = new Request(origin + '/auth/google/credential', { method: 'POST', headers: { 'content-type': 'application/json', cookie: c.cookie }, body: '{invalid' });
  assert.equal((await authRoute(invalid, env, undefined, verify)).status, 401);
  const noJson = new Request(origin + '/auth/google/credential', { method: 'POST', headers: { cookie: c.cookie }, body: 'credential=x' });
  assert.equal((await authRoute(noJson, env, undefined, verify)).status, 415);
});
