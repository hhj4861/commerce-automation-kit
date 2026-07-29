#!/usr/bin/env node
/**
 * GitHub Actions POC — DataLab 일별 상대지수로 "오늘 급상승" 후보를 계산한다.
 * 절대 검색량이 아니라 키워드별 최근 흐름의 가속도다. 최신 제공일(오늘 데이터가 지연되면
 * 전일)을 명시해 실제 날짜보다 앞서 말하지 않는다.
 */
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || './data/poc-intel.db');
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const rows = db.prepare(`
  SELECT keyword, trend
  FROM (
    SELECT keyword, trend,
           ROW_NUMBER() OVER (PARTITION BY keyword ORDER BY captured_at DESC, id DESC) AS rn
    FROM signals
  )
  WHERE rn = 1
`).all();

const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const pct = (from, to) => from > 0 ? ((to - from) / from) * 100 : (to > 0 ? 300 : 0);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const signed = (n) => `${n >= 0 ? '+' : ''}${Math.round(n)}%`;

const ranked = [];
for (const row of rows) {
  const series = JSON.parse(row.trend).series || [];
  if (series.length < 3) continue;
  const latestPoint = series.at(-1);
  const prevPoint = series.at(-2);
  const baselinePoints = series.slice(-8, -1);
  const latest = Number(latestPoint.ratio);
  const previous = Number(prevPoint.ratio);
  const baseline = avg(baselinePoints.map((p) => Number(p.ratio)));
  const dayPct = pct(previous, latest);
  const baselinePct = pct(baseline, latest);
  // 급등률 55% + 전일 가속 30% + 현재 상대수준 15%. 하락은 가점하지 않는다.
  const hotScore = Math.round(
    clamp(baselinePct, 0, 300) / 300 * 55 +
    clamp(dayPct, 0, 300) / 300 * 30 +
    clamp(latest, 0, 100) / 100 * 15
  );
  ranked.push({
    keyword: row.keyword,
    period: latestPoint.period,
    latest,
    dayPct,
    baselinePct,
    hotScore,
  });
}

ranked.sort((a, b) =>
  b.hotScore - a.hotScore ||
  b.baselinePct - a.baselinePct ||
  b.latest - a.latest ||
  a.keyword.localeCompare(b.keyword, 'ko')
);

const top = ranked.slice(0, 10);
// 후속 "오늘의 블로그 추천" 단계가 급상승 후보 40개에 절대 검색량·경쟁도를 결합한다.
// 원본 DataLab 응답이 아니라 POC 자체 산출 지표만 전달한다.
fs.writeFileSync('hot-candidates.json', JSON.stringify(ranked.slice(0, 40)));
const latestPeriod = top.reduce((max, r) => r.period > max ? r.period : max, '');
const lines = [
  `🔥 오늘 트랜드 급상승 Top ${top.length} (DataLab 최신 제공일 ${latestPeriod})`,
  '기준: 최신일 vs 전일·이전 7일 평균 · 상대지수 기반(절대 검색량 아님)',
  '',
];
top.forEach((r, i) => {
  lines.push(
    `${i + 1}. ${r.keyword} · hot ${r.hotScore} · 지수 ${Math.round(r.latest)} · 전일 ${signed(r.dayPct)} · 7일평균 ${signed(r.baselinePct)}`
  );
});
if (!top.length) lines.push('계산 가능한 일별 시계열이 없습니다.');
console.log(lines.join('\n'));
