import type { ReactNode } from "react";

/**
 * 학생 포털(/s/**) 공용 표시 요소.
 *
 * 포털은 두 화면으로 나뉜다.
 *   /s/[slug]            — 수업 목록 (홈)
 *   /s/[slug]/[lessonId] — 수업 상세
 * 두 화면이 같은 위계·같은 칩을 쓰도록 여기 모아 둔다.
 *
 * hook을 쓰지 않는 순수 표시용이라 서버 컴포넌트에서 그대로 렌더된다.
 * 학생 화면이므로 영어가 1순위, 한국어는 병기.
 */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * "2026-07-08" → "Jul 8, 2026"
 * toLocaleDateString은 서버·브라우저의 로케일/시간대에 따라 결과가 달라지므로
 * 직접 포맷해 어디서 렌더해도 같은 문자열이 나오게 한다.
 */
export function formatLessonDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return iso;
  const [, year, month, day] = match;
  const label = MONTHS[Number(month) - 1];
  return label ? `${label} ${Number(day)}, ${year}` : iso;
}

/** 섹션 제목 — 영어 우선, 한국어 병기 */
export function Section({
  en,
  ko,
  children,
}: {
  en: string;
  ko: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="mb-4 flex flex-wrap items-baseline gap-2.5 font-display text-2xl">
        {en}
        <span
          lang="ko"
          className="font-sans text-[14px] font-normal text-ink-soft"
        >
          {ko}
        </span>
      </h2>
      {children}
    </section>
  );
}

/** 헤더의 요약 칩 (레벨/수업 수/표현 수/퍼즐 수) */
export function StatChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-accent-wash px-3 py-1 font-mono text-[12px] text-accent">
      {children}
    </span>
  );
}

/** 카드 안의 작은 메타 칩 — 수업 카드 요약, 집중 포인트 등 */
export function Chip({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "accent" | "good";
}) {
  const style =
    tone === "accent"
      ? "border-accent/40 bg-accent-wash/60 text-accent"
      : tone === "good"
        ? "border-good/40 bg-good-wash/60 text-good"
        : "border-ink-faint text-ink-soft";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[11px] ${style}`}
    >
      {children}
    </span>
  );
}
