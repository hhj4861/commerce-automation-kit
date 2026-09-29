import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeGithub, authorizeMigration, REPLAY_DEPLOYMENT_KEY, STATIC_KEYS, PAGE_KEYS, GITHUB_KEYS } from '../policy.mjs';
import { handleRequest } from '../index.mjs';

const ref = 'refs/heads/deploy/replay';
const identity = {
  repository: 'hhj4861/replay-live', repository_id: '1365111099', repository_owner_id: '71001056',
  ref, ref_protected: 'true', environment: 'production', runner_environment: 'github-hosted', event_name: 'push',
  sub: 'repo:hhj4861@71001056/replay-live@1365111099:environment:production',
  workflow_ref: `hhj4861/replay-live/.github/workflows/deploy-production.yml@${ref}`,
};
const config = { GITHUB_REPLAY_DEPLOY_ENABLED: 'true' };

test('Replay production deployment receives only its dedicated credential', () => {
  for (const event_name of ['push', 'workflow_dispatch']) {
    assert.deepEqual(authorizeGithub({ ...identity, event_name }, config), {
      file: 'deploy-production.yml', keys: [REPLAY_DEPLOYMENT_KEY],
    });
  }
  assert.doesNotThrow(() => authorizeGithub({ ...identity, ref_protected: true }, config));
});

for (const [name, patch] of Object.entries({
  fork: { repository: 'attacker/replay-live' }, repository_id: { repository_id: '1' },
  owner: { repository_owner_id: '1' }, main: { ref: 'refs/heads/main' },
  develop: { ref: 'refs/heads/develop' }, tag: { ref: 'refs/tags/deploy/replay' },
  unprotected: { ref_protected: 'false' }, missing_protection: { ref_protected: undefined },
  preview: { environment: 'preview' }, missing_environment: { environment: undefined },
  mutable_subject: { sub: 'repo:hhj4861/replay-live:environment:production' },
  ref_subject: { sub: `repo:hhj4861@71001056/replay-live@1365111099:ref:${ref}` },
  wrong_workflow: { workflow_ref: `hhj4861/replay-live/.github/workflows/commercial.yml@${ref}` },
  workflow_branch: { workflow_ref: 'hhj4861/replay-live/.github/workflows/deploy-production.yml@refs/heads/main' },
  reusable: { job_workflow_ref: 'attacker/actions/.github/workflows/deploy.yml@main' },
  pr: { event_name: 'pull_request' }, pr_target: { event_name: 'pull_request_target' },
  schedule: { event_name: 'schedule' }, runner: { runner_environment: 'self-hosted' },
})) test(`Replay rejects ${name}`, () => assert.throws(() => authorizeGithub({ ...identity, ...patch }, config)));

test('Replay must be explicitly enabled, independent of CAK branch switches', () => {
  for (const env of [{}, { GITHUB_REPLAY_DEPLOY_ENABLED: 'false' }, { GITHUB_REPLAY_DEPLOY_ENABLED: '1' },
    { GITHUB_DEPLOY_ALLOWED_REFS: ref, GITHUB_ALLOWED_REFS: ref }]) {
    assert.throws(() => authorizeGithub(identity, env));
  }
});

test('Replay credential stays out of runtime, Pages and import scopes', () => {
  for (const keys of [STATIC_KEYS, PAGE_KEYS, GITHUB_KEYS]) assert.ok(!keys.includes(REPLAY_DEPLOYMENT_KEY));
  assert.throws(() => authorizeMigration({ ...identity, event_name: 'workflow_dispatch', sha: 'fixture' }, {
    ...config, MIGRATION_SHA: 'fixture', MIGRATION_EXPIRES_AT: String(Date.now() + 10000),
  }));
});

const request = (path = '/github/secrets') => new Request(`https://broker.example${path}`, {
  method: 'POST', headers: { authorization: 'Bearer fixture', 'content-type': 'application/json' }, body: '{}',
});
test('Replay HTTP response cannot include other deployments or runtime credentials', async () => {
  const env = { ...config, SS_REPLAY_DEPLOY_VERCEL_TOKEN: { get: async () => 'replay-fixture' },
    SS_DEPLOY_VERCEL_TOKEN: { get: async () => { throw new Error('must not read Hanmadi'); } },
    SS_DEPLOY_CLOUDFLARE_API_TOKEN: { get: async () => { throw new Error('must not read Pages'); } },
  };
  const verify = { github: async () => identity, runner: async () => ({}) };
  const result = await handleRequest(request(), env, verify);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { values: { REPLAY_DEPLOY_VERCEL_TOKEN: 'replay-fixture' } });
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('access-control-allow-origin'), null);
  const runtime = await handleRequest(request('/runner/secrets'), env, verify);
  assert.deepEqual(await runtime.json(), { values: {} });
  delete env.SS_REPLAY_DEPLOY_VERCEL_TOKEN;
  const missing = await handleRequest(request(), env, verify);
  assert.equal(missing.status, 503);
  assert.doesNotMatch(await missing.text(), /fixture|TOKEN/);
});
