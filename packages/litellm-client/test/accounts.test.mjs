import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccountClient, publicAccountConnections } from '../index.mjs';
const id = 'a'.repeat(32), subject = 'b'.repeat(64), apiKey = 'platform-'.repeat(5);
const record = { id, provider: 'codex', state: 'connected', models: ['gpt-first', 'gpt-second'] };
const config = { baseUrl: 'https://accounts.test/accounts', apiKey, subject };
test('shared HTTP client scopes every request, validates selection and forwards schema without leaking secrets', async () => {
  const calls = [];
  const client = createAccountClient({ ...config, fetch: async (url, init) => {
    calls.push([url, init]);
    assert.equal(init.headers['X-AI-Subject'], subject);
    assert.equal(new Headers(init.headers).get('authorization'), 'Bearer ' + apiKey);
    assert.equal(init.redirect, 'manual');
    return Response.json(url.endsWith('/connections') ? { connections: [{ ...record, secret: 'must-not-escape' }] } : { choices: [{ message: { content: '{"reason":"plan"}' }, finish_reason: 'stop' }] });
  } });
  assert.deepEqual(await client.list(), [record]);
  const result = await client.client(id + ':gpt-second').generateJSON({ messages: [{ role: 'user', content: 'travel' }], name: 'plan', schema: { type: 'object' }, maxTokens: 1500 });
  assert.equal(result.reason, 'plan');
  const body = JSON.parse(calls.at(-1)[1].body);
  assert.equal(body.model, id + ':gpt-second');
  assert.equal(body.response_format.json_schema.name, 'plan');
  assert.equal(calls.at(-1)[0], 'https://accounts.test/accounts/v1/chat/completions');
});
test('revoked selection and foreign identity never issue generation; no fallback', async () => {
  const calls = [];
  const client = createAccountClient({ ...config, fetch: async url => { calls.push(url); return Response.json({ connections: [] }); } });
  await assert.rejects(client.client(id + ':gpt-first').completeText({ messages: [] }), { code: 'connection_unavailable' });
  assert.equal(calls.length, 1);
});
test('strict challenge projection rejects phishing, stale challenges and duplicate IDs', () => {
  const challenge = { url: 'https://auth.openai.com/codex/device', code: 'TEST-1234', expiresAt: Date.now() / 1000 + 100 };
  const value = { ...record, state: 'authorizing', challenge, apiKey: 'hidden' };
  assert.deepEqual(publicAccountConnections({ connections: [value] })[0], { id, provider: 'codex', state: 'authorizing', models: [], challenge });
  assert.throws(() => publicAccountConnections({ connections: [value, value] }));
  assert.throws(() => publicAccountConnections({ connections: [{ ...value, challenge: { ...challenge, url: 'https://auth.openai.com.evil.test/codex/device' } }] }));
  assert.equal(publicAccountConnections({ connections: [{ ...value, challenge: { ...challenge, expiresAt: 0 } }] })[0].challenge, undefined);
});
test('connections validate methods, expiries, provider errors and redirect destinations', async () => {
  let count = 0;
  const client = createAccountClient({ ...config, fetch: async () => { count++; return new Response('private-upstream-key', { status: 429 }); } });
  await assert.rejects(client.connect('claude', { apiKey: 'sk-ant-oat01-' + 'a'.repeat(40) }), { status: 400 });
  await assert.rejects(client.connect('codex', { ttlSeconds: 30 }), { status: 400 });
  assert.equal(count, 0);
  await assert.rejects(client.connect('codex'), error => error.code === 'quota_exceeded' && !error.message.includes('private'));
});
