/**
 * collectSignals E2E — 어댑터(네트워크)를 목킹하고 in-memory SQLite 를 주입해
 * Phase 1(G1) + Phase 2(예산 게이트·DLQ·영속화) 흐름을 검증한다.
 *
 * 핵심 불변식(G1/G2): 요청한 모든 키워드는 signals ∪ failures 로 설명 가능(silent drop 금지).
 * callsSpent 규약: "시도 시점" 계상, 재시도 포함 — 429/5xx/스키마불일치도 서버 쿼터를 소비한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// 어댑터 모듈을 목킹하되 NaverApiError/NaverSchemaError/NAVER_LIMITS 등 실제 export 는 유지한다.
vi.mock('../src/adapters/naver-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/adapters/naver-client.js')>();
  return { ...actual, searchShop: vi.fn(), searchTrend: vi.fn(), shoppingCategoryKeywords: vi.fn() };
});

import { collectSignals, isWholesaleUnreachable, type CollectDeps } from '../src/cli/collect.js';
import type { IntelBatch } from '@cak/contracts';
import {
  searchShop,
  searchTrend,
  shoppingCategoryKeywords,
  NaverApiError,
  NaverSchemaError,
  type ShopSearchResult,
  type DatalabResult,
  type ShoppingInsightResult,
} from '../src/adapters/naver-client.js';
import { openDb, type Db } from '../src/store/db.js';
import { topOpportunities } from '../src/store/signals.js';
import { dlqReport } from '../src/store/dlq.js';
import { BudgetLedger } from '../src/budget/ledger.js';

const shopOk = (total: number): ShopSearchResult => ({
  total,
  start: 1,
  display: 1,
  items: [
    {
      title: 't', link: '', image: '', lprice: '10000', hprice: '', mallName: 'M',
      productId: '1', productType: '1', brand: '브랜드', maker: '',
      category1: '', category2: '', category3: '', category4: '',
    },
  ],
});

const trendOk = (): DatalabResult => ({
  startDate: '2026-04-01',
  endDate: '2026-07-01',
  timeUnit: 'week',
  results: [
    {
      title: 'kw',
      keywords: ['kw'],
      data: [
        { period: '2026-06-01', ratio: 50 },
        { period: '2026-07-01', ratio: 80 },
      ],
    },
  ],
});

const shoppingOk = (): ShoppingInsightResult => ({
  startDate: '2026-04-01',
  endDate: '2026-07-01',
  timeUnit: 'week',
  results: [
    {
      title: 'kw',
      keyword: ['kw'], // ⚠️ 단수 keyword (쇼핑인사이트)
      data: [
        { period: '2026-06-01', ratio: 40 },
        { period: '2026-07-01', ratio: 95 },
      ],
    },
  ],
});

let db: Db;
/** 공통 주입: in-memory DB + 무대기 재시도. 예산은 테스트별로 재정의. */
const deps = (extra: Partial<CollectDeps> = {}): CollectDeps => ({
  db,
  retry: { sleep: async () => {} },
  ...extra,
});

beforeEach(() => {
  vi.mocked(searchShop).mockReset();
  vi.mocked(searchTrend).mockReset();
  vi.mocked(shoppingCategoryKeywords).mockReset();
  db = openDb(':memory:');
  process.env.NAVER_CLIENT_ID = 'test-id';
  process.env.NAVER_CLIENT_SECRET = 'test-secret';
  delete process.env.MAX_CONCURRENCY;
  delete process.env.DLQ_THRESHOLD;
  delete process.env.DLQ_COOLDOWN_HOURS;
  delete process.env.DAILY_CALL_BUDGET_SEARCH;
  delete process.env.DAILY_CALL_BUDGET_DATALAB;
});

describe('collectSignals — G1 기본 흐름', () => {
  it('키워드 3개 → 신호 3개, 실패 0, callsSpent 정확', async () => {
    vi.mocked(searchShop).mockResolvedValue(shopOk(1000));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());

    const batch = await collectSignals(['a', 'b', 'c'], deps());

    expect(batch.signals).toHaveLength(3);
    expect(batch.failures).toHaveLength(0);
    expect(batch.callsSpent.naver_search_shop).toBe(3);
    expect(batch.callsSpent.naver_datalab_search).toBe(3);
    for (const s of batch.signals) {
      expect(s.coverage.ok.naver_search_shop).toBe(true);
      expect(s.coverage.ok.naver_datalab_search).toBe(true);
      // D1-5(약관) 미확정 → 보수적 기본값이 계약에 실려 하위로 전파된다.
      expect(s.compliance.resaleRestricted).toBe(true);
    }
  });

  it('트렌드 429: 재시도 3회 전량 계상, 신호는 살고 사유 표면화', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(searchShop).mockResolvedValue(shopOk(500));
    vi.mocked(searchTrend).mockRejectedValue(new NaverApiError('datalab_search', 429, 'rate limit'));

    const batch = await collectSignals(['x'], deps());

    expect(batch.signals).toHaveLength(1);
    expect(batch.failures).toHaveLength(0);
    expect(batch.signals[0]!.coverage.ok.naver_datalab_search).toBe(false);
    expect(batch.signals[0]!.trend.latest).toBeNull();
    // 429 는 재시도 대상(초당 스로틀 가능성) → 3시도 전부 서버 쿼터 소비로 계상
    expect(batch.callsSpent.naver_datalab_search).toBe(3);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('DATALAB_UNAVAILABLE'));
    spy.mockRestore();
  });

  it('datalab 스키마 불일치: 재시도 무의미(1회), SCHEMA_MISMATCH 알람으로 구분 표면화', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(searchShop).mockResolvedValue(shopOk(500));
    vi.mocked(searchTrend).mockRejectedValue(
      new NaverSchemaError('datalab_search', 'results 필드 형식 변경'),
    );

    const batch = await collectSignals(['x'], deps());

    expect(batch.signals).toHaveLength(1);
    expect(batch.signals[0]!.coverage.ok.naver_datalab_search).toBe(false);
    expect(batch.callsSpent.naver_datalab_search).toBe(1); // 스키마 오류는 비재시도
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('DATALAB_SCHEMA_MISMATCH'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('SCHEMA_MISMATCH')); // 알림
    spy.mockRestore();
  });

  it('쇼핑 검색 500 실패: failures 기록 + 재시도 포함 시도 전량 계상', async () => {
    vi.mocked(searchShop).mockImplementation(async (_cred, kw) => {
      if (kw === 'bad') throw new NaverApiError('search_shop', 500, 'boom');
      return shopOk(200);
    });
    vi.mocked(searchTrend).mockResolvedValue(trendOk());

    const batch = await collectSignals(['good', 'bad'], deps());

    expect(batch.signals.map((s) => s.keyword)).toEqual(['good']);
    expect(batch.failures).toHaveLength(1);
    expect(batch.failures[0]!.keyword).toBe('bad');
    expect(batch.failures[0]!.reason).toContain('500');
    // good 1회 + bad 3회(5xx 재시도) = 4 — 실패 시도도 쿼터를 소비했다
    expect(batch.callsSpent.naver_search_shop).toBe(4);
  });

  it('빈 검색결과(total 0, items [])도 신호를 만든다 — 무명 키워드 경로', async () => {
    vi.mocked(searchShop).mockResolvedValue({ total: 0, start: 1, display: 0, items: [] });
    vi.mocked(searchTrend).mockResolvedValue(trendOk());

    const batch = await collectSignals(['무명신조어'], deps());

    expect(batch.signals).toHaveLength(1);
    const s = batch.signals[0]!;
    expect(s.competition.totalProducts).toBe(0);
    expect(s.competition.priceLow).toBeNull();
    expect(s.competition.brandedRatio).toBe(0);
    expect(s.scores.opportunity).toBeGreaterThanOrEqual(0);
    expect(s.scores.opportunity).toBeLessThanOrEqual(100);
  });

  it('G1 규모: 10키워드 성공/실패 혼합 → 전 키워드 signals ∪ failures 로 설명', async () => {
    const kws = Array.from({ length: 10 }, (_, i) => `kw${i}`);
    const bad = new Set(['kw3', 'kw7']);
    vi.mocked(searchShop).mockImplementation(async (_cred, kw) => {
      if (bad.has(kw)) throw new NaverApiError('search_shop', 500, 'boom');
      return shopOk(100);
    });
    vi.mocked(searchTrend).mockResolvedValue(trendOk());

    const batch = await collectSignals(kws, deps());

    expect(batch.signals.length + batch.failures.length).toBe(10); // 불변식
    expect(batch.signals).toHaveLength(8);
    expect(batch.failures.map((f) => f.keyword).sort()).toEqual(['kw3', 'kw7']);
    const accounted = new Set([
      ...batch.signals.map((s) => s.keyword),
      ...batch.failures.map((f) => f.keyword),
    ]);
    expect(accounted.size).toBe(10); // silent drop 없음
    expect(batch.callsSpent.naver_search_shop).toBe(8 + 2 * 3); // 성공 8 + 실패 2×3시도
  });

  it('MAX_CONCURRENCY 오설정은 크래시 대신 기본값 폴백 + 경고', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env.MAX_CONCURRENCY = 'abc';
    vi.mocked(searchShop).mockResolvedValue(shopOk(1));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());

    const batch = await collectSignals(['a'], deps());

    expect(batch.signals).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('MAX_CONCURRENCY'));
    spy.mockRestore();
  });
});

describe('collectSignals — G2: 예산 게이트·DLQ·영속화', () => {
  it('검색 예산 소진: 초과분은 failures(skippedByBudget)로 설명되고 실제 호출이 없다', async () => {
    vi.mocked(searchShop).mockResolvedValue(shopOk(100));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());
    const ledger = new BudgetLedger(db, { naver_search_shop: 1, naver_datalab_search: 0 });

    const batch = await collectSignals(['a', 'b', 'c'], deps({ ledger }));

    expect(batch.signals).toHaveLength(1);
    expect(batch.failures).toHaveLength(2);
    for (const f of batch.failures) {
      expect(f.reason).toContain('skippedByBudget: naver_search_shop');
    }
    expect(batch.callsSpent.naver_search_shop).toBe(1); // 게이트가 호출 자체를 막음
    expect(vi.mocked(searchShop)).toHaveBeenCalledTimes(1);
    // datalab 예산 0 → 신호는 살고 coverage.skippedByBudget 로 1급 기록
    expect(batch.signals[0]!.coverage.skippedByBudget).toEqual(['naver_datalab_search']);
    expect(batch.callsSpent.naver_datalab_search).toBe(0);
    expect(vi.mocked(searchTrend)).not.toHaveBeenCalled();
  });

  it('예산 소진 키워드는 DLQ 에 쌓이지 않는다 (키워드 잘못이 아님 — 내일 재수집 대상)', async () => {
    vi.mocked(searchShop).mockResolvedValue(shopOk(100));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());
    const ledger = new BudgetLedger(db, { naver_search_shop: 0, naver_datalab_search: 0 });

    await collectSignals(['a', 'b'], deps({ ledger }));

    expect(dlqReport(db, 1)).toHaveLength(0);
  });

  it('DLQ: 임계(3회) 연속 실패 키워드는 격리되고 failures 로 설명된다', async () => {
    vi.mocked(searchTrend).mockResolvedValue(trendOk());
    vi.mocked(searchShop).mockRejectedValue(new NaverApiError('search_shop', 400, 'invalid')); // 비재시도

    for (let i = 0; i < 3; i++) await collectSignals(['불량'], deps());
    expect(vi.mocked(searchShop)).toHaveBeenCalledTimes(3);

    const batch4 = await collectSignals(['불량'], deps());
    expect(batch4.failures).toHaveLength(1);
    expect(batch4.failures[0]!.reason).toContain('dlq_isolated');
    expect(vi.mocked(searchShop)).toHaveBeenCalledTimes(3); // 격리 → 추가 호출 없음(예산 보호)
    expect(dlqReport(db, 3)).toHaveLength(1);
  });

  it('DLQ: 성공하면 연속 실패가 리셋된다', async () => {
    vi.mocked(searchTrend).mockResolvedValue(trendOk());
    vi.mocked(searchShop).mockRejectedValueOnce(new NaverApiError('search_shop', 400, 'once'));
    await collectSignals(['복구'], deps()); // 1회 실패
    vi.mocked(searchShop).mockResolvedValue(shopOk(10));
    await collectSignals(['복구'], deps()); // 성공 → 리셋

    expect(dlqReport(db, 1)).toHaveLength(0);
  });

  it('G2 핵심: 여러 날 분할 수집 — day1 예산 소진분을 day2 에 재수집해 전량 커버, 원장은 일별 예산 이내', async () => {
    const t1 = new Date('2026-07-23T01:00:00Z'); // KST 2026-07-23
    const t2 = new Date('2026-07-24T01:00:00Z'); // KST 2026-07-24
    process.env.DAILY_CALL_BUDGET_SEARCH = '2';
    process.env.DAILY_CALL_BUDGET_DATALAB = '0';
    vi.mocked(searchShop).mockResolvedValue(shopOk(100));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());
    const kws = ['k1', 'k2', 'k3', 'k4'];

    const day1 = await collectSignals(kws, deps({ now: () => t1 }));
    expect(day1.signals).toHaveLength(2);
    const remaining = day1.failures
      .filter((f) => f.reason.includes('skippedByBudget: naver_search_shop'))
      .map((f) => f.keyword);
    expect(remaining).toHaveLength(2); // 소진분 전량이 재수집 대상으로 식별 가능

    const day2 = await collectSignals(remaining, deps({ now: () => t2 }));
    expect(day2.signals).toHaveLength(2);
    const union = new Set([...day1.signals, ...day2.signals].map((s) => s.keyword));
    expect(union.size).toBe(4); // 이틀 합집합이 전 키워드 커버

    const ledgerRows = db
      .prepare(`SELECT day, count FROM call_ledger WHERE source='naver_search_shop' ORDER BY day`)
      .all() as Array<{ day: string; count: number }>;
    expect(ledgerRows).toEqual([
      { day: '2026-07-23', count: 2 },
      { day: '2026-07-24', count: 2 },
    ]); // 어느 날도 예산 초과 없음
  });

  it('예산 경계 × 재시도: 잔여 2에서 429 연속 → 실호출 정확히 2회, 예산 초과 소모 없음', async () => {
    const ledger = new BudgetLedger(db, { naver_search_shop: 2, naver_datalab_search: 0 });
    vi.mocked(searchShop).mockRejectedValue(new NaverApiError('search_shop', 429, 'per-second'));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());

    const batch = await collectSignals(['경계'], deps({ ledger }));

    expect(vi.mocked(searchShop)).toHaveBeenCalledTimes(2); // 재시도도 매번 게이트 통과 필요
    expect(batch.callsSpent.naver_search_shop).toBe(2); // 예산과 정확히 일치(과소/과대 없음)
    expect(batch.failures).toHaveLength(1);
    // 3번째 시도가 게이트에서 차단 → 최종 사유는 skippedByBudget (의도 규약을 테스트로 고정)
    expect(batch.failures[0]!.reason).toContain('skippedByBudget');
    expect(dlqReport(db, 1)).toHaveLength(0); // BudgetExhausted 는 DLQ 미계상
  });

  it('BUDGET_80 알림: 80% 도달 시 정확히 1회만 발화(배치 dedupe)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ledger = new BudgetLedger(db, { naver_search_shop: 5, naver_datalab_search: 0 });
    vi.mocked(searchShop).mockResolvedValue(shopOk(10));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());

    await collectSignals(['a', 'b', 'c', 'd', 'e'], deps({ ledger }));

    const fired = spy.mock.calls.filter((c) => String(c[0]).includes('"kind":"BUDGET_80"'));
    expect(fired).toHaveLength(1); // 4번째(80%)에서 발화, 5번째(100%)는 dedupe
    spy.mockRestore();
  });

  it('signals 0건(전량 예산 스킵) 배치도 runs 감사 추적이 저장된다', async () => {
    const ledger = new BudgetLedger(db, { naver_search_shop: 0, naver_datalab_search: 0 });
    vi.mocked(searchShop).mockResolvedValue(shopOk(10));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());

    const b = await collectSignals(['a', 'b'], deps({ ledger }));

    const run = db.prepare('SELECT * FROM runs WHERE run_id = ?').get(b.runId) as
      | { requested_keywords: string; calls_spent: string }
      | undefined;
    expect(run).toBeTruthy();
    expect(JSON.parse(run!.requested_keywords)).toEqual(['a', 'b']);
    expect(JSON.parse(run!.calls_spent).naver_search_shop).toBe(0);
  });

  it('401 등 시스템 전역 오류는 DLQ 에 계상되지 않는다 — 복구 후 전체 격리 없음 + AUTH_401 알림', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(searchTrend).mockResolvedValue(trendOk());
    vi.mocked(searchShop).mockRejectedValue(new NaverApiError('search_shop', 401, 'unauthorized'));

    for (let i = 0; i < 3; i++) await collectSignals(['a', 'b'], deps());
    expect(dlqReport(db, 1)).toHaveLength(0); // 키워드 오귀속 없음
    expect(spy.mock.calls.some((c) => String(c[0]).includes('AUTH_401'))).toBe(true);

    // 자격 복구 → 즉시 정상 수집(격리 잔재 없음)
    vi.mocked(searchShop).mockResolvedValue(shopOk(10));
    const recovered = await collectSignals(['a', 'b'], deps());
    expect(recovered.signals).toHaveLength(2);
    spy.mockRestore();
  });

  it('DLQ 쿨다운 경과 후 자동 재시도 → 성공하면 격리 해제(자가 회복 경로)', async () => {
    const t0 = new Date('2026-07-23T00:00:00Z');
    vi.mocked(searchTrend).mockResolvedValue(trendOk());
    vi.mocked(searchShop).mockRejectedValue(new NaverApiError('search_shop', 400, 'bad query'));

    for (let i = 0; i < 3; i++) await collectSignals(['키워드'], deps({ now: () => t0 }));

    // 쿨다운(24h) 내 → 격리 유지
    const during = await collectSignals(['키워드'], deps({ now: () => new Date(t0.getTime() + 3600e3) }));
    expect(during.failures[0]!.reason).toContain('dlq_isolated');
    expect(vi.mocked(searchShop)).toHaveBeenCalledTimes(3);

    // 쿨다운 경과 + 원인 해소 → 재시도 성공 → DLQ 리셋
    vi.mocked(searchShop).mockResolvedValue(shopOk(10));
    const after = await collectSignals(['키워드'], deps({ now: () => new Date(t0.getTime() + 25 * 3600e3) }));
    expect(after.signals).toHaveLength(1);
    expect(dlqReport(db, 1)).toHaveLength(0);
  });

  it('DLQ_THRESHOLD env 반영 — 1이면 1회 실패(400) 후 즉시 격리', async () => {
    process.env.DLQ_THRESHOLD = '1';
    vi.mocked(searchTrend).mockResolvedValue(trendOk());
    vi.mocked(searchShop).mockRejectedValue(new NaverApiError('search_shop', 400, 'bad'));

    await collectSignals(['x'], deps());
    const second = await collectSignals(['x'], deps());

    expect(second.failures[0]!.reason).toContain('dlq_isolated');
    expect(vi.mocked(searchShop)).toHaveBeenCalledTimes(1);
  });

  it('일시적 네트워크 오류(ECONNRESET)는 백오프 재시도된다 — G2 실측 결함 회귀', async () => {
    const netErr = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    vi.mocked(searchShop).mockResolvedValue(shopOk(100));
    vi.mocked(searchTrend).mockRejectedValueOnce(netErr).mockResolvedValue(trendOk());

    const batch = await collectSignals(['순단'], deps());

    expect(batch.signals).toHaveLength(1);
    expect(batch.signals[0]!.coverage.ok.naver_datalab_search).toBe(true); // 재시도로 회복
    expect(batch.callsSpent.naver_datalab_search).toBe(2); // 실패 1 + 재시도 성공 1
  });

  // wake 직후 미준비 계열 코드 전부: 재시도 + 예산 환불(서버 미도달 = 쿼터 미소비). 2026-07-24 회귀.
  it.each(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT'])(
    '미도달 오류(%s)는 재시도되고 예산이 환불된다',
    async (code) => {
      const err = Object.assign(new Error(`connect ${code}`), { code });
      const ledger = new BudgetLedger(db, { naver_search_shop: 100, naver_datalab_search: 0 });
      vi.mocked(searchShop).mockRejectedValue(err);
      vi.mocked(searchTrend).mockResolvedValue(trendOk());

      const batch = await collectSignals(['a', 'b'], deps({ ledger }));

      expect(vi.mocked(searchShop)).toHaveBeenCalledTimes(6); // 2키워드 × 3시도(재시도됨)
      expect(batch.failures).toHaveLength(2);
      expect(batch.callsSpent.naver_search_shop).toBe(0); // 전량 환불 → 예산 증발 없음
      expect(ledger.spentToday('naver_search_shop')).toBe(0);
    },
  );

  it('ECONNRESET(연결 후 끊김)은 재시도하되 환불하지 않는다 — 서버 도달 가능성(보수적)', async () => {
    const resetErr = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    const ledger = new BudgetLedger(db, { naver_search_shop: 100, naver_datalab_search: 0 });
    vi.mocked(searchShop).mockRejectedValue(resetErr);
    vi.mocked(searchTrend).mockResolvedValue(trendOk());

    const batch = await collectSignals(['a'], deps({ ledger }));

    expect(batch.callsSpent.naver_search_shop).toBe(3); // 3시도 전부 계상 유지
    expect(ledger.spentToday('naver_search_shop')).toBe(3);
  });

  it('중복 키워드는 진입점에서 제거 — 예산 이중 소비·동률 스냅샷 방지', async () => {
    vi.mocked(searchShop).mockResolvedValue(shopOk(10));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());

    const b = await collectSignals(['루테인', '루테인', ' 루테인 '], deps());

    expect(b.requestedKeywords).toEqual(['루테인']);
    expect(b.signals).toHaveLength(1);
    expect(b.callsSpent.naver_search_shop).toBe(1);
  });

  it('배치가 store 에 영속화되고 analyze 조회(topOpportunities)로 나온다', async () => {
    vi.mocked(searchShop).mockResolvedValue(shopOk(1000));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());
    const t1 = new Date('2026-07-23T00:00:00Z');
    const t2 = new Date('2026-07-23T01:00:00Z');

    await collectSignals(['루테인'], deps({ now: () => t1 }));
    await collectSignals(['루테인'], deps({ now: () => t2 }));

    // 히스토리 축적(2행) + 조회는 최신 1행
    expect((db.prepare('SELECT COUNT(*) AS c FROM signals').get() as { c: number }).c).toBe(2);
    const rows = topOpportunities(db, 10, t2);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.keyword).toBe('루테인');
    expect(rows[0]!.capturedAt).toBe(t2.toISOString());
  });
});

describe('collectSignals — 쇼핑인사이트(D1-4) 배선', () => {
  it('cat_id resolver 가 있으면 shoppingTrend 수집 + coverage·callsSpent 반영 (키워드당 1그룹)', async () => {
    vi.mocked(searchShop).mockResolvedValue(shopOk(100));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());
    vi.mocked(shoppingCategoryKeywords).mockResolvedValue(shoppingOk());

    const b = await collectSignals(['크레아틴'], deps({ shoppingCategory: () => '50000002' }));

    const sig = b.signals[0]!;
    expect(sig.shoppingTrend?.category).toBe('50000002');
    expect(sig.shoppingTrend?.latest).toBe(95);
    expect(sig.coverage.sources).toContain('naver_datalab_shopping');
    expect(sig.coverage.ok.naver_datalab_shopping).toBe(true);
    expect(b.callsSpent.naver_datalab_shopping).toBe(1);
    // 요청은 키워드당 1그룹·param 1개 (analyzer results[0] 전제와 정합)
    expect(vi.mocked(shoppingCategoryKeywords).mock.calls[0]![1].keyword).toEqual([
      { name: '크레아틴', param: ['크레아틴'] },
    ]);
  });

  it('cat_id 미상(resolver null)이면 미수집 — 조용히 빠지지 않고 coverage 로 투명화', async () => {
    vi.mocked(searchShop).mockResolvedValue(shopOk(100));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());
    vi.mocked(shoppingCategoryKeywords).mockResolvedValue(shoppingOk());

    const b = await collectSignals(['밀크씨슬'], deps({ shoppingCategory: () => null }));

    const sig = b.signals[0]!;
    expect(sig.shoppingTrend).toBeUndefined();
    expect(sig.coverage.sources).not.toContain('naver_datalab_shopping');
    expect(sig.coverage.ok.naver_datalab_shopping).toBeUndefined();
    expect(b.callsSpent.naver_datalab_shopping).toBe(0);
    expect(vi.mocked(shoppingCategoryKeywords)).not.toHaveBeenCalled();
  });

  it('resolver 미지정이면 쇼핑인사이트 아예 미수집 (하위호환)', async () => {
    vi.mocked(searchShop).mockResolvedValue(shopOk(100));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());

    const b = await collectSignals(['루테인'], deps());

    expect(b.signals[0]!.shoppingTrend).toBeUndefined();
    expect(b.callsSpent.naver_datalab_shopping).toBe(0);
    expect(vi.mocked(shoppingCategoryKeywords)).not.toHaveBeenCalled();
  });

  it('쇼핑 예산 소진 → skippedByBudget + shoppingTrend latest null(시도는 기록)', async () => {
    vi.mocked(searchShop).mockResolvedValue(shopOk(100));
    vi.mocked(searchTrend).mockResolvedValue(trendOk());
    vi.mocked(shoppingCategoryKeywords).mockResolvedValue(shoppingOk());
    const ledger = new BudgetLedger(db, { naver_datalab_shopping: 0 }); // 쇼핑 예산 0

    const b = await collectSignals(['크레아틴'], deps({ ledger, shoppingCategory: () => '50000002' }));

    const sig = b.signals[0]!;
    expect(sig.coverage.skippedByBudget).toContain('naver_datalab_shopping');
    expect(sig.shoppingTrend?.latest).toBeNull(); // 블록은 존재(시도), 데이터 없음
    expect(sig.coverage.sources).not.toContain('naver_datalab_shopping'); // 성공 아님
    expect(vi.mocked(shoppingCategoryKeywords)).not.toHaveBeenCalled(); // 예산 게이트에서 막힘
  });
});

/**
 * isWholesaleUnreachable — 크론 자가 복구(스크립트 재시도)의 트리거 판정. 2026-07-24 회귀:
 * 09:37 예약 실행이 182건 전량 ENOTFOUND 로 죽었는데 CLI 가 exit 0 이라 스크립트가 재시도하지 못했다.
 * 이 판정이 true 일 때만 CLI 가 exit≠0 → 래퍼가 대기 후 재수집한다.
 */
describe('isWholesaleUnreachable — 전량 미도달 판정(크론 재시도 트리거)', () => {
  const batchWith = (
    signalCount: number,
    failures: Array<{ keyword: string; reason: string }>,
  ): IntelBatch => ({
    runId: 'r',
    requestedKeywords: failures.map((f) => f.keyword),
    signals: Array.from({ length: signalCount }, () => ({})) as unknown as IntelBatch['signals'],
    failures,
    callsSpent: { naver_search_shop: 0, naver_datalab_search: 0, naver_datalab_shopping: 0 },
    startedAt: 's',
    finishedAt: 'f',
  });

  it('신호 0 + 모든 실패가 [미도달코드] 태그 → true (wake 직후 DNS 전량 실패)', () => {
    const batch = batchWith(0, [
      { keyword: '루테인', reason: '[ENOTFOUND] getaddrinfo ENOTFOUND openapi.naver.com' },
      { keyword: '콜라겐', reason: '[ENOTFOUND] getaddrinfo ENOTFOUND openapi.naver.com' },
    ]);
    expect(isWholesaleUnreachable(batch)).toBe(true);
  });

  it('신호가 하나라도 있으면 → false (부분 성공은 정상 결과, 재시도 금지)', () => {
    const batch = batchWith(1, [{ keyword: '콜라겐', reason: '[ENOTFOUND] getaddrinfo ENOTFOUND openapi.naver.com' }]);
    expect(isWholesaleUnreachable(batch)).toBe(false);
  });

  it('예산 소진 전량 스킵 → false (재시도해도 회복 불가 — 미도달 아님)', () => {
    const batch = batchWith(0, [
      { keyword: '루테인', reason: 'skippedByBudget: naver_search_shop (일일 예산 소진)' },
      { keyword: '콜라겐', reason: 'skippedByBudget: naver_search_shop (일일 예산 소진)' },
    ]);
    expect(isWholesaleUnreachable(batch)).toBe(false);
  });

  it('미도달 + 키워드 귀속(400) 혼재 → false (스킵 아닌 실패 전부가 미도달이어야 함)', () => {
    const batch = batchWith(0, [
      { keyword: '루테인', reason: '[ENOTFOUND] getaddrinfo ENOTFOUND openapi.naver.com' },
      { keyword: '@@@', reason: '[naver:search_shop] HTTP 400 — 잘못된 쿼리' }, // code 없음 → 태그 없음
    ]);
    expect(isWholesaleUnreachable(batch)).toBe(false);
  });

  // 적대적 리뷰 회귀 ①: DLQ 격리 키워드가 섞여도 나머지 전량 미도달이면 자가복구해야 한다.
  // (스킵을 제외하지 않으면 격리 1건 때문에 ~180 키워드가 하루 통째로 유실됐다)
  it('미도달 다수 + DLQ 격리 1건 → true (스킵은 제외하고 판정)', () => {
    const batch = batchWith(0, [
      { keyword: '루테인', reason: '[ENOTFOUND] getaddrinfo ENOTFOUND openapi.naver.com' },
      { keyword: '콜라겐', reason: '[ENOTFOUND] getaddrinfo ENOTFOUND openapi.naver.com' },
      { keyword: '격리자', reason: 'dlq_isolated: 연속 3회 실패(...) — 쿨다운 후 자동 재시도' },
    ]);
    expect(isWholesaleUnreachable(batch)).toBe(true);
  });

  it('실패 0건(요청 없음/전량 성공) → false', () => {
    expect(isWholesaleUnreachable(batchWith(0, []))).toBe(false);
  });

  it('실제 collectSignals 전량 ENOTFOUND 배치도 true 로 판정된다(배치 shape 회귀)', async () => {
    const err = Object.assign(new Error('getaddrinfo ENOTFOUND openapi.naver.com'), { code: 'ENOTFOUND' });
    const ledger = new BudgetLedger(db, { naver_search_shop: 100, naver_datalab_search: 0 });
    vi.mocked(searchShop).mockRejectedValue(err);
    vi.mocked(searchTrend).mockResolvedValue(trendOk());

    const batch = await collectSignals(['a', 'b'], deps({ ledger }));

    expect(batch.signals).toHaveLength(0);
    expect(isWholesaleUnreachable(batch)).toBe(true);
  });

  // 적대적 리뷰 회귀 ②: undici 연결타임아웃은 message 에 코드가 없고 err.code 에만 있다
  // (message="Connect Timeout Error (...)"). reason 을 [코드] 로 태깅했으므로 이제 잡힌다.
  // 메시지 부분매칭이던 이전 구현은 이 전량 실패를 놓쳐 자가복구가 안 됐다.
  it('전량 UND_ERR_CONNECT_TIMEOUT(메시지에 코드 없음)도 true 로 판정된다', async () => {
    const err = Object.assign(
      new Error('Connect Timeout Error (attempted address: openapi.naver.com:443, timeout: 10000ms)'),
      { code: 'UND_ERR_CONNECT_TIMEOUT' },
    );
    const ledger = new BudgetLedger(db, { naver_search_shop: 100, naver_datalab_search: 0 });
    vi.mocked(searchShop).mockRejectedValue(err);
    vi.mocked(searchTrend).mockResolvedValue(trendOk());

    const batch = await collectSignals(['a', 'b'], deps({ ledger }));

    // 실제 collect 가 만든 reason 에 [코드] 태그가 붙어 있어야 판정이 성립한다.
    expect(batch.failures.every((f) => f.reason.includes('[UND_ERR_CONNECT_TIMEOUT]'))).toBe(true);
    expect(isWholesaleUnreachable(batch)).toBe(true);
  });
});
