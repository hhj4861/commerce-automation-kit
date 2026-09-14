/** 광고·쇼츠가 공유하는 품질 메타데이터. 실행/견적은 광고 원자 CLI가 담당한다. */
/** @type {Record<import('@cak/contracts').AdVideoTier, {model: import('@cak/contracts').AdVideoModel, resolution: import('@cak/contracts').AdVideoResolution, durationSec: number, rationale: string}>} */
export const VIDEO_QUALITY_PROFILES = {
  draft: { model: 'seedance_2_0_fast', resolution: '480p', durationSec: 5,
    rationale: 'TODO(D1): 기존 시안 조합은 현재 카탈로그 지원 미확인. 모델·파라미터·단가 확인 전 생성 금지.' },
  standard: { model: 'seedance_2_0', resolution: '1080p', durationSec: 15,
    rationale: '확정본 표준 — 2026-07 실측 참고 단가 9cr/초. 실제 비용은 생성 전 확인.' },
  broadcast: { model: 'veo3_1', resolution: '4k', durationSec: 15,
    rationale: 'TODO(D1): 기존 송출급 조합은 현재 카탈로그 quality/길이 스키마와 불일치. 파라미터·단가 확인 전 생성 금지.' },
};

/** 2026-09-14 공식 Higgsfield models_explore, Claude PID 48311 독립 조회. */
export const STANDARD_DURATION_LIMITS = { min: 4, max: 15 };

/** @param {import('@cak/contracts').AdVideoTier} tier @param {number} durationSec */
export function generationDuration(tier, durationSec) {
  return tier === 'standard' && Number.isFinite(durationSec) && durationSec > 0
    ? Math.max(STANDARD_DURATION_LIMITS.min, durationSec) : durationSec;
}
