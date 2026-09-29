import { createLiteLLMClient } from "@cak/litellm-client";
import { studyIdentity } from "@/lib/learner-auth";
import { audioConfig, synthesizeSpeech } from "@/lib/conversation-audio";
import { ConversationError } from "@/lib/conversation";
import {
  assertConversationOrigin,
  conversationFailure,
  conversationJson,
  readConversationJson,
  readLimitedBody,
  reserveRequest,
} from "@/lib/conversation-http";
import { isStudyLanguage } from "@/lib/v2";
export const runtime = "nodejs";
export const maxDuration = 45;
export async function POST(req: Request) {
  try {
    assertConversationOrigin(req);
    const { actor } = await studyIdentity();
    if (req.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const bytes = await readLimitedBody(req, 3_000_000);
      const form = await new Request(req.url, {
        method: "POST",
        headers: { "content-type": req.headers.get("content-type")! },
        body: new Uint8Array(bytes),
      }).formData();
      const file = form.get("file"),
        language = form.get("language");
      if (
        !(file instanceof File) ||
        file.size === 0 ||
        !/^audio\/(webm|mp4|ogg|wav)(;.*)?$/.test(file.type) ||
        (language !== "auto" && language !== "ko" && !isStudyLanguage(language))
      )
        throw new ConversationError(400, "녹음과 입력 언어를 확인해 주세요.");
      const config = audioConfig("transcribe");
      await reserveRequest(actor, "transcribe");
      const text = await createLiteLLMClient({
        ...config,
        allowLocalhost: true,
      }).transcribe({
        file,
        ...(language === "auto" ? {} : { language: language as string }),
        maxChars: 1000,
      });
      return conversationJson({ text });
    }
    const b = (await readConversationJson(req)) as { text?: unknown };
    if (typeof b?.text !== "string" || !b.text.trim() || b.text.length > 1000)
      throw new ConversationError(400, "들을 문장을 선택해 주세요.");
    const config = audioConfig("speech");
    await reserveRequest(actor, "speech");
    const response = await synthesizeSpeech(b.text, config);
    const bytes = await readLimitedBody(response, 5_000_000);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return conversationFailure(e);
  }
}
