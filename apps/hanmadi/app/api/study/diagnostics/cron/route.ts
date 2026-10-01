import { conversationFailure, conversationJson } from "@/lib/conversation-http";
import { cronAuthorized, diagnostics, executeDiagnostic } from "@/lib/llm-diagnostics-store";
import { diagnosticLanguages } from "@/lib/llm-diagnostics";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(req: Request) {
  if (!cronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET))
    return conversationJson({ error: "진단 실행 인증이 필요해요." }, 401);
  if (process.env.HANMADI_DIAGNOSTICS_ENABLED !== "true")
    return conversationJson({ skipped: true, reason: "scheduled diagnostics disabled" });
  try {
    const service = diagnostics();
    const results = await Promise.allSettled(diagnosticLanguages.map(language =>
      service.run(language, "scheduled", () => executeDiagnostic(language))));
    const summary = results.map((r, i) => ({ language: diagnosticLanguages[i],
      status: r.status === "rejected" ? "execution-failed" : r.value.skipped ? "already-run" : r.value.report.status }));
    return conversationJson({ results: summary }, results.some(r => r.status === "rejected") ? 503 : 200);
  } catch (e) { return conversationFailure(e); }
}
