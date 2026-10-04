"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type GoogleAPI = { accounts: { id: {
  initialize: (config: { client_id: string; nonce: string; callback: (response: { credential: string }) => void; auto_select: boolean }) => void;
  renderButton: (node: HTMLElement, options: { theme: string; size: string; text: string; shape: string; width: number; locale: string }) => void;
} } };
type Ready = { clientId: string; nonce: string };
const endpoint = "/api/study/account/google";
export function GoogleLogin({ onDone, disabled, onBusyChange }: {
  onDone: () => void; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const [ready, setReady] = useState<Ready | null>(null), [scriptReady, setScriptReady] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const target = useRef<HTMLDivElement>(null), alive = useRef(true), locked = useRef(false);
  const handlers = useRef({ onDone, disabled, onBusyChange });
  useEffect(() => { handlers.current = { onDone, disabled, onBusyChange }; }, [onDone, disabled, onBusyChange]);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    void (async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error();
        const config = await response.json();
        if (!config.available) return;
        const challenge = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "challenge" }), signal: controller.signal });
        const data = await challenge.json();
        if (!challenge.ok) throw new Error();
        if (!cancelled) setReady({ clientId: config.clientId, nonce: data.nonce });
      } catch {
        if (!cancelled) setError("Google 로그인을 불러오지 못했어요. 아이디로 로그인하거나 화면을 다시 열어 주세요.");
      } finally { clearTimeout(timer); if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; alive.current = false; controller.abort(); clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (!ready || scriptReady) return;
    const timer = setTimeout(() => setError("Google 연결이 지연되고 있어요. 아이디로 로그인하거나 화면을 다시 열어 주세요."), 12000);
    return () => clearTimeout(timer);
  }, [ready, scriptReady]);
  useEffect(() => {
    const google = (window as Window & { google?: GoogleAPI }).google;
    if (!ready || !scriptReady || !target.current || !google) return;
    const node = target.current;
    google.accounts.id.initialize({ client_id: ready.clientId, nonce: ready.nonce, auto_select: false,
      callback: async ({ credential }) => {
        if (!alive.current || locked.current || handlers.current.disabled) return;
        locked.current = true; handlers.current.onBusyChange(true); setError("");
        try {
          const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "credential", credential }), signal: AbortSignal.timeout(15000) });
          const data = await response.json();
          if (!response.ok) {
            if (alive.current) { setReady(null); setError(data.error || "Google 로그인을 완료하지 못했어요."); }
            return;
          }
          if (alive.current) handlers.current.onDone();
        } catch {
          if (alive.current) { setReady(null); setError("Google 연결을 확인하지 못했어요. 다시 불러오거나 아이디로 로그인해 주세요."); }
        } finally {
          locked.current = false;
          if (alive.current) handlers.current.onBusyChange(false);
        }
      },
    });
    google.accounts.id.renderButton(node, { theme: "outline", size: "large", text: "continue_with", shape: "pill", width: Math.min(320, node.clientWidth || 280), locale: "ko" });
    return () => { node.replaceChildren(); };
  }, [ready, scriptReady]);
  if (loading) return <p className="hm-muted" role="status">로그인 방법을 확인하고 있어요…</p>;
  if (!ready && !error) return null;
  return <section className="hm-google-login" aria-label="Google 로그인">
    {ready && <Script src="https://accounts.google.com/gsi/client?hl=ko" strategy="afterInteractive"
      onReady={() => setScriptReady(true)} onError={() => setError("Google에 연결할 수 없어요. 아이디로 로그인하거나 화면을 다시 열어 주세요.")} />}
    {ready && <div ref={target} className="hm-google-button" aria-disabled={disabled} inert={disabled} />}
    {error && <p role="alert">{error} <button type="button" disabled={disabled} onClick={() => window.location.reload()}>다시 불러오기</button></p>}
    {ready && !scriptReady && !error && <p role="status">Google 로그인 버튼을 준비하고 있어요…</p>}
    <div className="hm-login-divider"><span>또는 아이디로 계속하기</span></div>
  </section>;
}
