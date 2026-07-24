/**
 * DLQ(dead-letter) — 반복 실패 키워드를 격리해 예산 낭비를 막고, 배치 말미에 리포트한다.
 * 규약: fail_count 는 "연속" 실패 수(성공하면 행 삭제 = 리셋). 임계 이상이면 수집에서 격리하되,
 * 격리 사실은 failures 로 반드시 설명한다(silent drop 금지).
 */
import type { Db } from './db.js';

export interface DlqEntry {
  keyword: string;
  failCount: number;
  lastReason: string;
  lastFailedAt: string;
}

export function dlqThresholdFromEnv(): number {
  const n = Number(process.env.DLQ_THRESHOLD ?? 3);
  return Number.isInteger(n) && n > 0 ? n : 3;
}

/** 격리 쿨다운(시간). 경과하면 1회 재시도를 허용해 자가 회복 경로를 연다. */
export function dlqCooldownHoursFromEnv(): number {
  const n = Number(process.env.DLQ_COOLDOWN_HOURS ?? 24);
  return Number.isFinite(n) && n > 0 ? n : 24;
}

export function recordFailure(
  db: Db,
  keyword: string,
  reason: string,
  runId: string,
  now: Date = new Date(),
): void {
  db.prepare(
    `INSERT INTO dlq(keyword, fail_count, last_reason, last_failed_at, last_run_id)
     VALUES(?,1,?,?,?)
     ON CONFLICT(keyword) DO UPDATE SET
       fail_count     = fail_count + 1,
       last_reason    = excluded.last_reason,
       last_failed_at = excluded.last_failed_at,
       last_run_id    = excluded.last_run_id`,
  ).run(keyword, reason, now.toISOString(), runId);
}

/** 성공한 키워드는 연속 실패가 끊긴 것 → DLQ 에서 제거. */
export function clearFailure(db: Db, keyword: string): void {
  db.prepare(`DELETE FROM dlq WHERE keyword = ?`).run(keyword);
}

/**
 * 임계 이상 연속 실패면 격리 정보를, 아니면 null.
 * 쿨다운(기본 24h)이 지나면 null 을 반환해 재시도를 1회 허용한다 — 격리가 시도 자체를 막으면
 * 유일한 리셋 경로(성공→clearFailure)가 영원히 도달 불가라는 결함의 수정(리뷰 확정).
 * 재시도가 또 실패하면 last_failed_at 이 갱신돼 쿨다운이 다시 시작된다(쿨다운당 1회 시도로 제한).
 */
export function isolationInfo(
  db: Db,
  keyword: string,
  threshold: number,
  now: Date = new Date(),
  cooldownHours: number = dlqCooldownHoursFromEnv(),
): DlqEntry | null {
  const row = db
    .prepare(
      `SELECT keyword, fail_count AS failCount, last_reason AS lastReason,
              last_failed_at AS lastFailedAt
       FROM dlq WHERE keyword = ? AND fail_count >= ?`,
    )
    .get(keyword, threshold) as DlqEntry | undefined;
  if (!row) return null;
  const elapsedMs = now.getTime() - Date.parse(row.lastFailedAt);
  if (elapsedMs >= cooldownHours * 3600_000) return null; // 쿨다운 경과 → 자가 회복 재시도 허용
  return row;
}

/** 격리 즉시 해제(사람 판단) — CLI `dlq clear` 가 사용. 반환값 = 삭제 건수. */
export function clearAll(db: Db): number {
  return db.prepare(`DELETE FROM dlq`).run().changes;
}

/** 배치 말미 리포트용 — 격리 중인 키워드 전체. */
export function dlqReport(db: Db, threshold: number): DlqEntry[] {
  return db
    .prepare(
      `SELECT keyword, fail_count AS failCount, last_reason AS lastReason,
              last_failed_at AS lastFailedAt
       FROM dlq WHERE fail_count >= ? ORDER BY fail_count DESC, keyword`,
    )
    .all(threshold) as DlqEntry[];
}
