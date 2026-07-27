"use client";

import { useState } from "react";

/**
 * 클립보드 복사 버튼 — 외부 API 없이 전부 클라이언트 사이드.
 * path를 주면 현재 origin을 붙여 절대 URL을 복사한다 (학생에게 링크 전달용).
 */
export function CopyButton({
  text,
  path,
  label,
  copiedLabel = "Copied!",
  className = "",
}: {
  text?: string;
  path?: string;
  label: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const value = path ? `${window.location.origin}${path}` : (text ?? "");
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // 클립보드 API를 못 쓰는 환경(http 등) 폴백
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={
        className ||
        "rounded-full border border-ink-faint bg-card px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
      }
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
