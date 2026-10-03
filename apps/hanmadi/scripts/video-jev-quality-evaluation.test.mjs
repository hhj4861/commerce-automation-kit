import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluationPlan, loadEvaluation, parseEvaluationOptions, runQualityEvaluation } from "./video-jev-quality-evaluation.mjs";

process.env.HANMADI_JEV_API_KEY = "offline-quality-key";
process.env.LITELLM_API_KEY = "offline-review-key";
process.env.LITELLM_BASE_URL = "https://offline.invalid/llm";
process.env.LITELLM_MODEL = "hanmadi-chat";
delete process.env.HANMADI_VIDEO_REVIEW_MODEL;
const { fixture } = loadEvaluation();
// The transport is an oracle for harness tests only, never a quality benchmark.
function transport({ uncertain = false, malformedContext = false, failure, wrongPass = false, falseExclude = false, hold = false, referenceClaim = false, referenceError = false } = {}) {
  let calls = 0, batchIndex = -1;
  const payloads = [];
  return { count: () => calls, payloads, fetcher: async (_, init) => {
    calls++;
    const body = JSON.parse(init.body);payloads.push(body);
    if (failure === "network") throw new Error("secret provider detail");
    if (failure === "http") return new Response("secret provider detail", { status: 429 });
    if (failure === "json") return Response.json({ private: "secret provider detail" });
    if (body.messages) {
      if (malformedContext) return Response.json({ choices: [{ finish_reason: "stop", message: { content: "secret invalid body" } }] });
      const { candidates, references } = JSON.parse(body.messages[1].content);
      return Response.json({ usage: { prompt_tokens: 20, completion_tokens: 10 }, choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ reviews: candidates.map(({ index }) => ({ index, detectedLanguage: fixture.batches[batchIndex].settings.language,
        checks: Object.fromEntries(["meaning", "reading", "evidence", "relevance", "novelty"].map((k) => [k, { verdict: hold ? "uncertain" : "pass", reason: "Offline fixture reasoning", ...(k === "novelty" ? referenceClaim && index === 2 ? { verdict: "fail", reference: references[0] } : { referenceIndex: null } : {}) }])) })) }) } }] });
    }
    if (referenceError && Object.keys(body.questions)[0].startsWith("corpus")) return Response.json({ answers: {} });
    const quality = Object.keys(body.questions).some((k) => k.startsWith("unit"));
    if (quality) batchIndex++;
    const cases = fixture.batches[batchIndex].cases;
    const answers = Object.fromEntries(Object.entries(body.questions).map(([id, q]) => {
      let choice;
      if (quality) {
        const [, index, check] = id.match(/^unit(\d+)_(\w+)$/);
        const category = cases[Number(index)].category;
        const failDimension = { meaning: "meaning", reading: "reading", language: "relevance", scene: "relevance", injection: "evidence", unobserved: "evidence" }[category];
        choice = check === failDimension ? "fail" : "pass";
        if (wrongPass) choice = "pass";
        if (falseExclude && index === "0" && check === "meaning") choice = "fail";
      } else choice = id === "pair0_2" ? "duplicate" : "distinct";
      const confidence = quality && uncertain && choice === "pass" ? .4 : .98;
      return [id, { type: "choice", choice, confidence,
        probabilities: Object.fromEntries(Object.keys(q.criteria).map((k) => [k, k === choice ? .98 : .02])) }];
    }));
    return Response.json({ model: "jev-offline-fixture", answers, usage: { input_tokens: 100, output_tokens: 10 } });
  } };
}
test("plan is offline without keys or transport; invalid flags/caps never dispatch", async () => {
  const t = transport();
  const key = process.env.HANMADI_JEV_API_KEY;
  delete process.env.HANMADI_JEV_API_KEY;
  try {
    const plan = await runQualityEvaluation({ fetcher: t.fetcher });
    assert.equal(plan.liveExecuted, false); assert.equal(plan.cases, 24);
    assert.equal(plan.productionEligible, false); assert.equal(plan.actualCostUsd, null);
    await assert.rejects(runQualityEvaluation({ live: true, maxRequests: 12, fetcher: t.fetcher }));
  } finally { process.env.HANMADI_JEV_API_KEY = key; }
  for (const maxRequests of [undefined, 0, 13, 1.5, NaN]) await assert.rejects(runQualityEvaluation({ live: true, maxRequests, fetcher: t.fetcher }));
  for (const args of [["--live"], ["--live", "--max-requests", "13"], ["--live", "--max-requests", "01"], ["--plan", "--live"]]) assert.throws(() => parseEvaluationOptions(args));
  assert.deepEqual(parseEvaluationOptions([]), { live: false });
  assert.deepEqual(parseEvaluationOptions(["--live", "--max-requests", "12"]), { live: true, maxRequests: 12 });
  assert.equal(t.count(), 0);
});
test("fresh fixture is fixed, balanced and disjoint from prior committed holdouts", () => {
  const plan = evaluationPlan();
  assert.equal(plan.fixtureSha256, "304d1b48284309c76eb787ee09db8fca4ce20d003ee9ed3505182e1bd927130c");
  assert.equal(fixture.humanReviewed, false);
  assert.equal(fixture.batches.flatMap((b) => b.cases).filter((c) => c.expectedAccepted).length, 8);
  const previous = ["20261001-jev-v6-holdout.json", "20261002-hanmadi-context-holdout.json"].flatMap((name) => {
    const data = JSON.parse(readFileSync(new URL(`../../../docs/qa/fixtures/${name}`, import.meta.url)));
    return data.cases ?? data.batches.flatMap((b) => b.cases);
  });
  const normalized = (s) => s.normalize("NFKC").toLowerCase().replace(/[\s\p{P}]/gu, "");
  const texts = new Set(previous.map((c) => normalized(c.unit.text)));
  assert(fixture.batches.flatMap((b) => b.cases).every((c) => !texts.has(normalized(c.unit.text))));
});
test("full production path reports per-language quality, raw checks, usage and no leaked labels", async () => {
  const t = transport({ uncertain: true });
  const r = await runQualityEvaluation({ live: true, maxRequests: 12, fetcher: t.fetcher });
  assert.equal(r.complete, true);assert.equal(r.qualityCriteriaMet, true);assert.equal(r.productionEligible, false);
  assert.equal(t.count(), 12);assert.equal(r.metrics.normalAccepted, 8);assert.equal(r.metrics.wrongAcceptances, 0);
  assert.equal(r.byLanguage.en.evaluated, 12);assert.equal(r.byLanguage.ja.evaluated, 6);assert.equal(r.byLanguage.es.evaluated, 6);
  assert.equal(r.byCategory.duplicate.excluded, 4);
  assert.equal(r.usage.observedRequests, 12);assert.equal(r.usage.unknownRequests, 0);
  assert.equal(r.usage.inputTokens, 880);assert.equal(r.usage.outputTokens, 120);
  assert.equal(r.rows[0].rawQualityDisposition, "review");assert.equal(r.rows[0].disposition, "accepted");
  const payload = JSON.stringify(t.payloads);
  for (const c of fixture.batches.flatMap((b) => b.cases)) { assert(!payload.includes(c.id));assert(!payload.includes(c.reason)); }
  assert(!payload.includes("expectedAccepted"));assert(!payload.includes("labelProvenance"));
  assert(r.requestObservations.every((x) => !Object.hasOwn(x, "headers")));
});
test("limit blocks the very next request, stops swallowed context failures and never passes partial output", async () => {
  for (const maxRequests of [1, 2, 4]) {
    const t = transport({ uncertain: true });
    const r = await runQualityEvaluation({ live: true, maxRequests, fetcher: t.fetcher });
    assert.equal(t.count(), maxRequests);assert.equal(r.stopReason, "request_limit");
    assert.equal(r.complete, false);assert.equal(r.qualityCriteriaMet, false);
    assert.equal(r.metrics.evaluated + r.metrics.failedCases + r.metrics.unattemptedCases, 24);
  }
});
test("HTTP, network, schema and context errors stop without retry or provider-body leakage", async () => {
  for (const settings of [{ failure: "http" }, { failure: "network" }, { failure: "json" }, { uncertain: true, malformedContext: true }]) {
    const t = transport(settings);
    const r = await runQualityEvaluation({ live: true, maxRequests: 12, fetcher: t.fetcher });
    assert.equal(t.count(), settings.malformedContext ? 2 : 1);
    assert.equal(r.complete, false);assert.equal(r.qualityCriteriaMet, false);
    assert(r.metrics.unattemptedCases > 0);
    for (const secret of ["secret", "offline-quality-key", "offline-review-key"]) assert(!JSON.stringify(r).includes(secret));
  }
});
test("wrong acceptance, unnecessary hold and false exclusion are distinct failed criteria", async () => {
  for (const [settings, key] of [[{ wrongPass: true }, "wrongAcceptances"], [{ uncertain: true, hold: true }, "normalHolds"], [{ falseExclude: true }, "falseExclusions"]]) {
    const t = transport(settings), r = await runQualityEvaluation({ live: true, maxRequests: 12, fetcher: t.fetcher });
    assert.equal(r.complete, true);assert.equal(r.qualityCriteriaMet, false);assert(r.metrics[key] > 0);
  }
});
test("unplanned context model is rejected before using any key", async () => {
  const t = transport();process.env.HANMADI_VIDEO_REVIEW_MODEL = "unplanned-model";
  try { await assert.rejects(runQualityEvaluation({ live: true, maxRequests: 12, fetcher: t.fetcher })); }
  finally { delete process.env.HANMADI_VIDEO_REVIEW_MODEL; }
  assert.equal(t.count(), 0);
});

test("reference verification has its own stage, preserves the live cap and stops on swallowed schema failure", async () => {
  assert.equal(evaluationPlan().maximumRequestsPerBatch, 4);
  for (const [cap, referenceError, reason] of [[2, false, "request_limit"], [12, true, "reference_error"]]) {
    const t = transport({ uncertain: true, referenceClaim: true, referenceError });
    const r = await runQualityEvaluation({ live: true, maxRequests: cap, fetcher: t.fetcher });
    assert.equal(r.stopReason, reason); assert.equal(r.complete, false);
    assert.equal(r.referenceEvidenceComplete, false); assert.equal(r.qualityCriteriaMet, false);
    // The current batch still dedupes its two healthy candidates; no later batch runs.
    assert.equal(t.count(), referenceError ? 4 : 2);
    if (referenceError) assert.equal(r.requestObservations[2].stage, "reference");
  }
});
