import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createLiteLLMClient, normalizeConfig, createModelSession, LiteLLMError } from '../index.mjs';
const config = { baseUrl: 'https://gateway.test/llm/v1', apiKey: 'test-key', model: 'test-model' };
const input = { messages: [{ role: 'user', content: 'Hello' }] };
const reply = (content = 'Hello', finish_reason = 'stop') => Response.json({ choices: [{ message: { content }, finish_reason }] });

test('normalizes proxy path; HTTP localhost is opt-in', () => {
  for (const baseUrl of ['https://gateway.test/llm', 'https://gateway.test/llm/v1/']) assert.equal(normalizeConfig({ ...config, baseUrl }).baseUrl, config.baseUrl);
  for (const baseUrl of ['http://remote.test', 'https://key@gateway.test', 'https://gateway.test?key=x', 'https://gateway.test#x', 'http://localhost:4100', 'file:///tmp/a']) assert.throws(() => normalizeConfig({ ...config, baseUrl }), { code: 'invalid_config' });
  assert.equal(normalizeConfig({ ...config, baseUrl: 'http://localhost:4100', allowLocalhost: true }).baseUrl, 'http://localhost:4100/v1');
});
test('structured output uses fixed model/schema; rejects malformed, truncated and refused output', async () => {
  const client = createLiteLLMClient({ ...config, fetch: async (url, init) => {
    assert.equal(url, config.baseUrl + '/chat/completions'); assert.equal(init.redirect, 'manual');
    const body = JSON.parse(init.body); assert.equal(body.model, config.model); assert.equal(body.stream, false);
    assert.deepEqual(body.response_format, { type: 'json_schema', json_schema: { name: 'trip', strict: true, schema: { type: 'object' } } });
    return reply('{"city":"Bangkok"}');
  } });
  assert.deepEqual(await client.generateJSON({ ...input, name: 'trip', schema: { type: 'object' } }), { city: 'Bangkok' });
  for (const response of [reply('partial', 'length'), reply(''), reply('[]'), reply('null'), reply('broken'), Response.json({ choices: [{ message: { content: '{}', refusal: 'secret' } }] }), new Response('not-json')]) await assert.rejects(createLiteLLMClient({ ...config, fetch: async () => response }).generateJSON({ ...input, name: 'trip', schema: {} }), error => error instanceof LiteLLMError && !error.message.includes('secret'));
});
test('real HTTP redirect cannot forward credentials; no retry on upstream failures', async () => {
  let calls = 0;
  const server = createServer((req, res) => {
    calls++; assert.equal(req.url, '/v1/chat/completions'); assert.equal(req.headers.authorization, 'Bearer test-key');
    res.writeHead(307, { location: '/leak' }); res.end('private-provider-diagnostic');
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    await assert.rejects(createLiteLLMClient({ ...config, baseUrl: `http://127.0.0.1:${server.address().port}`, allowLocalhost: true }).completeText(input), { code: 'redirect_rejected' }); assert.equal(calls, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
  for (const status of [301, 302, 308, 401, 403, 429, 500]) {
    let count = 0;
    await assert.rejects(createLiteLLMClient({ ...config, fetch: async () => { count++; return new Response('test-key secret', { status }); } }).completeText(input), error => error.status === status && !error.message.includes('secret'));
    assert.equal(count, 1);
  }
});
test('timeout and cancellation abort without leaking diagnostics', async () => {
  const fetch = async (_url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Error('private-network-diagnostic')), { once: true }));
  await assert.rejects(createLiteLLMClient({ ...config, fetch, timeoutMs: 10 }).completeText(input), { code: 'timeout', status: 504 });
  const controller = new AbortController();
  const pending = createLiteLLMClient({ ...config, fetch }).completeText({ ...input, signal: controller.signal }); controller.abort();
  await assert.rejects(pending, { code: 'cancelled' });
});
test('parallel clients isolate keys and catalogue reveals only model aliases', async () => {
  const fetch = async (url, init) => url.endsWith('/models') ? Response.json({ data: [{ id: 'allowed', secret: 'hidden' }] }) : reply(init.headers.Authorization);
  const clients = ['one', 'two'].map(apiKey => createLiteLLMClient({ ...config, apiKey, fetch }));
  assert.deepEqual(await Promise.all(clients.map(client => client.completeText(input))), ['Bearer one', 'Bearer two']);
  assert.deepEqual(await clients[0].listModels(), ['allowed']);
});
function fixture() {
  const scope = { platformId: 'festa', subject: 'user-1' };
  let record = { id: 'personal', scope, provider: 'codex', method: 'subscription_oauth', state: 'authorizing', token: 'private-token' };
  const seen = [];
  const adapter = {
    async list() { return record ? [record] : []; }, async get() { return record; },
    async start(received) { assert.deepEqual(received, scope); return record; },
    async refresh() { record = { ...record, state: 'connected' }; return record; },
    async disconnect() { record = null; },
    async resolve() { return { ...record, route: { ...config, apiKey: 'personal-key', model: 'codex-personal' } }; },
  };
  const session = createModelSession({ scope, defaultRoute: config, adapter, fetch: async (_url, init) => { seen.push(JSON.parse(init.body).model); return reply(); } });
  return { session, adapter, scope, seen, set: value => { record = value; }, record: () => record };
}
test('common lifecycle hides secrets and rechecks disconnection on existing client', async () => {
  const { session, seen } = fixture();
  assert.equal((await session.connect('codex', 'subscription_oauth')).state, 'authorizing');
  assert.equal(JSON.stringify(await session.list()).includes('private-token'), false);
  const selected = session.client('personal');
  await assert.rejects(selected.completeText(input), { code: 'connection_authorizing' });
  await session.refresh('personal'); assert.equal(await selected.completeText(input), 'Hello');
  await session.disconnect('personal'); await assert.rejects(selected.completeText(input), { code: 'connection_unavailable' });
  assert.deepEqual(seen, ['codex-personal']);
  await session.client().completeText(input); assert.deepEqual(seen, ['codex-personal', 'test-model']);
});
test('other user or same user ID on another platform cannot list/use/change connections', async () => {
  for (const scope of [{ platformId: 'hanmadi', subject: 'user-1' }, { platformId: 'festa', subject: 'user-2' }]) {
    const f = fixture(); f.set({ ...f.record(), scope, state: 'connected' });
    for (const fn of [() => f.session.list(), () => f.session.refresh('personal'), () => f.session.disconnect('personal'), () => f.session.client('personal').completeText(input)]) await assert.rejects(fn, { code: 'connection_unavailable' });
    assert.deepEqual(f.seen, []);
  }
});
test('unusable states never fall back; resolve rechecks ownership', async () => {
  for (const state of ['expired', 'quota_exceeded', 'error', 'disconnected']) {
    const f = fixture(); f.set({ ...f.record(), state });
    await assert.rejects(f.session.client('personal').completeText(input), { code: `connection_${state}` }); assert.deepEqual(f.seen, []);
  }
  const f = fixture(); await f.session.refresh('personal');
  f.adapter.resolve = async () => ({ ...f.record(), scope: { ...f.scope, subject: 'another' }, route: config });
  await assert.rejects(f.session.client('personal').completeText(input), { code: 'connection_unavailable' });
});
test('unsupported subscription relay fails before adapter; no adapter means no fake connection', async () => {
  const f = fixture(); await assert.rejects(f.session.connect('claude', 'subscription_oauth'), { code: 'unsupported_connection_method' });
  const session = createModelSession({ scope: f.scope, defaultRoute: config });
  assert.equal((await session.list()).length, 1);
  await assert.rejects(session.connect('codex', 'subscription_oauth'), { code: 'connection_not_configured' });
});
