import test from "node:test";
import assert from "node:assert/strict";
import {
  makeDataset,
  sourceSplits,
  currentDataset,
  evaluateRetrieval,
  validateCase,
  invalidateLearning,
  jsonl,
} from "./learning-pipeline";
import { indexEntries, rankSemantic } from "./learning-retrieval";
import { saveKnowledgeDraft, withdrawContributions } from "./knowledge-store";
import { decodeKnowledge, type ContentDraft } from "./knowledge";

function draft(id: string, word = id): ContentDraft {
  return {
    id,
    title: word,
    language: "en",
    scene: "cafe",
    level: 1,
    sourceUrl: "",
    rights: "직접 작성한 자료로 별도 학습 허용",
    units: [
      {
        text: `${word}, please.`,
        meaning: `${word} 주세요`,
        reading: "플리즈",
      },
    ],
    status: "published",
    revision: 1,
    updatedAt: 1,
  };
}
function state() {
  const s = decodeKnowledge(null);
  s.drafts = [draft("coffee"), draft("tea"), draft("water")];
  return s;
}
test("immutable versions reject unpublished/missing sources, contributions cannot enter weights", () => {
  const s = state(),
    d = makeDataset(s, {
      name: "검색",
      purpose: "retrieval",
      sourceIds: ["coffee"],
    });
  s.drafts[0].units[0].text = "Changed";
  assert.equal(d.drafts[0].units[0].text, "coffee, please.");
  assert.throws(() =>
    makeDataset(s, {
      name: "실패",
      purpose: "retrieval",
      sourceIds: ["missing"],
    }),
  );
  s.drafts[0].status = "draft";
  assert.throws(() => currentDataset(s, d.id));
  s.drafts[0].status = "published";
  s.drafts[0].contributionId = "user-expression";
  assert.throws(
    () =>
      makeDataset(s, {
        name: "모델",
        purpose: "fine-tuning",
        sourceIds: s.drafts.map((d) => d.id),
        trainingRights: true,
      }),
    /번역 후보/,
  );
  assert.throws(
    () =>
      makeDataset(state(), {
        name: "모델",
        purpose: "fine-tuning",
        sourceIds: ["coffee", "tea", "water"],
      }),
    /권한/,
  );
});
test("source and duplicate-connected groups never leak across train validation test", () => {
  const all = [
    draft("a", "coffee"),
    draft("b", "tea"),
    draft("c", "water"),
    draft("d", "juice"),
    draft("e", "coffee"),
    draft("f", "soda"),
  ];
  all[1].sourceUrl = all[2].sourceUrl =
    "https://www.youtube.com/watch?v=abcdefghijk";
  all[3].sourceHash = all[5].sourceHash = "same-licensed-source";
  const split = sourceSplits(all);
  assert.equal(split.a, split.e);
  assert.equal(split.d, split.f);
  assert.equal(split.b, split.c);
  assert.equal(new Set(Object.values(split)).size, 3);
  assert.deepEqual(split, sourceSplits([...all].reverse()));
  assert.throws(
    () =>
      sourceSplits([
        draft("a", "same"),
        draft("b", "same"),
        draft("c", "same"),
      ]),
    /출처 3개/,
  );
  const s = state(),
    d = makeDataset(s, {
      name: "분리",
      purpose: "fine-tuning",
      sourceIds: s.drafts.map((d) => d.id),
      trainingRights: true,
    });
  assert(d.trainingRightsConfirmedAt);
  const rows = ["train", "validation", "test"].map((split) =>
    jsonl(d, split as "train")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  );
  assert.deepEqual(
    rows.map((r) => r.length),
    [1, 1, 1],
  );
  assert.equal(new Set(rows.flat().map((r) => r.messages[2].content)).size, 3);
  assert(
    rows
      .flat()
      .every(
        (r) =>
          r.messages.length === 3 && !JSON.stringify(r).includes("sourceUrl"),
      ),
  );
});
test("fixed evaluation handles positive, negative, foreign language and stale expected sources", () => {
  const s = state(),
    d = makeDataset(s, {
      name: "평가",
      purpose: "retrieval",
      sourceIds: s.drafts.map((d) => d.id),
    });
  const positive = validateCase(
    {
      language: "en",
      level: 1,
      scene: "cafe",
      mode: "translation",
      text: "coffee",
      expectedSourceId: "coffee",
    },
    s,
  );
  const negative = validateCase(
    { ...positive, text: "spaceship", expectedSourceId: null },
    s,
  );
  const result = evaluateRetrieval(d, [positive, negative]);
  assert.equal(result.passed, 2);
  assert.equal(result.total, 2);
  assert.throws(
    () => validateCase({ ...positive, language: "ja" }, s),
    /맞는 게시/,
  );
  assert.throws(
    () => validateCase({ ...positive, text: "private@example.com" }, s),
    /개인정보/,
  );
  assert.throws(() => evaluateRetrieval(d, []), /평가 질문/);
  assert.throws(
    () => evaluateRetrieval(d, [{ ...positive, expectedSourceId: "absent" }]),
    /모두 포함/,
  );
});
test("semantic retrieval uses nonlexical similarity but keeps language level scene fences", () => {
  const s = state(),
    d = makeDataset(s, {
      name: "의미",
      purpose: "retrieval",
      sourceIds: s.drafts.map((d) => d.id),
    });
  const index = {
    datasetId: d.id,
    configId: "c",
    model: "e",
    createdAt: 1,
    keys: indexEntries(d).map((e) => e.key),
    vectors: [
      [1, 0],
      [0, 1],
      [-1, 0],
    ],
  };
  const q = {
    language: "en" as const,
    level: 1,
    scene: "cafe",
    mode: "chat" as const,
    text: "a warm drink",
  };
  assert.equal(
    rankSemantic(d, index, q, [1, 0])[0].id,
    indexEntries(d)[0].match.id,
  );
  assert.equal(
    rankSemantic(d, index, { ...q, language: "ja" }, [1, 0]).length,
    0,
  );
  assert.equal(rankSemantic(d, index, { ...q, level: 2 }, [1, 0]).length, 0);
  assert.equal(
    rankSemantic(d, index, { ...q, scene: "hotel" }, [1, 0]).length,
    0,
  );
  assert.throws(
    () => rankSemantic(d, { ...index, keys: [] }, q, [1, 0]),
    /インデックス|인덱스/,
  );
});
test("editing and withdrawal invalidate versions/index/models atomically and erase contributed snapshots", async () => {
  const s = state();
  s.drafts[0].sourceHash = "original-source";
  s.drafts[0].contributionId = "candidate";
  s.contributions.push({
    id: "candidate",
    actor: "alice",
    language: "en",
    phrase: s.drafts[0].units[0],
    consentVersion: "shared-examples-v1",
    status: "converted",
    createdAt: 1,
  });
  const d = makeDataset(s, {
    name: "공유",
    purpose: "retrieval",
    sourceIds: ["coffee"],
  });
  s.learning!.index = {
    datasetId: d.id,
    configId: "c",
    model: "e",
    createdAt: 1,
    keys: [],
    vectors: [],
  };
  s.learning!.semanticEnabled = true;
  let raw = JSON.stringify(s);
  const db = {
    get: async () => raw,
    cas: async (_k: string, expected: string | null, next: string) => {
      if (raw !== expected) return false;
      raw = next;
      return true;
    },
  };
  await saveKnowledgeDraft(
    { ...s.drafts[0], title: "새 제목", sourceHash: "replacement" },
    db,
  );
  let after = decodeKnowledge(raw);
  assert.equal(
    after.drafts.find((d) => d.id === "coffee")?.sourceHash,
    "original-source",
  );
  assert(after.learning!.datasets[0].invalidatedAt);
  assert.equal(after.learning!.index, undefined);
  assert.equal(after.learning!.semanticEnabled, false);
  await withdrawContributions("alice", db);
  after = decodeKnowledge(raw);
  assert.deepEqual(after.learning!.datasets[0].drafts, []);
  const other = state(),
    version = makeDataset(other, {
      name: "모델",
      purpose: "retrieval",
      sourceIds: ["coffee"],
    });
  other.learning!.jobs.push({
    id: "job",
    datasetId: version.id,
    createdAt: 1,
    updatedAt: 1,
    target: "model",
    configId: "c",
    status: "succeeded",
  });
  other.learning!.activeJobId = "job";
  invalidateLearning(other, new Set(["coffee"]));
  assert.equal(other.learning!.activeJobId, undefined);
});
