/**
 * store 계층 — 마이그레이션, 히스토리 축적(G2 전제), 약관 TTL 집행, opportunity 조회.
 * 전부 in-memory SQLite. 실제 API/파일 불필요.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { isAbsolute } from 'node:path';
import type { IntelBatch, RelativeIndex } from '@cak/contracts';
import { openDb, resolveDbPath, type Db } from '../src/store/db.js';
import { saveBatch, purgeExpired, topOpportunities } from '../src/store/signals.js';
import { recordFailure, isolationInfo, dlqThresholdFromEnv } from '../src/store/dlq.js';

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
});

const T0 = '2026-07-23T00:00:00.000Z';
const T1 = '2026-07-23T01:00:00.000Z';

function mkBatch(opts: {
  runId: string;
  signals: Array<{
    keyword: string;
    opportunity: number;
    capturedAt: string;
    ttlHours?: number;
    confidence?: number;
    shoppingLatest?: number; // 지정 시 shoppingTrend 블록을 실어 round-trip 검증
  }>;
}): IntelBatch {
  return {
    runId: opts.runId,
    requestedKeywords: opts.signals.map((s) => s.keyword),
    signals: opts.signals.map((s) => ({
      keyword: s.keyword,
      capturedAt: s.capturedAt,
      competition: {
        totalProducts: 100, priceLow: 1000, priceHigh: 2000, priceMedian: 1500,
        distinctSellers: 5, brandedRatio: 0.5,
      },
      trend: { latest: null, momentumPct: null, series: [] },
      ...(s.shoppingLatest !== undefined
        ? {
            shoppingTrend: {
              category: '50000002',
              latest: s.shoppingLatest as RelativeIndex,
              momentumPct: null,
              series: [],
            },
          }
        : {}),
      scores: { opportunity: s.opportunity, confidence: s.confidence ?? 0.5 },
      coverage: { sources: ['naver_search_shop'], ok: { naver_search_shop: true }, skippedByBudget: [] },
      compliance: { resaleRestricted: true, cacheTtlHours: s.ttlHours ?? 24 },
    })),
    failures: [],
    callsSpent: {
      naver_search_shop: opts.signals.length,
      naver_datalab_search: 0,
      naver_datalab_shopping: 0,
    },
    startedAt: opts.signals[0]?.capturedAt ?? T0,
    finishedAt: opts.signals[0]?.capturedAt ?? T0,
  };
}

describe('store — 마이그레이션/영속화/TTL', () => {
  it('openDb(:memory:) 가 스키마를 생성한다', () => {
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    for (const t of ['runs', 'signals', 'call_ledger', 'dlq']) expect(names).toContain(t);
  });

  it('재실행 시 히스토리가 축적된다 (덮어쓰기 아님)', () => {
    saveBatch(db, mkBatch({ runId: 'r1', signals: [{ keyword: '루테인', opportunity: 60, capturedAt: T0 }] }));
    saveBatch(db, mkBatch({ runId: 'r2', signals: [{ keyword: '루테인', opportunity: 80, capturedAt: T1 }] }));
    expect((db.prepare('SELECT COUNT(*) AS c FROM signals').get() as { c: number }).c).toBe(2);
    expect((db.prepare('SELECT COUNT(*) AS c FROM runs').get() as { c: number }).c).toBe(2);
  });

  it('shoppingTrend(D1-4)가 저장→재로드로 유실되지 않는다 (마이그레이션 v4, silent drop 방지)', () => {
    saveBatch(
      db,
      mkBatch({
        runId: 'r1',
        signals: [
          { keyword: '레티놀 크림', opportunity: 70, capturedAt: T0, shoppingLatest: 88 },
          { keyword: '밀크씨슬', opportunity: 60, capturedAt: T0 }, // shoppingTrend 없음
        ],
      }),
    );
    const rows = topOpportunities(db, 10, new Date(T0));
    expect(rows.find((r) => r.keyword === '레티놀 크림')!.shoppingTrendLatest).toBe(88); // 복원
    expect(rows.find((r) => r.keyword === '밀크씨슬')!.shoppingTrendLatest).toBeNull(); // 미수집=null
    const raw = db
      .prepare(`SELECT shopping_trend FROM signals WHERE keyword='레티놀 크림'`)
      .get() as { shopping_trend: string };
    expect((JSON.parse(raw.shopping_trend) as { category: string }).category).toBe('50000002');
  });

  it('topOpportunities: 키워드별 최신 스냅샷만, opportunity 내림차순', () => {
    saveBatch(
      db,
      mkBatch({
        runId: 'r1',
        signals: [
          { keyword: 'A', opportunity: 60, capturedAt: T0 },
          { keyword: 'B', opportunity: 70, capturedAt: T0 },
        ],
      }),
    );
    saveBatch(db, mkBatch({ runId: 'r2', signals: [{ keyword: 'A', opportunity: 80, capturedAt: T1 }] }));

    const rows = topOpportunities(db, 10, new Date(T1));
    expect(rows.map((r) => r.keyword)).toEqual(['A', 'B']);
    expect(rows[0]!.opportunity).toBe(80); // 옛 스냅샷(60)이 아닌 최신
    expect(rows[0]!.totalProducts).toBe(100);
  });

  it('captured_at 동률이어도 키워드당 정확히 1행 (id tiebreak — 리뷰 확정 회귀)', () => {
    saveBatch(db, mkBatch({ runId: 'r1', signals: [{ keyword: 'A', opportunity: 60, capturedAt: T0 }] }));
    saveBatch(db, mkBatch({ runId: 'r2', signals: [{ keyword: 'A', opportunity: 80, capturedAt: T0 }] }));
    const rows = topOpportunities(db, 10, new Date(T0));
    expect(rows).toHaveLength(1); // 중복 행이 LIMIT 슬롯을 잠식하지 않는다
    expect(rows[0]!.opportunity).toBe(80); // 나중 삽입(id 큰 쪽)
  });

  it('LIMIT 이 실제로 잘리고, opportunity 동률은 confidence 내림차순', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      keyword: `k${String(i).padStart(2, '0')}`,
      opportunity: i,
      capturedAt: T0,
    }));
    saveBatch(db, mkBatch({ runId: 'r1', signals: many }));
    const top = topOpportunities(db, 20, new Date(T0));
    expect(top).toHaveLength(20);
    expect(top[0]!.opportunity).toBe(29);
    expect(top.at(-1)!.opportunity).toBe(10);

    saveBatch(
      db,
      mkBatch({
        runId: 'r2',
        signals: [
          { keyword: 'tieLo', opportunity: 100, capturedAt: T0, confidence: 0.1 },
          { keyword: 'tieHi', opportunity: 100, capturedAt: T0, confidence: 0.9 },
        ],
      }),
    );
    const tied = topOpportunities(db, 2, new Date(T0));
    expect(tied.map((r) => r.keyword)).toEqual(['tieHi', 'tieLo']);
  });

  it('약관 TTL 지난 캐시는 조회에서 빠지고 purge 로 물리 삭제된다', () => {
    saveBatch(
      db,
      mkBatch({ runId: 'r1', signals: [{ keyword: '만료', opportunity: 90, capturedAt: T0, ttlHours: 1 }] }),
    );
    const later = new Date(Date.parse(T0) + 2 * 3600_000);
    expect(topOpportunities(db, 10, later)).toHaveLength(0); // 조회 시점 필터
    expect(purgeExpired(db, later)).toBe(1); // 자동 무효화
    expect((db.prepare('SELECT COUNT(*) AS c FROM signals').get() as { c: number }).c).toBe(0);
  });
});

describe('resolveDbPath — 원장 분열 방지 (리뷰 확정 회귀)', () => {
  it('상대경로는 cwd 가 아닌 패키지 루트 기준으로 해석된다', () => {
    const p = resolveDbPath('./data/intel.db');
    expect(isAbsolute(p)).toBe(true);
    expect(p).toContain('keyword-intel'); // cwd 무관하게 패키지 아래 고정
    expect(resolveDbPath(':memory:')).toBe(':memory:');
    expect(resolveDbPath('/tmp/abs.db')).toBe('/tmp/abs.db'); // 절대경로는 그대로
  });
});

describe('dlq — 쿨다운·임계 env (리뷰 확정 회귀)', () => {
  it('isolationInfo: 쿨다운 내 격리, 경과 후 재시도 허용(자가 회복)', () => {
    const t0 = new Date('2026-07-23T00:00:00.000Z');
    for (let i = 0; i < 3; i++) recordFailure(db, 'x', 'bad', 'r', t0);
    expect(isolationInfo(db, 'x', 3, new Date(t0.getTime() + 3600e3), 24)).not.toBeNull();
    expect(isolationInfo(db, 'x', 3, new Date(t0.getTime() + 25 * 3600e3), 24)).toBeNull();
  });

  it('DLQ_THRESHOLD 오설정(0/abc/2.5)은 기본 3 폴백, 유효값은 반영', () => {
    for (const v of ['0', 'abc', '2.5']) {
      process.env.DLQ_THRESHOLD = v;
      expect(dlqThresholdFromEnv()).toBe(3);
    }
    process.env.DLQ_THRESHOLD = '5';
    expect(dlqThresholdFromEnv()).toBe(5);
    delete process.env.DLQ_THRESHOLD;
  });
});
