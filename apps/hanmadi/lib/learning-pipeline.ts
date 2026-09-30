import { createHash, randomUUID } from "node:crypto";
import { ConversationError } from "./conversation";
import { changeKnowledge } from "./knowledge-store";
import {
  retrieveKnowledge,
  type KnowledgeState,
  type ContentDraft,
} from "./knowledge";
import { curriculum, isLevel, isStudyLanguage, safePractice } from "./v2";
import type {
  Dataset,
  EvaluationCase,
  LearningState,
  RetrievalEvaluation,
} from "./learning-types";

export const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const fail = (message: string, status = 400): never => {
  throw new ConversationError(status, message);
};
export function learning(state: KnowledgeState): LearningState {
  return (state.learning ??= {
    datasets: [],
    cases: [],
    evaluations: [],
    jobs: [],
  });
}
export function currentDataset(state: KnowledgeState, id: string): Dataset {
  const d = learning(state).datasets.find((d) => d.id === id);
  if (
    !d ||
    d.invalidatedAt ||
    !d.drafts.length ||
    d.drafts.some(
      (snapshot) =>
        !state.drafts.some(
          (live) =>
            live.id === snapshot.id &&
            live.revision === snapshot.revision &&
            live.status === "published",
        ),
    )
  )
    return fail(
      "자료가 수정되거나 회수됐어요. 새 자료 버전을 만들어 주세요.",
      409,
    );
  return d;
}
export function invalidateLearning(
  state: KnowledgeState,
  ids: Set<string>,
  erase = false,
) {
  if (!state.learning) return;
  const l = state.learning;
  for (const d of l.datasets)
    if (d.sourceIds.some((id) => ids.has(id))) {
      d.invalidatedAt = Date.now();
      if (erase) d.drafts = [];
    }
  if (
    l.index &&
    l.datasets.find((d) => d.id === l.index!.datasetId)?.invalidatedAt
  ) {
    delete l.index;
    l.semanticEnabled = false;
  }
  const active = l.jobs.find((j) => j.id === l.activeJobId);
  if (
    active &&
    l.datasets.find((d) => d.id === active.datasetId)?.invalidatedAt
  )
    delete l.activeJobId;
  if (erase)
    l.cases = l.cases.filter(
      (c) => !c.expectedSourceId || !ids.has(c.expectedSourceId),
    );
}

// Connected groups prevent a video/source or duplicate expression crossing splits.
export function sourceSplits(drafts: ContentDraft[]): Dataset["split"] {
  const parent = drafts.map((_, i) => i);
  const root = (i: number): number =>
    parent[i] === i ? i : (parent[i] = root(parent[i]));
  const keys = new Map<string, number>();
  drafts.forEach((d, i) => {
    const tokens = [
      "source:" + (d.sourceUrl || d.id),
      ...(d.sourceHash ? ["hash:" + d.sourceHash] : []),
      ...d.units.map(
        (p) =>
          "phrase:" +
          d.language +
          ":" +
          p.text
            .normalize("NFKC")
            .toLowerCase()
            .replace(/[\s\p{P}]/gu, ""),
      ),
    ];
    for (const key of tokens) {
      const old = keys.get(key);
      if (old !== undefined) parent[root(i)] = root(old);
      else keys.set(key, i);
    }
  });
  const groups = new Map<number, string[]>();
  drafts.forEach((d, i) =>
    groups.set(root(i), [...(groups.get(root(i)) ?? []), d.id]),
  );
  const ordered = [...groups.values()].sort((a, b) =>
    digest([...a].sort()).localeCompare(digest([...b].sort())),
  );
  if (ordered.length < 3)
    return fail(
      "학습·검증·시험 분리를 위해 서로 다른 출처 3개 이상이 필요해요. 같은 영상이나 중복 표현은 한 출처로 묶어요.",
    );
  const testCount = Math.max(1, Math.floor(ordered.length * 0.1));
  const validationCount = Math.max(1, Math.floor(ordered.length * 0.1));
  return Object.fromEntries(
    ordered.flatMap((ids, i) =>
      ids.map((id) => [
        id,
        i < testCount
          ? "test"
          : i < testCount + validationCount
            ? "validation"
            : "train",
      ]),
    ),
  );
}
export function makeDataset(
  state: KnowledgeState,
  input: {
    name: string;
    sourceIds: string[];
    purpose: Dataset["purpose"];
    trainingRights?: boolean;
  },
): Dataset {
  const l = learning(state);
  if (l.datasets.length >= 12)
    return fail(
      "자료 버전 보관 한도(12개)에 도달했어요. 사용하지 않는 버전을 삭제해 주세요.",
      409,
    );
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.length > 80 ||
    !Array.isArray(input.sourceIds) ||
    !input.sourceIds.length ||
    input.sourceIds.length > 200 ||
    input.sourceIds.some((id) => typeof id !== "string") ||
    !["retrieval", "fine-tuning"].includes(input.purpose)
  )
    return fail("자료 이름과 게시 교재를 선택해 주세요.");
  const ids = new Set(input.sourceIds);
  const drafts = state.drafts
    .filter((d) => ids.has(d.id) && d.status === "published")
    .sort((a, b) => a.id.localeCompare(b.id));
  if (drafts.length !== ids.size)
    return fail("게시 상태가 바뀌었어요. 자료 목록을 다시 불러와 주세요.", 409);
  if (drafts.reduce((n, d) => n + d.units.length, 0) > 120)
    return fail("한 버전은 최대 120개 표현으로 구성해 주세요.");
  if (
    drafts.some((d) => !d.units.length || d.units.some((p) => !safePractice(p)))
  )
    return fail("자료의 표현과 개인정보 검수를 다시 확인해 주세요.");
  if (
    input.purpose === "fine-tuning" &&
    (input.trainingRights !== true || drafts.some((d) => d.contributionId))
  )
    return fail(
      "가중치 학습 권한을 별도로 확인한 관리자 교재만 사용할 수 있어요. 사용자 번역 후보는 포함할 수 없어요.",
    );
  const split = input.purpose === "fine-tuning" ? sourceSplits(drafts) : {};
  const dataset: Dataset = {
    id: randomUUID(),
    name: input.name.trim(),
    purpose: input.purpose,
    createdAt: Date.now(),
    digest: digest(drafts),
    drafts: structuredClone(drafts),
    sourceIds: [...ids],
    split,
    ...(input.purpose === "fine-tuning"
      ? { trainingRightsConfirmedAt: Date.now() }
      : {}),
  };
  l.datasets.push(dataset);
  return dataset;
}
export function datasetExamples(
  dataset: Dataset,
  split?: "train" | "validation" | "test",
) {
  return dataset.drafts
    .filter((d) => !split || dataset.split[d.id] === split)
    .flatMap((d) =>
      d.units.map((phrase) => ({
        messages: [
          {
            role: "system",
            content: `You are Hanmadi, a ${d.language} speaking tutor for Korean learners. Practice level ${d.level}/4, situation ${d.scene}. Return JSON with text in the target language, meaning in Korean and reading in Hangul. Preserve the learner's intent.`,
          },
          {
            role: "user",
            content: `다음 뜻을 자연스러운 ${d.language} 표현으로 말해 주세요: ${phrase.meaning}`,
          },
          { role: "assistant", content: JSON.stringify(phrase) },
        ],
      })),
    );
}
export function jsonl(
  dataset: Dataset,
  split: "train" | "validation" | "test",
) {
  if (dataset.purpose !== "fine-tuning" || dataset.invalidatedAt)
    return fail("유효한 모델 학습용 자료 버전을 선택해 주세요.", 409);
  return (
    datasetExamples(dataset, split)
      .map((e) => JSON.stringify(e))
      .join("\n") + "\n"
  );
}
export function validateCase(
  value: unknown,
  state: KnowledgeState,
): EvaluationCase {
  const c = value as EvaluationCase;
  if (
    !c ||
    !isStudyLanguage(c.language) ||
    !["chat", "translation"].includes(c.mode) ||
    !isLevel(c.level) ||
    !curriculum.scenes.some((s) => s.id === c.scene) ||
    typeof c.text !== "string" ||
    !c.text.trim() ||
    c.text.length > 300 ||
    !safePractice({
      text: c.text,
      meaning: "평가 질문",
      reading: "평가 질문",
    }) ||
    !(c.expectedSourceId === null || typeof c.expectedSourceId === "string")
  )
    return fail(
      "언어·레벨·상황과 개인정보 없는 평가 질문(최대 300자)을 확인해 주세요.",
    );
  const expected = state.drafts.find(
    (d) =>
      d.id === c.expectedSourceId &&
      d.status === "published" &&
      d.language === c.language &&
      (c.mode === "translation" ||
        (d.level === c.level && d.scene === c.scene)),
  );
  if (c.expectedSourceId && !expected)
    return fail("평가 조건과 맞는 게시 자료를 정답으로 선택해 주세요.");
  return {
    id: randomUUID(),
    language: c.language,
    level: c.level,
    scene: c.scene,
    mode: c.mode,
    text: c.text.trim(),
    expectedSourceId: c.expectedSourceId,
  };
}
export function evaluateRetrieval(
  dataset: Dataset,
  cases: EvaluationCase[],
): RetrievalEvaluation {
  if (!cases.length) return fail("먼저 평가 질문을 등록해 주세요.");
  if (
    cases.some(
      (c) =>
        c.expectedSourceId && !dataset.sourceIds.includes(c.expectedSourceId),
    )
  )
    return fail("선택한 자료 버전에 평가 정답이 모두 포함되어야 해요.");
  const results = cases.map((c) => {
    const found = [
      ...new Set(retrieveKnowledge(dataset.drafts, c).map((m) => m.id)),
    ];
    return {
      caseId: c.id,
      passed: c.expectedSourceId
        ? found.includes(c.expectedSourceId)
        : found.length === 0,
      found,
    };
  });
  return {
    id: randomUUID(),
    datasetId: dataset.id,
    createdAt: Date.now(),
    caseDigest: digest(cases),
    engine: "lexical",
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    results,
  };
}
export async function saveEvaluation(id: string) {
  return changeKnowledge((state) => {
    const l = learning(state),
      result = evaluateRetrieval(currentDataset(state, id), l.cases);
    l.evaluations = [...l.evaluations.slice(-29), result];
    return result;
  });
}
