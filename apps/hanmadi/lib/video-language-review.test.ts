import test from "node:test";
import assert from "node:assert/strict";
import { parseLanguageReviews, reviewVideoLanguage } from "./video-language-review";
import { applyLanguageReview, classifyVideoChecks, needsLanguageReview, LANGUAGE_CHECKS, VIDEO_CHECKS, type VideoChecks, type VideoSettings } from "./video-policy";
import { judgeVideo } from "./video-provider";
import { videoJobKey } from "./video-ingestion";

const settings: VideoSettings = { language: "ja", scene: "cafe", level: 1 };
const unit = { text: "カップをもう一ついただけますか。", meaning: "컵 하나 더 받을 수 있을까요?", reading: "캇푸오 모오 히토츠 이타다케마스카", at: 12, evidence: "카페에서 컵을 하나 더 요청하는 표현을 설명한다." };
const reviews = (indices = [0]) => ({ reviews: indices.map((index) => ({ index, checks: Object.fromEntries(LANGUAGE_CHECKS.map((k) => [k, { verdict: "pass", reason: `${k} 확인` }])) })) });
const checks = () => Object.fromEntries(VIDEO_CHECKS.map((k) => [k, { choice: "pass", confidence: k === "reading" ? 0.4 : 0.97, probabilities: { pass: 0.97, fail: 0.03 } }])) as VideoChecks;
function env() {
  process.env.LITELLM_BASE_URL = "https://gateway.example/llm/v1";
  process.env.LITELLM_MODEL = "hanmadi-chat";
  process.env.LITELLM_API_KEY = "general-fixture";
  process.env.HANMADI_JEV_API_KEY = "jev-fixture";
  delete process.env.HANMADI_VIDEO_REVIEW_MODEL;
}
const textResponse = (value: unknown) => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });

test("strict language response rejects omissions, duplicate/out-of-range indices, extras, malformed checks and empty reasons", () => {
  assert.equal(parseLanguageReviews(JSON.stringify(reviews([2, 0])), [0, 2], "model").size, 2);
  const invalid = [reviews([]), reviews([0, 0]), reviews([2]), { ...reviews(), extra: true }, { reviews: [{ ...reviews().reviews[0], text: "rewritten" }] }];
  for (const value of invalid) assert.throws(() => parseLanguageReviews(JSON.stringify(value), [0], "model"));
  for (const change of [{ verdict: "yes", reason: "ok" }, { verdict: "pass", reason: " " }, { verdict: "pass", reason: "a".repeat(161) }, { verdict: "pass", reason: "ok", probability: 1 }]) {
    const value = reviews(); value.reviews[0].checks.reading = change;
    assert.throws(() => parseLanguageReviews(JSON.stringify(value), [0], "model"));
  }
  assert.throws(() => parseLanguageReviews('```json\n{}\n```', [0], "model"));
});

test("LLM pass can resolve uncertain language, never rewrite JEV confidence or rescue confident negatives/business uncertainty", () => {
  const raw = checks(), j = classifyVideoChecks(0, raw);
  const review = parseLanguageReviews(JSON.stringify(reviews()), [0], "model").get(0)!;
  assert(needsLanguageReview(j));
  const result = applyLanguageReview(j, review);
  assert.equal(result.accepted, true);
  assert.equal(result.confidence, 0.4);
  assert.deepEqual(result.checks, raw);
  assert.equal(j.accepted, false);
  for (const k of VIDEO_CHECKS) {
    const c = checks(); c[k] = { choice: "fail", confidence: .97, probabilities: { fail: .97, pass: .03 } };
    const negative = classifyVideoChecks(0, c);
    assert.equal(applyLanguageReview(negative, review).accepted, false);
    assert.equal(needsLanguageReview(negative), false);
  }
  for (const k of ["relevance", "novelty"] as const) {
    const c = checks(); c[k].confidence = .4;
    assert.equal(applyLanguageReview(classifyVideoChecks(0, c), review).accepted, false);
  }
  assert.equal(applyLanguageReview(classifyVideoChecks(0, raw, true), review).accepted, false);
  for (const verdict of ["fail", "uncertain"] as const) {
    const value = reviews(); value.reviews[0].checks.reading.verdict = verdict;
    const r = applyLanguageReview(j, parseLanguageReviews(JSON.stringify(value), [0], "model").get(0)!);
    assert.equal(r.disposition, verdict === "fail" ? "excluded" : "review");
  }
});

test("one bounded batch uses only configured gateway key/model and retains safe errors without retries", async () => {
  env(); let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++; assert.equal(url, "https://gateway.example/llm/v1/chat/completions");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer general-fixture");
    const b = JSON.parse(String(init?.body));
    assert.equal(b.model, "hanmadi-chat"); assert.equal(b.max_tokens, 1800);
    assert.deepEqual(JSON.parse(b.messages[1].content).candidates, [{ index: 0, ...unit }]);
    return textResponse(reviews());
  };
  assert.equal((await reviewVideoLanguage([{ index: 0, ...unit }], settings, fetcher)).get(0)?.outcome, "pass");
  assert.equal(calls, 1);
  for (const fetcher of [async () => { throw new Error("secret-upstream"); }, async () => textResponse(reviews([])), async () => new Response("secret", { status: 429 })]) {
    let n = 0;
    const result = await reviewVideoLanguage([{ index: 0, ...unit }], settings, async () => { n++; return fetcher(); });
    assert.deepEqual(result.get(0), { model: "hanmadi-chat", outcome: "error" }); assert.equal(n, 1);
  }
});

test("language deadline includes a never-ending response body even if transport ignores abort", async (t) => {
  env(); t.mock.timers.enable({ apis: ["setTimeout"] });
  const pending = reviewVideoLanguage([{ index: 0, ...unit }], settings, async () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"choices":')); } })));
  await Promise.resolve(); await Promise.resolve();
  t.mock.timers.tick(15_001);
  assert.equal((await pending).get(0)?.outcome, "error");
});

test("JEV → language review → same-batch duplicate check uses separate keys and preserves final veto", async () => {
  env(); const stages: string[] = [];
  const result = await judgeVideo({ title: "fixture", seconds: 100, units: [unit, { ...unit, text: "追加のカップをいただけますか。" }] }, [], settings, async (url, init) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).endsWith("/chat/completions")) {
      stages.push("language"); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer general-fixture");
      return textResponse(reviews([0, 1]));
    }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer jev-fixture");
    const pair = Object.keys(body.questions)[0].startsWith("pair"); stages.push(pair ? "pair" : "quality");
    return Response.json({ model: "jev-1.13.0", usage: { input_tokens: 100, output_tokens: 10 }, answers: Object.fromEntries(Object.keys(body.questions).map((id) => [id, pair ? { type: "choice", choice: "duplicate", confidence: .97, probabilities: { duplicate: .97, distinct: .03 } } : { type: "choice", ...checks()[id.split("_")[1] as keyof VideoChecks] }])) });
  });
  assert.deepEqual(stages, ["quality", "language", "pair"]);
  assert.equal(result.judgments[0].accepted, true);
  assert.equal(result.judgments[1].reason, "batch_duplicate");
  assert.equal(result.judgments[1].languageReview?.outcome, "pass");
});

test("review model changes invalidate video result and durable draft lookup keys", () => {
  env(); const first = videoJobKey("abcdefghijk", settings);
  process.env.HANMADI_VIDEO_REVIEW_MODEL = "another-allowed-alias";
  assert.notEqual(videoJobKey("abcdefghijk", settings), first);
  delete process.env.HANMADI_VIDEO_REVIEW_MODEL;
});
