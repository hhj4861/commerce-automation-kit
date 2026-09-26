import {
  completeConversation,
  getLiteLLMConfig,
  parseConversation,
} from "@/lib/conversation";
import {
  assertConversationOrigin,
  conversationActor,
  conversationFailure,
  conversationJson,
  readConversationJson,
  reserveRequest,
} from "@/lib/conversation-http";
export const runtime = "nodejs";
export const maxDuration = 40;
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req);
    const input = parseConversation(await readConversationJson(req));
    const actor = await conversationActor(input.studentSlug);
    const config = getLiteLLMConfig();
    await reserveRequest(actor, "chat");
    return conversationJson({
      reply: await completeConversation(input, config),
    });
  } catch (error) {
    return conversationFailure(error);
  }
}
