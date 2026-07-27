"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/header";

/**
 * 튜터 로그인 — PIN은 /api/auth에서 서버 검증되고,
 * 성공하면 HttpOnly 쿠키가 발급돼 미들웨어를 통과한다.
 */

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 로그인 후 복귀 경로 — 내부 경로만 허용
  const rawFrom = searchParams.get("from") ?? "/";
  const from = rawFrom.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : "/";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        router.replace(from);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error ?? "PIN이 맞지 않아요.");
      setPin("");
    } catch {
      setError("연결에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <form onSubmit={submit} className="soft-card w-full max-w-xs p-8 text-center">
        <div className="flex justify-center">
          <Logo size={36} />
        </div>
        <p className="mt-4 font-display text-xl">튜터 전용 페이지</p>
        <p className="mt-1.5 text-sm text-ink-soft">
          PIN을 입력해 주세요. 학생용 링크는
          <br />
          포털(/s/…)과 학습 팩(/library)입니다.
        </p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => {
            setPin(e.target.value);
            setError(null);
          }}
          placeholder="PIN"
          autoFocus
          className={`mt-5 min-h-11 w-full rounded-xl border bg-paper px-4 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none transition-colors focus:border-accent ${
            error ? "border-accent" : "border-ink-faint"
          }`}
        />
        {error && <p className="mt-2 text-sm text-accent">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 min-h-11 w-full rounded-full bg-accent px-5 py-2 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
        >
          {busy ? "확인 중…" : "열기"}
        </button>
      </form>
    </div>
  );
}
