import type { StudyLanguage } from "./v2";

export type MusicStudyTarget = { id: string; language: StudyLanguage };
export function musicStudyHref(base: string, song: MusicStudyTarget): string {
  return `${base}/music/${song.language}/${encodeURIComponent(song.id)}`;
}
