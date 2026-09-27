// Server-side only: API keys and end-user identity never come from the browser.
import { createHmac } from "node:crypto";
import { getLesson, languages } from "./courses";
import {
  completeConversation, ConversationError, getLiteLLMConfig,
  type ConversationInput, type LiteLLMConfig,
} from "./conversation";

export type ConversationProvider =
  | { provider: "litellm"; config: LiteLLMConfig }
  | { provider: "dify"; baseUrl: string; apiKey: string; userSecret: string };

export function getConversationProvider(
  env: Record<string, string | undefined> = process.env,
): ConversationProvider {
  const provider = env.CONVERSATION_PROVIDER ||
    (env.DIFY_BASE_URL || env.DIFY_API_KEY ? "dify" : "litellm");
  if (provider === "litellm") return { provider, config: getLiteLLMConfig(env) };
  if (provider !== "dify")
    throw new ConversationError(503, "AI 회화 연결 설정을 확인해야 해요. 튜터에게 문의해 주세요.");
  try {
    if (!env.DIFY_BASE_URL || !env.DIFY_API_KEY?.trim() ||
        !env.DIFY_USER_SECRET || env.DIFY_USER_SECRET.length < 32) throw new Error();
    const url = new URL(env.DIFY_BASE_URL);
    if (url.username || url.password || url.search || url.hash ||
        !(url.protocol === "https:" || (url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
    return {
      provider,
      baseUrl: url.href.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1",
      apiKey: env.DIFY_API_KEY.trim(), userSecret: env.DIFY_USER_SECRET,
    };
  } catch {
    throw new ConversationError(503, "AI 회화 연결을 준비 중이에요. 튜터에게 문의해 주세요.");
  }
}

export function difyUser(actor: string, input: ConversationInput, secret: string) {
  // Scope conversations to the authenticated actor AND the selected lesson.
  // Neither private student slugs nor tutor names are sent to Dify.
  return createHmac("sha256", secret)
    .update(JSON.stringify(["hanmadi", actor, input.language, input.lessonId, input.level]))
    .digest("hex");
}

export function assertProviderInput(input: ConversationInput, config: ConversationProvider) {
  if (config.provider === "dify") {
    if (input.storageConsent !== true)
      throw new ConversationError(400, "대화 저장 안내를 확인하고 동의해 주세요.");
    if (input.messages.length > 1 && !input.conversationId)
      throw new ConversationError(409, "대화 연결이 끊겼어요. 새 대화를 시작해 주세요.");
  } else if (input.conversationId) {
    throw new ConversationError(409, "회화 연결이 변경됐어요. 새 대화를 시작해 주세요.");
  }
}

export async function replyToConversation(
  input: ConversationInput,
  actor: string,
  config: ConversationProvider,
  fetcher: typeof fetch = fetch,
): Promise<{ reply: string; conversationId?: string }> {
  assertProviderInput(input, config);
  if (config.provider === "litellm")
    return { reply: await completeConversation(input, config.config, fetcher) };
  const lesson = getLesson(input.language, input.lessonId)!;
  let response: Response;
  try {
    response = await fetcher(`${config.baseUrl}/chat-messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: {
          language: languages[input.language].name,
          level: input.level === "beginner" ? "입문" : "중급",
          scenario: `${lesson.title}: ${lesson.goal}`.slice(0, 300),
        },
        query: input.messages.at(-1)!.content,
        user: difyUser(actor, input, config.userSecret),
        ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
        response_mode: "blocking", auto_generate_name: false,
      }),
      signal: AbortSignal.timeout(30000), cache: "no-store", redirect: "error",
    });
  } catch {
    throw new ConversationError(504, "AI 응답을 받지 못했어요. 잠시 후 다시 보내 주세요.");
  }
  if (response.status === 404)
    throw new ConversationError(409, "대화를 찾을 수 없어요. 새 대화를 시작해 주세요.");
  if (!response.ok)
    throw new ConversationError(response.status === 429 ? 429 : 502,
      response.status === 429 ? "AI 사용량이 많아요. 잠시 후 다시 시도해 주세요." :
        "AI 연결에 문제가 있어요. 잠시 후 다시 시도해 주세요.");
  try {
    const data = await response.json();
    if (typeof data.answer !== "string" || !data.answer.trim() || data.answer.length > 2000 ||
        typeof data.conversation_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.conversation_id) ||
        (input.conversationId && data.conversation_id !== input.conversationId)) throw new Error();
    return { reply: data.answer.trim(), conversationId: data.conversation_id };
  } catch {
    throw new ConversationError(502, "AI 답변을 완성하지 못했어요. 다시 보내 주세요.");
  }
}
