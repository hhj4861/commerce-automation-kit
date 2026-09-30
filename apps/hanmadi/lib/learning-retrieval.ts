import { randomUUID } from "node:crypto";
import { changeKnowledge, readKnowledge } from "./knowledge-store";
import { currentDataset, digest, fail, learning } from "./learning-pipeline";
import { embed, embeddingConfig } from "./learning-provider";
import {
  retrieveKnowledge,
  type KnowledgeMatch,
  type KnowledgeQuery,
} from "./knowledge";
import type {
  Dataset,
  RetrievalEvaluation,
  SemanticIndex,
} from "./learning-types";

export function indexEntries(dataset: Dataset) {
  return dataset.drafts.flatMap((d) =>
    d.units.map((phrase, i) => ({
      key: `${d.id}:${d.revision}:${i}`,
      text: `${phrase.text}\n${phrase.meaning}`,
      match: {
        id: d.id,
        revision: d.revision,
        title: d.title,
        language: d.language,
        level: d.level,
        scene: d.scene,
        phrase,
      } as KnowledgeMatch,
    })),
  );
}
export function rankSemantic(
  dataset: Dataset,
  index: SemanticIndex,
  query: KnowledgeQuery,
  vector: number[],
  minimum = 0.45,
): KnowledgeMatch[] {
  const entries = indexEntries(dataset);
  if (
    entries.length !== index.keys.length ||
    entries.length !== index.vectors.length ||
    entries.some((e, i) => e.key !== index.keys[i]) ||
    index.vectors.some((v) => v.length !== vector.length)
  )
    return fail(
      "검색 인덱스와 자료 버전이 달라요. 인덱스를 다시 만들어 주세요.",
      409,
    );
  return entries
    .map((e, i) => ({
      match: e.match,
      score: index.vectors[i].reduce((n, v, j) => n + v * vector[j], 0),
    }))
    .filter(
      ({ match: m, score }) =>
        m.language === query.language &&
        (query.mode === "translation" ||
          (m.level === query.level && m.scene === query.scene)) &&
        score >= minimum,
    )
    .sort((a, b) => b.score - a.score || a.match.id.localeCompare(b.match.id))
    .slice(0, 4)
    .map((r) => r.match);
}
function minScore() {
  const n = Number(process.env.HANMADI_EMBEDDING_MIN_SCORE ?? "0.45");
  if (!Number.isFinite(n) || n < 0 || n > 1)
    return fail("의미 검색 최소 점수 설정을 확인해 주세요.", 503);
  return n;
}
export async function buildSemanticIndex(id: string) {
  const c = embeddingConfig();
  if (!c) return fail("임베딩 전용 모델·주소·키를 서버에 설정해 주세요.", 503);
  const dataset = currentDataset(await readKnowledge(), id),
    entries = indexEntries(dataset);
  const vectors = await embed(
    c,
    entries.map((e) => e.text),
  );
  return changeKnowledge((s) => {
    currentDataset(s, id);
    const l = learning(s);
    l.index = {
      datasetId: id,
      model: c.model,
      configId: c.id,
      createdAt: Date.now(),
      keys: entries.map((e) => e.key),
      vectors,
      minimumScore: minScore(),
    };
    l.semanticEnabled = false;
    return { count: entries.length, model: c.model };
  });
}
export function indexVersion(index: SemanticIndex) {
  return `${index.configId}:${index.createdAt}:cosine-v1:${index.minimumScore ?? 0.45}`;
}
export async function evaluateSemantic(id: string) {
  const state = await readKnowledge(),
    l = learning(state),
    dataset = currentDataset(state, id),
    c = embeddingConfig();
  const index = l.index;
  if (!c || !index || index.datasetId !== id || index.configId !== c.id)
    return fail("이 자료 버전으로 의미 검색 인덱스를 먼저 만들어 주세요.", 409);
  if (
    !l.cases.length ||
    l.cases.some(
      (t) =>
        t.expectedSourceId && !dataset.sourceIds.includes(t.expectedSourceId),
    )
  )
    return fail("정답 자료가 포함된 버전과 평가 질문이 필요해요.");
  const vectors = await embed(
    c,
    l.cases.map((t) => t.text),
  );
  const results = l.cases.map((t, i) => {
    const found = [
      ...new Set(
        rankSemantic(
          dataset,
          index,
          t,
          vectors[i],
          index.minimumScore ?? 0.45,
        ).map((m) => m.id),
      ),
    ];
    return {
      caseId: t.id,
      found,
      passed: t.expectedSourceId
        ? found.includes(t.expectedSourceId)
        : found.length === 0,
    };
  });
  const result: RetrievalEvaluation = {
    id: randomUUID(),
    datasetId: id,
    createdAt: Date.now(),
    caseDigest: digest(l.cases),
    engine: "semantic",
    engineVersion: indexVersion(index),
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    results,
  };
  return changeKnowledge((s) => {
    currentDataset(s, id);
    const fresh = learning(s);
    if (
      digest(fresh.cases) !== result.caseDigest ||
      !fresh.index ||
      indexVersion(fresh.index) !== result.engineVersion
    )
      return fail("평가 중 자료나 질문이 바뀌었어요. 다시 평가해 주세요.", 409);
    fresh.evaluations = [...fresh.evaluations.slice(-29), result];
    return result;
  });
}
export async function enableSemantic(enabled: boolean) {
  return changeKnowledge((s) => {
    const l = learning(s);
    if (enabled) {
      const index = l.index,
        c = embeddingConfig();
      if (!index || !c || c.id !== index.configId)
        return fail("유효한 의미 검색 인덱스가 필요해요.", 409);
      currentDataset(s, index.datasetId);
      if (
        !l.cases.some((t) => t.expectedSourceId === null) ||
        !l.cases.some((t) => t.expectedSourceId !== null) ||
        !l.evaluations.some(
          (e) =>
            e.engine === "semantic" &&
            e.datasetId === index.datasetId &&
            e.engineVersion === indexVersion(index) &&
            e.caseDigest === digest(l.cases) &&
            e.total === l.cases.length &&
            e.passed === e.total,
        )
      )
        return fail(
          "정답이 있는 질문과 자료가 없어야 하는 질문을 포함해 의미 검색 평가를 모두 통과해야 해요.",
          409,
        );
    }
    l.semanticEnabled = enabled;
    return { enabled };
  });
}
export async function searchKnowledge(query: KnowledgeQuery) {
  const s = await readKnowledge(),
    l = learning(s);
  if (!l.semanticEnabled || !query.text.trim())
    return retrieveKnowledge(s.drafts, query);
  const index = l.index,
    c = embeddingConfig();
  if (!index || !c || index.configId !== c.id)
    return fail(
      "학습 검색 연결 설정이 바뀌었어요. 관리자에게 문의해 주세요.",
      503,
    );
  const dataset = currentDataset(s, index.datasetId);
  const [vector] = await embed(c, [query.text.slice(0, 1000)]);
  // Check withdrawal again after the external call; do not serve a stale snapshot.
  const fresh = await readKnowledge();
  currentDataset(fresh, dataset.id);
  if (
    !fresh.learning?.semanticEnabled ||
    !fresh.learning.index ||
    indexVersion(fresh.learning.index) !== indexVersion(index)
  )
    return retrieveKnowledge(fresh.drafts, query);
  return rankSemantic(
    dataset,
    index,
    query,
    vector,
    index.minimumScore ?? 0.45,
  );
}
