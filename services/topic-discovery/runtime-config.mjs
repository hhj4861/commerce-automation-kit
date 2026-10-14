// Backend-only secret injection; no subscription token access or global OAuth lease.
import { runnerRequest } from '../../apps/credential-broker/runner-client.mjs';
import { DISCOVERY_PLATFORM_KEYS } from '../../apps/credential-broker/policy.mjs';
import { DiscoveryError } from './client.mjs';

export async function discoveryRuntimeEnv(env, platform, call) {
  if (env.DISCOVERY_ENABLED !== '1') return env;
  if (!Object.hasOwn(DISCOVERY_PLATFORM_KEYS, platform)) throw new DiscoveryError('discovery_not_configured');
  // Managed mode takes precedence over a stale manually injected key and fails closed.
  if (!env.CAK_RUNNER_KEY_FILE) return env;
  const request = call || ((path, body) => runnerRequest(
    env.CAK_SECRETS_URL || 'https://cak-credential-broker.guswhd1085.workers.dev', env.CAK_RUNNER_KEY_FILE, path, body));
  try {
    const { values } = await request('/runner/discovery', { platform });
    const name = DISCOVERY_PLATFORM_KEYS[platform];
    if (!values || Object.keys(values).length !== 1 || typeof values[name] !== 'string' ||
        values[name].length < 32 || /[\r\n]/.test(values[name])) throw Error();
    return { ...env, DISCOVERY_API_KEY: values[name] };
  } catch { throw new DiscoveryError('discovery_credentials_unavailable'); }
}
