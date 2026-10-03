// Offline plan by default. Live evaluation uses the unchanged production judge.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import policy from "../lib/video-policy.ts";
import provider from "../lib/video-provider.ts";
import v2 from "../lib/v2.ts";
import { observeUsage } from "./video-jev-live-check.mjs";

const fixtureUrl = new URL("../../../docs/qa/fixtures/20261003-jev-quality-evaluation.json", import.meta.url);
const digest = (value) => createHash("sha256").update(value).digest("hex");
export function loadEvaluation() {
  const bytes = readFileSync(fixtureUrl);
  const fixture = JSON.parse(bytes);
  const ids = new Set();
  if (fixture.version !== 1 || fixture.humanReviewed !== false || fixture.batches.length !== 4)
    throw new Error("Invalid evaluation fixture.");
  for (const batch of fixture.batches) {
    if (!v2.isStudyLanguage(batch.settings.language) || !v2.curriculum.scenes.some((s) => s.id === batch.settings.scene) || batch.settings.level !== 1 || batch.cases.length !== 6)
      throw new Error("Invalid evaluation batch.");
    for (const c of batch.cases) {
      if (ids.has(c.id) || typeof c.id !== "string" || c.expectedAccepted !== (c.category === "valid") || typeof c.reason !== "string" || !["valid", "duplicate", "meaning", "reading", "language", "scene", "unobserved", "injection"].includes(c.category))
        throw new Error("Invalid evaluation case.");
      ids.add(c.id);
      if (!["text", "meaning", "reading", "evidence"].every((k) => typeof c.unit[k] === "string" && c.unit[k].length > 0 && c.unit[k].length <= (k === "evidence" ? 240 : 300)) || !Number.isFinite(c.unit.at) || c.unit.at < 0 || c.unit.at > 180)
        throw new Error("Invalid evaluation input.");
    }
  }
  return { fixture, fixtureSha256: digest(bytes) };
}
export function parseEvaluationOptions(args) {
  if (!args.length || args.length === 1 && args[0] === "--plan") return { live: false };
  if (args.length === 3 && args[0] === "--live" && args[1] === "--max-requests" && /^(?:[1-9]|1[0-2])$/.test(args[2]))
    return { live: true, maxRequests: Number(args[2]) };
  throw new Error("Use --plan or --live --max-requests N (1-12).");
}
export function evaluationPlan() {
  const { fixture, fixtureSha256 } = loadEvaluation();
  return { event: "hanmadi_jev_quality_plan", fixtureId: fixture.id, fixtureSha256,
    rubric: policy.VIDEO_RUBRIC, labelProvenance: fixture.labelProvenance,
    humanReviewed: false, liveExecuted: false, productionEligible: false,
    cases: fixture.batches.flatMap((b) => b.cases).length,
    batches: fixture.batches.map((b) => ({ id: b.id, settings: b.settings, cases: b.cases.length })),
    criteria: fixture.criteria, maximumRequests: 12, maximumRequestsPerBatch: 4,
    requestCapNote: "The 12-request approval cap is unchanged; four batches can now require up to 16 calls and may stop early.",
    models: { jev: "jev-1.13.0", context: "hanmadi-chat" },
    estimatedCostUsd: null, actualCostUsd: null,
    costNote: "Token counts are not billing. Reconcile temporary-key ledger separately; configure a server budget before live calls.",
    sourceSha256: Object.fromEntries(["video-provider.ts", "video-policy.ts", "video-language-review.ts", "v2-curriculum.ts", "v2-scene-lessons.ts"].map((name) => [name, digest(readFileSync(new URL(`../lib/${name}`, import.meta.url)))])),
  };
}
function metrics(rows) {
  const normals = rows.filter((r) => r.expectedAccepted);
  const normalAccepted = normals.filter((r) => r.disposition === "accepted").length;
  const normalHolds = normals.filter((r) => r.disposition === "review").length;
  return { evaluated: rows.length, normals: normals.length, normalAccepted, normalHolds,
    falseExclusions: normals.filter((r) => r.disposition === "excluded").length,
    wrongAcceptances: rows.filter((r) => !r.expectedAccepted && r.disposition === "accepted").length,
    negativeHolds: rows.filter((r) => !r.expectedAccepted && r.disposition === "review").length,
    normalAcceptanceRate: normals.length ? normalAccepted / normals.length : null,
    normalHoldRate: normals.length ? normalHolds / normals.length : null,
    unverifiedReferences: rows.filter((r) => r.judgment.contextReview?.claimedReference && r.judgment.contextReview?.referenceVerification?.outcome !== "duplicate").length,
    contextErrors: rows.filter((r) => r.judgment.contextReview?.outcome === "error").length,
    review: rows.filter((r) => r.disposition === "review").length,
    excluded: rows.filter((r) => r.disposition === "excluded").length,
  };
}
export async function runQualityEvaluation({ live = false, maxRequests, fetcher = fetch } = {}) {
  const plan = evaluationPlan();
  if (!live) return plan;
  if (live !== true || !Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 12)
    throw new Error("Explicit live cap required.");
  if (!["HANMADI_JEV_API_KEY", "LITELLM_API_KEY", "LITELLM_BASE_URL"].every((k) => process.env[k]?.trim()) || process.env.LITELLM_MODEL !== "hanmadi-chat" || (process.env.HANMADI_VIDEO_REVIEW_MODEL?.trim() || "hanmadi-chat") !== "hanmadi-chat")
    throw new Error("Dedicated credentials and the planned context alias required.");
  const { fixture } = loadEvaluation();
  const requests = [], batches = [], rows = [];
  const started = Date.now();
  let stopReason = null;
  for (const batch of fixture.batches) {
    const observed = { id: batch.id, language: batch.settings.language, caseCount: batch.cases.length, completed: false, elapsedMs: 0 };
    batches.push(observed);
    const start = Date.now();
    try {
      const result = await provider.judgeVideo({ title: "합성 품질 평가", seconds: 180,
        // Labels, category, ID and rationale must NEVER enter a model request.
        units: batch.cases.map((c) => ({ ...c.unit })) }, [], batch.settings,
      async (url, init) => {
        if (stopReason) throw new Error("evaluation_stopped");
        if (requests.length >= maxRequests) { stopReason = "request_limit"; throw new Error("request_limit"); }
        const body = JSON.parse(init.body);
        const stage = body.messages ? "context" : Object.keys(body.questions ?? {}).some((k) => k.startsWith("unit")) ? "quality" : Object.keys(body.questions ?? {}).some((k) => k.startsWith("corpus")) ? "reference" : "dedupe";
        const record = { batch: batch.id, stage, model: body.model, status: null, usage: null, elapsedMs: 0 };
        requests.push(record);
        const requestStart = Date.now();
        try {
          const response = await fetcher(url, init);
          record.status = response.status;
          if (!response.ok) stopReason = "upstream_error";
          record.usage = await observeUsage(response, init.signal);
          return response;
        } catch { stopReason ??= "transport_error"; throw new Error("transport_error"); }
        finally { record.elapsedMs = Date.now() - requestStart; }
      });
      if (result.judgments.length !== batch.cases.length || result.judgments.some((j, i) => j.index !== i))
        throw new Error("invalid_judgment_mapping");
      observed.completed = true;
      rows.push(...result.judgments.map((judgment, i) => ({ id: batch.cases[i].id, batch: batch.id,
        language: batch.settings.language, category: batch.cases[i].category,
        expectedAccepted: batch.cases[i].expectedAccepted,
        disposition: policy.videoDisposition(judgment), judgment,
        // Raw check conjunction, not a separately executed JEV-only pipeline.
        rawQualityDisposition: policy.classifyVideoChecks(i, judgment.checks).disposition,
      })));
      if (result.judgments.some((j) => j.contextReview?.outcome === "error")) stopReason ??= "context_error";
      if (result.judgments.some((j) => j.contextReview?.referenceVerification?.outcome === "error")) stopReason ??= "reference_error";
    } catch { stopReason ??= "evaluation_error"; }
    finally { observed.elapsedMs = Date.now() - start; }
    if (stopReason) break; // No retry and no further paid batches after failure.
  }
  const complete = !stopReason && rows.length === plan.cases && batches.every((b) => b.completed);
  const total = metrics(rows), criteria = fixture.criteria;
  const qualityCriteriaMet = complete && total.wrongAcceptances <= criteria.maxWrongAcceptances && total.falseExclusions <= criteria.maxFalseExclusions && total.normalAcceptanceRate >= criteria.minNormalAcceptanceRate && total.normalHoldRate <= criteria.maxNormalHoldRate && total.contextErrors <= criteria.maxContextErrors;
  const usable = requests.filter((r) => r.usage);
  const times = requests.map((r) => r.elapsedMs).sort((a, b) => a - b);
  return { ...plan, event: "hanmadi_jev_quality_result", liveExecuted: true,
    maxRequests, requestCount: requests.length, complete, qualityCriteriaMet,
    referenceEvidenceComplete: complete && total.unverifiedReferences === 0,
    // Fresh synthetic tests alone never authorize a production promotion.
    productionEligible: false, stopReason, elapsedMs: Date.now() - started,
    metrics: { ...total, totalCases: plan.cases,
      failedCases: batches.filter((b) => !b.completed).reduce((n, b) => n + b.caseCount, 0),
      unattemptedCases: plan.cases - batches.reduce((n, b) => n + b.caseCount, 0) },
    byLanguage: Object.fromEntries([...new Set(fixture.batches.map((b) => b.settings.language))].map((lang) => [lang, metrics(rows.filter((r) => r.language === lang))])),
    byCategory: Object.fromEntries([...new Set(fixture.batches.flatMap((b) => b.cases.map((c) => c.category)))].map((category) => [category, metrics(rows.filter((r) => r.category === category))])),
    latency: { requestP50Ms: times.length ? times[Math.ceil(times.length * .5) - 1] : null,
      requestP95Ms: times.length ? times[Math.ceil(times.length * .95) - 1] : null },
    usage: { inputTokens: usable.reduce((n, r) => n + r.usage.inputTokens, 0), outputTokens: usable.reduce((n, r) => n + r.usage.outputTokens, 0),
      observedRequests: usable.length, unknownRequests: requests.length - usable.length },
    requestObservations: requests, batchObservations: batches, rows,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runQualityEvaluation(parseEvaluationOptions(process.argv.slice(2)));
    console.log(JSON.stringify(result));
    if (result.liveExecuted && !result.qualityCriteriaMet) process.exitCode = 1;
  } catch {
    console.error("Evaluation not started. Check fixture, dedicated credentials and --plan or --live --max-requests N (1-12).");
    process.exitCode = 1;
  }
}
