import { createLiteLLMClient, LiteLLMError, normalizeConfig } from './index.mjs';

export const accountSelectionPattern = /^[a-f0-9]{32}:[a-zA-Z0-9.-]{1,100}$/;
const states = new Set(['authorizing', 'connected', 'expired', 'quota_exceeded', 'error', 'disconnected']);
const fail = (code, status = 502) => { throw new LiteLLMError(code, status); };

/** Whitelist public fields; credentials and operator metadata never reach a browser. */
export function publicAccountConnections(value) {
  if (!Array.isArray(value?.connections) || value.connections.length > 10) fail('invalid_connections');
  const ids = new Set();
  return value.connections.map(record => {
    if (!record || typeof record.id !== 'string' || !/^[a-f0-9]{32}$/.test(record.id) || ids.has(record.id) ||
        !['codex', 'claude'].includes(record.provider) || !states.has(record.state) ||
        !Array.isArray(record.models) || record.models.length > 30 ||
        record.models.some(m => typeof m !== 'string' || !/^[a-zA-Z0-9.-]{1,100}$/.test(m))) fail('invalid_connections');
    ids.add(record.id);
    const result = { id: record.id, provider: record.provider, state: record.state,
      models: record.state === 'connected' ? [...new Set(record.models)] : [] };
    if (record.challenge) {
      const c = record.challenge;
      if (record.provider !== 'codex' || record.state !== 'authorizing' || c.url !== 'https://auth.openai.com/codex/device' ||
          typeof c.code !== 'string' || !/^[A-Za-z0-9-]{4,32}$/.test(c.code) || !Number.isFinite(c.expiresAt)) fail('invalid_challenge');
      if (c.expiresAt > Date.now() / 1000) result.challenge = { url: c.url, code: c.code, expiresAt: c.expiresAt };
    }
    return result;
  });
}
export function assertAccountSelection(connections, selection) {
  if (typeof selection !== 'string' || !accountSelectionPattern.test(selection)) fail('invalid_selection', 400);
  const [id, model] = selection.split(':');
  const connection = connections.find(c => c.id === id);
  if (!connection || connection.state !== 'connected' || !connection.models.includes(model)) fail('connection_unavailable', 409);
}

/** Server-derived subject + platform-specific key. No shared application login. */
export function createAccountClient(options) {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') fail('server_only', 503);
  if (!/^[a-f0-9]{64}$/.test(options.subject) || typeof options.apiKey !== 'string' || options.apiKey.length < 32) fail('invalid_config', 503);
  const config = normalizeConfig({ ...options, model: 'accounts' });
  const base = config.baseUrl.replace(/\/v1$/, '');
  const fetcher = options.fetch ?? globalThis.fetch;
  const scopedFetch = (url, init) => fetcher(url, { ...init,
    headers: { ...Object.fromEntries(new Headers(init?.headers)), 'X-AI-Subject': options.subject } });
  async function request(path, method = 'GET', data) {
    try {
      const response = await scopedFetch(base + path, { method, headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }), cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(10000) });
      if (!response.ok) fail(response.status === 429 ? 'quota_exceeded' : response.status === 409 ? 'connection_conflict' : 'connection_backend_error',
        [400, 401, 403, 404, 409, 429].includes(response.status) ? response.status : 502);
      return await response.json();
    } catch (error) {
      if (error instanceof LiteLLMError) throw error;
      fail('connection_backend_error', 503);
    }
  }
  const list = async () => publicAccountConnections(await request('/connections'));
  return Object.freeze({
    list,
    async connect(provider, { apiKey, ttlSeconds } = {}) {
      if (!['codex', 'claude'].includes(provider)) fail('unsupported_provider', 400);
      if (provider === 'claude' && (typeof apiKey !== 'string' || !/^sk-ant-api[A-Za-z0-9_-]{20,500}$/.test(apiKey))) fail('claude_api_key_required', 400);
      if (provider === 'codex' && apiKey !== undefined) fail('use_device_login', 400);
      if (ttlSeconds !== undefined && (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 2592000)) fail('invalid_expiry', 400);
      return publicAccountConnections({ connections: [await request('/connections', 'POST', { provider, ...(apiKey ? { apiKey } : {}), ...(ttlSeconds === undefined ? {} : { ttlSeconds }) })] })[0];
    },
    async disconnect(id) {
      if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) fail('invalid_connection', 400);
      await request('/connections/' + id, 'DELETE');
    },
    client(selection) {
      async function invoke(method, input) {
        assertAccountSelection(await list(), selection);
        return createLiteLLMClient({ ...options, baseUrl: base, model: selection, fetch: scopedFetch, timeoutMs: options.timeoutMs ?? 30000 })[method](input);
      }
      return Object.freeze({ completeText: input => invoke('completeText', input), generateJSON: input => invoke('generateJSON', input) });
    },
  });
}
