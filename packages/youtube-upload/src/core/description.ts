/**
 * 설명란 조립 (순수). 유튜브 챕터는 설명에 "0:00 …" 타임스탬프가 있어야 인식된다
 * (첫 챕터 0:00, 최소 3개, 각 10초 이상). longform-mix 가 만든 챕터 텍스트를 그대로 삽입.
 * 해시태그는 설명 하단에 "#a #b"로 붙는다(유튜브가 첫 3개를 제목 위에 노출).
 */

/** 해시태그 배열 → "#a #b" (선행 #·공백 제거, 빈 것 제외). */
export function formatHashtags(tags: string[]): string {
  return tags
    .map((t) => t.replace(/^#+/, '').replace(/\s+/g, ''))
    .filter((t) => t.length > 0)
    .map((t) => `#${t}`)
    .join(' ');
}

/** base 설명 + (있으면) 챕터 + (있으면) 해시태그. */
export function buildDescription(base: string, chapters?: string, hashtags?: string[]): string {
  const parts: string[] = [];
  const b = base.trim();
  if (b.length > 0) parts.push(b);
  if (chapters !== undefined && chapters.trim().length > 0) parts.push(chapters.trim());
  if (hashtags !== undefined && hashtags.length > 0) {
    const h = formatHashtags(hashtags);
    if (h.length > 0) parts.push(h);
  }
  return parts.join('\n\n');
}
