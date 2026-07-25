import { describe, it, expect } from 'vitest';
import {
  summarizeCompetition,
  summarizeTrend,
  summarizeShoppingTrend,
  scoreOpportunity,
} from '../src/core/analyzer.js';
import type {
  ShopSearchResult,
  DatalabResult,
  ShoppingInsightResult,
} from '../src/adapters/naver-client.js';

const shopFixture: ShopSearchResult = {
  total: 12345,
  start: 1,
  display: 3,
  items: [
    { title: 'A', link: '', image: '', lprice: '19900', hprice: '', mallName: 'M1', productId: '1', productType: '1', brand: '브랜드', maker: '', category1: '', category2: '', category3: '', category4: '' },
    { title: 'B', link: '', image: '', lprice: '23000', hprice: '', mallName: 'M2', productId: '2', productType: '1', brand: '', maker: '제조', category1: '', category2: '', category3: '', category4: '' },
    { title: 'C', link: '', image: '', lprice: '15000', hprice: '', mallName: 'M1', productId: '3', productType: '1', brand: '', maker: '', category1: '', category2: '', category3: '', category4: '' },
  ],
};

describe('summarizeCompetition', () => {
  it('가격·판매자·브랜드 비율을 계산한다', () => {
    const c = summarizeCompetition(shopFixture);
    expect(c.totalProducts).toBe(12345);
    expect(c.priceLow).toBe(15000);
    expect(c.priceHigh).toBe(23000);
    expect(c.distinctSellers).toBe(2); // M1, M2
    expect(c.brandedRatio).toBeCloseTo(2 / 3); // 2개 항목에 brand/maker
  });
});

describe('summarizeTrend', () => {
  it('데이터 없으면 null 안전 처리', () => {
    const t = summarizeTrend(null);
    expect(t.latest).toBeNull();
    expect(t.series).toHaveLength(0);
  });

  it('시계열에서 latest와 momentum을 뽑는다', () => {
    const dl: DatalabResult = {
      startDate: '2026-04-01', endDate: '2026-07-01', timeUnit: 'week',
      results: [{ title: 'kw', keywords: ['kw'], data: [
        { period: '2026-04-01', ratio: 40 },
        { period: '2026-05-01', ratio: 50 },
        { period: '2026-06-01', ratio: 70 },
        { period: '2026-07-01', ratio: 90 },
      ] }],
    };
    const t = summarizeTrend(dl);
    expect(t.latest).toBe(90);
    expect(t.momentumPct).not.toBeNull();
    expect(t.momentumPct!).toBeGreaterThan(0); // 상승 추세
  });
});

describe('summarizeShoppingTrend', () => {
  it('데이터 없으면 null 안전 처리하되 category 스코프는 유지', () => {
    const s = summarizeShoppingTrend(null, '50000002');
    expect(s.category).toBe('50000002');
    expect(s.latest).toBeNull();
    expect(s.series).toHaveLength(0);
  });

  it('쇼핑 클릭 시계열에서 latest·momentum을 뽑고 category를 실어준다', () => {
    const si: ShoppingInsightResult = {
      startDate: '2026-04-01', endDate: '2026-07-01', timeUnit: 'week',
      results: [{ title: '크레아틴', keyword: ['크레아틴'], data: [
        { period: '2026-04-01', ratio: 30 },
        { period: '2026-05-01', ratio: 45 },
        { period: '2026-06-01', ratio: 80 },
        { period: '2026-07-01', ratio: 100 },
      ] }],
    };
    const s = summarizeShoppingTrend(si, '50000006');
    expect(s.category).toBe('50000006');
    expect(s.latest).toBe(100);
    expect(s.momentumPct!).toBeGreaterThan(0); // 상승
    expect(s.series).toHaveLength(4);
  });
});

describe('scoreOpportunity', () => {
  it('confidence는 v0 상한 0.7을 넘지 않는다', () => {
    const c = summarizeCompetition(shopFixture);
    const t = summarizeTrend(null);
    const s = scoreOpportunity(c, t);
    expect(s.confidence).toBeLessThanOrEqual(0.7);
    expect(s.opportunity).toBeGreaterThanOrEqual(0);
    expect(s.opportunity).toBeLessThanOrEqual(100);
  });
});
