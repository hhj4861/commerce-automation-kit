import test from 'node:test';
import assert from 'node:assert/strict';
import { cloudSecrets } from '../lib/cloud-secrets.js';

test('repeated requests in one warm runtime do not each call the broker', async () => {
  let calls = 0;
  const binding = { async getPagesSecrets() {
    calls++;
    return { SHOPSHORTS_TOKEN: 'fixture-worker', SHOPSHORTS_SESSION_SECRET: 'fixture-session' };
  } };
  for (let i = 0; i < 12; i++) await cloudSecrets({ CREDENTIALS: binding });
  assert.equal(calls, 1, '12 sequential requests must resolve the static bundle only once');
});

const fixture = value => ({ SHOPSHORTS_TOKEN: value, SHOPSHORTS_SESSION_SECRET: 'fixture-session' });

test('expiry refreshes rotations; exact TTL and clock rollback cannot serve old values', async t => {
  let now = 1_000, value = 'first', calls = 0;
  t.mock.method(Date, 'now', () => now);
  const env = { CREDENTIALS: { async getPagesSecrets() { calls++; return fixture(value); } } };
  assert.equal((await cloudSecrets(env)).SHOPSHORTS_TOKEN, 'first');
  now += 29_999; value = 'second';
  assert.equal((await cloudSecrets(env)).SHOPSHORTS_TOKEN, 'first');
  now++;
  assert.equal((await cloudSecrets(env)).SHOPSHORTS_TOKEN, 'second');
  now = 500; value = 'third';
  assert.equal((await cloudSecrets(env)).SHOPSHORTS_TOKEN, 'third');
  assert.equal(calls, 3);
});

test('failed refresh never returns expired secrets; recovery is immediately retried', async t => {
  let now = 1000, fail = false, calls = 0;
  t.mock.method(Date, 'now', () => now);
  const env = { CREDENTIALS: { async getPagesSecrets() {
    calls++; if (fail) throw Error('fixture broker outage'); return fixture('current');
  } } };
  await cloudSecrets(env); now += 30_000; fail = true;
  await assert.rejects(cloudSecrets(env));
  await assert.rejects(cloudSecrets(env));
  fail = false; assert.equal((await cloudSecrets(env)).SHOPSHORTS_TOKEN, 'current');
  assert.equal(calls, 4);
});

test('binding changes are isolated while current request configuration stays fresh', async () => {
  const one = { async getPagesSecrets() { return fixture('one'); } };
  const two = { async getPagesSecrets() { return fixture('two'); } };
  const first = await cloudSecrets({ CREDENTIALS: one, SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS: '1' });
  first.SHOPSHORTS_TOKEN = 'caller-mutation';
  const next = await cloudSecrets({ CREDENTIALS: one, SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS: '0' });
  assert.equal(next.SHOPSHORTS_TOKEN, 'one');
  assert.equal(next.SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS, '0');
  assert.equal((await cloudSecrets({ CREDENTIALS: two })).SHOPSHORTS_TOKEN, 'two');
});

test('missing or invalid bundles are not cached', async () => {
  let calls = 0;
  const env = { CREDENTIALS: { async getPagesSecrets() {
    calls++; return calls === 1 ? {} : calls === 2 ? { ...fixture('ok'), extra: {} } : fixture('ok');
  } } };
  await assert.rejects(cloudSecrets(env));
  await assert.rejects(cloudSecrets(env));
  assert.equal((await cloudSecrets(env)).SHOPSHORTS_TOKEN, 'ok');
  assert.equal(calls, 3);
});

test('migration bypasses cached secrets and legacy mode remains explicit', async () => {
  let calls = 0, imports = 0;
  const binding = { async getPagesSecrets() { calls++; return fixture(String(calls)); }, async importPagesSecrets() { imports++; } };
  await cloudSecrets({ CREDENTIALS: binding });
  for (let i = 0; i < 2; i++) await cloudSecrets({ CREDENTIALS: binding, CAK_IMPORT_LEGACY_SECRETS: '1' });
  assert.equal(imports, 2); assert.equal(calls, 3);
  await cloudSecrets({ CREDENTIALS: binding }); assert.equal(calls, 4);
  const legacy = { SHOPSHORTS_TOKEN: 'legacy' }; assert.equal(await cloudSecrets(legacy), legacy);
});

test('slow reads do not extend expiry and concurrent requests do not share pending I/O', async t => {
  let now = 1000, calls = 0; const releases = [];
  t.mock.method(Date, 'now', () => now);
  const binding = { async getPagesSecrets() {
    calls++; await new Promise(resolve => releases.push(resolve)); return fixture('value');
  } };
  const a = cloudSecrets({ CREDENTIALS: binding }), b = cloudSecrets({ CREDENTIALS: binding });
  assert.equal(calls, 2); now += 30_001;
  releases.splice(0).forEach(resolve => resolve()); await Promise.all([a, b]);
  const c = cloudSecrets({ CREDENTIALS: binding }); assert.equal(calls, 3);
  releases.shift()(); await c;
});
