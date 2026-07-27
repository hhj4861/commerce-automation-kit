"use client";

/**
 * 레벨 진단 (공개) — 학생이 로그인 없이 링크를 열어 스스로 푸는 배치 테스트.
 *
 * - 문항은 GET /api/placement 에서 받는다 (정답 없는 PublicQuestion[]).
 *   ⚠️ lib/placement 는 정답이 든 PLACEMENT_QUESTIONS 를 품고 있으므로
 *      이 클라이언트 파일에서 값(런타임)으로 import 하지 않는다. 타입만 import.
 *      레벨 표기는 client-safe 한 components/pack-badges 의 LEVEL_LABEL 을 쓴다.
 * - 채점은 서버(POST /api/placement)에서만 한다. 클라이언트는 정답을 모른다.
 * - slug(?s=)로 열면 튜터에게 결과 저장, 없으면 익명(저장 안 됨).
 * - 하이드레이션 안전: 문항 순서 고정(셔플·난수 없음). fetch·slug 읽기·scroll 은
 *   모두 effect/이벤트에서만. 렌더 중 Date.now()/Math.random() 없음.
 *
 * 학생 화면 → 영어 우선 + 한국어 병기. 터치 타깃 44px+.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { PlacementAxis, PublicQuestion } from "@/lib/placement";
import type { PackLevel, PlacementResult } from "@/data/types";
import { LEVEL_LABEL } from "@/components/pack-badges";

/* ─────────────────────────── 표시 데이터 ─────────────────────────── */

const AXIS_ORDER: PlacementAxis[] = ["hangul", "vocab", "grammar"];

const AXIS_META: Record<PlacementAxis, { en: string; ko: string }> = {
  hangul: { en: "Reading Hangul", ko: "한글 읽기" },
  vocab: { en: "Vocabulary", ko: "어휘" },
  grammar: { en: "Grammar & Speaking", ko: "문법·회화" },
};

/** 레벨별 한 줄 안내 (완전 초보=한글부터, 초보=표현·문법, 초중급=회화 확장) */
const LEVEL_BLURB: Record<PackLevel, { en: string; ko: string }> = {
  "absolute-beginner": {
    en: "Let's start from Hangul — reading the alphabet comes first.",
    ko: "한글부터 차근차근 시작해요.",
  },
  beginner: {
    en: "You can read! Now we build everyday phrases and grammar.",
    ko: "이제 표현과 기초 문법을 다져요.",
  },
  "upper-beginner": {
    en: "Solid basics — time to grow into real conversations.",
    ko: "기초가 탄탄해요. 회화로 확장할 차례예요.",
  },
};

const HANGUL_RE = /[가-힣ᄀ-ᇿ㄰-㆏]/;
const LETTERS = ["A", "B", "C", "D"];

/** 문항 로드 — 실패 시 throw. 공개 GET /api/placement (정답 없는 문항). */
async function fetchQuestions(): Promise<PublicQuestion[]> {
  const res = await fetch("/api/placement");
  const data = (await res.json()) as {
    ok?: boolean;
    questions?: PublicQuestion[];
  };
  if (data?.ok && Array.isArray(data.questions)) return data.questions;
  throw new Error("Failed to load placement questions");
}

/* ─────────────────────────────── 페이지 ─────────────────────────────── */

export default function LevelTestPage() {
  const [questions, setQuestions] = useState<PublicQuestion[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [slug, setSlug] = useState("");

  const [phase, setPhase] = useState<"intro" | "quiz" | "result">("intro");
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [saved, setSaved] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const total = questions?.length ?? 0;

  // 재시도 버튼 전용 (이벤트 핸들러 — effect가 아니라 동기 setState 허용)
  const loadQuestions = useCallback(async () => {
    setLoadError(false);
    setQuestions(null);
    try {
      setQuestions(await fetchQuestions());
    } catch {
      setLoadError(true);
    }
  }, []);

  // 마운트: 개인 링크 slug(?s=) 읽기 + 문항 로드.
  // setState는 전부 await 이후(비동기 경로)에서만 — 하이드레이션·cascading render 안전.
  useEffect(() => {
    let alive = true;
    const s = new URLSearchParams(window.location.search).get("s");
    void (async () => {
      try {
        const qs = await fetchQuestions();
        if (!alive) return;
        if (s) setSlug(s);
        setQuestions(qs);
      } catch {
        if (alive) setLoadError(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const submit = useCallback(async () => {
    if (!questions) return;
    setSubmitting(true);
    setSubmitError(false);
    try {
      const res = await fetch("/api/placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slug ? { answers, slug } : { answers }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        result?: PlacementResult;
        saved?: boolean;
      };
      if (data?.ok && data.result) {
        setResult(data.result);
        setSaved(Boolean(data.saved));
        setPhase("result");
        window.scrollTo({ top: 0 });
      } else {
        setSubmitError(true);
      }
    } catch {
      setSubmitError(true);
    } finally {
      setSubmitting(false);
    }
  }, [answers, slug, questions]);

  function choose(q: PublicQuestion, idx: number) {
    setAnswers((prev) => ({ ...prev, [q.id]: idx }));
    // 선택 즉시 다음 문항으로 (마지막이면 그대로 두고 제출 CTA 노출)
    setCurrent((c) => (c < total - 1 ? c + 1 : c));
  }

  function retake() {
    setPhase("intro");
    setCurrent(0);
    setAnswers({});
    setResult(null);
    setSaved(false);
    setSubmitError(false);
    setShowReview(false);
    window.scrollTo({ top: 0 });
  }

  const progress = total === 0 ? 0 : Math.round(((current + 1) / total) * 100);
  // 채워지는 진행바 — 인트로 0, 문항 진행률, 결과 100 (레이아웃 고정)
  const barWidth = phase === "intro" ? 0 : phase === "result" ? 100 : progress;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      {/* 미니 크롬: 브랜드 + 진행 표시 (공개 페이지라 글로벌 헤더가 없다) */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-ink-faint px-5">
        <span className="flex items-baseline gap-2">
          <span className="font-display text-lg">Hanmadi</span>
          <span className="font-mono text-[11px] tracking-[0.2em] text-ink-soft">
            LEVEL CHECK
          </span>
        </span>
        {phase === "quiz" && (
          <span className="font-mono text-sm text-ink-soft">
            {current + 1}/{total}
          </span>
        )}
      </header>

      {/* 채워지는 진행바 */}
      <div className="h-1 w-full shrink-0 bg-ink-faint" aria-hidden="true">
        <div
          className="h-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${barWidth}%` }}
        />
      </div>

      <main className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-y-auto px-5 py-8">
        {loadError ? (
          /* ── 로드 실패 ── */
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-lg">Could not load the test.</p>
            <p lang="ko" className="mt-1 text-sm text-ink-soft">
              문항을 불러오지 못했어요.
            </p>
            <button
              type="button"
              onClick={() => void loadQuestions()}
              className="mt-5 min-h-11 rounded-full bg-accent px-8 py-2 font-medium text-white transition-colors hover:bg-accent-strong"
            >
              Try again
            </button>
          </div>
        ) : questions === null ? (
          /* ── 로딩 ── */
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div
              className="size-8 animate-spin rounded-full border-2 border-ink-faint border-t-accent"
              aria-hidden="true"
            />
            <p className="mt-4 font-mono text-sm text-ink-soft">Loading…</p>
          </div>
        ) : phase === "intro" ? (
          /* ── 인트로 ── */
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="font-mono text-[12px] tracking-[0.25em] text-accent">
              SELF CHECK · 셀프 진단
            </p>
            <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
              What is your Korean level?
            </h1>
            <p lang="ko" className="mt-3 text-lg text-ink-soft">
              한국어, 어느 정도인가요?
            </p>
            <p className="mt-5 font-mono text-sm text-ink-soft">
              {total} questions · {AXIS_ORDER.length} skills · ~2 minutes
            </p>
            <p className="mx-auto mt-3 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
              Answer at your own pace — no sign-in, no timer. We&apos;ll suggest
              where to start.
              <span lang="ko" className="mt-1 block text-ink-soft">
                편하게 풀어 보세요. 로그인도, 시간제한도 없어요.
              </span>
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {AXIS_ORDER.map((ax, i) => (
                <span
                  key={ax}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink-faint px-3 py-1 font-mono text-[12px] text-ink-soft"
                >
                  <span className="text-accent">{i + 1}</span>
                  {AXIS_META[ax].en}
                  <span lang="ko" className="text-ink-soft">
                    · {AXIS_META[ax].ko}
                  </span>
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setPhase("quiz");
                window.scrollTo({ top: 0 });
              }}
              className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-full bg-accent px-9 py-3 text-lg font-medium text-white transition-colors hover:bg-accent-strong"
            >
              Start
              <span lang="ko" className="font-mono text-sm text-white/80">
                시작하기
              </span>
              <span aria-hidden="true">→</span>
            </button>

            {slug ? (
              <p className="mt-4 font-mono text-[11px] text-ink-soft">
                🔗 Your result goes to your tutor · 결과가 튜터에게 전달돼요
              </p>
            ) : (
              <p className="mt-4 max-w-[40ch] font-mono text-[11px] text-ink-soft">
                Taking this on your own? Share the result with your tutor after.
              </p>
            )}
          </div>
        ) : phase === "quiz" ? (
          /* ── 문항 ── */
          <Quiz
            questions={questions}
            current={current}
            total={total}
            answers={answers}
            submitting={submitting}
            submitError={submitError}
            onChoose={choose}
            onBack={() => setCurrent((c) => Math.max(0, c - 1))}
            onNext={() => setCurrent((c) => Math.min(total - 1, c + 1))}
            onSubmit={() => void submit()}
          />
        ) : (
          /* ── 결과 ── */
          result && (
            <Result
              result={result}
              saved={saved}
              questions={questions}
              showReview={showReview}
              onToggleReview={() => setShowReview((v) => !v)}
              onRetake={retake}
            />
          )
        )}
      </main>
    </div>
  );
}

/* ─────────────────────────────── 문항 화면 ─────────────────────────────── */

function Quiz({
  questions,
  current,
  total,
  answers,
  submitting,
  submitError,
  onChoose,
  onBack,
  onNext,
  onSubmit,
}: {
  questions: PublicQuestion[];
  current: number;
  total: number;
  answers: Record<string, number>;
  submitting: boolean;
  submitError: boolean;
  onChoose: (q: PublicQuestion, idx: number) => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  const q = questions[current];
  const answered = answers[q.id];
  const isLast = current === total - 1;
  const newSkill = current > 0 && questions[current - 1].axis !== q.axis;
  const allAnswered = questions.every((item) => answers[item.id] !== undefined);
  const hasRr = q.displayRr && q.displayRr !== "?";

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-wash px-3 py-1 font-mono text-[11px] text-accent">
          {AXIS_META[q.axis].en}
          <span lang="ko" className="text-accent/70">
            · {AXIS_META[q.axis].ko}
          </span>
        </span>
        <span className="font-mono text-[11px] text-ink-soft">
          Q{current + 1} of {total}
        </span>
      </div>

      {newSkill && (
        <p className="mt-4 text-center font-mono text-[11px] tracking-[0.2em] text-ink-soft">
          — NEW SKILL · {AXIS_META[q.axis].ko} —
        </p>
      )}

      <div className="mt-6">
        <h2 className="text-2xl font-medium leading-snug sm:text-[28px]">
          {q.prompt}
        </h2>
        {q.display && (
          <div className="mt-6 flex flex-col items-center">
            <span
              lang="ko"
              className="font-display text-6xl text-accent sm:text-7xl"
            >
              {q.display}
            </span>
            {hasRr && (
              <span className="mt-2 font-mono text-lg text-ink-soft">
                {q.displayRr}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-7 grid gap-3">
        {q.choices.map((c, i) => {
          const selected = answered === i;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChoose(q, i)}
              className={`soft-card flex min-h-14 items-center gap-3 px-5 py-3.5 text-left text-lg transition-colors sm:text-xl ${
                selected
                  ? "!border-accent bg-accent-wash/60"
                  : "hover:border-accent/50"
              }`}
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-[13px] ${
                  selected
                    ? "bg-accent text-white"
                    : "bg-ink-faint text-ink-soft"
                }`}
                aria-hidden="true"
              >
                {LETTERS[i]}
              </span>
              <span lang={HANGUL_RE.test(c) ? "ko" : undefined}>{c}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto pt-8">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={current === 0}
            className="min-h-11 rounded-full border border-ink-faint bg-card px-6 py-2 font-medium text-ink-soft transition-colors enabled:hover:border-accent/50 enabled:hover:text-accent disabled:opacity-40"
          >
            ← Back
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!allAnswered || submitting}
              className="min-h-11 rounded-full bg-accent px-8 py-2 font-medium text-white transition-colors enabled:hover:bg-accent-strong disabled:opacity-40"
            >
              {submitting ? "Scoring…" : "See my level →"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onNext}
              disabled={answered === undefined}
              className="min-h-11 rounded-full bg-accent px-8 py-2 font-medium text-white transition-colors enabled:hover:bg-accent-strong disabled:opacity-40"
            >
              Next →
            </button>
          )}
        </div>
        {isLast && !allAnswered && (
          <p className="mt-3 text-center font-mono text-[11px] text-ink-soft">
            Answer every question to see your level.
          </p>
        )}
        {submitError && (
          <p className="mt-3 text-center text-sm text-accent">
            Something went wrong. Please try again.
          </p>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────── 결과 화면 ─────────────────────────────── */

function Result({
  result,
  saved,
  questions,
  showReview,
  onToggleReview,
  onRetake,
}: {
  result: PlacementResult;
  saved: boolean;
  questions: PublicQuestion[];
  showReview: boolean;
  onToggleReview: () => void;
  onRetake: () => void;
}) {
  const lvl = LEVEL_LABEL[result.suggestedLevel];
  const blurb = LEVEL_BLURB[result.suggestedLevel];
  const reviewQuestions = questions.filter((q) => q.explain);

  return (
    <div className="flex flex-1 flex-col">
      <div className="text-center">
        <p className="font-mono text-[12px] tracking-[0.25em] text-accent">
          YOUR SUGGESTED LEVEL · 제안 레벨
        </p>
        <h1 lang="ko" className="mt-3 font-display text-5xl text-accent sm:text-6xl">
          {lvl.ko}
        </h1>
        <p className="mt-1.5 font-display text-2xl">{lvl.en}</p>
        <p className="mx-auto mt-4 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">
          {blurb.en}
          <span lang="ko" className="mt-1 block text-ink-soft">
            {blurb.ko}
          </span>
        </p>
      </div>

      {/* 점수 + 축별 정답 막대 */}
      <div className="soft-card mt-8 p-6">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] tracking-[0.15em] text-ink-soft">
            SCORE · 점수
          </span>
          <span className="font-display text-3xl">
            {result.score}
            <span className="text-lg text-ink-soft">/100</span>
          </span>
        </div>
        <div className="mt-5 space-y-4">
          {AXIS_ORDER.map((ax) => {
            const a = result.axes[ax];
            const pct = a.total === 0 ? 0 : Math.round((a.correct / a.total) * 100);
            return (
              <div key={ax}>
                <div className="flex items-center justify-between text-[15px]">
                  <span>
                    {AXIS_META[ax].en}
                    <span lang="ko" className="text-ink-soft">
                      {" "}
                      · {AXIS_META[ax].ko}
                    </span>
                  </span>
                  <span className="font-mono text-ink-soft">
                    {a.correct}/{a.total}
                  </span>
                </div>
                <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-ink-faint">
                  <div
                    className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 저장 여부 안내 */}
      {saved ? (
        <div className="mt-6 rounded-2xl border border-good bg-good-wash px-5 py-4 text-center">
          <p className="font-medium text-good">✓ Sent to your tutor</p>
          <p lang="ko" className="mt-0.5 text-sm text-ink-soft">
            결과가 튜터에게 전달됐어요. 다음 수업 때 함께 봐요.
          </p>
        </div>
      ) : (
        <div className="mt-6 rounded-2xl border border-ink-faint bg-card px-5 py-4 text-center">
          <p className="text-[15px]">
            Taking this on your own? Show this result to your tutor.
          </p>
          <p lang="ko" className="mt-0.5 text-sm text-ink-soft">
            튜터에게 결과를 알려주세요.
          </p>
        </div>
      )}

      {/* 다음 행동 = 예약 (체험 → 레벨테스트 → 예약의 마지막 단계) */}
      <div className="mt-5 flex flex-col gap-2.5">
        <a
          href="https://preply.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-accent px-8 py-3.5 text-[17px] font-semibold text-white transition-colors hover:bg-accent-strong"
        >
          <span aria-hidden="true">📅</span>
          Book your lesson
          <span lang="ko" className="font-mono text-sm text-white/85">
            수업 예약하기
          </span>
          <span aria-hidden="true">→</span>
        </a>
        <p className="text-center text-[14px] text-ink-soft">
          We&apos;ll start you right at{" "}
          <span className="font-medium text-ink">{lvl.en}</span>.
          <span lang="ko" className="ml-1">
            {lvl.ko}부터 시작해요.
          </span>
        </p>
        {/* 아직 체험 안 했으면 부담 없이 먼저 해보도록 (보조) */}
        <Link
          href="/trial"
          className="inline-flex min-h-11 items-center justify-center gap-1.5 text-[14px] text-ink-soft transition-colors hover:text-accent"
        >
          Haven&apos;t tried a lesson yet?{" "}
          <span lang="ko">먼저 체험수업 해보기</span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {/* 복습 포인트 — 채점 후 explain 을 학습 포인트로 (정답 여부와 무관한 리뷰) */}
      {reviewQuestions.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={onToggleReview}
            aria-expanded={showReview}
            className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-ink-faint bg-card px-5 py-3 text-left transition-colors hover:border-accent/50"
          >
            <span className="font-medium">
              Review points
              <span lang="ko" className="text-ink-soft">
                {" "}
                · 복습 포인트
              </span>
            </span>
            <span className="font-mono text-lg text-ink-soft" aria-hidden="true">
              {showReview ? "−" : "+"}
            </span>
          </button>
          {showReview && (
            <ul className="mt-3 space-y-3">
              {reviewQuestions.map((q) => (
                <li key={q.id} className="soft-card px-5 py-4">
                  <p className="text-[13px] text-ink-soft">{q.prompt}</p>
                  {q.display && (
                    <p
                      lang="ko"
                      className="mt-1 font-display text-2xl text-accent"
                    >
                      {q.display}
                    </p>
                  )}
                  <p className="mt-1.5 text-[15px]">{q.explain}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={onRetake}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-ink-faint bg-card px-8 py-2 font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
        >
          <span aria-hidden="true">↻</span>
          Take it again
          <span lang="ko" className="font-mono text-sm">
            다시 풀기
          </span>
        </button>
      </div>
    </div>
  );
}
