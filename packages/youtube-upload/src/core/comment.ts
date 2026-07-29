/**
 * 댓글 텍스트 검증 (순수). 쇼츠는 설명란이 접혀 보여서 파트너스 링크를 댓글로 다는데,
 * 제휴 링크가 있는 댓글은 대가성 고지 없이는 발행 경로가 없어야 한다(프로젝트 하드 규칙).
 *
 * 고지 판정("파트너스"+"수수료" 동시 존재, NFKC·공백 무시)은 shopping-shorts 의
 * disclosure.ts 와 동일 의미다 — 원자끼리 직접 import 금지 규약 때문에 최소 재구현이며,
 * 의미를 바꿀 때는 양쪽을 함께 바꿀 것.
 */

/** 쿠팡 제휴(파트너스) 링크 패턴 — 단축 도메인 포함. */
const AFFILIATE_LINK = /link\.coupang\.com|coupa\.ng/i;

function normalize(text: string): string {
  return text.normalize('NFKC').replace(/\s+/g, '');
}

/** 대가성 고지 존재 판정(shopping-shorts hasDisclosure 와 동일 의미). */
export function hasDisclosure(text: string): boolean {
  const n = normalize(text);
  return n.includes('파트너스') && n.includes('수수료');
}

/**
 * 댓글 텍스트 검증 → 문제 목록(비면 통과).
 * - 빈 텍스트 거부
 * - 유튜브 댓글 한도(10,000자) 초과 거부
 * - 제휴 링크 포함 + 고지 누락 거부
 */
export function validateCommentText(text: string): string[] {
  const problems: string[] = [];
  if (text.trim().length === 0) problems.push('댓글 텍스트가 비어 있음');
  if (text.length > 10_000) problems.push(`댓글이 10,000자 초과(${text.length}자)`);
  if (AFFILIATE_LINK.test(text) && !hasDisclosure(text)) {
    problems.push(
      '제휴(파트너스) 링크가 있는데 대가성 고지("파트너스"+"수수료")가 없음 — 고지 없이 발행 불가',
    );
  }
  return problems;
}
