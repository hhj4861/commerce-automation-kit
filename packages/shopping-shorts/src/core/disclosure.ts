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

/** 영상 내 오버레이용 축약 고지(번인) — 쿠팡 파트너스 링크용. */
export const DISCLOSURE_OVERLAY_TEXT = '쿠팡 파트너스 활동으로 수수료를 제공받을 수 있음';

/** 쿠팡 외 제휴(네이버 쇼핑커넥트 등) 오버레이 — 공정위 지침상 "(광고)" 명시로 충분. */
export const DISCLOSURE_OVERLAY_TEXT_AD = '(광고)';

/**
 * 영상 오버레이 문구 — 플랫폼 무관 "(광고)" 통일(사용자 결정 2026-07-28).
 * 공정위 지침상 "(광고)" 명확 표기로 충분. 쿠팡 파트너스의 표준 문구 의무(약관)는
 * 영상이 아니라 **설명란**에서 충족한다(requiresPartnersPhrase 참조).
 */
export function overlayTextForUrl(_affiliateUrl: string | undefined): string {
  return DISCLOSURE_OVERLAY_TEXT_AD;
}

/**
 * 조립 시 영상 오버레이 결정 — 제휴 링크가 있거나 sponsored(유료 의뢰·자체 판매)면 "(광고)" 번인.
 * CLI 두 조립 경로가 이 한 함수만 본다(우회 경로 없음).
 */
export function overlaySpecFor(brief: {
  affiliateUrl?: string;
  sponsored?: boolean;
}): { overlay: boolean; text: string } {
  const hasAffiliate = typeof brief.affiliateUrl === 'string' && brief.affiliateUrl.length > 0;
  const overlay = hasAffiliate || brief.sponsored === true;
  return { overlay, text: overlayTextForUrl(brief.affiliateUrl) };
}

/** 쿠팡 파트너스 링크 여부 — 설명란에 파트너스 표준 문구(약관 의무)가 필요한 경우. */
export function requiresPartnersPhrase(affiliateUrl: string | undefined): boolean {
  return affiliateUrl !== undefined && /coupang\.com|coupa\.ng/.test(affiliateUrl);
}

/** 파트너스 표준 문구 존재(파트너스+수수료 동시) — 쿠팡 약관 의무 검증용. */
export function hasPartnersPhrase(text: string): boolean {
  const n = normalizeForCheck(text);
  return n.includes('파트너스') && n.includes('수수료');
}

/** 비교용 정규화 — NFKC + 공백 제거(공백 변형으로 검증을 우회하지 못하게). */
function normalizeForCheck(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, '');
}
const normalize = normalizeForCheck;

/**
 * 고지 문구 존재 검증. 유효 표기 두 갈래:
 * ① "파트너스 + 수수료" 동시 존재(쿠팡 파트너스 계열 문구 변형 허용)
 * ② "(광고)" 표기 — 공정위 심사지침이 인정하는 명확한 한글 표기(쇼핑커넥트 등 범용)
 */
export function hasDisclosure(text: string): boolean {
  const n = normalize(text);
  return (n.includes('파트너스') && n.includes('수수료')) || n.includes('(광고)');
}

/** 설명란에 고지가 없으면 끝에 표준 문구를 덧붙인다(있으면 그대로). */
export function withDisclosure(description: string): string {
  if (hasDisclosure(description)) return description;
  const sep = description.trim().length > 0 ? '\n\n' : '';
  return `${description}${sep}${PARTNERS_DISCLOSURE}`;
}
