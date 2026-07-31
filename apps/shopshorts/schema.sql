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

-- 이전 클라이언트 호환용. 신규 데이터는 keyword_feeds 에 채널별로 저장한다.
CREATE TABLE IF NOT EXISTS hot_keywords (
  topic TEXT PRIMARY KEY,
  opportunity INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

-- GitHub Actions keyword-intel 이 30분마다 trend/blog 채널을 독립 교체한다.
CREATE TABLE IF NOT EXISTS keyword_feeds (
  channel TEXT NOT NULL CHECK(channel IN ('trend', 'blog')),
  topic TEXT NOT NULL,
  score INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(channel, topic)
);
CREATE INDEX IF NOT EXISTS idx_keyword_feeds_channel_score
  ON keyword_feeds(channel, score DESC);

CREATE TABLE IF NOT EXISTS keyword_feed_archive (
  snapshot_date TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('trend', 'blog')),
  topic TEXT NOT NULL,
  score INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(snapshot_date, channel, topic)
);
CREATE INDEX IF NOT EXISTS idx_keyword_feed_archive_date_score
  ON keyword_feed_archive(channel, snapshot_date DESC, score DESC);

CREATE TABLE IF NOT EXISTS blog_poc_requests (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'dispatching',
  run_id INTEGER,
  run_url TEXT,
  error TEXT,
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blog_poc_requests_requested
  ON blog_poc_requests(requested_at DESC);

-- 워커 하트비트 등 메타(워커 온라인 표시용)
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
