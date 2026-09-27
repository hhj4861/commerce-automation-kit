import { ConversationError } from "@/lib/conversation";
import { audioConfig, transcribeAudio } from "@/lib/conversation-audio";
import {
  assertConversationOrigin,
  conversationActor,
  conversationFailure,
  conversationJson,
  readLimitedBody,
  reserveRequest,
} from "@/lib/conversation-http";
import { isLanguage } from "@/lib/courses";
export const runtime = "nodejs";
export const maxDuration = 40;
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req);
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data;"))
      throw new ConversationError(415, "녹음 파일 형식이 올바르지 않아요.");
    const bytes = await readLimitedBody(req, 3 * 1024 * 1024);
    let form: FormData;
    try {
      form = await new Response(new Uint8Array(bytes), {
        headers: { "content-type": contentType },
      }).formData();
    } catch {
      throw new ConversationError(400, "녹음 파일을 다시 보내 주세요.");
    }
    const language = form.get("language");
    const file = form.get("file");
    if (
      !isLanguage(language) ||
      !(file instanceof File) ||
      !file.size ||
      !/^audio\/(webm|mp4|ogg|wav)(;|$)/.test(file.type)
    )
      throw new ConversationError(
        400,
        "학습 언어와 녹음 파일을 확인해 주세요.",
      );
    const actor = await conversationActor(form.get("studentSlug") ?? undefined);
    const config = audioConfig("transcribe");
    await reserveRequest(actor, "transcribe");
    return conversationJson({
      text: await transcribeAudio(file, language, config),
    });
  } catch (error) {
    return conversationFailure(error);
  }
}
