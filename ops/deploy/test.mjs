import test from 'node:test';
import assert from 'node:assert/strict';
import { configuration, plan } from './plan.mjs';
import { commands, deployment, verifyAdminRelease, verifyAdminConfiguration } from './deploy.mjs';

const sha = 'a'.repeat(40);
const env = name => ({ GITHUB_REPOSITORY: configuration.repository,
  GITHUB_REF: `refs/heads/deploy/${name}`, GITHUB_SHA: sha, GITHUB_EVENT_NAME: 'push' });
const input = name => ({ repository: configuration.repository, eventName: 'push',
  event: { ref: `refs/heads/deploy/${name}` } });

for (const [name, target] of Object.entries(configuration.targets)) {
  test(`${name} promotion selects exactly its own platform`, () => {
    assert.deepEqual(plan(input(name)).include, [{ name, driver: target.driver, branch: target.branch }]);
    assert.equal(deployment(name, env(name)), target);
    for (const other of Object.keys(configuration.targets).filter(n => n !== name)) {
      assert.throws(() => deployment(name, env(other)));
    }
  });
  test(`${name} branch creation/deletion never deploys`, () => {
    for (const flag of ['created', 'deleted']) assert.deepEqual(plan({ ...input(name), event: { ...input(name).event, [flag]: true } }).include, []);
  });
  test(`${name} manual dispatch requires matching branch and target`, () => {
    const request = { ...input(name), eventName: 'workflow_dispatch', event: { ...input(name).event, inputs: { target: name } } };
    assert.equal(plan(request).include[0].name, name);
    assert.throws(() => plan({ ...request, event: { ...request.event, inputs: { target: 'unknown' } } }));
  });
}
test('unrelated later merge still schedules a release (no lost pending promotion)', () => {
  assert.equal(plan({ ...input('shopshorts'), changed: ['docs/README.md'] }).include.length, 1);
});
test('main, feature, tag, fork, pull request and force updates are rejected', () => {
  for (const ref of ['refs/heads/main', 'refs/heads/feature/agent-test', 'refs/tags/deploy/shopshorts']) {
    assert.throws(() => plan({ ...input('shopshorts'), event: { ref } }));
  }
  assert.throws(() => plan({ ...input('shopshorts'), repository: 'hhj4861/venture-studio' }));
  assert.throws(() => plan({ ...input('shopshorts'), eventName: 'pull_request' }));
  assert.throws(() => plan({ ...input('shopshorts'), event: { ...input('shopshorts').event, forced: true } }));
});
test('deployment rejects injection through revision, event and target', () => {
  for (const GITHUB_SHA of ['main', 'abc123', `${sha}; echo bad`, '0'.repeat(39)]) {
    assert.throws(() => deployment('litellm', { ...env('litellm'), GITHUB_SHA }));
  }
  assert.throws(() => deployment('festa', env('festa')));
  assert.throws(() => deployment('litellm', { ...env('litellm'), GITHUB_EVENT_NAME: 'pull_request' }));
});
test('Pages deployments target explicit production branch, project and revision', () => {
  for (const name of ['shopshorts', 'firstframe']) {
    const target = configuration.targets[name], steps = commands(name, target, env(name));
    const deploy = steps.at(-1);
    assert.equal(deploy.cwd, target.directory);
    for (const argument of [target.project, target.branch, sha, '--commit-dirty=false']) assert.ok(deploy.args.includes(argument));
  }
  assert.ok(commands('firstframe', configuration.targets.firstframe, env('firstframe'))[1].args.includes('apps/firstframe'));
});
test('Vercel pulls production env and builds before prebuilt production deploy', () => {
  assert.throws(() => commands('hanmadi', configuration.targets.hanmadi, env('hanmadi')));
  const steps = commands('hanmadi', configuration.targets.hanmadi, { ...env('hanmadi'), DEPLOY_VERCEL_TOKEN: 'fixture' });
  assert.ok(steps[0].args.includes('--workspaces=false'));
  assert.deepEqual(steps.slice(2).map(s => s.args[2]), ['pull', 'build', 'deploy']);
  assert.ok(steps[2].args.includes('--environment=production'));
  assert.ok(steps.at(-1).args.includes('--prebuilt'));
  assert.ok(steps.every(s => s.cwd === 'apps/hanmadi'));
});
test('LiteLLM archives exact commit and uses personal VM through IAP', () => {
  const steps = commands('litellm', configuration.targets.litellm, env('litellm'));
  assert.ok(steps[0].args.includes(sha));
  assert.ok(steps[0].args.includes('services/ai-gateway'));
  for (const step of steps.slice(1)) {
    assert.ok(step.args.includes('--project=replay-live-508202'));
    assert.ok(step.args.includes('--tunnel-through-iap'));
  }
  assert.doesNotMatch(JSON.stringify(steps), /socar|accounts\.py|dify|docker.*down/);
});
test('Replay and Festa are separate-repository targets, never local deployments', () => {
  assert.equal(configuration.external.replay.repository, 'hhj4861/replay-live');
  assert.equal(configuration.external.replay.branch, 'deploy/replay');
  assert.deepEqual(configuration.external.replay.projects, ['replay-live-poc', 'replay-live-api']);
  assert.equal(configuration.external.festa.repository, 'hhj4861/venture-studio');
  assert.equal(configuration.external.festa.branch, 'deploy/festa');
  assert.equal(configuration.external.festa.currentBranch, 'feature/agent-test');
  for (const name of ['replay', 'festa']) {
    assert.throws(() => plan(input(name)));
    assert.throws(() => deployment(name, env(name)));
  }
});

test('admin deploy is isolated from the learner project and does not expose tokens in arguments', () => {
  const target = configuration.targets['hanmadi-admin'];
  assert.notEqual(target.project, configuration.targets.hanmadi.project);
  assert.equal(target.deploymentMode, 'admin');
  assert.throws(() => commands('hanmadi-admin', target, { ...env('hanmadi-admin'), DEPLOY_VERCEL_TOKEN: 'learner-key' }));
  const steps = commands('hanmadi-admin', target, { ...env('hanmadi-admin'), HANMADI_ADMIN_DEPLOY_VERCEL_TOKEN: 'admin-fixture-secret' });
  assert.doesNotMatch(JSON.stringify(steps), /admin-fixture-secret|--token/);
  for (const arg of ['HANMADI_DEPLOYMENT=admin', `HANMADI_RELEASE_SHA=${sha}`, `githubCommitSha=${sha}`, 'githubCommitRef=deploy/hanmadi-admin']) assert.ok(steps.at(-1).args.includes(arg));
});
test('admin uses a remote production build with the same identity at build and runtime', () => {
  const target = configuration.targets['hanmadi-admin'];
  const steps = commands('hanmadi-admin', target, { ...env('hanmadi-admin'), HANMADI_ADMIN_DEPLOY_VERCEL_TOKEN: 'fixture' });
  assert.deepEqual(steps.slice(0, 2).map(step => [step.command, ...step.args]), [
    ['npm', 'ci', '--workspaces=false'], ['npm', 'test'],
  ]);
  assert.deepEqual(steps.filter(step => step.command === 'npx').map(step => step.args[2]), ['deploy']);
  assert.ok(steps.every(step => step.cwd === target.directory));
  const args = steps.at(-1).args;
  assert.ok(args.includes('--prod'));
  assert.ok(!args.includes('--prebuilt'));
  assert.ok(!args.includes('--no-wait')); // The release check must follow a completed build.
  assert.equal(args[args.indexOf('--project') + 1], target.project);
  const values = flag => args.flatMap((arg, index) => arg === flag ? [args[index + 1]] : []);
  const identity = [`HANMADI_RELEASE_SHA=${sha}`, 'HANMADI_DEPLOYMENT=admin', `HANMADI_APP_URL=${target.learningAppUrl}`];
  assert.deepEqual(values('--build-env'), identity);
  assert.deepEqual(values('--env'), identity);
  assert.deepEqual(values('--meta'), [`githubCommitSha=${sha}`, `githubCommitRef=${target.branch}`, 'hanmadiApplication=hanmadi-admin']);
});
test('release validation requires the right surface, revision and access boundary', async () => {
  const target = configuration.targets['hanmadi-admin'];
  function fixture(patch = {}) {
    return async url => {
      const path = new URL(url).pathname;
      if (path === '/api/deployment') return Response.json({ application: 'hanmadi-admin', revision: sha, ...patch });
      if (path === '/admin-login') return new Response('Hanmadi Admin');
      return new Response('', { status: path === '/api/study/admin' ? 403 : 404 });
    };
  }
  await verifyAdminRelease(target, sha, fixture());
  await assert.rejects(verifyAdminRelease(target, sha, fixture({ revision: 'old' })));
  await assert.rejects(verifyAdminRelease(target, sha, fixture({ application: 'hanmadi' })));
  await assert.rejects(verifyAdminRelease(target, sha, async url => url.endsWith('/api/study/admin') ? new Response('open') : fixture()(url)));
});
test('missing admin runtime secrets block deployment before a production upload', async () => {
  const keys = ['HANMADI_DEPLOYMENT', 'HANMADI_APP_URL', 'AUTH_SECRET', 'TUTOR_PINS', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'YOUTUBE_API_KEY', 'LITELLM_BASE_URL', 'LITELLM_API_KEY', 'LITELLM_MODEL'];
  const target = configuration.targets['hanmadi-admin'];
  const fixture = keys => async (url, options) => {
    assert.equal(new URL(url).searchParams.get('teamId'), target.organization);
    assert.equal(options.headers.authorization, 'Bearer fixture');
    return Response.json({ envs: keys.map(key => ({ key, target: ['production'] })) });
  };
  await verifyAdminConfiguration(target, 'fixture', fixture(keys));
  await assert.rejects(verifyAdminConfiguration(target, 'fixture', fixture(keys.filter(key => key !== 'LITELLM_API_KEY'))), /LITELLM_API_KEY/);
  await assert.rejects(verifyAdminConfiguration(target, 'fixture', async () => Response.json({ envs: keys.map(key => ({ key, target: ['preview'] })) })), /production variables/);
});
