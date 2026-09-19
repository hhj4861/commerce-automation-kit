/** Pure candidate export/report construction; all external lookup is injected. */
import type { BlogKeywordCandidate, BlogKeywordCandidates, CandidateSearchAd, CandidateSearchAdFailureCode,
  MonthlyMeasurementStatus } from '@cak/contracts';
import { SearchAdApiError, type KeywordToolRow } from '../adapters/searchad-client.js';
import { scoreBlog } from './analyzer.js';

export type HotCandidate = Omit<BlogKeywordCandidate, 'searchad'>;
export type HotStatus = Pick<BlogKeywordCandidates, 'compliance' | 'scope' | 'exclusionCounts'>;
const normalize = (s: string): string => s.replace(/\s+/g, '');
const NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
  'ECONNREFUSED', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT']);

export function searchAdFailureCode(error: unknown): CandidateSearchAdFailureCode {
  if (error instanceof SearchAdApiError) {
    if (error.status === 401) return 'http_unauthorized';
    if (error.status === 403) return 'http_forbidden';
    if (error.status === 429) return 'rate_limited';
    return error.status >= 500 ? 'http_server' : 'http_client';
  }
  if (error instanceof Error && error.name === 'ZodError') return 'schema_invalid';
  const code = (error as { code?: unknown; cause?: { code?: unknown } } | null)?.code
    ?? (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof code === 'string' && NETWORK_CODES.has(code) ? 'network' : 'unclassified';
}

function unavailable(attemptedAt: string, status: CandidateSearchAd['lookupStatus'],
  failureCode: CandidateSearchAdFailureCode | null = null): CandidateSearchAd {
  return { attemptedAt, measuredAt: null, lookupStatus: status, matchMode: 'whitespace_exact',
    matchedKeyword: null, monthlyPc: null, monthlyMobile: null, monthlyTotal: null,
    monthlyPcStatus: 'missing', monthlyMobileStatus: 'missing', monthlyTotalStatus: 'unavailable',
    advertisingCompetition: null, failureCode };
}

function device(value: number | null, status: MonthlyMeasurementStatus | undefined):
  { value: number | null; status: MonthlyMeasurementStatus } {
  if (status === 'measured' && Number.isSafeInteger(value) && value !== null && value >= 0) {
    return { value, status };
  }
  if (value === null && (status === 'masked' || status === 'missing' || status === 'invalid')) {
    return { value, status };
  }
  return { value: null, status: 'invalid' };
}

export async function measureCandidates(candidates: HotCandidate[],
  lookup: ((keyword: string) => Promise<KeywordToolRow[]>) | null,
  now: () => string = () => new Date().toISOString()): Promise<BlogKeywordCandidate[]> {
  const items: BlogKeywordCandidate[] = [];
  for (const candidate of candidates.slice(0, 80)) {
    const attemptedAt = now();
    let searchad: CandidateSearchAd;
    if (!lookup) searchad = unavailable(attemptedAt, 'not_configured', 'credentials_missing');
    else {
      try {
        const rows = await lookup(candidate.keyword);
        const exact = rows.filter((row) => normalize(row.relKeyword) === normalize(candidate.keyword));
        if (!exact.length) searchad = unavailable(attemptedAt, 'no_exact_match');
        else if (exact.length !== 1) searchad = unavailable(attemptedAt, 'failed', 'schema_invalid');
        else {
          const row = exact[0]!;
          const pc = device(row.monthlyPc, row.monthlyPcStatus);
          const mobile = device(row.monthlyMobile, row.monthlyMobileStatus);
          const total = pc.value !== null && mobile.value !== null ? pc.value + mobile.value : null;
          if (total !== null && !Number.isSafeInteger(total)) {
            searchad = unavailable(attemptedAt, 'failed', 'schema_invalid');
          } else {
            searchad = { attemptedAt, measuredAt: now(), lookupStatus: 'exact',
              matchMode: 'whitespace_exact', matchedKeyword: row.relKeyword,
              monthlyPc: pc.value, monthlyMobile: mobile.value, monthlyTotal: total,
              monthlyPcStatus: pc.status, monthlyMobileStatus: mobile.status,
              monthlyTotalStatus: total === null ? 'unavailable' : 'measured',
              advertisingCompetition: row.compIdx, failureCode: null };
          }
        }
      } catch (error) {
        searchad = unavailable(attemptedAt, 'failed', searchAdFailureCode(error));
      }
    }
    items.push({ ...candidate, searchad });
  }
  return items;
}

export function buildBlogKeywordCandidates(items: BlogKeywordCandidate[], status: HotStatus,
  generatedAt: string): BlogKeywordCandidates {
  const ttl = status.compliance.cacheTtlHours;
  const now = Date.parse(generatedAt);
  if (!Number.isFinite(now) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(generatedAt)
      || !Number.isInteger(ttl) || ttl <= 0 || ttl > 24) throw new Error('Invalid candidate export metadata');
  // Do not renew source age when serializing or reusing this report.
  const bounded = items.slice(0, 80).map((item) => ({ ...item,
    expiresAt: new Date(Math.min(Date.parse(item.expiresAt),
      Date.parse(item.capturedAt) + ttl * 3600000)).toISOString() }));
  if (bounded.some((item) => Date.parse(item.capturedAt) > now || Date.parse(item.expiresAt) <= now)) {
    throw new Error('Candidate snapshot expired during monthly lookup');
  }
  return { schemaVersion: 1, kind: 'cak_keyword_candidates', profile: 'blog-kr', generatedAt,
    expiresAt: new Date(bounded.length ? Math.min(...bounded.map((item) => Date.parse(item.expiresAt)))
      : now + ttl * 3600000).toISOString(),
    compliance: { resaleRestricted: true, cacheTtlHours: ttl },
    scope: { ...status.scope, exportedCount: bounded.length,
      truncatedCount: Math.max(0, status.scope.eligibleDailyCount - bounded.length) },
    exclusionCounts: { ...status.exclusionCounts }, items: bounded };
}

export const formatGrowth = (value: number | null): string => value === null
  ? '계산 불가(0 기준)' : `${value >= 0 ? '+' : ''}${Math.round(value)}%`;

export function renderCandidateReports(batch: BlogKeywordCandidates): { trend: string; blog: string } {
  const recommendations = batch.items.flatMap((item) => {
    const volume = item.searchad.monthlyTotal;
    const hot = item.trend.hotScore;
    if (item.searchad.lookupStatus !== 'exact' || item.searchad.monthlyTotalStatus !== 'measured'
        || volume === null || volume < 100 || hot === null) return [];
    const blog = scoreBlog({ monthlyPc: item.searchad.monthlyPc,
      monthlyMobile: item.searchad.monthlyMobile, compIdx: item.searchad.advertisingCompetition });
    const volumeScore = Math.min(100, Math.log10(Math.max(volume, 1)) / 5 * 100);
    return [{ item, volume, hot, recommendationScore: Math.round(hot * 0.5 + blog.blogScore * 0.5),
      trendScore: Math.round(hot * 0.7 + volumeScore * 0.3) }];
  });
  const latest = batch.items.reduce((max, item) => item.trend.latestPeriod > max ? item.trend.latestPeriod : max, '');
  const rising = recommendations.filter(({ item, volume, hot }) => volume >= 1000 && hot >= 20
    && item.trend.dayPct !== null && item.trend.dayPct > 0
    && item.trend.baselinePct !== null && item.trend.baselinePct > 0)
    .sort((a, b) => b.trendScore - a.trendScore || b.hot - a.hot || b.volume - a.volume).slice(0, 10);
  const blogTop = recommendations.sort((a, b) => b.recommendationScore - a.recommendationScore
    || b.hot - a.hot || b.volume - a.volume).slice(0, 10);
  const scope = `${batch.scope.requestedKeywordCount}개 시드 기준 · DataLab 최신 제공일 ${latest || '없음'}`;
  const trend = [`🔥 최신 트랜드 급상승 후보 Top ${rising.length} (${scope})`,
    '실제 전일값 필수 · 이전 7일 중 관측 5일 이상 평균 · 결측 0채움 없음 · 0 기준 증감률 미산출',
    '전일/7일평균 모두 상승 · hot 20+ · 급상승 70% + 검색량 30% · 정확 월검색 1,000+', ''];
  for (const [i, r] of rising.entries()) trend.push(`${i + 1}. ${r.item.keyword} · 보정 ${r.trendScore} · hot ${r.hot} · 월 ${r.volume.toLocaleString()} · 전일 ${formatGrowth(r.item.trend.dayPct)} · 7일평균 ${formatGrowth(r.item.trend.baselinePct)}`);
  if (!rising.length) trend.push('보정 조건을 충족한 키워드가 없습니다.');
  const blog = [`🔥 오늘의 블로그 추천 Top ${blogTop.length} (${scope})`,
    '급상승 50% + 월검색량·광고경쟁 지표 50% · 정확 월검색량 100 이상 · 광고경쟁은 SEO 난이도가 아님', ''];
  for (const [i, r] of blogTop.entries()) blog.push(`${i + 1}. ${r.item.keyword} · 추천 ${r.recommendationScore} · hot ${r.hot} · 월 ${r.volume.toLocaleString()}(일평균≈${Math.round(r.volume / 30.4).toLocaleString()}) · 전일 ${formatGrowth(r.item.trend.dayPct)} · 광고경쟁 ${r.item.searchad.advertisingCompetition ?? '-'}`);
  if (!blogTop.length) blog.push('추천 조건을 충족한 키워드가 없습니다.');
  const lookupCounts = { failed: 0, no_exact_match: 0, not_configured: 0, unavailable: 0, zeroBaseline: 0 };
  for (const item of batch.items) {
    if (item.searchad.lookupStatus !== 'exact') lookupCounts[item.searchad.lookupStatus] += 1;
    if (item.searchad.monthlyTotalStatus !== 'measured') lookupCounts.unavailable += 1;
    if (item.trend.hotScore === null) lookupCounts.zeroBaseline += 1;
  }
  const diagnostics = `상태: ${JSON.stringify({ excluded: batch.exclusionCounts, monthly: lookupCounts })}`;
  return { trend: [...trend, '', diagnostics].join('\n') + '\n',
    blog: [...blog, '', diagnostics].join('\n') + '\n' };
}
