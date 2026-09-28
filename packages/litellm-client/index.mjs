// Server-only. No global credentials, provider SDK, login system or hidden retries.
export class LiteLLMError extends Error {
  constructor(code, status = 502) {
    super(code);
    this.name = "LiteLLMError";
    this.code = code;
    this.status = status;
  }
}

const fail = (code, status) => { throw new LiteLLMError(code, status); };
const nonempty = value => typeof value === "string" && Boolean(value.trim());

export function normalizeConfig(config) {
  try {
    if (!config || !nonempty(config.apiKey) || /[\r\n]/.test(config.apiKey) || !nonempty(config.model)) throw Error();
    const url = new URL(config.baseUrl);
    if (url.username || url.password || url.search || url.hash ||
        !(url.protocol === "https:" || (config.allowLocalhost === true && url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw Error();
    const path = url.pathname.replace(/\/+$/, "");
    url.pathname = path.endsWith("/v1") ? path : path + "/v1";
    return { baseUrl: url.href, apiKey: config.apiKey.trim(), model: config.model.trim() };
  } catch { return fail("invalid_config", 503); }
}

export function createLiteLLMClient(options) {
  if (typeof window !== "undefined" && typeof document !== "undefined") fail("server_only", 503);
  const config = normalizeConfig(options);
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 30000;
  if (typeof fetcher !== "function" || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300000) fail("invalid_config", 503);

  async function request(path, body, consume, signal) {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    if (signal?.aborted) fail("cancelled", 499);
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const form = body instanceof FormData;
      const response = await fetcher(`${config.baseUrl}/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, ...(form || body === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
        cache: "no-store", redirect: "manual", signal: controller.signal,
      });
      if (!response.ok) {
        // Never echo upstream bodies/headers: they can contain keys and prompts.
        const status = response.status;
        fail(status === 429 ? "quota_exceeded" : status === 401 || status === 403 ? "authentication_failed" :
          status >= 300 && status < 400 ? "redirect_rejected" : "upstream_error", status);
      }
      return await consume(response);
    } catch (error) {
      if (timedOut) fail("timeout", 504);
      if (signal?.aborted) fail("cancelled", 499);
      if (error instanceof LiteLLMError) throw error;
      fail("network_error", 504);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }

  async function json(response) {
    try { return await response.json(); }
    catch { return fail("invalid_response"); }
  }

  async function completeText(input) {
    const body = { model: config.model, messages: input.messages,
      ...(input.maxTokens === undefined ? {} : { max_tokens: input.maxTokens }),
      ...(input.responseFormat === undefined ? {} : { response_format: input.responseFormat }), stream: false };
    return request("chat/completions", body, async response => {
      const data = await json(response);
      const choice = data?.choices?.[0];
      if (!choice || (choice.finish_reason && choice.finish_reason !== "stop")) fail("incomplete_response");
      if (choice.message?.refusal) fail("refused_response");
      const text = choice.message?.content;
      if (!nonempty(text) || text.length > (input.maxChars ?? 100000)) fail("invalid_response");
      return text.trim();
    }, input.signal);
  }

  return Object.freeze({
    completeText,
    async generateJSON(input) {
      const text = await completeText({ ...input, responseFormat: {
        type: "json_schema", json_schema: { name: input.name, strict: true, schema: input.schema },
      } });
      try {
        const value = JSON.parse(text);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
        return value;
      } catch { return fail("invalid_response"); }
    },
    async listModels({ signal } = {}) {
      return request("models", undefined, async response => {
        const data = await json(response);
        if (!Array.isArray(data?.data) || data.data.some(item => !nonempty(item?.id))) fail("invalid_response");
        return [...new Set(data.data.map(item => item.id))];
      }, signal);
    },
    async transcribe({ file, filename = "recording.webm", language, maxChars = 2000, signal }) {
      const form = new FormData();
      form.set("file", file, filename);
      form.set("model", config.model);
      if (language) form.set("language", language);
      return request("audio/transcriptions", form, async response => {
        const data = await json(response);
        if (!nonempty(data?.text) || data.text.length > maxChars) fail("invalid_response");
        return data.text.trim();
      }, signal);
    },
    async speech({ text, voice, signal }) {
      return request("audio/speech", { model: config.model, voice, input: text, response_format: "mp3" }, response => {
        if (!/^(audio\/|application\/octet-stream)/i.test(response.headers.get("content-type") ?? "")) fail("invalid_response");
        return response;
      }, signal);
    },
  });
}

export const connectionMethods = Object.freeze({ codex: "subscription_oauth", claude: "api_key", openai: "api_key" });
const states = new Set(["disconnected", "authorizing", "connected", "expired", "quota_exceeded", "error"]);

/** The adapter receives a verified platform session, never a browser-supplied user ID.
 * It persists secrets and executes provider auth. This module owns the lifecycle
 * and rechecks ownership/state before every call; it does not create a new login.
 */
export function createModelSession({ scope, defaultRoute, adapter, fetch: fetcher, timeoutMs }) {
  if (!nonempty(scope?.platformId) || !nonempty(scope?.subject)) fail("authentication_required", 401);
  const identity = Object.freeze({ platformId: scope.platformId, subject: scope.subject });
  const base = Object.freeze({ ...defaultRoute });
  function validate(record, id) {
    if (!record || record.scope?.platformId !== identity.platformId || record.scope?.subject !== identity.subject ||
        !nonempty(record.id) || record.id === "default" || (id !== undefined && record.id !== id) || !states.has(record.state) ||
        !Object.hasOwn(connectionMethods, record.provider) || connectionMethods[record.provider] !== record.method) fail("connection_unavailable", 403);
    // A public record is an explicit allowlist: no tokens, internal URLs or routes.
    return { id: record.id, provider: record.provider, method: record.method, state: record.state,
      selectable: record.state === "connected" };
  }
  const requireAdapter = () => { if (!adapter) fail("connection_not_configured", 503); return adapter; };
  async function call(method, input) {
    const backend = requireAdapter();
    try { return await backend[method](identity, input); }
    catch { return fail("connection_backend_error", 502); }
  }
  async function get(id) { return validate(await call("get", id), id); }
  return Object.freeze({
    async list() {
      const records = adapter ? await call("list") : [];
      if (!Array.isArray(records)) fail("connection_unavailable", 403);
      const seen = new Set();
      const choices = records.map(record => {
        const value = validate(record);
        if (seen.has(value.id) || value.id === "default") fail("connection_unavailable", 403);
        seen.add(value.id);
        return value;
      });
      return [{ id: "default", provider: "default", method: "application_key", state: "configured", selectable: true }, ...choices];
    },
    async connect(provider, method) {
      if (!Object.hasOwn(connectionMethods, provider) || connectionMethods[provider] !== method) fail("unsupported_connection_method", 400);
      // Provider adapter owns the challenge delivery (redirect/device code or key input).
      // Start returns only a persisted connection record, never a credential.
      return validate(await call("start", { provider, method }));
    },
    async refresh(id) {
      await get(id);
      return validate(await call("refresh", id), id);
    },
    async disconnect(id) {
      await get(id);
      await call("disconnect", id);
    },
    client(selection = "default") {
      // Resolve at invocation time, not selection time: disconnect/expiry takes effect.
      async function invoke(method, input) {
        let route = base;
        if (selection !== "default") {
          const record = await get(selection);
          if (record.state !== "connected") fail(`connection_${record.state}`, 409);
          const resolved = await call("resolve", selection);
          const current = validate(resolved, selection);
          if (current.state !== "connected") fail(`connection_${current.state}`, 409);
          // Atomic resolve must check scope/state and return the corresponding secret route.
          route = resolved.route;
        }
        return createLiteLLMClient({ ...route, fetch: fetcher, timeoutMs })[method](input);
      }
      return Object.freeze(Object.fromEntries(["completeText", "generateJSON", "listModels", "transcribe", "speech"].map(
        method => [method, input => invoke(method, input)],
      )));
    },
  });
}

export { createAccountClient, publicAccountConnections, assertAccountSelection, accountSelectionPattern } from "./accounts.mjs";
