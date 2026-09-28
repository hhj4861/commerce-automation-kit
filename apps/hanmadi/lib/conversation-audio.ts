import { createLiteLLMClient, LiteLLMError } from "@cak/litellm-client";
import {
  ConversationError,
  getLiteLLMConfig,
  type LiteLLMConfig,
} from "./conversation";
import type { Language } from "./courses";

export function audioConfig(
  kind: "transcribe" | "speech",
  env: Record<string, string | undefined> = process.env,
): LiteLLMConfig & { voice?: string } {
  const model =
    kind === "transcribe" ? env.LITELLM_STT_MODEL : env.LITELLM_TTS_MODEL;
  if (!model || (kind === "speech" && !env.LITELLM_TTS_VOICE))
    throw new ConversationError(
      503,
      "음성 연결을 준비 중이에요. 텍스트로 연습하거나 튜터에게 문의해 주세요.",
    );
  return {
    ...getLiteLLMConfig({ ...env, LITELLM_MODEL: model }),
    voice: env.LITELLM_TTS_VOICE,
  };
}
export async function transcribeAudio(
  file: File,
  language: Language,
  config: LiteLLMConfig,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  try {
    return await createLiteLLMClient({ ...config, allowLocalhost: true, fetch: fetcher }).transcribe({
      file, language,
      filename: `recording.${file.type.includes("mp4") ? "mp4" : file.type.includes("ogg") ? "ogg" : file.type.includes("wav") ? "wav" : "webm"}`,
      maxChars: 2000,
    });
  } catch (error) {
    const status = error instanceof LiteLLMError ? error.status : 502;
    throw new ConversationError(status === 429 ? 429 : status === 504 ? 504 : 502,
      "음성을 인식하지 못했어요. 다시 녹음하거나 직접 입력해 주세요.");
  }
}
export async function synthesizeSpeech(
  text: string,
  config: LiteLLMConfig & { voice?: string },
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  try {
    return await createLiteLLMClient({ ...config, allowLocalhost: true, fetch: fetcher }).speech({ text, voice: config.voice });
  } catch (error) {
    const status = error instanceof LiteLLMError ? error.status : 502;
    throw new ConversationError(status === 429 ? 429 : status === 504 ? 504 : 502,
      "답변 음성을 받지 못했어요. 잠시 후 다시 들어 주세요.");
  }
}
