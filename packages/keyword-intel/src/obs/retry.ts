/**
 * 지수 백오프 재시도 — 429/5xx 같은 일시 장애용.
 *
 * 규약(ARCHITECTURE §6 / D1-2):
 *  - 재시도 1회 = 실제 API 호출 1회. 호출 계상·예산 게이트는 호출자가 fn 안에서 매 시도마다 수행한다.
 *  - 일일 한도성 429 는 재시도로 회복 불가 — 상태코드로는 초당 429 와 구분이 안 되므로(D1-2),
 *    호출자는 예산 원장(BudgetLedger)을 1차 방어선으로 삼고 재시도 횟수 상한으로 낭비를 묶는다.
 */
export interface RetryOpts {
  /** 총 시도 횟수(첫 시도 포함). 기본 3 */
  maxAttempts?: number;
  /** 첫 재시도 대기(ms). 이후 2배씩 + 지터. 기본 500 */
  baseDelayMs?: number;
  shouldRetry: (err: unknown, attempt: number) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  /** 테스트 주입용 sleep */
  sleep?: (ms: number) => Promise<void>;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  const max = opts.maxAttempts ?? 3;
  const base = opts.baseDelayMs ?? 500;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let lastErr: unknown;
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === max || !opts.shouldRetry(err, attempt)) throw err;
      const delayMs = base * 2 ** (attempt - 1) + Math.floor(Math.random() * base * 0.5);
      opts.onRetry?.(err, attempt, delayMs);
      await sleep(delayMs);
    }
  }
  throw lastErr; // 도달 불가(위에서 throw)지만 타입 완결용
}
