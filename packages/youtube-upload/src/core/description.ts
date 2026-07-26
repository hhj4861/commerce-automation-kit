/**
 * 설명란 조립 (순수). 유튜브 챕터는 설명에 "0:00 …" 타임스탬프가 있어야 인식된다
 * (첫 챕터 0:00, 최소 3개, 각 10초 이상). longform-mix 가 만든 챕터 텍스트를 그대로 삽입.
 */

/** base 설명 + (있으면) 챕터 블록. */
export function buildDescription(base: string, chapters?: string): string {
  const b = base.trim();
  if (chapters === undefined || chapters.trim().length === 0) return b;
  const c = chapters.trim();
  return b.length === 0 ? c : `${b}\n\n${c}`;
}
