import type { Phrase, Unit } from "./v2";
import { lessonRows } from "./v2-lesson-data";

/** Level-specific core expression followed by supporting scene dialogue. */
export function lessonPhrases(unit: Unit): Phrase[] {
  const rows = lessonRows[unit.scene];
  if (!rows) throw new Error("지원하지 않는 학습 상황이에요.");
  const index = { ja: 1, th: 3, en: 5, es: 7 }[unit.language];
  const supporting = `${rows}\n${lessonRows.common}`
    .trim()
    .split("\n")
    .map((row) => {
      const values = row.trim().split("|");
      if (values.length !== 9 || values.some((value) => !value.trim()))
        throw new Error("학습 문장을 확인해 주세요.");
      return {
        text: values[index],
        reading: values[index + 1],
        meaning: values[0],
      };
    });
  const seen = new Set<string>();
  const phrases = [unit.phrase, ...supporting]
    .filter((phrase) => {
      const normalized = phrase.text
        .normalize("NFKC")
        .replace(/[\s\p{P}]/gu, "")
        .toLowerCase();
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 10);
  if (phrases.length < 10) throw new Error("학습 문장이 부족해요.");
  return phrases;
}
