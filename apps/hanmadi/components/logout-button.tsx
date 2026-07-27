"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** 로그아웃 — 세션 쿠키를 지우고 로그인 화면으로 보낸다 */
export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch("/api/auth", { method: "DELETE" });
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="rounded-full border border-ink-faint px-4 py-1.5 text-sm text-ink-soft transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-60"
    >
      로그아웃
    </button>
  );
}
