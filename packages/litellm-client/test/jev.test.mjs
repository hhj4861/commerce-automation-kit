import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createJevClient, JevError } from '@cak/litellm-client/jev';

const input = () => ({ state: { text: '이미 다룬 주제인지 판단' }, questions: {
  duplicate: { type: 'choice', instructions: '주제를 비교하세요.', criteria: { duplicate: null, fresh: '새 주제' } },
  quality: { type: 'score', instructions: '충실도를 평가하세요.', criteria: ['부족', '보통', '충분'] },
  relevant: { type: 'noul', instructions: '주제와 관련이 있나요?', criteria: { true: '관련 있음', false: '관련 없음' } },
} });
const output = () => ({ model: 'jev-1.13.0', answers: {
  duplicate: { type: 'choice', choice: 'fresh', probabilities: { duplicate: 0.1, fresh: 0.9 }, confidence: 0.8 },
  quality: { type: 'score', score: 1.05, legend: { 0: '부족', 1: '보통', 2: '충분' }, probabilities: { 0: 0, 1: 0.95, 2: 0.05 }, confidence: 0.87 },
  relevant: { type: 'noul', noul: 0.72 },
}, usage: { input_tokens: 218, output_tokens: 0 } });
const options = { baseUrl: 'https://gateway.example/llm/v1', apiKey: 'virtual-key' };
const client = overrides => createJevClient({ ...options, fetch: async () => Response.json(output()), ...overrides });
const errorIs = (code, status) => error => {
  assert.ok(error instanceof JevError);
  assert.equal(error.code, code);
  assert.equal(error.message, code);
  if (status !== undefined) assert.equal(error.status, status);
  assert.ok(!JSON.stringify(error).includes('SECRET'));
  return true;
};

test('mixed judgments preserve types, probabilities and usage with an exact proxy request', async () => {
  let calls = 0;
  const api = client({ fetch: async (url, init) => {
    calls++;
    assert.equal(url, 'https://gateway.example/llm/typesafe/v1/systemone');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.cache, 'no-store');
    assert.equal(init.headers.Authorization, 'Bearer virtual-key');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), { model: 'jev-1.13.0', ...input() });
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json({ ...output(), debug: 'SECRET' });
  } });
  assert.deepEqual(await api.evaluate(input()), output());
  assert.equal(calls, 1);
});

test('normalizes proxy roots and optional v1 suffix, retaining deployment prefixes', async () => {
  for (const [baseUrl, expected] of [
    ['https://gateway.example', 'https://gateway.example/typesafe/v1/systemone'],
    ['https://gateway.example/v1/', 'https://gateway.example/typesafe/v1/systemone'],
    ['https://gateway.example/llm/', 'https://gateway.example/llm/typesafe/v1/systemone'],
    ['https://gateway.example/llm/v1/', 'https://gateway.example/llm/typesafe/v1/systemone'],
  ]) await client({ baseUrl, fetch: async url => { assert.equal(url, expected); return Response.json(output()); } }).evaluate(input());
});

test('explicit model is sent and resolved provider model is returned', async () => {
  const got = await client({ model: 'jev-latest', fetch: async (_, init) => {
    assert.equal(JSON.parse(init.body).model, 'jev-latest');
    return Response.json(output());
  } }).evaluate(input());
  assert.equal(got.model, 'jev-1.13.0');
});

test('configuration rejects unsafe URLs, keys, limits and unavailable fetch', () => {
  for (const change of [
    { baseUrl: 'http://gateway.example', allowLocalhost: true }, { baseUrl: 'http://localhost' },
    { baseUrl: 'https://user:SECRET@gateway.example' }, { baseUrl: 'https://gateway.example?key=SECRET' },
    { baseUrl: 'https://gateway.example#SECRET' }, { baseUrl: 'file:///tmp/foo' },
    { apiKey: '' }, { apiKey: 'SECRET\r\nX: y' }, { model: 'gpt-other' },
    { timeoutMs: 0 }, { timeoutMs: Infinity }, { timeoutMs: 300001 },
    { maxRequestBytes: 0 }, { maxResponseBytes: 10485761 }, { fetch: false },
  ]) assert.throws(() => client(change), errorIs('invalid_config', 503));
});

test('browser construction is rejected', () => {
  const beforeWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const beforeDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  try {
    Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: {}, configurable: true });
    assert.throws(() => client(), errorIs('server_only', 503));
  } finally {
    if (beforeWindow) Object.defineProperty(globalThis, 'window', beforeWindow); else delete globalThis.window;
    if (beforeDocument) Object.defineProperty(globalThis, 'document', beforeDocument); else delete globalThis.document;
  }
});

test('malformed questions and non-JSON data fail before making a request', async () => {
  let calls = 0;
  const api = client({ fetch: async () => { calls++; return Response.json(output()); } });
  const cycle = {}; cycle.self = cycle;
  for (const change of [
    x => { x.state = null; }, x => { x.state = cycle; }, x => { x.state = new Date(); },
    x => { x.state = { bad: undefined }; }, x => { x.state = { bad: NaN }; },
    x => { x.state = { bad: 1n }; }, x => { x.state = { bad: () => 'x' }; },
    x => { x.state = { [Symbol('x')]: 'lost' }; }, x => { x.state = Array(2); },
    x => { x.questions = {}; }, x => { x.questions.duplicate.type = 'text'; },
    x => { x.questions.duplicate.instructions = 3; }, x => { x.questions.duplicate.criteria = {}; },
    x => { x.questions.duplicate.criteria = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [i, null])); },
    x => { x.questions.quality.criteria = ['one']; }, x => { x.questions.quality.criteria = Array(11).fill('x'); },
    x => { x.questions.relevant.criteria = { yes: 'x' }; }, x => { x.questions.duplicate.extra = true; },
    x => { x.signal = {}; },
  ]) { const value = input(); change(value); await assert.rejects(api.evaluate(value), errorIs('invalid_input', 400)); }
  assert.equal(calls, 0);
});

test('request size is measured in UTF-8 bytes before network I/O', async () => {
  const value = input();
  const body = JSON.stringify({ model: 'jev-1.13.0', ...value });
  let calls = 0;
  const fetch = async () => { calls++; return Response.json(output()); };
  await assert.rejects(client({ fetch, maxRequestBytes: body.length }).evaluate(value), errorIs('request_too_large', 413));
  assert.equal(calls, 0);
  await client({ fetch, maxRequestBytes: new TextEncoder().encode(body).length }).evaluate(value);
});

test('caller mutation after dispatch cannot alter response validation', async () => {
  const value = input();
  await client({ fetch: async () => {
    delete value.questions.duplicate.criteria.fresh;
    value.questions.quality.type = 'noul';
    return Response.json(output());
  } }).evaluate(value);
});

test('prototype-like IDs remain ordinary own properties', async () => {
  const criteria = JSON.parse('{"__proto__":null,"constructor":null}');
  const questions = Object.fromEntries([['__proto__', { type: 'choice', instructions: 'select', criteria }]]);
  const answer = { type: 'choice', choice: '__proto__', confidence: 1, probabilities: JSON.parse('{"__proto__":1,"constructor":0}') };
  const result = await client({ fetch: async () => Response.json({ model: 'jev-1.13.0', usage: output().usage, answers: Object.fromEntries([['__proto__', answer]]) }) }).evaluate({ state: '', questions });
  assert.ok(Object.hasOwn(result.answers, '__proto__'));
  assert.deepEqual(result.answers.__proto__, answer);
  assert.equal(Object.getPrototypeOf(result.answers), Object.prototype);
});

test('incomplete, inconsistent or out-of-range provider responses are rejected', async () => {
  for (const change of [
    x => { delete x.answers.duplicate; }, x => { x.answers.extra = x.answers.relevant; },
    x => { x.answers.duplicate.type = 'noul'; }, x => { x.answers.duplicate.choice = 'unknown'; },
    x => { x.answers.duplicate.choice = 'duplicate'; }, x => { x.answers.duplicate.confidence = 1.1; },
    x => { delete x.answers.duplicate.probabilities.duplicate; },
    x => { x.answers.duplicate.probabilities.duplicate = -0.1; },
    x => { x.answers.duplicate.probabilities.fresh = 0.4; },
    x => { x.answers.quality.score = 3; }, x => { x.answers.quality.score = null; },
    x => { x.answers.quality.legend[0] = {}; }, x => { delete x.answers.quality.legend[1]; },
    x => { x.answers.relevant.noul = true; }, x => { x.answers.relevant.noul = -1; },
    x => { delete x.usage; }, x => { x.usage.input_tokens = -1; },
    x => { x.usage.output_tokens = 0.5; }, x => { x.usage.input_tokens = 2 ** 53; },
    x => { x.model = ''; },
  ]) {
    const value = output(); change(value);
    await assert.rejects(client({ fetch: async () => Response.json(value) }).evaluate(input()), errorIs('invalid_response', 502));
  }
});

test('body decoding validates JSON, UTF-8 and streamed byte limits', async () => {
  for (const response of [new Response('not json SECRET'), new Response(new Uint8Array([255])), new Response(null)]) {
    await assert.rejects(client({ fetch: async () => response }).evaluate(input()), errorIs('invalid_response', 502));
  }
  let cancelled = false;
  const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(11)); }, cancel() { cancelled = true; } });
  await assert.rejects(client({ maxResponseBytes: 10, fetch: async () => new Response(body) }).evaluate(input()), errorIs('response_too_large', 502));
  assert.equal(cancelled, true);
});

test('HTTP errors stay sanitized and are never retried', async () => {
  for (const [status, code] of [[401, 'authentication_failed'], [403, 'authentication_failed'], [422, 'upstream_error'], [429, 'rate_limited'], [529, 'overloaded'], [500, 'upstream_error'], [302, 'redirect_rejected']]) {
    let calls = 0;
    await assert.rejects(client({ fetch: async () => { calls++; return new Response('SECRET provider message', { status }); } }).evaluate(input()), errorIs(code, status));
    assert.equal(calls, 1);
  }
  await assert.rejects(client({ fetch: async () => { throw Error('SECRET network failure'); } }).evaluate(input()), errorIs('network_error', 504));
});

test('pre-aborted caller prevents network calls', async () => {
  const controller = new AbortController(); controller.abort('SECRET');
  await assert.rejects(client({ fetch: async () => { assert.fail('must not call'); } }).evaluate({ ...input(), signal: controller.signal }), errorIs('cancelled', 499));
});

test('caller cancellation aborts in-flight transport', async () => {
  const controller = new AbortController();
  let sentSignal;
  const pending = client({ fetch: (_, init) => { sentSignal = init.signal; return new Promise(() => {}); } }).evaluate({ ...input(), signal: controller.signal });
  controller.abort('SECRET');
  await assert.rejects(pending, errorIs('cancelled', 499));
  assert.equal(sentSignal.aborted, true);
});

test('deadline covers a stuck transport, and late response bodies are cancelled', async () => {
  let finish;
  const pending = client({ timeoutMs: 15, fetch: () => new Promise(resolve => { finish = resolve; }) }).evaluate(input());
  await assert.rejects(pending, errorIs('timeout', 504));
  let cancelled = false;
  finish(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled, true);
});

test('deadline and caller cancellation cover reading the response body', async () => {
  for (const cancelByCaller of [false, true]) {
    let cancelled = false;
    const controller = new AbortController();
    const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')); }, cancel() { cancelled = true; } });
    const pending = client({ timeoutMs: cancelByCaller ? 1000 : 15, fetch: async () => new Response(body) }).evaluate({ ...input(), signal: controller.signal });
    if (cancelByCaller) setTimeout(() => controller.abort(), 15);
    await assert.rejects(pending, errorIs(cancelByCaller ? 'cancelled' : 'timeout', cancelByCaller ? 499 : 504));
    assert.equal(cancelled, true);
  }
});

test('native fetch reaches a local proxy and never follows its credential-leaking redirect', async () => {
  const requests = [];
  let redirect = false;
  const server = createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, auth: req.headers.authorization, body });
    if (redirect) { res.writeHead(302, { Location: '/must-not-receive-key' }); res.end(); }
    else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(output())); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  try {
    const api = createJevClient({ baseUrl: `http://127.0.0.1:${server.address().port}/llm/v1`, apiKey: 'local-test-key', allowLocalhost: true });
    assert.deepEqual(await api.evaluate(input()), output());
    redirect = true;
    await assert.rejects(api.evaluate(input()), errorIs('redirect_rejected', 302));
    assert.equal(requests.length, 2);
    for (const req of requests) {
      assert.equal(req.url, '/llm/typesafe/v1/systemone');
      assert.equal(req.auth, 'Bearer local-test-key');
      assert.deepEqual(JSON.parse(req.body), { model: 'jev-1.13.0', ...input() });
    }
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
