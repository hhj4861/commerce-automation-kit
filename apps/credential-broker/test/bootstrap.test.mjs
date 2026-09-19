import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, stat, access, rm } from 'node:fs/promises';
import { prepareRuntime } from '../runner-bootstrap.mjs';
function fake() {
  const records = { codex: { revision: 1, value: { tokens: { refresh_token: 'test-old' } } }, youtube: { revision: 4, value: { refresh_token: 'test-yt' } } };
  const calls = [];
  let conflict = false;
  return { records, calls, fail: () => { conflict = true; }, call: async (path, body) => {
    calls.push({ path, body });
    if (path === '/runner/lease') return { ok: true };
    if (path === '/runner/secrets') return { values: { ELEVENLABS_API_KEY: 'cloud-key' } };
    if (body.operation === 'read') return { record: structuredClone(records[body.name] || null) };
    if (conflict) throw new Error('test conflict');
    assert.equal(body.revision, records[body.name].revision);
    const revision = body.revision + 1;
    records[body.name] = { value: body.value, revision };
    return { revision };
  } };
}
test('hydrates isolated runtime, overrides stale env, persists CLI refresh, cleans cache', async () => {
  const remote = fake();
  const runtime = await prepareRuntime(remote.call, { ELEVENLABS_API_KEY: 'old', HOME: '/home/example' });
  assert.equal(runtime.env.ELEVENLABS_API_KEY, 'cloud-key');
  assert.ok(runtime.env.CODEX_HOME.startsWith(runtime.dir));
  const auth = `${runtime.env.CODEX_HOME}/auth.json`;
  assert.equal((await stat(auth)).mode & 0o777, 0o600);
  const value = JSON.parse(await readFile(auth));
  value.tokens.refresh_token = 'test-refreshed';
  await writeFile(auth, JSON.stringify(value));
  await Promise.all([runtime.flush(), runtime.flush()]);
  assert.equal(remote.records.codex.value.tokens.refresh_token, 'test-refreshed');
  assert.equal(remote.records.codex.revision, 2);
  await runtime.close();
  await assert.rejects(access(runtime.dir));
  assert.equal(remote.calls.at(-1).body.operation, 'release');
});
test('failed refresh persistence preserves restricted cache and reports failure', async () => {
  const remote = fake(); const runtime = await prepareRuntime(remote.call, {});
  try {
    await writeFile(`${runtime.env.CODEX_HOME}/auth.json`, JSON.stringify({ newToken: 'test-new' }));
    remote.fail();
    await assert.rejects(runtime.close());
    await access(runtime.dir);
    assert.equal(remote.calls.some(c => c.body.operation === 'release'), false);
  } finally { await rm(runtime.dir, { recursive: true, force: true }); }
});
