"use client";

import { useState } from "react";
import type { Pack } from "@/data/types";
import { PackBlocks } from "@/components/blocks";

/**
 * 팩 본문 + Teaching Mode 토글.
 * 기본은 OFF(학생 모드, 표준 크기·튜터 팁 숨김) — 학생에게 링크를 공유했을 때
 * 보이는 기본 화면과 동일하다. 튜터가 수업 중 화면공유하며 직접 ON으로 켠다.
 */
export function PackView({ pack }: { pack: Pack }) {
  const [teaching, setTeaching] = useState(false);

  return (
    <div>
      <div className="mb-8 flex items-center justify-between gap-3 rounded-2xl border border-ink-faint bg-card px-5 py-3">
        <p className="text-sm text-ink-soft">
          {teaching
            ? "튜터 팁 표시 · 글자 확대 — 화면공유용"
            : "학생 모드 — 링크 공유 시 보이는 기본 화면"}
        </p>
        <button
          type="button"
          onClick={() => setTeaching((v) => !v)}
          className={`shrink-0 rounded-full border px-4 py-1.5 font-mono text-[11px] tracking-[0.1em] transition-colors ${
            teaching
              ? "border-amber-line bg-amber-wash text-amber"
              : "border-ink-faint text-ink-soft hover:text-ink"
          }`}
        >
          수업 모드 {teaching ? "ON" : "OFF"}
        </button>
      </div>
      <PackBlocks
        blocks={pack.blocks}
        teaching={teaching}
        storageKey={`pack:${pack.id}`}
      />
    </div>
  );
}
