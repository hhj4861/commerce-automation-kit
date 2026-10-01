import { createStudySpeechResponses } from "@/lib/study-audio-response";
import { sceneLessonPlans } from "@/lib/v2-scene-lessons";
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
const speechResponse = createStudySpeechResponses();
const lessonTexts = new Set(Object.values(sceneLessonPlans).flatMap(plans => plans.flatMap(plan =>
  plan.rows.trim().split("\n").flatMap(row => {
    const values = row.split("|");
    return (["ja", "th", "en", "es"] as const).map((language, i) => JSON.stringify([language, values[1 + i * 2]]));
  }),
)));
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
    const b = (await readConversationJson(req)) as { text?: unknown; language?: unknown };
    if (typeof b?.text !== "string" || !b.text.trim() || b.text.length > 1000)
      throw new ConversationError(400, "들을 문장을 선택해 주세요.");
    const config = audioConfig("speech");
    await reserveRequest(actor, "speech");
    const text = b.text.trim();
    const language = isStudyLanguage(b.language) ? b.language : "";
    const key = lessonTexts.has(JSON.stringify([language, text]))
      ? JSON.stringify([config.baseUrl, config.model, config.voice, language, text]) : null;
    return await speechResponse(key, () => synthesizeSpeech(text, config), req.signal);
  } catch (e) {
    return conversationFailure(e);
  }
}
