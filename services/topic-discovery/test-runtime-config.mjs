import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryRuntimeEnv } from './runtime-config.mjs';
const env = { DISCOVERY_ENABLED: '1', CAK_RUNNER_KEY_FILE: '/private/fixture', DISCOVERY_API_KEY: 'stale' };
test('disabled and explicitly injected backend modes do not fetch operator credentials', async () => {
  const call = () => { throw Error('must not call'); };
  const disabled = { ...env, DISCOVERY_ENABLED: '0' };
  assert.equal(await discoveryRuntimeEnv(disabled, 'shopshorts', call), disabled);
  const manual = { DISCOVERY_ENABLED: '1', DISCOVERY_API_KEY: 'a'.repeat(32) };
  assert.equal(await discoveryRuntimeEnv(manual, 'cli', call), manual);
});
test('managed key is refreshed per request without mutating global env', async () => {
  let count = 0;
  const call = async (path, body) => {
    assert.equal(path, '/runner/discovery'); assert.deepEqual(body, { platform: 'shopshorts' });
    return { values: { DISCOVERY_SHOPSHORTS_KEY: (++count).toString().repeat(32) } };
  };
  assert.equal((await discoveryRuntimeEnv(env, 'shopshorts', call)).DISCOVERY_API_KEY, '1'.repeat(32));
  assert.equal((await discoveryRuntimeEnv(env, 'shopshorts', call)).DISCOVERY_API_KEY, '2'.repeat(32));
  assert.equal(env.DISCOVERY_API_KEY, 'stale');
});
test('missing, wrong, extra or unavailable credentials never reuse stale key', async () => {
  for (const values of [{}, { DISCOVERY_CLI_KEY: 'a'.repeat(32) }, { DISCOVERY_SHOPSHORTS_KEY: 'short' }, { DISCOVERY_SHOPSHORTS_KEY: 'a'.repeat(32), DISCOVERY_CLI_KEY: 'b'.repeat(32) }]) {
    await assert.rejects(discoveryRuntimeEnv(env, 'shopshorts', async () => ({ values })), { code: 'discovery_credentials_unavailable' });
  }
  await assert.rejects(discoveryRuntimeEnv(env, 'shopshorts', async () => { throw Error('private upstream detail'); }), { message: 'discovery_credentials_unavailable' });
  await assert.rejects(discoveryRuntimeEnv(env, '__proto__'), { code: 'discovery_not_configured' });
});

test('worker reports central credential failure without requesting native reauthentication', async () => {
  const { executeProviderJob } = await import('../../apps/shopshorts/studio-account-worker.mjs');
  const { accountFailureCode, accountFailureMessage } = await import('../../apps/shopshorts/lib/llm-account-errors.js');
  for (const provider of ['codex', 'claude']) {
    await assert.rejects(executeProviderJob({ job: { kind: 'recommend', provider } }, { env }), error => {
      assert.equal(accountFailureCode(error), 'DISCOVERY_UNAVAILABLE');
      assert.match(accountFailureMessage(provider, error), /공통 주제 검증/);
      assert.doesNotMatch(accountFailureMessage(provider, error), /계정을 다시 연결/);
      return true;
    });
  }
});
