"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * 튜터 관리 (소유자 전용) — 초대 메일 발송, 초대 현황, 등록 튜터 관리.
 * 미들웨어가 /admin/*을 owner 세션에만 열어 준다.
 */

type TutorRow = { name: string; email: string; createdAt: number };
type InviteRow = {
  id: string;
  email: string;
  invitedBy: string;
  createdAt: number;
  expiresAt: number;
  usedAt?: number;
  usedByName?: string;
};

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function TutorAdminPage() {
  const [tutors, setTutors] = useState<TutorRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastInvite, setLastInvite] = useState<{
    url: string;
    mailSent: boolean;
    mailError?: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  // 만료 판정 기준 시각 — 렌더 중 시계를 읽지 않도록 목록을 받은 시점에 고정한다
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/invites");
      if (!res.ok) return;
      const data = (await res.json()) as {
        tutors: TutorRow[];
        invites: InviteRow[];
      };
      setTutors(data.tutors);
      setInvites(data.invites);
      setLoadedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setLastInvite(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        url?: string;
        mailSent?: boolean;
        mailError?: string;
        error?: string;
      };
      if (data.ok && data.url) {
        setLastInvite({
          url: data.url,
          mailSent: Boolean(data.mailSent),
          mailError: data.mailError,
        });
        setEmail("");
        await load();
      } else {
        setError(data.error ?? "초대에 실패했어요.");
      }
    } catch {
      setError("연결에 실패했어요.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(payload: { inviteId?: string; tutorName?: string }) {
    const label = payload.tutorName
      ? `${payload.tutorName} 튜터를 삭제할까요? 해당 PIN으로 로그인할 수 없게 되고, ` +
        `이 튜터가 담당하던 학생은 소유자(나)에게 이관됩니다.`
      : "이 초대를 취소할까요? 링크가 즉시 무효화됩니다.";
    if (!window.confirm(label)) return;
    await fetch("/api/invites", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await load();
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const pending = invites.filter((i) => !i.usedAt && loadedAt < i.expiresAt);
  const past = invites.filter((i) => i.usedAt || loadedAt >= i.expiresAt);

  return (
    <div className="mx-auto max-w-3xl px-5 pt-12 pb-24 sm:pt-16">
      <Link href="/" className="text-sm text-ink-soft hover:text-accent">
        ← 허브로
      </Link>
      <h1 className="mt-4 font-display text-4xl">튜터 관리</h1>
      <p className="mt-3 max-w-[52ch] text-[16px] leading-relaxed text-ink-soft">
        이메일로 초대장을 보내면, 받은 사람이 링크에서 직접 이름과 PIN을
        등록해요. 링크는 7일간 유효하고 한 번만 쓸 수 있어요.
      </p>

      {/* 초대 보내기 */}
      <section className="soft-card mt-8 p-6">
        <h2 className="font-display text-xl">새 튜터 초대</h2>
        <form onSubmit={invite} className="mt-4 flex flex-wrap gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="tutor@example.com"
            required
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-ink-faint bg-paper px-4 py-2 text-[16px] outline-none transition-colors focus:border-accent"
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 shrink-0 rounded-full bg-accent px-6 py-2 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
          >
            {busy ? "보내는 중…" : "초대 메일 보내기"}
          </button>
        </form>
        {error && <p className="mt-3 text-sm text-accent">{error}</p>}

        {lastInvite && (
          <div className="mt-4 rounded-xl border border-good/40 bg-good-wash/50 p-4">
            <p className="text-[15px] font-medium text-good">
              {lastInvite.mailSent
                ? "초대 메일을 보냈어요 ✉️"
                : "초대를 만들었어요 — 링크를 직접 전달해 주세요"}
            </p>
            {!lastInvite.mailSent && (
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                메일 발송이 설정되어 있지 않아요
                {lastInvite.mailError ? ` (${lastInvite.mailError})` : ""}. 아래
                링크를 복사해 카카오톡·메일로 보내면 동일하게 동작해요.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 rounded-lg border border-ink-faint bg-paper px-3 py-2 font-mono text-[12px] break-all">
                {lastInvite.url}
              </code>
              <button
                type="button"
                onClick={() => copyUrl(lastInvite.url)}
                className="min-h-9 shrink-0 rounded-full border border-ink-faint bg-card px-4 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
              >
                {copied ? "복사됨!" : "링크 복사"}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 대기 중인 초대 */}
      <section className="mt-10">
        <h2 className="mb-4 font-display text-2xl">대기 중인 초대</h2>
        {loading ? (
          <p className="text-ink-soft">불러오는 중…</p>
        ) : pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ink-faint p-8 text-center text-ink-soft">
            대기 중인 초대가 없어요.
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((i) => (
              <li
                key={i.id}
                className="soft-card flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.email}</p>
                  <p className="font-mono text-[12px] text-ink-soft">
                    {i.invitedBy} 초대 · {formatDate(i.expiresAt)}까지
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove({ inviteId: i.id })}
                  className="min-h-9 shrink-0 rounded-full border border-ink-faint px-4 py-1.5 text-sm text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
                >
                  초대 취소
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 등록된 튜터 */}
      <section className="mt-10">
        <h2 className="mb-4 font-display text-2xl">등록된 튜터</h2>
        <p className="mb-4 text-[15px] text-ink-soft">
          소유자(환경변수 <code className="font-mono text-[13px]">TUTOR_PINS</code>
          에 등록된 계정)는 여기 표시되지 않아요.
        </p>
        {loading ? (
          <p className="text-ink-soft">불러오는 중…</p>
        ) : tutors.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-ink-faint p-8 text-center text-ink-soft">
            아직 등록한 튜터가 없어요.
          </p>
        ) : (
          <ul className="space-y-2">
            {tutors.map((t) => (
              <li
                key={t.name}
                className="soft-card flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="truncate font-mono text-[12px] text-ink-soft">
                    {t.email} · {formatDate(t.createdAt)} 등록
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove({ tutorName: t.name })}
                  className="min-h-9 shrink-0 rounded-full border border-ink-faint px-4 py-1.5 text-sm text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
                >
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 지난 초대 */}
      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-2xl">지난 초대</h2>
          <ul className="space-y-1.5">
            {past.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink-faint px-4 py-3 text-[15px] text-ink-soft"
              >
                <span className="truncate">{i.email}</span>
                <span className="font-mono text-[12px]">
                  {i.usedAt
                    ? `${i.usedByName ?? ""} 등록 완료`
                    : "기간 만료"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
