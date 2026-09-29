import { learnerSession } from "./learner-auth";
import { createHmac } from "node:crypto";
import { getConversationTutor } from "./conversation-access";
import { ConversationError } from "./conversation";
import {
  getConversationProvider,
  type ConversationProvider,
} from "./conversation-provider";

export { accountSelectionPattern as selectionPattern } from "@cak/litellm-client";
import {
  publicAccountConnections,
  assertAccountSelection,
  createAccountClient,
  LiteLLMError,
  type AccountConnection,
} from "@cak/litellm-client";
export type ModelConnection = AccountConnection;
export function publicConnections(value: unknown): ModelConnection[] {
  try {
    return publicAccountConnections(value);
  } catch {
    throw new ConversationError(502, "계정 연결 정보를 확인하지 못했어요.");
  }
}

export function accountConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (
    !env.AI_ACCOUNTS_URL ||
    !env.AI_ACCOUNTS_KEY ||
    env.AI_ACCOUNTS_KEY.length < 32 ||
    !env.AI_ACCOUNTS_SUBJECT_SECRET ||
    env.AI_ACCOUNTS_SUBJECT_SECRET.length < 32
  )
    throw new ConversationError(
      503,
      "개인 계정 연결 서버를 준비 중이에요. 기본 Gemini로 연습할 수 있어요.",
    );
  const url = new URL(env.AI_ACCOUNTS_URL);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw new ConversationError(503, "계정 연결 서버 설정을 확인해야 해요.");
  return {
    base: url.href.replace(/\/+$/, ""),
    key: env.AI_ACCOUNTS_KEY,
    secret: env.AI_ACCOUNTS_SUBJECT_SECRET,
  };
}

export async function accountIdentity() {
  const learner = await learnerSession();
  const tutor = learner ? null : await getConversationTutor();
  // Student share links authorize learning, never another person's subscription.
  if (!learner && !tutor?.tid)
    throw new ConversationError(
      401,
      "개인 AI 계정을 연결하려면 학습자 또는 튜터 계정으로 로그인해 주세요.",
    );
  const config = accountConfig();
  const subject = createHmac("sha256", config.secret)
    .update(
      JSON.stringify([
        "hanmadi",
        learner ? `learner:${learner.id}` : tutor!.tid,
      ]),
    )
    .digest("hex");
  return { ...config, subject };
}

type Identity = Awaited<ReturnType<typeof accountIdentity>>;
export async function accountRequest(
  identity: Identity,
  path: string,
  method = "GET",
  data?: unknown,
  fetcher: typeof fetch = fetch,
) {
  const client = createAccountClient({
    baseUrl: identity.base,
    apiKey: identity.key,
    subject: identity.subject,
    allowLocalhost: true,
    fetch: fetcher,
  });
  try {
    if (path === "/connections" && method === "GET")
      return { connections: await client.list() };
    if (path === "/connections" && method === "POST") {
      const input = data as { provider: "codex" | "claude"; apiKey?: string };
      return await client.connect(input.provider, { apiKey: input.apiKey });
    }
    if (method === "DELETE" && /^\/connections\/[a-f0-9]{32}$/.test(path)) {
      await client.disconnect(path.split("/").at(-1)!);
      return { ok: true };
    }
    throw new ConversationError(400, "계정 요청을 확인해 주세요.");
  } catch (error) {
    throw new ConversationError(
      error instanceof LiteLLMError ? error.status : 502,
      "계정 연결 상태를 확인해 주세요. 기존 연결을 해제한 뒤 다시 시도할 수 있어요.",
    );
  }
}

export function assertSelection(
  connections: ModelConnection[],
  selection: string,
) {
  try {
    assertAccountSelection(connections, selection);
  } catch (error) {
    throw new ConversationError(
      error instanceof LiteLLMError ? error.status : 409,
      "선택한 AI 연결을 사용할 수 없어요. 연결 상태를 확인하거나 기본 Gemini를 직접 선택해 주세요.",
    );
  }
}

export async function modelProvider(
  selection: string,
): Promise<{ config: ConversationProvider; fetcher?: typeof fetch }> {
  if (selection === "default") return { config: getConversationProvider() };
  const identity = await accountIdentity();
  assertSelection(
    publicConnections(await accountRequest(identity, "/connections")),
    selection,
  );
  return {
    config: {
      provider: "litellm",
      config: {
        baseUrl: identity.base + "/v1",
        apiKey: identity.key,
        model: selection,
      },
    },
    fetcher: (input, init) =>
      fetch(input, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers)),
          "X-AI-Subject": identity.subject,
        },
      }),
  };
}
