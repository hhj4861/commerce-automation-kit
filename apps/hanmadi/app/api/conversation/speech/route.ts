import { ConversationError } from "@/lib/conversation";
import { audioConfig, synthesizeSpeech } from "@/lib/conversation-audio";
import {
  assertConversationOrigin,
  conversationActor,
  conversationFailure,
  readConversationJson,
  readLimitedBody,
  reserveRequest,
} from "@/lib/conversation-http";
import { isLanguage } from "@/lib/courses";
export const runtime = "nodejs";
export const maxDuration = 40;
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req);
    const input = (await readConversationJson(req)) as Record<
      string,
      unknown
    > | null;
    if (
      !input ||
      !isLanguage(input.language) ||
      typeof input.text !== "string" ||
      !input.text.trim() ||
      input.text.length > 2000
    )
      throw new ConversationError(400, "읽을 문장을 확인해 주세요.");
    const actor = await conversationActor(input.studentSlug);
    const config = audioConfig("speech");
    await reserveRequest(actor, "speech");
    const response = await synthesizeSpeech(input.text.trim(), config);
    const audio = await readLimitedBody(response, 5 * 1024 * 1024);
    if (!audio.byteLength)
      throw new ConversationError(
        502,
        "답변 음성이 비어 있어요. 다시 들어 주세요.",
      );
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return conversationFailure(error);
  }
}
