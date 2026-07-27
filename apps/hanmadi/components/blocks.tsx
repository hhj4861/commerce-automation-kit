"use client";

/**
 * 팩 블록 렌더러 — data/types.ts의 PackBlock discriminated union을
 * type별 컴포넌트로 매핑해 순서대로 렌더링한다.
 *
 * 화면공유 가독성 원칙
 * - 한국어가 항상 시각적 1순위(초대형) → 로마자(RR) 뮤티드 소형 → 영어 뜻
 * - teaching=true(Teaching Mode)면 글자를 한 단계 키우고 튜터 팁을 표시
 * - quiz/checklist 상태는 클라이언트에서만 유지 (정적 SSG, 서버 불필요)
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import type {
  DialogueBlock,
  DrillBlock,
  HeadingBlock,
  HomeworkItem,
  PackBlock,
  PhraseCardsBlock,
  QuizBlock,
  TipBlock,
} from "@/data/types";
import { Markdown } from "@/components/markdown";
import { headingId } from "@/components/toc";

/* ───────────────────────────── 블록 리스트 ───────────────────────────── */

export function PackBlocks({
  blocks,
  teaching,
  storageKey,
}: {
  blocks: PackBlock[];
  /** Teaching Mode — ON: 글자 확대 + tutor tip 표시 / OFF: 학생 모드 */
  teaching: boolean;
  /** checklist 상태 저장용 네임스페이스 (예: "pack:demo") */
  storageKey: string;
}) {
  return (
    <div className="space-y-10">
      {blocks.map((block, i) => (
        <BlockView
          key={i}
          block={block}
          index={i}
          teaching={teaching}
          storageKey={`${storageKey}:${i}`}
        />
      ))}
    </div>
  );
}

export function BlockView({
  block,
  index,
  teaching,
  storageKey,
}: {
  block: PackBlock;
  index: number;
  teaching: boolean;
  storageKey: string;
}) {
  switch (block.type) {
    case "heading":
      return <Heading block={block} id={headingId(index)} />;
    case "text":
      return (
        <Markdown
          text={block.markdown}
          className={`max-w-[62ch] ${teaching ? "text-xl" : ""}`}
        />
      );
    case "tip":
      return <Tip block={block} teaching={teaching} />;
    case "phrase-cards":
      return <PhraseCards block={block} teaching={teaching} />;
    case "dialogue":
      return <Dialogue block={block} teaching={teaching} />;
    case "drill":
      return <Drill block={block} teaching={teaching} />;
    case "quiz":
      return <Quiz block={block} teaching={teaching} />;
    case "checklist":
      return <Checklist block={block} storageKey={storageKey} />;
  }
}

/* ────────────────────────────── heading ────────────────────────────── */

function Heading({ block, id }: { block: HeadingBlock; id: string }) {
  const inner = (
    <>
      {block.en}
      {block.ko && (
        <span className="ml-3 align-middle font-sans text-[0.55em] font-normal text-ink-soft">
          {block.ko}
        </span>
      )}
    </>
  );
  return block.level === 1 ? (
    <h2 id={id} className="scroll-mt-28 border-b border-ink-faint pb-3 font-display text-3xl sm:text-4xl">
      {inner}
    </h2>
  ) : (
    <h3 id={id} className="scroll-mt-28 font-display text-2xl sm:text-3xl">
      {inner}
    </h3>
  );
}

/* ──────────────────────────────── tip ──────────────────────────────── */

function Tip({ block, teaching }: { block: TipBlock; teaching: boolean }) {
  if (block.audience === "tutor") {
    // 튜터 노트 — 학생 모드(Teaching Mode OFF)에서는 렌더링하지 않는다
    if (!teaching) return null;
    return (
      <aside className="max-w-[62ch] rounded-2xl border border-amber-line bg-amber-wash p-5">
        <p className="font-mono text-[11px] tracking-[0.2em] text-amber">튜터 노트</p>
        <Markdown text={block.markdown} className="mt-2 text-[17px]" />
      </aside>
    );
  }
  return (
    <aside className="max-w-[62ch] rounded-2xl border border-accent/30 bg-accent-wash/50 p-5">
      <p className="font-mono text-[11px] tracking-[0.2em] text-accent">STUDY TIP</p>
      <Markdown text={block.markdown} className="mt-2 text-[17px]" />
    </aside>
  );
}

/* ─────────────────────────── phrase-cards ─────────────────────────── */

export function PhraseCards({
  block,
  teaching,
}: {
  block: PhraseCardsBlock;
  teaching: boolean;
}) {
  return (
    <div>
      {block.title && <BlockTitle>{block.title}</BlockTitle>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {block.cards.map((card, i) => (
          <li key={i} className="soft-card flex flex-col p-6">
            {/* 3단 위계: 한국어 초대형 → RR 뮤티드 → 영어 */}
            <p
              lang="ko"
              className={`font-display leading-snug ${
                teaching ? "text-5xl sm:text-[3.4rem]" : "text-4xl"
              }`}
            >
              {card.ko}
            </p>
            <p className="mt-2 font-mono text-sm text-ink-soft">{card.rr}</p>
            <p className={`mt-1.5 font-medium ${teaching ? "text-xl" : "text-lg"}`}>
              {card.en}
            </p>
            {card.note && (
              <p className="mt-3 border-t border-ink-faint pt-2.5 text-sm leading-relaxed text-ink-soft">
                {card.note}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────────── dialogue ───────────────────────────── */

function Dialogue({ block, teaching }: { block: DialogueBlock; teaching: boolean }) {
  return (
    <div className="max-w-2xl space-y-4">
      {block.lines.map((line, i) => {
        const isA = line.speaker === "A";
        return (
          <div key={i} className={`flex ${isA ? "justify-start" : "justify-end"}`}>
            <div
              className={`max-w-[85%] rounded-2xl border p-4 sm:p-5 ${
                isA
                  ? "rounded-tl-sm border-ink-faint bg-card"
                  : "rounded-tr-sm border-accent/30 bg-accent-wash/60"
              }`}
            >
              <p className="font-mono text-[11px] tracking-[0.15em] text-ink-soft">
                {isA ? block.speakers.a : block.speakers.b}
              </p>
              <p
                lang="ko"
                className={`mt-1 font-display leading-snug ${
                  teaching ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl"
                }`}
              >
                {line.ko}
              </p>
              <p className="mt-1.5 font-mono text-[13px] text-ink-soft">{line.rr}</p>
              <p className="mt-0.5 text-[15px] text-ink-soft">{line.en}</p>
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-sm text-ink-soft">
        Role-swap: read one side, then switch! 역할을 바꿔 읽어 보세요.
      </p>
    </div>
  );
}

/* ─────────────────────────────── drill ─────────────────────────────── */

export function Drill({ block, teaching }: { block: DrillBlock; teaching: boolean }) {
  const [i, setI] = useState(0);
  const item = block.items[i];
  if (!item) return null;

  return (
    <div className="soft-card p-6 sm:p-10">
      {block.instruction && (
        <p className="mb-6 text-center text-[15px] text-ink-soft">{block.instruction}</p>
      )}

      {/* 한 번에 한 문장 — 초대형 집중 모드 */}
      <div className="flex min-h-[13rem] flex-col items-center justify-center text-center">
        <p
          lang="ko"
          className={`font-display leading-tight ${
            teaching
              ? "text-6xl sm:text-[4.5rem]"
              : "text-5xl sm:text-6xl"
          }`}
        >
          {item.ko}
        </p>
        <p className="mt-4 font-mono text-lg text-ink-soft">{item.rr}</p>
        {item.en && <p className="mt-1.5 text-xl font-medium">{item.en}</p>}
      </div>

      <div className="mt-6 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => setI((v) => Math.max(0, v - 1))}
          disabled={i === 0}
          className="min-h-11 rounded-full border border-ink-faint bg-card px-5 py-2 font-medium text-ink-soft transition-colors enabled:hover:border-accent/50 enabled:hover:text-accent disabled:opacity-40"
        >
          ← Back
        </button>
        <span className="font-mono text-sm text-ink-soft">
          {i + 1} / {block.items.length}
        </span>
        <button
          type="button"
          onClick={() => setI((v) => Math.min(block.items.length - 1, v + 1))}
          disabled={i === block.items.length - 1}
          className="min-h-11 rounded-full bg-accent px-6 py-2 font-medium text-white transition-colors enabled:hover:bg-accent-strong disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────── quiz ─────────────────────────────── */

function Quiz({ block, teaching }: { block: QuizBlock; teaching: boolean }) {
  return (
    <div className="max-w-2xl space-y-5">
      {block.questions.map((q, qi) => (
        <QuizQuestionView key={qi} q={q} n={qi + 1} teaching={teaching} />
      ))}
    </div>
  );
}

function QuizQuestionView({
  q,
  n,
  teaching,
}: {
  q: QuizBlock["questions"][number];
  n: number;
  teaching: boolean;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;

  return (
    <div className="soft-card p-5 sm:p-6">
      <p className={`font-medium ${teaching ? "text-2xl" : "text-lg"}`}>
        <span className="mr-2 font-mono text-sm text-accent">Q{n}</span>
        {q.prompt}
      </p>
      <div className="mt-4 grid gap-2.5">
        {q.choices.map((choice, ci) => {
          const isAnswer = ci === q.answerIndex;
          const isPicked = ci === picked;
          let style = "border-ink-faint bg-paper hover:border-accent/50";
          if (answered && isAnswer) style = "border-good bg-good-wash";
          else if (answered && isPicked) style = "border-accent bg-accent-wash/60";
          else if (answered) style = "border-ink-faint bg-paper opacity-60";
          return (
            <button
              key={ci}
              type="button"
              onClick={() => setPicked(ci)}
              disabled={answered}
              className={`min-h-11 rounded-xl border px-4 py-3 text-left transition-colors ${
                teaching ? "text-2xl" : "text-lg"
              } ${style}`}
            >
              <span lang="ko">{choice}</span>
              {answered && isAnswer && (
                <span className="ml-2 font-mono text-[12px] text-good">✓ answer</span>
              )}
            </button>
          );
        })}
      </div>
      {answered && q.explanation && (
        <p className="mt-4 border-t border-ink-faint pt-3 text-[15px] leading-relaxed text-ink-soft">
          {q.explanation}
        </p>
      )}
    </div>
  );
}

/* ───────────────────────────── checklist ───────────────────────────── */

/**
 * 체크리스트 항목 — 숙제(HomeworkItem)와 같은 모양.
 * 팩의 ChecklistBlock 항목({ en, ko?, rr? })도 추가 필드가 전부 선택이라 그대로 들어온다.
 */
export type ChecklistItem = HomeworkItem;

/** ChecklistBlock과 학생 포털의 숙제 배열을 모두 받는 느슨한 형태 */
type ChecklistLike = {
  type?: "checklist";
  title?: string;
  items: ChecklistItem[];
};

/**
 * 체크리스트 렌더러 — export되어 있어 학생 포털(/s/[slug])의 Homework 섹션에서도
 * LessonLog.homework를 그대로 담아 재사용한다 (localStorage 저장 로직 공유).
 *
 * 숙제는 "무엇을(en) · 얼마나(target) · 어떻게(how) · 무엇으로(phrases/packId)"가
 * 한 항목 안에서 다 보이도록 렌더링한다. 상세가 길어질 수 있으므로
 * how/phrases는 접이식으로 두고, 체크된 항목은 자동으로 접히며 흐려진다.
 */
export function Checklist({
  block,
  storageKey,
}: {
  block: ChecklistLike;
  storageKey: string;
}) {
  const key = `hanmadi-check:${storageKey}`;
  const [done, setDone] = useState<boolean[]>(() => block.items.map(() => false));

  // localStorage 복원 — 하이드레이션 이후에만 읽는다
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const arr = JSON.parse(saved) as boolean[];
        // localStorage는 서버에 없다 — lazy initializer로 읽으면 하이드레이션이
        // 깨지므로 마운트 후 1회 복원이 유일하게 안전한 방법이다.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDone(block.items.map((_, i) => Boolean(arr[i])));
      }
    } catch {
      /* 무시 — 저장 실패해도 화면 동작에는 지장 없음 */
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

  return (
    <div className="max-w-xl">
      {block.title && <BlockTitle>{block.title}</BlockTitle>}
      <ul className="soft-card divide-y divide-ink-faint">
        {block.items.map((item, i) => (
          <li key={i}>
            <ChecklistRow
              item={item}
              done={done[i] ?? false}
              onToggle={() => toggle(i)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 체크리스트 한 줄 — 제목 행(체크박스) + 상세(목표·방법·연습 문장·팩 링크) */
function ChecklistRow({
  item,
  done,
  onToggle,
}: {
  item: ChecklistItem;
  done: boolean;
  onToggle: () => void;
}) {
  const phrases = item.phrases ?? [];
  /** 접이식으로 감출 내용 — 방법 설명과 연습 문장 */
  const hasDetail = Boolean(item.how) || phrases.length > 0;
  const hasExtra = hasDetail || Boolean(item.target) || Boolean(item.packId);

  return (
    <div className="px-5 py-3.5">
      {/* 무엇을 — 체크박스 + 제목(영어) + 한국어/RR 병기 */}
      <label className="flex min-h-11 cursor-pointer items-start gap-3.5">
        <input
          type="checkbox"
          checked={done}
          onChange={onToggle}
          className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
        />
        <span className={done ? "text-ink-soft line-through" : ""}>
          {item.en}
          {item.ko && (
            <span lang="ko" className="ml-2 text-sm text-ink-soft">
              {item.ko}
            </span>
          )}
          {item.rr && (
            <span className="ml-1.5 font-mono text-[12px] text-ink-soft">
              {item.rr}
            </span>
          )}
        </span>
      </label>

      {hasExtra && (
        <div
          className={`mt-2 space-y-2.5 pl-[2.125rem] transition-opacity ${
            done ? "opacity-45" : ""
          }`}
        >
          {/* 얼마나 — 분량·빈도 칩 */}
          {item.target && (
            <p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-wash px-3 py-1 font-mono text-[12px] text-accent">
                <span aria-hidden="true">⏱</span>
                {item.target}
              </span>
            </p>
          )}

          {/* 어떻게 — 방법 + 연습 문장 (체크하면 자동으로 접힌다) */}
          {hasDetail && (
            <details open={!done} className="group">
              <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] font-medium text-ink-soft [&::-webkit-details-marker]:hidden">
                <span
                  aria-hidden="true"
                  className="transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
                {item.how ? "How to do it" : "Practice these"}
                <span lang="ko" className="font-normal">
                  {item.how ? "하는 방법" : "연습 문장"}
                </span>
                {phrases.length > 0 && (
                  <span className="font-mono text-[11px]">
                    · {phrases.length} phrase{phrases.length === 1 ? "" : "s"}
                  </span>
                )}
              </summary>
              <div className="mt-1 space-y-3">
                {item.how && (
                  <p className="max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">
                    {item.how}
                  </p>
                )}
                {phrases.length > 0 && (
                  <ul className="space-y-2">
                    {phrases.map((phrase, pi) => (
                      <li
                        key={pi}
                        className="rounded-xl border border-ink-faint bg-paper px-4 py-3"
                      >
                        {/* 3단 위계: 한국어 대형 → RR → 영어 뜻 */}
                        <p lang="ko" className="font-display text-2xl leading-snug">
                          {phrase.ko}
                        </p>
                        {phrase.rr && (
                          <p className="mt-1 font-mono text-[13px] text-ink-soft">
                            {phrase.rr}
                          </p>
                        )}
                        {phrase.en && (
                          <p className="mt-0.5 text-[15px]">{phrase.en}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          )}

          {/* 무엇으로 — 연결된 학습 팩 */}
          {item.packId && (
            <Link
              href={`/library/${item.packId}`}
              className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-accent underline-offset-4 hover:underline"
            >
              Open the pack
              <span lang="ko" className="font-normal text-ink-soft">
                팩 열기
              </span>
              →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────── 공용 ────────────────────────────── */

/** 공용 섹션 라벨 — 다른 라우트(라이브러리/포털)에서도 같은 스타일이 필요하면 재사용 */
export function BlockTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 font-mono text-[12px] tracking-[0.2em] text-accent uppercase">
      {children}
    </p>
  );
}
