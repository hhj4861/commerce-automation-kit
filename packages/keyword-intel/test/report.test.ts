/**
 * 일일 리포트 — 텔레그램 어댑터(HTTP 목킹)와 다이제스트 빌더(in-memory DB) 검증.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici';
import type { IntelBatch } from '@cak/contracts';
import { openDb, type Db } from '../src/store/db.js';
import { saveBatch } from '../src/store/signals.js';
import { recordFailure } from '../src/store/dlq.js';
import { buildDigest } from '../src/cli/report.js';
import { sendMessage, listRecentChats, chunkText, TelegramApiError } from '../src/adapters/telegram.js';

let mockAgent: MockAgent;
let prevDispatcher: Dispatcher;

beforeEach(() => {
  prevDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});
afterEach(async () => {
  await mockAgent.close();
  setGlobalDispatcher(prevDispatcher);
});

const cred = { botToken: 'tkn', chatId: '123' };

describe('telegram 어댑터', () => {
  it('sendMessage 200 성공', async () => {
    mockAgent
      .get('https://api.telegram.org')
      .intercept({ path: '/bottkn/sendMessage', method: 'POST' })
      .reply(200, { ok: true });
    await expect(sendMessage(cred, '안녕')).resolves.toBeUndefined();
  });

  it('4000자 초과 텍스트는 분할 전송된다', async () => {
    let calls = 0;
    mockAgent
      .get('https://api.telegram.org')
      .intercept({ path: '/bottkn/sendMessage', method: 'POST' })
      .reply(200, () => {
        calls += 1;
        return { ok: true };
      })
      .times(2);
    await sendMessage(cred, 'x'.repeat(4500));
    expect(calls).toBe(2);
  });

  it('서러게이트 쌍(📊)이 4000자 경계에 걸려도 절단되지 않는다 (리뷰 확정 회귀)', () => {
    const chunks = chunkText('a'.repeat(3999) + '📊', 4000);
    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toBe('📊'); // 쌍이 통째로 다음 청크로
    for (const c of chunks) {
      expect((c as unknown as { isWellFormed(): boolean }).isWellFormed()).toBe(true);
    }
  });

  it('줄 경계 우선 패킹 — 내용 보존 + 청크당 max 이하', () => {
    const text = Array.from({ length: 60 }, (_, i) => `${i}번째 줄 내용입니다`).join('\n');
    const chunks = chunkText(text, 200);
    expect(chunks.join('\n')).toBe(text);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(200);
  });

  it('비200 응답은 TelegramApiError 로 표면화', async () => {
    mockAgent
      .get('https://api.telegram.org')
      .intercept({ path: '/bottkn/sendMessage', method: 'POST' })
      .reply(401, { ok: false, description: 'Unauthorized' });
    await expect(sendMessage(cred, 'x')).rejects.toThrow(TelegramApiError);
  });

  it('listRecentChats 가 chat 후보를 중복 없이 뽑는다', async () => {
    mockAgent
      .get('https://api.telegram.org')
      .intercept({ path: '/bottkn/getUpdates', method: 'GET' })
      .reply(200, {
        ok: true,
        result: [
          { message: { chat: { id: 111, first_name: '현주', type: 'private' } } },
          { message: { chat: { id: 111, first_name: '현주', type: 'private' } } },
          { update_id: 2 }, // message 없는 업데이트 — 방어적 스킵
        ],
      });
    const chats = await listRecentChats('tkn');
    expect(chats).toEqual([{ chatId: '111', label: '현주' }]);
  });
});

describe('buildDigest', () => {
  let db: Db;
  beforeEach(() => {
    db = openDb(':memory:');
    delete process.env.DAILY_CALL_BUDGET_SEARCH;
    delete process.env.DAILY_CALL_BUDGET_DATALAB;
  });

  const T1 = '2026-07-22T01:00:00.000Z';
  const T2 = '2026-07-23T01:00:00.000Z';

  function batch(runId: string, capturedAt: string, sig: Array<[string, number]>, failures: IntelBatch['failures'] = []): IntelBatch {
    return {
      runId,
      requestedKeywords: [...sig.map(([k]) => k), ...failures.map((f) => f.keyword)],
      signals: sig.map(([keyword, opportunity]) => ({
        keyword,
        capturedAt,
        competition: { totalProducts: 1000, priceLow: 1, priceHigh: 2, priceMedian: 1, distinctSellers: 3, brandedRatio: 0.5 },
        trend: { latest: null, momentumPct: null, series: [] },
        scores: { opportunity, confidence: 0.7 },
        coverage: { sources: ['naver_search_shop'], ok: { naver_search_shop: true }, skippedByBudget: [] },
        compliance: { resaleRestricted: true, cacheTtlHours: 48 },
      })),
      failures,
      callsSpent: { naver_search_shop: sig.length, naver_datalab_search: 0, naver_datalab_shopping: 0 },
      startedAt: capturedAt,
      finishedAt: capturedAt,
    };
  }

  it('요약·TopN·전일 대비 변화·실패·DLQ 를 모두 담는다', () => {
    saveBatch(db, batch('r1', T1, [['크레아틴', 60], ['시트룰린', 40]]));
    saveBatch(
      db,
      batch('r2', T2, [['크레아틴', 66], ['시트룰린', 40]], [{ keyword: '불량', reason: 'HTTP 500' }]),
    );
    recordFailure(db, '격리자', 'bad', 'r2', new Date(T2));
    recordFailure(db, '격리자', 'bad', 'r2', new Date(T2));
    recordFailure(db, '격리자', 'bad', 'r2', new Date(T2));

    const text = buildDigest(db, 10, new Date(T2));

    expect(text).toContain('일일 리포트');
    expect(text).toContain('신호 2 · 실패 1');
    expect(text).toContain('크레아틴 66 (+6)'); // 전일 60 → 66
    expect(text).toContain('시트룰린 40 (=)');
    expect(text).toContain('불량: HTTP 500');
    expect(text).toContain('DLQ 격리 1건: 격리자');
    expect(text).toContain('참고 지표'); // 자동 트리거 금지 문구
  });

  it('첫 수집(전일 없음)은 new 로 표시', () => {
    saveBatch(db, batch('r1', T2, [['신규', 50]]));
    const text = buildDigest(db, 10, new Date(T2));
    expect(text).toContain('신규 50 (new)');
  });

  it('수집 이력이 없어도 죽지 않는다', () => {
    const text = buildDigest(db, 10, new Date(T2));
    expect(text).toContain('수집 이력 없음');
  });

  it('전일 signals 가 TTL purge 로 사라져도 Δ 는 signal_history 로 산다 (리뷰 확정 회귀)', () => {
    saveBatch(db, batch('r1', T1, [['크레아틴', 60]]));
    db.prepare(`DELETE FROM signals WHERE run_id = 'r1'`).run(); // TTL purge 효과 시뮬레이션
    saveBatch(db, batch('r2', T2, [['크레아틴', 66]]));

    const text = buildDigest(db, 10, new Date(T2));
    expect(text).toContain('크레아틴 66 (+6)'); // history 기반 Δ — purge 무관
    const hist = db.prepare(`SELECT COUNT(*) AS c FROM signal_history WHERE keyword='크레아틴'`).get() as { c: number };
    expect(hist.c).toBe(2); // 일별 1행 축적(캘리브레이션 근거)
  });

  it('오늘 수집이 없으면(크론 실패) 전일 run 을 오늘 것처럼 보이지 않게 경고한다', () => {
    saveBatch(db, batch('r1', T1, [['크레아틴', 60]]));
    const text = buildDigest(db, 10, new Date(T2)); // run 은 T1(어제)뿐
    expect(text).toContain('오늘 수집 없음(마지막: 2026-07-22)');
  });

  it('오늘 run 이 전량 실패(신호 0 + 실패 다수)면 🚨 배너로 크게 알린다 (2026-07-24 회귀)', () => {
    // 09:37 사고 재현: 오늘 실행됐으나(exit 0으로 보임) 신호 0 · 전량 ENOTFOUND.
    saveBatch(
      db,
      batch('r1', T2, [], [
        { keyword: '루테인', reason: 'getaddrinfo ENOTFOUND openapi.naver.com' },
        { keyword: '콜라겐', reason: 'getaddrinfo ENOTFOUND openapi.naver.com' },
      ]),
    );
    const text = buildDigest(db, 10, new Date(T2));
    expect(text).toContain('🚨 오늘 수집 전량 실패 (2건)');
  });

  it('정상 수집(신호>0)에는 전량실패 배너를 붙이지 않는다', () => {
    saveBatch(db, batch('r1', T2, [['크레아틴', 60]], [{ keyword: '불량', reason: 'HTTP 500' }]));
    const text = buildDigest(db, 10, new Date(T2));
    expect(text).not.toContain('전량 실패');
  });

  it('예산 0(의도적 차단) 구성에서 NaN% 대신 명시 문구 (리뷰 확정 회귀)', () => {
    process.env.DAILY_CALL_BUDGET_SEARCH = '0';
    saveBatch(db, batch('r1', T2, [['크레아틴', 60]]));
    const text = buildDigest(db, 10, new Date(T2));
    expect(text).toContain('예산 0(차단)');
    expect(text).not.toContain('NaN');
  });
});
