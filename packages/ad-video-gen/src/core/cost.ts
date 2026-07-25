/**
 * 비용 견적 — 실측 단가만 사용하는 순수 로직. I/O 없음.
 *
 * 단가표는 2026-07 힉스필드 get_cost 실측값이다. 표에 없는 조합은 절대 지어내지
 * 않고 credits:null 로 반환한다("생성 전 get_cost 프리플라이트 필수").
 * 검증점: seedance_2_0 1080p 5s=45cr·15s=135cr / marketing_studio_video 1080p 12s=120cr·15s=150cr / 720p 15s=75cr.
 */
import type { AdVideoModel, AdVideoResolution, AdVideoTier } from '@cak/contracts';

/** 4000 크레딧 팩 기준 1크레딧당 USD */
export const USD_PER_CREDIT = 0.0475;

/** VO(seed_audio) 1건당 실측 크레딧 (≈1.1cr) */
export const VO_CREDITS_PER_CALL = 1.1;

/** 이미지(nano_banana_pro 1k) 1장당 실측 크레딧 */
export const IMAGE_CREDITS_NANO_BANANA_1K = 2;

/** 실측 단가표: 모델→해상도→크레딧/초. 여기 없는 조합은 미실측이다. */
const CREDITS_PER_SEC: Partial<Record<AdVideoModel, Partial<Record<AdVideoResolution, number>>>> = {
  seedance_2_0: { '1080p': 9 }, // std, 오디오 포함
  marketing_studio_video: { '1080p': 10, '720p': 5 },
};

export interface CreditEstimate {
  credits: number | null;
  usd: number | null;
  note?: string;
}

export function estimateCredits(
  model: AdVideoModel,
  resolution: AdVideoResolution,
  durationSec: number,
): CreditEstimate {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { credits: null, usd: null, note: `durationSec=${durationSec} — 0 초과의 유한한 초 단위여야 한다` };
  }
  const perSec = CREDITS_PER_SEC[model]?.[resolution];
  if (perSec === undefined) {
    return {
      credits: null,
      usd: null,
      note: '단가 미실측 — 생성 전 get_cost 프리플라이트 필수',
    };
  }
  const credits = Math.round(perSec * durationSec * 100) / 100;
  const usd = Math.round(credits * USD_PER_CREDIT * 10000) / 10000;
  return {
    credits,
    usd,
    note: `환산 기준: 4000크레딧 팩 단가 1cr=$${USD_PER_CREDIT} (2026-07 실측 ${perSec}cr/초)`,
  };
}

export interface TierDefaults {
  model: AdVideoModel;
  resolution: AdVideoResolution;
  durationSec: number;
  rationale: string;
}

/** 티어별 기본 조합 — 비용 정책의 축(시안은 싸게, 송출급은 최종 1컷만) */
export function pickTierDefaults(tier: AdVideoTier): TierDefaults {
  switch (tier) {
    case 'draft':
      return {
        model: 'seedance_2_0_fast',
        resolution: '480p',
        durationSec: 5,
        rationale: '시안은 싸게 — 컨셉 확인용 저가 조합(단가 미실측이라 생성 전 get_cost 필수)',
      };
    case 'standard':
      return {
        model: 'seedance_2_0',
        resolution: '1080p',
        durationSec: 15,
        rationale: '확정본 표준 — 실측 단가 검증 조합(9cr/초, 15s=135cr), 오디오 포함',
      };
    case 'broadcast':
      return {
        model: 'veo3_1',
        resolution: '4k',
        durationSec: 15,
        rationale: 'TV 송출급 최종 1컷만 — 최고가 모델이라 확정 컨셉에만 사용(단가는 get_cost 프리플라이트)',
      };
  }
}
