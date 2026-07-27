import type { LessonLog, LessonPuzzle, Student } from "@/data/types";

/**
 * 수업 기록에서 복습 퍼즐을 자동 생성한다.
 *
 * 학생이 그 수업에서 만난 문장 하나하나가 퍼즐이 된다:
 * - 새 표현(phrases)의 한국어 문장
 * - 교정(corrections)의 "자연스러운 표현" 문장
 * - 튜터가 지정한 대표 퍼즐(lesson.puzzle)이 있으면 맨 앞에
 *
 * 튜터는 아무 것도 추가로 입력하지 않아도 되고,
 * 수업 기록이 쌓일수록 복습 게임이 저절로 늘어난다.
 */

/** 어절 2개 미만이면 배열 게임이 성립하지 않는다 */
const MIN_WORDS = 2;
/** 너무 길면 초보 학생에게 부담 — 조각 수 상한 */
const MAX_WORDS = 8;

function splitWords(sentence: string): string[] {
  return sentence
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** 문장 → 퍼즐. 조각 수가 조건을 벗어나면 null */
function toPuzzle(params: {
  ko: string;
  en: string;
  rr: string;
  note?: string;
  source: LessonPuzzle["source"];
  id: string;
}): LessonPuzzle | null {
  const words = splitWords(params.ko);
  if (words.length < MIN_WORDS || words.length > MAX_WORDS) return null;
  if (!params.en.trim()) return null;

  return {
    en: params.en.trim(),
    words,
    rr: params.rr.trim(),
    note: params.note?.trim() || undefined,
    source: params.source,
    id: params.id,
  };
}

/** 같은 문장이 여러 번 나오면 한 번만 낸다 */
function dedupe(puzzles: LessonPuzzle[]): LessonPuzzle[] {
  const seen = new Set<string>();
  return puzzles.filter((p) => {
    const key = p.words.join(" ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 수업 1회의 퍼즐 목록 */
export function puzzlesForLesson(lesson: LessonLog): LessonPuzzle[] {
  const out: LessonPuzzle[] = [];

  if (lesson.puzzle) {
    out.push({
      ...lesson.puzzle,
      source: "featured",
      id: lesson.puzzle.id ?? `${lesson.id}:featured`,
    });
  }

  lesson.phrases.forEach((phrase, i) => {
    const puzzle = toPuzzle({
      ko: phrase.ko,
      en: phrase.en,
      rr: phrase.rr,
      note: phrase.example ? `예문: ${phrase.example}` : undefined,
      source: "phrase",
      id: `${lesson.id}:p${i}`,
    });
    if (puzzle) out.push(puzzle);
  });

  lesson.corrections.forEach((correction, i) => {
    // 학생 화면은 영어 우선이므로 문제·해설 문구도 영어로 만든다.
    // 튜터가 남긴 note가 있으면 그대로 쓰고(대부분 영어 설명), 없으면 기본 문구.
    const puzzle = toPuzzle({
      ko: correction.fixed,
      en: correction.note?.trim() || "Say it the natural way",
      rr: correction.rr,
      note: `You said: ${correction.said}`,
      source: "correction",
      id: `${lesson.id}:c${i}`,
    });
    if (puzzle) out.push(puzzle);
  });

  return dedupe(out);
}

export type PuzzleGroup = {
  lessonId: string;
  date: string;
  topic: string;
  puzzles: LessonPuzzle[];
};

/** 학생의 전체 퍼즐 — 최신 수업 순 */
export function puzzleGroupsForStudent(student: Student): PuzzleGroup[] {
  return [...student.lessons]
    .reverse()
    .map((lesson) => ({
      lessonId: lesson.id,
      date: lesson.date,
      topic: lesson.topic,
      puzzles: puzzlesForLesson(lesson),
    }))
    .filter((group) => group.puzzles.length > 0);
}

export function countPuzzles(groups: PuzzleGroup[]): number {
  return groups.reduce((n, g) => n + g.puzzles.length, 0);
}
