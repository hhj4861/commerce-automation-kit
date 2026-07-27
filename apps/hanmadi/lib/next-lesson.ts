import type { HomeworkItem, Pack, Student, VocabEntry } from "@/data/types";
import { packs } from "@/data/packs";
import { puzzlesForLesson } from "@/lib/puzzles";

/**
 * 다음 수업 자료 자동 생성.
 *
 * 학생의 레벨 + 지금까지의 수업 기록(배운 표현, 교정 패턴)에서
 * "다음에 뭘 하면 되는지"를 규칙 기반으로 계산한다. 외부 API·LLM 호출 없이
 * 빌드된 학습 팩과 학생 데이터만으로 결정되므로 즉시·무료로 동작한다.
 *
 * 산출물
 * - nextPack   : 다음에 열 학습 팩 (레벨 트랙 순서 기준)
 * - focusAreas : 교정 기록에서 뽑은 약점 (예: 받침, 조사)
 * - reviewPhrases : 복습이 필요한 지난 표현
 * - homework   : 위 내용을 바탕으로 만든 숙제 초안 (튜터가 그대로 쓰거나 수정)
 */

export type FocusArea = {
  /** 약점 키 */
  key: string;
  /** 학생에게 보여줄 영어 라벨 */
  en: string;
  /** 튜터용 한국어 라벨 */
  ko: string;
  /** 이 약점이 나타난 교정 횟수 */
  count: number;
  /** 이 약점을 다루는 학습 팩 */
  packId?: string;
};

export type NextLessonPlan = {
  /** 다음 수업에서 열 팩 */
  nextPack?: Pack;
  /** 그 팩을 고른 이유 (튜터용 한국어) */
  reason: string;
  /** 학생 레벨에 맞는 트랙에서 몇 번째인지 */
  trackPosition?: { current: number; total: number };
  focusAreas: FocusArea[];
  reviewPhrases: VocabEntry[];
  /** 숙제 초안 */
  homework: HomeworkItem[];
};

/**
 * 교정 문장에서 약점을 찾는 규칙.
 * 튜터가 남긴 note와 교정 전후 문장을 함께 검사한다.
 */
const FOCUS_RULES: {
  key: string;
  en: string;
  ko: string;
  packId?: string;
  test: RegExp;
}[] = [
  {
    key: "batchim",
    en: "Final consonants (받침)",
    ko: "받침 발음",
    packId: "pronunciation-clinic",
    test: /받침|final consonant|batchim/i,
  },
  {
    key: "particles",
    en: "Particles (은/는, 이/가, 을/를)",
    ko: "조사 사용",
    packId: "grammar-first-steps",
    test: /조사|particle|은\/는|이\/가|을\/를|에서|에게/i,
  },
  {
    key: "politeness",
    en: "Polite endings (-요 / -습니다)",
    ko: "존댓말 어미",
    packId: "grammar-first-steps",
    test: /존댓말|polite|반말|-요|습니다|honorific/i,
  },
  {
    key: "counters",
    en: "Counters (개, 잔, 명…)",
    ko: "수량 단위",
    packId: "survival-phrases",
    test: /counter|단위|잔|개|명|마리/i,
  },
  {
    key: "pronunciation",
    en: "Pronunciation & linking",
    ko: "발음·연음",
    packId: "pronunciation-clinic",
    test: /발음|pronounce|pronunciation|연음|linking|sounds like/i,
  },
  {
    key: "wordorder",
    en: "Word order (verb last)",
    ko: "어순",
    packId: "grammar-first-steps",
    test: /어순|word order|verb (comes )?last/i,
  },
];

/** 레벨별 학습 트랙 — order가 있는 팩을 순서대로 */
export function trackForLevel(level: Student["level"]): Pack[] {
  const ordered = packs
    .filter((p) => p.order !== undefined)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  if (level === "absolute-beginner") return ordered;

  // 초보 이상은 완전 초보 전용 팩(한글 기초)을 건너뛴다
  const levelRank: Record<Student["level"], number> = {
    "absolute-beginner": 0,
    beginner: 1,
    "upper-beginner": 2,
  };
  return ordered.filter((p) => levelRank[p.level] >= levelRank[level] - 1);
}

/** 교정 기록에서 약점 집계 */
function detectFocusAreas(student: Student): FocusArea[] {
  const counts = new Map<string, number>();

  for (const lesson of student.lessons) {
    for (const correction of lesson.corrections) {
      const haystack = `${correction.note ?? ""} ${correction.said} ${correction.fixed}`;
      for (const rule of FOCUS_RULES) {
        if (rule.test.test(haystack)) {
          counts.set(rule.key, (counts.get(rule.key) ?? 0) + 1);
        }
      }
    }
  }

  return FOCUS_RULES.filter((rule) => counts.has(rule.key))
    .map((rule) => ({
      key: rule.key,
      en: rule.en,
      ko: rule.ko,
      count: counts.get(rule.key) ?? 0,
      packId: rule.packId,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

/** 최근 수업 제외, 그 이전 표현에서 복습 대상을 뽑는다 */
function pickReviewPhrases(student: Student, limit = 4): VocabEntry[] {
  const older = student.lessons.slice(0, -1);
  const pool = older.flatMap((l) => l.phrases);
  if (pool.length === 0) return [];

  // 오래된 것부터 균등하게 뽑아 편중을 줄인다
  const step = Math.max(1, Math.floor(pool.length / limit));
  const picked: VocabEntry[] = [];
  for (let i = 0; i < pool.length && picked.length < limit; i += step) {
    picked.push(pool[i]);
  }
  return picked;
}

/**
 * 숙제 초안 — 퍼즐 중심.
 *
 * 이 앱의 핵심은 "수업에서 배운 표현·교정이 학생 포털에서 자동으로 복습
 * 퍼즐이 된다"는 것이다. 그래서 숙제의 1순위(리드)는 항상 **이번 수업 퍼즐
 * 풀기**이고, 이건 튜터가 문장을 지어낼 필요 없이 자동 생성된다.
 * 나머지(발음·약점 교정·지난 퍼즐 복습·다음 팩 예습)는 보조로 뒤따른다.
 */
function buildHomework(params: {
  nextPack?: Pack;
  focusAreas: FocusArea[];
  reviewPhrases: VocabEntry[];
  latestPhrases: VocabEntry[];
  /** 최신 수업에서 자동 생성되는 퍼즐 개수 — puzzlesForLesson(latest).length */
  latestPuzzleCount: number;
}): HomeworkItem[] {
  const items: HomeworkItem[] = [];

  // 리드: 이번 수업 복습 퍼즐. 퍼즐이 하나라도 있을 때만 (첫 등록 직후엔 폴백).
  if (params.latestPuzzleCount > 0) {
    const n = params.latestPuzzleCount;
    items.push({
      en: "Complete this lesson's review puzzles",
      ko: "이번 수업 복습 퍼즐 풀기",
      how: "Open your portal and tap “Start review”. This lesson's new phrases and corrections already turned into puzzles — solve them all to lock in what you just learned.",
      target: `${n} puzzle${n === 1 ? "" : "s"}`,
      phrases: params.latestPhrases.slice(0, 3),
    });
  }

  if (params.latestPhrases.length > 0) {
    items.push({
      en: "Say today's phrases out loud",
      ko: "오늘 배운 표현 소리 내어 말하기",
      rr: "oneul baeun pyohyeon sori naeeo malhagi",
      how: "Read each phrase 3 times: once slowly, once at normal speed, once while recording yourself. Compare your recording with how it sounded in class.",
      target: "3 times a day · about 5 minutes",
      phrases: params.latestPhrases.slice(0, 5),
    });
  }

  const topFocus = params.focusAreas[0];
  if (topFocus) {
    items.push({
      en: `Fix one thing: ${topFocus.en}`,
      ko: `약점 하나만 집중: ${topFocus.ko}`,
      how: `This came up ${topFocus.count} time${topFocus.count === 1 ? "" : "s"} in class. Open the linked pack, read the examples out loud, then write 2 sentences of your own using the same pattern.`,
      target: "2 sentences · about 10 minutes",
      packId: topFocus.packId,
    });
  }

  // 지난 수업 퍼즐 이어풀기 — 리드(이번 수업)와 문구를 명확히 구분한다.
  if (params.reviewPhrases.length > 0) {
    items.push({
      en: "Catch up on past-lesson puzzles",
      ko: "지난 수업 퍼즐 이어서 풀기",
      how: "Back in “Start review”, finish any puzzles from earlier lessons you haven't solved yet — they keep your older phrases fresh.",
      target: "5 puzzles",
      phrases: params.reviewPhrases.slice(0, 3),
    });
  }

  if (params.nextPack) {
    items.push({
      en: `Preview next lesson: ${params.nextPack.title.en}`,
      ko: `다음 수업 예습: ${params.nextPack.title.ko}`,
      how: "Skim the pack before class — you don't need to memorize anything. Just note 1-2 things you want to ask about.",
      target: "about 10 minutes",
      packId: params.nextPack.id,
    });
  }

  return items;
}

export function buildNextLessonPlan(student: Student): NextLessonPlan {
  const track = trackForLevel(student.level);
  const focusAreas = detectFocusAreas(student);

  // 트랙 진행 위치 — 수업 횟수를 기준으로 삼되 트랙 길이를 넘지 않게
  const index = Math.min(student.lessons.length, Math.max(0, track.length - 1));
  const nextPack = track[index];

  // 약점이 뚜렷하면 트랙보다 약점 팩을 우선한다
  const focusPack = focusAreas[0]?.packId
    ? packs.find((p) => p.id === focusAreas[0].packId)
    : undefined;
  const useFocusPack = Boolean(focusPack && (focusAreas[0]?.count ?? 0) >= 2);
  const chosen = useFocusPack ? focusPack : nextPack;

  const reason = useFocusPack
    ? `교정 기록에서 ${focusAreas[0].ko} 문제가 ${focusAreas[0].count}회 나와 해당 팩을 먼저 배치했다.`
    : chosen
      ? `${student.level === "absolute-beginner" ? "완전 초보" : student.level === "beginner" ? "초보" : "초중급"} 트랙 순서상 다음 팩이다 (수업 ${student.lessons.length}회 완료).`
      : "레벨에 맞는 다음 팩이 없다 — 새 팩을 추가하거나 자유 회화로 진행한다.";

  const latest = student.lessons[student.lessons.length - 1];
  // 최신 수업이 만들어내는 복습 퍼즐 개수 — 리드 숙제("이번 수업 퍼즐 풀기")의 근거
  const latestPuzzleCount = latest ? puzzlesForLesson(latest).length : 0;
  const reviewPhrases = pickReviewPhrases(student);

  return {
    nextPack: chosen,
    reason,
    trackPosition: track.length
      ? { current: Math.min(index + 1, track.length), total: track.length }
      : undefined,
    focusAreas,
    reviewPhrases,
    homework: buildHomework({
      nextPack: chosen,
      focusAreas,
      reviewPhrases,
      latestPhrases: latest?.phrases ?? [],
      latestPuzzleCount,
    }),
  };
}
