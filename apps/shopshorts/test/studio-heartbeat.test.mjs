import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest } from '../functions/api/[[path]].js';

function fixture() {
  let heartbeat;
  const env = {
    SHOPSHORTS_TOKEN: 'test-worker-token',
    DB: { prepare(sql) {
      assert.match(sql, /studio_worker/);
      return {
        bind(value) { heartbeat = value; return this; },
        async run() {},
        async first() { return heartbeat ? { value: heartbeat } : null; },
      };
    } },
    CREDENTIALS: { async llmAccount() { return {}; } },
  };
  return async (method, path, body, token = env.SHOPSHORTS_TOKEN) => onRequest({ env,
    request: new Request(`https://example.test/api/studio/${path}`, {
      method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  });
}

test('Pages heartbeat preserves supported media provider through Studio config', async () => {
  const request = fixture();
  for (const mediaProvider of ['higgsfield', 'google']) {
    const result = await request('PUT', 'worker', { image: true, video: true, mediaProvider });
    assert.equal(result.status, 200);
    const config = await request('GET', 'config');
    assert.equal(config.status, 200);
    const { capabilities } = await config.json();
    assert.equal(capabilities.mediaProvider, mediaProvider);
    assert.equal(capabilities.image, true);
    assert.equal(capabilities.video, true);
    assert.ok(Number.isFinite(Date.parse(capabilities.workerAt)));
  }
});

test('unknown or omitted provider cannot persist stale Higgsfield metadata', async () => {
  const request = fixture();
  for (const mediaProvider of ['unknown', { provider: 'higgsfield' }, undefined]) {
    await request('PUT', 'worker', { mediaProvider: 'higgsfield' });
    await request('PUT', 'worker', { mediaProvider });
    const { capabilities } = await (await request('GET', 'config')).json();
    assert.equal(Object.hasOwn(capabilities, 'mediaProvider'), false);
  }
});

test('unauthorized callers cannot change the media provider', async () => {
  const request = fixture();
  await request('PUT', 'worker', { mediaProvider: 'google' });
  assert.equal((await request('PUT', 'worker', { mediaProvider: 'higgsfield' }, 'wrong')).status, 403);
  const { capabilities } = await (await request('GET', 'config')).json();
  assert.equal(capabilities.mediaProvider, 'google');
});
