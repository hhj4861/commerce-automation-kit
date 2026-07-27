/**
 * 비용 견적 — 실측 단가만 사용, 미실측 조합은 null(지어내지 않음 — 프로젝트 규칙).
 *
 * 실측(2026-07, 힉스필드 get_cost 프리플라이트):
 * - kling3_0 pro  : 15s=26.25cr, 5s=8.75cr  → 초당 1.75cr (2점 선형 일치 확인)
 * - kling3_0 std  : 15s=22.50cr             → 초당 1.50cr (1점 — 선형은 pro 로 검증된 과금 방식)
 * - seedance_2_0 std 1080p: 15s=135cr, 5s=45cr → 초당 9cr (2점 선형 일치 확인)
 * - seed_audio TTS: 회당 ~1.1cr (label-test 실측 표)
 */

export type ClipModel = 'kling3_0-pro' | 'kling3_0-std' | 'seedance-std-1080';

/** 초당 크레딧(실측 근거는 파일 헤더). 미기재 모델은 견적 불가(null). */
const PER_SECOND_CREDITS: Record<ClipModel, number> = {
  'kling3_0-pro': 1.75,
  'kling3_0-std': 1.5,
  'seedance-std-1080': 9,
};

export const TTS_CREDITS_PER_SCRIPT = 1.1;

export interface EstimateResult {
  model: string;
  /** 비트별 클립 비용(미실측 모델이면 null) */
  perClip: (number | null)[];
  clipsTotal: number | null;
  /** TTS 내레이션(스크립트 1회 생성 기준) */
  ttsCredits: number;
  /** 클립 미실측이면 null (부분합으로 오도하지 않음) */
  grandTotal: number | null;
  notes: string[];
}

/** 비트 길이 목록과 모델로 1편 비용 견적. */
export function estimateShort(
  beatDurationsSec: number[],
  model: string,
  withTts: boolean,
): EstimateResult {
  const rate = (PER_SECOND_CREDITS as Record<string, number | undefined>)[model];
  const notes: string[] = [];
  const perClip = beatDurationsSec.map((d) => {
    if (rate === undefined) return null;
    return Math.round(d * rate * 100) / 100;
  });
  let clipsTotal: number | null = null;
  if (rate !== undefined) {
    clipsTotal = Math.round(perClip.reduce<number>((a, c) => a + (c ?? 0), 0) * 100) / 100;
  } else {
    notes.push(`모델 '${model}' 단가 미실측 — get_cost 프리플라이트로 실측 후 추가할 것(추정 금지)`);
  }
  const ttsCredits = withTts ? TTS_CREDITS_PER_SCRIPT : 0;
  const grandTotal = clipsTotal === null ? null : Math.round((clipsTotal + ttsCredits) * 100) / 100;
  return { model, perClip, clipsTotal, ttsCredits, grandTotal, notes };
}
