import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRequest } from '../index.mjs';
import { authorizeGithub, DISCOVERY_KEYS, DISCOVERY_PLATFORM_KEYS, STATIC_KEYS, PAGE_KEYS } from '../policy.mjs';
const key = 'fixture-' + 'x'.repeat(40);
const env = { GITHUB_BLOG_DISCOVERY_ENABLED: 'true', ...Object.fromEntries(DISCOVERY_KEYS.map(k => [`SS_${k}`, { get: async () => key + k }])) };
const claims = {
  repository: 'hhj4861/wp-auto-blog', repository_id: '1126598753', repository_owner_id: '71001056',
  ref: 'refs/heads/main', sub: 'repo:hhj4861/wp-auto-blog:ref:refs/heads/main',
  workflow_ref: 'hhj4861/wp-auto-blog/.github/workflows/blog-keyword-select.yml@refs/heads/main',
  event_name: 'schedule', runner_environment: 'github-hosted',
};
const req = (path, input) => new Request('https://broker.example' + path, { method: 'POST', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' }, body: JSON.stringify(input) });
const verify = { github: async () => claims, runner: async () => ({}) };

test('blog receives only its discovery key; policy defaults off', async () => {
  assert.throws(() => authorizeGithub(claims, {}));
  assert.deepEqual(authorizeGithub(claims, env).keys, ['DISCOVERY_BLOG_KEY']);
  const response = await handleRequest(req('/github/secrets', {}), env, verify);
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys((await response.json()).values), ['DISCOVERY_BLOG_KEY']);
});
for (const [name, patch] of Object.entries({ fork: { repository_id: 'other' }, owner: { repository_owner_id: 'other' }, branch: { ref: 'refs/heads/feature' }, pr: { event_name: 'pull_request' }, subject: { sub: 'repo:hhj4861/wp-auto-blog:environment:prod' }, workflow: { workflow_ref: 'hhj4861/wp-auto-blog/.github/workflows/auto-post.yml@refs/heads/main' }, reusable: { job_workflow_ref: 'other/reusable@main' }, runner: { runner_environment: 'self-hosted' } })) {
  test(`blog rejects ${name}`, () => assert.throws(() => authorizeGithub({ ...claims, ...patch }, env)));
}
test('bounded live check is dispatch-only and same-repository/main', () => {
  const check = { ...claims, workflow_ref: 'hhj4861/wp-auto-blog/.github/workflows/shared-discovery-check.yml@refs/heads/main', event_name: 'workflow_dispatch' };
  assert.deepEqual(authorizeGithub(check, env).keys, ['DISCOVERY_BLOG_KEY']);
  assert.throws(() => authorizeGithub({ ...check, event_name: 'schedule' }, env));
});
test('signed operator runner retrieves one selected platform key, not Jev or other keys', async () => {
  for (const [platform, name] of Object.entries(DISCOVERY_PLATFORM_KEYS)) {
    const response = await handleRequest(req('/runner/discovery', { platform }), env, verify);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).values, { [name]: key + name });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  for (const input of [{ platform: 'server' }, { platform: '__proto__' }, { platform: 'cli', keys: DISCOVERY_KEYS }, {}]) {
    assert.equal((await handleRequest(req('/runner/discovery', input), env, verify)).status, 400);
  }
  assert.equal((await handleRequest(req('/runner/discovery', { platform: 'cli' }), env, { runner: async () => { throw Error(); } })).status, 403);
});
test('generic runner and Pages never inherit discovery keys; absent binding fails closed', async () => {
  assert.ok(DISCOVERY_KEYS.every(k => !STATIC_KEYS.includes(k) && !PAGE_KEYS.includes(k)));
  const result = await handleRequest(req('/runner/secrets', {}), env, verify);
  assert.deepEqual((await result.json()).values, {});
  const missing = await handleRequest(req('/runner/discovery', { platform: 'cli' }), {}, verify);
  assert.equal(missing.status, 503);
  assert.doesNotMatch(await missing.text(), /fixture/);
});
