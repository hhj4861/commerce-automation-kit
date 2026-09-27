import {
  parseConversation,
} from "@/lib/conversation";
import { assertProviderInput, getConversationProvider, replyToConversation } from "@/lib/conversation-provider";
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
    const config = getConversationProvider();
    assertProviderInput(input, config);
    await reserveRequest(actor, "chat");
    return conversationJson(await replyToConversation(input, actor, config));
  } catch (error) {
    return conversationFailure(error);
  }
}
