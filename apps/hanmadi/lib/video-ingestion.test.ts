import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  processVideo,
  validateVideoBatch,
  createVideoBatch,
  getVideoBatch,
  hash,
} from "./video-ingestion";
import {
  analyzeVideo,
  judgeVideo,
  parseVideoAnalysis,
  videoDetails,
} from "./video-provider";
import { memoryTransientStore } from "./transient-store";
import { saveKnowledgeDraft } from "./knowledge-store";
import type { ContentDraft, KnowledgeState } from "./knowledge";
import type { VideoAnalysis, VideoSettings } from "./video-policy";
const settings: VideoSettings = { language: "ja", scene: "cafe", level: 1 };
const phrase = {
  text: "窓の近くに座ってもいいですか。",
  meaning: "창가 근처에 앉아도 될까요?",
  reading: "마도노 치카쿠니 스왓테모 이이데스카",
};
const analysis: VideoAnalysis = {
  title: "카페 회화",
  seconds: 120,
  units: [
    {
      ...phrase,
      at: 10,
      evidence: "창가 자리를 요청하는 일본어 표현을 설명하는 장면",
    },
  ],
};
const judged = {
  judgments: [
    { index: 0, choice: "useful" as const, confidence: 0.97, accepted: true },
  ],
  comparedCount: 2,
  referenceCount: 2,
  model: "jev-1.13.0",
};
const empty = (): KnowledgeState => ({
  version: 1,
  drafts: [],
  contributions: [],
  epochs: {},
  events: [],
});
function fixture() {
  const state = empty();
  let analyses = 0,
    saves = 0;
  const deps = {
    store: memoryTransientStore(),
    analyze: async () => {
      analyses++;
      return analysis;
    },
    judge: async () => judged,
    read: async () => structuredClone(state),
    count: async () => 1,
    save: async (input: Parameters<typeof saveKnowledgeDraft>[0]) => {
      saves++;
      const d: ContentDraft = {
        ...input,
        id: randomUUID(),
        revision: 1,
        updatedAt: Date.now(),
      };
      state.drafts.push(d);
      return d;
    },
  };
  return { deps, state, stats: () => ({ analyses, saves }) };
}
test("server validates maximum ten, unique IDs, settings and batch membership", async () => {
  for (const ids of [
    [],
    Array(11).fill("abcdefghijk"),
    ["abcdefghijk", "abcdefghijk"],
    ["https://internal/"],
  ])
    assert.throws(() => validateVideoBatch({ ...settings, ids }));
  assert.throws(() =>
    validateVideoBatch({ ...settings, language: "ko", ids: ["abcdefghijk"] }),
  );
  const store = memoryTransientStore();
  const b = await createVideoBatch(
    { ...settings, ids: ["abcdefghijk"] },
    store,
  );
  assert.equal((await getVideoBatch(b.batchId, store)).ids.length, 1);
  await assert.rejects(getVideoBatch("../curriculum", store));
});
test("retries use cached results or durable draft without analyzing or saving again", async () => {
  const f = fixture();
  const first = await processVideo("abcdefghijk", settings, f.deps);
  assert.equal(first.state, "created");
  assert.equal(
    (await processVideo("abcdefghijk", settings, f.deps)).draft?.id,
    first.draft?.id,
  );
  f.deps.store = memoryTransientStore();
  assert.equal(
    (await processVideo("abcdefghijk", settings, f.deps)).draft?.id,
    first.draft?.id,
  );
  assert.deepEqual(f.stats(), { analyses: 1, saves: 1 });
});
test("JEV failure never saves; retry reuses video; rejected content never saves", async () => {
  const f = fixture();
  let fail = true;
  f.deps.judge = async () => {
    if (fail) throw Error("provider secret");
    return judged;
  };
  assert.equal(
    (await processVideo("abcdefghijk", settings, f.deps)).state,
    "failed",
  );
  assert.equal(f.stats().saves, 0);
  fail = false;
  assert.equal(
    (await processVideo("abcdefghijk", settings, f.deps)).state,
    "created",
  );
  assert.equal(f.stats().analyses, 1);
  const g = fixture();
  g.deps.judge = async () => ({
    ...judged,
    judgments: [{ ...judged.judgments[0], accepted: false }],
  });
  assert.equal(
    (await processVideo("abcdefghijk", settings, g.deps)).state,
    "skipped",
  );
  assert.equal(g.stats().saves, 0);
});
test("server allows three concurrent analyses; simultaneous same-video request is reused", async () => {
  const f = fixture();
  let active = 0,
    max = 0,
    release!: () => void;
  const wait = new Promise<void>((r) => (release = r));
  f.deps.analyze = async () => {
    active++;
    max = Math.max(max, active);
    await wait;
    active--;
    return analysis;
  };
  const jobs = Array.from({ length: 7 }, (_, i) =>
    processVideo(`video00000${i}`, settings, f.deps),
  );
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(max, 3);
  assert.equal(
    (await processVideo("video000000", settings, f.deps)).state,
    "running",
  );
  release();
  assert.equal(
    (await Promise.all(jobs)).filter((r) => r.state === "running").length,
    4,
  );
});
test("corpus modification after evaluation prevents a stale save", async () => {
  let raw: string | null = JSON.stringify(empty());
  const db = {
    get: async () => raw,
    cas: async (_k: string, expected: string | null, value: string) => {
      if (raw !== expected) return false;
      raw = value;
      return true;
    },
  };
  const input = {
    ...settings,
    title: "test",
    sourceUrl: "",
    rights: "review",
    units: [phrase],
    status: "draft" as const,
  };
  await saveKnowledgeDraft(input, db);
  await assert.rejects(saveKnowledgeDraft(input, db, hash([])), /자료가 바뀌/);
});
test("video response requires observation, valid timestamp and actual target-language text", () => {
  assert.equal(
    parseVideoAnalysis(
      JSON.stringify({ observed: true, units: analysis.units }),
      settings,
      analysis,
    ).units.length,
    1,
  );
  for (const change of [
    { observed: false, units: analysis.units },
    { observed: true, units: [{ ...analysis.units[0], at: 120 }] },
    { observed: true, units: [{ ...analysis.units[0], text: "한국어" }] },
  ])
    assert.throws(() =>
      parseVideoAnalysis(JSON.stringify(change), settings, analysis),
    );
});
test("official adapter passes video as media; rejects long, private and live videos before inference", async () => {
  process.env.YOUTUBE_API_KEY = "test-youtube";
  process.env.LITELLM_BASE_URL = "https://gateway.example/llm/v1";
  process.env.LITELLM_API_KEY = "test-gateway";
  process.env.LITELLM_MODEL = "gemini";
  const details = {
    snippet: { title: "Test", liveBroadcastContent: "none" },
    status: { privacyStatus: "public" },
    contentDetails: { duration: "PT2M" },
  };
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    if (String(url).includes("youtube/v3/videos"))
      return Response.json({ items: [details] });
    assert.equal(
      String(url),
      "https://gateway.example/llm/v1/chat/completions",
    );
    const b = JSON.parse(String(init?.body));
    assert.equal(
      b.messages[1].content[0].file.file_id,
      "https://www.youtube.com/watch?v=abcdefghijk",
    );
    assert.equal(b.messages[1].content[0].file.format, "video/mp4");
    assert.equal(init?.redirect, "error");
    return Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({ observed: true, units: analysis.units }),
          },
        },
      ],
    });
  };
  assert.equal(
    (await analyzeVideo("abcdefghijk", settings, fetcher)).units.length,
    1,
  );
  assert.equal(calls, 2);
  for (const bad of [
    { ...details, contentDetails: { duration: "PT16M" } },
    { ...details, status: { privacyStatus: "private" } },
    {
      ...details,
      snippet: { ...details.snippet, liveBroadcastContent: "live" },
    },
  ])
    await assert.rejects(
      videoDetails("abcdefghijk", async () => Response.json({ items: [bad] })),
      /15분/,
    );
});
test("real Jev SDK contract enforces confidence, exact dedupe and fail-closed behavior", async () => {
  process.env.LITELLM_BASE_URL = "https://gateway.example/llm/v1";
  process.env.LITELLM_API_KEY = "test-gateway";
  process.env.LITELLM_MODEL = "gemini";
  let confidence = 0.97;
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://gateway.example/llm/typesafe/v1/systemone");
    const b = JSON.parse(String(init?.body));
    assert(b.state.references.length);
    assert.equal(b.questions.unit0.type, "choice");
    return Response.json({
      model: "jev-1.13.0",
      answers: {
        unit0: {
          type: "choice",
          choice: "useful",
          confidence,
          probabilities: {
            useful: 0.97,
            duplicate: 0.01,
            irrelevant: 0.01,
            unreliable: 0.01,
          },
        },
      },
      usage: { input_tokens: 100, output_tokens: 0 },
    });
  };
  assert.equal(
    (await judgeVideo(analysis, [], settings, fetcher)).judgments[0].accepted,
    true,
  );
  confidence = 0.5;
  assert.equal(
    (await judgeVideo(analysis, [], settings, fetcher)).judgments[0].accepted,
    false,
  );
  confidence = 0.97;
  const f = fixture();
  const created = await processVideo("abcdefghijk", settings, f.deps);
  assert.equal(
    (await judgeVideo(analysis, [created.draft!], settings, fetcher))
      .judgments[0].choice,
    "duplicate",
  );
  await assert.rejects(
    judgeVideo(
      analysis,
      [],
      settings,
      async () => new Response("secret", { status: 403 }),
    ),
    /JEV/,
  );
});
