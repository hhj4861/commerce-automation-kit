import type { Phrase, StudyLanguage } from "./v2";
import type { ContentDraft } from "./knowledge";
export const VIDEO_SELECTION_LIMIT = 10;
export const VIDEO_CONCURRENCY = 3;
export const VIDEO_MAX_SECONDS = 15 * 60;
export const VIDEO_RUBRIC = "hanmadi-video-jev-v10";
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
export const LANGUAGE_CHECKS = ["meaning", "reading", "evidence"] as const;
export type LanguageCheck = typeof LANGUAGE_CHECKS[number];
export type LanguageReview = {
  model: string;
  outcome: "pass" | "fail" | "uncertain" | "error";
  checks?: Record<LanguageCheck, { verdict: "pass" | "fail" | "uncertain"; reason: string }>;
};
export type ReviewReference = { text: string; meaning: string; scene: string };
export type VideoReviewContext = {
  settings: VideoSettings & {
    languageName: string;
    sceneContext: { title: string; purpose: string; counterpart: string } | null;
    practiceLevel: { id: number; title: string; goal: string; help: string; challenge: string } | null;
  };
  references: ReviewReference[];
  referenceCount: number;
  comparedCount: number;
};
export type ContextReview = {
  model: string;
  responseIssue?: "invalid_row" | "invalid_reference";
  detectedLanguage?: string;
  languageIssue?: "mismatch" | "uncertain";
  outcome: "pass" | "fail" | "uncertain" | "error";
  checks?: Record<VideoCheck, { verdict: "pass" | "fail" | "uncertain"; reason: string }> & {
    novelty: { verdict: "pass" | "fail" | "uncertain"; reason: string; referenceIndex: number | null };
  };
  referenceScope: { total: number; compared: number; digest: string };
  // The LLM claim is not a verified duplicate. Only a confident pair result
  // may populate matchedReference for new reviews.
  claimedReference?: ReviewReference & { kind: "corpus"; id: string };
  referenceVerification?: {
    outcome: "pending" | "duplicate" | "distinct" | "uncertain" | "error";
    model?: string;
    evaluation?: Omit<VideoPairEvaluation, "referenceIndex" | "used">;
  };
  matchedReference?: ReviewReference;
};
export type VideoDisposition = "accepted" | "review" | "excluded";
export type VideoJudgment = {
  index: number;
  choice: VideoChoice;
  confidence: number;
  accepted: boolean;
  // Optional for existing v4 drafts. choice retains the effective classification;
  // evaluation records the original model answer even when exact dedupe overrides it.
  disposition?: VideoDisposition;
  reason?: "context_language_mismatch" | "context_review_attention" | "context_review" | "context_review_failed" | "context_review_error" | "language_review" | "language_review_failed" | "language_review_error" | "qualified" | "low_confidence" | "classified_negative" | "exact_duplicate" | "batch_duplicate" | "uncertain_duplicate";
  evaluation?: VideoEvaluation;
  // v6 stores atomic model answers, never an invented four-class probability.
  checks?: VideoChecks;
  decidingCheck?: VideoCheck;
  comparisons?: VideoPairEvaluation[];
  languageReview?: LanguageReview;
  contextReview?: ContextReview;
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
// Only resolve uncertain linguistic checks. JEV's confident failures and its
// relevance/novelty gates remain authoritative; raw JEV probabilities never change.
export function needsLanguageReview(j: VideoJudgment) {
  return j.disposition === "review" && !!j.checks &&
    (["relevance", "novelty"] as const).every((k) =>
      j.checks![k].choice === "pass" && confidentVideoChoice(j.checks![k])) &&
    LANGUAGE_CHECKS.some((k) => !confidentVideoChoice(j.checks![k]));
}
export function applyLanguageReview(j: VideoJudgment, review: LanguageReview): VideoJudgment {
  if (!needsLanguageReview(j)) return j;
  const result = { ...j, languageReview: review };
  if (review.outcome === "error" || !review.checks)
    return { ...result, reason: "language_review_error" };
  // An additional explicit language error is also a veto, even if JEV passed it.
  if (LANGUAGE_CHECKS.some((k) => review.checks![k].verdict === "fail"))
    return { ...result, accepted: false, disposition: "excluded", choice: "unreliable", reason: "language_review_failed" };
  if (LANGUAGE_CHECKS.some((k) => review.checks![k].verdict !== "pass")) return result;
  return { ...result, accepted: true, disposition: "accepted", choice: "useful", reason: "language_review", decidingCheck: undefined };
}
// v8 resolves uncertainty across all five checks with a separate, explained
// review. It cannot overturn any confident JEV failure or an exact duplicate.
export function needsContextReview(j: VideoJudgment) {
  return j.disposition === "review" && j.reason === "low_confidence" && !!j.checks &&
    !VIDEO_CHECKS.some((k) => j.checks![k].choice === "fail" && confidentVideoChoice(j.checks![k])) &&
    VIDEO_CHECKS.some((k) => !confidentVideoChoice(j.checks![k]));
}
export function applyContextReview(j: VideoJudgment, review: ContextReview): VideoJudgment {
  if (!needsContextReview(j)) return j;
  const result = { ...j, contextReview: review };
  if (review.outcome === "error" || !review.checks || VIDEO_CHECKS.some((k) => !review.checks![k]))
    return { ...result, reason: "context_review_error" };
  if (review.languageIssue) return { ...result, accepted: false, disposition: "review", reason: "context_language_mismatch", decidingCheck: "relevance" };
  const failed = VIDEO_CHECKS.find((k) => review.checks![k].verdict === "fail");
  // A contextual disagreement alone is not proof that a useful expression is
  // wrong. Keep scene/semantic-similarity negatives visible for human review.
  if (failed === "relevance" || failed === "novelty") return { ...result, accepted: false,
    disposition: "review", reason: "context_review_attention", decidingCheck: failed };
  if (failed) return { ...result, accepted: false, disposition: "excluded",
    choice: "unreliable",
    reason: "context_review_failed", decidingCheck: failed };
  if (review.claimedReference || review.outcome !== "pass" || VIDEO_CHECKS.some((k) => review.checks![k].verdict !== "pass")) return result;
  return { ...result, accepted: true, disposition: "accepted", choice: "useful", reason: "context_review", decidingCheck: undefined };
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
    context_language_mismatch: "분석 표현의 언어가 선택한 언어와 일치하는지 직접 확인 필요",
    context_review_attention: "상황·중복 교차 검수에서 이견이 있어 직접 확인 필요",
    context_review: "JEV 불확실 항목의 언어·상황·중복 교차 검수 통과",
    context_review_failed: "교차 검수에서 뜻·발음·근거 오류 확인",
    context_review_error: "교차 검수를 완료하지 못해 직접 확인 필요",
    language_review: "JEV 학습 가치·중복 기준 및 언어 교차 검수 통과",
    language_review_failed: "언어 교차 검수에서 오류 확인",
    language_review_error: "언어 교차 검수를 완료하지 못해 직접 확인 필요",
    low_confidence: "판정 확신이 낮아 직접 확인 필요",
    classified_negative: "학습 후보 제외 기준에 해당",
    exact_duplicate: "기존 자료 또는 통과 후보와 같은 표현",
    batch_duplicate: "통과 후보와 학습 내용이 중복",
    uncertain_duplicate: "통과 후보와 중복 여부 확인 필요",
  };
  const check = j.decidingCheck && { meaning: "뜻", reading: "발음 도움", evidence: "관찰 근거", relevance: "상황 적합성", novelty: "기존 자료 중복" }[j.decidingCheck];
  const language = j.languageReview
    ? ` · 언어 검수(${j.languageReview.model}): ${ { pass: "통과", fail: "오류", uncertain: "불확실", error: "연결·응답 확인 필요" }[j.languageReview.outcome]}${j.languageReview.checks ? ` · ${LANGUAGE_CHECKS.map((k) => j.languageReview!.checks![k].reason).join(" / ")}` : ""}`
    : "";
  const context = j.contextReview
    ? ` · 문맥 교차 검수(${j.contextReview.model}): ${{ pass: "통과", fail: "오류·이견 발견", uncertain: "불확실", error: j.contextReview.responseIssue === "invalid_reference" ? "중복 참조 형식 확인 필요" : j.contextReview.responseIssue ? "후보 응답 형식 확인 필요" : "연결·응답 확인 필요" }[j.contextReview.outcome]}${j.contextReview.checks ? ` · ${VIDEO_CHECKS.map((k) => k === "novelty" && j.contextReview!.claimedReference && j.contextReview!.referenceVerification?.outcome !== "duplicate" ? "중복 주장 근거 미확인" : j.contextReview!.checks![k].reason).join(" / ")}` : ""}${j.contextReview.referenceVerification ? ` · 참조 검증: ${{ pending: "대기", duplicate: "중복 확인", distinct: "서로 다른 의도로 판정·주장 불일치", uncertain: "불확실", error: "연결·응답 확인 필요" }[j.contextReview.referenceVerification.outcome]}` : ""} · 비교 자료 ${j.contextReview.referenceScope.compared}/${j.contextReview.referenceScope.total}개${j.contextReview.matchedReference ? ` · 중복 대상: ${j.contextReview.matchedReference.text}` : ""}`
    : "";
  return `평가 분류: ${choice}${check ? ` (${check})` : ""} · ${j.reason ? reasons[j.reason] : videoJudgmentLabel(j)}${language}${context}`;
}
export type VideoStage = "checking" | "analyzing" | "evaluating" | "saving";
export const VIDEO_STAGE_LABELS: Record<VideoStage, string> = {
  checking: "영상 정보 확인", analyzing: "영상 내용 분석",
  evaluating: "학습 가치 평가", saving: "초안 저장",
};
export type VideoResult = {
  state: "created" | "review" | "skipped" | "failed" | "running" | "blocked";
  message: string;
  stage?: VideoStage;
  retryable?: boolean;
  issue?: "too_long" | "not_public" | "live" | "unavailable";
  draft?: ContentDraft;
  judgments?: VideoJudgment[];
};
export const normalizedExpression = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}]/gu, "");
