import test from "node:test";
import assert from "node:assert/strict";
import { parseLiveOptions, runVideoJevCheck } from "./video-jev-live-check.mjs";

process.env.HANMADI_JEV_API_KEY = "offline-fixture-key";
process.env.LITELLM_BASE_URL = "https://offline.invalid/llm";

function answer(criteria, choice, confidence = 0.97) {
  const keys = Object.keys(criteria);
  return { type: "choice", choice, confidence,
    probabilities: Object.fromEntries(keys.map((k) => [k, k === choice ? 0.97 : 0.03 / (keys.length - 1)])) };
}
function transport({ extraPair = false, failPair, lowUseful = false } = {}) {
  let calls = 0;
  return { count: () => calls, fetcher: async (_, init) => {
    calls++;
    const { questions } = JSON.parse(init.body);
    const quality = Object.hasOwn(questions, "unit0");
    if (!quality && failPair === "429") return new Response("private upstream payload", { status: 429 });
    if (!quality && failPair === "malformed") return Response.json({ secret: "private upstream payload" });
    if (!quality && failPair === "network") throw new Error("private upstream payload");
    const first = Object.keys(questions).length === 6;
    const choices = first
      ? ["useful", "duplicate", extraPair ? "useful" : "irrelevant", "unreliable", "unreliable", "unreliable"]
      : ["duplicate", "useful", "useful"];
    const answers = Object.fromEntries(Object.entries(questions).map(([id, q]) => {
      const choice = quality ? choices[Number(id.slice(4))] : id === "pair1_2" ? "duplicate" : "distinct";
      return [id, answer(q.criteria, choice, lowUseful && choice === "useful" ? 0.4 : 0.97)];
    }));
    return Response.json({ model: quality ? "jev-1.13.0" : "jev-pair-fixture",
      answers, usage: { input_tokens: quality ? 100 : 30, output_tokens: quality ? 10 : 3 } });
  } };
}

test("CLI requires an explicit bounded live request cap, rejecting extra or ambiguous args", () => {
  assert.deepEqual(parseLiveOptions(["--live", "--max-requests", "4"]), { maxRequests: 4 });
  for (const args of [[], ["--live"], ["--live", "--max-requests", "0"],
    ["--live", "--max-requests", "5"], ["--live", "--max-requests", "2.5"],
    ["--live", "--max-requests", "4", "--other"]]) assert.throws(() => parseLiveOptions(args));
});

test("v5 completes two quality batches and one dedupe request without overwriting raw unit answers", async () => {
  const t = transport();
  const result = await runVideoJevCheck({ maxRequests: 4, fetcher: t.fetcher });
  assert.equal(t.count(), 3);
  assert.equal(result.passed, true);
  assert.equal(result.complete, true);
  assert.deepEqual(result.requestObservations.map((r) => r.stage), ["quality", "quality", "dedupe"]);
  assert.deepEqual(result.usage, { inputTokens: 230, outputTokens: 23, observedRequests: 3, unknownRequests: 0 });
  const sibling = result.observations[1].results[2];
  assert.equal(sibling.raw.choice, "useful");
  assert.equal(sibling.choice, "duplicate");
  assert.equal(sibling.comparisons[0].choice, "duplicate");
  assert.equal(result.observations[1].comparisonModel, "jev-pair-fixture");
  assert.equal(result.metrics.evaluatedCases, 9);
});

test("four actual v5 requests count both stages and surface wrong automatic acceptance", async () => {
  const t = transport({ extraPair: true });
  const result = await runVideoJevCheck({ maxRequests: 4, fetcher: t.fetcher });
  assert.equal(t.count(), 4);
  assert.equal(result.requests, 4);
  assert.equal(result.complete, true);
  assert.equal(result.passed, false);
  assert.equal(result.metrics.wrongAcceptances, 1);
  assert.deepEqual(result.requestObservations.map((r) => r.stage), ["quality", "dedupe", "quality", "dedupe"]);
  assert.equal(result.usage.inputTokens, 260);
  assert.equal(result.usage.outputTokens, 26);
});

test("request limit prevents dispatch without counting blocked requests or silently passing partial results", async () => {
  const t = transport({ extraPair: true });
  const result = await runVideoJevCheck({ maxRequests: 2, fetcher: t.fetcher });
  assert.equal(t.count(), 2);
  assert.equal(result.requests, 2);
  assert.equal(result.passed, false);
  assert.equal(result.complete, false);
  assert.equal(result.observations[1].error, "request_limit");
  assert.equal(result.metrics.evaluatedCases, 6);
  assert.equal(result.metrics.failedCases, 3);
  assert.equal(result.usage.inputTokens, 130);
});

test("second-stage failures preserve first-stage usage and stop further calls without exposing errors", async () => {
  for (const failPair of ["429", "malformed", "network"]) {
    const t = transport({ extraPair: true, failPair });
    const result = await runVideoJevCheck({ maxRequests: 4, fetcher: t.fetcher });
    assert.equal(t.count(), 2);
    assert.equal(result.complete, false);
    assert.equal(result.passed, false);
    assert.equal(result.metrics.failedCases, 6);
    assert.equal(result.metrics.unattemptedCases, 3);
    assert.equal(result.usage.inputTokens, 100);
    assert.equal(result.usage.unknownRequests, 1);
    assert(!JSON.stringify(result).includes("private upstream payload"));
    assert(!JSON.stringify(result).includes("offline-fixture-key"));
    assert.equal(result.observations[0].error,
      failPair === "429" ? "rate_limited" : failPair === "malformed" ? "invalid_response" : "network_error");
  }
});

test("low-confidence useful cases remain review and are not mistaken for successful acceptance", async () => {
  const t = transport({ lowUseful: true });
  const result = await runVideoJevCheck({ maxRequests: 4, fetcher: t.fetcher });
  assert.equal(result.requests, 2);
  assert.equal(result.complete, true);
  assert.equal(result.passed, false);
  assert.equal(result.metrics.expectedAcceptancesNotMet, 2);
  assert.equal(result.metrics.wrongAcceptances, 0);
  assert.equal(result.metrics.review, 3);
});

test("invalid budgets and absent credentials fail before any transport call", async () => {
  const t = transport();
  for (const maxRequests of [undefined, 0, 5, 1.5, NaN])
    await assert.rejects(runVideoJevCheck({ maxRequests, fetcher: t.fetcher }));
  const key = process.env.HANMADI_JEV_API_KEY;
  try {
    delete process.env.HANMADI_JEV_API_KEY;
    await assert.rejects(runVideoJevCheck({ maxRequests: 4, fetcher: t.fetcher }));
  } finally { process.env.HANMADI_JEV_API_KEY = key; }
  assert.equal(t.count(), 0);
});
