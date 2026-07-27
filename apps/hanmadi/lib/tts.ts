import { createHash } from "node:crypto";
import { bumpTtsDailyCount, getTtsAudio, setTtsAudio } from "./store";

/**
 * 발음 TTS (Node 런타임 전용 — API 라우트에서만 import).
 *
 * Web Speech API는 학생 기기에 깔린 음성을 쓰므로 품질 상한이 기기 복불복이다.
 * 대신 ElevenLabs로 mp3를 생성하고 저장소에 영구 캐시한다 — 같은 문구는
 * 크레딧을 다시 쓰지 않는다. 클라이언트는 이 API가 실패하면(키 없음·상한 초과)
 * 기존 브라우저 음성으로 폴백하므로, 여기서는 조용히 실패해도 안전하다.
 *
 * 남용 방어: 공개 경로에서 호출되므로 (1) 한글 포함 필수 (2) 길이 상한
 * (3) "신규 생성"만 세는 일일 상한. 캐시 적중은 상한을 소모하지 않는다.
 */

const MAX_TEXT_LEN = 80;
const DAILY_NEW_GENERATION_LIMIT = 400;

const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs 기본 제공 "Rachel"
const DEFAULT_MODEL_ID = "eleven_multilingual_v2"; // 한국어 최고 품질 (flash보다 자연스러움)

export type TtsResult =
  | { ok: true; mp3: Buffer; cached: boolean }
  | { ok: false; status: number; reason: string };

/** 캐시 키가 흔들리지 않도록 문구를 정규화한다 (공백 정리만 — 의미는 보존) */
function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function hasHangul(text: string): boolean {
  return /[ㄱ-ㆎ가-힣]/.test(text);
}

export async function synthesizeKorean(rawText: string): Promise<TtsResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return { ok: false, status: 503, reason: "TTS 미설정" };

  const text = normalize(rawText);
  if (!text || text.length > MAX_TEXT_LEN) {
    return { ok: false, status: 400, reason: "문구 길이 초과" };
  }
  if (!hasHangul(text)) {
    return { ok: false, status: 400, reason: "한국어 문구만 지원" };
  }

  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_TTS_MODEL || DEFAULT_MODEL_ID;

  // 음성/모델이 바뀌면 캐시도 자연히 갈라지도록 키에 함께 섞는다
  const cacheField = createHash("sha256")
    .update(`${voiceId}|${modelId}|${text}`)
    .digest("hex")
    .slice(0, 32);

  const cachedMp3 = await getTtsAudio(cacheField);
  if (cachedMp3) return { ok: true, mp3: cachedMp3, cached: true };

  const today = new Date().toISOString().slice(0, 10);
  const used = await bumpTtsDailyCount(today);
  if (used > DAILY_NEW_GENERATION_LIMIT) {
    return { ok: false, status: 429, reason: "오늘 생성 상한 도달" };
  }

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_64`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: modelId }),
    },
  );
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    return { ok: false, status: 502, reason: `ElevenLabs ${res.status}: ${detail}` };
  }

  const mp3 = Buffer.from(await res.arrayBuffer());
  await setTtsAudio(cacheField, mp3);
  return { ok: true, mp3, cached: false };
}
