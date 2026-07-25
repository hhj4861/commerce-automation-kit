/**
 * 블로그 export 빌더(§8) — 순수 함수 단위 테스트 + store 조회 통합.
 * wp-auto-blog 소비자가 읽는 정확한 계약(schemaVersion·compliance·items 키)을 고정한다.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { IntelBatch } from '@cak/contracts';
import { openDb, type Db } from '../src/store/db.js';
import { saveBatch, signalsForExport, type ExportRow } from '../src/store/signals.js';
import { buildBlogExport, resolveProfile, isBlogProfile } from '../src/cli/export.js';

const NOW = '2026-07-25T12:00:00.000Z';

function mkRow(keyword: string, opportunity: number, ttlHours = 24, resale = true): ExportRow {
  return {
    keyword,
    opportunity,
    confidence: 0.6,
    compliance: { resaleRestricted: resale, cacheTtlHours: ttlHours },
    capturedAt: '2026-07-25T00:00:00.000Z',
  };
}

describe('resolveProfile', () => {
  it('지원 프로파일을 통과시킨다', () => {
    expect(resolveProfile('blog-kr')).toBe('blog-kr');
    expect(resolveProfile('blog-global')).toBe('blog-global');
  });
  it('미지원 프로파일은 던진다(silent-drop 금지)', () => {
    expect(() => resolveProfile('ads-kr')).toThrow(/지원하지 않는/);
    expect(isBlogProfile('nope')).toBe(false);
  });
});

describe('buildBlogExport', () => {
  it('봉투에 schemaVersion·profile·generatedAt·compliance 필수 포함', () => {
    const exp = buildBlogExport([mkRow('루테인', 80)], { profile: 'blog-kr', now: NOW });
    expect(exp.schemaVersion).toBe(1);
    expect(exp.profile).toBe('blog-kr');
    expect(exp.generatedAt).toBe(NOW);
    expect(exp.compliance).toEqual({ resaleRestricted: true, cacheTtlHours: 24 });
  });

  it('item 은 소비자 규약대로 topic=keyword, keywords=[keyword], opportunity', () => {
    const exp = buildBlogExport([mkRow('밀크씨슬', 72)], { profile: 'blog-kr', now: NOW });
    expect(exp.items).toHaveLength(1);
    const it0 = exp.items[0]!;
    expect(it0.topic).toBe('밀크씨슬');
    expect(it0.keywords).toEqual(['밀크씨슬']);
    expect(it0.opportunity).toBe(72);
  });

  it('보수 모드: 질문 원문(source_questions) 미포함, 지어낸 monthly_search 없음', () => {
    const exp = buildBlogExport([mkRow('콜라겐', 60)], { profile: 'blog-kr', now: NOW });
    const it0 = exp.items[0]! as Record<string, unknown>;
    expect('source_questions' in it0).toBe(false);
    expect('monthly_search' in it0).toBe(false);
  });

  it('compliance 는 여러 신호 중 가장 엄격하게(최소 TTL, resaleRestricted OR)', () => {
    const exp = buildBlogExport(
      [mkRow('a', 90, 48, false), mkRow('b', 80, 12, true)],
      { profile: 'blog-kr', now: NOW },
    );
    expect(exp.compliance).toEqual({ resaleRestricted: true, cacheTtlHours: 12 });
  });

  it('신호가 없어도 유효한 봉투(items:[] + 보수 기본 compliance)', () => {
    const exp = buildBlogExport([], { profile: 'blog-global', now: NOW });
    expect(exp.items).toEqual([]);
    expect(exp.compliance).toEqual({ resaleRestricted: true, cacheTtlHours: 24 });
  });
});

describe('signalsForExport (store 통합)', () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(':memory:');
  });

  function seed(keyword: string, opportunity: number, capturedAt: string): IntelBatch {
    return {
      runId: `run-${keyword}`,
      requestedKeywords: [keyword],
      signals: [{
        keyword, capturedAt,
        competition: { totalProducts: 100, priceLow: 1000, priceHigh: 2000, priceMedian: 1500, distinctSellers: 5, brandedRatio: 0.5 },
        trend: { latest: null, momentumPct: null, series: [] },
        scores: { opportunity, confidence: 0.6 },
        coverage: { sources: ['naver_search_shop'], ok: { naver_search_shop: true }, skippedByBudget: [] },
        compliance: { resaleRestricted: true, cacheTtlHours: 24 },
      }],
      failures: [],
      callsSpent: { naver_search_shop: 1, naver_datalab_search: 0, naver_datalab_shopping: 0 },
      startedAt: capturedAt,
      finishedAt: capturedAt,
    };
  }

  it('키워드별 최신 1행을 opportunity 순으로, compliance 포함해 반환', () => {
    saveBatch(db, seed('루테인', 80, '2026-07-25T00:00:00.000Z'));
    saveBatch(db, seed('오메가3', 90, '2026-07-25T00:00:00.000Z'));
    const rows = signalsForExport(db, 10, new Date('2026-07-25T06:00:00.000Z'));
    expect(rows.map((r) => r.keyword)).toEqual(['오메가3', '루테인']);
    expect(rows[0]!.compliance).toEqual({ resaleRestricted: true, cacheTtlHours: 24 });
  });

  it('만료된 신호는 제외한다(약관 TTL)', () => {
    saveBatch(db, seed('만료', 99, '2026-07-20T00:00:00.000Z')); // 24h 훨씬 초과
    const rows = signalsForExport(db, 10, new Date('2026-07-25T06:00:00.000Z'));
    expect(rows).toHaveLength(0);
  });

  it('end-to-end: 저장 → 조회 → buildBlogExport 봉투', () => {
    saveBatch(db, seed('밀크씨슬', 70, '2026-07-25T00:00:00.000Z'));
    const rows = signalsForExport(db, 10, new Date('2026-07-25T06:00:00.000Z'));
    const exp = buildBlogExport(rows, { profile: 'blog-kr', now: NOW });
    expect(exp.schemaVersion).toBe(1);
    expect(exp.items[0]!.topic).toBe('밀크씨슬');
  });
});
