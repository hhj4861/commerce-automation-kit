"use client";

/**
 * 체험수업 — 학생이 폰으로 링크를 열어 스스로 탭·조립하며 5분 만에
 * "나 한국어 읽었다!"를 경험하고 예약까지 이르는 셀프 인터랙티브 데모.
 *
 * 설계 원칙
 * - 모든 학습 순간 바로 뒤에 직접 손을 쓰는 인터랙션이 붙는다 ("보여주기"가 아니라 "해보기").
 * - 그 핵심은 수업기록과 같은 결의 자모·음절 조립 퍼즐(components/trial-puzzle.tsx)이다.
 * - 학생이 대본 없이 스스로 진행하도록 각 스텝에 셀프 안내 문구(영어+한국어)를 둔다.
 * - 튜터 대본(SCRIPTS·앰버 스트립)은 남겨 두되 기본 숨김(showScript=false).
 *   튜터가 진행에 쓰고 싶으면 T키/버튼으로 켠다.
 *
 * 조작: ← → 화살표 키 / 버튼 · T 키 = 대본 토글 · 스크롤 없음(퍼즐 스텝만 세로 스크롤 허용).
 * 렌더 중 Date.now()/Math.random() 금지 — 셔플/난수는 퍼즐 컴포넌트의 지연초기화에서만.
 */

import { useCallback, useEffect, useState } from "react";
import { Drill } from "@/components/blocks";
import {
  CHO,
  JUNG,
  TrialPuzzle,
  composeSyllable,
  prefetchSpeak,
  speak,
  type TrialCollected,
} from "@/components/trial-puzzle";

/* ─────────────────────────── 스텝 콘텐츠 데이터 ─────────────────────────── */

const GOALS = [
  { en: "Travel", ko: "여행" },
  { en: "K-Drama", ko: "드라마" },
  { en: "K-Pop", ko: "케이팝" },
  { en: "Work", ko: "일" },
];

const MOODS = [
  { ko: "좋아요", rr: "joayo", en: "I'm good", emoji: "🙂" },
  { ko: "피곤해요", rr: "pigonhaeyo", en: "I'm tired", emoji: "😴" },
  { ko: "신나요", rr: "sinnayo", en: "I'm excited", emoji: "🤩" },
  { ko: "배고파요", rr: "baegopayo", en: "I'm hungry", emoji: "😋" },
];

const TRIAL_PHRASES = [
  { ko: "안녕하세요", rr: "annyeonghaseyo", en: "Hello" },
  { ko: "감사합니다", rr: "gamsahamnida", en: "Thank you" },
  { ko: "만나서 반가워요", rr: "mannaseo bangawoyo", en: "Nice to meet you" },
];

/** 스텝 상단 mono 라벨 */
const STEP_KICKERS = [
  "READ IN 5 MIN",
  "YOUR GOAL",
  "FIRST WORD",
  "HANGUL PUZZLE",
  "BUILD A LETTER",
  "FIRST PHRASES",
  "SAY IT OUT LOUD",
  "BUILD A SENTENCE",
  "YOU DID IT",
  "YOUR PAGE",
];

/** 학생용 셀프 안내 — 대본을 대신해 "지금 뭘 하면 되는지" 한 줄로 알려 준다 */
const SELF_GUIDE = [
  { en: "Tap the word — you just met your first Korean.", ko: "단어를 탭해 보세요." },
  { en: "Pick the one closest to you.", ko: "가장 가까운 걸 골라요." },
  { en: "Tap how you feel — now say it out loud.", ko: "기분을 탭하고 소리 내 말해요." },
  { en: "Pick one of each — watch a letter appear.", ko: "자음·모음을 하나씩 골라요." },
  { en: "Make the sound — tap a consonant, then a vowel.", ko: "글자를 만들어 보세요." },
  { en: "Tap each card, then say it after the sound.", ko: "카드를 하나씩 열어요." },
  { en: "Say it out loud — 천천히 (slowly) is perfect.", ko: "소리 내어 따라 말해요." },
  { en: "Tap the pieces in order to build the sentence.", ko: "조각을 순서대로 눌러요." },
  { en: "Everything you made today — tap a chip to hear it.", ko: "오늘 만든 것들이에요." },
  { en: "This is where today's puzzles live after class.", ko: "수업이 링크로 남아요." },
];

type Script = { ko: string; read: string[] };

/** 튜터 대본 (기본 숨김, T 토글) — 튜터가 진행에 쓰고 싶을 때만 켠다 */
const SCRIPTS: Script[] = [
  {
    ko: "학생이 스스로 여는 랜딩. 카드를 탭해 첫 한국어를 만나게 두고, 준비되면 시작.",
    read: ["Tap the word — that's your first Korean!", "Ready? Let's read together."],
  },
  {
    ko: "학생이 직접 목표를 고르게 하고 이후 예시 톤을 맞춘다.",
    read: ["Why Korean, for you?", "Pick the one closest to you."],
  },
  {
    ko: "첫 한국어 발화. 고른 기분을 소리 내어 말하게 한다.",
    read: ["How are you today?", "Say it out loud — that's Korean!"],
  },
  {
    ko: "한글이 조합임을 손으로 만지며 발견하게 둔다.",
    read: ["Pick a consonant, pick a vowel.", "Watch a letter appear!"],
  },
  {
    ko: "조합 원리를 목표 맞히기로 굳힌다. 막히면 힌트를 안내.",
    read: ["Make this sound — build the letter.", "Tap a consonant, then a vowel."],
  },
  {
    ko: "카드를 하나씩 직접 열게 한다. 열고 나서 소리 내어 따라 말하기.",
    read: ["Tap each card to open it.", "Then say it after the sound."],
  },
  {
    ko: "드릴은 천천히. 스스로 체크하며 넘어가게 둔다.",
    read: ["Your turn — say it out loud.", "Slow is perfect."],
  },
  {
    ko: "핵심 활동. 배운 문장을 스스로 조립. 2번 틀리면 Show me로 막히지 않게.",
    read: ["Build the sentence from the pieces.", "Tap them in order!"],
  },
  {
    ko: "학생이 실제로 만든 것을 함께 짚으며 성취를 실감시킨다.",
    read: ["Look how much you did!", "Letters and phrases — in 5 minutes."],
  },
  {
    ko: "구체적 요일·시간 2개를 제시하면 예약률이 오른다.",
    read: ["Your lessons live on a page like this.", "Shall we book your next one?"],
  },
];

const TOTAL = 10;
/** 직접 해봐야(또는 건너뛰어야) 다음으로 넘어가는 스텝 — 자모 퍼즐 · 표현 열기 · 문장 퍼즐 */
const GATED = new Set([4, 5, 7]);

/* ────────────────────────────────── 페이지 ────────────────────────────────── */

export default function TrialPage() {
  const [step, setStep] = useState(0);
  const [showScript, setShowScript] = useState(false);
  // 인터랙션 상태 — 스텝을 오가도 유지
  const [flipped, setFlipped] = useState(false);
  const [goal, setGoal] = useState<number | null>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [cho, setCho] = useState(0);
  const [jung, setJung] = useState(0);

  // 발음 mp3 선행 프리페치 — 소리 나는 스텝에 "들어서기 한 스텝 전"에 받아둬
  // 첫 탭이 즉시 재생되게 한다. 조합기는 16개 전부(글자당 수 KB)라 다 받아둔다.
  useEffect(() => {
    if (step === 0) prefetchSpeak("안녕하세요");
    if (step === 1 || step === 2) for (const m of MOODS) prefetchSpeak(m.ko);
    if (step === 2 || step === 3) {
      for (const c of CHO) {
        for (const j of JUNG) prefetchSpeak(composeSyllable(c.idx, j.idx));
      }
    }
  }, [step]);
  // 퍼즐이 만든 글자·문장 수집함 → 마지막 요약의 재료
  const [collected, setCollected] = useState<TrialCollected[]>([]);
  // 직접 해본(완료한) 게이트 스텝
  const [done, setDone] = useState<Set<number>>(() => new Set());

  const next = useCallback(() => setStep((s) => Math.min(TOTAL - 1, s + 1)), []);
  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  const markDone = useCallback((s: number) => {
    setDone((prev) => {
      if (prev.has(s)) return prev;
      const nextSet = new Set(prev);
      nextSet.add(s);
      return nextSet;
    });
  }, []);

  const collect = useCallback((item: TrialCollected) => {
    setCollected((prev) =>
      prev.some((p) => p.ko === item.ko) ? prev : [...prev, item],
    );
  }, []);

  const locked = GATED.has(step) && !done.has(step);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") {
        if (!locked) next();
      } else if (e.key === "ArrowLeft") {
        prev();
      } else if (e.key === "t" || e.key === "T") {
        setShowScript((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, locked]);

  const script = SCRIPTS[step];
  const guide = SELF_GUIDE[step];
  const progress = Math.round(((step + 1) / TOTAL) * 100);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      {/* 미니 크롬: 브랜드 + 진행 표시 (공개 페이지라 글로벌 헤더가 없다) */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-ink-faint px-5">
        <span className="flex items-baseline gap-2">
          <span className="font-display text-lg">Hanmadi</span>
          <span className="font-mono text-[11px] tracking-[0.2em] text-ink-soft">
            체험수업
          </span>
        </span>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-1.5 sm:flex" aria-hidden="true">
            {Array.from({ length: TOTAL }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStep(i)}
                className={`size-2 rounded-full transition-colors ${
                  i === step
                    ? "bg-accent"
                    : done.has(i)
                      ? "bg-accent/40"
                      : "bg-ink-faint hover:bg-accent/40"
                }`}
                tabIndex={-1}
              />
            ))}
          </div>
          <span className="font-mono text-sm text-ink-soft">
            {step + 1}/{TOTAL}
          </span>
          <button
            type="button"
            onClick={() => setShowScript((v) => !v)}
            className={`rounded-full border px-3 py-1 font-mono text-[10px] tracking-wide transition-colors ${
              showScript
                ? "border-amber-line bg-amber-wash text-amber"
                : "border-ink-faint text-ink-soft hover:text-ink"
            }`}
            title="튜터 대본 토글 (T)"
          >
            대본 {showScript ? "ON" : "OFF"}
          </button>
        </div>
      </header>

      {/* 채워지는 진행바 */}
      <div className="h-1 w-full shrink-0 bg-ink-faint" aria-hidden="true">
        <div
          className="h-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 스텝 콘텐츠 — 퍼즐 스텝만 세로 스크롤, 나머지는 중앙 정렬 */}
      <main className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-5 py-6">
        <div className="w-full max-w-4xl">
          <p className="text-center font-mono text-[12px] tracking-[0.25em] text-accent">
            {STEP_KICKERS[step]}
          </p>
          {/* 학생 셀프 안내 — 대본을 대신하는 "지금 할 일" 한 줄 */}
          <p className="mx-auto mb-5 mt-1.5 max-w-[40ch] text-center text-[14px] text-ink-soft">
            <span aria-hidden="true">👉 </span>
            {guide.en}{" "}
            <span lang="ko" className="text-ink-soft">
              {guide.ko}
            </span>
          </p>

          {/* 0. Hook — 5분이면 읽어요 (탭해서 뜻 뒤집기) */}
          {step === 0 && (
            <Center>
              <h1 className="font-display text-4xl leading-tight sm:text-5xl">
                Read Korean in 5 minutes.{" "}
                <span className="text-accent">Really.</span>
              </h1>
              <p className="mt-3 text-lg text-ink-soft">
                No app, no textbook — just tap.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFlipped(true);
                  speak("안녕하세요");
                }}
                className="soft-card mx-auto mt-8 flex min-h-52 w-full max-w-sm flex-col items-center justify-center px-6 py-8 transition-transform active:scale-[0.99]"
              >
                <span lang="ko" className="font-display text-6xl text-accent sm:text-7xl">
                  안녕하세요
                </span>
                {flipped ? (
                  <>
                    <span className="mt-3 font-mono text-lg text-ink-soft">
                      annyeonghaseyo
                    </span>
                    <span className="mt-1 text-2xl">Hello 👋</span>
                  </>
                ) : (
                  <span className="mt-4 font-mono text-[13px] tracking-[0.15em] text-ink-soft uppercase">
                    Tap me 👆
                  </span>
                )}
              </button>
              {flipped && (
                <button
                  type="button"
                  onClick={next}
                  className="mt-8 inline-flex min-h-13 items-center gap-2 rounded-full bg-accent px-9 py-3 text-lg font-medium text-white transition-colors hover:bg-accent-strong"
                >
                  I&apos;m ready
                  <span lang="ko" className="font-mono text-sm text-white/80">
                    시작할게요
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              )}
            </Center>
          )}

          {/* 1. Your goal — 왜 한국어? */}
          {step === 1 && (
            <Center>
              <h2 className="font-display text-4xl sm:text-5xl">Why Korean, for you?</h2>
              <div className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-4">
                {GOALS.map((g, i) => (
                  <button
                    key={g.en}
                    type="button"
                    onClick={() => setGoal(i)}
                    className={`soft-card min-h-24 p-5 text-center transition-colors ${
                      goal === i
                        ? "!border-accent bg-accent-wash/60"
                        : "hover:border-accent/50"
                    }`}
                  >
                    <span className="block text-2xl font-medium sm:text-3xl">{g.en}</span>
                    <span lang="ko" className="mt-1 block text-lg text-ink-soft">
                      {g.ko}
                    </span>
                  </button>
                ))}
              </div>
              {goal !== null && (
                <p className="mt-6 text-xl text-accent">
                  Nice — let&apos;s get you reading.
                </p>
              )}
            </Center>
          )}

          {/* 2. Your mood — 첫 한국어 단어 */}
          {step === 2 && (
            <Center>
              <h2 className="font-display text-4xl sm:text-5xl">How are you today?</h2>
              <div className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-4">
                {MOODS.map((m, i) => (
                  <button
                    key={m.ko}
                    type="button"
                    onClick={() => {
                      setMood(i);
                      speak(m.ko);
                    }}
                    className={`soft-card p-5 text-center transition-colors ${
                      mood === i
                        ? "!border-accent bg-accent-wash/60"
                        : "hover:border-accent/50"
                    }`}
                  >
                    <span lang="ko" className="block font-display text-3xl sm:text-4xl">
                      {m.emoji} {m.ko}
                    </span>
                    <span className="mt-1 block font-mono text-sm text-ink-soft">
                      {m.rr}
                    </span>
                    <span className="block text-lg">{m.en}</span>
                  </button>
                ))}
              </div>
              {mood !== null && (
                <>
                  <p lang="ko" className="mt-6 font-display text-4xl text-accent sm:text-5xl">
                    {MOODS[mood].ko}! 👏
                  </p>
                  <p className="mt-2 text-lg text-ink-soft">
                    That&apos;s Korean. You just said it!
                  </p>
                </>
              )}
            </Center>
          )}

          {/* 3. 한글은 퍼즐 — 조합기 */}
          {step === 3 && (
            <Center>
              <h2 className="font-display text-4xl sm:text-5xl">Hangul is a puzzle</h2>
              <div className="mx-auto mt-8 flex max-w-2xl flex-wrap items-center justify-center gap-4">
                <JamoPicker options={CHO} picked={cho} onPick={setCho} label="consonant" />
                <span className="font-display text-4xl text-ink-soft">+</span>
                <JamoPicker options={JUNG} picked={jung} onPick={setJung} label="vowel" />
                <span className="font-display text-4xl text-ink-soft">=</span>
                <button
                  type="button"
                  onClick={() => speak(composeSyllable(CHO[cho].idx, JUNG[jung].idx))}
                  className="soft-card flex min-w-36 flex-col items-center !border-accent px-8 py-5 transition-transform active:scale-95"
                  aria-label="Hear the letter"
                >
                  <span lang="ko" className="font-display text-7xl text-accent">
                    {composeSyllable(CHO[cho].idx, JUNG[jung].idx)}
                  </span>
                  <span className="mt-1 font-mono text-lg text-ink-soft">
                    {CHO[cho].rr}
                    {JUNG[jung].rr} <span aria-hidden="true">🔊</span>
                  </span>
                </button>
              </div>
              <p className="mt-6 text-xl text-ink-soft">
                Mix any two — you just read Korean. That&apos;s the whole trick!
              </p>
            </Center>
          )}

          {/* 4. 글자 만들기 퍼즐 (자모) */}
          {step === 4 && (
            <TrialPuzzle
              mode="jamo"
              onCollect={collect}
              onComplete={() => {
                markDone(4);
                next();
              }}
            />
          )}

          {/* 5. 첫 3표현 — 탭해서 열기 */}
          {step === 5 && (
            <div>
              <h2 className="mb-6 text-center font-display text-4xl sm:text-5xl">
                Your first three phrases
              </h2>
              <RevealCards phrases={TRIAL_PHRASES} onAllOpened={() => markDone(5)} />
            </div>
          )}

          {/* 6. 따라 말하기 (Drill, 셀프 체크 프레이밍) */}
          {step === 6 && (
            <Drill
              block={{
                type: "drill",
                instruction:
                  "Say it out loud, then tap Next. 천천히 (slowly) is perfect — no one's judging!",
                items: [
                  ...TRIAL_PHRASES,
                  {
                    ko: "천천히 말해 주세요",
                    rr: "cheoncheonhi malhae juseyo",
                    en: "Please speak slowly",
                  },
                ],
              }}
              teaching
            />
          )}

          {/* 7. 문장 만들기 퍼즐 (음절·어절) */}
          {step === 7 && (
            <TrialPuzzle
              mode="word"
              onCollect={collect}
              onComplete={() => {
                markDone(7);
                next();
              }}
            />
          )}

          {/* 8. 오늘 배운 것 — 잘했어요! + 자동 요약 */}
          {step === 8 && (
            <SummaryStep
              goal={goal !== null ? GOALS[goal] : null}
              mood={mood !== null ? MOODS[mood] : null}
              collected={collected}
            />
          )}

          {/* 9. 너의 페이지 + 예약 */}
          {step === 9 && (
            <Center>
              <h2 className="font-display text-4xl sm:text-5xl">
                You&apos;ll get a page like this
              </h2>
              {/* 학생 포털 미리보기 목업 — 차별화 포인트 시연 */}
              <div className="soft-card mx-auto mt-8 max-w-xl p-6 text-left">
                <p className="font-display text-2xl">Hi, Emma! 👋</p>
                <p className="mt-1 font-mono text-[12px] text-ink-soft">
                  1 lesson · your first phrases + puzzles
                </p>
                <div className="mt-4 rounded-xl border border-ink-faint bg-paper p-4">
                  <p className="font-mono text-[11px] tracking-[0.15em] text-accent">
                    LESSON NOTE · TODAY
                  </p>
                  <p className="mt-2 text-[15px] text-ink-soft line-through">
                    커피 하나 있어요?
                  </p>
                  <p lang="ko" className="fixed-line mt-1 w-fit text-xl font-medium">
                    커피 한 잔 주세요
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    Drinks use the counter 잔 — 한 잔 = one cup
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["안녕하세요", "감사합니다", "만나서 반가워요"].map((w) => (
                    <span
                      key={w}
                      lang="ko"
                      className="rounded-full bg-accent-wash px-3 py-1 text-[15px]"
                    >
                      {w}
                    </span>
                  ))}
                </div>
                <p className="mt-4 flex items-center gap-2 text-[14px] text-ink-soft">
                  <span aria-hidden="true">🧩</span>
                  Your puzzles wait here — replay them anytime.
                </p>
              </div>

              {/* 다음 단계 = 레벨 확인 (체험 → 레벨테스트 → 예약) */}
              <a
                href="/level-test"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-10 py-4 text-xl font-medium text-white transition-colors hover:bg-accent-strong"
              >
                <span aria-hidden="true">✨</span>
                Check my level
                <span className="font-mono text-base text-white/85">
                  내 레벨 확인하기
                </span>
                →
              </a>
              <p className="mt-4 max-w-[38ch] text-[15px] text-ink-soft">
                2-minute quiz — we&apos;ll suggest where to start.
                <span lang="ko" className="mt-0.5 block text-ink-soft">
                  2분이면 돼요. 어디서 시작하면 좋을지 알려드려요.
                </span>
              </p>
              <p lang="ko" className="mt-6 font-display text-3xl">
                또 만나요!{" "}
                <span className="font-mono text-base text-ink-soft">tto mannayo</span>
              </p>
            </Center>
          )}
        </div>
      </main>

      {/* 튜터 대본 스트립 — 기본 숨김, T 토글 (튜터 진행용) */}
      {showScript && script && (
        <aside className="shrink-0 border-t border-amber-line bg-amber-wash px-5 py-3">
          <div className="mx-auto flex max-w-4xl flex-wrap items-start gap-x-8 gap-y-1.5">
            <p className="shrink-0 font-mono text-[10px] tracking-[0.2em] text-amber">
              튜터 대본
            </p>
            <p className="min-w-52 flex-1 text-[14px] leading-snug text-ink">{script.ko}</p>
            <div className="w-full space-y-0.5 sm:w-auto sm:max-w-[46%]">
              {script.read.map((line) => (
                <p key={line} className="text-[14px] leading-snug text-amber">
                  🗣 &ldquo;{line}&rdquo;
                </p>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* 진행 버튼 */}
      <footer className="flex h-16 shrink-0 items-center justify-between border-t border-ink-faint px-5">
        <button
          type="button"
          onClick={prev}
          disabled={step === 0}
          className="min-h-11 rounded-full border border-ink-faint bg-card px-6 py-2 font-medium text-ink-soft transition-colors enabled:hover:border-accent/50 enabled:hover:text-accent disabled:opacity-40"
        >
          ← Back
        </button>
        <p className="hidden font-mono text-[11px] text-ink-soft sm:block">
          {locked ? "Try it above to continue ✨" : "← → keys · T = 대본"}
        </p>
        <button
          type="button"
          onClick={next}
          disabled={step === TOTAL - 1 || locked}
          className="min-h-11 rounded-full bg-accent px-8 py-2 font-medium text-white transition-colors enabled:hover:bg-accent-strong disabled:opacity-40"
        >
          Next →
        </button>
      </footer>
    </div>
  );
}

/* ────────────────────────────── 보조 컴포넌트 ────────────────────────────── */

function Center({ children }: { children: React.ReactNode }) {
  return <div className="text-center">{children}</div>;
}

function JamoPicker({
  options,
  picked,
  onPick,
  label,
}: {
  options: { jamo: string; rr: string }[];
  picked: number;
  onPick: (i: number) => void;
  label: string;
}) {
  return (
    <div className="text-center">
      <p className="mb-2 font-mono text-[11px] tracking-[0.15em] text-ink-soft uppercase">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o, i) => (
          <button
            key={o.jamo}
            type="button"
            onClick={() => onPick(i)}
            className={`soft-card flex min-h-16 min-w-16 flex-col items-center justify-center px-3 py-2 transition-colors ${
              picked === i ? "!border-accent bg-accent-wash/60" : "hover:border-accent/50"
            }`}
          >
            <span lang="ko" className="font-display text-3xl">
              {o.jamo}
            </span>
            <span className="font-mono text-[11px] text-ink-soft">{o.rr}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 3표현을 하나씩 직접 열어보는 활동 — 다 열면 onAllOpened로 다음을 연다 */
function RevealCards({
  phrases,
  onAllOpened,
}: {
  phrases: { ko: string; rr: string; en: string }[];
  onAllOpened: () => void;
}) {
  const [opened, setOpened] = useState<Set<number>>(() => new Set());

  // 카드를 열기 전에 세 표현의 발음을 받아둔다 — 첫 열기부터 즉시 재생
  useEffect(() => {
    for (const p of phrases) prefetchSpeak(p.ko);
  }, [phrases]);

  function open(i: number) {
    speak(phrases[i].ko);
    if (opened.has(i)) return;
    const nextSet = new Set(opened);
    nextSet.add(i);
    setOpened(nextSet);
    if (nextSet.size === phrases.length) onAllOpened();
  }

  const allOpen = opened.size === phrases.length;

  return (
    <div>
      <ul className="grid gap-4 sm:grid-cols-3">
        {phrases.map((card, i) => {
          const isOpen = opened.has(i);
          return (
            <li key={card.ko}>
              <button
                type="button"
                onClick={() => open(i)}
                aria-label={isOpen ? `${card.en}, hear again` : `Open ${card.en}`}
                className={`soft-card flex min-h-44 w-full flex-col items-center justify-center p-6 text-center transition-colors ${
                  isOpen ? "!border-accent bg-accent-wash/40" : "hover:border-accent/50"
                }`}
              >
                <span lang="ko" className="font-display text-4xl leading-snug">
                  {card.ko}
                </span>
                {isOpen ? (
                  <>
                    <span className="mt-2 font-mono text-sm text-ink-soft">{card.rr}</span>
                    <span className="mt-1 text-lg font-medium">{card.en}</span>
                    <span className="mt-2 text-[13px] text-accent">🔊 tap to hear again</span>
                  </>
                ) : (
                  <span className="mt-4 font-mono text-[12px] tracking-[0.15em] text-ink-soft uppercase">
                    Tap to open 👆
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p
        className={`mt-6 text-center text-lg transition-colors ${
          allOpen ? "text-accent" : "text-ink-soft"
        }`}
      >
        {allOpen
          ? "All open — say them out loud, then Next →"
          : `Opened ${opened.size} / ${phrases.length} — tap each card`}
      </p>
    </div>
  );
}

/** 오늘 배운 것 자동 요약 — 학생이 실제로 고르고 만든 것들을 칩으로 집계 */
function SummaryStep({
  goal,
  mood,
  collected,
}: {
  goal: { en: string; ko: string } | null;
  mood: { ko: string; rr: string; en: string; emoji: string } | null;
  collected: TrialCollected[];
}) {
  const letters = collected.filter((c) => c.kind === "letter");
  const phrases = collected.filter((c) => c.kind === "phrase");

  return (
    <Center>
      <h2 lang="ko" className="font-display text-6xl text-accent sm:text-7xl">
        잘했어요!
      </h2>
      <p className="mt-2 font-mono text-lg text-ink-soft">jalhaesseoyo</p>
      <p className="mt-3 text-2xl sm:text-3xl">Look what you made today.</p>

      <div className="mx-auto mt-8 max-w-xl space-y-5 text-left">
        {goal && (
          <SummaryRow label="Your goal" ko="목표">
            <Chip>
              {goal.en}{" "}
              <span lang="ko" className="text-ink-soft">
                {goal.ko}
              </span>
            </Chip>
          </SummaryRow>
        )}

        {mood && (
          <SummaryRow label="You said" ko="말한 기분">
            <button
              type="button"
              onClick={() => speak(mood.ko)}
              className="soft-card px-5 py-2.5 text-xl transition-transform active:scale-95"
            >
              <span aria-hidden="true">{mood.emoji}</span>{" "}
              <span lang="ko">{mood.ko}</span>{" "}
              <span aria-hidden="true">🔊</span>
            </button>
          </SummaryRow>
        )}

        {letters.length > 0 && (
          <SummaryRow label="Letters you built" ko="만든 글자">
            {letters.map((c) => (
              <button
                key={c.ko}
                type="button"
                onClick={() => speak(c.ko)}
                className="soft-card flex flex-col items-center px-5 py-2.5 transition-transform active:scale-95"
              >
                <span lang="ko" className="font-display text-3xl text-accent">
                  {c.ko}
                </span>
                <span className="text-[13px] text-ink-soft">
                  {c.en} {c.emoji}
                </span>
              </button>
            ))}
          </SummaryRow>
        )}

        {phrases.length > 0 && (
          <SummaryRow label="Sentences you built" ko="조립한 문장">
            {phrases.map((c) => (
              <button
                key={c.ko}
                type="button"
                onClick={() => speak(c.ko)}
                className="soft-card px-5 py-2.5 text-left transition-transform active:scale-95"
              >
                <span lang="ko" className="text-xl font-medium">
                  {c.ko}
                </span>
                <span className="ml-2 text-[14px] text-ink-soft">{c.en} 🔊</span>
              </button>
            ))}
          </SummaryRow>
        )}
      </div>

      <p className="mx-auto mt-8 max-w-[42ch] text-lg text-ink-soft">
        You read{" "}
        <b className="text-ink">
          {letters.length} letter{letters.length === 1 ? "" : "s"}
        </b>{" "}
        + built{" "}
        <b className="text-ink">
          {phrases.length} phrase{phrases.length === 1 ? "" : "s"}
        </b>{" "}
        in 5 minutes — imagine a month.
      </p>
    </Center>
  );
}

function SummaryRow({
  label,
  ko,
  children,
}: {
  label: string;
  ko: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 font-mono text-[11px] tracking-[0.18em] text-accent uppercase">
        {label} <span lang="ko" className="text-ink-soft">· {ko}</span>
      </p>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="soft-card px-5 py-2.5 text-xl">{children}</span>;
}
