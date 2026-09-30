import type { ContentDraft, KnowledgeQuery } from "./knowledge";

export type Dataset = {
  id: string;
  name: string;
  createdAt: number;
  purpose: "retrieval" | "fine-tuning";
  digest: string;
  drafts: ContentDraft[];
  // Source IDs survive redaction so operations cannot revive a withdrawn version.
  sourceIds: string[];
  split: Record<string, "train" | "validation" | "test">;
  invalidatedAt?: number;
  trainingRightsConfirmedAt?: number;
};
export type EvaluationCase = KnowledgeQuery & {
  id: string;
  expectedSourceId: string | null;
};
export type RetrievalEvaluation = {
  id: string;
  datasetId: string;
  createdAt: number;
  caseDigest: string;
  engine: "lexical" | "semantic";
  engineVersion?: string;
  passed: number;
  total: number;
  results: { caseId: string; passed: boolean; found: string[] }[];
};
export type TrainingJob = {
  id: string;
  datasetId: string;
  createdAt: number;
  updatedAt: number;
  target: string;
  configId: string;
  status:
    | "prepared"
    | "submitting"
    | "submitted"
    | "unknown"
    | "failed"
    | "succeeded"
    | "cancelled";
  remoteId?: string;
  remoteStatus?: string;
  trainingFile?: string;
  validationFile?: string;
  resultModel?: string;
  message?: string;
  review?: { at: number; notes: string };
};
export type SemanticIndex = {
  datasetId: string;
  configId: string;
  model: string;
  createdAt: number;
  keys: string[];
  vectors: number[][];
  minimumScore?: number;
};
export type LearningState = {
  datasets: Dataset[];
  cases: EvaluationCase[];
  evaluations: RetrievalEvaluation[];
  jobs: TrainingJob[];
  index?: SemanticIndex;
  semanticEnabled?: boolean;
  activeJobId?: string;
};
