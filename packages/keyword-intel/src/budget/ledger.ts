/**
 * 일일 호출예산 영속 원장 — API 호출 "직전" 원자적으로 확인·계상하는 게이트.
 *
 * 왜 영속인가: 프로세스 재시작·크론 반복 실행에도 하루 소비량이 이어져야 실제 한도
 * (검색 25,000/일 · 데이터랩 1,000/일 — D1-2/D1-3 실측)를 절대 넘지 않는다.
 * 다중 계정/프록시로 한도를 우회하지 않는다(LEGAL-BOUNDARY 경계 4).
 *
 * 리셋 경계: 네이버 공식 문서에 리셋 시각 미명시 → KST 자정으로 보수 가정. TODO(D1): 실측 시 확정.
 */
import type { IntelSource } from '@cak/contracts';
import { NAVER_LIMITS } from '../adapters/naver-client.js';
import type { Db } from '../store/db.js';
import { kstDay } from '../core/time.js';

// 정의는 core/time.ts 로 이동(store/report 와 공유) — 기존 소비처 호환용 재노출.
export { kstDay };

/**
 * env 예산을 읽되, 공식 일일 한도를 상한으로 강제한다 — env 오설정으로도 한도를 넘길 수 없게.
 */
function intEnv(name: string, fallback: number, hardMax: number): number {
  const raw = process.env[name];
  // 빈 값(`KEY=` 만 있는 .env 라인)은 Number('')===0 이라 '예산 0'으로 오독돼
  // 수집이 전면 차단된다(리뷰 확정) → 미설정과 동일하게 fallback 처리.
  if (raw === undefined || raw.trim() === '') return Math.min(fallback, hardMax);
  const n = Number(raw);
  const valid = Number.isInteger(n) && n >= 0 ? n : fallback;
  return Math.min(valid, hardMax);
}

export function defaultBudgets(): Record<IntelSource, number> {
  const search = intEnv('DAILY_CALL_BUDGET_SEARCH', 20000, NAVER_LIMITS.SEARCH_DAILY_CALL_LIMIT);
  const datalab = intEnv('DAILY_CALL_BUDGET_DATALAB', 800, NAVER_LIMITS.DATALAB_DAILY_CALL_LIMIT);
  // 쇼핑인사이트는 트렌드와 별도 1,000/일(D1-4). call_ledger 가 source 별로 분리돼 카운터는 독립이므로
  // 예산도 전용 env 로 분리한다(어댑터 배선, 2026-07-26). 미설정 시 datalab 과 동일 기본값(800).
  const datalabShopping = intEnv(
    'DAILY_CALL_BUDGET_DATALAB_SHOPPING',
    datalab,
    NAVER_LIMITS.DATALAB_DAILY_CALL_LIMIT,
  );
  return {
    naver_search_shop: search,
    naver_datalab_search: datalab,
    naver_datalab_shopping: datalabShopping,
  };
}

export class BudgetLedger {
  private readonly budgets: Record<IntelSource, number>;

  constructor(
    private readonly db: Db,
    budgets?: Partial<Record<IntelSource, number>>,
    private readonly clock: () => Date = () => new Date(),
  ) {
    // 게이트 불변식은 "어떤 구성으로도 공식 한도 초과 불가"이며 클래스가 보장한다 —
    // env 뿐 아니라 생성자 주입 경로도 clamp(리뷰 확정: 주입값이 clamp 를 우회했음).
    const merged = { ...defaultBudgets(), ...budgets };
    this.budgets = {
      naver_search_shop: Math.min(merged.naver_search_shop, NAVER_LIMITS.SEARCH_DAILY_CALL_LIMIT),
      naver_datalab_search: Math.min(merged.naver_datalab_search, NAVER_LIMITS.DATALAB_DAILY_CALL_LIMIT),
      naver_datalab_shopping: Math.min(merged.naver_datalab_shopping, NAVER_LIMITS.DATALAB_DAILY_CALL_LIMIT),
    };
  }

  day(): string {
    return kstDay(this.clock());
  }

  budget(source: IntelSource): number {
    return this.budgets[source];
  }

  spentToday(source: IntelSource): number {
    const row = this.db
      .prepare(`SELECT count FROM call_ledger WHERE day = ? AND source = ?`)
      .get(this.day(), source) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  /** 소비율(0~1). 예산 0 이면 1(항상 소진 상태)로 본다. */
  usageRatio(source: IntelSource): number {
    const b = this.budgets[source];
    return b === 0 ? 1 : this.spentToday(source) / b;
  }

  /**
   * 예약 환불 — 요청이 **서버에 도달조차 못한** 경우(DNS 실패·연결 거부 등)에만 쓴다.
   * 그런 실패는 네이버 쿼터를 소비하지 않았으므로, 계상해두면 예산만 헛되이 소진된다
   * (실측 2026-07-24: wake 직후 DNS 미준비로 182건 전량 ENOTFOUND → 원장에 182 소모됨).
   * ⚠️ 연결 성립 후 끊긴 경우(ECONNRESET 등)는 서버 도달 가능성이 있어 환불하지 않는다(보수적).
   */
  release(source: IntelSource): void {
    this.db
      .prepare(`UPDATE call_ledger SET count = count - 1 WHERE day = ? AND source = ? AND count > 0`)
      .run(this.day(), source);
  }

  /**
   * 호출 직전 게이트: 예산 내면 원자적으로 +1 하고 true, 소진이면 false.
   * (조건부 UPDATE 한 문장이라 다중 프로세스에서도 초과 계상이 없다)
   */
  tryReserve(source: IntelSource): boolean {
    const day = this.day();
    this.db
      .prepare(
        `INSERT INTO call_ledger(day, source, count) VALUES(?,?,0)
         ON CONFLICT(day, source) DO NOTHING`,
      )
      .run(day, source);
    const r = this.db
      .prepare(
        `UPDATE call_ledger SET count = count + 1
         WHERE day = ? AND source = ? AND count < ?`,
      )
      .run(day, source, this.budgets[source]);
    return r.changes === 1;
  }
}
