"use client";

/**
 * 학습 팩 목록 — 레벨/카테고리 필터 + 팩 카드 그리드.
 * 튜터에게는 수업 준비용 진열대, 학생에게는(포털 추천 링크로 진입 시) 자습 입구.
 * 검색 없이 스캔 가능한 규모 유지 — 팩 데이터는 빌드 타임 콘텐츠 파일에서 로드.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { packs } from "@/data/packs";
import type { PackCategory, PackLevel } from "@/data/types";
import { CATEGORY_LABEL, LEVEL_LABEL } from "@/components/pack-badges";
import { PackCard } from "@/components/pack-card";

const LEVELS: PackLevel[] = ["absolute-beginner", "beginner", "upper-beginner"];
const CATEGORIES: PackCategory[] = [
  "hangul",
  "essential-phrases",
  "pronunciation",
  "k-culture",
];

export default function LibraryPage() {
  const [level, setLevel] = useState<PackLevel | "all">("all");
  const [category, setCategory] = useState<PackCategory | "all">("all");
  const [showTutorNotes, setShowTutorNotes] = useState(false);

  const filtered = useMemo(
    () =>
      packs
        .filter((p) => level === "all" || p.level === level)
        .filter((p) => category === "all" || p.category === category)
        .sort((a, b) => (a.order ?? 99) - (b.order ?? 99)),
    [level, category],
  );

  return (
    <div className="mx-auto max-w-5xl px-5 pt-16 pb-24 sm:pt-24">
      <p className="font-mono text-[12px] tracking-[0.2em] text-ink-soft">
        CONTENT LIBRARY
      </p>
      <h1 className="mt-3 font-display text-4xl sm:text-5xl">
        학습 팩 <span className="text-ink-soft">Learning Packs</span>
      </h1>
      <p className="mt-4 max-w-[56ch] text-lg text-ink-soft">
        수업과 자습에 쓰는 레벨별 학습 팩이에요. 학생에게 팩 링크를 공유하거나,
        수업 중에는{" "}
        <Link href="/live" className="text-accent underline decoration-ink-faint underline-offset-2 hover:decoration-accent">
          라이브 노트
        </Link>
        와 나란히 열어 두세요.
      </p>

      {/* 튜터 전용 안내 배너 — 토글 가능, 한국어 */}
      <div className="mt-8 rounded-2xl border border-amber-line bg-amber-wash p-5">
        <button
          type="button"
          onClick={() => setShowTutorNotes((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <span className="font-mono text-[11px] tracking-[0.15em] text-amber">
            튜터 노트 — 수업 활용법 {showTutorNotes ? "숨기기 ▲" : "보기 ▼"}
          </span>
        </button>
        {showTutorNotes && (
          <p className="mt-3 text-[15px] leading-relaxed text-ink">
            체험수업에는 <b>완전 초보</b> 트랙의 1번 팩을, 정규수업에는 학생
            레벨에 맞는 팩을 화면공유로 열고 <b>라이브 노트</b>를 나란히 띄워
            받아쓰기·교정을 기록한다. 카드마다 튜터 활용법이 있으면 아래에 함께
            표시된다.
          </p>
        )}
      </div>

      {/* 필터 */}
      <div className="mt-8 space-y-3">
        <FilterRow<PackLevel | "all">
          label="레벨"
          active={level}
          onChange={setLevel}
          options={[
            { value: "all", label: "전체" },
            ...LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l].ko })),
          ]}
        />
        <FilterRow<PackCategory | "all">
          label="분류"
          active={category}
          onChange={setCategory}
          options={[
            { value: "all", label: "전체" },
            ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] })),
          ]}
        />
      </div>

      {/* 팩 그리드 */}
      <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((pack) => (
          <li key={pack.id}>
            <PackCard pack={pack} showTutorGuide={showTutorNotes} />
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="col-span-full rounded-2xl border border-dashed border-ink-faint p-10 text-center text-ink-soft">
            이 조건에 맞는 팩이 아직 없어요.
          </li>
        )}
      </ul>
    </div>
  );
}

function FilterRow<T extends string>({
  label,
  active,
  onChange,
  options,
}: {
  label: string;
  active: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 font-mono text-[11px] tracking-[0.15em] text-ink-soft uppercase">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`min-h-9 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active === opt.value
                ? "bg-ink text-paper"
                : "border border-ink-faint text-ink-soft hover:border-accent/50 hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
