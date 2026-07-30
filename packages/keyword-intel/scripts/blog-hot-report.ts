/**
 * GitHub Actions POC — 단기 급상승과 검색광고 절대수요·경쟁승산을 결합한 블로그 추천.
 * 추천점수 = hotScore 50% + blogScore 50%. 월검색량 100 미만은 작은 표본 급등을 줄이기 위해 제외.
 */
import { readFileSync, writeFileSync } from 'node:fs';
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
  trendScore: number;
  volumeScore: number;
}

const credentials = loadSearchAdCredentials();
if (!credentials) throw new Error('NAVER_AD_* 검색광고 자격증명이 필요합니다.');

const candidates = JSON.parse(readFileSync('hot-candidates.json', 'utf8')) as HotCandidate[];
const hotStatus = JSON.parse(readFileSync('hot-status.json', 'utf8')) as {
  totalKeywords: number;
  rowsWithTrendData: number;
  unavailable: boolean;
};
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
    const volumeScore = Math.min(100, (Math.log10(Math.max(blog.monthlyTotal, 1)) / 5) * 100);
    recommendations.push({
      ...candidate,
      ...blog,
      compIdx: exact.compIdx,
      recommendationScore: Math.round(candidate.hotScore * 0.5 + blog.blogScore * 0.5),
      trendScore: Math.round(candidate.hotScore * 0.7 + volumeScore * 0.3),
      volumeScore,
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

const signed = (n: number): string => `${n >= 0 ? '+' : ''}${Math.round(n)}%`;
const period = recommendations.reduce((max, r) => (r.period > max ? r.period : max), '');

const trendTop = recommendations
  .filter(
    (r) =>
      r.monthlyTotal >= 1_000 &&
      r.hotScore >= 20 &&
      r.dayPct > 0 &&
      r.baselinePct > 0,
  )
  .sort(
    (a, b) =>
      b.trendScore - a.trendScore ||
      b.hotScore - a.hotScore ||
      b.monthlyTotal - a.monthlyTotal,
  )
  .slice(0, 10);
const trendLines = [
  hotStatus.unavailable
    ? `⚠️ 최신 트랜드 산출 불가 (DataLab 수집 0/${hotStatus.totalKeywords})`
    : `🔥 최신 트랜드 급상승 후보 Top ${trendTop.length} (182개 기준 · DataLab 최신 제공일 ${period})`,
  '보정: 실제 전일값 필수 · 전일/7일평균 모두 상승 · hot 20+ · 급상승 70% + 검색량 신뢰도 30% · 월검색 1,000+',
  '',
];
trendTop.forEach((r, i) => {
  trendLines.push(
    `${i + 1}. ${r.keyword} · 보정 ${r.trendScore} · hot ${r.hotScore} · 월 ${r.monthlyTotal.toLocaleString()} · 전일 ${signed(r.dayPct)} · 7일평균 ${signed(r.baselinePct)}`,
  );
});
if (hotStatus.unavailable) {
  trendLines.push('Naver DataLab 데이터가 수집되지 않았습니다. API 쿼터·자격증명을 확인하고 다음 실행에서 재시도합니다.');
} else if (!trendTop.length) {
  trendLines.push('보정 조건을 충족한 키워드가 없습니다.');
}
writeFileSync('trend-hot-report.txt', trendLines.join('\n') + '\n');

recommendations.sort(
  (a, b) =>
    b.recommendationScore - a.recommendationScore ||
    b.hotScore - a.hotScore ||
    b.monthlyTotal - a.monthlyTotal,
);
const blogTop = recommendations.slice(0, 10);
const blogLines = [
  hotStatus.unavailable
    ? `⚠️ 오늘의 블로그 추천 산출 불가 (DataLab 수집 0/${hotStatus.totalKeywords})`
    : `🔥 오늘의 블로그 추천 Top ${blogTop.length} (DataLab 최신 제공일 ${period})`,
  '기준: 트랜드 급상승 50% + 월검색량·광고경쟁 승산 50% · 월검색량 100 이상',
  '',
];
blogTop.forEach((r, i) => {
  const dailyAverage = Math.round(r.monthlyTotal / 30.4);
  blogLines.push(
    `${i + 1}. ${r.keyword} · 추천 ${r.recommendationScore} · hot ${r.hotScore} · 월 ${r.monthlyTotal.toLocaleString()}(일평균≈${dailyAverage.toLocaleString()}) · 전일 ${signed(r.dayPct)} · 경쟁 ${r.compIdx ?? '-'}`,
  );
});
if (hotStatus.unavailable) {
  blogLines.push('Naver DataLab 데이터가 수집되지 않아 급상승 기반 추천을 만들지 않았습니다.');
} else if (!blogTop.length) {
  blogLines.push('추천 조건을 충족한 키워드가 없습니다.');
}
if (lookupFailures) blogLines.push('', `⚠️ 검색광고 조회 실패 ${lookupFailures}건`);
writeFileSync('blog-hot-report.txt', blogLines.join('\n') + '\n');
console.log(trendLines.join('\n'));
console.log('');
console.log(blogLines.join('\n'));
