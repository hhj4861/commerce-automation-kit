-- 사용자가 대시보드에서 직접 검증하는 WordPress 초안 생성 POC 큐.
-- POC 단계에서는 공개 발행을 허용하지 않고 publish=false만 전달한다.
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

-- keyword-intel의 30분 동기화 결과를 KST 날짜별로 보존한다.
-- 같은 날짜의 재수집은 topic별 최신값으로 갱신한다.
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
