/**
 * 음성·모델 결정 정책 (순수) — hanmadi(apps/hanmadi/lib/tts.ts)와 동일하게 유지한다.
 * 두 곳이 갈라지면 "같은 목소리" 보장이 깨진다. 바꿀 때는 반드시 함께 바꿀 것.
 *
 * 검증 이력(2026-07-27, whisper STT 전수검증):
 * - 영어 화자 음성(Rachel)은 단음절을 왜곡('누'→'뉴') → 한국어 원어민 Claire 채택.
 * - multilingual v2는 한두 글자에서 언어 자동감지가 흔들림('누'→'수') →
 *   3자 이하는 turbo v2.5 + language_code:ko 로 언어를 강제.
 */

/**
 * ElevenLabs 보이스 라이브러리 "Yooni - Natural & Clear" — 한국어 원어민, 밝고 크리스프.
 * 사용자가 Vrew VO 톤과 가장 유사한 음성으로 청음 선정(2026-07-28).
 * 이전: Claire(ZRJMGKt2Okf3o9C38eSq) — 뱅크에 남아 있어 롤백 가능.
 */
export const DEFAULT_VOICE_ID = 'n2fbxG88jqAoaVPUy3IG';
/** 긴 문장 기본 — 프로소디 최상 */
export const DEFAULT_MODEL_ID = 'eleven_multilingual_v2';
/** 짧은 문구 전용 — language_code 로 한국어 강제 가능 */
export const SHORT_TEXT_MODEL_ID = 'eleven_turbo_v2_5';
export const SHORT_TEXT_MAX_LEN = 3;

/** 내레이션은 영상 트랙이므로 웹(64k)보다 높은 128k 기본 */
export const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128';

export interface TtsPolicy {
  voiceId: string;
  modelId: string;
  /** v2.5 계열에서만 전송 (multilingual v2 는 파라미터 미지원) */
  languageCode?: 'ko';
}

export function hasHangul(text: string): boolean {
  return /[ㄱ-ㆎ가-힣]/.test(text);
}

/** language_code 파라미터는 v2.5 계열(turbo/flash)에서만 허용된다 */
export function supportsLanguageCode(modelId: string): boolean {
  return /_v2_5$/.test(modelId);
}

/**
 * 문구와 환경변수로 음성·모델을 정한다.
 * env 우선순위: ELEVENLABS_VOICE_ID / ELEVENLABS_TTS_MODEL > 길이 기반 기본값.
 */
export function resolvePolicy(
  text: string,
  env: Record<string, string | undefined> = process.env,
): TtsPolicy {
  const voiceId = env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId =
    env.ELEVENLABS_TTS_MODEL ||
    ([...text.trim()].length <= SHORT_TEXT_MAX_LEN
      ? SHORT_TEXT_MODEL_ID
      : DEFAULT_MODEL_ID);
  return {
    voiceId,
    modelId,
    ...(supportsLanguageCode(modelId) ? { languageCode: 'ko' as const } : {}),
  };
}

/** 정책 → ElevenLabs TTS 요청 본문 (순수, 테스트 대상) */
export function buildRequestBody(text: string, policy: TtsPolicy): Record<string, unknown> {
  return {
    text,
    model_id: policy.modelId,
    ...(policy.languageCode ? { language_code: policy.languageCode } : {}),
  };
}
