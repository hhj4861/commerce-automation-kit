import { StudyAIError } from "./study-ai-errors";
import { roleplayReply, learnerTurn, translate, studyCompletion } from "./v2-ai";
import type { KnowledgeMatch } from "./knowledge";
import type { StudyLanguage } from "./v2";

import { diagnosticInput, diagnosticVersion, type DiagnosticReport, type ProbeResult } from "./llm-diagnostics-types";
export * from "./llm-diagnostics-types";

// Exercises the app's production validators and bounded repairs with synthetic input only.
// No learner account, conversation storage, provider fallback, fine-tuning or configuration writes.
export async function diagnoseLanguage(language: StudyLanguage, deps: {
  complete?: typeof studyCompletion;
  search: (mode: "chat" | "translation") => Promise<KnowledgeMatch[]>;
  now?: () => number;
}): Promise<DiagnosticReport> {
  const now = deps.now ?? Date.now, startedAt = now();
  const complete = deps.complete ?? studyCompletion;
  const retrievalAt = now();
  const references = await Promise.allSettled([deps.search("chat"), deps.search("translation")]);
  const retrievalMs = Math.max(0, now() - retrievalAt);
  const probes: ProbeResult[] = [];
  for (const kind of ["chat", "learner", "translation"] as const) {
    const ref = references[kind === "translation" ? 1 : 0];
    if (kind !== "learner" && ref.status === "rejected") {
      probes.push({ kind, ms: 0, llmMs: 0, calls: 0, failures: 0, findings: ["retrieval"] });
      continue;
    }
    const at = now();
    const probe: ProbeResult = { kind, ms: 0, llmMs: 0, calls: 0, failures: 0, findings: [] };
    let lastCompletionFailed = false;
    let failureReason: StudyAIError["reason"] | undefined;
    const measured: typeof studyCompletion = async (...args) => {
      probe.calls++;
      lastCompletionFailed = false;
      const llmAt = now();
      try { return await complete(...args); }
      catch (error) { lastCompletionFailed = true; probe.failures++; if (error instanceof StudyAIError) failureReason = error.reason; throw error; }
      finally { probe.llmMs += Math.max(0, now() - llmAt); }
    };
    try {
      const messages = [{ role: "user" as const, content: diagnosticInput }];
      const refs = ref.status === "fulfilled" ? ref.value : [];
      if (kind === "chat") await roleplayReply(language, 1, "cafe", messages, "default", measured, refs);
      if (kind === "learner") {
        const learner = await learnerTurn(language, messages, "default", measured);
        if (!learner.phrase || !learner.reusable) throw new Error("Missing reusable synthetic phrase");
      }
      if (kind === "translation") {
        const result = await translate(diagnosticInput, language, "ko", measured, refs);
        if (!result.practice) throw new Error("Missing practice for synthetic input");
      }
      if (probe.calls > 1) probe.findings.push(probe.failures ? "recovered" : "repaired");
    } catch {
      // Never persist exception text or rejected model output; it can contain secrets.
      probe.findings.push(lastCompletionFailed ? "upstream" : "quality");
      if (lastCompletionFailed && failureReason) probe.findings.push(failureReason);
    }
    probe.ms = Math.max(0, now() - at);
    if (probe.ms >= 8000) probe.findings.push("slow");
    probes.push(probe);
  }
  const failed = probes.some(p => p.findings.some(f => ["upstream", "quality", "retrieval"].includes(f)));
  return { version: diagnosticVersion, language, startedAt, finishedAt: now(), retrievalMs,
    retrievalFailed: references.some(r => r.status === "rejected"), probes,
    status: failed ? "failed" : retrievalMs >= 8000 || probes.some(p => p.findings.length) ? "warning" : "passed" };
}
