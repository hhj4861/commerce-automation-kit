"use client";
import { useEffect, useRef, useState } from "react";
import { diagnosticInput, findingAdvice, type ProbeKind } from "@/lib/llm-diagnostics-types";
import type { DiagnosticRun } from "@/lib/llm-diagnostics-store";
import { studyLanguages, type StudyLanguage } from "@/lib/v2";
type Snapshot = { languages: { language: StudyLanguage; runs: DiagnosticRun[] }[]; scheduleConfigured: boolean; checkedAt: number };
const labels: Record<DiagnosticRun["status"], string> = { running: "진단 중", passed: "검사 통과", warning: "주의 필요", failed: "검사 실패", interrupted: "진단 중단" };
const probeLabels: Record<ProbeKind, string> = { chat: "AI 회화", learner: "내 말 변환", translation: "번역" };
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}초`;
async function api(language?: StudyLanguage, signal?: AbortSignal): Promise<Snapshot | unknown> {
  const response = await fetch("/api/study/admin/diagnostics", {
    method: language ? "POST" : "GET", cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(language ? 280000 : 15000),
    ...(language ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language }) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "진단 상태를 확인하지 못했어요.");
  return data;
}
export function DiagnosticsAdmin() {
  const [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState("");
  const [busy, setBusy] = useState<StudyLanguage | "refresh" | null>(null);
  const locked = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void api(undefined, controller.signal).then(d => setData(d as Snapshot)).catch(e => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => { mounted.current = false; controller.abort(); };
  }, []);
  async function refresh(language?: StudyLanguage) {
    if (locked.current) return;
    locked.current = true; setBusy(language ?? "refresh"); setError("");
    try {
      if (language) await api(language);
      const snapshot = await api() as Snapshot;
      if (mounted.current) setData(snapshot);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "상태를 확인하지 못했어요. 새로고침해 주세요.");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  return <section className="dg" aria-label="AI 진단">
    <div className="hm-panel">
      <h2>AI가 지금 제대로 응답하나요?</h2>
      <p>카페 · 레벨 1 · 기본 AI 경로를 고정 예문으로 검사합니다. 회화에는 현재 활성 학습 모델이 적용될 수 있어요.</p>
      <blockquote>{diagnosticInput}</blockquote>
      <p className="hm-muted">목표 언어·한글 발음·한국어 뜻의 형식, 일부 의미 오류와 재시도·응답 시간을 확인해요. 모든 상황의 정확도나 음성 속도, 개인 Codex·Claude 연결을 보증하는 검사는 아니에요.</p>
      <p role="status">{data ? data.scheduleConfigured ? "자동 진단 설정됨 · 매일 09시대(KST). 아래 실행 기록으로 실제 수행 여부를 확인하세요." : "자동 진단 미설정 · 서버 활성화와 예약 인증 설정이 필요해요." : error ? "진단 상태를 불러오지 못했어요." : "진단 이력을 불러오는 중…"}</p>
      <p className="hm-muted">수동 검사는 언어당 하루 2회(UTC 기준), 최대 AI 6회 호출입니다. 고정 예문만 보내며 사용자 대화를 저장하거나 모델을 자동 변경하지 않아요.</p>
      <button disabled={!!busy || (!data && !error)} onClick={() => void refresh()}>상태 새로고침</button>
    </div>
    {error && <p className="hm-alert" role="alert">{error} 서버에서 실행 중일 수 있으니 상태를 새로고침해 주세요.</p>}
    {busy && busy !== "refresh" && <p role="status">{studyLanguages[busy].name} 진단 중… 최대 수 분 걸릴 수 있어요. 화면을 떠나도 서버 진단은 계속됩니다.</p>}
    <div className="dg-grid">{data?.languages.map(({ language, runs }) => {
      const latest = runs[0];
      const stale = !!latest && data.checkedAt - latest.startedAt > 36 * 60 * 60 * 1000;
      return <article className="hm-panel" key={language} aria-label={`${studyLanguages[language].name} 진단`}>
        <div className="dg-heading"><h3>{studyLanguages[language].name}</h3><span className="dg-status" data-status={latest?.status}>{latest ? labels[latest.status] : "검사 전"}</span></div>
        {stale && <p className="hm-alert">36시간 이상 지난 결과예요. 다시 검사해 주세요.</p>}
        <p>{latest ? `마지막 시작: ${new Date(latest.startedAt).toLocaleString("ko-KR")} · ${latest.source === "scheduled" ? "자동" : "수동"}` : "아직 진단 기록이 없어요."}</p>
        {latest?.status === "interrupted" && <p role="status">정상 완료 기록이 없어요. 서버 시간 초과나 중단 여부를 확인한 뒤 다시 실행하세요.</p>}
        {latest?.status === "running" && <p>실행 중이에요. 결과가 보이지 않으면 상태를 새로고침해 주세요. 10분 이상 완료되지 않으면 중단으로 표시합니다.</p>}
        <button className="hm-primary" disabled={!!busy || latest?.status === "running"} onClick={() => void refresh(language)}>{studyLanguages[language].name} 지금 진단</button>
        {latest?.report && <>
          <p className="hm-muted">완료: {new Date(latest.report.finishedAt).toLocaleString("ko-KR")} · 자료 검색 {seconds(latest.report.retrievalMs)}{latest.report.retrievalFailed ? " · 실패" : ""}</p>
          {latest.report.retrievalMs >= 8000 && <p className="hm-alert">자료 검색이 8초 이상 걸렸어요. 저장소·검색 연결을 확인하세요.</p>}
          {latest.report.probes.map(p => <section className="dg-probe" key={p.kind}>
            <h4>{probeLabels[p.kind]} · {p.findings.length ? "확인 필요" : "통과"}</h4>
            <p>전체 {seconds(p.ms)} · AI {seconds(p.llmMs)} · 호출 {p.calls}회 · 호출 실패 {p.failures}회</p>
            {p.findings.map(f => <div className="dg-finding" key={f}><strong>{findingAdvice[f].title}</strong><p>{findingAdvice[f].advice}</p></div>)}
          </section>)}
        </>}
        {runs.length > 1 && <details><summary>이전 진단 {runs.length - 1}건</summary><ul>{runs.slice(1).map(r => <li key={r.id}>{new Date(r.startedAt).toLocaleString("ko-KR")} · {labels[r.status]} · {r.source === "scheduled" ? "자동" : "수동"}</li>)}</ul></details>}
      </article>;
    })}</div>
  </section>;
}
