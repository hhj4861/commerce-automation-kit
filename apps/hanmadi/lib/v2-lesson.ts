import { sceneLessonPlans } from "./v2-scene-lessons";
import type { Phrase, Unit } from "./v2";

export function lessonPlan(unit: Unit) {
  return unit.source === "starter"
    ? sceneLessonPlans[unit.scene]?.[unit.level - 1]
    : undefined;
}
/** Each starter has a complete authored sequence; never pad with shared phrases. */
export function lessonPhrases(unit: Unit): Phrase[] {
  // A published admin item is one approved expression, not ten invented lesson steps.
  if (unit.source === "admin") return [unit.phrase];
  const plan = lessonPlan(unit);
  if (!plan) throw new Error("지원하지 않는 학습 상황이에요.");
  const index = { ja: 1, th: 3, en: 5, es: 7 }[unit.language];
  const phrases = plan.rows
    .trim()
    .split("\n")
    .map((row) => {
      const values = row.split("|");
      if (values.length !== 9 || values.some((value) => !value.trim()))
        throw new Error("학습 문장을 확인해 주세요.");
      return {
        text: values[index],
        reading: values[index + 1],
        meaning: values[0],
      };
    });
  if (phrases.length !== 10) throw new Error("학습 문장을 확인해 주세요.");
  return phrases;
}
