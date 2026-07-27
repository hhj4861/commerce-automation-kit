"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { LessonPuzzle } from "@/data/types";
import type { PuzzleGroup } from "@/lib/puzzles";
import { prefetchSpeak } from "@/components/speak";
import { SpeakableKo } from "@/components/speak-button";

/**
 * 학생 포털(/s/[slug])의 복습 퍼즐 엔진.
 *
 * 구성
 * - PuzzleProvider      : 퍼즐 전체 목록 + 푼 기록(localStorage↔서버) + 덱 플레이어를 관리한다.
 *                         서버 컴포넌트가 만든 children을 그대로 감싸므로 페이지는 서버 렌더 유지.
 * - PuzzleHero          : "오늘의 복습" 진입점 + 진행률 바 + 연속 학습 뱃지.
 * - LessonPuzzleButton  : 수업 카드마다 붙는 "이 수업 퍼즐 풀기" 버튼.
 * - DeckPlayer/Board    : 어절 칩을 조립하는 실제 플레이 화면 (한 판 → 다음 판 연속 플레이).
 *
 * 진행 기록 저장 (localStorage = 즉시, 서버(Redis) = 백그라운드)
 * - localStorage가 항상 1차 저장소다. 오프라인이든 서버가 죽었든 게임은 절대 멈추지 않는다.
 * - 마운트 직후 GET /api/progress 로 서버 기록을 받아 로컬과 병합한다 (같은 퍼즐은 이른 시각 유지).
 *   병합 후 "서버가 아직 모르는 로컬 기록"만 골라 업로드 대기열에 넣는다.
 * - 퍼즐을 풀면 로컬에 즉시 쓰고, 새 항목만 모아 1.2초 디바운스로 POST 한다.
 *   응답의 병합 결과로 다시 로컬을 갱신하므로 다른 기기에서 푼 기록도 따라온다.
 * - 네트워크 실패는 조용히 삼킨다. 대기열은 남겨 두고 몇 번 재시도한 뒤,
 *   다음 퍼즐을 풀거나 온라인으로 돌아오면 다시 올린다.
 *
 * 하이드레이션 안전
 * - localStorage/서버는 마운트 이후에만 읽는다 (hydrated 플래그로 표시 전환).
 * - 셔플은 덱이 열린 뒤(클릭 이후)에만 생성되는 서브트리에서 수행되므로 SSR과 무관하다.
 */

/* ────────────────────────────── 타입 ────────────────────────────── */

type DeckItem = {
  /** 진행 저장 키 — 학생 slug 네임스페이스 안에서 유일 */
  key: string;
  puzzle: LessonPuzzle;
  lessonId: string;
  topic: string;
  date: string;
};

type Deck = {
  title: string;
  subtitle: string;
  items: DeckItem[];
};

/** puzzleId → 푼 시각(epoch ms) */
type SolvedMap = Record<string, number>;

/* ──────────────────────────── 저장소 ──────────────────────────── */

const STORAGE_PREFIX = "hanmadi-puzzle:";

function storageKey(slug: string): string {
  return `${STORAGE_PREFIX}${slug}`;
}

/** 어디서 왔든(로컬 JSON·서버 응답) 신뢰할 수 있는 형태로 정규화한다 */
function sanitizeMap(value: unknown): SolvedMap {
  if (!value || typeof value !== "object") return {};
  const out: SolvedMap = {};
  for (const [key, at] of Object.entries(value as Record<string, unknown>)) {
    const ts = typeof at === "number" ? at : Number(at);
    if (Number.isFinite(ts) && ts > 0) out[key] = ts;
  }
  return out;
}

/** 같은 퍼즐은 "처음 푼 시각"을 남긴다 — 서버 mergeProgress와 같은 규칙 */
function mergeMaps(base: SolvedMap, incoming: SolvedMap): SolvedMap {
  const out: SolvedMap = { ...base };
  for (const [key, at] of Object.entries(incoming)) {
    const existing = out[key];
    out[key] = existing ? Math.min(existing, at) : at;
  }
  return out;
}

function sameMap(a: SolvedMap, b: SolvedMap): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

function loadSolved(slug: string): SolvedMap {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    return raw ? sanitizeMap(JSON.parse(raw)) : {};
  } catch {
    /* 저장소를 못 읽어도 퍼즐은 그대로 풀 수 있다 */
    return {};
  }
}

function saveSolved(slug: string, map: SolvedMap): void {
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(map));
  } catch {
    /* 무시 — 진행 저장 실패가 플레이를 막지는 않는다 */
  }
}

/* ─────────────────────────── 연속 학습 계산 ─────────────────────────── */

function dayStamp(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 오늘(또는 어제)부터 거꾸로 이어진 학습일 수 */
function streakDays(map: SolvedMap): number {
  const days = new Set(Object.values(map).map(dayStamp));
  if (days.size === 0) return 0;

  const cursor = startOfToday();
  if (!days.has(dayStamp(cursor.getTime()))) {
    // 오늘 아직 안 풀었으면 어제까지의 연속을 보여준다
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayStamp(cursor.getTime()))) return 0;
  }

  let count = 0;
  while (days.has(dayStamp(cursor.getTime()))) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

/* ────────────────────────── 진행 상태 스토어 ────────────────────────── */

/**
 * localStorage는 React 바깥의 저장소이므로 useSyncExternalStore로 읽는다.
 * - 서버/하이드레이션 시점에는 EMPTY_PROGRESS → 마크업 불일치 없음
 * - 하이드레이션이 끝나면 React가 클라이언트 스냅샷으로 자동 전환한다
 * 스냅샷은 slug별로 캐시해 렌더마다 같은 참조를 돌려준다 (무한 렌더 방지).
 */

type Progress = {
  solved: SolvedMap;
  /** 오늘 푼 퍼즐 키 — 렌더 중 시계를 읽지 않으려고 스냅샷 시점에 계산해 둔다 */
  todayKeys: ReadonlySet<string>;
  /** 연속 학습 일수 */
  streak: number;
};

const EMPTY_PROGRESS: Progress = {
  solved: {},
  todayKeys: new Set<string>(),
  streak: 0,
};

function buildProgress(solved: SolvedMap): Progress {
  const today = dayStamp(Date.now());
  const todayKeys = new Set<string>();
  for (const [key, at] of Object.entries(solved)) {
    if (dayStamp(at) === today) todayKeys.add(key);
  }
  return { solved, todayKeys, streak: streakDays(solved) };
}

const progressCache = new Map<string, Progress>();
const progressListeners = new Set<() => void>();

function readProgress(slug: string): Progress {
  const cached = progressCache.get(slug);
  if (cached) return cached;
  const progress = buildProgress(loadSolved(slug));
  progressCache.set(slug, progress);
  return progress;
}

function serverProgress(): Progress {
  return EMPTY_PROGRESS;
}

/** subscribe는 참조가 안정적이어야 하므로 모듈 스코프에 둔다 */
function subscribeProgress(listener: () => void): () => void {
  progressListeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    // 다른 탭에서 퍼즐을 풀었을 때도 진행률을 맞춰 준다
    if (event.key?.startsWith(STORAGE_PREFIX)) {
      progressCache.delete(event.key.slice(STORAGE_PREFIX.length));
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    progressListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function notify(): void {
  for (const listener of progressListeners) listener();
}

/** 로컬 기록을 통째로 교체한다 (이미 병합된 결과를 받는다) */
function commitSolved(slug: string, next: SolvedMap): void {
  saveSolved(slug, next);
  progressCache.set(slug, buildProgress(next));
  notify();
}

function recordSolved(slug: string, key: string): void {
  const current = readProgress(slug);
  if (current.solved[key]) return;
  commitSolved(slug, { ...current.solved, [key]: Date.now() });
  queueUpload(slug, key);
}

/* ────────────────────────── 서버 동기화 ────────────────────────── */

/**
 * 로컬이 1차, 서버는 백업 겸 기기 간 다리 역할이다.
 * 실패는 전부 조용히 삼킨다 — 진행 저장이 안 된다고 게임이 멈추면 안 된다.
 */

/** 표시용 동기화 상태 — "idle"은 아무 것도 그리지 않는다 */
type SyncStatus = "idle" | "saving" | "saved" | "offline";

type SyncState = {
  /** 서버에 아직 못 보낸 퍼즐 키 */
  pending: Set<string>;
  /** 서버에 더 보낼 필요가 없는 키 (이미 있거나, 서버가 받지 않은 것) */
  known: Set<string>;
  /** 디바운스/재시도 타이머 */
  timer: ReturnType<typeof setTimeout> | null;
  /** "저장됨" 뱃지를 지우는 타이머 */
  fade: ReturnType<typeof setTimeout> | null;
  pushing: boolean;
  pulling: boolean;
  failures: number;
  status: SyncStatus;
};

/** 연속으로 푸는 동안 요청을 한 번으로 묶는다 */
const UPLOAD_DEBOUNCE_MS = 1200;
/** 한 요청에 담을 최대 항목 수 — 라우트의 MAX_INCOMING(500)보다 작게 */
const UPLOAD_BATCH = 400;
/** 실패 후 재시도 간격 (failures배로 늘어난다) */
const RETRY_BASE_MS = 4000;
/** 이 횟수까지만 자동 재시도 — 이후엔 다음 이벤트(풀기·온라인 복귀)를 기다린다 */
const MAX_RETRIES = 4;
/** "저장됨" 표시 유지 시간 */
const SAVED_BADGE_MS = 2400;

const syncStates = new Map<string, SyncState>();

function syncState(slug: string): SyncState {
  const existing = syncStates.get(slug);
  if (existing) return existing;
  const created: SyncState = {
    pending: new Set(),
    known: new Set(),
    timer: null,
    fade: null,
    pushing: false,
    pulling: false,
    failures: 0,
    status: "idle",
  };
  syncStates.set(slug, created);
  return created;
}

function readSyncStatus(slug: string): SyncStatus {
  return syncStates.get(slug)?.status ?? "idle";
}

function serverSyncStatus(): SyncStatus {
  return "idle";
}

function setStatus(slug: string, status: SyncStatus): void {
  const state = syncState(slug);
  if (state.status === status) return;
  state.status = status;
  notify();
}

function fadeSavedBadge(slug: string): void {
  const state = syncState(slug);
  if (state.fade) clearTimeout(state.fade);
  state.fade = setTimeout(() => {
    state.fade = null;
    if (state.status === "saved") setStatus(slug, "idle");
  }, SAVED_BADGE_MS);
}

/**
 * 응답에서 진행 기록만 꺼낸다. JSON이 아니면(예: 로그인 리다이렉트로 받은 HTML)
 * null을 돌려 "서버 없음"과 똑같이 취급한다 — 잘못된 값으로 로컬을 덮지 않는다.
 */
async function readSolvedResponse(res: Response): Promise<SolvedMap | null> {
  if (!res.ok || res.redirected) return null;
  if (!res.headers.get("content-type")?.includes("application/json")) return null;
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    solved?: unknown;
  } | null;
  return body?.ok ? sanitizeMap(body.solved) : null;
}

/** 서버가 돌려준 병합 결과를 로컬에 반영한다 (다른 기기 기록이 여기서 합류한다) */
function applyRemote(slug: string, remote: SolvedMap): void {
  const state = syncState(slug);
  for (const key of Object.keys(remote)) {
    state.known.add(key);
    state.pending.delete(key);
  }
  const current = readProgress(slug).solved;
  const merged = mergeMaps(current, remote);
  if (!sameMap(current, merged)) commitSolved(slug, merged);
}

function scheduleUpload(slug: string, delay = UPLOAD_DEBOUNCE_MS): void {
  const state = syncState(slug);
  if (state.timer !== null) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    void uploadPending(slug);
  }, delay);
}

function queueUpload(slug: string, key: string): void {
  const state = syncState(slug);
  if (state.known.has(key)) return;
  state.pending.add(key);
  state.failures = 0; // 새로 풀었으니 다시 시도해 볼 가치가 있다
  scheduleUpload(slug);
}

/** 대기열에 쌓인 항목만 한 번에 올린다 (전량 전송하지 않는다) */
async function uploadPending(slug: string): Promise<void> {
  const state = syncState(slug);
  if (state.pushing) {
    scheduleUpload(slug);
    return;
  }

  const solved = readProgress(slug).solved;
  const payload: SolvedMap = {};
  for (const key of state.pending) {
    if (Object.keys(payload).length >= UPLOAD_BATCH) break;
    const at = solved[key];
    if (typeof at === "number") payload[key] = at;
    else state.pending.delete(key); // 로컬에서 사라진 항목은 보낼 필요가 없다
  }
  const sent = Object.keys(payload);
  if (sent.length === 0) return;

  state.pushing = true;
  setStatus(slug, "saving");
  try {
    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, solved: payload }),
      cache: "no-store",
      // 탭을 닫는 중에도 마지막 전송이 끝까지 나가도록
      keepalive: true,
    });
    const merged = await readSolvedResponse(res);
    if (!merged) throw new Error("no progress payload");

    state.failures = 0;
    // 응답(= 서버의 병합 결과)에 들어 있는 키만 "확실히 저장됨"으로 친다
    applyRemote(slug, merged);
    const stuck = sent.filter((key) => !state.known.has(key));
    if (stuck.length === sent.length) {
      // 서버가 한 건도 받아 주지 않았다(상한 초과 등) — 더 조르지 않는다
      for (const key of stuck) {
        state.pending.delete(key);
        state.known.add(key);
      }
    }
    setStatus(slug, "saved");
    fadeSavedBadge(slug);
    // 남은 배치가 있으면 이어서 올린다
    if (state.pending.size > 0) scheduleUpload(slug);
  } catch {
    // 조용히 실패 — 대기열은 그대로 두고 잠시 뒤 다시 시도한다
    state.failures += 1;
    setStatus(slug, "offline");
    if (state.failures <= MAX_RETRIES) {
      scheduleUpload(slug, RETRY_BASE_MS * state.failures);
    }
  } finally {
    state.pushing = false;
  }
}

/** 대기 중인 전송을 지금 바로 (탭을 닫거나 숨길 때) */
function flushNow(slug: string): void {
  const state = syncState(slug);
  if (state.pending.size === 0) return;
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  void uploadPending(slug);
}

/** 마운트 직후 1회 — 서버 기록을 받아 로컬과 병합하고, 서버가 모르는 기록을 올린다 */
async function pullFromServer(slug: string): Promise<void> {
  const state = syncState(slug);
  if (state.pulling) return;
  state.pulling = true;
  try {
    const res = await fetch(`/api/progress?slug=${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    const remote = await readSolvedResponse(res);
    if (!remote) throw new Error("no progress payload");

    applyRemote(slug, remote);

    // 지난 방문에 오프라인으로 풀어 둔 기록이 있으면 이제 올린다
    const local = readProgress(slug).solved;
    for (const key of Object.keys(local)) {
      if (!state.known.has(key)) state.pending.add(key);
    }
    if (state.pending.size > 0) scheduleUpload(slug);
  } catch {
    /* 서버가 없어도 로컬 기록으로 그대로 논다 */
  } finally {
    state.pulling = false;
  }
}

/** 하이드레이션 완료 여부 — 완료 전에는 진행률 숫자를 감춘다 */
const neverChanges = () => () => {};

function useHydrated(): boolean {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

/* ──────────────────────────── 컨텍스트 ──────────────────────────── */

type PuzzleContextValue = {
  /** localStorage 복원이 끝났는지 — 끝나기 전에는 진행률 숫자를 감춘다 */
  hydrated: boolean;
  /** 서버 저장 상태 — 아주 작게만 표시한다 */
  syncStatus: SyncStatus;
  total: number;
  solvedCount: number;
  remaining: number;
  solvedToday: number;
  streak: number;
  lessonProgress: (lessonId: string) => { total: number; solved: number };
  startReview: () => void;
  startLesson: (lessonId: string) => void;
};

const PuzzleContext = createContext<PuzzleContextValue | null>(null);

function usePuzzleContext(): PuzzleContextValue {
  const ctx = useContext(PuzzleContext);
  if (!ctx) throw new Error("PuzzleProvider 안에서만 쓸 수 있어요.");
  return ctx;
}

/* ──────────────────────────── Provider ──────────────────────────── */

export function PuzzleProvider({
  slug,
  groups,
  children,
}: {
  /** 학생 slug — 진행 저장 네임스페이스 */
  slug: string;
  /** lib/puzzles.ts가 수업 기록에서 자동 생성한 퍼즐 그룹 (최신 수업 순) */
  groups: PuzzleGroup[];
  children: React.ReactNode;
}) {
  const progress = useSyncExternalStore(
    subscribeProgress,
    () => readProgress(slug),
    serverProgress,
  );
  const syncStatus = useSyncExternalStore(
    subscribeProgress,
    () => readSyncStatus(slug),
    serverSyncStatus,
  );
  const hydrated = useHydrated();
  const [deck, setDeck] = useState<Deck | null>(null);

  const items = useMemo<DeckItem[]>(
    () =>
      groups.flatMap((group) =>
        group.puzzles.map((puzzle, i) => ({
          key: puzzle.id ?? `${group.lessonId}:${i}`,
          puzzle,
          lessonId: group.lessonId,
          topic: group.topic,
          date: group.date,
        })),
      ),
    [groups],
  );

  const markSolved = useCallback(
    (key: string) => {
      recordSolved(slug, key);
    },
    [slug],
  );

  const startReview = useCallback(() => {
    const unsolved = items.filter((item) => !progress.solved[item.key]);
    const list = unsolved.length > 0 ? unsolved : items;
    if (list.length === 0) return;
    setDeck({
      title: unsolved.length > 0 ? "Today's review" : "Play them all again",
      subtitle: unsolved.length > 0 ? "오늘의 복습" : "전체 다시 풀기",
      items: list,
    });
  }, [items, progress]);

  const startLesson = useCallback(
    (lessonId: string) => {
      const list = items.filter((item) => item.lessonId === lessonId);
      if (list.length === 0) return;
      setDeck({ title: list[0].topic, subtitle: list[0].date, items: list });
    },
    [items],
  );

  const lessonProgress = useCallback(
    (lessonId: string) => {
      const list = items.filter((item) => item.lessonId === lessonId);
      return {
        total: list.length,
        solved: list.filter((item) => Boolean(progress.solved[item.key])).length,
      };
    },
    [items, progress],
  );

  // 서버 기록 동기화 — 마운트 후 한 번 받아오고, 떠날 때 남은 것을 흘려보낸다
  useEffect(() => {
    void pullFromServer(slug);

    const onHidden = () => {
      if (document.visibilityState === "hidden") flushNow(slug);
    };
    const onLeave = () => flushNow(slug);
    const onOnline = () => {
      // 실패 카운트를 풀어 주고 곧바로 재시도
      syncState(slug).failures = 0;
      flushNow(slug);
    };

    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onLeave);
      window.removeEventListener("online", onOnline);
      flushNow(slug);
    };
  }, [slug]);

  // 덱이 열려 있는 동안 뒤 페이지 스크롤 잠금 + ESC로 닫기
  useEffect(() => {
    if (!deck) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDeck(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [deck]);

  const solvedCount = items.filter((item) =>
    Boolean(progress.solved[item.key]),
  ).length;
  const solvedToday = items.filter((item) =>
    progress.todayKeys.has(item.key),
  ).length;

  const value: PuzzleContextValue = {
    hydrated,
    syncStatus,
    total: items.length,
    solvedCount,
    remaining: items.length - solvedCount,
    solvedToday,
    streak: progress.streak,
    lessonProgress,
    startReview,
    startLesson,
  };

  return (
    <PuzzleContext.Provider value={value}>
      {children}
      {deck && (
        <DeckPlayer
          deck={deck}
          isSolved={(key) => Boolean(progress.solved[key])}
          onSolved={markSolved}
          onClose={() => setDeck(null)}
        />
      )}
    </PuzzleContext.Provider>
  );
}

/* ─────────────────────────────── 히어로 ─────────────────────────────── */

/** 포털 최상단 — 퍼즐이 첫 화면의 주인공 */
export function PuzzleHero() {
  const {
    hydrated,
    syncStatus,
    total,
    solvedCount,
    remaining,
    solvedToday,
    streak,
    startReview,
  } = usePuzzleContext();

  if (total === 0) {
    return (
      <section className="mt-4 rounded-2xl border border-dashed border-accent/40 bg-accent-wash/30 p-6 text-center">
        <p className="text-3xl" aria-hidden="true">
          🧩
        </p>
        <p className="mt-2 text-[17px] font-medium">
          Your puzzles appear here after your first lesson.
        </p>
        <p lang="ko" className="mt-1 text-[15px] text-ink-soft">
          첫 수업이 끝나면 복습 퍼즐이 만들어져요.
        </p>
      </section>
    );
  }

  const percent = Math.round((solvedCount / total) * 100);
  const allDone = hydrated && remaining === 0;

  return (
    <section className="mt-4 overflow-hidden rounded-2xl border border-accent/30 bg-accent-wash/50">
      <div className="p-6 sm:p-7">
        <p className="font-mono text-[11px] tracking-[0.18em] text-accent uppercase">
          Today&rsquo;s review · 오늘의 복습
        </p>

        <p className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
          {!hydrated
            ? `${total} puzzles from your lessons`
            : allDone
              ? "All caught up! 🎉"
              : `${remaining} puzzle${remaining === 1 ? "" : "s"} waiting`}
        </p>
        <p lang="ko" className="mt-1 text-[15px] text-ink-soft">
          {allDone
            ? "다 풀었어요! 한 번 더 복습해 볼까요?"
            : "배운 문장을 어절 칩으로 다시 만들어 보세요."}
        </p>

        {/* 진행률 — 하이드레이션 전에는 숫자를 감춘다 */}
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-[12px] tracking-[0.08em] text-ink-soft">
              {hydrated ? `${solvedCount} / ${total} solved` : `${total} puzzles`}
            </span>
            <span className="font-mono text-[12px] text-accent">
              {hydrated ? `${percent}%` : ""}
            </span>
          </div>
          <div
            className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-white/70 dark:bg-white/10"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={hydrated ? solvedCount : 0}
            aria-label="Puzzle progress"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
              style={{ width: `${hydrated ? percent : 0}%` }}
            />
          </div>
          {/* 자리는 항상 잡아 둔다 — 상태가 바뀔 때 아래가 밀리지 않도록 */}
          <SyncBadge status={hydrated ? syncStatus : "idle"} />
        </div>

        {/* 가벼운 동기 요소 */}
        {hydrated && (streak > 0 || solvedToday > 0) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {streak > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 font-mono text-[12px] text-accent dark:bg-white/10">
                🔥 {streak}-day streak
              </span>
            )}
            {solvedToday > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 font-mono text-[12px] text-good dark:bg-white/10">
                ✓ {solvedToday} solved today
              </span>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={startReview}
          className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[17px] font-medium text-white transition-transform hover:bg-accent-strong active:scale-[0.98]"
        >
          {allDone ? "Play again" : "Start review"}
          <span className="font-mono text-[13px] text-white/80">
            {allDone ? "다시 풀기" : "복습 시작"}
          </span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );
}

/**
 * 진행 저장 상태 — 아주 작게, 진행률 바 바로 아래 한 줄.
 * 평소(idle)에는 자리만 지키고 아무 것도 말하지 않는다.
 */
function SyncBadge({ status }: { status: SyncStatus }) {
  const text: Record<SyncStatus, { en: string; ko: string } | null> = {
    idle: null,
    saving: { en: "Saving…", ko: "저장 중" },
    saved: { en: "✓ Saved", ko: "저장됨" },
    offline: { en: "Saved on this device", ko: "이 기기에 저장됨" },
  };
  const label = text[status];

  return (
    <p
      aria-live="polite"
      className={`mt-1.5 h-4 font-mono text-[11px] transition-opacity duration-300 ${
        label ? "opacity-100" : "opacity-0"
      } ${status === "saved" ? "text-good" : "text-ink-soft"}`}
    >
      {label && (
        <>
          {label.en}{" "}
          <span lang="ko" className="text-ink-soft">
            {label.ko}
          </span>
        </>
      )}
    </p>
  );
}

/* ──────────────────────── 수업 카드용 진입 버튼 ──────────────────────── */

export function LessonPuzzleButton({ lessonId }: { lessonId: string }) {
  const { hydrated, lessonProgress, startLesson } = usePuzzleContext();
  const progress = lessonProgress(lessonId);
  if (progress.total === 0) return null;

  const done = hydrated && progress.solved === progress.total;
  const remaining = progress.total - progress.solved;

  return (
    <button
      type="button"
      onClick={() => startLesson(lessonId)}
      className={`group mt-4 flex min-h-16 w-full items-center gap-4 rounded-2xl px-5 py-4 text-left shadow-sm ring-1 transition-all hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 ${
        done
          ? "bg-good-wash text-good ring-good/30"
          : "bg-accent text-white ring-accent-strong/40"
      }`}
    >
      {/* 큼직한 아이콘 배지 */}
      <span
        aria-hidden="true"
        className={`flex size-12 shrink-0 items-center justify-center rounded-full text-2xl ${
          done ? "bg-good/15" : "bg-white/20"
        }`}
      >
        🧩
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[18px] font-semibold leading-tight">
          {done ? "Replay this lesson" : "Play this lesson's puzzles"}
        </span>
        <span
          lang="ko"
          className={`block text-[14px] ${done ? "text-good/80" : "text-white/85"}`}
        >
          {done ? "다시 풀기" : "이 수업 퍼즐 풀기"}
        </span>
      </span>

      {/* 진행 배지 + 화살표 */}
      <span className="flex shrink-0 items-center gap-2.5">
        <span
          className={`rounded-full px-2.5 py-1 font-mono text-[13px] font-medium ${
            done ? "bg-good/15 text-good" : "bg-white/20 text-white"
          }`}
        >
          {hydrated
            ? done
              ? "✓ done"
              : `${remaining} left`
            : `${progress.total}`}
        </span>
        <span
          aria-hidden="true"
          className="text-xl transition-transform group-hover:translate-x-0.5"
        >
          →
        </span>
      </span>
    </button>
  );
}

/* ───────────────────────────── 덱 플레이어 ───────────────────────────── */

function DeckPlayer({
  deck,
  isSolved,
  onSolved,
  onClose,
}: {
  deck: Deck;
  isSolved: (key: string) => boolean;
  onSolved: (key: string) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [round, setRound] = useState(0);
  const [finished, setFinished] = useState(false);
  const [cleared, setCleared] = useState(0);

  const item = deck.items[index];
  const isLast = index === deck.items.length - 1;

  function next() {
    if (isLast) {
      setFinished(true);
      return;
    }
    setIndex((i) => i + 1);
  }

  function replay() {
    setIndex(0);
    setRound((r) => r + 1);
    setFinished(false);
    setCleared(0);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-paper"
      role="dialog"
      aria-modal="true"
      aria-label="Review puzzles"
    >
      {/* 상단 바 — 덱 제목 + 진행 + 닫기 */}
      <div className="shrink-0 border-b border-ink-faint px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-medium">{deck.title}</p>
            <p lang="ko" className="truncate font-mono text-[11px] text-ink-soft">
              {deck.subtitle}
            </p>
          </div>
          <p className="shrink-0 font-mono text-[13px] text-ink-soft">
            {finished ? deck.items.length : index + 1} / {deck.items.length}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close puzzles"
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-accent-wash hover:text-accent"
          >
            ✕
          </button>
        </div>
        {/* 덱 진행 — 퍼즐이 많으면 점 대신 막대 하나로 */}
        <div className="mx-auto mt-2.5 flex max-w-2xl gap-1">
          {deck.items.length <= 20 ? (
            deck.items.map((deckItem, i) => (
              <span
                key={deckItem.key}
                className={`h-1 flex-1 rounded-full ${
                  finished || i < index
                    ? "bg-accent"
                    : i === index
                      ? "bg-accent/50"
                      : "bg-ink-faint"
                }`}
              />
            ))
          ) : (
            <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink-faint">
              <span
                className="block h-full rounded-full bg-accent transition-[width] duration-500"
                style={{
                  width: `${Math.round(((finished ? deck.items.length : index) / deck.items.length) * 100)}%`,
                }}
              />
            </span>
          )}
        </div>
      </div>

      {/* 본문 */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="mx-auto max-w-2xl">
          {finished || !item ? (
            <DeckComplete
              total={deck.items.length}
              cleared={cleared}
              onReplay={replay}
              onClose={onClose}
            />
          ) : (
            <PuzzleBoard
              key={`${item.key}:${round}`}
              item={item}
              alreadySolved={isSolved(item.key)}
              isLast={isLast}
              onSolved={() => {
                onSolved(item.key);
                setCleared((n) => n + 1);
              }}
              onNext={next}
              onSkip={next}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DeckComplete({
  total,
  cleared,
  onReplay,
  onClose,
}: {
  total: number;
  cleared: number;
  onReplay: () => void;
  onClose: () => void;
}) {
  return (
    <div className="soft-card p-8 text-center">
      <p className="text-5xl" aria-hidden="true">
        🎉
      </p>
      <p className="mt-3 font-display text-3xl">Deck complete!</p>
      <p lang="ko" className="mt-1 text-[16px] text-ink-soft">
        한 세트 끝! 정말 잘했어요.
      </p>
      <p className="mt-5 font-mono text-[13px] text-ink-soft">
        {cleared} / {total} solved in this round
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={onReplay}
          className="min-h-12 rounded-full border border-ink-faint bg-card px-6 font-medium text-ink-soft transition-colors hover:border-accent hover:text-accent"
        >
          Play again 다시 하기
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-12 rounded-full bg-accent px-8 font-medium text-white transition-colors hover:bg-accent-strong"
        >
          Done 닫기
        </button>
      </div>
    </div>
  );
}

/* ────────────────────────────── 퍼즐 한 판 ────────────────────────────── */

type Chip = { word: string; idx: number };

function shuffle(words: string[]): Chip[] {
  const chips = words.map((word, idx) => ({ word, idx }));
  for (let i = chips.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chips[i], chips[j]] = [chips[j], chips[i]];
  }
  // 정답 순서 그대로 나오면 한 칸 회전시켜 반드시 섞인 상태로 시작
  if (chips.length > 1 && chips.every((c, i) => c.idx === i)) {
    return [...chips.slice(1), chips[0]];
  }
  return chips;
}

function sourceLabel(source: LessonPuzzle["source"]): { en: string; ko: string } {
  switch (source) {
    case "correction":
      return { en: "You fixed this", ko: "고친 문장" };
    case "featured":
      return { en: "Highlight", ko: "오늘의 문장" };
    default:
      return { en: "New phrase", ko: "새 표현" };
  }
}

function PuzzleBoard({
  item,
  alreadySolved,
  isLast,
  onSolved,
  onNext,
  onSkip,
}: {
  item: DeckItem;
  alreadySolved: boolean;
  isLast: boolean;
  onSolved: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const { puzzle } = item;
  // 이 컴포넌트는 사용자가 덱을 연 뒤에만 마운트되므로 초기값 셔플이 SSR과 충돌하지 않는다
  const [pool, setPool] = useState<Chip[]>(() => shuffle(puzzle.words));
  // 방금 푼 것과 구분하려고 "이전에 푼 퍼즐"인지는 마운트 시점 값으로 고정한다
  const [seenBefore] = useState(alreadySolved);
  const [picked, setPicked] = useState<Chip[]>([]);
  const [wrong, setWrong] = useState(false);
  const [solved, setSolved] = useState(false);
  const [hint, setHint] = useState<number | null>(null);

  const label = sourceLabel(puzzle.source);
  const complete = pool.length === 0;

  // 정답 문장 발음을 미리 받아둔다 — 정답 공개 🔊 탭 즉시 재생
  useEffect(() => prefetchSpeak(puzzle.words.join(" ")), [puzzle.words]);

  function pick(chip: Chip) {
    if (solved) return;
    setPool((prev) => prev.filter((c) => c.idx !== chip.idx));
    setPicked((prev) => [...prev, chip]);
    setWrong(false);
    setHint(null);
  }

  function unpick(chip: Chip) {
    if (solved) return;
    setPicked((prev) => prev.filter((c) => c.idx !== chip.idx));
    setPool((prev) => [...prev, chip]);
    setWrong(false);
    setHint(null);
  }

  function check() {
    if (picked.every((c, i) => c.idx === i)) {
      setSolved(true);
      setWrong(false);
      onSolved();
    } else {
      setWrong(true);
    }
  }

  function clearBoard() {
    setPool(shuffle(puzzle.words));
    setPicked([]);
    setWrong(false);
    setHint(null);
  }

  /** 지금까지 맞게 놓인 앞부분 다음에 와야 할 어절 */
  function showHint() {
    const firstWrong = picked.findIndex((c, i) => c.idx !== i);
    const nextIdx = firstWrong === -1 ? picked.length : firstWrong;
    setHint(Math.min(nextIdx, puzzle.words.length - 1));
  }

  return (
    <div>
      {/* 문제 */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-accent-wash px-3 py-1 font-mono text-[11px] tracking-[0.08em] text-accent">
          {label.en}
        </span>
        <span lang="ko" className="font-mono text-[11px] text-ink-soft">
          {label.ko}
        </span>
        {seenBefore && !solved && (
          <span className="rounded-full border border-good/40 px-2.5 py-0.5 font-mono text-[11px] text-good">
            ✓ solved before
          </span>
        )}
      </div>

      <p className="mt-3 text-[15px] text-ink-soft">Build this sentence:</p>
      <p className="mt-1 font-display text-2xl leading-snug sm:text-3xl">
        &ldquo;{puzzle.en}&rdquo;
      </p>

      {/* 조립 영역 */}
      <div
        className={`mt-5 flex min-h-20 flex-wrap content-start items-center gap-2 rounded-2xl border-2 border-dashed p-3 transition-colors ${
          solved
            ? "border-good/60 bg-good-wash/60"
            : wrong
              ? "border-accent bg-accent-wash/40"
              : "border-ink-faint bg-card"
        }`}
      >
        {picked.length === 0 && (
          <span className="px-1 text-[15px] text-ink-soft">
            Tap the pieces below… 아래 조각을 눌러 보세요
          </span>
        )}
        {picked.map((chip) => (
          <button
            key={chip.idx}
            type="button"
            onClick={() => unpick(chip)}
            disabled={solved}
            lang="ko"
            className="min-h-11 rounded-xl bg-paper px-3.5 py-1.5 text-2xl shadow-sm transition-transform active:scale-95 disabled:opacity-100"
          >
            {chip.word}
          </button>
        ))}
      </div>

      {/* 남은 칩 */}
      {!solved && (
        <div className="mt-4 flex flex-wrap gap-2.5">
          {pool.map((chip) => (
            <button
              key={chip.idx}
              type="button"
              onClick={() => pick(chip)}
              lang="ko"
              className={`min-h-12 rounded-full border bg-card px-4 py-1.5 text-2xl transition-transform active:scale-95 ${
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
        <p className="mt-3 rounded-xl bg-accent-wash/60 px-3.5 py-2 text-[15px]">
          <span className="font-mono text-[11px] tracking-[0.1em] text-accent uppercase">
            Hint ·{" "}
          </span>
          Next piece is{" "}
          <span lang="ko" className="text-xl font-medium">
            {puzzle.words[hint]}
          </span>
        </p>
      )}

      {/* 판정 / 정답 공개 */}
      {solved ? (
        <div className="mt-6 rounded-2xl border border-good/40 bg-good-wash/50 p-5">
          <p className="text-[17px] font-medium text-good">
            <span className="mr-1.5 inline-block animate-bounce" aria-hidden="true">
              🎉
            </span>
            Perfect! 완벽해요!
          </p>
          <SpeakableKo
            ko={puzzle.words.join(" ")}
            className="mt-3 block font-display text-3xl leading-snug"
          />
          <p className="mt-1.5 font-mono text-[14px] text-ink-soft">{puzzle.rr}</p>
          <p className="mt-1 text-[16px]">{puzzle.en}</p>
          {puzzle.note && (
            <p
              lang="ko"
              className="mt-3 border-t border-good/30 pt-3 text-[15px] leading-relaxed text-ink-soft"
            >
              {puzzle.note}
            </p>
          )}
          <button
            type="button"
            onClick={onNext}
            className="mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-accent px-6 text-[17px] font-medium text-white transition-transform hover:bg-accent-strong active:scale-[0.98]"
          >
            {isLast ? "Finish" : "Next puzzle"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      ) : (
        <div className="mt-6">
          {wrong && (
            <p className="mb-3 text-[15px] text-accent">
              Not quite — tap a piece to move it back and try again.
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
            <SmallButton onClick={onSkip}>Skip 건너뛰기 →</SmallButton>
          </div>
        </div>
      )}
    </div>
  );
}

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
