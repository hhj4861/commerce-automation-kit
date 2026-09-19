import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, generateKeyPairSync, webcrypto } from 'node:crypto';
import { handleRequest, readSecrets } from '../index.mjs';
import { authorizeGithub, authorizeMigration, REPOSITORY, GITHUB_KEYS } from '../policy.mjs';
import { readVault, writeVault } from '../vault.mjs';
import { cloudSecrets } from '../../shopshorts/lib/cloud-secrets.js';
globalThis.crypto ||= webcrypto;

const claims = (file = 'keyword-intel-sync.yml') => ({
  repository: REPOSITORY, repository_id: '1310729493', repository_owner_id: '71001056',
  ref: 'refs/heads/main', sub: `repo:${REPOSITORY}:ref:refs/heads/main`,
  event_name: 'workflow_dispatch', runner_environment: 'github-hosted',
  workflow_ref: `${REPOSITORY}/.github/workflows/${file}@refs/heads/main`, sha: 'trusted-sha',
});
function memoryDb() {
  const rows = new Map();
  return { rows, prepare(sql) { return { bind(...args) { return {
    async first() { return rows.get(args[0]) || null; },
    async run() {
      let changes = 0;
      if (sql.startsWith('INSERT')) {
        if (!rows.has(args[0])) { rows.set(args[0], { revision: 1, payload: args[1] }); changes = 1; }
      } else if (sql.startsWith('UPDATE')) {
        const row = rows.get(args[2]);
        if (row?.revision === args[3]) { rows.set(args[2], { revision: row.revision + 1, payload: args[0] }); changes = 1; }
      } else if (sql.startsWith('DELETE')) { changes = Number(rows.delete(args[0])); }
      return { meta: { changes } };
    },
  }; } }; } };
}
const env = () => ({ DB: memoryDb(), VAULT_KEY: { get: async () => Buffer.alloc(32, 17).toString('base64') },
  ...Object.fromEntries(GITHUB_KEYS.map(k => [`SS_${k}`, { get: async () => `fixture-${k}` }])) });
const request = (path, body = {}, token = 'fixture') => new Request(`https://broker.example${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const verify = file => ({ github: async () => claims(file), runner: async () => ({}) });

test('workflow policy grants only needed keys', () => {
  assert.deepEqual(authorizeGithub(claims('tts-remote.yml'), {}).keys, ['ELEVENLABS_API_KEY']);
  assert.equal(authorizeGithub(claims(), {}).keys.length, 9);
});
for (const [name, patch] of Object.entries({ fork: { repository_id: 'other' }, owner: { repository_owner_id: 'other' }, pr: { event_name: 'pull_request' }, tag: { ref: 'refs/tags/v1' }, subject: { sub: `repo:${REPOSITORY}:environment:prod` }, workflow: { workflow_ref: `${REPOSITORY}/.github/workflows/evil.yml@refs/heads/main` }, reusable: { job_workflow_ref: 'attacker/workflow@main' }, runner: { runner_environment: 'self-hosted' } })) {
  test(`rejects ${name} identity`, () => assert.throws(() => authorizeGithub({ ...claims(), ...patch }, {})));
}
test('migration requires pinned sha and expires', () => {
  const config = { MIGRATION_SHA: 'trusted-sha', MIGRATION_EXPIRES_AT: String(Date.now() + 10000) };
  assert.doesNotThrow(() => authorizeMigration(claims(), config));
  assert.throws(() => authorizeMigration({ ...claims(), sha: 'wrong' }, config));
  assert.throws(() => authorizeMigration(claims(), { ...config, MIGRATION_EXPIRES_AT: '1' }));
  assert.throws(() => authorizeMigration(claims('tts-remote.yml'), config));
});
test('anonymous and invalid JWT requests receive no credentials', async () => {
  assert.equal((await handleRequest(request('/github/secrets', {}, ''), env())).status, 401);
  const result = await handleRequest(request('/github/secrets'), env());
  assert.equal(result.status, 403);
  assert.doesNotMatch(await result.text(), /fixture-NAVER/);
});
test('GitHub response is scoped, uncached, and has no CORS header', async () => {
  const result = await handleRequest(request('/github/secrets'), env(), verify('tts-remote.yml'));
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys((await result.json()).values), ['ELEVENLABS_API_KEY']);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('access-control-allow-origin'), null);
});
test('missing required key fails whole response without plaintext errors', async () => {
  const config = env(); delete config.SS_NAVER_CLIENT_ID;
  const result = await handleRequest(request('/github/secrets'), config, verify());
  assert.equal(result.status, 503);
  assert.doesNotMatch(await result.text(), /fixture|NAVER/);
});
test('vault encryption, tamper resistance and revision conflict', async () => {
  const config = env();
  const value = { refresh_token: randomBytes(32).toString('hex') };
  assert.equal(await writeVault(config, 'codex', value, 0), 1);
  assert.ok(!config.DB.rows.get('codex').payload.includes(value.refresh_token));
  assert.deepEqual((await readVault(config, 'codex')).value, value);
  await assert.rejects(writeVault(config, 'codex', {}, 0), { status: 409 });
  assert.equal(await writeVault(config, 'codex', { updated: true }, 1), 2);
  await assert.rejects(writeVault(config, 'codex', {}, 1), { status: 409 });
  config.DB.rows.set('youtube', config.DB.rows.get('codex'));
  await assert.rejects(readVault(config, 'youtube')); // AAD prevents swapping records.
});
test('one-time GitHub import cannot overwrite and requires full schema', async () => {
  const config = { ...env(), MIGRATION_SHA: 'trusted-sha', MIGRATION_EXPIRES_AT: String(Date.now() + 10000) };
  const values = Object.fromEntries(GITHUB_KEYS.map(k => [k, 'test-value']));
  assert.equal((await handleRequest(request('/github/import', { values: { bad: 'x' } }), config, verify())).status, 400);
  assert.equal((await handleRequest(request('/github/import', { values }), config, verify())).status, 200);
  assert.equal((await handleRequest(request('/github/import', { values }), config, verify())).status, 409);
  assert.deepEqual((await readVault(config, 'migration/github')).value, values);
});
test('oversized request rejected', async () => {
  assert.equal((await handleRequest(request('/github/secrets', { value: 'a'.repeat(65537) }), env(), verify())).status, 413);
});
test('runner JWT is verified cryptographically and cannot access GitHub route', async () => {
  const { SignJWT, importJWK } = await import('jose');
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const config = { ...env(), RUNNER_PUBLIC_JWK: JSON.stringify(publicKey.export({ format: 'jwk' })) };
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'EdDSA' }).setIssuer('cak-runner').setSubject('shopshorts-runner').setAudience('cak-cloudflare-secrets').setIssuedAt().setExpirationTime('60s').setJti('test').sign(await importJWK(privateKey.export({ format: 'jwk' }), 'EdDSA'));
  assert.equal((await handleRequest(request('/runner/secrets', {}, token), config)).status, 200);
  assert.equal((await handleRequest(request('/github/secrets', {}, token), config)).status, 403);
  assert.equal((await handleRequest(request('/runner/secrets', {}, `${token}x`), config)).status, 403);
});
test('Pages takes central credentials and fails closed if required bindings are absent', async () => {
  const original = { SHOPSHORTS_TOKEN: 'legacy', CREDENTIALS: { getPagesSecrets: async () => ({ SHOPSHORTS_TOKEN: 'central', SHOPSHORTS_SESSION_SECRET: 'session' }) } };
  assert.equal((await cloudSecrets(original)).SHOPSHORTS_TOKEN, 'central');
  assert.equal(original.SHOPSHORTS_TOKEN, 'legacy');
  await assert.rejects(cloudSecrets({ CREDENTIALS: { getPagesSecrets: async () => ({}) } }));
  await assert.rejects(readSecrets(env(), ['NOT_ALLOWED']));
});
