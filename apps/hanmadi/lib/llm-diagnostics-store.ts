import { randomUUID, timingSafeEqual } from "node:crypto";
import { v2Driver } from "./store";
import { ConversationError } from "./conversation";
import { diagnoseLanguage, diagnosticInput, diagnosticLanguages, type DiagnosticReport } from "./llm-diagnostics";
import { searchKnowledge } from "./learning-retrieval";
import type { StudyLanguage } from "./v2";
export type DiagnosticRun = {
  id: string; language: StudyLanguage; source: "manual" | "scheduled";
  startedAt: number; leaseUntil: number;
  status: "running" | "passed" | "warning" | "failed" | "interrupted";
  report?: DiagnosticReport;
};
type State = { day: string; manual: number; scheduled: boolean; runs: DiagnosticRun[] };
type DB = Pick<ReturnType<typeof v2Driver>, "get" | "cas">;
const leaseMs = 10 * 60 * 1000;
export function cronAuthorized(header: string | null, secret: string | undefined) {
  if (!secret || secret.length < 32 || !header) return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function diagnosticService(db: DB, now = Date.now) {
  const key = (language: StudyLanguage) => `llm-diagnostics:v1:${language}`;
  function decode(raw: string | null): State {
    const state: State = raw ? JSON.parse(raw) : { day: "", manual: 0, scheduled: false, runs: [] };
    for (const run of state.runs) if (run.status === "running" && run.leaseUntil <= now()) run.status = "interrupted";
    return state;
  }
  async function change<T>(language: StudyLanguage, fn: (s: State) => T) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const raw = await db.get(key(language)), state = decode(raw);
      const value = fn(state);
      if (await db.cas(key(language), raw, JSON.stringify(state))) return value;
    }
    throw new ConversationError(409, "다른 진단이 저장 중이에요. 잠시 후 새로고침해 주세요.");
  }
  return {
    async list() {
      return (await Promise.all(diagnosticLanguages.map(async language => ({
        language, runs: decode(await db.get(key(language))).runs,
      }))));
    },
    async run(language: StudyLanguage, source: "manual" | "scheduled", execute: () => Promise<DiagnosticReport>) {
      const run = await change(language, s => {
        const day = new Date(now()).toISOString().slice(0, 10);
        if (s.day !== day) { s.day = day; s.manual = 0; s.scheduled = false; }
        if (source === "scheduled" && s.scheduled) return null;
        if (s.runs.some(r => r.status === "running"))
          throw new ConversationError(409, "이 언어를 진단 중이에요. 새로고침으로 결과를 확인해 주세요.");
        if (source === "manual" && s.manual >= 2)
          throw new ConversationError(429, "이 언어의 오늘 수동 진단 2회를 사용했어요. 자동 진단은 별도로 실행돼요.");
        if (source === "scheduled") s.scheduled = true; else s.manual++;
        const r: DiagnosticRun = { id: randomUUID(), language, source, startedAt: now(), leaseUntil: now() + leaseMs, status: "running" };
        s.runs = [r, ...s.runs].slice(0, 10);
        return r;
      });
      if (!run) return { skipped: true as const };
      // A crash leaves an observable running record which becomes interrupted, never a false pass.
      let report: DiagnosticReport;
      try { report = await execute(); }
      catch {
        await change(language, s => {
          const record = s.runs.find(r => r.id === run.id);
          if (record?.status === "running") record.status = "interrupted";
        });
        throw new ConversationError(503, "진단 실행이 중단됐어요. 서버 상태를 확인한 뒤 다시 실행해 주세요.");
      }
      await change(language, s => {
        const record = s.runs.find(r => r.id === run.id);
        if (!record || record.status !== "running")
          throw new ConversationError(409, "진단이 중단되었거나 제한 시간을 넘겼어요. 다시 상태를 확인해 주세요.");
        record.status = report.status; record.report = report;
      });
      return { skipped: false as const, report };
    },
  };
}
export function diagnostics() { return diagnosticService(v2Driver()); }
export function executeDiagnostic(language: StudyLanguage) {
  return diagnoseLanguage(language, { search: mode => searchKnowledge({ language, mode, level: 1, scene: "cafe", text: diagnosticInput }) });
}
