import type { HomeworkItem, LessonLog, VocabEntry } from "@/data/types";
import { romanize } from "@/lib/romanize";

/**
 * 숙제 연습 문장의 빈 로마자·영어를 표시 직전에 채운다.
 *
 * /live에서 "이 수업 표현 넣기"로 담긴 연습 문장이 자동 채움 전이면 rr·en이
 * 비어 있을 수 있다. 그러면 학생 화면에서 한국어만 나온다. 여기서:
 *  - rr: 그 수업 어휘(phrases)에서 같은 한국어를 찾고, 없으면 romanize로 생성
 *  - en: 그 수업 어휘에서 같은 한국어의 뜻을 찾는다 (번역은 하지 않는다)
 * 저장된 데이터는 그대로 두고, 렌더 시점에만 보정한다(기존 수업도 바로 고쳐짐).
 */

function normKo(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function enrichHomework(lesson: LessonLog): HomeworkItem[] {
  const vocab = new Map<string, VocabEntry>();
  for (const p of lesson.phrases) vocab.set(normKo(p.ko), p);

  return lesson.homework.map((h) => {
    if (!h.phrases || h.phrases.length === 0) return h;
    return {
      ...h,
      phrases: h.phrases.map((ph) => {
        const hit = ph.ko ? vocab.get(normKo(ph.ko)) : undefined;
        return {
          ko: ph.ko,
          rr: ph.rr?.trim() || hit?.rr || (ph.ko ? romanize(ph.ko) : ""),
          en: ph.en?.trim() || hit?.en || "",
        };
      }),
    };
  });
}
