import { courses, type Language } from "./courses";

export const learningLevels = {
  beginner: { label: "입문", difyLevel: "입문", guide: "한 번에 짧은 표현 하나와 따라 말할 예시를 제시하세요. 선택형 질문으로 도와주세요.", task: "표현을 보고 한 문장씩 따라 말하기", reviewDays: 1 },
  elementary: { label: "기초", difyLevel: "초급", guide: "쉬운 문장 두 개로 답하고 예시를 조금씩 줄이세요. 주문·위치 같은 일상 질문을 하세요.", task: "이름·수량·장소를 바꿔 두 문장 만들기", reviewDays: 2 },
  intermediate: { label: "중급 연습", difyLevel: "중급", guide: "일상 역할극에서 이유·경험을 묻고 세 문장 이내로 대화를 이어가세요. 완성 답안보다 힌트를 먼저 주세요.", task: "예시 없이 상황을 설명하고 이유 덧붙이기", reviewDays: 3 },
} as const;
export type LearningLevel = keyof typeof learningLevels;
export type Difficulty = "easy" | "right" | "hard";
export type LearningEvent =
  | { kind: "assessment"; id: string; at: number; level: LearningLevel; score: number; minutes: 10 | 15 | 20; days: 3 | 5 | 7; timeZone: string }
  | { kind: "feedback"; id: string; at: number; assessmentId: string; difficulty: Difficulty }
  | { kind: "quiz"; id: string; at: number; assessmentId: string; lessonId: string; correct: boolean }
  | { kind: "chat"; id: string; at: number; assessmentId: string; lessonId: string };
export type LearningProfile = {
  assessmentId: string; assessedAt: number; score: number; baseline: LearningLevel; level: LearningLevel;
  confirmed: boolean; chatTurns: number; todayChatTurns: number; feedbackToday: boolean; minutes: 10 | 15 | 20; days: 3 | 5 | 7; timeZone: string;
  completed: string[]; review: { lessonId: string; at: number; correct: boolean }[];
  revision: string;
};
const order: LearningLevel[] = ["beginner", "elementary", "intermediate"];
export function learningTask(level: LearningLevel, lessonId: string): string {
  if (level === "beginner") return learningLevels[level].task;
  const tasks: Record<string, [string, string]> = {
    greetings: ["자기소개에 사는 곳이나 좋아하는 것을 더해 두 문장으로 말하기", "자기소개와 이 언어를 배우는 이유를 말하고 상대에게 질문하기"],
    cafe: ["음료의 종류와 수량을 바꿔 주문하고 가격 물어보기", "원하는 메뉴가 없을 때 대안을 묻고 주문을 바꾼 이유 설명하기"],
    directions: ["가고 싶은 장소와 현재 위치를 말하고 길 물어보기", "가는 길을 두 단계로 설명하고 대중교통과 걷기를 비교하기"],
  };
  return tasks[lessonId]?.[level === "elementary" ? 0 : 1] ?? learningLevels[level].task;
}
export function adjustLevel(level: LearningLevel, difficulty: Difficulty): LearningLevel {
  return order[Math.max(0, Math.min(2, order.indexOf(level) + (difficulty === "hard" ? -1 : difficulty === "easy" ? 1 : 0)))];
}
export function learningProfile(events: LearningEvent[], now = Date.now()): LearningProfile | null {
  const sorted = [...events].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  const assessment = sorted.filter((e) => e.kind === "assessment").at(-1);
  if (!assessment) return null;
  const active = sorted.filter((e) => "assessmentId" in e && e.assessmentId === assessment.id);
  const feedback = active.filter((e) => e.kind === "feedback");
  let level = assessment.level;
  for (const e of feedback) level = adjustLevel(level, e.difficulty);
  const quizzes = active.filter((e) => e.kind === "quiz");
  return {
    assessmentId: assessment.id, assessedAt: assessment.at, score: assessment.score, baseline: assessment.level,
    level, confirmed: feedback.length > 0, chatTurns: active.filter((e) => e.kind === "chat").length,
    todayChatTurns: active.filter(e => e.kind === "chat" && localDay(e.at, assessment.timeZone) === localDay(now, assessment.timeZone)).length,
    feedbackToday: feedback.some(e => localDay(e.at, assessment.timeZone) === localDay(now, assessment.timeZone)),
    minutes: assessment.minutes, days: assessment.days, timeZone: assessment.timeZone,
    completed: [...new Set(quizzes.filter(e => e.correct).map(e => e.lessonId))],
    review: [...new Map(quizzes.map(e => [e.lessonId, { lessonId: e.lessonId, at: e.at, correct: e.correct }])).values()],
    revision: feedback.at(-1)?.id ?? assessment.id,
  };
}
export function localDay(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  return ["year", "month", "day"].map(k => parts.find(p => p.type === k)!.value).join("-");
}
function addDays(day: string, days: number) {
  return new Date(Date.parse(day + "T12:00:00Z") + days * 86400000).toISOString().slice(0, 10);
}
export function studyPlan(language: Language, profile: LearningProfile, now = Date.now()) {
  const today = localDay(now, profile.timeZone);
  const latest = new Map(profile.review.map(e => [e.lessonId, e]));
  const projected = new Map(profile.review.map(e => [e.lessonId, { day: localDay(e.at, profile.timeZone), correct: e.correct }]));
  const practicedToday = [...profile.review].filter(e => localDay(e.at, profile.timeZone) === today).sort((a, b) => a.at - b.at)[0];
  return Array.from({ length: profile.days }, (_, i) => {
    const date = addDays(today, Math.floor(i * 7 / profile.days));
    function priority(id: string) {
      const progress = projected.get(id);
      if (!progress) return 1;
      const due = addDays(progress.day, progress.correct ? learningLevels[profile.level].reviewDays : 1);
      return due <= date ? (progress.correct ? 2 : 0) : 3;
    }
    const lesson = i === 0 && practicedToday ? courses[language].find(l => l.id === practicedToday.lessonId)!
      : [...courses[language]].sort((a, b) => priority(a.id) - priority(b.id))[0];
    const progress = latest.get(lesson.id);
    const projectedProgress = projected.get(lesson.id);
    const done = !!progress && localDay(progress.at, profile.timeZone) === date;
    const review = !!projectedProgress;
    // Future slots assume practice; actual first attempts replace this projection on the next visit.
    if (!done) projected.set(lesson.id, { day: date, correct: true });
    return { date, lessonId: lesson.id, title: lesson.title, minutes: profile.minutes,
      type: review ? "복습" : "표현 연습", task: learningTask(profile.level, lesson.id),
      reason: projectedProgress && !projectedProgress.correct ? "지난 확인 문제를 다시 연습해요." : review ? "익힌 표현을 다시 꺼내 말해요." : "새 상황에서 한마디를 연습해요.",
      expressionMinutes: Math.ceil(profile.minutes * (profile.level === "beginner" ? 0.6 : 0.3)), done };
  });
}
export function assessmentHref(language: Language, studentSlug?: string, from = "/learn") {
  return `/assessment?${new URLSearchParams({ language, from, ...(studentSlug ? { s: studentSlug } : {}) })}`;
}
