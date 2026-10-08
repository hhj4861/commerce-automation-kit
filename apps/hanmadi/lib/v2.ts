import { curriculum } from "./v2-curriculum";
export const studyLanguages = {
  en: { name: "영어", native: "English", locale: "en-US", mark: "EN" },
  ja: { name: "일본어", native: "日本語", locale: "ja-JP", mark: "JA" },
  th: { name: "태국어", native: "ภาษาไทย", locale: "th-TH", mark: "TH" },
  es: { name: "스페인어", native: "Español", locale: "es-ES", mark: "ES" },
} as const;
export type StudyLanguage = keyof typeof studyLanguages;
export const isStudyLanguage = (v: unknown): v is StudyLanguage =>
  typeof v === "string" && Object.hasOwn(studyLanguages, v);
export const isLevel = (v: unknown): v is number =>
  Number.isInteger(v) && Number(v) >= 1 && Number(v) <= 4;
export type Phrase = { text: string; meaning: string; reading: string };
export type Unit = {
  id: string;
  language: StudyLanguage;
  scene: string;
  level: number;
  title: string;
  phrase: Phrase;
  source: "starter" | "admin" | "music";
};
export type Expression = Phrase & {
  id: string;
  language: StudyLanguage;
  source: "translation" | "chat" | "vocabulary";
  inVocabulary?: boolean;
  createdAt: number;
  dueAt: number;
  practicedAt?: number;
  confidence?: "help" | "alone";
};
export type Profile = {
  level: number;
  minutes: number;
  assessedAt: number;
  practiced: Record<string, { at: number; confidence: "help" | "alone" }>;
  completedLessons?: Record<string, { at: number; phrases: number }>;
};
export type StudyState = {
  revision: number;
  saveEpoch: number;
  autoSave: boolean;
  autoSaveChat?: boolean;
  language?: StudyLanguage;
  profiles: Partial<Record<StudyLanguage, Profile>>;
  expressions: Expression[];
};
export const emptyStudy = (): StudyState => ({
  revision: 0,
  saveEpoch: 0,
  autoSave: false,
  autoSaveChat: true,
  profiles: {},
  expressions: [],
});
export function starterUnits(language: StudyLanguage): Unit[] {
  const index = { ja: 1, th: 3, en: 5, es: 7 }[language];
  return curriculum.scenes.flatMap((scene) =>
    scene.phrases.map((p, i) => ({
      id: `starter:${language}:${scene.id}:${i + 1}`,
      language,
      scene: scene.id,
      level: i + 1,
      title: scene.topics[i],
      phrase: { text: p[index], reading: p[index + 1], meaning: p[0] },
      source: "starter" as const,
    })),
  );
}
export function studyQueue(
  state: StudyState,
  language: StudyLanguage,
  units: Unit[],
  now = Date.now(),
) {
  const profile = state.profiles[language];
  const level = profile?.level ?? 1;
  const due = state.expressions
    .filter((e) => e.language === language && e.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt);
  function priority(unit: Unit) {
    const previous = profile?.practiced[unit.id];
    const completed = profile?.completedLessons?.[unit.id];
    if (completed && (!previous || completed.at > previous.at))
      return completed.at + 86400000 <= now ? 2 : 3;
    if (!previous) return 1;
    const dueAt =
      previous.at + (previous.confidence === "help" ? 1 : 3) * 86400000;
    return dueAt <= now ? (previous.confidence === "help" ? 0 : 2) : 3;
  }
  const lessons = units
    .filter((u) => u.language === language && u.level === level)
    .sort(
      (a, b) =>
        priority(a) - priority(b) ||
        (profile?.practiced[a.id]?.at ?? 0) -
          (profile?.practiced[b.id]?.at ?? 0),
    );
  return {
    due: due.slice(0, 3),
    lessons: lessons.slice(
      0,
      Math.max(1, Math.floor((profile?.minutes ?? 10) / 5)),
    ),
    level,
  };
}
export function assessmentLevel(answers: number[], confidence: number) {
  // App practice levels, not a certified proficiency or pronunciation assessment.
  const score = answers.reduce(
    (sum, v, i) => sum + Number(v === [0, 1, 2][i]),
    0,
  );
  return Math.min(score + 1, Math.max(1, confidence));
}
export function detectDirection(
  text: string,
  language: StudyLanguage,
): "ko" | StudyLanguage | "confirm" {
  const ko = /[가-힣]/.test(text),
    target =
      language === "ja"
        ? /[ぁ-ゖァ-ヺ一-龯]/.test(text)
        : language === "th"
          ? /[ก-๛]/.test(text)
          : /[a-záéíóúñü¿¡]/i.test(text);
  if (ko && !target) return "ko";
  if (target && !ko && text.trim().length >= 4) return language;
  return "confirm";
}
export function safePractice(phrase: Phrase) {
  const all = `${phrase.text} ${phrase.meaning} ${phrase.reading}`;
  return (
    [phrase.text, phrase.meaning, phrase.reading].every(
      (v) => typeof v === "string" && v.trim().length > 0 && v.length <= 300,
    ) && !/https?:|www\.|@|\d{3}|[\w.-]+\.[a-z]{2,}\b/i.test(all)
  );
}
export { curriculum };

export function hasLessonProgress(profile: Profile | undefined, id: string) {
  return Boolean(profile?.practiced[id] || profile?.completedLessons?.[id]);
}

export function isVocabulary(expression: Expression) {
  return expression.source === "vocabulary" || expression.inVocabulary === true;
}
