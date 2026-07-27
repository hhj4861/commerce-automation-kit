"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/header";

/**
 * 초대 튜터 PIN 등록 — 초대 메일의 링크(토큰)로만 접근할 수 있다.
 * 링크를 받은 사람만 열 수 있으므로 링크 자체가 메일 인증 역할을 한다.
 */

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [invalid, setInvalid] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 토큰 유효성 확인 — 이메일을 보여줘 초대 대상임을 확인시킨다
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(
          `/api/register?token=${encodeURIComponent(token)}`,
        );
        const data = (await res.json()) as {
          ok: boolean;
          email?: string;
          error?: string;
        };
        if (!alive) return;
        if (data.ok && data.email) setEmail(data.email);
        else setInvalid(data.error ?? "초대 링크가 올바르지 않아요.");
      } catch {
        if (alive) setInvalid("연결에 실패했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (pin !== pin2) {
      setError("두 PIN이 서로 달라요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, pin }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      setError(data.error ?? "등록에 실패했어요.");
    } catch {
      setError("연결에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="soft-card w-full max-w-sm p-8">
        <div className="flex justify-center">
          <Logo size={36} />
        </div>
        <p className="mt-4 text-center font-display text-xl">튜터 등록</p>

        {checking && (
          <p className="mt-6 text-center text-sm text-ink-soft">
            초대 링크를 확인하는 중…
          </p>
        )}

        {invalid && (
          <div className="mt-6 rounded-xl border border-accent/40 bg-accent-wash/50 p-4 text-center">
            <p className="text-[15px] text-accent">{invalid}</p>
            <p className="mt-2 text-sm text-ink-soft">
              초대해 준 분에게 새 초대 링크를 요청해 주세요.
            </p>
          </div>
        )}

        {email && (
          <form onSubmit={submit} className="mt-6">
            <p className="rounded-xl border border-ink-faint bg-paper px-4 py-3 text-center">
              <span className="block font-mono text-[11px] tracking-[0.15em] text-ink-soft">
                초대받은 이메일
              </span>
              <span className="mt-1 block text-[15px] font-medium break-all">
                {email}
              </span>
            </p>

            <Field label="이름 (학생에게 보이는 이름)">
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="예: 지현"
                maxLength={20}
                required
                autoFocus
                className="min-h-11 w-full rounded-xl border border-ink-faint bg-paper px-4 py-2 text-[16px] outline-none transition-colors focus:border-accent"
              />
            </Field>

            <Field label="PIN (숫자 6~12자리)">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError(null);
                }}
                placeholder="••••••"
                required
                className="min-h-11 w-full rounded-xl border border-ink-faint bg-paper px-4 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none transition-colors focus:border-accent"
              />
            </Field>

            <Field label="PIN 확인">
              <input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                value={pin2}
                onChange={(e) => {
                  setPin2(e.target.value);
                  setError(null);
                }}
                placeholder="••••••"
                required
                className="min-h-11 w-full rounded-xl border border-ink-faint bg-paper px-4 py-2 text-center font-mono text-lg tracking-[0.3em] outline-none transition-colors focus:border-accent"
              />
            </Field>

            {error && <p className="mt-3 text-sm text-accent">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-5 min-h-11 w-full rounded-full bg-accent px-5 py-2 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
            >
              {busy ? "등록 중…" : "등록하고 시작하기"}
            </button>
            <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-soft">
              등록한 PIN으로 로그인해요. 잊어버리면 재초대가 필요하니
              <br />
              기억하기 쉬운 번호로 정해 주세요.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-4 block">
      <span className="mb-1.5 block font-mono text-[11px] tracking-[0.1em] text-ink-soft">
        {label}
      </span>
      {children}
    </label>
  );
}
