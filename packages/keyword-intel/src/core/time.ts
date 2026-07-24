/**
 * 시간 유틸(순수) — KST 날짜 계산.
 * 네이버 한도 리셋 경계는 공식 미명시(TODO(D1)) → KST 자정으로 보수 가정.
 * budget(원장 day)·store(history day)·report(오늘 판정)가 공유하는 단일 정의.
 */
export function kstDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
