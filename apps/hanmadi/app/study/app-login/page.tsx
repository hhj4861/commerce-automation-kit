"use client";
import { useEffect, useState } from "react";
import { GoogleLogin } from "@/components/google-login";
import "./login.css";
export default function AppLogin() {
  const [name, setName] = useState(""), [password, setPassword] = useState(""), [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [callback, setCallback] = useState("");
  async function done() {
    const q = new URLSearchParams(window.location.search);
    if (!q.has("challenge")) { window.location.replace("/app/"); return; }
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/study/client-auth", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "authorize", challenge: q.get("challenge"), state: q.get("state") }), signal: AbortSignal.timeout(15000) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error);
      setCallback(data.callback);
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인해 주세요."); }
    finally { setBusy(false); }
  }
  useEffect(() => { let active = true; void fetch("/api/study/account", { cache: "no-store" }).then(async r => {
    const a = r.ok ? await r.json() : null; if (active && a && !a.owner) void done();
  }).catch(() => {}); return () => { active = false; }; }, []);
  return <main className="client-login"><a className="client-brand" href="/study">hanmadi<span>한마디씩, 나답게.</span></a>
    <section><p className="client-eyebrow">가볍게 시작해요</p><h1>{callback ? "로그인했어요" : "나의 언어를 만나는 시간"}</h1>
      <p>웹과 앱에서 같은 계정으로 학습 기록을 이어가요.</p>
      {callback ? <a className="client-primary" href={callback}>한마디 앱으로 돌아가기</a> : <>
        <GoogleLogin onDone={() => void done()} disabled={busy} onBusyChange={setBusy} />
        <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try {
          const r = await fetch("/api/study/account", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: signup ? "signup" : "login", name, password }), signal: AbortSignal.timeout(15000) });
          const data = await r.json(); if (!r.ok) throw new Error(data.error); await done();
        } catch (e) { setError(e instanceof Error ? e.message : "로그인하지 못했어요."); } finally { setBusy(false); } }}>
          <label>아이디<input autoComplete="username" required minLength={3} maxLength={32} value={name} onChange={e => setName(e.target.value)} /></label>
          <label>비밀번호<input type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>
          <button className="client-primary" disabled={busy}>{busy ? "연결 중…" : signup ? "가입하고 시작하기" : "로그인"}</button>
        </form><button className="client-switch" disabled={busy} onClick={() => setSignup(!signup)}>{signup ? "이미 계정이 있어요" : "처음이라면 계정 만들기"}</button>
      </>}{error && <p role="alert">{error}</p>}<a href="/privacy">개인정보 처리방침</a>
    </section></main>;
}
