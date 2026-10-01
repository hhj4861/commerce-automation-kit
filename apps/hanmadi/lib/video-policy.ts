import type { Phrase, StudyLanguage } from "./v2";
import type { ContentDraft } from "./knowledge";
export const VIDEO_SELECTION_LIMIT = 10;
export const VIDEO_CONCURRENCY = 3;
export const VIDEO_MAX_SECONDS = 15 * 60;
export const VIDEO_RUBRIC = "hanmadi-video-jev-v3";
export type VideoSettings = {
  language: StudyLanguage;
  scene: string;
  level: number;
};
export type VideoEvidence = Phrase & { at: number; evidence: string };
export type VideoAnalysis = {
  title: string;
  seconds: number;
  units: VideoEvidence[];
};
export type VideoJudgment = {
  index: number;
  choice: "useful" | "duplicate" | "irrelevant" | "unreliable";
  confidence: number;
  accepted: boolean;
};
export type VideoResult = {
  state: "created" | "skipped" | "failed" | "running";
  message: string;
  draft?: ContentDraft;
  judgments?: VideoJudgment[];
};
export const normalizedExpression = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, "");
