import type { DramaCut, DramaFinding } from '@cak/contracts';

/** 같은 장소에서 전환(섬광·암전) 없이 이어지는 컷 — 앞 컷 마지막 프레임에서 시작해야 한다 */
export function chainsFrom(prev: DramaCut | undefined, cut: DramaCut): boolean {
  return !!prev && prev.locationId === cut.locationId && (cut.transitionIn ?? 'cut') === 'cut';
}

/** 2026-10-07 실측: 시작 프레임으로 이어 붙인 경계 0.53, 따로 생성한 경계 0.21~0.36 */
export const JOIN_MIN_SSIM = 0.45;

/** 이어져야 하는 컷 경계가 기준 미만이면 다음 컷을 차단한다. */
export function judgeJoin(prevCutId: string, cutId: string, ssim: number, min = JOIN_MIN_SSIM): DramaFinding | null {
  if (ssim >= min) return null;
  return { severity: 'block', cutId, message: `컷 경계가 이어지지 않음: ${prevCutId} 끝 → ${cutId} 시작 SSIM ${ssim.toFixed(2)} < ${min}` };
}
