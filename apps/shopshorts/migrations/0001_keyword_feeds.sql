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
