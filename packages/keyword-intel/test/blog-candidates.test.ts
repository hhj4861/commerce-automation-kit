import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { summarizeTrend, scoreOpportunity } from '../src/core/analyzer.js';
import { parseQc, SearchAdApiError, type KeywordToolRow } from '../src/adapters/searchad-client.js';
import { buildBlogKeywordCandidates, measureCandidates, renderCandidateReports,
  formatGrowth, searchAdFailureCode, type HotCandidate } from '../src/core/blog-candidates.js';

const require = createRequire(import.meta.url);
const { dailyMetrics, buildHotSnapshot } = require('../scripts/hot-candidate-metrics.cjs');
const NOW = '2026-09-10T01:00:00.000Z';
const CAPTURED = '2026-09-10T00:00:00.000Z';
const EXPIRES = '2026-09-11T00:00:00.000Z';
function trend(ratios = [20, 20, 20, 20, 20, 20, 20, 80]) {
  return { timeUnit: 'date', startDate: '2026-09-01', endDate: '2026-09-10',
    series: ratios.map((ratio, index) => ({ period: `2026-09-${String(index + 2).padStart(2, '0')}`, ratio })) };
}
function row(keyword = '루테인', value: unknown = trend(), extra = {}) {
  return { keyword, trend: JSON.stringify(value), captured_at: CAPTURED, expires_at: EXPIRES,
    compliance: JSON.stringify({ resaleRestricted: true, cacheTtlHours: 24 }), ...extra };
}
function snapshot(rows = [row()]) { return buildHotSnapshot(rows, rows.map((r) => r.keyword), NOW); }
function measurement(relKeyword = '루테인', extra: Partial<KeywordToolRow> = {}): KeywordToolRow {
  return { relKeyword, monthlyPc: 1000, monthlyMobile: 2000,
    monthlyPcStatus: 'measured', monthlyMobileStatus: 'measured', masked: false, compIdx: 'low', ...extra };
}

describe('daily observed metrics', () => {
  it('uses 5 observed days without filling the 2 missing days with zeros', () => {
    const input = trend(Array(8).fill(100));
    input.series.splice(1, 2);
    const actual = dailyMetrics(input).trend;
    expect(actual).toMatchObject({ observedBaselineDays: 5, baselineMean: 100,
      baselinePct: 0, dayPct: 0, hotScore: 15, baselineStart: '2026-09-02', baselineEnd: '2026-09-08' });
  });
  it('includes real observed zeros in the baseline', () => {
    const input = trend([0, 20, 20, 20, 20, 20, 20, 80]);
    input.series.splice(1, 2);
    expect(dailyMetrics(input).trend).toMatchObject({ observedBaselineDays: 5, baselineMean: 16,
      baselinePct: 400, dayPct: 300, hotScore: 97 });
  });
  it.each([0, 80])('keeps zero denominator growth null, even when latest is %s', (latest) => {
    expect(dailyMetrics(trend([0, 0, 0, 0, 0, 0, 0, latest])).trend).toMatchObject({
      dayPct: null, baselinePct: null, hotScore: null,
      dayPctStatus: 'zero_baseline', baselinePctStatus: 'zero_baseline' });
  });
  it('does not turn an undefined day change into a valid hot score', () => {
    expect(dailyMetrics(trend([20, 20, 20, 20, 20, 20, 0, 80])).trend).toMatchObject({
      dayPct: null, baselinePctStatus: 'measured', hotScore: null });
  });
  it('requires the actual prior calendar day', () => {
    const input = trend(); input.series.splice(6, 1);
    expect(dailyMetrics(input)).toEqual({ excluded: 'missingPreviousDay' });
  });
  it('requires 5 of the prior 7 calendar days', () => {
    const input = trend(); input.series.splice(0, 3);
    expect(dailyMetrics(input)).toEqual({ excluded: 'insufficientBaseline' });
  });
  it('requires the full seven-day baseline request window even when five observations exist', () => {
    const input = trend(); input.series.splice(0, 2);
    input.startDate = input.series[0]!.period;
    expect(dailyMetrics(input)).toEqual({ excluded: 'invalidSeries' });
    input.startDate = '2026-09-02';
    expect(dailyMetrics(input).trend).toMatchObject({ observedBaselineDays: 5, hotScore: 97 });
  });
  it('sorts valid dates rather than treating array order as chronology', () => {
    const input = trend(); input.series.reverse();
    expect(dailyMetrics(input).trend).toMatchObject({ latestPeriod: '2026-09-09', latestRatio: 80, hotScore: 97 });
  });
  it.each(['week', 'month'])('rejects %s samples even if they look like dates', (timeUnit) => {
    expect(dailyMetrics({ ...trend(), timeUnit })).toEqual({ excluded: 'nonDaily' });
  });
  it('does not label legacy metadata-less series with current environment settings', () => {
    expect(dailyMetrics({ series: trend().series })).toEqual({ excluded: 'unknownTimeUnit' });
  });
  it.each([null, NaN, Infinity, -1, 101, '20', Number.MIN_VALUE])('rejects invalid ratios or overflow (%s)', (ratio) => {
    const input = trend(); (input.series[6] as any).ratio = ratio;
    expect(dailyMetrics(input)).toEqual({ excluded: 'invalidSeries' });
  });
  it.each(['2026-02-30', '2026-9-08', '2026-08-31'])('rejects invalid/out-of-window day %s', (period) => {
    const input = trend(); input.series[6]!.period = period;
    expect(dailyMetrics(input)).toEqual({ excluded: 'invalidSeries' });
  });
  it('rejects duplicate calendar days and empty data', () => {
    const input = trend(); input.series.push(input.series[0]!);
    expect(dailyMetrics(input)).toEqual({ excluded: 'invalidSeries' });
    expect(dailyMetrics({ ...trend(), series: [] })).toEqual({ excluded: 'invalidSeries' });
  });
});

describe('snapshot provenance and limits', () => {
  it('reports every exclusion without reviving expired data', () => {
    const rows = [row('daily'), row('expired', trend(), { expires_at: '2026-09-10T00:30:00Z' }),
      row('legacy', { series: trend().series }), row('weekly', { ...trend(), timeUnit: 'week' }),
      row('broken', null), row('previous', { ...trend(), series: trend().series.filter((_, i) => i !== 6) }),
      row('sparse', { ...trend(), series: trend().series.slice(3) })];
    const result = snapshot(rows);
    expect(result.status.exclusionCounts).toEqual({ expired: 1, unknownTimeUnit: 1, nonDaily: 1,
      invalidSeries: 1, missingPreviousDay: 1, insufficientBaseline: 1 });
    expect(result.candidates).toHaveLength(1);
    expect(result.status.scope).toMatchObject({ storedKeywordCount: 7, eligibleDailyCount: 1, exportedCount: 1 });
  });
  it('rejects invalid JSON, future timestamps, and windows beyond capture date', () => {
    const cases = [row('a', trend(), { trend: '{' }),
      row('b', trend(), { captured_at: '2026-09-10T02:00:00Z' }),
      row('c', { ...trend(), endDate: '2026-09-11' }),
      row('d', trend(), { captured_at: '2026-09-10T00:00:00' })];
    expect(snapshot(cases).status.exclusionCounts.invalidSeries).toBe(4);
  });
  it('does not renew age from a later stored expiry or new export clock', () => {
    const result = snapshot([row('old', trend(), { captured_at: '2026-09-09T00:00:00Z',
      expires_at: '2026-09-12T00:00:00Z' })]);
    expect(result.candidates).toEqual([]);
    expect(result.status.exclusionCounts.expired).toBe(1);
  });
  it('limits the seed scope and exports at most 80 with truncation counts', () => {
    const rows = Array.from({ length: 83 }, (_, i) => row(`keyword${i}`));
    const result = buildHotSnapshot(rows, rows.slice(0, 82).map((r) => r.keyword), NOW);
    expect(result.candidates).toHaveLength(80);
    expect(result.status.scope).toMatchObject({ requestedKeywordCount: 82, storedKeywordCount: 82,
      eligibleDailyCount: 82, exportedCount: 80, truncatedCount: 2 });
  });
});

describe('strict monthly measurements and export', () => {
  it.each([0, 10, 12345, '0', '12345', '12,345'])('retains exact numeric input %s', (input) => {
    expect(parseQc(input)).toEqual({ value: Number(String(input).replace(/,/g, '')), status: 'measured' });
  });
  it.each(['<10', '< 10'])('keeps masking separate from real zero (%s)', (input) => {
    expect(parseQc(input)).toEqual({ value: null, status: 'masked' });
  });
  it.each([null, undefined, '', ' '])('keeps missing values null (%s)', (input) => {
    expect(parseQc(input)).toEqual({ value: null, status: 'missing' });
  });
  it.each(['N/A', '-12', '12.3', '<x', '<100', '1,23', false, {}, -1, 1.5, Infinity, NaN])('rejects malformed monthly input %s', (input) => {
    expect(parseQc(input)).toEqual({ value: null, status: 'invalid' });
  });
  it('joins whitespace only; never copies related-keyword or different-year volumes', async () => {
    const hot = snapshot([row('비타민 D'), row('2026 건강검진')]);
    const items = await measureCandidates(hot.candidates, async () => [measurement('비타민D'), measurement('2025 건강검진')], () => NOW);
    const matched = items.find((x) => x.keyword === '비타민 D')!;
    expect(matched.searchad).toMatchObject({ lookupStatus: 'exact', matchedKeyword: '비타민D', monthlyTotal: 3000 });
    const missing = items.find((x) => x.keyword === '2026 건강검진')!;
    expect(missing.searchad).toMatchObject({ lookupStatus: 'no_exact_match', monthlyTotal: null, measuredAt: null });
  });
  it('preserves masked/invalid/failed rows while excluding them from both rankings', async () => {
    const hot = snapshot([row('masked'), row('invalid'), row('failed'), row('exact')]);
    const items = await measureCandidates(hot.candidates, async (keyword) => {
      if (keyword === 'failed') throw new SearchAdApiError(401, 'secret-do-not-export');
      return [measurement(keyword, keyword === 'masked' ? { monthlyPc: null, monthlyPcStatus: 'masked', masked: true }
        : keyword === 'invalid' ? { monthlyPc: null, monthlyPcStatus: 'invalid' } : {})];
    }, () => NOW);
    const batch = buildBlogKeywordCandidates(items, hot.status, NOW);
    expect(batch.items).toHaveLength(4);
    expect(items.find((x) => x.keyword === 'masked')!.searchad).toMatchObject({ lookupStatus: 'exact',
      monthlyTotal: null, monthlyTotalStatus: 'unavailable', measuredAt: NOW });
    expect(items.find((x) => x.keyword === 'failed')!.searchad.failureCode).toBe('http_unauthorized');
    expect(JSON.stringify(batch)).not.toContain('secret-do-not-export');
    const reports = renderCandidateReports(batch);
    expect(reports.blog).toContain('Top 1'); expect(reports.trend).toContain('Top 1');
    expect(reports.blog).toContain('1. exact'); expect(reports.blog).not.toContain('1. masked');
  });
  it('keeps missing credentials and empty feeds explicit without lookup calls', async () => {
    const hot = snapshot();
    const items = await measureCandidates(hot.candidates, null, () => NOW);
    expect(items[0]!.searchad).toMatchObject({ lookupStatus: 'not_configured', failureCode: 'credentials_missing', monthlyTotal: null });
    const empty = buildBlogKeywordCandidates([], snapshot([]).status, NOW);
    expect(empty.items).toEqual([]); expect(empty.expiresAt).toBe('2026-09-11T01:00:00.000Z');
    expect(renderCandidateReports(empty).blog).toContain('Top 0');
  });
  it('caps monthly calls at 80 and preserves original item expiry', async () => {
    const input = Array.from({ length: 85 }, (_, i) => ({ ...snapshot().candidates[0], keyword: `k${i}` })) as HotCandidate[];
    const lookup = vi.fn(async (keyword: string) => [measurement(keyword)]);
    const items = await measureCandidates(input, lookup, () => NOW);
    expect(lookup).toHaveBeenCalledTimes(80);
    const status = snapshot().status; status.scope.eligibleDailyCount = 85;
    const batch = buildBlogKeywordCandidates(items, status, NOW);
    expect(batch.scope.truncatedCount).toBe(5); expect(batch.expiresAt).toBe(EXPIRES);
    expect(() => buildBlogKeywordCandidates(items, status, EXPIRES)).toThrow('expired');
  });
  it('keeps normal 100+ and rising 1000+ thresholds distinct, with null growth unranked', async () => {
    const hot = snapshot([row('normal'), row('rising'), row('tiny'), row('zero', trend(Array(8).fill(0)))]);
    const volumes: Record<string, number> = { normal: 100, rising: 1000, tiny: 99, zero: 5000 };
    const items = await measureCandidates(hot.candidates, async (keyword) => [measurement(keyword,
      { monthlyPc: 0, monthlyMobile: volumes[keyword]! })], () => NOW);
    const reports = renderCandidateReports(buildBlogKeywordCandidates(items, hot.status, NOW));
    expect(reports.blog).toContain('Top 2'); expect(reports.trend).toContain('Top 1');
    expect(formatGrowth(null)).toContain('계산 불가');
    expect(formatGrowth(0)).toBe('+0%');
  });
  it('uses only fixed failure classes', () => {
    expect(searchAdFailureCode({ code: 'ENOTFOUND', secret: 'private' })).toBe('network');
    expect(searchAdFailureCode(new Error('private'))).toBe('unclassified');
  });
});

it('preserves provider metadata through empty responses without changing opportunity', () => {
  const raw = { startDate: '2026-09-01', endDate: '2026-09-10', timeUnit: 'date' as const,
    results: [{ title: 'x', keywords: ['x'], data: trend().series }] };
  const before = { latest: 80 as any, momentumPct: 75, series: trend().series as any };
  const result = summarizeTrend(raw);
  expect(result).toMatchObject({ timeUnit: 'date', startDate: raw.startDate, endDate: raw.endDate, latest: 80 });
  const comp = { totalProducts: 100, priceLow: null, priceHigh: null, priceMedian: null, distinctSellers: 1, brandedRatio: 0 };
  expect(scoreOpportunity(comp, result)).toEqual(scoreOpportunity(comp, before));
  expect(summarizeTrend({ ...raw, results: [] })).toMatchObject({ timeUnit: 'date', latest: null, series: [] });
  expect(summarizeTrend(null)).toEqual({ latest: null, momentumPct: null, series: [] });
});

it('ships the production-shaped fixture without legacy opportunity replacement', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/blog-keyword-candidates.json', import.meta.url), 'utf8'));
  expect(fixture.kind).toBe('cak_keyword_candidates');
  expect(fixture.items[0].trend.hotScore).toBe(97);
  expect(fixture.items[0].searchad.monthlyTotal).toBe(3000);
  expect(fixture.items[0]).not.toHaveProperty('opportunity');
});
