import { readLearningProfile, recordLearningChat } from "@/lib/learning-profile";
import { ConversationError } from "@/lib/conversation";
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
    const profile = await readLearningProfile(actor, input.language);
    if (profile) {
      if (input.learningRevision !== profile.revision)
        throw new ConversationError(409, "레벨 설정이 바뀌었어요. 새로고침한 뒤 새 대화를 시작해 주세요.");
      input.level = profile.level;
    }
    const config = getConversationProvider();
    assertProviderInput(input, config);
    await reserveRequest(actor, "chat");
    const result = await replyToConversation(input, actor, config);
    if (profile) await recordLearningChat(actor, input.language, profile.assessmentId, input.lessonId);
    return conversationJson(result);
  } catch (error) {
    return conversationFailure(error);
  }
}
