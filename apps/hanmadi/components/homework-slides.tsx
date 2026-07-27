"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { HomeworkItem } from "@/data/types";

/**
 * 숙제 슬라이드 — 숙제 항목을 한 번에 하나씩 카드로 넘겨 보는 형태.
 * 퍼즐 덱과 같은 결로, 한 번에 하나에 집중하고 좌우로 넘긴다.
 *
 * 체크 상태는 기존 Checklist와 같은 localStorage 키를 써서 어느 화면에서 체크해도
 * 이어진다. 학생 화면 → 영어 우선 + 한국어 병기, 터치 44px+.
 */
export function HomeworkSlides({
  items,
  storageKey,
}: {
  items: HomeworkItem[];
  storageKey: string;
}) {
  const key = `hanmadi-check:${storageKey}`;
  const [done, setDone] = useState<boolean[]>(() => items.map(() => false));
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  // 마우스 드래그 스크롤 상태 (리렌더 없이 유지)
  const drag = useRef({ down: false, startX: 0, startScroll: 0, moved: false });

  // 체크 상태 복원 — localStorage는 서버에 없어 마운트 후 1회만 안전하게 읽는다
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const arr = JSON.parse(saved) as boolean[];
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDone(items.map((_, i) => Boolean(arr[i])));
      }
    } catch {
      /* 무시 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function toggle(i: number) {
    setDone((prev) => {
      const next = prev.map((v, j) => (j === i ? !v : v));
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* 무시 */
      }
      return next;
    });
  }

  function go(to: number) {
    const track = trackRef.current;
    if (!track) return;
    const clamped = Math.max(0, Math.min(items.length - 1, to));
    const card = track.children[clamped] as HTMLElement | undefined;
    card?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    setIndex(clamped);
  }

  // 스와이프/스크롤로 넘어가면 점 표시를 맞춘다
  function onScroll() {
    const track = trackRef.current;
    if (!track) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    if (i !== index) setIndex(Math.max(0, Math.min(items.length - 1, i)));
  }

  /* ── 마우스 클릭-드래그로 좌우 이동 (터치·트랙패드는 네이티브 스크롤로 이미 동작) ── */
  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType !== "mouse") return;
    const track = trackRef.current;
    if (!track) return;
    drag.current = {
      down: true,
      startX: e.clientX,
      startScroll: track.scrollLeft,
      moved: false,
    };
    // 드래그 중에는 스냅을 꺼 매끄럽게, 놓으면 다시 스냅
    track.style.scrollSnapType = "none";
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    const track = trackRef.current;
    if (!d.down || !track) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    track.scrollLeft = d.startScroll - dx;
  }

  function endDrag() {
    const track = trackRef.current;
    if (!track || !drag.current.down) return;
    drag.current.down = false;
    // 스냅 복원 → 가장 가까운 카드로 정렬
    track.style.scrollSnapType = "";
    const i = Math.round(track.scrollLeft / track.clientWidth);
    go(i);
  }

  // 드래그였으면 카드 안 버튼/체크박스 클릭을 삼킨다 (드래그 끝의 오작동 방지)
  function onClickCapture(e: React.MouseEvent) {
    if (drag.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = false;
    }
  }

  const doneCount = done.filter(Boolean).length;

  return (
    <div>
      {/* 진행 헤더 */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="font-mono text-[12px] text-ink-soft">
          {index + 1} / {items.length}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 font-mono text-[12px] ${
            doneCount === items.length
              ? "bg-good-wash text-good"
              : "bg-accent-wash text-accent"
          }`}
        >
          {doneCount === items.length ? "✓ all done" : `${doneCount}/${items.length} done`}
        </span>
      </div>

      {/* 카드 트랙 — 가로 스냅 스크롤 + 마우스 드래그 */}
      <div
        ref={trackRef}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        className="flex cursor-grab snap-x snap-mandatory gap-3 overflow-x-auto pb-1 select-none active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <div
            key={i}
            className="w-full shrink-0 snap-start"
            aria-hidden={i !== index}
          >
            <HomeworkCard item={item} done={done[i] ?? false} onToggle={() => toggle(i)} />
          </div>
        ))}
      </div>

      {/* 이전/다음 + 점 */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          aria-label="Previous homework"
          className="flex size-11 items-center justify-center rounded-full border border-ink-faint bg-card text-ink-soft transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-40"
        >
          ←
        </button>

        <div className="flex items-center gap-1.5">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`Go to homework ${i + 1}`}
              className={`h-2 rounded-full transition-all ${
                i === index
                  ? "w-5 bg-accent"
                  : done[i]
                    ? "w-2 bg-good"
                    : "w-2 bg-ink-faint hover:bg-accent/40"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index === items.length - 1}
          aria-label="Next homework"
          className="flex size-11 items-center justify-center rounded-full border border-ink-faint bg-card text-ink-soft transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-40"
        >
          →
        </button>
      </div>
    </div>
  );
}

/** 숙제 한 장 — 무엇을(체크) · 얼마나(target) · 어떻게(how) · 연습 문장 · 팩 */
function HomeworkCard({
  item,
  done,
  onToggle,
}: {
  item: HomeworkItem;
  done: boolean;
  onToggle: () => void;
}) {
  const phrases = item.phrases ?? [];

  return (
    <div
      className={`soft-card flex max-h-[68vh] flex-col overflow-y-auto p-5 transition-opacity sm:p-6 ${
        done ? "opacity-60" : ""
      }`}
    >
      {/* 무엇을 — 체크박스 + 제목 */}
      <label className="flex cursor-pointer items-start gap-3.5">
        <input
          type="checkbox"
          checked={done}
          onChange={onToggle}
          className="mt-1 size-6 shrink-0 accent-[var(--accent)]"
        />
        <span className="min-w-0">
          <span
            className={`block text-[18px] font-semibold leading-snug ${
              done ? "text-ink-soft line-through" : ""
            }`}
          >
            {item.en}
          </span>
          {item.ko && (
            <span lang="ko" className="mt-0.5 block text-[15px] text-ink-soft">
              {item.ko}
              {item.rr && (
                <span className="ml-1.5 font-mono text-[12px]">{item.rr}</span>
              )}
            </span>
          )}
        </span>
      </label>

      {/* 얼마나 */}
      {item.target && (
        <p className="mt-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-wash px-3 py-1.5 font-mono text-[13px] text-accent">
            <span aria-hidden="true">⏱</span>
            {item.target}
          </span>
        </p>
      )}

      {/* 어떻게 */}
      {item.how && (
        <div className="mt-4">
          <p className="font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">
            How to do it{" "}
            <span lang="ko" className="normal-case">
              하는 방법
            </span>
          </p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">
            {item.how}
          </p>
        </div>
      )}

      {/* 연습 문장 — 3단 위계 */}
      {phrases.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">
            Practice{" "}
            <span lang="ko" className="normal-case">
              연습 문장
            </span>
          </p>
          <ul className="mt-2 space-y-2">
            {phrases.map((phrase, pi) => (
              <li
                key={pi}
                className="rounded-xl border border-ink-faint bg-paper px-4 py-3"
              >
                <p lang="ko" className="font-display text-2xl leading-snug">
                  {phrase.ko}
                </p>
                {phrase.rr && (
                  <p className="mt-1 font-mono text-[13px] text-ink-soft">
                    {phrase.rr}
                  </p>
                )}
                {phrase.en && <p className="mt-0.5 text-[15px]">{phrase.en}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 무엇으로 — 팩 링크 */}
      {item.packId && (
        <Link
          href={`/library/${item.packId}`}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-accent underline-offset-4 hover:underline"
        >
          Open the pack
          <span lang="ko" className="font-normal text-ink-soft">
            팩 열기
          </span>
          →
        </Link>
      )}

      {/* 체크 버튼 (라벨과 별개로 카드 하단에 큰 액션) */}
      <button
        type="button"
        onClick={onToggle}
        className={`mt-5 min-h-12 w-full rounded-full text-[15px] font-medium transition-colors ${
          done
            ? "bg-good-wash text-good hover:bg-good-wash/70"
            : "bg-accent text-white hover:bg-accent-strong"
        }`}
      >
        {done ? "✓ Done — tap to undo" : "Mark as done · 완료 표시"}
      </button>
    </div>
  );
}
