import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { accountAction, accountRunner } from '../../credential-broker/llm-accounts.mjs';
import { readVault, writeVault } from '../../credential-broker/vault.mjs';
import { createProject } from '../lib/studio.js';
import { studioApi } from '../lib/studio-api.js';
import { llmOwner } from '../lib/llm-account-api.js';
import { scenarioBrief } from '../lib/studio-scenario.js';
import { syncScenario } from '../lib/studio-scenario-account.js';
import { startAccountWorker } from '../studio-account-worker.mjs';
import { executeAccountJob } from '../studio-account-codex.mjs';
import { executeClaudeAccountJob } from '../studio-account-claude.mjs';

const brief = { category: '심리학', topic: '아이의 질문에 날카롭게 답한 순간 내 상태를 알아차리기', format: 'short', duration: 24 };
const result = { title: '잠깐, 내 마음부터', scenes: [
  { id: 'scene-1', narration: '같은 질문인데 오늘은 날카롭게 답했네요.', prompt: '책상 앞 부모가 아이를 돌아본다.', duration: 8, kind: 'image' },
  { id: 'scene-2', narration: '지금 내 마음이 지쳐 있나요?', prompt: '부모가 잠시 숨을 고른다.', duration: 8, kind: 'image' },
  { id: 'scene-3', narration: '아까 날카롭게 말해서 미안해. 다시 이야기해 줄래?', prompt: '부모가 아이와 눈을 맞춘다.', duration: 8, kind: 'video' },
] };
const auth = { auth_mode: 'chatgpt', tokens: { refresh_token: 'fixture-refresh', access_token: 'fixture-access' } };
const waitFor = async check => { for (let i = 0; i < 100; i++) { if (await check()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('Condition not reached'); };

async function fixture(t, provider = 'codex') {
  const db = new Database(':memory:'); t.after(() => db.close());
  db.exec('CREATE TABLE credential_vault (name TEXT PRIMARY KEY, revision INTEGER, payload TEXT, updated_at TEXT)');
  const env = { SHOPSHORTS_TOKEN: 'worker-test', VAULT_KEY: { get: async () => Buffer.alloc(32, 31).toString('base64') }, DB: { prepare(sql) {
    return { bind(...args) { return { first: async () => db.prepare(sql).get(...args), all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => ({ meta: { changes: db.prepare(sql).run(...args).changes } }) }; } };
  } } };
  const headers = { authorization: 'Bearer worker-test', 'content-type': 'application/json' };
  const owner = await llmOwner(new Request('https://studio.test', { headers }), env);
  const name = `llm/account/${owner}`;
  await writeVault(env, name, { provider, credential: auth }, 0);
  await accountRunner(env, { operation: 'poll', scenario: true });
  const items = new Map();
  const store = { execution: 'test', capabilities: async () => ({}), list: async () => structuredClone([...items.values()]), get: async id => structuredClone(items.get(id)), create: async p => items.set(p.id, structuredClone(p)), cas: async (p, revision) => {
    if (items.get(p.id)?.revision !== revision) return false;
    items.set(p.id, structuredClone(p)); return true;
  } };
  const project = createProject(brief); await store.create(project);
  const call = (owner, operation, input) => accountAction(env, owner, operation, input);
  const request = (path = '', body, extraHeaders = {}) => studioApi(new Request(`https://studio.test/api/studio/${project.id}${path}`, {
    method: body ? 'POST' : 'GET', headers: { ...headers, ...extraHeaders }, ...(body ? { body: JSON.stringify(body) } : {}),
  }), env, store, { scenarioAccounts: call });
  const start = () => request('/scenario', { revision: 0, confirm: true, owner: 'f'.repeat(64), provider: 'claude' });
  const complete = async () => {
    const r = await readVault(env, name);
    await accountRunner(env, { operation: 'write', owner, revision: r.revision, value: { ...r.value, job: { ...r.value.job, state: 'done', result } } });
  };
  return { env, db, owner, name, store, project, call, request, start, complete };
}

test('scenario validates narration, target duration and selected subscription model without requiring search', async () => {
  let options;
  assert.deepEqual(await scenarioBrief(brief, { SHOPSHORTS_CLAUDE_MODEL: 'test-model' }, { provider: 'claude', generate: async (prompt, opts) => { options = opts; assert.match(prompt, /24초/); return { value: result, searched: false }; } }), result);
  assert.equal(options.model, 'test-model');
  for (const value of [{}, { ...result, scenes: [{ ...result.scenes[0], duration: 1 }] }, { ...result, scenes: result.scenes.map(s => ({ ...s, narration: '' })) }]) {
    await assert.rejects(scenarioBrief(brief, {}, { generate: async () => ({ value }) }));
  }
});

test('scenario uses authenticated owner and stored provider; a media worker cannot claim it', async t => {
  const f = await fixture(t);
  const response = await f.start(); assert.equal(response.status, 202);
  const { project } = await response.json();
  const record = await readVault(f.env, f.name);
  assert.equal(record.value.job.kind, 'scenario'); assert.equal(record.value.job.provider, 'codex');
  assert.equal(record.value.job.projectId, project.id); assert.equal(project.task.accountOwner, f.owner);
  assert.equal((await f.request('/claim', { revision: 1 })).status, 409);
  assert.equal((await accountRunner(f.env, { operation: 'poll' })).records.length, 0);
  assert.equal((await f.start()).status, 409);
  assert.equal((await f.call('f'.repeat(64), 'scenario-status', { id: project.task.id, projectId: project.id })).job, null);
  assert.equal((await f.call(f.owner, 'scenario-status', { id: project.task.id, projectId: crypto.randomUUID() })).job, null);
});

test('disconnected, offline, unauthenticated and busy accounts do not enqueue project work', async t => {
  for (const mode of ['disconnected', 'offline', 'outdated', 'unauthenticated', 'busy']) await t.test(mode, async t => {
    const f = await fixture(t);
    if (mode === 'disconnected') await f.call(f.owner, 'disconnect', {});
    if (mode === 'offline') { const r = await readVault(f.env, 'llm/runtime'); await writeVault(f.env, 'llm/runtime', { at: 0 }, r.revision); }
    if (mode === 'outdated') await accountRunner(f.env, { operation: 'poll' });
    if (mode === 'busy') await f.call(f.owner, 'recommend', { brief });
    const response = mode === 'unauthenticated' ? await f.request('/scenario', { revision: 0, confirm: true }, { authorization: 'Bearer wrong' }) : await f.start();
    assert.equal(response.status, { disconnected: 428, offline: 503, outdated: 503, unauthenticated: 401, busy: 409 }[mode]);
    assert.equal((await f.store.get(f.project.id)).task, null);
  });
});

test('closed-window result survives a later recommendation and disconnect, then saves on reopen', async t => {
  const f = await fixture(t); const { project } = await (await f.start()).json(); await f.complete();
  await f.call(f.owner, 'recommend', { brief });
  await f.call(f.owner, 'disconnect', {});
  assert.equal((await f.call(f.owner, 'status', {})).connected, false);
  assert.doesNotMatch(JSON.stringify(await f.call(f.owner, 'status', {})), /fixture-refresh|잠깐/);
  assert.doesNotMatch(f.db.prepare('SELECT payload FROM credential_vault WHERE name = ?').get(f.name).payload, /fixture-refresh|잠깐/);
  const saved = (await (await f.request()).json()).project;
  assert.equal(saved.task.state, 'done'); assert.deepEqual(saved.scenes, result.scenes); assert.equal(saved.approved, false);
  assert.equal((await f.call(f.owner, 'scenario-status', { id: project.task.id, projectId: project.id })).job, null);
});

test('scenario completion preserves recommendation results and unread inbox entries', async t => {
  const f = await fixture(t);
  const recommendation = await f.call(f.owner, 'recommend', { brief: { ...brief, focus: 'topic' } });
  const record = await readVault(f.env, f.name);
  await accountRunner(f.env, { operation: 'write', owner: f.owner, revision: record.revision,
    value: { ...record.value, job: { ...record.value.job, state: 'done', result: { suggestions: ['saved recommendation'] } } } });
  assert.equal((await f.start()).status, 202); await f.complete(); await f.request();
  const inbox = await f.call(f.owner, 'notifications', {});
  assert.equal(inbox.unreadCount, 1); assert.equal(inbox.items[0].sourceId, recommendation.job.id);
  assert.deepEqual((await f.call(f.owner, 'recommendation', { id: recommendation.job.id })).recommendation.result.suggestions, ['saved recommendation']);
});

test('disconnect cancels generation and fences a late worker write', async t => {
  const f = await fixture(t); await f.start();
  const stale = await readVault(f.env, f.name);
  await f.call(f.owner, 'disconnect', {});
  await assert.rejects(accountRunner(f.env, { operation: 'write', owner: f.owner, revision: stale.revision, value: { ...stale.value, job: { ...stale.value.job, state: 'done', result } } }), { status: 409 });
  const saved = (await (await f.request()).json()).project;
  assert.equal(saved.task.state, 'failed'); assert.match(saved.task.error, /취소/); assert.equal(saved.scenes.length, 0);
});

test('a delayed cancellation archive cannot overwrite a newer completed scenario', async t => {
  const f = await fixture(t); const { project } = await (await f.start()).json();
  let release, entered; const waiting = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const prepare = f.env.DB.prepare; let intercept = true;
  f.env.DB.prepare = sql => { const statement = prepare(sql); return { bind(...args) {
    const query = statement.bind(...args);
    if (intercept && sql.startsWith('INSERT') && String(args[0]).startsWith('llm/scenario/')) {
      intercept = false; const run = query.run;
      query.run = async () => { entered(); await gate; return run(); };
    }
    return query;
  } }; };
  const cancellation = f.call(f.owner, 'disconnect', {});
  await waiting; await f.complete(); await f.call(f.owner, 'recommend', { brief });
  release(); await assert.rejects(cancellation, { status: 409 });
  const status = await f.call(f.owner, 'scenario-status', { id: project.task.id, projectId: project.id });
  assert.equal(status.job.state, 'done'); assert.deepEqual(status.job.result, result);
});

test('long encrypted results round-trip without argument-stack overflow', async t => {
  const f = await fixture(t); const value = { text: '가'.repeat(60000) };
  await writeVault(f.env, 'llm/scenario/large-fixture', value, 0);
  assert.deepEqual((await readVault(f.env, 'llm/scenario/large-fixture')).value, value);
});

test('missing jobs and unavailable broker stop waiting at the persisted deadline', async t => {
  const f = await fixture(t); const { project } = await (await f.start()).json();
  const failed = await syncScenario(f.store, project, async () => { throw Error('offline'); }, project.task.deadline + 1);
  assert.equal(failed.task.state, 'failed'); assert.match(failed.task.error, /초과/);
});

test('a failed project CAS never acknowledges or overwrites the generated result', async t => {
  const f = await fixture(t); const { project } = await (await f.start()).json(); await f.complete();
  const newer = { ...project, revision: project.revision + 1, title: 'concurrent' };
  await f.store.cas(newer, project.revision);
  const kept = await syncScenario(f.store, project, f.call);
  assert.equal(kept.title, 'concurrent');
  assert.deepEqual((await f.call(f.owner, 'scenario-status', { id: project.task.id, projectId: project.id })).job.result, result);
});

test('account worker claims scenario, saves result without browser polling, then project consumes it', async t => {
  const f = await fixture(t); await f.start(); let executions = 0;
  const worker = startAccountWorker({ intervalMs: 100000, call: (_path, input) => accountRunner(f.env, input), log() {}, execute: async (value, { update }) => {
    executions++; assert.equal(value.job.kind, 'scenario'); assert.equal(value.job.provider, 'codex');
    await update({ job: { state: 'done', result } });
  } });
  try { await waitFor(async () => (await readVault(f.env, f.name)).value.job.state === 'done'); }
  finally { await worker.stop(); }
  assert.equal(executions, 1);
  assert.equal((await f.store.get(f.project.id)).scenes.length, 0);
  assert.deepEqual((await (await f.request()).json()).project.scenes, result.scenes);
});

test('Codex scenario uses isolated owner credentials and saves refreshed tokens', async () => {
  let runtime; const patches = [];
  await executeAccountJob({ credential: auth, job: { kind: 'scenario', input: brief } }, {
    update: async patch => patches.push(patch),
    openServer: async env => { runtime = env; assert.deepEqual(JSON.parse(await readFile(join(env.CODEX_HOME, 'auth.json'), 'utf8')), auth); return { call: async () => ({ account: { type: 'chatgpt' } }), close: async () => {} }; },
    generator: () => async () => { await writeFile(join(runtime.CODEX_HOME, 'auth.json'), JSON.stringify({ ...auth, tokens: { ...auth.tokens, refresh_token: 'rotated' } })); return { value: result }; },
  });
  assert.deepEqual(patches.at(-1).job.result, result); assert.equal(patches.at(-1).credential.tokens.refresh_token, 'rotated');
  await assert.rejects(stat(runtime.HOME), { code: 'ENOENT' });
});

test('Claude scenario uses connected setup-token without borrowing operator credentials', async () => {
  let patch;
  const credential = { kind: 'claude-setup-token-v1', accessToken: 'sk-ant-oat01-' + 'x'.repeat(90) };
  await executeClaudeAccountJob({ credential, job: { kind: 'scenario', input: brief } }, {
    env: { HOME: '/operator', PATH: '/bin', CLAUDE_CODE_OAUTH_TOKEN: 'operator-secret' },
    generator: (env, options) => { assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, undefined); assert.equal(options.oauthToken, credential.accessToken); return async () => ({ value: result }); },
    update: async value => { patch = value; },
  });
  assert.equal(patch.job.state, 'done'); assert.deepEqual(patch.job.result, result);
});
