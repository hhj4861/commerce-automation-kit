/** Internal candidate measurements; not a publishing decision or an opportunity score. */
export type MonthlyMeasurementStatus = 'measured' | 'masked' | 'missing' | 'invalid';
export type CandidateSearchAdFailureCode = 'credentials_missing' | 'http_unauthorized'
  | 'http_forbidden' | 'rate_limited' | 'http_server' | 'http_client' | 'network'
  | 'schema_invalid' | 'unclassified';

export interface DailyCandidateTrend {
  source: 'naver_datalab_search';
  timeUnit: 'date';
  timeUnitOrigin: 'provider_response';
  startDate: string;
  endDate: string;
  latestPeriod: string;
  previousPeriod: string;
  baselineStart: string;
  baselineEnd: string;
  latestRatio: number;
  previousRatio: number;
  baselineMean: number;
  expectedBaselineDays: 7;
  observedBaselineDays: number;
  dayPct: number | null;
  baselinePct: number | null;
  dayPctStatus: 'measured' | 'zero_baseline';
  baselinePctStatus: 'measured' | 'zero_baseline';
  hotScore: number | null;
  calculationVersion: 'daily_observed_v2';
}

export interface CandidateSearchAd {
  attemptedAt: string;
  measuredAt: string | null;
  lookupStatus: 'exact' | 'no_exact_match' | 'failed' | 'not_configured';
  matchMode: 'whitespace_exact';
  matchedKeyword: string | null;
  monthlyPc: number | null;
  monthlyMobile: number | null;
  monthlyTotal: number | null;
  monthlyPcStatus: MonthlyMeasurementStatus;
  monthlyMobileStatus: MonthlyMeasurementStatus;
  monthlyTotalStatus: 'measured' | 'unavailable';
  advertisingCompetition: 'low' | 'mid' | 'high' | null;
  /** Fixed error category only, never provider output or credentials. */
  failureCode: CandidateSearchAdFailureCode | null;
}

export interface BlogKeywordCandidate {
  keyword: string;
  capturedAt: string;
  expiresAt: string;
  trend: DailyCandidateTrend;
  searchad: CandidateSearchAd;
}

export interface BlogKeywordCandidates {
  schemaVersion: 1;
  kind: 'cak_keyword_candidates';
  profile: 'blog-kr';
  generatedAt: string;
  expiresAt: string;
  compliance: { resaleRestricted: true; cacheTtlHours: number };
  scope: {
    seedSet: 'g2-seeds';
    requestedKeywordCount: number;
    storedKeywordCount: number;
    eligibleDailyCount: number;
    exportedCount: number;
    truncatedCount: number;
  };
  exclusionCounts: {
    expired: number;
    unknownTimeUnit: number;
    nonDaily: number;
    invalidSeries: number;
    missingPreviousDay: number;
    insufficientBaseline: number;
  };
  /** At most 80; empty and unsuccessful monthly lookups remain explicit. */
  items: BlogKeywordCandidate[];
}
