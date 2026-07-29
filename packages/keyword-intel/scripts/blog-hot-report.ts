/**
 * GitHub Actions POC — 단기 급상승과 검색광고 절대수요·경쟁승산을 결합한 블로그 추천.
 * 추천점수 = hotScore 50% + blogScore 50%. 월검색량 100 미만은 작은 표본 급등을 줄이기 위해 제외.
 */
import { readFileSync } from 'node:fs';
import { keywordTool, loadSearchAdCredentials, SearchAdApiError } from '../src/adapters/searchad-client.js';
import { scoreBlog } from '../src/core/analyzer.js';
import { withRetry } from '../src/obs/retry.js';

interface HotCandidate {
  keyword: string;
  period: string;
  hotScore: number;
  dayPct: number;
  baselinePct: number;
}

interface Recommendation extends HotCandidate {
  blogScore: number;
  monthlyTotal: number;
  compIdx: 'low' | 'mid' | 'high' | null;
  recommendationScore: number;
}

const credentials = loadSearchAdCredentials();
if (!credentials) throw new Error('NAVER_AD_* 검색광고 자격증명이 필요합니다.');

const candidates = JSON.parse(readFileSync('hot-candidates.json', 'utf8')) as HotCandidate[];
const normalize = (s: string): string => s.replace(/\s+/g, '');
const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET'];
const codeOf = (e: unknown): string =>
  String(
    (e as { code?: string } | null)?.code ??
      (e as { cause?: { code?: string } } | null)?.cause?.code,
  );

const recommendations: Recommendation[] = [];
let lookupFailures = 0;
for (const candidate of candidates) {
  try {
    const rows = await withRetry(() => keywordTool(credentials, candidate.keyword), {
      maxAttempts: 4,
      baseDelayMs: 1500,
      shouldRetry: (e) =>
        (e instanceof SearchAdApiError && (e.rateLimited || e.status >= 500)) ||
        retryableCodes.includes(codeOf(e)),
    });
    const exact = rows.find((r) => normalize(r.relKeyword) === normalize(candidate.keyword));
    if (!exact) continue;
    const blog = scoreBlog(exact);
    if (blog.monthlyTotal < 100) continue;
    recommendations.push({
      ...candidate,
      ...blog,
      compIdx: exact.compIdx,
      recommendationScore: Math.round(candidate.hotScore * 0.5 + blog.blogScore * 0.5),
    });
  } catch {
    lookupFailures += 1;
  }
}

recommendations.sort(
  (a, b) =>
    b.recommendationScore - a.recommendationScore ||
    b.hotScore - a.hotScore ||
    b.monthlyTotal - a.monthlyTotal,
);

const top = recommendations.slice(0, 10);
const period = top.reduce((max, r) => (r.period > max ? r.period : max), '');
const signed = (n: number): string => `${n >= 0 ? '+' : ''}${Math.round(n)}%`;
const lines = [
  `🔥 오늘의 블로그 추천 Top ${top.length} (DataLab 최신 제공일 ${period})`,
  '기준: 트랜드 급상승 50% + 월검색량·광고경쟁 승산 50% · 월검색량 100 이상',
  '',
];
top.forEach((r, i) => {
  const dailyAverage = Math.round(r.monthlyTotal / 30.4);
  lines.push(
    `${i + 1}. ${r.keyword} · 추천 ${r.recommendationScore} · hot ${r.hotScore} · 월 ${r.monthlyTotal.toLocaleString()}(일평균≈${dailyAverage.toLocaleString()}) · 전일 ${signed(r.dayPct)} · 경쟁 ${r.compIdx ?? '-'}`,
  );
});
if (!top.length) lines.push('추천 조건을 충족한 키워드가 없습니다.');
if (lookupFailures) lines.push('', `⚠️ 검색광고 조회 실패 ${lookupFailures}건`);
console.log(lines.join('\n'));
