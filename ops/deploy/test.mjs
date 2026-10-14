import test from 'node:test';
import assert from 'node:assert/strict';
import { configuration, plan } from './plan.mjs';
import { commands, deployment, verifyAdminRelease, verifyAdminConfiguration, verifyLearnerRelease, verifyLearnerConfiguration } from './deploy.mjs';

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
test('learner uses a project-scoped remote build with explicit production identity', () => {
  const target = configuration.targets.hanmadi;
  assert.throws(() => commands('hanmadi', target, env('hanmadi')));
  assert.throws(() => commands('hanmadi', target, { ...env('hanmadi'), HANMADI_ADMIN_DEPLOY_VERCEL_TOKEN: 'admin-only' }));
  const steps = commands('hanmadi', target, { ...env('hanmadi'), DEPLOY_VERCEL_TOKEN: 'learner-fixture-secret' });
  assert.deepEqual(steps.slice(0, 2).map(s => [s.command, ...s.args]), [['npm', 'ci', '--workspaces=false'], ['npm', 'test']]);
  assert.deepEqual(steps.filter(s => s.command === 'npx').map(s => s.args[2]), ['deploy']);
  assert.ok(steps.every(s => s.cwd === target.directory));
  const args = steps.at(-1).args;
  assert.equal(args[args.indexOf('--project') + 1], target.project);
  assert.ok(args.includes('--prod'));
  for (const flag of ['--prebuilt', '--no-wait', '--token']) assert.ok(!args.includes(flag));
  const values = flag => args.flatMap((arg, index) => arg === flag ? [args[index + 1]] : []);
  const identity = [`HANMADI_RELEASE_SHA=${sha}`, 'HANMADI_DEPLOYMENT=learner'];
  assert.deepEqual(values('--env'), identity);
  assert.deepEqual(values('--build-env'), identity);
  assert.deepEqual(values('--meta'), [`githubCommitSha=${sha}`, `githubCommitRef=${target.branch}`, 'hanmadiApplication=hanmadi']);
  assert.doesNotMatch(JSON.stringify(steps), /learner-fixture-secret|HANMADI_DEPLOYMENT=admin|HANMADI_APP_URL/);
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

const learnerTarget = configuration.targets.hanmadi;
function learnerFixture(overrides = {}) {
  return async (url, options) => {
    assert.equal(new URL(url).origin, learnerTarget.productionUrl);
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers, undefined); // Anonymous probes; no session or deployment credentials.
    const path = new URL(url).pathname;
    if (overrides[path]) return overrides[path]();
    switch (path) {
      case '/api/deployment': return Response.json({ application: 'hanmadi', revision: sha });
      case '/study': return new Response('<title>한마디 2.0</title>');
      case '/privacy': return new Response('<h1>개인정보 처리방침</h1>');
      case '/api/study/account/google': return Response.json({ available: true, clientId: learnerTarget.googleClientId });
      case '/api/study/admin': return new Response('', { status: 403 });
      default: throw new Error('Unexpected probe');
    }
  };
}
test('learner release probes identity, public login surfaces and anonymous access without signing in', async () => {
  const paths = [];
  await verifyLearnerRelease(learnerTarget, sha, (url, options) => {
    paths.push(new URL(url).pathname);
    return learnerFixture()(url, options);
  });
  assert.deepEqual(paths, ['/api/deployment', '/study', '/privacy', '/api/study/account/google', '/api/study/admin']);
});
for (const [name, path, response] of [
  ['old revision', '/api/deployment', () => Response.json({ application: 'hanmadi', revision: 'old' })],
  ['wrong application', '/api/deployment', () => Response.json({ application: 'hanmadi-admin', revision: sha })],
  ['identity unavailable', '/api/deployment', () => new Response('', { status: 503 })],
  ['entry unavailable', '/study', () => new Response('', { status: 500 })],
  ['entry redirect', '/study', () => new Response('', { status: 302, headers: { location: '/admin-login' } })],
  ['privacy unavailable', '/privacy', () => new Response('', { status: 404 })],
  ['privacy wrong body', '/privacy', () => new Response('<h1>Login</h1>')],
  ['Google disabled', '/api/study/account/google', () => Response.json({ available: false })],
  ['Google wrong client', '/api/study/account/google', () => Response.json({ available: true, clientId: 'wrong.apps.googleusercontent.com' })],
  ['Google unavailable', '/api/study/account/google', () => new Response('', { status: 503 })],
  ['admin exposed', '/api/study/admin', () => new Response('private data')],
]) test(`learner release rejects ${name}`, async () => {
  await assert.rejects(verifyLearnerRelease(learnerTarget, sha, learnerFixture({ [path]: response })));
});
test('learner production configuration requires login and durable storage before upload', async () => {
  const keys = ['AUTH_SECRET', 'TUTOR_PINS', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'HANMADI_GOOGLE_CLIENT_ID'];
  const fixture = (names, target = 'production') => async (url, options) => {
    assert.equal(new URL(url).pathname, `/v9/projects/${learnerTarget.project}/env`);
    assert.equal(new URL(url).searchParams.get('teamId'), learnerTarget.organization);
    assert.equal(options.headers.authorization, 'Bearer fixture');
    return Response.json({ envs: names.map(key => ({ key, target: [target] })) });
  };
  await verifyLearnerConfiguration(learnerTarget, 'fixture', fixture(keys));
  for (const missing of keys)
    await assert.rejects(verifyLearnerConfiguration(learnerTarget, 'fixture', fixture(keys.filter(k => k !== missing))), new RegExp(missing));
  await assert.rejects(verifyLearnerConfiguration(learnerTarget, 'fixture', fixture(keys, 'preview')), /production variables/);
  await assert.rejects(verifyLearnerConfiguration(learnerTarget, 'fixture', async () => new Response('', { status: 403 })), /Cannot verify/);
});
