import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contextReferences, parseContextReviews, reviewVideoContext } from "./video-language-review";
import { applyContextReview, classifyVideoChecks, crossReviewedOnly, needsContextReview, VIDEO_CHECKS, videoJudgmentReason, type VideoChecks, type VideoReviewContext } from "./video-policy";
import { judgmentState, judgeVideo } from "./video-provider";

const unit = { text: "ナプキンをください。", meaning: "냅킨을 주세요.", reading: "나푸킨오 쿠다사이", at: 12, evidence: "카페에서 냅킨을 요청하는 일본어 표현을 설명한다." };
const settings = { language: "ja" as const, scene: "cafe", level: 1 };
const context = () => judgmentState({ title: "fixture", seconds: 60, units: [unit] }, [], settings);
type Check = { verdict: string; reason: string; referenceIndex?: unknown; reference?: unknown };
const payload = (indices = [0]) => ({ reviews: indices.map((index) => ({ index, detectedLanguage: "ja", checks: Object.fromEntries(VIDEO_CHECKS.map((k) => [k, {
  verdict: "pass", reason: `${k} 확인`, ...(k === "novelty" ? { referenceIndex: null } : {}),
}])) as Record<string, Check> })) });
const positive = { choice: "pass" as const, confidence: .97, probabilities: { pass: .99, fail: .01 } };
const weak = { choice: "pass" as const, confidence: .4, probabilities: { pass: .7, fail: .3 } };
const negative = { choice: "fail" as const, confidence: .97, probabilities: { pass: .01, fail: .99 } };
const checks = () => Object.fromEntries(VIDEO_CHECKS.map((k) => [k, structuredClone(k === "relevance" ? weak : positive)])) as VideoChecks;
const response = (value: unknown) => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
function env() {
  process.env.LITELLM_BASE_URL = "https://gateway.example/llm/v1";
  process.env.LITELLM_MODEL = "hanmadi-chat";
  process.env.LITELLM_API_KEY = "general-fixture";
  process.env.HANMADI_JEV_API_KEY = "jev-fixture";
  delete process.env.HANMADI_VIDEO_REVIEW_MODEL;
}

test("all 4^5 JEV combinations preserve confident vetoes, raw answers and exact duplicates", () => {
  const review = parseContextReviews(JSON.stringify(payload()), [0], "fixture", context()).get(0)!;
  const alternatives = [positive, negative, weak, { ...weak, choice: "fail" as const, probabilities: { pass: .3, fail: .7 } }];
  for (let n = 0; n < 1024; n++) {
    const c = Object.fromEntries(VIDEO_CHECKS.map((k, i) => [k, alternatives[(n >> (i * 2)) & 3]])) as VideoChecks;
    for (const exact of [false, true]) {
      const j = classifyVideoChecks(0, c, exact), before = structuredClone(j);
      const result = applyContextReview(j, review);
      assert.equal(result.accepted, !(exact || VIDEO_CHECKS.some((k) => c[k] === negative)));
      assert.deepEqual(result.checks, c); assert.equal(result.confidence, j.confidence); assert.deepEqual(j, before);
      if (!needsContextReview(j)) assert.equal(result, j);
    }
  }
});

test("strict five-check schema rejects omitted, extra, duplicated or fabricated decisions", () => {
  const ctx = context(), validate = (v: unknown) => parseContextReviews(JSON.stringify(v), [0], "fixture", ctx);
  for (const value of [payload([]), payload([0, 0]), payload([1]), { ...payload(), extra: true }]) assert.throws(() => validate(value));
  for (const k of VIDEO_CHECKS) {
    const missing = payload(); delete missing.reviews[0].checks[k]; assert.equal(validate(missing).get(0)?.outcome, "error");
    for (const v of ["unknown", ""]) { const bad = payload(); bad.reviews[0].checks[k].verdict = v; assert.equal(validate(bad).get(0)?.outcome, "error"); }
    for (const reason of [" ", "x".repeat(161)]) { const bad = payload(); bad.reviews[0].checks[k].reason = reason; assert.equal(validate(bad).get(0)?.outcome, "error"); }
    const uncertain = payload(); uncertain.reviews[0].checks[k].verdict = "uncertain";
    assert.equal(applyContextReview(classifyVideoChecks(0, checks()), validate(uncertain).get(0)!).disposition, "review");
  }
  for (const referenceIndex of [null, -1, 1.5, ctx.references.length, "0"]) {
    const bad = payload(); bad.reviews[0].checks.novelty = { verdict: "fail", reason: "중복", referenceIndex }; assert.equal(validate(bad).get(0)?.outcome, "error");
  }
  const duplicate = payload(); duplicate.reviews[0].checks.novelty = { verdict: "fail", reason: "같은 요청", reference: contextReferences(ctx)[0] };
  const parsed = validate(duplicate).get(0)!;
  assert.deepEqual(parsed.claimedReference, contextReferences(ctx)[0]);
  assert.equal(parsed.matchedReference, undefined);
  assert.equal(parsed.referenceVerification?.outcome, "pending");
  const result = applyContextReview(classifyVideoChecks(0, checks()), parsed);
  assert.equal(result.disposition, "review"); assert.equal(result.reason, "context_review_attention");
});

test("one batch sends matching scene/references without JEV scores and safely handles transport errors", async () => {
  env(); const ctx = context(); let calls = 0;
  const r = await reviewVideoContext([{ index: 0, ...unit }], ctx, async (url, init) => {
    calls++; assert.equal(url, "https://gateway.example/llm/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer general-fixture");
    const b = JSON.parse(String(init?.body)), data = JSON.parse(b.messages[1].content);
    assert.equal(b.model, "hanmadi-chat"); assert.equal(b.max_tokens, 3000);
    assert.deepEqual(data.settings, ctx.settings);
    assert.deepEqual(data.references, contextReferences(ctx));
    assert.deepEqual(data.candidates, [{ index: 0, ...unit }]);
    assert.equal(data.checks, undefined); assert.equal(data.expected, undefined); return response(payload());
  });
  assert.equal(calls, 1); assert.equal(r.get(0)?.outcome, "pass");
  for (const fetcher of [async () => { throw Error("secret"); }, async () => new Response("secret", { status: 429 }), async () => response(payload([])), async () => response({})]) {
    let n = 0; const errors = await reviewVideoContext([{ index: 0, ...unit }], ctx, async () => { n++; return fetcher(); });
    assert.equal(n, 1); assert.equal(errors.get(0)?.outcome, "error"); assert.equal(JSON.stringify(errors.get(0)).includes("secret"), false);
    assert.equal(applyContextReview(classifyVideoChecks(0, checks()), errors.get(0)!).disposition, "review");
  }
});

test("invalid context/candidate bounds prevent requests", async () => {
  env(); let calls = 0; const fetcher = async () => { calls++; return response(payload()); }, ctx = context();
  for (const c of [{ ...ctx, comparedCount: 0 }, { ...ctx, references: Array(25).fill(ctx.references[0]) }, { ...ctx, settings: { ...ctx.settings, sceneContext: null } }] as VideoReviewContext[])
    assert.equal((await reviewVideoContext([{ index: 0, ...unit }], c, fetcher)).get(0)?.outcome, "error");
  for (const indices of [[0, 0], [6], [-1], [0, 1, 2, 3, 4, 5, 6]])
    assert([...(await reviewVideoContext(indices.map((index) => ({ index, ...unit })), ctx, fetcher)).values()].every((v) => v.outcome === "error"));
  await reviewVideoContext([], ctx, fetcher); assert.equal(calls, 0);
});

test("hard deadline covers hung response body", async (t) => {
  env(); t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = reviewVideoContext([{ index: 0, ...unit }], context(), async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"choices":')); } })));
  await Promise.resolve(); await Promise.resolve(); t.mock.timers.tick(15_001);
  assert.equal((await pending).get(0)?.outcome, "error");
});

test("newly qualified candidates retain final JEV uncertain/duplicate pair veto", async () => {
  env();
  for (const certain of [true, false]) {
    const stages: string[] = [];
    const result = await judgeVideo({ title: "fixture", seconds: 60, units: [unit, { ...unit, text: "ナプキンをいただけますか。" }] }, [], settings, async (_, init) => {
      const b = JSON.parse(String(init?.body));
      if (b.messages) { stages.push("context"); return response(payload([0, 1])); }
      const pair = Object.keys(b.questions)[0].startsWith("pair"); stages.push(pair ? "pair" : "quality");
      return Response.json({ model: "jev-1.13.0", usage: { input_tokens: 10, output_tokens: 5 }, answers: Object.fromEntries(Object.keys(b.questions).map((id) => [id, pair
        ? { type: "choice", choice: "duplicate", confidence: certain ? .97 : .3, probabilities: { duplicate: certain ? .99 : .65, distinct: certain ? .01 : .35 } }
        : { type: "choice", ...checks()[id.split("_")[1] as keyof VideoChecks] }])) });
    });
    assert.deepEqual(stages, ["quality", "context", "pair"]); assert.equal(result.judgments[0].accepted, true);
    assert.equal(result.judgments[1].accepted, false);
    assert.equal(result.judgments[1].reason, certain ? "batch_duplicate" : "uncertain_duplicate");
    assert.equal(result.judgments[1].contextReview?.outcome, "pass");
  }
});


test("language mismatch quarantines only that row and preserves original review answers", () => {
  const ctx = context();
  for (const detectedLanguage of ["en", "es", "th", "other", "uncertain"]) {
    const data = payload([0, 1]); data.reviews[1].detectedLanguage = detectedLanguage;
    const reviews = parseContextReviews(JSON.stringify(data), [0, 1], "fixture", ctx);
    assert.equal(applyContextReview(classifyVideoChecks(0, checks()), reviews.get(0)!).accepted, true);
    const r = reviews.get(1)!;
    assert.equal(r.outcome, "uncertain"); assert.equal(r.checks?.relevance.verdict, "pass");
    assert.equal(applyContextReview(classifyVideoChecks(1, checks()), r).reason, "context_language_mismatch");
    assert.equal(applyContextReview(classifyVideoChecks(1, checks()), r).disposition, "review");
  }
  for (const detectedLanguage of ["invalid", ""]) {
    const bad = payload(); bad.reviews[0].detectedLanguage = detectedLanguage;
    assert.equal(parseContextReviews(JSON.stringify(bad), [0], "fixture", ctx).get(0)?.outcome, "error");
  }
  for (const k of ["meaning", "reading", "evidence"]) {
    const bad = payload(); bad.reviews[0].checks[k].verdict = "fail";
    assert.equal(applyContextReview(classifyVideoChecks(0, checks()), parseContextReviews(JSON.stringify(bad), [0], "fixture", ctx).get(0)!).disposition, "excluded");
  }
});


test("malformed rows stay held without poisoning valid siblings or retaining unvalidated fields", () => {
  const mutations = [
    (r: Record<string, unknown>) => { r.text = "untrusted rewrite"; },
    (r: Record<string, unknown>) => { delete r.detectedLanguage; },
    (r: Record<string, unknown>) => { r.detectedLanguage = "xx"; },
    (r: Record<string, unknown>) => { r.checks = null; },
    ...VIDEO_CHECKS.flatMap((k) => [
      (r: Record<string, unknown>) => { delete (r.checks as Record<string, unknown>)[k]; },
      (r: Record<string, unknown>) => { (r.checks as Record<string, unknown>)[k] = { verdict: "pass", reason: "ok", extra: true }; },
      (r: Record<string, unknown>) => { (r.checks as Record<string, unknown>)[k] = { verdict: "bogus", reason: "ok" }; },
    ]),
    (r: Record<string, unknown>) => { (r.checks as Record<string, unknown>).novelty = { verdict: "fail", reason: "duplicate", referenceIndex: 999 }; },
  ];
  const ctx = context();
  for (const mutate of mutations) for (const reverse of [false, true]) {
    const data = payload([2, 5]); mutate(data.reviews[1]);
    if (reverse) data.reviews.reverse();
    const before = JSON.stringify(data);
    const reviews = parseContextReviews(before, [2, 5], "fixture", ctx);
    const good = applyContextReview(classifyVideoChecks(2, checks()), reviews.get(2)!);
    const bad = applyContextReview(classifyVideoChecks(5, checks()), reviews.get(5)!);
    assert.equal(good.accepted, true);
    assert.equal(bad.accepted, false); assert.equal(bad.disposition, "review");
    assert.equal(bad.contextReview?.outcome, "error");
    assert.equal(bad.contextReview?.checks, undefined);
    assert.equal(bad.contextReview?.matchedReference, undefined);
    assert.match(videoJudgmentReason(bad), /형식 확인 필요/);
    assert.equal(JSON.stringify(reviews.get(5)).includes("untrusted"), false);
    assert.equal(JSON.stringify(data), before);
  }
});

test("ambiguous batch identity never salvages even otherwise valid rows", async () => {
  env();
  const invalid = [payload([0]), payload([0, 0]), payload([0, 2]),
    { reviews: [payload().reviews[0], null] },
    { reviews: [payload().reviews[0], { ...payload([1]).reviews[0], index: "1" }] },
    { reviews: [payload().reviews[0], { checks: {} }] },
    { ...payload([0, 1]), extra: true }];
  for (const value of invalid) {
    assert.throws(() => parseContextReviews(JSON.stringify(value), [0, 1], "fixture", context()));
    let calls = 0;
    const reviews = await reviewVideoContext([{ index: 0, ...unit }, { index: 1, ...unit }], context(), async () => { calls++; return response(value); });
    assert.equal(calls, 1); assert.equal(reviews.size, 2);
    for (const [index, review] of reviews) {
      assert.equal(review.outcome, "error");
      assert.equal(applyContextReview(classifyVideoChecks(index, checks()), review).accepted, false);
    }
  }
});

test("recorded towel response recovers only the valid candidate through the full judge pipeline", async () => {
  env();
  const recorded = JSON.parse(readFileSync(new URL("../../../docs/qa/fixtures/20261002-jev-context-invalid-row.json", import.meta.url), "utf8"));
  const units = [
    { text: "Could I get an extra towel, please?", meaning: "수건을 하나 더 받을 수 있을까요?", reading: "쿠드 아이 겟 언 엑스트라 타월 플리즈", at: 10, evidence: "호텔에서 추가 수건을 요청하는 영어 표현을 설명한다." },
    { text: "Could you bring me another towel?", meaning: "수건을 하나 더 가져다주시겠어요?", reading: "쿠드 유 브링 미 어나더 타월", at: 20, evidence: "호텔 객실에서 수건을 하나 더 부탁하는 영어 표현을 설명한다." },
  ];
  const stages: string[] = [];
  const judged = await judgeVideo({ title: "recorded response regression", seconds: 60, units }, [], { language: "en", scene: "hotel", level: 1 }, async (_, init) => {
    const b = JSON.parse(String(init?.body));
    if (b.messages) { stages.push("context"); return response(recorded); }
    stages.push("quality"); assert(Object.keys(b.questions).every((id) => id.startsWith("unit")));
    return Response.json({ model: "jev-1.13.0", usage: { input_tokens: 10, output_tokens: 5 },
      answers: Object.fromEntries(Object.keys(b.questions).map((id) => [id, { type: "choice", ...checks()[id.split("_")[1] as keyof VideoChecks] }])) });
  });
  assert.deepEqual(stages, ["quality", "context"]);
  assert.equal(judged.judgments[0].accepted, true);
  assert.equal(judged.judgments[1].accepted, false);
  assert.equal(judged.judgments[1].disposition, "review");
  assert.equal(judged.judgments[1].contextReview?.responseIssue, "invalid_row");
  assert.equal(judged.judgments[1].contextReview?.checks, undefined);
});

test("corpus IDs bind kind and exact content independently of order or candidate indices", () => {
  const ctx = context(), reference = contextReferences(ctx)[0];
  const validate = (value: unknown) => {
    const p = payload([2, 5]);
    p.reviews[1].checks.novelty = { verdict: "fail", reason: "같은 요청", reference: value };
    return parseContextReviews(JSON.stringify(p), [2, 5], "fixture", ctx);
  };
  for (const bad of [null, { ...reference, kind: "candidate" }, { ...reference, id: "candidate:0" },
    { ...reference, id: "corpus:0" }, { ...reference, text: unit.text },
    { ...reference, meaning: unit.meaning }, { ...reference, scene: "hotel" },
    { ...reference, extra: true }]) {
    const r = validate(bad);
    assert.equal(r.get(2)?.outcome, "pass");
    assert.equal(r.get(5)?.responseIssue, "invalid_reference");
    assert.equal(r.get(5)?.matchedReference, undefined);
  }
  assert.equal(validate(reference).get(5)?.referenceVerification?.outcome, "pending");
  const reversed = { ...ctx, references: [...ctx.references].reverse() };
  assert.deepEqual(contextReferences(reversed).at(-1), reference);
  const p = payload(); p.reviews[0].checks.novelty = { verdict: "pass", reason: "중복 없음", reference: null };
  assert.equal(parseContextReviews(JSON.stringify(p), [0], "fixture", ctx).get(0)?.outcome, "pass");
  p.reviews[0].checks.novelty.reference = reference;
  assert.equal(parseContextReviews(JSON.stringify(p), [0], "fixture", ctx).get(0)?.responseIssue, "invalid_reference");
});

test("all four recorded numeric reference confusions are quarantined, not rebound to unrelated corpus text", () => {
  const fixture = JSON.parse(readFileSync(new URL("../../../docs/qa/fixtures/20261003-jev-reference-confusion.json", import.meta.url), "utf8"));
  assert.equal(fixture.cases.length, 4);
  for (const c of fixture.cases) {
    const ctx = judgmentState({ title: "recorded", seconds: 180, units: c.units }, [], c.settings);
    assert.deepEqual(ctx.references[0], c.wronglyMatchedReference);
    const good = payload([0]).reviews[0]; good.detectedLanguage = c.settings.language;
    const reviews = parseContextReviews(JSON.stringify({ reviews: [good, c.review] }), [0, c.review.index], "recorded", ctx);
    assert.equal(reviews.get(0)?.outcome, "pass");
    const r = reviews.get(c.review.index)!;
    assert.equal(r.responseIssue, "invalid_reference");
    assert.equal(r.matchedReference, undefined);
    assert.equal(applyContextReview(classifyVideoChecks(c.review.index, checks()), r).disposition, "review");
  }
});

test("bound corpus claims need independent JEV agreement; mismatch, uncertainty and transport failures hold only that candidate", async (t) => {
  env();
  for (const outcome of ["duplicate", "distinct", "uncertain", "error", "malformed"] as const) {
    const logs: string[] = [];
    const log = t.mock.method(console, "info", (line: string) => logs.push(line));
    const stages: string[] = [];
    const analysis = { title: "fixture", seconds: 60, units: [unit, { ...unit, text: "ナプキンをいただけますか。" }] };
    let claimed: ReturnType<typeof contextReferences>[number] | undefined;
    const judged = await judgeVideo(analysis, [], settings, async (_, init) => {
      const b = JSON.parse(String(init?.body));
      if (b.messages) {
        stages.push("context"); const input = JSON.parse(b.messages[1].content);
        claimed = input.references[0];
        const p = payload([0, 1]); p.reviews[1].checks.novelty = { verdict: "fail", reason: "잘못된 모델 중복 주장", reference: claimed };
        return response(p);
      }
      const ids = Object.keys(b.questions), corpus = ids[0].startsWith("corpus");
      stages.push(corpus ? "reference" : "quality");
      if (corpus) {
        assert.deepEqual(ids, ["corpus1"]);
        assert.deepEqual(b.questions.corpus1.instructions.reference, claimed);
        assert.deepEqual(b.questions.corpus1.instructions.candidate, analysis.units[1]);
        assert.equal(JSON.stringify(b).includes("잘못된 모델 중복 주장"), false);
        if (outcome === "error") return new Response("private error", { status: 503 });
        if (outcome === "malformed") return Response.json({ answers: {} });
      }
      const choice = outcome === "distinct" ? "distinct" : "duplicate";
      return Response.json({ model: "jev-1.13.0", usage: { input_tokens: 10, output_tokens: 5 },
        answers: Object.fromEntries(ids.map((id) => [id, corpus
          ? { type: "choice", choice, confidence: outcome === "uncertain" ? .4 : .97,
            probabilities: choice === "distinct" ? { duplicate: .01, distinct: .99 } : { duplicate: .99, distinct: .01 } }
          : { type: "choice", ...checks()[id.split("_")[1] as keyof VideoChecks] }])) });
    });
    log.mock.restore();
    assert.deepEqual(stages, ["quality", "context", "reference"]);
    assert.equal(judged.judgments[0].accepted, true);
    const held = judged.judgments[1], r = held.contextReview!;
    assert.equal(held.disposition, "review");
    assert.equal(r.referenceVerification?.outcome, outcome === "malformed" ? "error" : outcome);
    assert.equal(r.checks?.novelty.reason, "잘못된 모델 중복 주장"); // audit retains claim
    assert.equal(!!r.matchedReference, outcome === "duplicate");
    assert.equal(videoJudgmentReason(held).includes("중복 대상:"), outcome === "duplicate");
    assert.equal(videoJudgmentReason(held).includes("잘못된 모델 중복 주장"), outcome === "duplicate");
    const counters = JSON.parse(logs[0]);
    assert.equal(counters.jevRequests, 2); assert.equal(counters.referenceRequests, 1);
    assert.equal(counters.jevInputTokens, ["error", "malformed"].includes(outcome) ? null : 20);
    assert.equal(JSON.stringify(judged).includes("private error"), false);
  }
});

test("drafts surface candidates that only a secondary LLM review accepted", () => {
  const base = classifyVideoChecks(0, checks());
  const accepted = (reason: "context_review" | "language_review" | "qualified") => ({ ...base, accepted: true, disposition: "accepted" as const, reason });
  assert.equal(crossReviewedOnly([accepted("context_review"), accepted("language_review"), accepted("qualified"),
    { ...base, reason: "context_review_attention" as const }]), 2);
  assert.equal(crossReviewedOnly([]), 0);
});
