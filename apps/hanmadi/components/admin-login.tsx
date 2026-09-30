"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminLogin() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !pin.trim()) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok || data.role !== "owner")
        throw new Error(data.error || "관리자 PIN을 확인해 주세요.");
      router.replace("/study/admin");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해 주세요.");
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <form onSubmit={login} className="soft-card w-full max-w-sm p-8">
        <p className="text-sm text-ink-soft">학습 콘텐츠 운영</p>
        <h1 className="mt-2 font-display text-2xl">Hanmadi Admin</h1>
        <p className="mt-3 text-sm text-ink-soft">
          관리자 PIN으로 로그인해 주세요.
        </p>
        <label className="mt-6 block text-sm" htmlFor="admin-pin">
          관리자 PIN
        </label>
        <input
          id="admin-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          disabled={busy}
          required
          aria-invalid={!!error}
          aria-describedby={error ? "admin-login-error" : undefined}
          className="mt-2 min-h-11 w-full rounded-xl border border-ink-faint bg-paper px-4 py-2"
        />
        {error && (
          <p
            id="admin-login-error"
            role="alert"
            className="mt-3 text-sm text-accent"
          >
            {error}
          </p>
        )}
        <button
          disabled={busy || !pin.trim()}
          className="mt-5 min-h-11 w-full rounded-full bg-accent px-5 py-2 text-accent-ink disabled:opacity-60"
        >
          {busy ? "확인 중…" : "관리자 로그인"}
        </button>
      </form>
    </main>
  );
}
