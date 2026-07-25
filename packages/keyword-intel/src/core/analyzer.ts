/**
 * 분석 코어 — 네이버 원응답을 KeywordSignal 계약으로 변환하는 순수 로직.
 * 외부 I/O 없음(테스트 용이). 어댑터 응답을 인자로 받는다.
 *
 * 스코어 정의의 근거와 튜닝 이력은 docs/ARCHITECTURE.md §4 에 문서화한다.
 * 스코어는 "참고 지표"이며 매수/제조 결정의 자동 트리거로 쓰지 않는다.
 */
import type { KeywordSignal, RelativeIndex } from '@cak/contracts';
import type { ShopSearchResult, DatalabResult, ShoppingInsightResult } from '../adapters/naver-client.js';

const asRel = (n: number): RelativeIndex => n as RelativeIndex;

/** 쇼핑 검색 응답 → competition 블록 */
export function summarizeCompetition(shop: ShopSearchResult): KeywordSignal['competition'] {
  const prices = shop.items
    .map((i) => Number(i.lprice))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)]! : null;
  const sellers = new Set(shop.items.map((i) => i.mallName).filter(Boolean));
  const branded = shop.items.filter((i) => i.brand || i.maker).length;
  return {
    totalProducts: shop.total,
    priceLow: prices[0] ?? null,
    priceHigh: prices.at(-1) ?? null,
    priceMedian: median,
    distinctSellers: sellers.size,
    brandedRatio: shop.items.length ? branded / shop.items.length : 0,
  };
}

/** 데이터랩 응답(단일 그룹) → trend 블록 */
export function summarizeTrend(datalab: DatalabResult | null): KeywordSignal['trend'] {
  const series =
    datalab?.results[0]?.data.map((d) => ({ period: d.period, ratio: asRel(d.ratio) })) ?? [];
  if (series.length === 0) return { latest: null, momentumPct: null, series: [] };
  const latest = series.at(-1)!.ratio;
  // 최근 절반 평균 vs 직전 절반 평균으로 모멘텀 근사 (정의는 ARCHITECTURE §4)
  const half = Math.floor(series.length / 2);
  const momentumPct =
    half > 0
      ? pctChange(avg(series.slice(0, half).map((s) => s.ratio)), avg(series.slice(half).map((s) => s.ratio)))
      : null;
  return { latest, momentumPct, series };
}

/**
 * 쇼핑인사이트 응답(단일 그룹) → shoppingTrend 블록.
 * category 는 응답이 아니라 조회 스코프(요청 파라미터)라 인자로 받아 계약에 실어준다.
 * 모멘텀 정의는 summarizeTrend 와 동일(최근 절반 vs 직전 절반 평균).
 *
 * ⚠️ **results[0] 만** 읽는다 = 키워드당 1그룹 호출 전제. 배선 시 여러 키워드를 한 호출의
 *    다중 그룹(param 1개씩 최대 5)으로 배치하면 results[1..4] 가 조용히 유실된다(silent drop 금지 위반).
 *    → 호출부는 키워드당 1그룹으로 부르거나, 다중 그룹이면 요청·응답 그룹 수 불일치를 failures 로 표면화할 것.
 */
export function summarizeShoppingTrend(
  insight: ShoppingInsightResult | null,
  category: string,
): NonNullable<KeywordSignal['shoppingTrend']> {
  const series =
    insight?.results[0]?.data.map((d) => ({ period: d.period, ratio: asRel(d.ratio) })) ?? [];
  if (series.length === 0) return { category, latest: null, momentumPct: null, series: [] };
  const latest = series.at(-1)!.ratio;
  const half = Math.floor(series.length / 2);
  const momentumPct =
    half > 0
      ? pctChange(avg(series.slice(0, half).map((s) => s.ratio)), avg(series.slice(half).map((s) => s.ratio)))
      : null;
  return { category, latest, momentumPct, series };
}

/**
 * opportunity 스코어: "수요 있고 경쟁 덜한" 정도.
 * v0 정의(ARCHITECTURE §4에서 튜닝): 수요(trend.latest) 대비 경쟁(totalProducts, sellers) 역수 가중.
 * ⚠️ v0는 플레이스홀더다. 실측 데이터로 캘리브레이션 전까지 confidence 상한을 둔다.
 */
export function scoreOpportunity(
  competition: KeywordSignal['competition'],
  trend: KeywordSignal['trend'],
): KeywordSignal['scores'] {
  const demand = trend.latest ?? 0; // 0~100
  // 경쟁 밀도: 상품수 많을수록 붐빔 (log 스케일)
  const density = Math.log10(Math.max(competition.totalProducts, 1)); // 대략 0~7
  const competitionPenalty = Math.min(density / 7, 1) * 100; // 0~100
  const raw = demand * 0.6 + (100 - competitionPenalty) * 0.4;

  const hasTrend = trend.latest !== null;
  const hasComp = competition.totalProducts > 0;
  const confidence = (hasTrend ? 0.5 : 0) + (hasComp ? 0.3 : 0) + 0.2 /* v0 상한 */ * 1;

  return {
    opportunity: Math.round(clamp(raw, 0, 100)),
    confidence: Math.min(confidence, 0.7), // v0: 캘리브레이션 전까지 0.7 상한
  };
}

const avg = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pctChange = (from: number, to: number): number | null =>
  from === 0 ? null : ((to - from) / from) * 100;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
