/**
 * budget 원장 — 영속 일일 카운터, KST 리셋, 소스별 독립, 공식 한도 clamp(한도 우회 금지).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDb, type Db } from '../src/store/db.js';
import { BudgetLedger, kstDay, defaultBudgets } from '../src/budget/ledger.js';

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
  delete process.env.DAILY_CALL_BUDGET_SEARCH;
  delete process.env.DAILY_CALL_BUDGET_DATALAB;
});
afterEach(() => {
  delete process.env.DAILY_CALL_BUDGET_SEARCH;
  delete process.env.DAILY_CALL_BUDGET_DATALAB;
});

describe('kstDay — 리셋 경계는 KST 자정(보수 가정, TODO(D1))', () => {
  it('UTC 15시 이후는 KST 다음날', () => {
    expect(kstDay(new Date('2026-07-23T16:00:00Z'))).toBe('2026-07-24');
    expect(kstDay(new Date('2026-07-23T14:59:00Z'))).toBe('2026-07-23');
  });
});

describe('BudgetLedger', () => {
  it('예산 내에서만 reserve, 소진 후 false — 실제 한도를 절대 넘지 않는다', () => {
    const l = new BudgetLedger(db, { naver_search_shop: 2 }, () => new Date('2026-07-23T03:00:00Z'));
    expect(l.tryReserve('naver_search_shop')).toBe(true);
    expect(l.tryReserve('naver_search_shop')).toBe(true);
    expect(l.tryReserve('naver_search_shop')).toBe(false);
    expect(l.spentToday('naver_search_shop')).toBe(2);
    expect(l.usageRatio('naver_search_shop')).toBe(1);
  });

  it('소스별 카운터 독립 — 검색 소진이 데이터랩에 영향 없음', () => {
    const l = new BudgetLedger(
      db,
      { naver_search_shop: 0, naver_datalab_search: 1 },
      () => new Date('2026-07-23T03:00:00Z'),
    );
    expect(l.tryReserve('naver_search_shop')).toBe(false);
    expect(l.tryReserve('naver_datalab_search')).toBe(true);
  });

  it('KST 날짜가 바뀌면 예산 리셋 (영속 카운터의 존재 이유)', () => {
    let t = new Date('2026-07-23T03:00:00Z');
    const l = new BudgetLedger(db, { naver_search_shop: 1 }, () => t);
    expect(l.tryReserve('naver_search_shop')).toBe(true);
    expect(l.tryReserve('naver_search_shop')).toBe(false);
    t = new Date('2026-07-24T03:00:00Z'); // 다음날
    expect(l.tryReserve('naver_search_shop')).toBe(true);
  });

  it('env 예산이 공식 한도를 넘으면 공식 한도로 clamp — 한도 우회 금지', () => {
    process.env.DAILY_CALL_BUDGET_SEARCH = '999999';
    process.env.DAILY_CALL_BUDGET_DATALAB = '5000';
    const b = defaultBudgets();
    expect(b.naver_search_shop).toBe(25000); // D1-2 공식 한도
    expect(b.naver_datalab_search).toBe(1000); // D1-3 공식 한도
  });
});

describe('BudgetLedger — 리뷰 확정 회귀(2차)', () => {
  it('생성자 주입 예산도 공식 한도로 clamp — 프로그래매틱 우회 불가', () => {
    const l = new BudgetLedger(db, { naver_search_shop: 999999, naver_datalab_search: 5000 });
    expect(l.budget('naver_search_shop')).toBe(25000);
    expect(l.budget('naver_datalab_search')).toBe(1000);
  });

  it('빈 문자열 env(`KEY=` 만 있는 라인)는 fallback — 예산 0 오독으로 전면 차단되지 않음', () => {
    process.env.DAILY_CALL_BUDGET_SEARCH = '';
    process.env.DAILY_CALL_BUDGET_DATALAB = '  ';
    const b = defaultBudgets();
    expect(b.naver_search_shop).toBe(20000);
    expect(b.naver_datalab_search).toBe(800);
  });
});
