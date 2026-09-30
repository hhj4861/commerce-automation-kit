// Server-only Jev transport through LiteLLM. No provider keys, retries or decisions
// hidden in the client. Applications own their rubrics, thresholds and fallback.
export class JevError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.name = 'JevError';
    this.code = code;
    this.status = status;
  }
}

const fail = (code, status) => { throw new JevError(code, status); };
const plain = value => value !== null && typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const content = value => typeof value === 'string' || Array.isArray(value) || plain(value);
const probability = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const text = value => typeof value === 'string' && value.trim().length > 0;
const sameKeys = (value, keys) => plain(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));

function jsonValue(value, seen = new Set(), depth = 0) {
  if (depth > 64) return false; // Local resource limit, not a provider token limit.
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if ((!Array.isArray(value) && !plain(value)) || seen.has(value)) return false;
  seen.add(value);
  const valid = Object.getOwnPropertySymbols(value).length === 0 &&
    (Array.isArray(value) ? Array.from(value) : Object.values(value)).every(v => jsonValue(v, seen, depth + 1));
  seen.delete(value);
  return valid;
}

function payload(input, model, limit) {
  try {
    if (!input || !content(input.state) || !plain(input.questions) || !Object.keys(input.questions).length) throw Error();
    for (const [id, q] of Object.entries(input.questions)) {
      if (!text(id) || !plain(q) || !content(q.instructions) ||
          Object.keys(q).some(k => !['type', 'instructions', 'criteria'].includes(k))) throw Error();
      if (q.type === 'choice') {
        if (!plain(q.criteria) || !Object.keys(q.criteria).length || Object.keys(q.criteria).length > 255 ||
            Object.entries(q.criteria).some(([key, v]) => !text(key) || !(v === null || content(v)))) throw Error();
      } else if (q.type === 'score') {
        if (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 10 || !q.criteria.every(content)) throw Error();
      } else if (q.type === 'noul') {
        if (q.criteria !== undefined && (!plain(q.criteria) ||
            Object.entries(q.criteria).some(([key, v]) => !['true', 'false'].includes(key) || !content(v)))) throw Error();
      } else throw Error();
    }
    const value = { model, state: input.state, questions: input.questions };
    if (!jsonValue(value)) throw Error();
    const body = JSON.stringify(value);
    if (new TextEncoder().encode(body).length > limit) fail('request_too_large', 413);
    // Snapshot before starting I/O: later caller mutation cannot change validation.
    return { body, questions: JSON.parse(body).questions };
  } catch (error) {
    if (error instanceof JevError) throw error;
    fail('invalid_input', 400);
  }
}

function distribution(value, keys) {
  if (!sameKeys(value, keys) || !Object.values(value).every(probability) ||
      Math.abs(Object.values(value).reduce((sum, n) => sum + n, 0) - 1) > 0.001) fail('invalid_response');
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

function result(data, questions) {
  const ids = Object.keys(questions);
  if (!plain(data) || !text(data.model) || !sameKeys(data.answers, ids) || !plain(data.usage) ||
      !['input_tokens', 'output_tokens'].every(k => Number.isSafeInteger(data.usage[k]) && data.usage[k] >= 0)) fail('invalid_response');
  const answers = Object.fromEntries(ids.map(id => {
    const q = questions[id], a = data.answers[id];
    if (!plain(a) || a.type !== q.type) fail('invalid_response');
    if (q.type === 'noul') {
      if (!probability(a.noul)) fail('invalid_response');
      return [id, { type: 'noul', noul: a.noul }];
    }
    if (!probability(a.confidence)) fail('invalid_response');
    const keys = q.type === 'choice' ? Object.keys(q.criteria) : q.criteria.map((_, i) => String(i));
    const probabilities = distribution(a.probabilities, keys);
    if (q.type === 'choice') {
      if (typeof a.choice !== 'string' || !keys.includes(a.choice) ||
          probabilities[a.choice] + 0.001 < Math.max(...Object.values(probabilities))) fail('invalid_response');
      return [id, { type: 'choice', choice: a.choice, probabilities, confidence: a.confidence }];
    }
    if (!sameKeys(a.legend, keys) || !Object.values(a.legend).every(v => typeof v === 'string') ||
        typeof a.score !== 'number' || !Number.isFinite(a.score) || a.score < 0 || a.score > keys.length - 1) fail('invalid_response');
    return [id, { type: 'score', score: a.score, legend: Object.fromEntries(keys.map(k => [k, a.legend[k]])),
      probabilities, confidence: a.confidence }];
  }));
  return { model: data.model, answers,
    usage: { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens } };
}

// Also enforce deadlines for injected transports that ignore AbortSignal.
function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function readJson(response, limit, signal) {
  if (!response.body) fail('invalid_response');
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await abortable(reader.read(), signal);
      if (done) break;
      length += value.byteLength;
      if (length > limit) { void reader.cancel().catch(() => {}); fail('response_too_large'); }
      chunks.push(value);
    }
  } finally {
    if (signal.aborted) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { fail('invalid_response'); }
}

/** baseUrl is the LiteLLM proxy root/prefix, optionally ending in /v1. */
export function createJevClient(options) {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') fail('server_only', 503);
  let endpoint, key, model, fetcher, timeoutMs, maxRequestBytes, maxResponseBytes;
  try {
    const url = new URL(options.baseUrl);
    if (url.username || url.password || url.search || url.hash ||
        !(url.protocol === 'https:' || (options.allowLocalhost === true && url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw Error();
    if (!text(options.apiKey) || /[\r\n]/.test(options.apiKey)) throw Error();
    key = options.apiKey.trim();
    model = options.model ?? 'jev-1.13.0';
    if (!text(model) || !/^jev-[a-zA-Z0-9.-]+$/.test(model)) throw Error();
    const prefix = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '');
    url.pathname = prefix + '/typesafe/v1/systemone';
    endpoint = url.href;
    fetcher = options.fetch ?? globalThis.fetch;
    timeoutMs = options.timeoutMs ?? 5000;
    maxRequestBytes = options.maxRequestBytes ?? 1048576;
    maxResponseBytes = options.maxResponseBytes ?? 1048576;
    if (typeof fetcher !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000 ||
        ![maxRequestBytes, maxResponseBytes].every(n => Number.isSafeInteger(n) && n >= 1 && n <= 10485760)) throw Error();
  } catch { fail('invalid_config', 503); }

  return Object.freeze({
    async evaluate(input) {
      const { body, questions } = payload(input, model, maxRequestBytes);
      const signal = input.signal;
      if (signal !== undefined && !(signal instanceof AbortSignal)) fail('invalid_input', 400);
      if (signal?.aborted) fail('cancelled', 499);
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        const pending = Promise.resolve(fetcher(endpoint, {
          method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body, redirect: 'manual', cache: 'no-store', signal: controller.signal,
        }));
        // A custom fetch may settle after cancellation. Dispose its unread body.
        void pending.then(response => {
          if (controller.signal.aborted) void response.body?.cancel().catch(() => {});
        }).catch(() => {});
        const response = await abortable(pending, controller.signal);
        if (!response.ok) {
          void response.body?.cancel().catch(() => {});
          const status = response.status;
          fail(status === 401 || status === 403 ? 'authentication_failed' : status === 429 ? 'rate_limited' :
            status === 529 ? 'overloaded' : status >= 300 && status < 400 ? 'redirect_rejected' : 'upstream_error', status);
        }
        const output = result(await readJson(response, maxResponseBytes, controller.signal), questions);
        if (controller.signal.aborted) fail('cancelled', 499);
        return output;
      } catch (error) {
        if (timedOut) fail('timeout', 504);
        if (signal?.aborted) fail('cancelled', 499);
        if (error instanceof JevError) throw error;
        // Never return request data, keys, upstream bodies or exception messages.
        fail('network_error', 504);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
    },
  });
}
