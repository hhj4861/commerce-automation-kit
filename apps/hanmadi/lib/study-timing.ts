import type { StudyLanguage } from "./v2";

type Stage = "quota" | "knowledge" | "reply" | "learner" | "reply_llm" | "learner_llm" | "save";
type Metric = { ms: number; calls: number; failures: number; pending: number };

/** Request-local measurements. Never accepts prompts, account IDs, model IDs or errors. */
export class StudyTiming {
  private stages: Partial<Record<Stage, Metric>> = {};
  constructor(
    private language: StudyLanguage,
    private started = performance.now(),
    private now = () => performance.now(),
    private log: (value: object) => void = value => console.info(JSON.stringify(value)),
  ) {}
  async measure<T>(stage: Stage, work: () => Promise<T>): Promise<T> {
    const at = this.now();
    const metric = this.stages[stage] ??= { ms: 0, calls: 0, failures: 0, pending: 0 };
    metric.calls++; metric.pending++;
    try { return await work(); }
    catch (error) { metric.failures++; throw error; }
    finally { metric.pending--; metric.ms += Math.max(0, this.now() - at); }
  }
  finish(response: Response) {
    const totalMs = Math.round(Math.max(0, this.now() - this.started));
    const stages = Object.fromEntries(Object.entries(this.stages).map(([key, value]) =>
      [key, { ...value, ms: Math.round(value.ms) }],
    ));
    response.headers.set("Server-Timing", [
      `total;dur=${totalMs}`,
      ...Object.entries(stages).map(([key, value]) =>
        `${key};dur=${value.ms};desc="calls=${value.calls} failures=${value.failures} pending=${value.pending}"`,
      ),
    ].join(", "));
    if (totalMs >= 8000 || response.status >= 500 || Object.values(stages).some(m => m.failures)) {
      // Logging must not change the user's reply or turn an upstream failure into a new one.
      try { this.log({ event: "hanmadi_chat_timing", language: this.language, status: response.status, totalMs, stages }); }
      catch { /* Telemetry is best-effort; the response is already determined. */ }
    }
    return response;
  }
}
