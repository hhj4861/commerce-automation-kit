/** Enrich at most 80 daily candidates; failed/masked measurements stay in the export. */
import { readFileSync, writeFileSync } from 'node:fs';
import { keywordTool, loadSearchAdCredentials, SearchAdApiError } from '../src/adapters/searchad-client.js';
import { withRetry } from '../src/obs/retry.js';
import { buildBlogKeywordCandidates, measureCandidates, renderCandidateReports,
  type HotCandidate, type HotStatus } from '../src/core/blog-candidates.js';

const candidates = JSON.parse(readFileSync('hot-candidates.json', 'utf8')) as HotCandidate[];
const status = JSON.parse(readFileSync('hot-status.json', 'utf8')) as HotStatus;
const credentials = loadSearchAdCredentials();
const retryableCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN',
  'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT']);
const codeOf = (e: unknown): unknown => (e as { code?: unknown } | null)?.code
  ?? (e as { cause?: { code?: unknown } } | null)?.cause?.code;
const lookup = credentials ? (keyword: string) => withRetry(() => keywordTool(credentials, keyword), {
  maxAttempts: 4, baseDelayMs: 1500,
  shouldRetry: (e) => (e instanceof SearchAdApiError && (e.rateLimited || e.status >= 500))
    || (typeof codeOf(e) === 'string' && retryableCodes.has(codeOf(e) as string)),
}) : null;
const items = await measureCandidates(candidates, lookup);
const batch = buildBlogKeywordCandidates(items, status, new Date().toISOString());
writeFileSync('blog-keyword-candidates.json', JSON.stringify(batch, null, 2) + '\n');
const reports = renderCandidateReports(batch);
writeFileSync('trend-hot-report.txt', reports.trend);
writeFileSync('blog-hot-report.txt', reports.blog);
console.log(reports.trend);
console.log(reports.blog);
