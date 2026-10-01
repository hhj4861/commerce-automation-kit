import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseLanguage, diagnosticLanguages, type DiagnosticReport } from "./llm-diagnostics";
import { diagnosticService, cronAuthorized } from "./llm-diagnostics-store";
import type { studyCompletion } from "./v2-ai";
const phrase = { text: "氷抜きでコーヒーを一杯ください。", reading: "고오리누키데 코히오 입파이 쿠다사이", meaning: "얼음 없이 커피 한 잔 주세요." };
const reply = { text: "氷抜きのコーヒーですね。", reading: "고오리누키노 코히데스네", meaning: "얼음을 뺀 커피군요." };
const good: typeof studyCompletion = async (_s, _m, _sel, format) => {
  const name = (format as { json_schema: { name: string } }).json_schema.name;
  return JSON.stringify(name === "hanmadi_translation" ? { translated: phrase.text, reading: phrase.reading, practice: phrase } : name === "hanmadi_learner_turn" ? { phrase, reusable: true } : reply);
};
const search = async () => [];
test("production validators exercise chat, learner conversion and translation without user storage", async () => {
  const report = await diagnoseLanguage("ja", { search, complete: good });
  assert.equal(report.status, "passed");
  assert.deepEqual(report.probes.map(p => p.calls), [1,1,1]);
  assert(!JSON.stringify(report).includes(phrase.text));
});
test("quality repair, exhaustion and transport failure have distinct findings and bounded calls", async () => {
  let count = 0;
  const repaired = await diagnoseLanguage("ja", { search, complete: async (...args) => ++count === 1 ? "bad" : good(...args) });
  assert.equal(repaired.status, "warning");
  assert.deepEqual(repaired.probes[0].findings, ["repaired"]);
  assert.equal(repaired.probes[0].calls, 2);
  const invalid = await diagnoseLanguage("ja", { search, complete: async () => "secret-invalid-output" });
  assert.equal(invalid.status, "failed");
  assert(invalid.probes.every(p => p.calls === 2 && p.findings.includes("quality")));
  const offline = await diagnoseLanguage("ja", { search, complete: async () => { throw new Error("secret-api-key"); } });
  assert(offline.probes.every(p => p.calls === 1 && p.failures === 1 && p.findings.includes("upstream")));
  assert(!JSON.stringify([invalid,offline]).includes("secret"));
});
test("slow completion is measured; missing practice is not a passing learner test", async () => {
  let clock = 0;
  const slow = await diagnoseLanguage("ja", { search, now: () => clock, complete: async (...args) => { clock += 9000; return good(...args); } });
  assert.equal(slow.status, "warning");
  assert(slow.probes.every(p => p.ms === 9000 && p.llmMs === 9000 && p.findings.includes("slow")));
  const missing = await diagnoseLanguage("ja", { search, complete: async (...args) => args[0].includes("You recast") ? '{"phrase":null,"reusable":false}' : good(...args) });
  assert(missing.probes[1].findings.includes("quality"));
});
test("retrieval failure skips only dependent probes and survives without error text", async () => {
  const r = await diagnoseLanguage("ja", { search: async mode => { if (mode === "chat") throw new Error("redis-secret"); return []; }, complete: good });
  assert.equal(r.status, "failed");assert.equal(r.probes[0].calls,0);
  assert.deepEqual(r.probes[0].findings,["retrieval"]);
  assert.equal(r.probes[1].calls,1);assert.equal(r.probes[2].calls,1);
  assert(!JSON.stringify(r).includes("redis-secret"));
});
function database() {
  const data = new Map<string,string>();
  return { get: async (k: string) => data.get(k) ?? null,
    cas: async (k: string, expected: string | null, value: string) => {
      if ((data.get(k) ?? null) !== expected) return false; data.set(k,value); return true;
    } };
}
const report = (language = "ja"): DiagnosticReport => ({ version: 1, language: language as DiagnosticReport["language"], startedAt: 1, finishedAt: 2, retrievalMs: 0, retrievalFailed: false, probes: [], status: "passed" });
test("atomic per-language claims prevent concurrency, scheduled replay and manual overspend", async () => {
  const db = database(), service = diagnosticService(db);
  let release!: () => void;const hold = new Promise<void>(r => release=r);
  const first = service.run("ja","manual",async () => { await hold; return report(); });
  await new Promise(r => setImmediate(r));
  await assert.rejects(service.run("ja","manual",async () => report()), /진단 중/);
  release();await first;
  await service.run("ja","manual",async () => report());
  await assert.rejects(service.run("ja","manual",async () => report()), /2회/);
  await service.run("ja","scheduled",async () => report());
  assert.deepEqual(await service.run("ja","scheduled",async () => { throw Error("must not call"); }),{ skipped:true });
  await service.run("th","manual",async () => report("th"));
  assert.equal((await service.list()).find(r => r.language === "ja")!.runs.length,3);
});
test("day rollover resets budget, retains bounded history, and expired leases become interrupted", async () => {
  const db = database();let clock=1000000;const service=diagnosticService(db,()=>clock);
  let release!:()=>void;const wait=new Promise<void>(r=>release=r);
  const pending=service.run("ja","manual",async()=>{await wait;return report();});
  await new Promise(r=>setImmediate(r));clock+=600001;
  assert.equal((await service.list()).find(r=>r.language==='ja')!.runs[0].status,'interrupted');
  release();await assert.rejects(pending,/中断|중단/);
  for(let day=0;day<12;day++){clock+=86400000;await service.run("ja","scheduled",async()=>report());}
  assert.equal((await service.list()).find(r=>r.language==='ja')!.runs.length,10);
});
test("execution crashes persist interruption; storage failure never runs the model", async()=>{
  const service=diagnosticService(database());
  await assert.rejects(service.run("ja","manual",async()=>{throw Error('secret');}), /진단 실행이 중단/);
  assert.equal((await service.list()).find(r=>r.language==='ja')!.runs[0].status,'interrupted');
  let calls=0;const broken=diagnosticService({get:async()=>null,cas:async()=>false});
  await assert.rejects(broken.run('ja','manual',async()=>{calls++;return report();}), /저장 중/);
  assert.equal(calls,0);
});
test("cron authentication fails closed and does not accept prefixes or missing configuration",()=>{
  const secret='diagnostics-fixture-secret-32-characters';
  assert(cronAuthorized(`Bearer ${secret}`,secret));
  for(const h of [null,'',`Bearer ${secret}x`,`bearer ${secret}`])assert(!cronAuthorized(h,secret));
  assert(!cronAuthorized('Bearer undefined',undefined));assert(!cronAuthorized('Bearer short','short'));
  assert.equal(diagnosticLanguages.length,4);
});
