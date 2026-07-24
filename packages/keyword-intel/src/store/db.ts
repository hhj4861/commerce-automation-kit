/**
 * SQLite 연결 + 마이그레이션 — 이 모듈의 유일한 영속화 지점.
 * 1인 규모에 Postgres 는 과함(ARCHITECTURE §5). 스케일 시 교체 가능하도록
 * 소비자는 이 파일의 openDb() 와 store/*.ts 함수만 사용한다.
 *
 * 마이그레이션은 append-only: 기존 항목을 수정하지 말고 새 버전을 뒤에 추가한다.
 * (PRAGMA user_version 으로 적용 버전 추적)
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Db = Database.Database;

/** 패키지 루트(src/store/ 의 두 단계 위). cwd 와 무관하게 안정적이다. */
const PKG_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/**
 * 상대 DB_PATH 를 cwd 가 아닌 "패키지 루트" 기준으로 해석한다.
 * cwd 마다 별개 DB(=별개 예산 원장)가 생기면 크론·수동 실행이 서로 다른 원장을 보게 되어
 * 일일 한도 불변식이 깨진다(리뷰 확정 결함 — LEGAL-BOUNDARY 경계 4의 1차 방어선).
 */
export function resolveDbPath(p: string = process.env.DB_PATH ?? './data/intel.db'): string {
  if (p === ':memory:') return p;
  return isAbsolute(p) ? p : resolve(PKG_ROOT, p);
}

const MIGRATIONS: readonly string[] = [
  // v1 — 초기 스키마: signals(신호 히스토리) / runs(배치 이력) / call_ledger(일일 예산 원장) / dlq(반복실패 격리)
  `
  CREATE TABLE runs (
    run_id             TEXT PRIMARY KEY,
    started_at         TEXT NOT NULL,
    finished_at        TEXT NOT NULL,
    requested_keywords TEXT NOT NULL, -- JSON string[]
    calls_spent        TEXT NOT NULL  -- JSON Record<IntelSource, number>
  );

  CREATE TABLE signals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword     TEXT NOT NULL,
    captured_at TEXT NOT NULL,
    run_id      TEXT NOT NULL REFERENCES runs(run_id),
    competition TEXT NOT NULL, -- JSON (KeywordSignal.competition)
    trend       TEXT NOT NULL, -- JSON (KeywordSignal.trend)
    scores      TEXT NOT NULL, -- JSON (KeywordSignal.scores)
    coverage    TEXT NOT NULL, -- JSON (KeywordSignal.coverage)
    compliance  TEXT NOT NULL, -- JSON (KeywordSignal.compliance)
    opportunity INTEGER NOT NULL, -- 정렬용 발췌 컬럼 (scores.opportunity)
    confidence  REAL NOT NULL,    -- 정렬용 발췌 컬럼 (scores.confidence)
    expires_at  TEXT NOT NULL     -- captured_at + compliance.cacheTtlHours — 약관 TTL 집행(LEGAL-BOUNDARY §3)
  );
  CREATE INDEX idx_signals_keyword     ON signals(keyword, captured_at DESC);
  CREATE INDEX idx_signals_opportunity ON signals(opportunity DESC);
  CREATE INDEX idx_signals_expires     ON signals(expires_at);

  CREATE TABLE call_ledger (
    day    TEXT NOT NULL,             -- KST 기준 YYYY-MM-DD (budget/ledger.ts kstDay)
    source TEXT NOT NULL,             -- IntelSource
    count  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, source)
  );

  CREATE TABLE dlq (
    keyword        TEXT PRIMARY KEY,
    fail_count     INTEGER NOT NULL DEFAULT 0, -- 연속 실패 수(성공 시 행 삭제)
    last_reason    TEXT NOT NULL,
    last_failed_at TEXT NOT NULL,
    last_run_id    TEXT
  );
  `,
  // v2 — 일일 리포트(다이제스트)용: 배치 실패 내역을 runs 에 영속화 (append-only 진화)
  `
  ALTER TABLE runs ADD COLUMN failures TEXT NOT NULL DEFAULT '[]'; -- JSON IntelBatch['failures']
  `,
  // v3 — 가공 지표 장기 히스토리. 원본성 데이터(signals: 시계열·가격분포 포함 행)는 약관 TTL 로
  // 무효화하되, "자체 산출 요약 지표"(스코어·집계 수치)는 별도 보관한다 — 그러지 않으면
  // TTL 24h × 일일 수집 주기에서 전일 스냅샷이 항상 purge 되어 Δ표시·캘리브레이션(G3) 근거가
  // 구조적으로 소멸한다(리뷰 확정 결함). LEGAL-BOUNDARY 경계 2 의 "원본 재판매 vs 자체 가공
  // 인사이트" 구분을 저장 구조에도 반영한 것.
  `
  CREATE TABLE signal_history (
    keyword        TEXT NOT NULL,
    day            TEXT NOT NULL,          -- KST YYYY-MM-DD (키워드당 하루 1행, 재수집 시 upsert)
    captured_at    TEXT NOT NULL,
    opportunity    INTEGER NOT NULL,
    confidence     REAL NOT NULL,
    total_products INTEGER NOT NULL,
    trend_latest   REAL,                   -- 상대지표 단일점(가공 요약 — 원시 시계열 아님)
    PRIMARY KEY (keyword, day)
  );
  `,
];

/** DB 를 열고 미적용 마이그레이션을 실행한다. 테스트는 ':memory:' 를 넘긴다. */
export function openDb(path?: string): Db {
  const resolved = resolveDbPath(path);
  if (resolved !== ':memory:') mkdirSync(dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
