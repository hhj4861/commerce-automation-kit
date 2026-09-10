/** Pure daily metrics. Only provider-declared daily snapshots can enter this view. */
const DAY = 86400000;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const dayTime = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
};
const timestamp = (value) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const json = (value) => typeof value === 'string' ? JSON.parse(value) : value;
const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
const pct = (from, to) => from === 0 ? null : ((to - from) / from) * 100;

function dailyMetrics(trend) {
  if (!trend || typeof trend !== 'object' || Array.isArray(trend)) return { excluded: 'invalidSeries' };
  if (trend.timeUnit == null) return { excluded: 'unknownTimeUnit' };
  if (trend.timeUnit === 'week' || trend.timeUnit === 'month') return { excluded: 'nonDaily' };
  if (trend.timeUnit !== 'date') return { excluded: 'invalidSeries' };
  const start = dayTime(trend.startDate), end = dayTime(trend.endDate);
  if (start === null || end === null || start > end || !Array.isArray(trend.series) || !trend.series.length) {
    return { excluded: 'invalidSeries' };
  }
  const byDay = new Map();
  for (const point of trend.series) {
    const period = point && dayTime(point.period);
    if (period == null || period < start || period > end || byDay.has(period)
        || typeof point.ratio !== 'number' || !Number.isFinite(point.ratio)
        || point.ratio < 0 || point.ratio > 100) return { excluded: 'invalidSeries' };
    byDay.set(period, point.ratio);
  }
  const latestDay = Math.max(...byDay.keys());
  // Missing observations are allowed only inside a fully requested seven-day window.
  if (start > latestDay - 7 * DAY) return { excluded: 'invalidSeries' };
  const previousDay = latestDay - DAY;
  if (!byDay.has(previousDay)) return { excluded: 'missingPreviousDay' };
  const observed = Array.from({ length: 7 }, (_, i) => latestDay - (i + 1) * DAY)
    .filter((day) => byDay.has(day)).map((day) => byDay.get(day));
  if (observed.length < 5) return { excluded: 'insufficientBaseline' };
  const latestRatio = byDay.get(latestDay), previousRatio = byDay.get(previousDay);
  const baselineMean = observed.reduce((a, b) => a + b, 0) / observed.length;
  const dayPct = pct(previousRatio, latestRatio), baselinePct = pct(baselineMean, latestRatio);
  if ((dayPct !== null && !Number.isFinite(dayPct))
      || (baselinePct !== null && !Number.isFinite(baselinePct))) return { excluded: 'invalidSeries' };
  // Intermediate means/percentages are not rounded. Undefined growth earns no score.
  const hotScore = dayPct === null || baselinePct === null ? null : Math.round(
    clamp(baselinePct, 0, 300) / 300 * 55 + clamp(dayPct, 0, 300) / 300 * 30
    + clamp(latestRatio, 0, 100) / 100 * 15);
  return { trend: {
    source: 'naver_datalab_search', timeUnit: 'date', timeUnitOrigin: 'provider_response',
    startDate: trend.startDate, endDate: trend.endDate,
    latestPeriod: dayKey(latestDay), previousPeriod: dayKey(previousDay),
    baselineStart: dayKey(latestDay - 7 * DAY), baselineEnd: dayKey(previousDay),
    latestRatio, previousRatio, baselineMean, expectedBaselineDays: 7,
    observedBaselineDays: observed.length, dayPct, baselinePct,
    dayPctStatus: dayPct === null ? 'zero_baseline' : 'measured',
    baselinePctStatus: baselinePct === null ? 'zero_baseline' : 'measured',
    hotScore, calculationVersion: 'daily_observed_v2',
  } };
}

function buildHotSnapshot(rows, requestedKeywords, nowIso) {
  const now = timestamp(nowIso);
  if (now === null) throw new Error('Invalid snapshot time');
  const requested = new Set(requestedKeywords);
  const scopedRows = rows.filter((row) => requested.has(row.keyword));
  const exclusionCounts = { expired: 0, unknownTimeUnit: 0, nonDaily: 0, invalidSeries: 0,
    missingPreviousDay: 0, insufficientBaseline: 0 };
  let rowsWithTrendData = 0, cacheTtlHours = 24;
  const eligible = [];
  for (const row of scopedRows) {
    try {
      const captured = timestamp(row.captured_at), expires = timestamp(row.expires_at);
      const compliance = json(row.compliance);
      const ttl = compliance?.cacheTtlHours;
      if (typeof row.keyword !== 'string' || !row.keyword.trim() || row.keyword.length > 100
          || captured === null || expires === null || captured > now || expires <= captured
          || !Number.isInteger(ttl) || ttl <= 0 || typeof compliance.resaleRestricted !== 'boolean') {
        exclusionCounts.invalidSeries += 1;
        continue;
      }
      const boundedExpiry = Math.min(expires, captured + Math.min(24, ttl) * 3600000);
      if (boundedExpiry <= now) { exclusionCounts.expired += 1; continue; }
      const trend = json(row.trend);
      if (Array.isArray(trend?.series) && trend.series.length) rowsWithTrendData += 1;
      const result = dailyMetrics(trend);
      if (result.excluded) { exclusionCounts[result.excluded] += 1; continue; }
      if (trend.endDate > new Date(captured + 9 * 3600000).toISOString().slice(0, 10)) {
        exclusionCounts.invalidSeries += 1;
        continue;
      }
      cacheTtlHours = Math.min(cacheTtlHours, ttl);
      eligible.push({ keyword: row.keyword, capturedAt: row.captured_at,
        expiresAt: new Date(boundedExpiry).toISOString(), trend: result.trend });
    } catch {
      exclusionCounts.invalidSeries += 1;
    }
  }
  const current = eligible.filter((item) => {
    if (Date.parse(item.capturedAt) + cacheTtlHours * 3600000 > now) return true;
    exclusionCounts.expired += 1;
    return false;
  });
  current.sort((a, b) => (b.trend.hotScore ?? -1) - (a.trend.hotScore ?? -1)
    || (b.trend.baselinePct ?? -Infinity) - (a.trend.baselinePct ?? -Infinity)
    || b.trend.latestRatio - a.trend.latestRatio || a.keyword.localeCompare(b.keyword, 'ko'));
  const candidates = current.slice(0, 80).map((item) => ({ ...item,
    expiresAt: new Date(Math.min(Date.parse(item.expiresAt),
      Date.parse(item.capturedAt) + cacheTtlHours * 3600000)).toISOString() }));
  return { candidates, status: {
    totalKeywords: scopedRows.length, rowsWithTrendData,
    unavailable: scopedRows.length > 0 && rowsWithTrendData === 0,
    compliance: { resaleRestricted: true, cacheTtlHours },
    scope: { seedSet: 'g2-seeds', requestedKeywordCount: requested.size,
      storedKeywordCount: scopedRows.length, eligibleDailyCount: current.length,
      exportedCount: candidates.length, truncatedCount: Math.max(0, current.length - candidates.length) },
    exclusionCounts,
  } };
}

module.exports = { dailyMetrics, buildHotSnapshot };
