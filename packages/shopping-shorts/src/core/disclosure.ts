/**
 * 대가성 고지(공정위 추천·보증 등에 관한 표시·광고 심사지침) — 순수 로직.
 *
 * 제휴(파트너스) 링크가 붙는 발행물은 경제적 이해관계를 소비자가 쉽게 인식할 수 있게
 * 표시해야 한다. 이 모듈은 ① 표준 문구 제공 ② 문구 존재 검증 ③ 누락 시 삽입을 담당하고,
 * lint(R-disclosure)와 조립 게이트가 이 검증을 사용한다 — 고지 없이는 발행 경로가 없다.
 */

/** 설명란(캡션) 표준 고지 문구 — 쿠팡 파트너스 권장 문구. */
export const PARTNERS_DISCLOSURE =
  '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

/** 영상 내 오버레이용 축약 고지(번인). */
export const DISCLOSURE_OVERLAY_TEXT = '쿠팡 파트너스 활동으로 수수료를 제공받을 수 있음';

/** 비교용 정규화 — NFKC + 공백 제거(공백 변형으로 검증을 우회하지 못하게). */
function normalize(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, '');
}

/**
 * 고지 문구 존재 검증.
 * 표준 문구 완전 일치를 요구하지 않고 "파트너스 + 수수료" 핵심 요소의 동시 존재를 본다
 * (문구 변형 허용, 단 핵심 의미는 필수).
 */
export function hasDisclosure(text: string): boolean {
  const n = normalize(text);
  return n.includes('파트너스') && n.includes('수수료');
}

/** 설명란에 고지가 없으면 끝에 표준 문구를 덧붙인다(있으면 그대로). */
export function withDisclosure(description: string): string {
  if (hasDisclosure(description)) return description;
  const sep = description.trim().length > 0 ? '\n\n' : '';
  return `${description}${sep}${PARTNERS_DISCLOSURE}`;
}
