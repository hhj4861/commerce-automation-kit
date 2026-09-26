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
  const form = new FormData();
  form.set(
    "file",
    file,
    `recording.${file.type.includes("mp4") ? "mp4" : file.type.includes("ogg") ? "ogg" : file.type.includes("wav") ? "wav" : "webm"}`,
  );
  form.set("model", config.model);
  form.set("language", language);
  let response: Response;
  try {
    response = await fetcher(`${config.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
  } catch {
    throw new ConversationError(
      504,
      "음성을 인식하지 못했어요. 다시 녹음하거나 직접 입력해 주세요.",
    );
  }
  if (!response.ok)
    throw new ConversationError(
      response.status === 429 ? 429 : 502,
      "음성 인식에 실패했어요. 잠시 후 다시 시도하거나 직접 입력해 주세요.",
    );
  try {
    const data = await response.json();
    if (
      typeof data.text !== "string" ||
      !data.text.trim() ||
      data.text.length > 2000
    )
      throw new Error();
    return data.text.trim();
  } catch {
    throw new ConversationError(
      502,
      "인식된 문장이 없거나 너무 길어요. 짧고 또렷하게 다시 말해 주세요.",
    );
  }
}
export async function synthesizeSpeech(
  text: string,
  config: LiteLLMConfig & { voice?: string },
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(`${config.baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        voice: config.voice,
        input: text,
        response_format: "mp3",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
  } catch {
    throw new ConversationError(
      504,
      "답변 음성을 만들지 못했어요. 텍스트를 보거나 다시 듣기를 눌러 주세요.",
    );
  }
  if (
    !response.ok ||
    !response.headers
      .get("content-type")
      ?.match(/^(audio\/|application\/octet-stream)/)
  )
    throw new ConversationError(
      response.status === 429 ? 429 : 502,
      "답변 음성을 받지 못했어요. 잠시 후 다시 들어 주세요.",
    );
  return response;
}
