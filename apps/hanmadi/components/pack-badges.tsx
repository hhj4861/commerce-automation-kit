import type { PackCategory, PackLevel } from "@/data/types";

/**
 * 팩 레벨/카테고리 표시 라벨 및 작은 배지들.
 * /library, /library/[packId], /s/[slug] (Recommended)에서 공유해 쓴다.
 * 서버 컴포넌트에서도 그대로 쓸 수 있도록 hook 없이 순수 표시용으로만 구성.
 */

export const LEVEL_LABEL: Record<PackLevel, { en: string; ko: string }> = {
  "absolute-beginner": { en: "Absolute Beginner", ko: "완전 초보" },
  beginner: { en: "Beginner", ko: "초보" },
  "upper-beginner": { en: "Upper Beginner", ko: "초중급" },
};

export const CATEGORY_LABEL: Record<PackCategory, string> = {
  hangul: "한글",
  "essential-phrases": "필수 표현",
  pronunciation: "발음",
  "k-culture": "K-컬처",
};

export function LevelBadge({ level }: { level: PackLevel }) {
  const l = LEVEL_LABEL[level];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-wash px-2.5 py-1 font-mono text-[11px] tracking-[0.03em] text-accent">
      {l.ko}
      <span className="text-accent/70">· {l.en}</span>
    </span>
  );
}

export function CategoryChip({ category }: { category: PackCategory }) {
  return (
    <span className="inline-flex items-center rounded-full border border-ink-faint px-2.5 py-1 font-mono text-[11px] text-ink-soft">
      {CATEGORY_LABEL[category]}
    </span>
  );
}

export function MinutesChip({ minutes }: { minutes: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-ink-faint px-2.5 py-1 font-mono text-[11px] text-ink-soft">
      ⏱ {minutes}분
    </span>
  );
}

/** 추천 학습 순서 번호 배지 (완전 초보 트랙 1→2→3…) */
export function StepBadge({ order }: { order: number }) {
  return (
    <span
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[11px] font-medium text-paper"
      title={`추천 순서: ${order}`}
    >
      {order}
    </span>
  );
}
