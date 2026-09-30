import { execFileSync } from 'node:child_process';
import { configuration } from './plan.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function deployment(name, env = process.env) {
  const target = configuration.targets[name];
  if (!target || env.GITHUB_REPOSITORY !== configuration.repository || env.GITHUB_REF !== `refs/heads/${target.branch}` ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') || !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)) {
    throw new Error('Repository, branch, revision or event does not match the deployment target');
  }
  return target;
}

export function commands(name, target, env) {
  const cwd = target.directory;
  const wrangler = ['--yes', 'wrangler@4.143.0'];
  if (target.driver === 'pages') return [
    { command: 'npm', args: ['ci'] },
    ...(name === 'firstframe' ? [{ command: 'npx', args: ['--no-install', 'tsx', 'packages/showcase-site/src/cli/index.ts', 'build', '--site', 'apps/firstframe'] }] :
      [{ command: 'npm', args: ['test', '-w', '@cak/app-shopshorts'] }]),
    { command: 'npx', cwd, args: [...wrangler, 'pages', 'deploy', target.output, '--project-name', target.project,
      '--branch', target.branch, '--commit-hash', env.GITHUB_SHA, '--commit-dirty=false'] },
  ];
  if (target.driver === 'vercel') {
    if (!env[target.credential || 'DEPLOY_VERCEL_TOKEN']) throw new Error('Cloudflare Vercel deployment credential is missing');
    const vercel = ['--yes', 'vercel@60.1.3'];
    return [
      { command: 'npm', cwd, args: ['ci', '--workspaces=false'] },
      { command: 'npm', cwd, args: ['test'] },
      { command: 'npx', cwd, args: [...vercel, 'pull', '--yes', '--environment=production'] },
      { command: 'npx', cwd, args: [...vercel, 'build', '--prod'] },
      { command: 'npx', cwd, args: [...vercel, 'deploy', '--prebuilt', '--prod', '--yes',
        '--meta', `githubCommitSha=${env.GITHUB_SHA}`, '--meta', `githubCommitRef=${target.branch}`,
        '--meta', `hanmadiApplication=${name}`, '--env', `HANMADI_RELEASE_SHA=${env.GITHUB_SHA}`,
        ...(target.deploymentMode === 'admin' ? ['--env', 'HANMADI_DEPLOYMENT=admin', '--env', `HANMADI_APP_URL=${target.learningAppUrl}`] : [])] },
    ];
  }
  const archive = `/tmp/cak-litellm-${env.GITHUB_SHA}.tar`;
  const remote = `/tmp/cak-litellm-${env.GITHUB_SHA}`;
  const gcloud = [`--project=${target.project}`, `--zone=${target.zone}`, '--tunnel-through-iap', '--quiet'];
  return [
    { command: 'git', args: ['archive', '--format=tar', `--output=${archive}`, env.GITHUB_SHA, 'services/ai-gateway', 'ops/deploy/litellm-release.py'] },
    { command: 'gcloud', args: ['compute', 'scp', ...gcloud, archive, `${target.instance}:${archive}`] },
    { command: 'gcloud', args: ['compute', 'ssh', target.instance, ...gcloud, '--command',
      `umask 077 && mkdir '${remote}' && tar -xf '${archive}' -C '${remote}' && sudo python3 '${remote}/ops/deploy/litellm-release.py' --source '${remote}/services/ai-gateway' --sha '${env.GITHUB_SHA}'`] },
  ];
}

export async function verifyAdminRelease(target, sha, request = fetch) {
  const origin = new URL(target.productionUrl).origin;
  const options = { redirect: 'error', signal: AbortSignal.timeout(15000), cache: 'no-store' };
  const identity = await request(`${origin}/api/deployment`, options);
  if (!identity.ok) throw new Error('Admin release identity is unavailable');
  const body = await identity.json();
  if (body.application !== 'hanmadi-admin' || body.revision !== sha) throw new Error('Admin release identity does not match');
  const login = await request(`${origin}/admin-login`, options);
  if (!login.ok || !(await login.text()).includes('Hanmadi Admin')) throw new Error('Admin login is unavailable');
  const protectedApi = await request(`${origin}/api/study/admin`, options);
  if (protectedApi.status !== 403) throw new Error('Admin API must reject anonymous requests');
  const learner = await request(`${origin}/api/study`, options);
  if (learner.status !== 404) throw new Error('Learner API must not be exposed by admin deployment');
}

export async function verifyAdminConfiguration(target, token, request = fetch) {
  const response = await request(`https://api.vercel.com/v9/projects/${target.project}/env?teamId=${target.organization}`, {
    headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Cannot verify admin runtime configuration');
  const body = await response.json();
  const names = new Set((body.envs || []).filter(item => item.target?.includes('production')).map(item => item.key));
  const missing = ['HANMADI_DEPLOYMENT', 'HANMADI_APP_URL', 'AUTH_SECRET', 'TUTOR_PINS', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'YOUTUBE_API_KEY', 'LITELLM_BASE_URL', 'LITELLM_API_KEY', 'LITELLM_MODEL'].filter(key => !names.has(key));
  if (missing.length) throw new Error(`Configure admin production variables before deployment: ${missing.join(', ')}`);
}

async function main() {
  const name = process.argv[2], env = { ...process.env }, target = deployment(name, env);
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (head !== env.GITHUB_SHA) throw new Error('Checkout differs from the triggering commit');
  if (env.GITHUB_REF_PROTECTED !== 'true') throw new Error('Protect the deployment branch before enabling releases');
  const remote = execFileSync('git', ['ls-remote', '--exit-code', 'origin', env.GITHUB_REF], { encoding: 'utf8' }).trim().split(/\s+/);
  if (remote[0] !== env.GITHUB_SHA || remote[1] !== env.GITHUB_REF) throw new Error('A newer revision superseded this deployment');
  execFileSync('git', ['diff', '--quiet']);
  execFileSync('git', ['diff', '--cached', '--quiet']);
  if (target.driver === 'pages') {
    if (!env.DEPLOY_CLOUDFLARE_API_TOKEN) throw new Error('Cloudflare deployment credential is missing');
    env.CLOUDFLARE_API_TOKEN = env.DEPLOY_CLOUDFLARE_API_TOKEN;
    env.CLOUDFLARE_ACCOUNT_ID = target.account;
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${target.account}/pages/projects/${target.project}`, {
      headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(20000),
    });
    const body = await r.json();
    if (!r.ok || !body.success || body.result?.production_branch !== target.branch) {
      throw new Error(`Set ${target.project} production branch to ${target.branch} before enabling deployments`);
    }
  }
  if (target.driver === 'vercel') {
    env.VERCEL_ORG_ID = target.organization; env.VERCEL_PROJECT_ID = target.project;
    env.VERCEL_TOKEN = env[target.credential || 'DEPLOY_VERCEL_TOKEN'];
    env.HANMADI_RELEASE_SHA = env.GITHUB_SHA;
    if (target.deploymentMode === 'admin') {
      env.HANMADI_DEPLOYMENT = 'admin'; env.HANMADI_APP_URL = target.learningAppUrl;
      await verifyAdminConfiguration(target, env.VERCEL_TOKEN);
    }
  }
  for (const step of commands(name, target, env)) {
    console.log(`Deploy ${name}: ${step.command}`); // Never log credential-bearing arguments.
    execFileSync(step.command, step.args, { cwd: resolve(step.cwd || '.'), env, stdio: 'inherit' });
  }
  if (target.deploymentMode === 'admin') {
    for (let attempt = 0; ; attempt++) {
      try { await verifyAdminRelease(target, env.GITHUB_SHA); break; }
      catch (error) {
        if (attempt >= 11) throw error;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    console.log(`Verified hanmadi-admin: ${target.productionUrl}, revision ${env.GITHUB_SHA}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    if (error.message?.startsWith('Configure admin production variables before deployment:')) console.error(error.message);
    else console.error('Deployment failed; inspect the preceding stage. Credentials are not included in this error.');
    process.exitCode = 1;
  });
}
