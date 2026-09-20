import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFile, writeFile, stat, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { accountAction, accountRunner, publicAccount } from '../../credential-broker/llm-accounts.mjs';
import { readVault, writeVault } from '../../credential-broker/vault.mjs';
import { llmAccountApi } from '../lib/llm-account-api.js';
import { signSession } from '../lib/google-auth.js';
import { startAccountWorker } from '../studio-account-worker.mjs';
import { executeAccountJob, safeDevice } from '../studio-account-codex.mjs';
import { onRequest as cloudApi } from '../functions/api/[[path]].js';

export function fixture() {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE credential_vault (name TEXT PRIMARY KEY, revision INTEGER, payload TEXT, updated_at TEXT)');
  const env = { VAULT_KEY: { get: async () => Buffer.alloc(32, 23).toString('base64') }, DB: { prepare(sql) {
    return { bind(...args) { return {
      first: async () => db.prepare(sql).get(...args),
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }),
    }; } };
  } } };
  return { env, db };
}
const a = 'a'.repeat(64), b = 'b'.repeat(64);
const brief = { category: '심리학', format: 'short', duration: 32, focus: 'topic', topic: '집중력', direction: '' };
const auth = { auth_mode: 'chatgpt', tokens: { refresh_token: 'fixture-refresh', access_token: 'fixture-access' } };
const waitFor = async check => { for (let i = 0; i < 100; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('Condition not reached'); };

test('accounts fail closed offline, never expose credentials, and fence disconnects', async t => {
  const { env, db } = fixture(); t.after(() => db.close());
  assert.equal((await accountAction(env, a, 'connect', { provider: 'codex' })).status, 503);
  await accountRunner(env, { operation: 'poll' });
  const started = await accountAction(env, a, 'connect', { provider: 'codex', owner: b });
  assert.equal(started.job.state, 'queued');
  assert.equal((await accountAction(env, b, 'status')).job, null);
  assert.equal((await accountAction(env, a, 'connect', { provider: 'codex' })).status, 409);
  const name = `llm/account/${a}`, record = await readVault(env, name);
  await writeVault(env, name, { credential: auth, account: 'fixture@example.test', job: { ...record.value.job, state: 'done' } }, record.revision);
  assert.equal((await accountAction(env, a, 'status')).connected, true);
  assert.doesNotMatch(JSON.stringify(await accountAction(env, a, 'status')), /fixture-refresh|fixture-access|tokens/);
  assert.doesNotMatch(db.prepare('SELECT payload FROM credential_vault WHERE name = ?').get(name).payload, /fixture-refresh|fixture-access/);
  const stale = await readVault(env, name);
  await accountAction(env, a, 'disconnect');
  await assert.rejects(writeVault(env, name, stale.value, stale.revision), { status: 409 });
  assert.equal((await accountAction(env, a, 'status')).connected, false);
  assert.equal((await accountAction(env, a, 'recommend', { brief })).status, 428);
});

test('expired jobs and lost runner leases are explicit failures, not endless spinners', () => {
  for (const job of [{ state: 'queued', deadline: 9 }, { state: 'running', deadline: 100, leaseUntil: 9 }]) {
    const view = publicAccount({ job: { ...job, id: 'x', kind: 'connect', device: { code: 'SECRET' } } }, 10);
    assert.equal(view.job.state, 'failed'); assert.equal(view.job.device, undefined);
  }
});

test('cancelling an unfinished login removes credentials saved immediately before completion', async t => {
  const { env, db } = fixture(); t.after(() => db.close());
  await writeVault(env, `llm/account/${a}`, { credential: auth, job: { id: 'pending', kind: 'connect', state: 'running', deadline: Date.now() + 10000, leaseUntil: Date.now() + 10000 } }, 0);
  assert.equal((await accountAction(env, a, 'cancel', { id: 'other' })).status, 409);
  const result = await accountAction(env, a, 'cancel', { id: 'pending' });
  assert.equal(result.connected, false); assert.equal(result.job, null);
  assert.equal((await readVault(env, `llm/account/${a}`)).value.credential, undefined);
});

test('HTTP account routes bind Google subject, reject CSRF/oversize and work through Pages dispatch', async () => {
  const env = { SHOPSHORTS_SESSION_SECRET: 'x'.repeat(40), SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS: '1' };
  const cookies = await Promise.all(['a', 'b'].map(sub => signSession({ type: 'user', sub, email: `${sub}@example.test`, exp: Date.now() + 10000 }, env)));
  const seen = [];
  env.CREDENTIALS = { llmAccount: async (owner, operation, input) => { seen.push({ owner, operation, input }); return { connected: false }; } };
  const req = (cookie, input = {}, origin = 'https://studio.test', path = 'llm/connect') => new Request(`https://studio.test/api/studio/${path}`, { method: 'POST', headers: { cookie: `ss_google=${cookie}`, origin, 'content-type': 'application/json' }, body: JSON.stringify(input) });
  for (const cookie of cookies) assert.equal((await cloudApi({ request: req(cookie, { provider: 'codex', owner: 'forged' }), env })).status, 202);
  assert.notEqual(seen[0].owner, seen[1].owner); assert.match(seen[0].owner, /^[a-f0-9]{64}$/);
  assert.equal((await llmAccountApi(req(cookies[0], {}, 'https://evil.test'), env, env.CREDENTIALS.llmAccount)).status, 403);
  assert.equal((await llmAccountApi(req('', {}), env, env.CREDENTIALS.llmAccount)).status, 401);
  assert.equal((await llmAccountApi(req(cookies[0], { text: 'x'.repeat(16001) }), env, env.CREDENTIALS.llmAccount)).status, 413);
  assert.equal((await llmAccountApi(req(cookies[0], {}, undefined, 'recommendations'), env, env.CREDENTIALS.llmAccount)).status, 400);
  assert.equal(seen.length, 2);
});

test('two runners claim a job only once; disconnect invalidates an in-flight credential save', async t => {
  const { env, db } = fixture(); t.after(() => db.close());
  const call = (_path, input) => accountRunner(env, input);
  await call('', { operation: 'poll' }); await accountAction(env, a, 'connect', { provider: 'codex' });
  let executions = 0, save, finish;
  const execute = async (_value, { update }) => { executions++; save = update; await new Promise(r => { finish = r; }); };
  const first = startAccountWorker({ call, execute, intervalMs: 100000, log() {} });
  const second = startAccountWorker({ call, execute, intervalMs: 100000, log() {} });
  await waitFor(() => executions === 1);
  await accountAction(env, a, 'disconnect');
  await assert.rejects(save({ credential: auth }), { code: 'STALE_ACCOUNT' });
  finish(); await first.stop(); await second.stop();
  assert.equal(executions, 1); assert.equal((await accountAction(env, a, 'status')).connected, false);
});

test('Codex device login uses isolated official auth, validates completion and cleans runtime', async () => {
  let runtime, closeCount = 0; const patches = [];
  await executeAccountJob({ job: { kind: 'connect' } }, {
    env: { HOME: '/operator/home', PATH: process.env.PATH, OPENAI_API_KEY: 'must-not-inherit' },
    update: async patch => patches.push(patch),
    openServer: async env => {
      runtime = env; let notify;
      return { set notification(fn) { notify = fn; }, async close() { closeCount++; }, async call(method) {
        if (method === 'account/login/start') {
          await writeFile(join(env.CODEX_HOME, 'auth.json'), JSON.stringify(auth));
          queueMicrotask(() => notify({ method: 'account/login/completed', params: { loginId: 'login-1', success: true } }));
          return { loginId: 'login-1', verificationUrl: 'https://auth.openai.com/codex/device', userCode: 'ABCD-EFGH' };
        }
        return { account: { type: 'chatgpt', email: 'owner@example.test' } };
      } };
    },
  });
  assert.notEqual(runtime.HOME, '/operator/home'); assert.equal(runtime.OPENAI_API_KEY, undefined);
  assert.equal(patches[0].job.device.code, 'ABCD-EFGH'); assert.equal(patches[1].credential.tokens.refresh_token, 'fixture-refresh');
  assert.equal(patches.at(-1).job.state, 'done'); assert.equal(closeCount, 1);
  await assert.rejects(stat(runtime.HOME), { code: 'ENOENT' });
  for (const url of ['http://auth.openai.com/codex/device', 'https://evil.test/codex/device', 'https://auth.openai.com/codex/device?token=bad']) assert.throws(() => safeDevice({ verificationUrl: url, userCode: 'ABCD-EFGH' }));
});

test('recommendation uses connected credential, persists rotation even after generation failure', async () => {
  let runtime; const patches = [];
  await assert.rejects(executeAccountJob({ credential: auth, job: { kind: 'recommend', input: brief } }, {
    update: async patch => patches.push(patch),
    openServer: async env => { runtime = env; assert.deepEqual(JSON.parse(await readFile(join(env.CODEX_HOME, 'auth.json'), 'utf8')), auth); return { call: async () => ({ account: { type: 'chatgpt' } }), close: async () => {} }; },
    generator: ({ env }) => async () => { assert.equal(env.CODEX_HOME, runtime.CODEX_HOME); await writeFile(join(env.CODEX_HOME, 'auth.json'), JSON.stringify({ ...auth, tokens: { ...auth.tokens, refresh_token: 'rotated' } })); throw Error('generation failed'); },
  }), /generation failed/);
  assert.equal(patches.at(-1).credential.tokens.refresh_token, 'rotated');
  await assert.rejects(stat(runtime.HOME), { code: 'ENOENT' });
});

test('persistence failure preserves private recovery cache rather than losing rotated credentials', async () => {
  let runtime;
  try {
    await assert.rejects(executeAccountJob({ credential: auth, job: { kind: 'recommend', input: brief } }, {
      update: async () => { throw Error('storage offline'); },
      openServer: async env => { runtime = env; return { call: async () => ({ account: { type: 'chatgpt' } }), close: async () => {} }; },
    }), /storage offline/);
    assert.equal((await stat(runtime.HOME)).mode & 0o777, 0o700);
    assert.equal((await stat(join(runtime.CODEX_HOME, 'auth.json'))).mode & 0o777, 0o600);
  } finally { if (runtime) await rm(dirname(runtime.CODEX_HOME), { recursive: true, force: true }); }
});
