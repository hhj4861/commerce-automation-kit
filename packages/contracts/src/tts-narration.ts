/**
 * tts-narration ↔ 소비자 계약 (원자 #13).
 *
 * 한국어 내레이션 mp3 생성 결과. 음성·모델 정책은 hanmadi(튜터 앱)와 동일한
 * 검증된 설정을 공유한다 — 기본 음성 Claire(한국어 원어민, STT 전수검증),
 * 짧은 문구는 turbo v2.5 + language_code:ko 강제.
 */

/** 생성된 내레이션 클립 1개 (텍스트 1건 = 파일 1개). */
export interface NarrationClip {
  /** mp3 절대/상대 경로 */
  file: string;
  /** 읽은 원문 */
  text: string;
  voiceId: string;
  modelId: string;
  /** ISO 8601 */
  createdAt: string;
}

/** 대본(비트 목록) 일괄 생성 결과 — shopping-shorts --narration 입력으로 연결. */
export interface NarrationBatchResult {
  clips: NarrationClip[];
  /** --join 시 비트 순서대로 이어붙인 단일 mp3 */
  joinedFile?: string;
}
