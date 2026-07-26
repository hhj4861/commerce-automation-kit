/**
 * 마진 시뮬레이션 — 큐텐재팬 수수료 구조(검증 완료)를 결정적으로 계산.
 *
 * 수치 출전 (platform-selection-2026-07-26.md, 원문 검증):
 * - 평시: 판매수수료 10%(뷰티, 카드수수료 포함) + 해외출하지 2% = 12%
 * - 메가와리: + 쿠폰 셀러부담 10% + 시스템 이용료 1% + 할인지원 0.5% = 23.5% (+광고 기본 4%)
 * - 부가세 환급: 일반과세자 + 적격증빙 전제, 매입가 × 10/110 (매입가의 "10%"가 아님)
 * - 환율·배송비는 호출 시점 실측값 주입 — 하드코딩 금지.
 *
 * ⚠️ 반품 전손·벌점·재고 폐기 리스크는 단건 마진에 미반영 — pass 문턱(기본 15%)이 그 완충이다.
 */
import type { MarginInput, MarginResult } from '@cak/contracts';

const NORMAL_FEE_PCT = 12;
const MEGAWARI_FEE_PCT = 23.5;
const DEFAULT_MEGAWARI_AD_PCT = 4;
const DEFAULT_FX_SPREAD_PCT = 1;
const DEFAULT_PASS_THRESHOLD_PCT = 15;

export function computeMargin(input: MarginInput): MarginResult {
  if (input.salePriceJpy <= 0) throw new Error('salePriceJpy must be > 0');
  if (input.wholesaleKrw < 0) throw new Error('wholesaleKrw must be >= 0');
  if (input.jpyToKrw <= 0) throw new Error('jpyToKrw must be > 0');
  if (input.scenario !== 'normal' && input.scenario !== 'megawari') {
    throw new Error(`scenario 는 normal|megawari: ${String(input.scenario)}`);
  }
  // 부호 실수 한 번이 게이트 pass 를 뒤집는 것을 막는다 (2026-07-26 리뷰 반영).
  if (input.qxpressJpy < 0) throw new Error('qxpressJpy must be >= 0');
  if (input.domesticShipKrw < 0) throw new Error('domesticShipKrw must be >= 0');
  if (input.adRatePct !== undefined && input.adRatePct < 0) throw new Error('adRatePct must be >= 0');
  if (input.fxSpreadPct !== undefined && input.fxSpreadPct < 0) throw new Error('fxSpreadPct must be >= 0');
  if (input.passThresholdPct !== undefined && input.passThresholdPct < 0) throw new Error('passThresholdPct must be >= 0');

  const adPct = input.adRatePct ?? (input.scenario === 'megawari' ? DEFAULT_MEGAWARI_AD_PCT : 0);
  const baseFeePct = input.scenario === 'megawari' ? MEGAWARI_FEE_PCT : NORMAL_FEE_PCT;
  const appliedFeePct = baseFeePct + adPct;

  const revenueKrw = input.salePriceJpy * input.jpyToKrw;
  const platformFeeKrw = (revenueKrw * appliedFeePct) / 100;
  const shippingKrw = input.qxpressJpy * input.jpyToKrw;
  const effectiveWholesale = input.vatRefund ? input.wholesaleKrw * (100 / 110) : input.wholesaleKrw;
  const cogsKrw = effectiveWholesale + input.domesticShipKrw;
  const fxCostKrw = (revenueKrw * (input.fxSpreadPct ?? DEFAULT_FX_SPREAD_PCT)) / 100;

  const netKrw = revenueKrw - platformFeeKrw - shippingKrw - cogsKrw - fxCostKrw;
  // 표시값과 판정 기준을 일치시킨다 — 소비자가 JSON 의 netMarginPct 로 재검산해도 모순이 없도록
  // 반올림 후 판정한다.
  const netMarginPct = round2((netKrw / revenueKrw) * 100);
  const passThresholdPct = input.passThresholdPct ?? DEFAULT_PASS_THRESHOLD_PCT;
  const pass = netMarginPct >= passThresholdPct;

  return {
    revenueKrw: round2(revenueKrw),
    platformFeeKrw: round2(platformFeeKrw),
    shippingKrw: round2(shippingKrw),
    cogsKrw: round2(cogsKrw),
    fxCostKrw: round2(fxCostKrw),
    netKrw: round2(netKrw),
    netMarginPct,
    pass,
    appliedFeePct: round2(appliedFeePct),
    passThresholdPct,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
