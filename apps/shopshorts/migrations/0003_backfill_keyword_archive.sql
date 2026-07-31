-- 0002 배포 전에 이미 들어 있던 최신 피드는 archive가 비어 있으므로,
-- 각 채널의 updated_at을 KST 날짜로 변환해 첫 날짜 스냅샷으로 이관한다.
-- 이후 동기화는 API PUT /keyword-feeds/:channel 이 같은 날짜를 최신값으로 교체한다.
INSERT OR REPLACE INTO keyword_feed_archive(
  snapshot_date, channel, topic, score, payload, updated_at
)
SELECT
  date(updated_at, '+9 hours'),
  channel,
  topic,
  score,
  payload,
  updated_at
FROM keyword_feeds;
