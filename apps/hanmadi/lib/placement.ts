import type { PackLevel, PlacementResult } from "@/data/types";

/**
 * 레벨 진단 — 학생이 공개 링크로 스스로 푸는 배치 테스트.
 *
 * 세 축을 순서대로 측정한다:
 *  1) hangul  — 한글을 읽을 수 있는가 (자모·글자)
 *  2) vocab   — 기본 단어·표현을 아는가
 *  3) grammar — 조사·어순·존댓말 등 기초 문법·회화
 *
 * 점수 → 레벨 규칙 (suggestLevel):
 *  - 한글을 거의 못 읽으면      → absolute-beginner (한글 기초부터)
 *  - 한글은 읽지만 문법이 약하면 → beginner
 *  - 문법·회화까지 어느 정도면   → upper-beginner
 *
 * 채점은 서버에서 한다 (정답이 클라이언트 번들에 노출되지 않게).
 */

export type PlacementAxis = "hangul" | "vocab" | "grammar";

export type PlacementQuestion = {
  id: string;
  axis: PlacementAxis;
  /** 문제 (영어 — 학생 화면) */
  prompt: string;
  /** 보조 표시 (한국어 자모/단어 등) */
  display?: string;
  /** display의 로마자 (선택) */
  displayRr?: string;
  /** 선택지 */
  choices: string[];
  /** 정답 인덱스 — 서버 전용 (클라이언트로 보내지 않는다) */
  answer: number;
  /** 정답 해설 (결과 화면에서 학습 포인트로 보여줄 수 있다) */
  explain?: string;
};

/**
 * 진단 문항 (12개: 축별 4개).
 * 쉬운 것 → 어려운 것 순으로 배치해, 학생이 자연스럽게 자기 수준에서 막히게 한다.
 */
export const PLACEMENT_QUESTIONS: PlacementQuestion[] = [
  // ── 한글 읽기 ────────────────────────────────
  {
    id: "h1",
    axis: "hangul",
    prompt: "Which sound is this letter?",
    display: "ㅁ",
    choices: ["m", "k", "s", "p"],
    answer: 0,
    explain: "ㅁ = m (미음)",
  },
  {
    id: "h2",
    axis: "hangul",
    prompt: "Read this syllable:",
    display: "가",
    displayRr: "?",
    choices: ["ga", "na", "da", "ba"],
    answer: 0,
    explain: "ㄱ(g) + ㅏ(a) = 가 (ga)",
  },
  {
    id: "h3",
    axis: "hangul",
    prompt: "Read this word:",
    display: "우유",
    choices: ["uyu (milk)", "oi (cucumber)", "ai (child)", "yeou (fox)"],
    answer: 0,
    explain: "우유 = uyu = milk",
  },
  {
    id: "h4",
    axis: "hangul",
    prompt: "Which word has a final consonant (받침)?",
    choices: ["밥 (bap)", "다 (da)", "노 (no)", "미 (mi)"],
    answer: 0,
    explain: "밥 ends in ㅂ — that bottom consonant is a 받침.",
  },
  // ── 어휘 ────────────────────────────────
  {
    id: "v1",
    axis: "vocab",
    prompt: "What does 안녕하세요 mean?",
    display: "안녕하세요",
    displayRr: "annyeonghaseyo",
    choices: ["Hello", "Thank you", "Goodbye", "Sorry"],
    answer: 0,
  },
  {
    id: "v2",
    axis: "vocab",
    prompt: "How do you say “Thank you”?",
    choices: ["감사합니다", "미안해요", "괜찮아요", "안녕히 가세요"],
    answer: 0,
    explain: "감사합니다 (gamsahamnida) = Thank you",
  },
  {
    id: "v3",
    axis: "vocab",
    prompt: "What does 얼마예요? mean?",
    display: "얼마예요?",
    displayRr: "eolmayeyo?",
    choices: ["How much is it?", "What is it?", "Where is it?", "Who is it?"],
    answer: 0,
  },
  {
    id: "v4",
    axis: "vocab",
    prompt: "Which one means “water”?",
    choices: ["물", "불", "말", "밀"],
    answer: 0,
    explain: "물 (mul) = water",
  },
  // ── 문법·회화 ────────────────────────────────
  {
    id: "g1",
    axis: "grammar",
    prompt: "Korean sentence order is:",
    choices: [
      "Subject – Object – Verb",
      "Subject – Verb – Object",
      "Verb – Subject – Object",
      "Object – Verb – Subject",
    ],
    answer: 0,
    explain: "Korean puts the verb last: 저는 사과를 먹어요 (I an apple eat).",
  },
  {
    id: "g2",
    axis: "grammar",
    prompt: "“I came FROM the U.S.” — pick the right particle:",
    choices: ["미국에서 왔어요", "미국에 왔어요", "미국을 왔어요", "미국도 왔어요"],
    answer: 0,
    explain: "에서 = from a place, 에 = to a place.",
  },
  {
    id: "g3",
    axis: "grammar",
    prompt: "Which is the polite form of “to eat”?",
    choices: ["먹어요", "먹다", "먹어", "먹자"],
    answer: 0,
    explain: "먹어요 adds the polite -요 ending. 먹다 is the dictionary form.",
  },
  {
    id: "g4",
    axis: "grammar",
    prompt: "Order one coffee politely:",
    choices: [
      "커피 한 잔 주세요",
      "커피 하나 있어요",
      "커피 한 잔 먹다",
      "커피 주다 하나",
    ],
    answer: 0,
    explain: "잔 is the counter for drinks; 주세요 = please give me.",
  },
];

const AXES: PlacementAxis[] = ["hangul", "vocab", "grammar"];

/** 클라이언트로 내보낼 문항 (정답 제거) */
export type PublicQuestion = Omit<PlacementQuestion, "answer">;

export function publicQuestions(): PublicQuestion[] {
  return PLACEMENT_QUESTIONS.map(({ answer: _answer, ...rest }) => rest);
}

/** 점수 → 제안 레벨 */
function suggestLevel(axes: PlacementResult["axes"]): PackLevel {
  const rate = (a: { correct: number; total: number }) =>
    a.total === 0 ? 0 : a.correct / a.total;

  // 한글을 절반도 못 읽으면 완전 초보 (한글 기초부터)
  if (rate(axes.hangul) < 0.5) return "absolute-beginner";
  // 한글은 읽지만 문법이 약하면 초보
  if (rate(axes.grammar) < 0.5) return "beginner";
  // 어휘·문법까지 어느 정도면 초중급
  if (rate(axes.vocab) >= 0.5 && rate(axes.grammar) >= 0.5) {
    return "upper-beginner";
  }
  return "beginner";
}

/**
 * 채점 — answers는 { [questionId]: choiceIndex }.
 * takenAt은 호출자가 넣는다 (라우트에서 서버 시각).
 */
export function scorePlacement(
  answers: Record<string, number>,
  takenAt: number,
): PlacementResult {
  const axes: PlacementResult["axes"] = {
    hangul: { correct: 0, total: 0 },
    vocab: { correct: 0, total: 0 },
    grammar: { correct: 0, total: 0 },
  };

  for (const q of PLACEMENT_QUESTIONS) {
    axes[q.axis].total += 1;
    if (answers[q.id] === q.answer) axes[q.axis].correct += 1;
  }

  const totalCorrect = AXES.reduce((n, ax) => n + axes[ax].correct, 0);
  const totalQ = PLACEMENT_QUESTIONS.length;
  const score = totalQ === 0 ? 0 : Math.round((totalCorrect / totalQ) * 100);

  return { suggestedLevel: suggestLevel(axes), score, axes, takenAt };
}

/** 레벨 표시 (한/영) */
export const PLACEMENT_LEVEL_LABEL: Record<PackLevel, { en: string; ko: string }> = {
  "absolute-beginner": { en: "Absolute Beginner", ko: "완전 초보" },
  beginner: { en: "Beginner", ko: "초보" },
  "upper-beginner": { en: "Upper Beginner", ko: "초중급" },
};
