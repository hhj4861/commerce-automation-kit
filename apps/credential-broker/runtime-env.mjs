import { STATIC_KEYS } from './policy.mjs';
export const CREDENTIAL_ENV_KEYS = [...STATIC_KEYS, 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_TOKEN_PATH', 'CODEX_HOME'];
export function withoutCredentials(env) {
  return Object.fromEntries(Object.entries(env).filter(([key]) => !CREDENTIAL_ENV_KEYS.includes(key)));
}
export function mergeRuntimeEnv(local, injected) {
  return { ...(injected.CAK_CLOUD_SECRETS_ACTIVE === '1' ? withoutCredentials(local) : local), ...injected };
}
