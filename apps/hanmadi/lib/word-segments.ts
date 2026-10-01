import type { StudyLanguage } from "./v2";
export function wordSegments(text: string, language: StudyLanguage) {
  return Array.from(new Intl.Segmenter(language, { granularity: "word" }).segment(text),
    part => ({ text: part.segment, index: part.index, word: !!part.isWordLike }));
}
