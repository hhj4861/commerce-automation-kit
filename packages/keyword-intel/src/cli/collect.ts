/**
 * collectSignals — 이 모듈의 핵심 유스케이스(라이브러리 진입점).
 * 조합 시 다른 모듈은 이 함수 하나만 호출한다.
 *
 * Phase 2 규약:
 *  - 예산 게이트(budget/)는 API 호출 "직전" 원자적으로 확인·계상한다. 한도 우회 없음(LEGAL-BOUNDARY 경계 4).
 *  - 예산 소진은 예외가 아니라 1급 결과다: shop 소진 → failures(사유 명시),
 *    trend 소진 → coverage.skippedByBudget. 어떤 키워드도 조용히 누락되지 않는다(G2).
 *  - callsSpent 는 "시도 시점" 계상(재시도 포함) — 429/5xx/스키마불일치도 서버 쿼터를 소비한다.
 *  - 반복 실패 키워드(DLQ ≥ 임계)는 격리하되 failures 로 설명한다.
 *  - 배치 결과는 store(SQLite)에 영속화되고, 약관 TTL 지난 캐시는 자동 무효화된다.
 */
import pLimit from 'p-limit';
import type { IntelBatch, KeywordSignal, IntelSource } from '@cak/contracts';
import {
  searchShop,
  searchTrend,
  shoppingCategoryKeywords,
  NaverApiError,
  NaverSchemaError,
  type NaverCredentials,
  type ShoppingInsightResult,
} from '../adapters/naver-client.js';
import {
  summarizeCompetition,
  summarizeTrend,
  summarizeShoppingTrend,
  scoreOpportunity,
} from '../core/analyzer.js';
import { openDb, type Db } from '../store/db.js';
import { saveBatch, purgeExpired } from '../store/signals.js';
import { recordFailure, clearFailure, isolationInfo, dlqThresholdFromEnv } from '../store/dlq.js';
import { BudgetLedger } from '../budget/ledger.js';
import { createLogger, type Logger } from '../obs/logger.js';
import { withRetry, type RetryOpts } from '../obs/retry.js';
import { createAlerter } from '../obs/alerts.js';

/**
 * 서버에 **도달하지 못한** 오류 — 연결 자체가 성립 안 됨 → 네이버 쿼터 미소비 → 예산 환불 대상.
 * (실측: launchd 가 머신 wake 직후 실행돼 DNS 미준비 상태에서 182건 전량 ENOTFOUND)
 *
 * export: CLI(cli/index.ts)가 "배치 전량이 미도달로 실패했는가"를 판정해 exit code 를 내리는 데
 * 재사용한다(코드 집합 단일 소스 — 두 곳이 어긋나지 않게).
 */
export const UNREACHABLE_NET_CODES = new Set([
  'ENOTFOUND', // DNS 해석 실패
  'EAI_AGAIN', // DNS 일시 실패
  'ECONNREFUSED', // TCP 거부(연결 성립 전)
  'UND_ERR_CONNECT_TIMEOUT', // 연결 수립 타임아웃
  'EHOSTUNREACH', // no route to host — wake 직후 라우팅 미준비(ENOTFOUND 의 형제)
  'ENETUNREACH', // network unreachable — 위와 동일 부류
]);

/** 재시도해도 회복 불가한 "스킵"(시도조차 안 한 실패) — 미도달 판정에서 제외한다. */
const SKIP_REASON_PREFIXES = ['skippedByBudget:', 'dlq_isolated:'];

/**
 * 배치 전체가 "서버 미도달"로 실패했는가 — 신호 0 · (예산·DLQ 스킵 제외한) 시도 실패가 전부 미도달.
 * true 면 재시도가 의미 있는 일시적 장애(wake 직후 DNS·네트워크 미준비)이므로 CLI 가 전용
 * 종료코드로 끝나 크론 래퍼의 자가 복구를 유발한다.
 *
 * 판정은 실패 reason 에 구조적으로 박힌 `[코드]` 태그로 한다(사람 메시지 부분매칭 아님).
 * 이유: undici 연결타임아웃(UND_ERR_CONNECT_TIMEOUT)은 message 에 코드 문자열이 없고 err.code
 * 에만 있어, 메시지 부분매칭이면 놓쳐 자가복구가 안 된다(적대적 리뷰 확정). 태그는 환불 경로
 * (spend 의 netCode=err.code)와 동일한 소스를 읽어 두 판정이 어긋나지 않게 한다.
 * 스킵(예산·DLQ)은 제외 — 하나 섞였다고 나머지 전량 미도달의 자가복구를 막지 않는다.
 * 신호>0(부분 성공)이거나 시도 실패가 하나라도 비(非)미도달이면 false.
 */
export function isWholesaleUnreachable(batch: IntelBatch): boolean {
  if (batch.signals.length > 0) return false;
  const attempts = batch.failures.filter(
    (f) => !SKIP_REASON_PREFIXES.some((p) => f.reason.startsWith(p)),
  );
  if (attempts.length === 0) return false; // 전량 스킵(예산·DLQ) — 재시도 무의미
  const codes = [...UNREACHABLE_NET_CODES];
  return attempts.every((f) => codes.some((c) => f.reason.includes(`[${c}]`)));
}

/**
 * 일시적 네트워크 오류 코드 — 백오프 재시도 대상(실측: datalab ECONNRESET·wake 직후 ENOTFOUND).
 * 미도달 코드도 포함한다(네트워크가 곧 준비될 수 있으므로).
 */
const TRANSIENT_NET_CODES = new Set([
  ...UNREACHABLE_NET_CODES,
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
  'UND_ERR_SOCKET',
  // 타임아웃도 재시도 대상(요청은 도달했으므로 환불은 하지 않는다).
  // 누락 시 타임아웃이 즉시 실패 처리돼 트렌드가 대량 결측된다(실측 2026-07-24: 24건).
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
]);

/** 오류에서 네트워크 코드 추출(undici 는 cause 에 싣기도 한다). */
function netCode(err: unknown): string | undefined {
  return (
    (err as { code?: string } | null)?.code ??
    (err as { cause?: { code?: string } } | null)?.cause?.code
  );
}

/** 예산 소진을 일반 오류와 구분하기 위한 내부 신호. */
class BudgetExhausted extends Error {
  constructor(public readonly source: IntelSource) {
    super(`skippedByBudget: ${source} (일일 예산 소진)`);
    this.name = 'BudgetExhausted';
  }
}

/** 테스트/조합 시 주입 지점. 미지정 시 env 기반 기본 구성(.env 참조)으로 동작한다. */
export interface CollectDeps {
  db?: Db;
  ledger?: BudgetLedger;
  logger?: Logger;
  now?: () => Date;
  /** 재시도 정책 재정의(테스트: sleep 무력화 등). shouldRetry 는 내부 정책 고정. */
  retry?: Pick<RetryOpts, 'maxAttempts' | 'baseDelayMs' | 'sleep'>;
  /**
   * 부분 미도달 재수집(A): 메인 패스 후 ENOTFOUND 등 **예산이 환불된 미도달 실패만** 골라
   * delay 후 재수집한다. passes=재시도 패스 수(기본 2), delayMs=패스 간 대기(기본 15s — wake
   * 직후 DNS flap 안정화 여유), sleep=테스트 주입. 미도달만 대상이라 성공분 쿼터 재소비 없음
   * (quota-safe). self-heal(exit 75)이 "전량 미도달"만 커버하던 사각지대(부분 실패)를 메운다.
   */
  recover?: { passes?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> };
  /**
   * 키워드 → 네이버쇼핑 cat_id 해석기(쇼핑인사이트 D1-4). cat_id 를 주면 그 키워드에 대해
   * 커머스 수요(shoppingTrend)를 수집하고, null/undefined 면 미수집(coverage 로 투명화 — 조용히
   * 빠지지 않는다). cat_id 전체목록/조회 API 가 없어(수동 확인, D1-4) 주입식으로 둔다.
   * 미지정 시 쇼핑인사이트는 아예 수집하지 않는다(기존 동작과 하위호환).
   */
  shoppingCategory?: (keyword: string) => string | null | undefined;
}

export async function collectSignals(
  keywords: string[],
  deps: CollectDeps = {},
): Promise<IntelBatch> {
  // 중복 키워드는 예산 이중 소비 + captured_at 동률 스냅샷 중복을 만든다(리뷰 확정) → 진입점 dedupe.
  const uniq = [...new Set(keywords.map((k) => k.trim()).filter(Boolean))];
  const cred = loadCredentials();
  const db = deps.db ?? openDb();
  const now = deps.now ?? ((): Date => new Date());
  const log = deps.logger ?? createLogger();
  const ledger = deps.ledger ?? new BudgetLedger(db, undefined, now);
  const alerter = createAlerter(log);
  const limit = pLimit(resolveConcurrency(process.env.MAX_CONCURRENCY));
  const dlqThreshold = dlqThresholdFromEnv();
  const startedAt = now().toISOString();
  const runId = `run_${now().getTime()}_${Math.random().toString(36).slice(2, 6)}`;

  const signals: KeywordSignal[] = [];
  const failures: IntelBatch['failures'] = [];
  const callsSpent: Record<IntelSource, number> = {
    naver_search_shop: 0,
    naver_datalab_search: 0,
    naver_datalab_shopping: 0,
  };

  /**
   * 시도 1회 = 게이트 확인 + 계상 + 실제 호출 1회. 재시도 시에도 매번 통과해야 한다.
   * 단, 서버 미도달(DNS 실패 등)은 쿼터를 소비하지 않았으므로 예약을 환불한다 —
   * 그러지 않으면 네트워크가 죽은 날 하루 예산이 통째로 증발한다(실측 2026-07-24).
   */
  const spend = async <T>(source: IntelSource, fn: () => Promise<T>): Promise<T> => {
    if (!ledger.tryReserve(source)) throw new BudgetExhausted(source);
    callsSpent[source] += 1;
    const ratio = ledger.usageRatio(source);
    if (ratio >= 0.8) {
      alerter.alert('BUDGET_80', `${source} 일일 예산 ${Math.round(ratio * 100)}% 도달`, {
        source,
        spentToday: ledger.spentToday(source),
        budget: ledger.budget(source),
      });
    }
    try {
      return await fn();
    } catch (err) {
      const code = netCode(err);
      if (code && UNREACHABLE_NET_CODES.has(code)) {
        ledger.release(source);
        callsSpent[source] -= 1;
      }
      throw err;
    }
  };

  const retryable = (err: unknown): boolean => {
    if (err instanceof BudgetExhausted) return false;
    if (err instanceof NaverApiError) {
      // 5xx: 일시 장애 → 재시도. 429: 원장이 예산을 지키는 한 대부분 초당 스로틀 → 백오프 재시도.
      // (일일/초당 429 는 상태코드로 구분 불가(D1-2) — 시도 상한이 낭비를 묶는다)
      return err.status >= 500 || err.status === 429;
    }
    // 일시적 네트워크 오류(ECONNRESET·wake 직후 ENOTFOUND 등)도 재시도 — 실수집에서
    // 비재시도로 결측·전량실패했던 실전 결함의 수정. undici 는 code 를 cause 에 싣기도 한다.
    const code = netCode(err);
    if (code && TRANSIENT_NET_CODES.has(code)) return true;
    return false; // NaverSchemaError 등은 재시도 무의미
  };
  const onRetry = (api: string, kw: string) => (err: unknown, attempt: number, delayMs: number) =>
    log.warn('retry', {
      api,
      keyword: kw,
      attempt,
      delayMs,
      reason: err instanceof Error ? err.message : String(err),
    });

  const processKeyword = (kw: string): Promise<void> =>
      limit(async () => {
        // DLQ 격리: 연속 실패 임계 초과 키워드는 예산을 더 태우지 않되, 반드시 설명한다.
        // 쿨다운 경과 시 isolationInfo 가 null 을 줘 자동 재시도(자가 회복) 경로가 열린다.
        const iso = isolationInfo(db, kw, dlqThreshold, now());
        if (iso) {
          failures.push({
            keyword: kw,
            reason: `dlq_isolated: 연속 ${iso.failCount}회 실패(${iso.lastReason.slice(0, 120)}) — 쿨다운 후 자동 재시도, 즉시 해제는 \`npm run dlq -- clear\``,
          });
          return;
        }
        try {
          const shop = await withRetry(
            () => spend('naver_search_shop', () => searchShop(cred, kw, { display: 40, sort: 'sim' })),
            { ...deps.retry, shouldRetry: retryable, onRetry: onRetry('search_shop', kw) },
          );

          // 트렌드는 한도가 더 빡빡하므로(D1-3 확정 1,000/일) 선택적 — 결측 시 계약이 null 표현
          let trendRaw = null;
          let trendSkippedByBudget = false;
          const end = now();
          const start = new Date(end.getTime() - 90 * 864e5);
          try {
            trendRaw = await withRetry(
              () =>
                spend('naver_datalab_search', () =>
                  searchTrend(cred, {
                    startDate: start.toISOString().slice(0, 10),
                    endDate: end.toISOString().slice(0, 10),
                    timeUnit: 'week',
                    keywordGroups: [{ groupName: kw, keywords: [kw] }],
                  }),
                ),
              { ...deps.retry, shouldRetry: retryable, onRetry: onRetry('datalab_search', kw) },
            );
          } catch (err) {
            // 트렌드 실패는 신호 전체를 죽이지 않는다(ARCHITECTURE §3) — 단 조용히 삼키지도 않는다.
            if (err instanceof BudgetExhausted) {
              trendSkippedByBudget = true; // 1급 결과: coverage.skippedByBudget 로 기록
            } else {
              const label =
                err instanceof NaverSchemaError ? 'DATALAB_SCHEMA_MISMATCH' : 'DATALAB_UNAVAILABLE';
              if (err instanceof NaverSchemaError) {
                alerter.alert('SCHEMA_MISMATCH', `datalab 응답 스키마 불일치`, { keyword: kw });
              }
              // datalab 만 401 이어도(예: 앱에 데이터랩 API 미등록) 사람 필견 사건이다(리뷰 확정).
              if (err instanceof NaverApiError && err.status === 401) {
                alerter.alert('AUTH_401', '네이버 인증 실패(datalab) — 키·데이터랩 사용설정 확인', {});
              }
              log.warn(label, {
                keyword: kw,
                reason: err instanceof Error ? err.message : String(err),
              });
            }
          }

          // 쇼핑인사이트(커머스 맥락 수요, D1-4) — cat_id 가 해석되는 키워드만 수집. 별도 1,000/일 예산
          // (naver_datalab_shopping). trend 와 동일하게 실패는 신호를 죽이지 않고 coverage 로 투명화한다.
          // 키워드당 1그룹으로만 호출(summarizeShoppingTrend 는 results[0] 전제 — analyzer 주석 참조).
          const catId = deps.shoppingCategory?.(kw) ?? null;
          let shoppingRaw: ShoppingInsightResult | null = null;
          let shoppingSkippedByBudget = false;
          if (catId) {
            try {
              shoppingRaw = await withRetry(
                () =>
                  spend('naver_datalab_shopping', () =>
                    shoppingCategoryKeywords(cred, {
                      startDate: start.toISOString().slice(0, 10),
                      endDate: end.toISOString().slice(0, 10),
                      timeUnit: 'week',
                      category: catId,
                      keyword: [{ name: kw, param: [kw] }],
                    }),
                  ),
                { ...deps.retry, shouldRetry: retryable, onRetry: onRetry('datalab_shopping', kw) },
              );
            } catch (err) {
              if (err instanceof BudgetExhausted) {
                shoppingSkippedByBudget = true;
              } else {
                const label =
                  err instanceof NaverSchemaError ? 'SHOPPING_SCHEMA_MISMATCH' : 'SHOPPING_UNAVAILABLE';
                if (err instanceof NaverSchemaError) {
                  alerter.alert('SCHEMA_MISMATCH', `쇼핑인사이트 응답 스키마 불일치`, { keyword: kw });
                }
                if (err instanceof NaverApiError && err.status === 401) {
                  alerter.alert('AUTH_401', '네이버 인증 실패(쇼핑인사이트) — 키·데이터랩 사용설정 확인', {});
                }
                log.warn(label, { keyword: kw, reason: err instanceof Error ? err.message : String(err) });
              }
            }
          }

          const competition = summarizeCompetition(shop);
          const trend = summarizeTrend(trendRaw);
          const scores = scoreOpportunity(competition, trend);
          // catId 가 있으면(수집 시도했으면) shoppingTrend 를 실어 성패를 투명화(실패 시 latest=null).
          // catId 없으면 undefined(해당 소스 스코프 아님).
          const shoppingTrend = catId ? summarizeShoppingTrend(shoppingRaw, catId) : undefined;

          signals.push({
            keyword: kw,
            capturedAt: now().toISOString(),
            competition,
            trend,
            scores,
            ...(shoppingTrend ? { shoppingTrend } : {}),
            coverage: {
              sources: [
                'naver_search_shop',
                ...(trendRaw ? (['naver_datalab_search'] as const) : []),
                ...(shoppingRaw ? (['naver_datalab_shopping'] as const) : []),
              ],
              ok: {
                naver_search_shop: true,
                naver_datalab_search: Boolean(trendRaw),
                ...(catId ? { naver_datalab_shopping: Boolean(shoppingRaw) } : {}),
              },
              skippedByBudget: [
                ...(trendSkippedByBudget ? (['naver_datalab_search'] as const) : []),
                ...(shoppingSkippedByBudget ? (['naver_datalab_shopping'] as const) : []),
              ],
            },
            compliance: {
              // TODO(D1-5): 약관 원문 확정 대기(사람 게이트 — IMPLEMENTATION.md §0).
              // 확정 전까지 보수적으로 재판매 금지·짧은 TTL 유지. D1-1~4 는 실측 완료.
              resaleRestricted: true,
              cacheTtlHours: 24,
            },
          });
          clearFailure(db, kw); // 성공 → 연속 실패 리셋
        } catch (err) {
          if (err instanceof BudgetExhausted) {
            // 예산 소진은 키워드의 잘못이 아니다 → DLQ 에 넣지 않고 사유만 명시(내일 재수집 대상)
            failures.push({ keyword: kw, reason: err.message });
            return;
          }
          if (err instanceof NaverApiError && err.status === 401) {
            alerter.alert('AUTH_401', '네이버 인증 실패 — Client ID/Secret 확인 필요', {});
          }
          if (err instanceof NaverSchemaError) {
            alerter.alert('SCHEMA_MISMATCH', 'shop 응답 스키마 불일치', { keyword: kw });
          }
          // 네트워크 코드가 있으면 `[코드] 메시지` 로 구조화한다. undici 연결타임아웃처럼 message
          // 에 코드가 없는 오류도 자가복구·환불 판정이 동일한 err.code 를 읽게 하기 위함. NaverApiError/
          // SchemaError 는 code 가 없어 태그 없이 원문 유지(400 DLQ 사유·리포트 표시 그대로).
          const code = netCode(err);
          const msg = err instanceof Error ? err.message : String(err);
          const reason = code ? `[${code}] ${msg}` : msg;
          failures.push({ keyword: kw, reason });
          // DLQ 는 "키워드 자체에 귀속되는" 실패(400 = 잘못된 쿼리 등)만 계상한다.
          // 401/403(자격·권한)·429(한도)·5xx(네이버 장애)·스키마 변경·네트워크 오류는 시스템 전역
          // 사건이라, 키워드별 연속실패로 계상하면 복구 후 전체 키워드가 격리되는 오귀속이 생긴다(리뷰 확정).
          if (err instanceof NaverApiError && err.status === 400) {
            recordFailure(db, kw, reason, runId, now());
          }
        }
      });

  await Promise.all(uniq.map(processKeyword));

  // ── 부분 미도달 타깃 재수집(A) ──
  // wake 직후 DNS flap 등으로 일부만 ENOTFOUND(예산 환불됨)이면 그 키워드만 골라 짧은 대기 후
  // 재수집한다. 대상은 UNREACHABLE 코드(=환불된 미도달)뿐 → 성공 키워드의 쿼터를 재소비하지 않는다
  // (quota-safe). 저장 전에 같은 run 으로 병합하므로 리포트/히스토리는 단일 배치로 정합.
  const recoverPasses = deps.recover?.passes ?? 2;
  const recoverDelayMs = deps.recover?.delayMs ?? 15_000;
  const recoverSleep =
    deps.recover?.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)));
  const unreachableCodes = [...UNREACHABLE_NET_CODES];
  const isUnreachableFailure = (reason: string): boolean =>
    unreachableCodes.some((c) => reason.includes(`[${c}]`));
  for (let pass = 1; pass <= recoverPasses; pass++) {
    const toRetry = failures.filter((f) => isUnreachableFailure(f.reason)).map((f) => f.keyword);
    if (toRetry.length === 0) break;
    // 대상의 기존 실패기록 제거 — 성공하면 signals 로, 다시 미도달이면 failures 로 재기록된다.
    for (let i = failures.length - 1; i >= 0; i--) {
      if (isUnreachableFailure(failures[i]!.reason)) failures.splice(i, 1);
    }
    log.info('recover_pass', { pass, keywords: toRetry.length, delayMs: recoverDelayMs });
    await recoverSleep(recoverDelayMs);
    await Promise.all(toRetry.map(processKeyword));
  }

  const batch: IntelBatch = {
    runId,
    requestedKeywords: uniq,
    signals,
    failures,
    callsSpent,
    startedAt,
    finishedAt: now().toISOString(),
  };

  saveBatch(db, batch); // 히스토리 축적(runs + signals)
  const purged = purgeExpired(db, now()); // 약관 TTL 지난 캐시 자동 무효(LEGAL-BOUNDARY §3)
  log.info('batch_done', {
    runId,
    signals: signals.length,
    failures: failures.length,
    purgedExpired: purged,
    callsSpent,
  });
  return batch;
}

/**
 * MAX_CONCURRENCY 오설정('', 'abc', '3.5' 등)이 배치 전체를 무설명 크래시(p-limit TypeError)
 * 시키지 않도록 검증 후 기본값으로 폴백한다. 실패 투명화 원칙의 연장선.
 */
function resolveConcurrency(raw: string | undefined): number {
  const DEFAULT = 3;
  if (raw === undefined) return DEFAULT;
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0) return n;
  console.error(`[keyword-intel] MAX_CONCURRENCY='${raw}' 무효 — 기본값 ${DEFAULT} 사용`);
  return DEFAULT;
}

function loadCredentials(): NaverCredentials {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 미설정 (.env 참조)');
  }
  return { clientId, clientSecret };
}
