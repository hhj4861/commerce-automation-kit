import {
  completeConversation, ConversationError, getLiteLLMConfig,
  type ConversationInput, type LiteLLMConfig,
} from "./conversation";

export type ConversationProvider = { provider: "litellm"; config: LiteLLMConfig };

export function getConversationProvider(
  env: Record<string, string | undefined> = process.env,
): ConversationProvider {
  // Old deployments must be explicitly reconfigured, never silently rerouted.
  const provider = env.CONVERSATION_PROVIDER ||
    (env.DIFY_BASE_URL || env.DIFY_API_KEY || env.DIFY_USER_SECRET ? "retired" : "litellm");
  if (provider !== "litellm")
    throw new ConversationError(503, "AI 회화 연결 설정을 확인해야 해요. 튜터에게 문의해 주세요.");
  return { provider, config: getLiteLLMConfig(env) };
}

export function assertProviderInput(input: ConversationInput) {
  if (input.conversationId)
    throw new ConversationError(409, "이전 회화 연결은 종료됐어요. 새 대화를 시작해 주세요.");
}

export async function replyToConversation(
  input: ConversationInput,
  config: ConversationProvider,
  fetcher: typeof fetch = fetch,
): Promise<{ reply: string }> {
  assertProviderInput(input);
  return { reply: await completeConversation(input, config.config, fetcher) };
}
