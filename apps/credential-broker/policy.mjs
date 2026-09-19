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
export const STATIC_KEYS = [...GITHUB_KEYS,
  'UPLOAD_POST_API_KEY', 'UPLOAD_POST_USER', 'PEXELS_API_KEY', 'GEMINI_API_KEY',
  'YOUTUBE_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
  'SHOPSHORTS_SESSION_SECRET', 'COUPANG_ACCESS_KEY', 'COUPANG_SECRET_KEY',
  'WP_AUTO_BLOG_GITHUB_TOKEN',
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
