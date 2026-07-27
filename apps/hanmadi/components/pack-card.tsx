import Link from "next/link";
import type { Pack } from "@/data/types";
import { LevelBadge, MinutesChip, StepBadge } from "@/components/pack-badges";

/**
 * 팩 카드 — /library 그리드와 /s/[slug]의 Recommended for You에서 공유.
 * compact=true면 학생 포털용 축소판(요약·블록 수 생략).
 */
export function PackCard({
  pack,
  compact = false,
  showTutorGuide = false,
}: {
  pack: Pack;
  compact?: boolean;
  showTutorGuide?: boolean;
}) {
  return (
    <Link
      href={`/library/${pack.id}`}
      className="soft-card group flex h-full flex-col p-6 transition-colors hover:border-accent/60"
    >
      <div className="flex flex-wrap items-center gap-2">
        {pack.order !== undefined && <StepBadge order={pack.order} />}
        <LevelBadge level={pack.level} />
      </div>
      {compact ? (
        <>
          {/* 학생 포털 축소판 — 학생이 읽으므로 영어 우선 */}
          <p className="mt-4 font-display text-2xl group-hover:text-accent">
            {pack.title.en}
          </p>
          <p lang="ko" className="font-mono text-[13px] text-ink-soft">
            {pack.title.ko}
          </p>
        </>
      ) : (
        <>
          {/* 라이브러리 카드 — 튜터가 읽으므로 한국어 우선 */}
          <p lang="ko" className="mt-4 font-display text-2xl group-hover:text-accent">
            {pack.title.ko}
          </p>
          <p className="font-mono text-[13px] text-ink-soft">{pack.title.en}</p>
        </>
      )}
      {!compact && (
        <p lang="ko" className="mt-3 flex-1 text-[15px] leading-relaxed text-ink-soft">
          {pack.summary}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <MinutesChip minutes={pack.minutes} />
        {!compact && (
          <span className="inline-flex items-center rounded-full border border-ink-faint px-2.5 py-1 font-mono text-[11px] text-ink-soft">
            블록 {pack.blocks.length}개
          </span>
        )}
      </div>
      {showTutorGuide && pack.tutorGuide && (
        <p className="mt-4 rounded-xl border border-amber-line bg-amber-wash p-3 text-[13px] leading-relaxed text-amber">
          튜터 활용법: {pack.tutorGuide}
        </p>
      )}
    </Link>
  );
}
