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
const dayKey = (period, delta) => {
  const d = new Date(`${period}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
};

const ranked = [];
for (const row of rows) {
  const series = JSON.parse(row.trend).series || [];
  if (series.length < 3) continue;
  const latestPoint = series.at(-1);
  const byDay = new Map(series.map((p) => [p.period, Number(p.ratio)]));
  const previousDay = dayKey(latestPoint.period, -1);
  // 직전 관측값을 전일로 오인하지 않는다. 실제 전일 데이터가 없으면 후보에서 제외.
  if (!byDay.has(previousDay)) continue;
  const baselineDays = Array.from({ length: 7 }, (_, i) => dayKey(latestPoint.period, i - 7));
  const observedBaselineDays = baselineDays.filter((day) => byDay.has(day)).length;
  // 희소 시계열의 작은 표본 급등 방지. 최근 7일 중 최소 5일은 실제 관측돼야 한다.
  if (observedBaselineDays < 5) continue;
  const latest = Number(latestPoint.ratio);
  const previous = byDay.get(previousDay);
  // DataLab이 생략한 날은 달력상 0으로 채우되, 위 coverage gate를 먼저 통과해야 한다.
  const baseline = avg(baselineDays.map((day) => byDay.get(day) ?? 0));
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
    observedBaselineDays,
  });
}

ranked.sort((a, b) =>
  b.hotScore - a.hotScore ||
  b.baselinePct - a.baselinePct ||
  b.latest - a.latest ||
  a.keyword.localeCompare(b.keyword, 'ko')
);

// 후속 보정 단계가 급상승 후보에 절대 검색량을 결합한다.
// 원본 DataLab 응답이 아니라 POC 자체 산출 지표만 전달한다.
fs.writeFileSync('hot-candidates.json', JSON.stringify(ranked.slice(0, 80)));
console.log(`달력·관측일 보정 급상승 후보 생성: ${ranked.length}건`);
