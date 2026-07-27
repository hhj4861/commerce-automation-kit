"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * 레벨 진단 제안을 학생의 확정 레벨로 적용하는 버튼 (튜터 전용).
 *
 * POST /api/students { slug, applyPlacement: true } 를 호출해 서버에서 level을
 * 갱신하고 placement.applied를 true로 만든 뒤, router.refresh()로 서버 컴포넌트를
 * 다시 그린다 (커리큘럼 트랙도 새 레벨로 재계산됨).
 */
export function ApplyPlacementButton({
  slug,
  targetLevelLabel,
}: {
  slug: string;
  targetLevelLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, applyPlacement: true }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!res.ok || !data?.ok) {
        setError(
          data?.error ??
            (res.status === 403
              ? "로그인이 만료됐어요. 다시 로그인해 주세요."
              : "레벨을 적용하지 못했어요. 잠시 후 다시 시도해 주세요."),
        );
        return;
      }

      // 서버 컴포넌트 재실행 → 헤더 레벨·진단 상태·커리큘럼 트랙이 함께 갱신된다
      router.refresh();
    } catch {
      setError("연결에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={apply}
        disabled={busy}
        className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
      >
        {busy ? "적용 중…" : `${targetLevelLabel} 레벨로 적용`}
      </button>
      {error && (
        <p role="alert" className="text-[13px] text-amber">
          {error}
        </p>
      )}
    </div>
  );
}
