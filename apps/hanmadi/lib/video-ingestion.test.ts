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
  nativeVideoEndpoint,
  judgeVideo,
  parseVideoAnalysis,
  videoDetails,
  VideoEvaluationError,
  comparisonCorpus,
} from "./video-provider";
import { memoryTransientStore } from "./transient-store";
import { saveKnowledgeDraft } from "./knowledge-store";
import { retrieveKnowledge, type ContentDraft, type KnowledgeState } from "./knowledge";
import { classifyVideoJudgment, classifyVideoChecks, VIDEO_CHECKS, videoDisposition, VIDEO_RUBRIC,
  type VideoChecks,
  type VideoAnalysis, type VideoSettings, type VideoChoice, type VideoEvaluation,
} from "./video-policy";
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
const judged: Awaited<ReturnType<typeof judgeVideo>> = {
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
    judgments: [{ ...judged.judgments[0], choice: "duplicate" as const, accepted: false }],
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
test("video JSON accepts whitespace around a complete object or code fence", () => {
  const json = JSON.stringify({ observed: true, units: analysis.units });
  for (const raw of [`\n ${json} \n`, `\n \`\`\`json\n${json}\n\`\`\` \n`]) {
    assert.equal(parseVideoAnalysis(raw, settings, analysis).units.length, 1);
  }
});
test("video format diagnostics distinguish invalid JSON without recording its content", () => {
  const logs: string[] = [];
  const original = console.warn;
  console.warn = (line: string) => logs.push(line);
  try {
    const cases = [
      ['[{"secret":"private-video-value"}]', "array"],
      ['"private-video-value"', "string"],
      ["null", "null"],
      ["true", "boolean"],
      ["42", "number"],
      ['Here is private-video-value: {"observed":true}', "invalid"],
      ['\n```json\n{"private-video-value":\n```', "invalid"],
    ];
    for (const [raw, jsonType] of cases) {
      assert.throws(() => parseVideoAnalysis(raw, settings, analysis), /영상 분석 답변의 JSON 형식/);
      assert.deepEqual(JSON.parse(logs.at(-1)!), {
        event: "hanmadi_video_output_invalid", outputChars: raw.length,
        jsonType, codeFence: raw.trim().startsWith("```"),
      });
    }
    assert.equal(logs.some((line) => line.includes("private-video-value")), false);
  } finally { console.warn = original; }
});
test("invalid video JSON stops before JEV and never saves a draft", async () => {
  const f = fixture();
  const original = console.warn;
  console.warn = () => {};
  let judgments = 0;
  f.deps.analyze = async () => parseVideoAnalysis("[]", settings, analysis);
  f.deps.judge = async () => { judgments++; return judged; };
  try {
    const result = await processVideo("abcdefghijk", settings, f.deps);
    assert.equal(result.state, "failed");
    assert.equal(judgments, 0);
    assert.equal(f.stats().saves, 0);
    assert.equal(f.state.drafts.length, 0);
  } finally { console.warn = original; }
});
test("native adapter preserves video URI and rejects ineligible videos before inference", async () => {
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
      "https://gateway.example/llm/v1beta/models/gemini:generateContent",
    );
    const b = JSON.parse(String(init?.body));
    assert.equal(
      b.contents[0].parts[0].fileData.fileUri,
      "https://www.youtube.com/watch?v=abcdefghijk",
    );
    assert.equal(b.contents[0].parts[0].fileData.mimeType, "video/mp4");
    assert.equal(b.generationConfig.responseMimeType, "application/json");
    assert.equal(b.generationConfig.maxOutputTokens, 2400);
    const schema = b.generationConfig.responseSchema;
    assert.equal(schema.type, "OBJECT");
    assert.deepEqual(schema.required, ["observed", "units"]);
    assert.equal(schema.properties.observed.type, "BOOLEAN");
    assert.equal(schema.properties.units.type, "ARRAY");
    assert.equal(schema.properties.units.maxItems, 6);
    assert.deepEqual(schema.properties.units.items.required, ["text", "meaning", "reading", "at", "evidence"]);
    assert.equal(schema.properties.units.items.properties.at.type, "NUMBER");
    assert.equal(schema.properties.units.items.properties.evidence.type, "STRING");
    assert.match(b.systemInstruction.parts[0].text, /untrusted/);
    assert.equal(b.messages, undefined);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-gateway");
    assert.equal(init?.redirect, "error");
    return Response.json({
      candidates: [{
        finishReason: "STOP",
        content: { parts: [
          { thought: true, text: "internal reasoning is not an answer" },
          { text: JSON.stringify({ observed: true, units: analysis.units }) },
        ] },
      }],
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
test("native video route preserves the gateway prefix and isolates the configured model path", () => {
  for (const base of ["https://gateway.example/llm", "https://gateway.example/llm/v1/"])
    assert.equal(nativeVideoEndpoint(base, "hanmadi-chat"), "https://gateway.example/llm/v1beta/models/hanmadi-chat:generateContent");
  assert.equal(nativeVideoEndpoint("https://gateway.example/v1", "alias/other?key=x"), "https://gateway.example/v1beta/models/alias%2Fother%3Fkey%3Dx:generateContent");
});
test("native analysis rejects truncated, blocked and non-text output without leaking provider errors", async () => {
  const details = { snippet: { title: "Test", liveBroadcastContent: "none" }, status: { privacyStatus: "public" }, contentDetails: { duration: "PT2M" } };
  const fetcher = (body: unknown, status = 200): typeof fetch => async (url) =>
    String(url).includes("youtube/v3/videos") ? Response.json({ items: [details] }) : Response.json(body, { status });
  for (const body of [
    { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: JSON.stringify({ observed: true, units: analysis.units }) }] } }] },
    { promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ finishReason: "STOP", content: { parts: [{ thought: true, text: "not final" }] } }] },
    { candidates: [{ finishReason: "STOP", content: { parts: [{ functionCall: {} }] } }] },
  ]) await assert.rejects(analyzeVideo("abcdefghijk", settings, fetcher(body)), /분석 결과/);
  const warn = console.warn, messages: string[] = [];
  console.warn = (message) => messages.push(String(message));
  try {
    await assert.rejects(analyzeVideo("abcdefghijk", settings, fetcher({ error: "secret provider body" }, 400)), /영상 분석 응답/);
    assert.equal(messages.length, 1);
    assert.equal(JSON.parse(messages[0]).upstreamStatus, 400);
    for (const secret of ["secret provider body", "test-gateway", "abcdefghijk"])
      assert.equal(messages[0].includes(secret), false);
  } finally { console.warn = warn; }
});
test("real Jev SDK contract enforces confidence, exact dedupe and fail-closed behavior", async () => {
  process.env.LITELLM_BASE_URL = "https://gateway.example/llm/v1";
  process.env.LITELLM_API_KEY = "test-gateway";
  process.env.LITELLM_MODEL = "gemini";
  process.env.HANMADI_JEV_API_KEY = "test-admin-jev";
  let confidence = 0.97;
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(url, "https://gateway.example/llm/typesafe/v1/systemone");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-admin-jev");
    const b = JSON.parse(String(init?.body));
    assert(b.state.references.length);
    assert.equal(b.questions.unit0_meaning.type, "choice");
    assert.equal(b.state.candidates, undefined, "shared state must not include the candidate batch");
    assert.equal(b.state.settings.practiceLevel.id, 1);
    assert.equal(b.questions.unit0_meaning.instructions.earlierCandidates, undefined);
    assert.equal(b.questions.unit0_meaning.instructions.candidate.text, phrase.text);
    assert.equal(Object.keys(b.questions).length, 5);
    assert.equal(b.state.settings.sceneContext.title, "카페");
    return jevResponse({ unit0: evaluation("useful", confidence) });
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

test("Jev requires its dedicated key and never sends the general model key", async () => {
  process.env.LITELLM_BASE_URL = "https://gateway.example/llm/v1";
  process.env.LITELLM_API_KEY = "general-model-key";
  const previous = process.env.HANMADI_JEV_API_KEY;
  delete process.env.HANMADI_JEV_API_KEY;
  let calls = 0;
  try {
    await assert.rejects(
      judgeVideo(analysis, [], settings, async () => {
        calls++;
        throw Error("must not call");
      }),
      /관리자 전용 JEV/,
    );
    assert.equal(calls, 0);
  } finally {
    if (previous === undefined) delete process.env.HANMADI_JEV_API_KEY;
    else process.env.HANMADI_JEV_API_KEY = previous;
  }
});

test("Jev failures retain safe code and HTTP status without upstream text or credentials", async () => {
  process.env.LITELLM_BASE_URL = "https://gateway.example/llm/v1";
  process.env.HANMADI_JEV_API_KEY = "sensitive-admin-key";
  const original = console.warn;
  const messages: string[] = [];
  console.warn = (message) => { messages.push(String(message)); };
  try {
    await assert.rejects(judgeVideo(analysis, [], settings, async () =>
      Response.json({ secret: "upstream-secret-body" })), (error: unknown) => {
        assert(error instanceof VideoEvaluationError);
        assert.equal(error.code, "invalid_response");
        assert.equal(error.upstreamStatus, 200);
        return true;
      });
    assert.equal(messages.length, 1);
    const metadata = JSON.parse(messages[0]);
    assert.equal(metadata.code, "invalid_response");
    assert.equal(metadata.upstreamStatus, 200);
    assert(!messages[0].includes("sensitive-admin-key"));
    assert(!messages[0].includes("upstream-secret-body"));
    assert(!messages[0].includes(phrase.text));
  } finally { console.warn = original; }
});

test("low-confidence useful expressions stay in review, outside learning and dedupe until published", async () => {
  const f = fixture();
  f.deps.judge = async () => ({ ...judged,
    judgments: [{ ...judged.judgments[0], confidence: 0.66, accepted: false }] });
  const originalCache = f.deps.store;
  const result = await processVideo("abcdefghijk", settings, f.deps);
  assert.equal(result.state, "review");
  assert.equal(result.draft?.status, "draft");
  assert.equal(result.draft?.videoReview?.requiresHumanReview, true);
  assert.equal(retrieveKnowledge(f.state.drafts, { ...settings, mode: "chat", text: phrase.text }).length, 0);
  assert(!comparisonCorpus(f.state.drafts, settings).some((p) => p.text === phrase.text));
  f.deps.store = memoryTransientStore();
  assert.equal((await processVideo("abcdefghijk", settings, f.deps)).state, "review");
  assert.equal(f.stats().saves, 1);
  f.state.drafts[0].status = "published";
  f.state.drafts[0].revision++;
  f.deps.store = originalCache;
  const published = await processVideo("abcdefghijk", settings, f.deps);
  assert.equal(published.state, "created");
  assert.equal(published.draft?.status, "published");
  assert.equal(published.draft?.revision, 2);
  assert.equal(f.stats().saves, 1);
  assert(comparisonCorpus(f.state.drafts, settings).some((p) => p.text === phrase.text));
});


function evaluation(choice: VideoChoice, confidence = 0.97, selectedProbability = 0.97): VideoEvaluation {
  return { choice, confidence, probabilities: Object.fromEntries(
    ["useful", "duplicate", "irrelevant", "unreliable"].map((key) => [key,
      key === choice ? selectedProbability : (1 - selectedProbability) / 3]),
  ) as VideoEvaluation["probabilities"] };
}
// Adapt scenario fixtures to the actual v6 wire contract. Pair answers stay separate.
function checkFixture(a = evaluation("useful")): VideoChecks {
  const failing = a.choice === "unreliable" ? "meaning" : a.choice === "irrelevant" ? "relevance" : a.choice === "duplicate" ? "novelty" : null;
  return Object.fromEntries(VIDEO_CHECKS.map((k) => {
    const choice = failing === k ? "fail" : "pass";
    const p = a.probabilities[a.choice];
    return [k, { choice, confidence: a.confidence, probabilities: { [choice]: p, [choice === "pass" ? "fail" : "pass"]: 1 - p } }];
  })) as VideoChecks;
}
function jevResponse(answers: Record<string, object>) {
  return Response.json({ model: "jev-1.13.0", usage: { input_tokens: 100, output_tokens: 10 },
    answers: Object.fromEntries(Object.entries(answers).flatMap(([key, a]) =>
      /^unit[0-9]+$/.test(key)
        ? Object.entries(checkFixture(a as VideoEvaluation)).map(([check, answer]) => [`${key}_${check}`, { type: "choice", ...answer }])
        : [[key, { type: "choice", ...a }]])) });
}

function severalUnits(count: number): VideoAnalysis {
  return { ...analysis, units: Array.from({ length: count }, (_, index) => ({
    ...analysis.units[0], text: `${phrase.text}${index}`, at: index * 10,
  })) };
}

test("v5 preserves low-confidence negative classifications for review without relaxing acceptance", () => {
  for (const choice of ["useful", "duplicate", "irrelevant", "unreliable"] as const) {
    for (const a of [evaluation(choice, 0.4), evaluation(choice, 0.95, 0.6)]) {
      const j = classifyVideoJudgment(0, a);
      assert.equal(j.disposition, "review");
      assert.equal(j.accepted, false);
      assert.equal(j.choice, choice);
      assert.deepEqual(j.evaluation, a);
      const exact = classifyVideoJudgment(0, a, true);
      assert.equal(exact.disposition, "excluded");
      assert.equal(exact.reason, "exact_duplicate");
      assert.equal(exact.evaluation?.choice, choice);
    }
    assert.equal(classifyVideoJudgment(0, evaluation(choice)).disposition,
      choice === "useful" ? "accepted" : "excluded");
  }
  assert.equal(videoDisposition({ index: 0, choice: "duplicate", confidence: 0.4, accepted: false }), "excluded", "v4 saved decisions stay unchanged");
  assert.equal(videoDisposition({ index: 0, choice: "useful", confidence: 0.4, accepted: false }), "review");
  assert.notEqual(VIDEO_RUBRIC, "hanmadi-video-jev-v4");
});

test("bad earlier meaning/evidence and review candidates never enter dedupe references", async () => {
  for (const previousChoice of ["unreliable", "irrelevant", "duplicate"] as const) {
    for (const confidence of [0.97, 0.4]) {
      const a = severalUnits(2);
      a.units[0].text = a.units[1].text;
      a.units[0].meaning = "잘못된 뜻";
      a.units[0].evidence = "원본 영상 내용을 관찰하지 못한 후보";
      let calls = 0;
      const result = await judgeVideo(a, [], settings, async (_, init) => {
        calls++;
        const body = JSON.parse(String(init?.body));
        assert.equal(body.state.candidates, undefined);
        assert.equal(body.questions.unit1_meaning.instructions.earlierCandidates, undefined);
        assert(!JSON.stringify(body.questions.unit1_meaning).includes("잘못된 뜻"));
        return jevResponse({ unit0: evaluation(previousChoice, confidence), unit1: evaluation("useful") });
      });
      assert.equal(calls, 1);
      assert.equal(result.judgments[1].accepted, true);
      assert.equal(result.judgments[0].disposition, confidence < 0.85 ? "review" : "excluded");
    }
  }
});

test("pair decisions only use accepted references; uncertain earlier pairs cannot exclude later candidates", async () => {
  const a = severalUnits(4);
  let calls = 0;
  const result = await judgeVideo(a, [], settings, async (_, init) => {
    const body = JSON.parse(String(init?.body));
    if (++calls === 1) return jevResponse(Object.fromEntries(a.units.map((_, i) => [`unit${i}`, evaluation("useful")])));
    assert.equal(Object.keys(body.questions).length, 6);
    assert.equal(body.questions.pair0_1.instructions.reference.text, a.units[0].text);
    const pair = (choice: "distinct" | "duplicate", confidence = 0.97) => ({ choice, confidence,
      probabilities: { distinct: choice === "distinct" ? 0.97 : 0.03, duplicate: choice === "duplicate" ? 0.97 : 0.03 } });
    return jevResponse({ pair0_1: pair("duplicate", 0.4),
      pair0_2: pair("distinct"), pair1_2: pair("duplicate"),
      pair0_3: pair("distinct"), pair1_3: pair("duplicate"), pair2_3: pair("duplicate") });
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.judgments.map(videoDisposition), ["accepted", "review", "accepted", "excluded"]);
  assert.equal(result.judgments[2].comparisons?.find((c) => c.referenceIndex === 1)?.used, false);
  assert.equal(result.judgments[3].reason, "batch_duplicate");
  assert.equal(result.judgments[3].checks?.novelty.choice, "pass");
});

test("same-batch exact duplicates need no extra call and retain original answers", async () => {
  const a = { ...analysis, units: [analysis.units[0], { ...analysis.units[0], at: 20 }] };
  for (const next of [evaluation("useful"), evaluation("unreliable", 0.4)]) {
    let calls = 0;
    const result = await judgeVideo(a, [], settings, async () => {
      calls++;
      return jevResponse({ unit0: evaluation("useful"), unit1: next });
    });
    assert.equal(calls, 1);
    assert.equal(result.judgments[0].accepted, true);
    assert.equal(result.judgments[1].reason, "exact_duplicate");
    assert.equal(result.judgments[1].disposition, "excluded");
    assert.deepEqual(result.judgments[1].checks, checkFixture(next));
  }
});

test("six qualified candidates use at most two requests and fifteen forward pairs", async () => {
  const a = severalUnits(6);
  let calls = 0;
  const result = await judgeVideo(a, [], settings, async (_, init) => {
    const body = JSON.parse(String(init?.body));
    if (++calls === 1) return jevResponse(Object.fromEntries(a.units.map((_, i) => [`unit${i}`, evaluation("useful")])));
    assert.equal(Object.keys(body.questions).length, 15);
    for (const key of Object.keys(body.questions)) {
      const [, ref, candidate] = /^pair(\d)_(\d)$/.exec(key)!;
      assert(Number(ref) < Number(candidate));
    }
    return jevResponse(Object.fromEntries(Object.keys(body.questions).map((key) => [key,
      { choice: "distinct", confidence: 0.97, probabilities: { distinct: 0.97, duplicate: 0.03 } }])));
  });
  assert.equal(calls, 2);
  assert.equal(result.judgments.filter((j) => j.accepted).length, 6);
});

test("dedupe failure never bypasses quality acceptance; retry reuses video analysis", async () => {
  for (const failure of ["429", "missing", "network"] as const) {
    const f = fixture();
    const a = severalUnits(2);
    let analyses = 0, fail = true, calls = 0;
    f.deps.analyze = async () => { analyses++; return a; };
    f.deps.judge = () => judgeVideo(a, f.state.drafts, settings, async (_, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (body.questions.unit0_meaning) return jevResponse({ unit0: evaluation("useful"), unit1: evaluation("useful") });
      if (fail) {
        if (failure === "429") return new Response("sensitive", { status: 429 });
        if (failure === "network") throw new Error("sensitive network failure");
        return jevResponse({});
      }
      return jevResponse({ pair0_1: { choice: "distinct", confidence: 0.97, probabilities: { distinct: 0.97, duplicate: 0.03 } } });
    });
    const failed = await processVideo("abcdefghijk", settings, f.deps);
    assert.equal(failed.state, "failed");
    assert.equal(f.stats().saves, 0);
    assert(!failed.message.includes("sensitive"));
    fail = false;
    assert.equal((await processVideo("abcdefghijk", settings, f.deps)).state, "created");
    assert.equal(analyses, 1);
    assert.equal(calls, 4);
    assert.equal(f.stats().saves, 1);
  }
});

test("negative review candidates persist with matching evidence, stay outside learning, and restore from cache", async () => {
  const f = fixture();
  const a = severalUnits(3);
  f.deps.analyze = async () => a;
  f.deps.judge = async () => ({ ...judged, judgments: [
    classifyVideoJudgment(0, evaluation("duplicate")),
    classifyVideoJudgment(1, evaluation("unreliable", 0.4)),
    classifyVideoJudgment(2, evaluation("useful")),
  ] });
  const result = await processVideo("abcdefghijk", settings, f.deps);
  assert.equal(result.state, "review");
  assert.deepEqual(result.draft?.units.map((u) => u.text), [a.units[1].text, a.units[2].text]);
  assert.deepEqual(result.draft?.videoReview?.unitEvidenceIndices, [1, 2]);
  assert.equal(result.draft?.videoReview?.judgments[1].evaluation?.choice, "unreliable");
  assert.equal(result.draft?.videoReview?.evidence[1].at, a.units[1].at);
  assert.equal(retrieveKnowledge(f.state.drafts, { ...settings, mode: "chat", text: a.units[1].text }).length, 0);
  assert(!comparisonCorpus(f.state.drafts, settings).some((p) => a.units.some((u) => u.text === p.text)));
  const cached = await processVideo("abcdefghijk", settings, f.deps);
  assert.equal(cached.state, "review");
  assert.equal(f.stats().saves, 1);
  assert.deepEqual(cached.judgments, result.judgments);
});


test("v6 requires every atomic check to pass and preserves decisive/uncertain evidence", () => {
  const all = checkFixture();
  assert.equal(classifyVideoChecks(0, all).accepted, true);
  for (const k of VIDEO_CHECKS) {
    const weak = { ...all, [k]: { choice: "pass" as const, confidence: 0.84, probabilities: { pass: 0.99, fail: 0.01 } } };
    assert.equal(classifyVideoChecks(0, weak).disposition, "review");
    assert.equal(classifyVideoChecks(0, weak).decidingCheck, k);
    const unsure = { ...all, [k]: { choice: "fail" as const, confidence: 0.5, probabilities: { pass: 0.2, fail: 0.8 } } };
    assert.equal(classifyVideoChecks(0, unsure).disposition, "review");
    const failed = { ...all, [k]: { choice: "fail" as const, confidence: 0.95, probabilities: { pass: 0.05, fail: 0.95 } } };
    const result = classifyVideoChecks(0, failed);
    assert.equal(result.disposition, "excluded");
    assert.equal(result.choice, k === "relevance" ? "irrelevant" : k === "novelty" ? "duplicate" : "unreliable");
    assert.equal(result.evaluation, undefined, "never invent a model four-class distribution");
    assert.deepEqual(result.checks, failed);
    const weakProbability = { ...all, [k]: { choice: "pass" as const, confidence: 0.99, probabilities: { pass: 0.89, fail: 0.11 } } };
    assert.equal(classifyVideoChecks(0, weakProbability).accepted, false);
  }
  const mixed = checkFixture(evaluation("useful", 0.4));
  mixed.relevance = { choice: "fail", confidence: 0.99, probabilities: { pass: 0.01, fail: 0.99 } };
  assert.equal(classifyVideoChecks(0, mixed).choice, "irrelevant");
  assert.equal(classifyVideoChecks(0, mixed, true).reason, "exact_duplicate");
});

test("a missing atomic response fails the whole evaluation instead of silently passing", async () => {
  await assert.rejects(judgeVideo(analysis, [], settings, async () => {
    const response = await jevResponse({ unit0: evaluation("useful") }).json();
    delete response.answers.unit0_evidence;
    return Response.json(response);
  }), (error: unknown) => error instanceof VideoEvaluationError && error.code === "invalid_response");
});
