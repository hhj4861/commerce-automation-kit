-- 소재 리서치(트렌드 탐색 통합): 키워드별 현지 검색어 변환 캐시.
-- 변환 생성은 Claude 세션(모니터)이 담당 — pending 을 감지해 ready 로 채운다.
-- 자동 수집 없음: 이 테이블은 "검색어 문자열"만 저장한다(타 플랫폼 콘텐츠 저장 금지 — 금지선 #1·#2).
CREATE TABLE IF NOT EXISTS keyword_research (
  topic TEXT PRIMARY KEY,
  data TEXT,                                -- {"xhs":[],"dy":[],"en":[]} JSON (NULL = 생성 대기)
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | ready
  requested_at TEXT NOT NULL,
  updated_at TEXT
);

-- 초안 요청에 관찰 메모(리서치에서 본 연출 기록) 첨부 — 대본 작성 시 연출 참고로 전달.
ALTER TABLE draft_requests ADD COLUMN memo TEXT;
