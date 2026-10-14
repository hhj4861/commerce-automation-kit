import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeGithub, authorizeMigration, REPOSITORY, SUBJECT_PREFIX, DEPLOYMENT_KEYS, STATIC_KEYS, PAGE_KEYS, GITHUB_KEYS } from '../policy.mjs';

const claims = (name = 'shopshorts') => {
  const ref = `refs/heads/deploy/${name}`;
  return { ...(['shopshorts', 'hanmadi'].includes(name) ? { ref_protected: 'true' } : {}), repository: REPOSITORY, repository_id: '1310729493', repository_owner_id: '71001056',
    runner_environment: 'github-hosted', event_name: 'push', ref,
    sub: `${SUBJECT_PREFIX}:ref:${ref}`, workflow_ref: `${REPOSITORY}/.github/workflows/platform-deploy.yml@${ref}` };
};
const config = { GITHUB_DEPLOY_ALLOWED_REFS: ['shopshorts', 'hanmadi', 'firstframe'].map(n => claims(n).ref).join(',') };
for (const name of ['shopshorts', 'firstframe', 'hanmadi']) {
  test(`${name} receives only its deployment key`, () => {
    assert.deepEqual(authorizeGithub(claims(name), config).keys, [name === 'hanmadi' ? 'DEPLOY_VERCEL_TOKEN' : 'DEPLOY_CLOUDFLARE_API_TOKEN']);
    assert.doesNotThrow(() => authorizeGithub({ ...claims(name), event_name: 'workflow_dispatch' }, config));
    assert.throws(() => authorizeGithub(claims(name), {}));
    assert.throws(() => authorizeGithub(claims(name), { GITHUB_ALLOWED_REFS: config.GITHUB_DEPLOY_ALLOWED_REFS }));
  });
}
for (const [name, patch] of Object.entries({
  fork: { repository_id: '1' }, owner: { repository_owner_id: '1' }, festa: { repository: 'hhj4861/venture-studio' },
  pr: { event_name: 'pull_request' }, schedule: { event_name: 'schedule' }, tag: { ref: 'refs/tags/v1' },
  subject: { sub: `repo:${REPOSITORY}:ref:refs/heads/deploy/shopshorts` },
  workflow: { workflow_ref: `${REPOSITORY}/.github/workflows/tts-remote.yml@refs/heads/deploy/shopshorts` },
  reusable: { job_workflow_ref: 'evil/reusable.yml@main' }, runner: { runner_environment: 'self-hosted' },
})) test(`deployment rejects ${name}`, () => assert.throws(() => authorizeGithub({ ...claims(), ...patch }, config)));
test('GCP deployment cannot retrieve Cloudflare credentials', () => assert.throws(() => authorizeGithub(claims('litellm'), config)));
test('deployment credentials stay out of runtime, Pages and migration schemas', () => {
  for (const list of [STATIC_KEYS, PAGE_KEYS, GITHUB_KEYS]) assert.ok(DEPLOYMENT_KEYS.every(key => !list.includes(key)));
  assert.throws(() => authorizeMigration({ ...claims(), event_name: 'workflow_dispatch', sha: 'same' }, {
    ...config, MIGRATION_SHA: 'same', MIGRATION_EXPIRES_AT: String(Date.now() + 10000),
  }));
});

const adminRef = 'refs/heads/deploy/hanmadi-admin';
const adminConfig = { GITHUB_DEPLOY_ALLOWED_REFS: adminRef };
const adminClaims = { ...claims('hanmadi-admin'), ref_protected: 'true' };
test('admin gets a dedicated credential and cannot use learner or Replay trust', () => {
  assert.deepEqual(authorizeGithub(adminClaims, adminConfig).keys, ['HANMADI_ADMIN_DEPLOY_VERCEL_TOKEN']);
  for (const ref_protected of [undefined, false, 'false']) assert.throws(() => authorizeGithub({ ...adminClaims, ref_protected }, adminConfig));
  for (const patch of [{ repository_id: 'other' }, { repository_owner_id: 'other' }, { event_name: 'pull_request' }, { runner_environment: 'self-hosted' }, { workflow_ref: claims('hanmadi').workflow_ref }, { sub: claims('hanmadi').sub }]) assert.throws(() => authorizeGithub({ ...adminClaims, ...patch }, adminConfig));
  assert.throws(() => authorizeGithub(claims('hanmadi'), adminConfig));
  assert.throws(() => authorizeGithub(adminClaims, { GITHUB_REPLAY_DEPLOY_ENABLED: 'true' }));
});

test('learner deployment requires a protected ref and receives no admin or Replay credential', () => {
  const learner = claims('hanmadi');
  assert.deepEqual(authorizeGithub(learner, config).keys, ['DEPLOY_VERCEL_TOKEN']);
  for (const ref_protected of [undefined, false, 'false'])
    assert.throws(() => authorizeGithub({ ...learner, ref_protected }, config));
  for (const patch of [{ workflow_ref: adminClaims.workflow_ref }, { sub: adminClaims.sub }, { repository_id: 'other' }, { runner_environment: 'self-hosted' }])
    assert.throws(() => authorizeGithub({ ...learner, ...patch }, config));
});

test('checked-in broker configuration isolates protected Shopshorts and Hanmadi deployment keys', () => {
  const deployed = JSON.parse(readFileSync(new URL('../wrangler.json', import.meta.url), 'utf8'));
  for (const [name, key] of [['shopshorts', 'DEPLOY_CLOUDFLARE_API_TOKEN'], ['hanmadi', 'DEPLOY_VERCEL_TOKEN'], ['hanmadi-admin', 'HANMADI_ADMIN_DEPLOY_VERCEL_TOKEN']]) {
    const identity = { ...claims(name), ref_protected: 'true' };
    assert.deepEqual(authorizeGithub(identity, deployed.vars).keys, [key]);
    assert.deepEqual(deployed.secrets_store_secrets.filter(b => b.binding === `SS_${key}`), [
      { binding: `SS_${key}`, store_id: deployed.vars.STORE_ID, secret_name: `CAK_${key}` },
    ]);
    for (const ref_protected of [undefined, false, 'false'])
      assert.throws(() => authorizeGithub({ ...identity, ref_protected }, deployed.vars));
    assert.throws(() => authorizeGithub({ ...identity, ref: 'refs/heads/main' }, deployed.vars));
  }
  assert.throws(() => authorizeGithub(claims('firstframe'), deployed.vars));
});
