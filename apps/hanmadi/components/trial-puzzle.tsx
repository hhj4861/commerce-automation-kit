"use client";

/**
 * 체험수업 전용 자립 퍼즐 — 수업기록 PuzzleBoard(components/lesson-puzzle.tsx)의
 * "탭해서 조립 → Check → 축하 → 힌트" 결을 그대로 따르되, 학생 데이터가 아니므로
 * PuzzleProvider·서버·localStorage 진행저장을 쓰지 않고 컴포넌트 로컬 state만 쓴다.
 *
 * 두 모드
 * - mode="jamo" : 자음/모음 칩을 [자음][모음] 슬롯에 골라 한 글자를 만든다 (나 · 소).
 * - mode="word" : 섞인 음절/어절 칩을 순서대로 조립해 짧은 문장을 만든다
 *                 (안녕하세요 · 만나서 반가워요).
 *
 * 하이드레이션 안전: 이 컴포넌트는 학생이 해당 스텝으로 넘어온 뒤(=하이드레이션 이후)에만
 * 마운트되므로 shuffle을 useState 지연초기화에서 수행해도 SSR 마크업과 충돌하지 않는다.
 * 렌더 중에는 Math.random을 절대 호출하지 않는다.
 *
 * 정답을 맞히면 onCollect로 만든 글자/문장을 부모(체험 페이지)의 "수집함"에 올리고,
 * 마지막 라운드까지 끝나면 onComplete로 다음 진행을 열어 준다. 셀프 학생이 절대
 * 막히지 않도록 힌트·Show me·Skip을 항상 제공한다.
 */

import { useEffect, useState } from "react";

/* ─────────────────────────── 한글 조합 (공용) ─────────────────────────── */

/** 자음 4종 — 체험 조합기(step)와 자모 퍼즐이 함께 쓰는 단일 출처 */
export const CHO = [
  { jamo: "ㄱ", rr: "g", idx: 0 },
  { jamo: "ㄴ", rr: "n", idx: 2 },
  { jamo: "ㅁ", rr: "m", idx: 6 },
  { jamo: "ㅅ", rr: "s", idx: 9 },
];
/** 모음 4종 */
export const JUNG = [
  { jamo: "ㅏ", rr: "a", idx: 0 },
  { jamo: "ㅗ", rr: "o", idx: 8 },
  { jamo: "ㅜ", rr: "u", idx: 13 },
  { jamo: "ㅣ", rr: "i", idx: 20 },
];

/** 유니코드 조합: 가 = 0xAC00 + (초성×21 + 중성)×28 */
export function composeSyllable(choIdx: number, jungIdx: number): string {
  return String.fromCharCode(0xac00 + (choIdx * 21 + jungIdx) * 28);
}

/**
 * 발음 듣기 — 이벤트 핸들러에서만 호출한다 (렌더 중 호출 금지). 미지원은 조용히 무시.
 *
 * Web Speech API의 두 가지 고질 문제를 함께 처리한다. 이 처리가 없으면
 * "어떤 건 소리가 나고 어떤 건 안 나는" 간헐 증상이 생긴다:
 *  1) 음성 목록이 비동기로 늦게 로드됨 → 첫 재생이 조용히 실패한다.
 *  2) Chrome은 cancel() 직후의 speak()를 간헐적으로 무시한다.
 */
let koVoice: SpeechSynthesisVoice | null = null;
let voicesPrimed = false;

/**
 * 가장 자연스러운 한국어 음성을 고른다.
 * 브라우저/OS에는 품질 낮은 캐릭터 음성(macOS의 Eddy·Grandma 등)과 좋은 음성
 * (Google 한국어, Yuna, Enhanced/Premium)이 섞여 있다. 그냥 첫 한국어 음성을
 * 잡으면 나쁜 게 걸릴 수 있어, 품질 좋은 순서로 점수를 매겨 고른다.
 */
function pickKoVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const ko = voices.filter((v) => v.lang?.toLowerCase().startsWith("ko"));
  if (ko.length === 0) return null;

  // macOS의 저품질 노벨티(캐릭터) 음성 이름 — 피한다
  const NOVELTY =
    /eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|bells|boing|bubbles|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|albert|bahh|bad news|good news/i;

  const score = (v: SpeechSynthesisVoice): number => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/google/.test(n)) s += 6; // Chrome 클라우드 음성 — 대체로 최고 품질
    if (/yuna/.test(n)) s += 5; // macOS 표준 한국어 음성
    if (/(enhanced|premium|neural|natural)/.test(n)) s += 4;
    if (/(siri|nara|sora)/.test(n)) s += 3;
    if (v.lang?.toLowerCase().replace("_", "-") === "ko-kr") s += 1;
    if (NOVELTY.test(n)) s -= 10; // 캐릭터 음성 강한 감점
    if (!v.localService) s += 1; // 원격(클라우드) 음성이 대체로 더 자연스러움
    return s;
  };

  return [...ko].sort((a, b) => score(b) - score(a))[0] ?? null;
}

function primeVoices(): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const pick = () => {
      const voices = synth.getVoices();
      if (!voices.length) return;
      koVoice = pickKoVoice(voices);
      voicesPrimed = true;
    };
    pick();
    // 아직 안 실렸으면 로드 완료 이벤트에서 다시 고른다
    if (!voicesPrimed && "addEventListener" in synth) {
      synth.addEventListener("voiceschanged", pick, { once: true });
    }
  } catch {
    /* 무시 */
  }
}

/**
 * 발음 듣기 — /api/tts(ElevenLabs mp3)를 우선 재생하고, 실패하면(오프라인·
 * 상한 초과·미설정) 아래 브라우저 Web Speech로 폴백한다. mp3는 탭 수명 동안
 * 프라미스째 캐시한다 — 같은 문구의 중복 요청이 겹쳐도 fetch는 한 번만 나간다.
 *
 * 첫 재생 지연(생성 1~2초)이 거슬리는 곳은 prefetchSpeak()으로 미리 받아둔다
 * (자모 조합기처럼 "탭 → 즉시 소리"가 기대되는 인터랙션).
 */
const mp3Cache = new Map<string, Promise<string | null>>();
let currentAudio: HTMLAudioElement | null = null;

function loadMp3(text: string): Promise<string | null> {
  let pending = mp3Cache.get(text);
  if (!pending) {
    pending = (async () => {
      try {
        const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}`);
        if (!res.ok || !res.headers.get("content-type")?.includes("audio")) {
          return null;
        }
        return URL.createObjectURL(await res.blob());
      } catch {
        return null;
      }
    })();
    mp3Cache.set(text, pending);
  }
  return pending;
}

/** 곧 재생될 문구의 mp3를 미리 받아둔다 — 재생은 하지 않는다 */
export function prefetchSpeak(text: string): void {
  void loadMp3(text);
}

export function speak(text: string): void {
  void speakViaApi(text);
}

async function speakViaApi(text: string): Promise<void> {
  try {
    currentAudio?.pause();
    window.speechSynthesis?.cancel();

    const url = await loadMp3(text);
    if (!url) return speakWithBrowserVoice(text);

    currentAudio = new Audio(url);
    await currentAudio.play();
  } catch {
    // 자동재생 차단·네트워크 오류 등 — 브라우저 음성으로라도 들려준다
    speakWithBrowserVoice(text);
  }
}

function speakWithBrowserVoice(text: string): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (!voicesPrimed) primeVoices();

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ko-KR";
    if (koVoice) utter.voice = koVoice;
    utter.rate = 0.85;

    const wasBusy = synth.speaking || synth.pending;
    synth.cancel();
    if (wasBusy) {
      // cancel 직후 speak가 Chrome에서 드롭되는 것을 피해 한 틱 미룬다
      setTimeout(() => {
        try {
          synth.speak(utter);
        } catch {
          /* 무시 */
        }
      }, 70);
    } else {
      synth.speak(utter);
    }
  } catch {
    /* 무시 — 발음 재생은 있으면 좋은 보조 기능일 뿐이다 */
  }
}

/* ────────────────────────────── 수집 타입 ────────────────────────────── */

/** 퍼즐이 맞힌 글자/문장 — 부모의 "오늘 배운 것" 요약 재료가 된다 */
export type TrialCollected = {
  kind: "letter" | "phrase";
  ko: string;
  rr: string;
  en: string;
  emoji?: string;
};

/* ────────────────────────────── 라운드 데이터 ────────────────────────────── */

type Jamo = { jamo: string; rr: string; idx: number };

type JamoRound = {
  /** 목표 발음 — 문제로 표시 (뜻/이모지는 정답 전까지 가린다) */
  targetRr: string;
  en: string;
  emoji: string;
  cho: Jamo;
  jung: Jamo;
  distractCho: Jamo;
  distractJung: Jamo;
};

type WordRound = {
  en: string;
  ko: string;
  rr: string;
  /** 정답 순서의 칩 (음절 또는 어절) */
  words: string[];
  unit: "syllable" | "word";
};

/** 퍼즐 A · 글자 만들기 (자모 → 글자) — 조합기와 같은 CHO/JUNG 재사용 */
const JAMO_ROUNDS: JamoRound[] = [
  {
    targetRr: "na",
    en: "I / me",
    emoji: "🙋",
    cho: CHO[1], // ㄴ
    jung: JUNG[0], // ㅏ
    distractCho: CHO[2], // ㅁ
    distractJung: JUNG[1], // ㅗ
  },
  {
    targetRr: "so",
    en: "cow",
    emoji: "🐄",
    cho: CHO[3], // ㅅ
    jung: JUNG[1], // ㅗ
    distractCho: CHO[1], // ㄴ
    distractJung: JUNG[0], // ㅏ
  },
];

/** 퍼즐 B · 문장 만들기 (음절/어절 → 문장) — 핵심 신규 */
const WORD_ROUNDS: WordRound[] = [
  {
    en: "Hello",
    ko: "안녕하세요",
    rr: "annyeonghaseyo",
    words: ["안", "녕", "하", "세", "요"],
    unit: "syllable",
  },
  {
    en: "Nice to meet you",
    ko: "만나서 반가워요",
    rr: "mannaseo bangawoyo",
    words: ["만나서", "반가워요"],
    unit: "word",
  },
];

/* ──────────────────────────────── 셔플 ──────────────────────────────── */

type WordChip = { word: string; idx: number };

/** 마운트 시 지연초기화에서만 호출 — 정답 순서 그대로면 한 칸 회전시켜 반드시 섞는다 */
function shuffleWords(words: string[]): WordChip[] {
  const chips = words.map((word, idx) => ({ word, idx }));
  for (let i = chips.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chips[i], chips[j]] = [chips[j], chips[i]];
  }
  if (chips.length > 1 && chips.every((c, i) => c.idx === i)) {
    return [...chips.slice(1), chips[0]];
  }
  return chips;
}

type JamoChip = {
  id: number;
  jamo: string;
  rr: string;
  /** 유니코드 초성/중성 index */
  uni: number;
  role: "cho" | "jung";
  correct: boolean;
};

function buildJamoChips(round: JamoRound): JamoChip[] {
  const chips: JamoChip[] = [
    { id: 0, jamo: round.cho.jamo, rr: round.cho.rr, uni: round.cho.idx, role: "cho", correct: true },
    { id: 1, jamo: round.distractCho.jamo, rr: round.distractCho.rr, uni: round.distractCho.idx, role: "cho", correct: false },
    { id: 2, jamo: round.jung.jamo, rr: round.jung.rr, uni: round.jung.idx, role: "jung", correct: true },
    { id: 3, jamo: round.distractJung.jamo, rr: round.distractJung.rr, uni: round.distractJung.idx, role: "jung", correct: false },
  ];
  for (let i = chips.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chips[i], chips[j]] = [chips[j], chips[i]];
  }
  return chips;
}

/* ───────────────────────────── 진입 컴포넌트 ───────────────────────────── */

export function TrialPuzzle({
  mode,
  onCollect,
  onComplete,
}: {
  mode: "jamo" | "word";
  /** 라운드를 맞힐 때마다 만든 글자/문장을 부모 수집함에 올린다 */
  onCollect: (item: TrialCollected) => void;
  /** 마지막 라운드까지 끝나면(또는 건너뛰면) 호출 — 부모가 다음 스텝을 연다 */
  onComplete: () => void;
}) {
  const total = mode === "jamo" ? JAMO_ROUNDS.length : WORD_ROUNDS.length;
  const [round, setRound] = useState(0);
  const isLast = round === total - 1;

  const advance = () => {
    if (isLast) onComplete();
    else setRound((r) => r + 1);
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* 라운드 표시 */}
      <div className="mb-4 flex items-center justify-center gap-2">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === round ? "w-8 bg-accent" : i < round ? "w-4 bg-accent/50" : "w-4 bg-ink-faint"
            }`}
          />
        ))}
        <span className="ml-1.5 font-mono text-[11px] text-ink-soft">
          {round + 1} / {total}
        </span>
      </div>

      {mode === "jamo" ? (
        <JamoBoard
          key={round}
          round={JAMO_ROUNDS[round]}
          isLast={isLast}
          onCollect={onCollect}
          onNext={advance}
          onSkip={advance}
        />
      ) : (
        <WordBoard
          key={round}
          round={WORD_ROUNDS[round]}
          isLast={isLast}
          onCollect={onCollect}
          onNext={advance}
          onSkip={advance}
        />
      )}
    </div>
  );
}

/* ────────────────────── 퍼즐 A · 글자 만들기 (자모) ────────────────────── */

function JamoBoard({
  round,
  isLast,
  onCollect,
  onNext,
  onSkip,
}: {
  round: JamoRound;
  isLast: boolean;
  onCollect: (item: TrialCollected) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const targetKo = composeSyllable(round.cho.idx, round.jung.idx);
  // 정답 발음을 미리 받아둔다 — 정답 순간 🔊이 즉시 울리도록
  useEffect(() => prefetchSpeak(targetKo), [targetKo]);
  // 학생이 이 스텝으로 넘어온 뒤에만 마운트되므로 지연초기화 셔플이 SSR과 충돌하지 않는다
  const [tray, setTray] = useState<JamoChip[]>(() => buildJamoChips(round));
  const [choSlot, setChoSlot] = useState<JamoChip | null>(null);
  const [jungSlot, setJungSlot] = useState<JamoChip | null>(null);
  const [wrong, setWrong] = useState(false);
  const [solved, setSolved] = useState(false);
  const [hintId, setHintId] = useState<number | null>(null);

  const preview =
    choSlot && jungSlot ? composeSyllable(choSlot.uni, jungSlot.uni) : null;

  function place(chip: JamoChip) {
    if (solved) return;
    if (chip.role === "cho" && choSlot) return;
    if (chip.role === "jung" && jungSlot) return;

    const nextCho = chip.role === "cho" ? chip : choSlot;
    const nextJung = chip.role === "jung" ? chip : jungSlot;

    setTray((prev) => prev.filter((c) => c.id !== chip.id));
    if (chip.role === "cho") setChoSlot(chip);
    else setJungSlot(chip);
    setHintId(null);

    // 두 칸이 다 차면 그 자리에서 판정한다
    if (nextCho && nextJung) {
      if (nextCho.correct && nextJung.correct) {
        setSolved(true);
        setWrong(false);
        onCollect({
          kind: "letter",
          ko: targetKo,
          rr: round.targetRr,
          en: round.en,
          emoji: round.emoji,
        });
      } else {
        setWrong(true);
      }
    }
  }

  function removeSlot(role: "cho" | "jung") {
    if (solved) return;
    const chip = role === "cho" ? choSlot : jungSlot;
    if (!chip) return;
    setTray((prev) => [...prev, chip]);
    if (role === "cho") setChoSlot(null);
    else setJungSlot(null);
    setWrong(false);
    setHintId(null);
  }

  function showHint() {
    if (!choSlot) {
      const c = tray.find((t) => t.role === "cho" && t.correct);
      if (c) setHintId(c.id);
    } else if (!jungSlot) {
      const c = tray.find((t) => t.role === "jung" && t.correct);
      if (c) setHintId(c.id);
    }
  }

  return (
    <div>
      {/* 문제 */}
      <p className="text-center text-[15px] text-ink-soft">Make this sound</p>
      <div className="mt-1 flex items-center justify-center gap-3">
        <p className="font-mono text-4xl font-medium text-accent">{round.targetRr}</p>
        <button
          type="button"
          onClick={() => speak(targetKo)}
          aria-label="Hear the sound"
          className="flex size-11 items-center justify-center rounded-full border border-ink-faint text-xl text-ink-soft transition-colors hover:border-accent hover:text-accent"
        >
          🔊
        </button>
      </div>

      {/* 조립존 — [자음][모음] 슬롯 + 실시간 미리보기 */}
      <div
        className={`mt-6 flex items-stretch justify-center gap-2 rounded-2xl border-2 border-dashed p-3 transition-colors sm:gap-3 sm:p-4 ${
          solved
            ? "border-good/60 bg-good-wash/60"
            : wrong
              ? "border-accent bg-accent-wash/40"
              : "border-ink-faint bg-card"
        }`}
      >
        <Slot label="consonant" chip={choSlot} onClear={() => removeSlot("cho")} disabled={solved} />
        <span className="flex items-center font-display text-2xl text-ink-soft sm:text-3xl">+</span>
        <Slot label="vowel" chip={jungSlot} onClear={() => removeSlot("jung")} disabled={solved} />
        <span className="flex items-center font-display text-2xl text-ink-soft sm:text-3xl">=</span>
        <div className="flex min-w-16 flex-col items-center justify-center rounded-xl bg-paper px-3 py-2 sm:min-w-24 sm:px-4">
          {solved ? (
            <span lang="ko" className="animate-bounce font-display text-4xl text-accent sm:text-6xl">
              {targetKo}
            </span>
          ) : preview ? (
            <span lang="ko" className="font-display text-4xl sm:text-6xl">
              {preview}
            </span>
          ) : (
            <span className="font-display text-4xl text-ink-faint sm:text-5xl">?</span>
          )}
        </div>
      </div>

      {/* 남은 칩 */}
      {!solved && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {tray.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => place(chip)}
              className={`flex min-h-16 min-w-16 flex-col items-center justify-center rounded-2xl border bg-card px-4 py-2 transition-transform active:scale-95 ${
                hintId === chip.id
                  ? "border-accent ring-2 ring-accent/50"
                  : "border-ink-faint hover:border-accent/50"
              }`}
            >
              <span lang="ko" className="font-display text-4xl">
                {chip.jamo}
              </span>
              <span className="font-mono text-[11px] text-ink-soft">{chip.rr}</span>
            </button>
          ))}
        </div>
      )}

      {/* 판정 / 정답 공개 */}
      {solved ? (
        <div className="mt-6 rounded-2xl border border-good/40 bg-good-wash/50 p-5 text-center">
          <p className="text-[17px] font-medium text-good">
            <span className="mr-1.5 inline-block" aria-hidden="true">
              🎉
            </span>
            You built a letter!
          </p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => speak(targetKo)}
              lang="ko"
              className="font-display text-6xl text-accent transition-transform active:scale-95"
              aria-label={`Hear ${round.targetRr}`}
            >
              {targetKo}
            </button>
          </div>
          <p className="mt-2 font-mono text-[14px] text-ink-soft">{round.targetRr}</p>
          <p className="mt-1 text-[17px]">
            {round.en} <span aria-hidden="true">{round.emoji}</span>
          </p>
          <button
            type="button"
            onClick={onNext}
            className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[17px] font-medium text-white transition-transform hover:bg-accent-strong active:scale-[0.98]"
          >
            {isLast ? "Done · 완성!" : "Next letter"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : (
        <div className="mt-6">
          {wrong && (
            <p className="mb-3 text-center text-[15px] text-accent">
              Almost! Tap a piece to send it back.{" "}
              <span lang="ko" className="text-ink-soft">
                조각을 눌러 빼요.
              </span>
            </p>
          )}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <SmallButton onClick={showHint}>Hint 힌트 💡</SmallButton>
            <SmallButton onClick={onSkip}>Skip 건너뛰기 →</SmallButton>
          </div>
        </div>
      )}
    </div>
  );
}

function Slot({
  label,
  chip,
  onClear,
  disabled,
}: {
  label: string;
  chip: JamoChip | null;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="mb-1.5 font-mono text-[10px] tracking-[0.12em] text-ink-soft uppercase">
        {label}
      </span>
      <button
        type="button"
        onClick={onClear}
        disabled={disabled || !chip}
        aria-label={chip ? `Remove ${chip.rr}` : `Empty ${label} slot`}
        className={`flex size-14 items-center justify-center rounded-xl border-2 transition-colors sm:size-16 ${
          chip
            ? "border-accent/50 bg-paper"
            : "border-dashed border-ink-faint bg-paper/50"
        } ${disabled ? "" : chip ? "hover:border-accent" : ""}`}
      >
        {chip ? (
          <span lang="ko" className="font-display text-4xl">
            {chip.jamo}
          </span>
        ) : (
          <span className="font-display text-2xl text-ink-faint">·</span>
        )}
      </button>
    </div>
  );
}

/* ─────────────────── 퍼즐 B · 문장 만들기 (음절/어절) ─────────────────── */

function WordBoard({
  round,
  isLast,
  onCollect,
  onNext,
  onSkip,
}: {
  round: WordRound;
  isLast: boolean;
  onCollect: (item: TrialCollected) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  // 정답 문장 발음을 미리 받아둔다 — 정답 순간 🔊이 즉시 울리도록
  useEffect(() => prefetchSpeak(round.ko), [round.ko]);
  const [pool, setPool] = useState<WordChip[]>(() => shuffleWords(round.words));
  const [picked, setPicked] = useState<WordChip[]>([]);
  const [wrong, setWrong] = useState(false);
  const [wrongCount, setWrongCount] = useState(0);
  const [solved, setSolved] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState<number | null>(null);

  const complete = pool.length === 0;
  const unitLabel = round.unit === "syllable" ? "syllables" : "words";

  function pick(chip: WordChip) {
    if (solved) return;
    setPool((prev) => prev.filter((c) => c.idx !== chip.idx));
    setPicked((prev) => [...prev, chip]);
    setWrong(false);
    setHint(null);
  }

  function unpick(chip: WordChip) {
    if (solved) return;
    setPicked((prev) => prev.filter((c) => c.idx !== chip.idx));
    setPool((prev) => [...prev, chip]);
    setWrong(false);
    setHint(null);
  }

  function win() {
    setSolved(true);
    setWrong(false);
    onCollect({ kind: "phrase", ko: round.ko, rr: round.rr, en: round.en });
  }

  function check() {
    if (picked.every((c, i) => c.idx === i)) {
      win();
    } else {
      setWrong(true);
      setWrongCount((n) => n + 1);
    }
  }

  function clearBoard() {
    setPool(shuffleWords(round.words));
    setPicked([]);
    setWrong(false);
    setHint(null);
  }

  /** 지금까지 맞게 놓인 앞부분 다음에 와야 할 칩 */
  function showHint() {
    const firstWrong = picked.findIndex((c, i) => c.idx !== i);
    const nextIdx = firstWrong === -1 ? picked.length : firstWrong;
    setHint(Math.min(nextIdx, round.words.length - 1));
  }

  /** 2회 이상 틀리면 — 정답을 채워 보여주고도 계속 진행 (셀프 학생이 막히지 않게) */
  function showMe() {
    setPool([]);
    setPicked(round.words.map((word, idx) => ({ word, idx })));
    setRevealed(true);
    win();
  }

  return (
    <div>
      {/* 문제 */}
      <p className="text-center text-[15px] text-ink-soft">
        Build this — tap the {unitLabel} in order
      </p>
      <p className="mt-1 text-center font-display text-2xl leading-snug sm:text-3xl">
        &ldquo;{round.en}&rdquo;
      </p>

      {/* 조립존 */}
      <div
        className={`mt-5 flex min-h-20 flex-wrap content-start items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-3 transition-colors ${
          solved
            ? "border-good/60 bg-good-wash/60"
            : wrong
              ? "border-accent bg-accent-wash/40"
              : "border-ink-faint bg-card"
        }`}
      >
        {picked.length === 0 && (
          <span className="px-1 text-[15px] text-ink-soft">
            Tap the pieces below…{" "}
            <span lang="ko">아래 조각을 눌러요</span>
          </span>
        )}
        {picked.map((chip) => (
          <button
            key={chip.idx}
            type="button"
            onClick={() => unpick(chip)}
            disabled={solved}
            lang="ko"
            className="min-h-11 rounded-xl bg-paper px-3.5 py-1.5 font-display text-2xl shadow-sm transition-transform active:scale-95 disabled:opacity-100"
          >
            {chip.word}
          </button>
        ))}
      </div>

      {/* 남은 칩 */}
      {!solved && (
        <div className="mt-4 flex flex-wrap justify-center gap-2.5">
          {pool.map((chip) => (
            <button
              key={chip.idx}
              type="button"
              onClick={() => pick(chip)}
              lang="ko"
              className={`min-h-12 rounded-full border bg-card px-4 py-1.5 font-display text-2xl transition-transform active:scale-95 ${
                hint === chip.idx
                  ? "border-accent ring-2 ring-accent/50"
                  : "border-ink-faint hover:border-accent/50"
              }`}
            >
              {chip.word}
            </button>
          ))}
        </div>
      )}

      {/* 힌트 */}
      {!solved && hint !== null && (
        <p className="mt-3 rounded-xl bg-accent-wash/60 px-3.5 py-2 text-center text-[15px]">
          <span className="font-mono text-[11px] tracking-[0.1em] text-accent uppercase">
            Hint ·{" "}
          </span>
          Next piece is{" "}
          <span lang="ko" className="text-xl font-medium">
            {round.words[hint]}
          </span>
        </p>
      )}

      {/* 판정 / 정답 공개 */}
      {solved ? (
        <div className="mt-6 rounded-2xl border border-good/40 bg-good-wash/50 p-5 text-center">
          <p className="text-[17px] font-medium text-good">
            <span className="mr-1.5 inline-block" aria-hidden="true">
              🎉
            </span>
            {revealed ? "Here it is — say it with me!" : "Perfect! 완벽해요!"}
          </p>
          <button
            type="button"
            onClick={() => speak(round.ko)}
            lang="ko"
            className="mt-3 font-display text-4xl leading-snug text-accent transition-transform active:scale-95 sm:text-5xl"
            aria-label={`Hear ${round.en}`}
          >
            {round.ko}
          </button>
          <p className="mt-2 font-mono text-[14px] text-ink-soft">{round.rr}</p>
          <p className="mt-1 text-[16px]">{round.en}</p>
          <button
            type="button"
            onClick={onNext}
            className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[17px] font-medium text-white transition-transform hover:bg-accent-strong active:scale-[0.98]"
          >
            {isLast ? "Done · 완성!" : "Next sentence"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : (
        <div className="mt-6">
          {wrong && (
            <p className="mb-3 text-center text-[15px] text-accent">
              Not quite — tap a piece to move it back.{" "}
              <span lang="ko" className="text-ink-soft">
                조각을 눌러 다시 놓아요.
              </span>
            </p>
          )}
          <button
            type="button"
            onClick={check}
            disabled={!complete}
            className="flex min-h-13 w-full items-center justify-center rounded-full bg-accent px-6 text-[17px] font-medium text-white transition-colors hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-35"
          >
            Check ✓
          </button>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <SmallButton onClick={showHint}>Hint 힌트 💡</SmallButton>
            <SmallButton onClick={clearBoard} disabled={picked.length === 0}>
              Clear 다시
            </SmallButton>
            {wrongCount >= 2 ? (
              <SmallButton onClick={showMe}>Show me 정답 보기</SmallButton>
            ) : (
              <SmallButton onClick={onSkip}>Skip 건너뛰기 →</SmallButton>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── 공용 ─────────────────────────────── */

function SmallButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 rounded-full border border-ink-faint px-4 text-[14px] text-ink-soft transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-40"
    >
      {children}
    </button>
  );
}
