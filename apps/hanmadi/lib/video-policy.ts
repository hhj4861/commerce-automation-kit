import type { Phrase, StudyLanguage } from "./v2";
import type { ContentDraft } from "./knowledge";
export const VIDEO_SELECTION_LIMIT = 10;
export const VIDEO_CONCURRENCY = 3;
export const VIDEO_MAX_SECONDS = 15 * 60;
export const VIDEO_RUBRIC = "hanmadi-video-jev-v6";
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
export type VideoChoice = "useful" | "duplicate" | "irrelevant" | "unreliable";
export type VideoEvaluation = {
  choice: VideoChoice;
  confidence: number;
  probabilities: Record<VideoChoice, number>;
};
export type VideoPairEvaluation = {
  referenceIndex: number;
  choice: "duplicate" | "distinct";
  confidence: number;
  probabilities: Record<"duplicate" | "distinct", number>;
  used: boolean;
};
export const VIDEO_CHECKS = ["meaning", "reading", "evidence", "relevance", "novelty"] as const;
export type VideoCheck = typeof VIDEO_CHECKS[number];
export type VideoCheckEvaluation = {
  choice: "pass" | "fail";
  confidence: number;
  probabilities: Record<"pass" | "fail", number>;
};
export type VideoChecks = Record<VideoCheck, VideoCheckEvaluation>;
export type VideoDisposition = "accepted" | "review" | "excluded";
export type VideoJudgment = {
  index: number;
  choice: VideoChoice;
  confidence: number;
  accepted: boolean;
  // Optional for existing v4 drafts. choice retains the effective classification;
  // evaluation records the original model answer even when exact dedupe overrides it.
  disposition?: VideoDisposition;
  reason?: "qualified" | "low_confidence" | "classified_negative" | "exact_duplicate" | "batch_duplicate" | "uncertain_duplicate";
  evaluation?: VideoEvaluation;
  // v6 stores atomic model answers, never an invented four-class probability.
  checks?: VideoChecks;
  decidingCheck?: VideoCheck;
  comparisons?: VideoPairEvaluation[];
};
export function confidentVideoChoice(a: { choice: string; confidence: number; probabilities: Record<string, number> }) {
  return a.confidence >= 0.85 && a.probabilities[a.choice] >= 0.9;
}
export function classifyVideoJudgment(index: number, evaluation: VideoEvaluation, exactDuplicate = false): VideoJudgment {
  const certain = confidentVideoChoice(evaluation);
  const disposition: VideoDisposition = exactDuplicate ? "excluded" : !certain ? "review" : evaluation.choice === "useful" ? "accepted" : "excluded";
  return {
    index, choice: exactDuplicate ? "duplicate" : evaluation.choice,
    confidence: evaluation.confidence, accepted: disposition === "accepted",
    disposition, evaluation,
    reason: exactDuplicate ? "exact_duplicate" : !certain ? "low_confidence" : evaluation.choice === "useful" ? "qualified" : "classified_negative",
  };
}
// Conjunction for acceptance: every check must pass both unchanged thresholds.
// A confident failing check is sufficient to exclude. Weak/contradictory evidence
// otherwise remains review; min confidence is a summary, not a joint probability.
export function classifyVideoChecks(index: number, checks: VideoChecks, exactDuplicate = false): VideoJudgment {
  const negative = VIDEO_CHECKS.find((k) => checks[k].choice === "fail" && confidentVideoChoice(checks[k]));
  const uncertain = VIDEO_CHECKS.find((k) => !confidentVideoChoice(checks[k]));
  const decidingCheck = negative ?? uncertain;
  const failed = negative ?? VIDEO_CHECKS.find((k) => checks[k].choice === "fail");
  const choice: VideoChoice = failed === "relevance" ? "irrelevant"
    : failed === "novelty" ? "duplicate" : failed ? "unreliable" : "useful";
  const disposition: VideoDisposition = exactDuplicate || negative ? "excluded" : uncertain ? "review" : "accepted";
  return { index, choice: exactDuplicate ? "duplicate" : choice,
    confidence: negative ? checks[negative].confidence : Math.min(...VIDEO_CHECKS.map((k) => checks[k].confidence)),
    accepted: disposition === "accepted", disposition, checks, decidingCheck,
    reason: exactDuplicate ? "exact_duplicate" : negative ? "classified_negative" : uncertain ? "low_confidence" : "qualified" };
}
export function videoDisposition(j: VideoJudgment): VideoDisposition {
  return j.disposition ?? (j.accepted ? "accepted" : j.choice === "useful" ? "review" : "excluded");
}
export function videoJudgmentLabel(j: VideoJudgment) {
  return { accepted: "통과", review: "검토 대기", excluded: "제외" }[videoDisposition(j)];
}
export function videoJudgmentReason(j: VideoJudgment) {
  const choice = { useful: "학습에 유용", duplicate: "중복", irrelevant: "상황·레벨 부적합", unreliable: "근거·내용 불확실" }[j.evaluation?.choice ?? j.choice];
  const reasons = {
    qualified: "학습 가치 기준 통과",
    low_confidence: "판정 확신이 낮아 직접 확인 필요",
    classified_negative: "학습 후보 제외 기준에 해당",
    exact_duplicate: "기존 자료 또는 통과 후보와 같은 표현",
    batch_duplicate: "통과 후보와 학습 내용이 중복",
    uncertain_duplicate: "통과 후보와 중복 여부 확인 필요",
  };
  const check = j.decidingCheck && { meaning: "뜻", reading: "발음 도움", evidence: "관찰 근거", relevance: "상황 적합성", novelty: "기존 자료 중복" }[j.decidingCheck];
  return `JEV 분류: ${choice}${check ? ` (${check})` : ""} · ${j.reason ? reasons[j.reason] : videoJudgmentLabel(j)}`;
}
export type VideoResult = {
  state: "created" | "review" | "skipped" | "failed" | "running";
  message: string;
  draft?: ContentDraft;
  judgments?: VideoJudgment[];
};
export const normalizedExpression = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, "");
