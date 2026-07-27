/**
 * 목차(TOC) 헬퍼 — 순수 함수라 서버/클라이언트 양쪽에서 호출 가능해야 한다.
 * "use client" 모듈(components/blocks.tsx)에서 분리한 이유:
 * 서버 컴포넌트(app/library/[packId]/page.tsx)가 렌더링이 아니라
 * 일반 함수 호출로 tocFromBlocks()를 쓰기 때문 — client 모듈의 export는
 * 함수로 직접 호출할 수 없고 컴포넌트로 렌더링하거나 props로만 전달 가능하다.
 */
import type { PackBlock } from "@/data/types";

/** heading 블록의 앵커 id — 블록 인덱스 기반이라 제목이 바뀌어도 안정적 */
export function headingId(index: number): string {
  return `sec-${index}`;
}

/** heading 블록에서 목차 항목 추출 */
export function tocFromBlocks(
  blocks: PackBlock[],
): { id: string; en: string; ko?: string; level: 1 | 2 }[] {
  return blocks.flatMap((b, i) =>
    b.type === "heading" ? [{ id: headingId(i), en: b.en, ko: b.ko, level: b.level }] : [],
  );
}
