/**
 * 일일 다이제스트 — store 를 읽어 사람이 볼 요약을 만들고 텔레그램으로 보낸다.
 * "저관여 + 사람 감시" 설계의 감시 채널: 자동화는 수집·리포트까지이고,
 * 판단(무엇을 만들지)은 항상 사람이 한다(⚠️ 스코어는 참고 지표 — 자동 트리거 금지).
 *
 * buildDigest 는 순수 함수(전송 없음) → 테스트 용이. 전송은 cli/index.ts 가 조립.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from '../store/db.js';
import { topOpportunities } from '../store/signals.js';
import { dlqReport, dlqThresholdFromEnv } from '../store/dlq.js';
import { defaultBudgets } from '../budget/ledger.js';
import { kstDay } from '../core/time.js';

const PKG_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** seeds 파일의 `키워드  # ⚠️...` 주석에서 사람 게이트 플래그를 읽는다(없으면 빈 맵). */
export function loadSeedFlags(seedPath = resolve(PKG_ROOT, 'seeds/g2-seeds.txt')): Map<string, string> {
  const flags = new Map<string, string>();
  if (!existsSync(seedPath)) return flags;
  for (const line of readFileSync(seedPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#]+?)\s*#\s*(⚠️.*?)\s*$/);
    if (m) flags.set(m[1]!.trim(), m[2]!.trim());
  }
  return flags;
}

interface LatestRun {
  runId: string;
  finishedAt: string;
  requested: number;
  signalCount: number;
  failures: Array<{ keyword: string; reason: string }>;
  callsSpent: Record<string, number>;
}

function latestRun(db: Db): LatestRun | null {
  const row = db
    .prepare(`SELECT run_id, finished_at, requested_keywords, calls_spent, failures FROM runs ORDER BY finished_at DESC, run_id DESC LIMIT 1`)
    .get() as
    | { run_id: string; finished_at: string; requested_keywords: string; calls_spent: string; failures: string }
    | undefined;
  if (!row) return null;
  const signalCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM signals WHERE run_id = ?`).get(row.run_id) as { c: number }
  ).c;
  return {
    runId: row.run_id,
    finishedAt: row.finished_at,
    requested: (JSON.parse(row.requested_keywords) as string[]).length,
    signalCount,
    failures: JSON.parse(row.failures) as Array<{ keyword: string; reason: string }>,
    callsSpent: JSON.parse(row.calls_spent) as Record<string, number>,
  };
}

/**
 * 전일(직전 day) opportunity — Δ 표시용. signals 가 아니라 **signal_history** 를 읽는다:
 * TTL 24h × 일일 주기에서 전일 signals 행은 리포트 시점에 항상 purge 돼 있어(리뷰 확정 결함)
 * signals 기반 Δ 는 영원히 'new' 가 된다. 가공 지표 히스토리는 TTL 무관 보존.
 */
function prevOpportunity(db: Db, keyword: string, todayDay: string): number | null {
  const row = db
    .prepare(
      `SELECT opportunity FROM signal_history WHERE keyword = ? AND day < ?
       ORDER BY day DESC LIMIT 1`,
    )
    .get(keyword, todayDay) as { opportunity: number } | undefined;
  return row?.opportunity ?? null;
}

export function buildDigest(db: Db, topN = 10, now: Date = new Date()): string {
  const day = kstDay(now);
  const lines: string[] = [`📊 keyword-intel 일일 리포트 (${day} KST)`];

  // 1) 최근 배치 요약 — 오늘 수집이 없으면(크론 실패 등) 전일 데이터를 오늘 것처럼 보이게 두지 않는다
  const run = latestRun(db);
  if (run) {
    const runDay = kstDay(new Date(run.finishedAt));
    const stale = runDay !== day ? ` ⚠️ 오늘 수집 없음(마지막: ${runDay}) — data/daily.log 확인` : '';
    lines.push(
      `수집: ${run.requested}키워드 → 신호 ${run.signalCount} · 실패 ${run.failures.length}${stale}`,
    );
  } else {
    lines.push('수집 이력 없음 — collect 를 먼저 실행하세요.');
  }

  // 2) 오늘 예산 사용률 (원장 직접 조회)
  const budgets = defaultBudgets();
  const spent = (source: string): number =>
    (
      db.prepare(`SELECT count FROM call_ledger WHERE day = ? AND source = ?`).get(day, source) as
        | { count: number }
        | undefined
    )?.count ?? 0;
  const s1 = spent('naver_search_shop');
  const s2 = spent('naver_datalab_search');
  // 예산 0(의도적 수집 차단 구성)은 나눗셈 대신 명시 — NaN%/Infinity% 전송 방지(리뷰 확정)
  const pct = (n: number, budget: number): string =>
    budget === 0 ? '예산 0(차단)' : `${Math.round((n / budget) * 100)}%`;
  lines.push(
    `예산: 검색 ${s1.toLocaleString()}/${budgets.naver_search_shop.toLocaleString()} (${pct(s1, budgets.naver_search_shop)}) · 데이터랩 ${s2}/${budgets.naver_datalab_search} (${pct(s2, budgets.naver_datalab_search)})`,
  );

  // 3) Top N (전일 대비 변화 + 사람 게이트 플래그)
  const flags = loadSeedFlags();
  const top = topOpportunities(db, topN, now);
  lines.push('', `🏆 opportunity Top ${top.length} — 참고 지표(자동 실행 트리거 아님)`);
  top.forEach((r, i) => {
    const prev = prevOpportunity(db, r.keyword, day);
    const delta =
      prev === null ? 'new' : r.opportunity === prev ? '=' : r.opportunity > prev ? `+${r.opportunity - prev}` : `${r.opportunity - prev}`;
    const flag = flags.get(r.keyword) ? ` ${flags.get(r.keyword)}` : '';
    const trend = r.trendLatest === null ? '-' : String(Math.round(r.trendLatest));
    lines.push(
      `${String(i + 1).padStart(2)}. ${r.keyword} ${r.opportunity} (${delta}) · 상품 ${r.totalProducts.toLocaleString()} · 트렌드 ${trend}${flag}`,
    );
  });

  // 4) 실패·DLQ (silent drop 금지 — 리포트에서도 투명화)
  if (run && run.failures.length) {
    lines.push('', `❌ 실패 ${run.failures.length}건`);
    for (const f of run.failures.slice(0, 5)) lines.push(`- ${f.keyword}: ${f.reason.slice(0, 80)}`);
    if (run.failures.length > 5) lines.push(`… 외 ${run.failures.length - 5}건 (npm run dlq 로 확인)`);
  }
  const dlq = dlqReport(db, dlqThresholdFromEnv());
  if (dlq.length) {
    lines.push('', `🚧 DLQ 격리 ${dlq.length}건: ${dlq.map((d) => d.keyword).join(', ')}`);
  }

  lines.push('', '⚠️ 표시는 콘텐츠·광고화 시 사람 게이트 필수 키워드 (seeds/g2-seeds.txt 참조)');
  return lines.join('\n');
}
