-- shopshorts D1 스키마 — 클라우드 큐가 단일 진실 소스(로컬 jobs.json 대체)
-- 잡 본문은 JSON 블롭(data) — @cak/contracts ShoppingShortsJob 형태 유지(계약 일관성).
-- status 는 질의 최적화를 위한 발췌 컬럼(항상 data.status 와 동기).

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,             -- ShoppingShortsJob JSON
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS draft_requests (
  slug TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'shorts',  -- shorts 활성 / ad·blog·music 예약
  opportunity INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TEXT NOT NULL
);

-- keyword-intel 은 로컬에서만 돈다 → 워커가 주기적으로 push
CREATE TABLE IF NOT EXISTS hot_keywords (
  topic TEXT PRIMARY KEY,
  opportunity INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

-- 워커 하트비트 등 메타(워커 온라인 표시용)
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
