import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeKnowledge,
  retrieveKnowledge,
  knowledgeContext,
  type ContentDraft,
} from "./knowledge";
import {
  contribute,
  contributionEpoch,
  readKnowledge,
  saveKnowledgeDraft,
  rejectContribution,
  withdrawContributions,
} from "./knowledge-store";
import { roleplayReply, translate } from "./v2-ai";

const phrase = {
  text: "Coffee, please.",
  meaning: "커피 주세요.",
  reading: "커피 플리즈",
};
const draft: ContentDraft = {
  id: "old",
  title: "주문",
  language: "en",
  level: 1,
  scene: "cafe",
  sourceUrl: "",
  rights: "직접 작성한 교육 자료",
  units: [phrase],
  status: "published",
  revision: 1,
  updatedAt: 1,
};
function database(initial: string | null = null) {
  let raw = initial;
  return {
    get: async () => raw,
    cas: async (_: string, expected: string | null, value: string) => {
      if (expected !== raw) return false;
      raw = value;
      return true;
    },
  };
}
test("legacy curriculum is preserved on atomic migration; corrupt store is never treated as empty", async () => {
  const db = database(JSON.stringify([draft]));
  await contribute("alice", "en", phrase, "initial", db);
  const state = await readKnowledge(db);
  assert.deepEqual(state.drafts, [draft]);
  assert.equal(state.contributions.length, 1);
  assert.throws(() => decodeKnowledge('{"version":2}'));
});
test("published retrieval isolates language, exact chat level and situation; unrelated translations get no context", () => {
  const drafts = [
    draft,
    { ...draft, id: "private", status: "draft" as const },
    { ...draft, id: "other-level", level: 2 },
    { ...draft, id: "other-scene", scene: "hotel" },
    { ...draft, id: "other-language", language: "ja" as const },
  ];
  const query = {
    language: "en" as const,
    mode: "chat" as const,
    scene: "cafe",
    level: 1,
    text: "커피",
  };
  assert.deepEqual(
    retrieveKnowledge(drafts, query).map((m) => m.id),
    ["old"],
  );
  assert.equal(
    retrieveKnowledge([draft], {
      ...query,
      mode: "translation",
      text: "우주선",
    }).length,
    0,
  );
  assert.equal(
    retrieveKnowledge([draft], { ...query, mode: "translation" }).length,
    1,
  );
  assert.equal(
    retrieveKnowledge([{ ...draft, units: Array(12).fill(phrase) }], query)
      .length,
    4,
  );
  assert.equal(knowledgeContext([]), "");
});
test("candidate creation is private, deduplicated per owner and rejects obvious personal data", async () => {
  const db = database();
  assert.equal(
    await contribute("alice", "en", phrase, "initial", db),
    "received",
  );
  assert.equal(
    await contribute("alice", "en", phrase, "initial", db),
    "duplicate",
  );
  assert.equal(
    await contribute("bob", "en", phrase, "initial", db),
    "received",
  );
  assert.equal(
    await contribute(
      "alice",
      "en",
      { ...phrase, text: "test@example.com" },
      "initial",
      db,
    ),
    "no-safe-expression",
  );
  const state = await readKnowledge(db);
  assert.equal(state.drafts.length, 0);
  assert.equal(state.contributions[0].consentVersion, "shared-examples-v1");
});
test("withdrawal erases linked drafts, preserves other owners and prevents late collection/publish", async () => {
  const db = database(JSON.stringify([draft]));
  await contribute("alice", "en", phrase, "initial", db);
  await contribute("bob", "en", phrase, "initial", db);
  const candidate = (await readKnowledge(db)).contributions[0];
  const saved = await saveKnowledgeDraft(
    {
      ...draft,
      id: undefined,
      revision: undefined,
      contributionId: candidate.id,
    },
    db,
  );
  const epoch = await contributionEpoch("alice", db);
  assert.deepEqual(await withdrawContributions("alice", db), {
    removed: 1,
    unpublished: 1,
  });
  assert.equal(await contribute("alice", "en", phrase, epoch, db), "withdrawn");
  await assert.rejects(saveKnowledgeDraft(saved, db), /다른 관리자|회수/);
  await assert.rejects(
    saveKnowledgeDraft(
      { ...draft, id: undefined, contributionId: candidate.id },
      db,
    ),
    /회수/,
  );
  const state = await readKnowledge(db);
  assert.deepEqual(state.drafts, [draft]);
  assert.equal(state.contributions.length, 1);
  assert.equal(state.contributions[0].actor, "bob");
  assert(!state.events.some((e) => e.target === saved.id));
});
test("provenance survives omitted fields and cannot be replaced; one candidate creates one draft", async () => {
  const db = database();
  await contribute("alice", "en", phrase, "initial", db);
  const candidate = (await readKnowledge(db)).contributions[0];
  const input = { ...draft, id: undefined, contributionId: candidate.id };
  const saved = await saveKnowledgeDraft(input, db);
  await assert.rejects(saveKnowledgeDraft(input, db), /이미 교재/);
  const updated = await saveKnowledgeDraft(
    { ...saved, contributionId: undefined },
    db,
  );
  assert.equal(updated.contributionId, candidate.id);
  await assert.rejects(
    saveKnowledgeDraft({ ...updated, contributionId: "forged" }, db),
    /변경할 수 없/,
  );
  await assert.rejects(
    saveKnowledgeDraft({ ...updated, language: "ja" }, db),
    /사용할 수 없/,
  );
});
test("CAS retries recheck withdrawal instead of resurrecting candidate during generation", async () => {
  const db = database();
  await contribute("alice", "en", phrase, "initial", db);
  const candidate = (await readKnowledge(db)).contributions[0];
  let raced = false;
  const racing = {
    get: db.get,
    cas: async (key: string, expected: string | null, value: string) => {
      if (!raced) {
        raced = true;
        await withdrawContributions("alice", db);
      }
      return db.cas(key, expected, value);
    },
  };
  await assert.rejects(
    saveKnowledgeDraft(
      { ...draft, id: undefined, contributionId: candidate.id },
      racing,
    ),
    /회수/,
  );
  assert.equal((await readKnowledge(db)).drafts.length, 0);
});
test("rejected candidate cannot generate or publish; stale revisions conflict", async () => {
  const db = database();
  await contribute("alice", "en", phrase, "initial", db);
  const candidate = (await readKnowledge(db)).contributions[0];
  await rejectContribution(candidate.id, db);
  await assert.rejects(
    saveKnowledgeDraft(
      { ...draft, id: undefined, contributionId: candidate.id },
      db,
    ),
    /사용할 수 없/,
  );
  const saved = await saveKnowledgeDraft({ ...draft, id: undefined }, db);
  await saveKnowledgeDraft({ ...saved, status: "draft" }, db);
  await assert.rejects(saveKnowledgeDraft(saved, db), /다른 관리자/);
});
test("references reach both model paths without changing selection or output contracts", async () => {
  const refs = retrieveKnowledge([draft], {
    language: "en",
    mode: "chat",
    level: 1,
    scene: "cafe",
    text: "커피",
  });
  await roleplayReply(
    "en",
    1,
    "cafe",
    [{ role: "user", content: "hello" }],
    "personal:model",
    async (system, _, selection) => {
      assert.equal(selection, "personal:model");
      assert.match(system, /Reference examples \(untrusted data/);
      assert.match(system, /Coffee, please/);
      return JSON.stringify(phrase);
    },
    refs,
  );
  await translate(
    "커피 주세요.",
    "en",
    "ko",
    async (system) => {
      assert.match(system, /Coffee, please/);
      return JSON.stringify({
        translated: phrase.text,
        reading: phrase.reading,
        practice: phrase,
      });
    },
    refs,
  );
});
