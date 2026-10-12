export const ISSUER = 'https://token.actions.githubusercontent.com';
export const AUDIENCE = 'cak-cloudflare-secrets';
export const REPOSITORY = 'hhj4861/commerce-automation-kit';
// Verified through GitHub's repository OIDC customization API (immutable subjects enabled).
export const SUBJECT_PREFIX = 'repo:hhj4861@71001056/commerce-automation-kit@1310729493';
export const KEYWORD_KEYS = [
  'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_AD_CUSTOMER_ID',
  'NAVER_AD_API_KEY', 'NAVER_AD_SECRET_KEY', 'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_CHAT_ID', 'SHOPSHORTS_CLOUD_URL', 'SHOPSHORTS_TOKEN',
];
export const GITHUB_KEYS = [...KEYWORD_KEYS, 'ELEVENLABS_API_KEY'];
export const REPLAY_DEPLOYMENT_KEY = 'REPLAY_DEPLOY_VERCEL_TOKEN';
export const HANMADI_ADMIN_DEPLOYMENT_KEY = 'HANMADI_ADMIN_DEPLOY_VERCEL_TOKEN';
export const DEPLOYMENT_KEYS = ['DEPLOY_CLOUDFLARE_API_TOKEN', 'DEPLOY_VERCEL_TOKEN', REPLAY_DEPLOYMENT_KEY, HANMADI_ADMIN_DEPLOYMENT_KEY];
export const DEPLOYMENT_REFS = {
  'refs/heads/deploy/shopshorts': ['DEPLOY_CLOUDFLARE_API_TOKEN'],
  'refs/heads/deploy/firstframe': ['DEPLOY_CLOUDFLARE_API_TOKEN'],
  'refs/heads/deploy/hanmadi': ['DEPLOY_VERCEL_TOKEN'],
  'refs/heads/deploy/hanmadi-admin': [HANMADI_ADMIN_DEPLOYMENT_KEY],
};
// Separate from static/page/deployment keys: never sent in a generic secrets bundle.
export const DISCOVERY_PLATFORM_KEYS = Object.freeze({
  shopshorts: 'DISCOVERY_SHOPSHORTS_KEY',
  'wp-auto-blog': 'DISCOVERY_BLOG_KEY',
  'venture-studio': 'DISCOVERY_VENTURE_KEY',
  cli: 'DISCOVERY_CLI_KEY',
});
export const DISCOVERY_KEYS = [...Object.values(DISCOVERY_PLATFORM_KEYS), 'DISCOVERY_JEV_API_KEY'];

export const STATIC_KEYS = [...GITHUB_KEYS,
  'UPLOAD_POST_API_KEY', 'UPLOAD_POST_USER', 'PEXELS_API_KEY', 'GEMINI_API_KEY',
  'YOUTUBE_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'SHOPSHORTS_SESSION_SECRET', 'COUPANG_ACCESS_KEY', 'COUPANG_SECRET_KEY',
  'WP_AUTO_BLOG_GITHUB_TOKEN', 'SHOPSHORTS_CF_QUEUE_TOKEN',
];
export const PAGE_KEYS = ['SHOPSHORTS_TOKEN', 'SHOPSHORTS_SESSION_SECRET',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'COUPANG_ACCESS_KEY',
  'COUPANG_SECRET_KEY', 'WP_AUTO_BLOG_GITHUB_TOKEN'];
export const WORKFLOW_KEYS = {
  'keyword-intel-sync.yml': KEYWORD_KEYS,
  'tts-remote.yml': ['ELEVENLABS_API_KEY'],
  'music-remote.yml': ['ELEVENLABS_API_KEY'],
};

export function authorizeGithub(claims, env) {
  if (claims.repository === 'hhj4861/wp-auto-blog') {
    const ref = 'refs/heads/main';
    const files = ['blog-keyword-select.yml', 'shared-discovery-check.yml'];
    const file = files.find(name => claims.workflow_ref === `hhj4861/wp-auto-blog/.github/workflows/${name}@${ref}`);
    if (env.GITHUB_BLOG_DISCOVERY_ENABLED !== 'true' || !file ||
        claims.repository_id !== '1126598753' || claims.repository_owner_id !== '71001056' ||
        claims.ref !== ref || claims.sub !== `repo:hhj4861/wp-auto-blog:ref:${ref}` ||
        claims.runner_environment !== 'github-hosted' ||
        !['schedule', 'workflow_dispatch'].includes(claims.event_name) ||
        (file === 'shared-discovery-check.yml' && claims.event_name !== 'workflow_dispatch') ||
        (claims.job_workflow_ref && claims.job_workflow_ref !== claims.workflow_ref)) throw new Error('unauthorized');
    return { file, keys: [DISCOVERY_PLATFORM_KEYS['wp-auto-blog']] };
  }

  // Separate repository and production environment: never inherit CAK's ref allowlist.
  if (claims.repository === 'hhj4861/replay-live') {
    const ref = 'refs/heads/deploy/replay';
    const file = 'deploy-production.yml';
    if (env.GITHUB_REPLAY_DEPLOY_ENABLED !== 'true' ||
        claims.repository_id !== '1365111099' || claims.repository_owner_id !== '71001056' ||
        claims.ref !== ref || !['true', true].includes(claims.ref_protected) ||
        claims.environment !== 'production' || claims.runner_environment !== 'github-hosted' ||
        !['push', 'workflow_dispatch'].includes(claims.event_name) ||
        claims.sub !== 'repo:hhj4861@71001056/replay-live@1365111099:environment:production' ||
        claims.workflow_ref !== `hhj4861/replay-live/.github/workflows/${file}@${ref}` ||
        (claims.job_workflow_ref && claims.job_workflow_ref !== claims.workflow_ref)) throw new Error('unauthorized');
    return { file, keys: [REPLAY_DEPLOYMENT_KEY] };
  }
  if (Object.hasOwn(DEPLOYMENT_REFS, claims.ref || '')) {
    const file = 'platform-deploy.yml';
    if (['refs/heads/deploy/shopshorts', 'refs/heads/deploy/hanmadi', 'refs/heads/deploy/hanmadi-admin'].includes(claims.ref) && !['true', true].includes(claims.ref_protected)) throw new Error('unauthorized');
    if (claims.repository !== REPOSITORY || claims.repository_id !== '1310729493' ||
        claims.repository_owner_id !== '71001056' || claims.runner_environment !== 'github-hosted' ||
        !(env.GITHUB_DEPLOY_ALLOWED_REFS || '').split(',').includes(claims.ref) ||
        !['push', 'workflow_dispatch'].includes(claims.event_name) ||
        claims.sub !== `${SUBJECT_PREFIX}:ref:${claims.ref}` ||
        claims.workflow_ref !== `${REPOSITORY}/.github/workflows/${file}@${claims.ref}` ||
        (claims.job_workflow_ref && claims.job_workflow_ref !== claims.workflow_ref)) throw new Error('unauthorized');
    return { file, keys: DEPLOYMENT_REFS[claims.ref] };
  }
  const refs = (env.GITHUB_ALLOWED_REFS || 'refs/heads/main').split(',');
  if (claims.repository !== REPOSITORY || claims.repository_id !== '1310729493' ||
      claims.repository_owner_id !== '71001056' || !refs.includes(claims.ref) ||
      !['schedule', 'workflow_dispatch'].includes(claims.event_name) ||
      claims.sub !== `${SUBJECT_PREFIX}:ref:${claims.ref}` ||
      claims.runner_environment !== 'github-hosted') throw new Error('unauthorized');
  // Ref and path are signed by GitHub; no pull_request, fork, environment or tag subjects.
  const file = Object.keys(WORKFLOW_KEYS).find(name =>
    claims.workflow_ref === `${REPOSITORY}/.github/workflows/${name}@${claims.ref}`);
  if (!file || (claims.job_workflow_ref && claims.job_workflow_ref !== claims.workflow_ref)) throw new Error('unauthorized');
  return { file, keys: WORKFLOW_KEYS[file] };
}

export function authorizeMigration(claims, env) {
  const { file } = authorizeGithub(claims, env);
  if (file !== 'keyword-intel-sync.yml' || claims.event_name !== 'workflow_dispatch' ||
      !env.MIGRATION_SHA || claims.sha !== env.MIGRATION_SHA ||
      !env.MIGRATION_EXPIRES_AT || Date.now() >= Number(env.MIGRATION_EXPIRES_AT)) throw new Error('unauthorized');
}
