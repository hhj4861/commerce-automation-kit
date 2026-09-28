import { createHmac } from "node:crypto";
import { getConversationTutor } from "./conversation-access";
import { ConversationError } from "./conversation";
import { getConversationProvider, type ConversationProvider } from "./conversation-provider";

export type ModelConnection = {
  id: string; provider: "codex" | "claude";
  state: "authorizing" | "connected" | "expired" | "quota_exceeded" | "error" | "disconnected";
  models: string[]; challenge?: { url: string; code: string; expiresAt: number };
};
const states = new Set(["authorizing", "connected", "expired", "quota_exceeded", "error", "disconnected"]);
export const selectionPattern = /^[a-f0-9]{32}:[a-zA-Z0-9.-]{1,100}$/;

export function publicConnections(value: unknown): ModelConnection[] {
  const list = (value as { connections?: unknown })?.connections;
  if (!Array.isArray(list) || list.length > 10) throw new ConversationError(502, "계정 연결 정보를 확인하지 못했어요.");
  return list.map(record => {
    if (!record || !/^[a-f0-9]{32}$/.test(record.id) || !["codex", "claude"].includes(record.provider) || !states.has(record.state) ||
        !Array.isArray(record.models) || record.models.length > 30 || record.models.some((m: unknown) => typeof m !== "string" || !/^[a-zA-Z0-9.-]{1,100}$/.test(m)))
      throw new ConversationError(502, "계정 연결 정보를 확인하지 못했어요.");
    const result: ModelConnection = { id: record.id, provider: record.provider, state: record.state, models: record.state === "connected" ? record.models : [] };
    if (record.challenge) {
      const c = record.challenge;
      if (record.provider !== "codex" || record.state !== "authorizing" || c.url !== "https://auth.openai.com/codex/device" ||
          typeof c.code !== "string" || !/^[A-Za-z0-9-]{4,32}$/.test(c.code) || typeof c.expiresAt !== "number" || !Number.isFinite(c.expiresAt))
        throw new ConversationError(502, "안전한 로그인 주소를 확인하지 못했어요.");
      if (c.expiresAt > Date.now() / 1000) result.challenge = { url: c.url, code: c.code, expiresAt: c.expiresAt };
    }
    return result;
  });
}

export function accountConfig(env: Record<string, string | undefined> = process.env) {
  if (!env.AI_ACCOUNTS_URL || !env.AI_ACCOUNTS_KEY || env.AI_ACCOUNTS_KEY.length < 32 || !env.AI_ACCOUNTS_SUBJECT_SECRET || env.AI_ACCOUNTS_SUBJECT_SECRET.length < 32)
    throw new ConversationError(503, "개인 계정 연결 서버를 준비 중이에요. 기본 Gemini로 연습할 수 있어요.");
  const url = new URL(env.AI_ACCOUNTS_URL);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))))
    throw new ConversationError(503, "계정 연결 서버 설정을 확인해야 해요.");
  return { base: url.href.replace(/\/+$/, ""), key: env.AI_ACCOUNTS_KEY, secret: env.AI_ACCOUNTS_SUBJECT_SECRET };
}

export async function accountIdentity() {
  const tutor = await getConversationTutor();
  // Student share links authorize learning, never another person's subscription.
  if (!tutor?.tid) throw new ConversationError(401, "개인 AI 계정을 연결하려면 튜터 계정으로 로그인해 주세요.");
  const config = accountConfig();
  const subject = createHmac("sha256", config.secret).update(JSON.stringify(["hanmadi", tutor.tid])).digest("hex");
  return { ...config, subject };
}

type Identity = Awaited<ReturnType<typeof accountIdentity>>;
export async function accountRequest(identity: Identity, path: string, method = "GET", data?: unknown, fetcher: typeof fetch = fetch) {
  let response: Response;
  try {
    response = await fetcher(identity.base + path, { method, headers: { Authorization: `Bearer ${identity.key}`, "X-AI-Subject": identity.subject, "Content-Type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
  } catch { throw new ConversationError(503, "계정 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요."); }
  if (!response.ok) throw new ConversationError(response.status === 409 ? 409 : response.status === 429 ? 429 : 502,
    response.status === 409 ? "연결된 계정을 해제한 뒤 다시 연결해 주세요." : response.status === 429 ? "연결 요청이 많아요. 잠시 후 다시 시도해 주세요." : "계정 연결에 실패했어요. 키와 연결 상태를 확인해 주세요.");
  try { return await response.json(); }
  catch { throw new ConversationError(502, "계정 서버 응답을 확인하지 못했어요."); }
}

export function assertSelection(connections: ModelConnection[], selection: string) {
  if (!selectionPattern.test(selection)) throw new ConversationError(400, "AI 모델을 다시 선택해 주세요.");
  const [id, model] = selection.split(":");
  const connection = connections.find(c => c.id === id);
  if (!connection || connection.state !== "connected" || !connection.models.includes(model))
    throw new ConversationError(409, "선택한 AI 연결을 사용할 수 없어요. 연결 상태를 확인하거나 기본 Gemini를 직접 선택해 주세요.");
}

export async function modelProvider(selection: string): Promise<{ config: ConversationProvider; fetcher?: typeof fetch }> {
  if (selection === "default") return { config: getConversationProvider() };
  const identity = await accountIdentity();
  assertSelection(publicConnections(await accountRequest(identity, "/connections")), selection);
  return { config: { provider: "litellm", config: { baseUrl: identity.base + "/v1", apiKey: identity.key, model: selection } },
    fetcher: (input, init) => fetch(input, { ...init, headers: { ...Object.fromEntries(new Headers(init?.headers)), "X-AI-Subject": identity.subject } }) };
}
