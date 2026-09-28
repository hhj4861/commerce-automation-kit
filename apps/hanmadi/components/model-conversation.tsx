"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ConversationRoom } from "./conversation-room";
import { GuidedSpeakingRoom } from "./guided-speaking-room";
import type { ModelConnection } from "@/lib/model-connections";

const labels = { authorizing: "연결 확인 중", connected: "연결됨", expired: "다시 로그인 필요", quota_exceeded: "사용 한도 초과", error: "연결 확인 필요", disconnected: "연결 해제됨" };
type Props = React.ComponentProps<typeof ConversationRoom> & { guided: boolean; canConnect: boolean };

export function ModelConversation({ guided, canConnect, ...props }: Props) {
  const [selection, setSelection] = useState("default");
  const [connections, setConnections] = useState<ModelConnection[]>([]);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [busy, setBusy] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [consent, setConsent] = useState(false);
  const [opened, setOpened] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const res = await fetch("/api/model-connections", { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "연결 정보를 불러오지 못했어요.");
    if (!signal?.aborted) { setConnections(data.connections); setRefreshError(""); }
  }, []);
  useEffect(() => {
    if (!canConnect) return;
    const controller = new AbortController();
    let inFlight = false;
    const check = async () => {
      if (inFlight) return;
      inFlight = true;
      try { await refresh(controller.signal); }
      catch (e) { if (!controller.signal.aborted) setRefreshError(e instanceof Error ? e.message : "연결 상태를 확인해 주세요."); }
      finally { inFlight = false; }
    };
    void check();
    const timer = opened || selection !== "default" ? setInterval(() => void check(), 5000) : undefined;
    return () => { controller.abort(); clearInterval(timer); };
  }, [canConnect, opened, selection, refresh]);
  async function connect(provider: "codex" | "claude") {
    if (!consent || busy) return;
    setBusy(true); setError("");
    const key = apiKey; setApiKey("");
    try {
      const res = await fetch("/api/model-connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, ...(provider === "claude" ? { apiKey: key } : {}) }), signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "계정을 연결하지 못했어요.");
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인해 주세요."); }
    finally { setBusy(false); }
  }
  async function disconnect(id: string) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/model-connections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }), signal: AbortSignal.timeout(15000) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "해제하지 못했어요.");
      // Keep selection explicit: revocation must not silently consume default credits.
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "해제 상태를 확인해 주세요."); }
    finally { setBusy(false); }
  }
  const choices = connections.flatMap(c => c.models.map(model => ({ id: c.id + ":" + model, label: `${c.provider === "codex" ? "Codex" : "Claude"} · ${model}` })));
  const available = selection === "default" || choices.some(c => c.id === selection);
  const Room = guided ? GuidedSpeakingRoom : ConversationRoom;
  return <>
    <div className="mt-6 rounded-xl border border-ink-faint bg-card p-4">
      <label htmlFor="conversation-model" className="block text-sm font-medium">함께 연습할 AI</label>
      <select id="conversation-model" value={selection} disabled={busy} onChange={e => setSelection(e.target.value)} className="mt-2 min-h-12 w-full rounded-lg border border-ink-faint bg-paper px-3">
        <option value="default">기본 Gemini · 바로 시작</option>
        {!available && <option value={selection} disabled>선택한 계정 연결을 확인해 주세요</option>}
        {choices.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <p className="mt-2 text-xs text-ink-soft">AI를 바꾸면 별도 대화로 시작해요. 듣기와 녹음은 기존 음성 서비스를 사용해요.</p>
      <details className="mt-2" onToggle={e => setOpened(e.currentTarget.open)}>
        <summary className="min-h-11 cursor-pointer py-3 text-sm text-accent">내 AI 계정 연결 · 선택</summary>
        {!canConnect ? <p className="text-sm">개인 계정은 로그인한 본인만 사용할 수 있어요. <Link href="/login?from=%2Fconversation" className="text-accent underline">튜터 로그인</Link></p> : <>
          <p className="text-sm text-ink-soft">Codex는 ChatGPT 구독으로, Claude는 API 키로 연결해요. 개인 계정의 사용 한도와 API 요금이 적용돼요. Claude 구독 로그인은 지원하지 않아요.</p>
          <label className="mt-3 flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />선택한 AI에 대화가 전달되고, 연결 자격이 서버에 암호화 보관되는 것에 동의해요.</label>
          <button disabled={busy || !consent || connections.some(c => c.provider === "codex")} onClick={() => void connect("codex")} className="mt-3 min-h-11 rounded-full border border-accent px-5 text-accent disabled:opacity-50">Codex 계정 연결</button>
          <label className="mt-4 block text-sm" htmlFor="claude-key">Claude API 키</label>
          <input id="claude-key" type="password" autoComplete="off" spellCheck={false} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-ant-api…" className="mt-1 min-h-11 w-full rounded-lg border border-ink-faint bg-paper px-3" />
          <button disabled={busy || !consent || !apiKey || connections.some(c => c.provider === "claude")} onClick={() => void connect("claude")} className="mt-2 min-h-11 rounded-full border border-accent px-5 text-accent disabled:opacity-50">Claude API 연결</button>
          <ul className="mt-4 space-y-3">{connections.map(c => <li key={c.id} className="rounded-lg bg-accent-wash p-3 text-sm">
            <p>{c.provider === "codex" ? "Codex" : "Claude"} · {labels[c.state]}</p>
            {c.challenge && <div className="mt-2"><p>인증 코드: <strong>{c.challenge.code}</strong></p><a href={c.challenge.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-accent underline">공식 로그인 화면 열기 ↗</a><p>직접 요청한 계정만 연결하고 코드는 공유하지 마세요. 인증 후 이 화면으로 돌아오세요.</p></div>}
            {c.state === "connected" && <p className="mt-2">위 목록에서 모델을 선택하면 회화를 시작할 수 있어요.</p>}
            <button disabled={busy} onClick={() => void disconnect(c.id)} className="mt-2 min-h-11 text-accent underline">{c.state === "authorizing" ? "연결 취소" : "연결 해제"}</button>
          </li>)}</ul>
          <p className="mt-2 text-xs text-ink-soft">연결 해제는 한마디의 저장 자격을 삭제해요. 공급자 측 앱 승인 취소는 해당 계정 설정에서 할 수 있어요.</p>
          {opened && (error || refreshError) && <p role="alert" className="mt-3 text-sm text-amber">{error || refreshError}</p>}
        </>}
      </details>
    </div>
    {available ? <Room {...props} key={selection} modelSelection={selection} storesConversation={selection === "default" && props.storesConversation} cacheKey={selection === "default" ? props.cacheKey : `${props.cacheKey}:model:${selection}`} /> : <p role="alert" className="mt-6">선택한 계정을 사용할 수 없어요. 연결을 확인하거나 위에서 기본 Gemini를 선택해 주세요.</p>}
  </>;
}
