"use client";

/**
 * 라이브 노트 모드 — 수업 중 화면공유하며 실시간 받아쓰기·교정을 입력하고,
 * 수업이 끝나면 그대로 학생 포털에 저장하는 워크플로우의 중심.
 * 한글언니 사례의 "재수강률 핵심" 기능을 도구화한다.
 *
 * 설계:
 * - 입력·자동저장은 전부 클라이언트(localStorage) — 수업 중 네트워크에 의존하지 않는다.
 * - 저장 버튼을 누를 때만 POST /api/students { slug, lesson } 로 학생 포털에 반영한다.
 *   (세션 id = 수업 id 이므로 같은 세션을 다시 저장하면 덮어쓴다)
 * - 교정·표현·숙제는 전부 "입력 즉시 큰 글씨로 보이는 행 반복 추가" 패턴으로 통일:
 *   입력 필드 자체가 화면공유 중 학생이 읽는 카드 역할을 겸한다.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { packs } from "@/data/packs";
import { students } from "@/data/students";
import type { HomeworkItem, LessonLog } from "@/data/types";
import { puzzlesForLesson } from "@/lib/puzzles";
import { romanize } from "@/lib/romanize";

/* ────────────────────────────── 타입 & 저장소 ────────────────────────────── */

type LiveCorrection = { said: string; fixed: string; rr: string; note: string };
type LivePhrase = { ko: string; rr: string; en: string };
/**
 * 숙제 입력 행 — HomeworkItem과 1:1이되 전부 필수 문자열/배열이다.
 * (제어 컴포넌트라 undefined가 있으면 안 된다. 빈 값은 저장 시 생략한다)
 */
type LiveHomeworkItem = {
  en: string;
  ko: string;
  rr: string;
  /** 어떻게 — 학생이 그대로 읽는 방법 안내(영어) */
  how: string;
  /** 얼마나 — 분량·빈도 (예: "3 times a day · 5 min") */
  target: string;
  /** 이 숙제로 연습할 문장 — 보통 이 수업의 표현에서 담는다 */
  phrases: LivePhrase[];
  /** 연결할 학습 팩 id (빈 문자열이면 연결 없음) */
  packId: string;
};

type LiveSession = {
  id: string;
  /** 표시용 이름 (세션 목록·큰 화면 모드) */
  studentName: string;
  /** 학생 포털 slug — 저장 대상. 예전 세션에는 없을 수 있다 */
  studentSlug: string;
  date: string; // YYYY-MM-DD
  topic: string;
  corrections: LiveCorrection[];
  phrases: LivePhrase[];
  homework: LiveHomeworkItem[];
  /** 학생 포털에 마지막으로 저장한 시각 (ISO) */
  savedAt?: string;
};

/** GET /api/students 응답에서 쓰는 필드만 */
type RosterStudent = { slug: string; name: string };

type SaveState = {
  status: "idle" | "saving" | "ok" | "error";
  message?: string;
  /** 성공 시 포털 링크에 쓰는 slug */
  slug?: string;
};

/**
 * 제안 숙제 불러오기 상태 — "🪄 제안 숙제 불러오기" 버튼 옆 작은 안내 문구용.
 * 실패(404/403/네트워크)는 알람처럼 굴지 않고 "empty"("제안 숙제가 없어요")로 조용히 처리한다.
 */
type PlanLoadState = "idle" | "loading" | "ok" | "empty";

const SESSIONS_KEY = "hanmadi-live:sessions";
const CURRENT_KEY = "hanmadi-live:current";

/** 교정 행 컬럼 폭 — 헤더 라벨과 입력 행이 같은 값을 쓴다 */
const CORRECTION_COLS = "sm:grid-cols-[1fr_1.1fr_0.8fr_1fr_auto]";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSession(studentName = "", studentSlug = ""): LiveSession {
  return {
    id: generateId(),
    studentName,
    studentSlug,
    date: todayStr(),
    topic: "",
    corrections: [],
    phrases: [],
    homework: [],
  };
}

/* ── 저장된 세션 마이그레이션 (rr·studentSlug 등 새 필드 보정) ── */

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeCorrection(raw: unknown): LiveCorrection {
  const c = (raw ?? {}) as Record<string, unknown>;
  return {
    said: str(c.said),
    fixed: str(c.fixed),
    // 기존 세션에는 rr이 없다 → 빈 문자열로 보정
    rr: str(c.rr),
    note: str(c.note),
  };
}

function normalizePhrase(raw: unknown): LivePhrase {
  const p = (raw ?? {}) as Record<string, unknown>;
  return { ko: str(p.ko), rr: str(p.rr), en: str(p.en) };
}

/** 기존 세션에는 rr/how/target/phrases/packId가 없다 → 빈 값으로 보정 */
function normalizeHomework(raw: unknown): LiveHomeworkItem {
  const h = (raw ?? {}) as Record<string, unknown>;
  return {
    en: str(h.en),
    ko: str(h.ko),
    rr: str(h.rr),
    how: str(h.how),
    target: str(h.target),
    phrases: Array.isArray(h.phrases) ? h.phrases.map(normalizePhrase) : [],
    packId: str(h.packId),
  };
}

function emptyHomework(): LiveHomeworkItem {
  return { en: "", ko: "", rr: "", how: "", target: "", phrases: [], packId: "" };
}

/** 숙제 행에 실제 입력이 있는지 — 제안 숙제로 덮어쓰기 전 확인(confirm) 여부 판단용 */
function liveHomeworkHasContent(h: LiveHomeworkItem): boolean {
  return (
    h.en.trim() !== "" ||
    h.ko.trim() !== "" ||
    h.rr.trim() !== "" ||
    h.how.trim() !== "" ||
    h.target.trim() !== "" ||
    h.packId.trim() !== "" ||
    h.phrases.length > 0
  );
}

/**
 * 제안 숙제(HomeworkItem) → 라이브 숙제 행(LiveHomeworkItem) 변환.
 * 누락 필드는 ""/[]로 채우고, phrases는 {ko,rr,en}만 취한다
 * (제어 컴포넌트라 전 필드가 반드시 문자열/배열이어야 한다).
 */
function planToLiveHomework(items: HomeworkItem[]): LiveHomeworkItem[] {
  return items.map((it) => ({
    en: str(it.en),
    ko: str(it.ko),
    rr: str(it.rr),
    how: str(it.how),
    target: str(it.target),
    phrases: Array.isArray(it.phrases)
      ? it.phrases.map((p) => ({ ko: str(p.ko), rr: str(p.rr), en: str(p.en) }))
      : [],
    packId: str(it.packId),
  }));
}

/**
 * 학생의 제안 숙제를 GET /api/plan?slug=… 에서 불러온다.
 * 실패(403/404·네트워크·형식 오류)면 null, 성공이면 배열(제안이 없으면 빈 배열).
 */
async function fetchPlanHomework(slug: string): Promise<LiveHomeworkItem[] | null> {
  try {
    const res = await fetch(`/api/plan?slug=${encodeURIComponent(slug)}`);
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean;
      homework?: HomeworkItem[];
    } | null;
    if (!res.ok || !data?.ok || !Array.isArray(data.homework)) return null;
    return planToLiveHomework(data.homework);
  } catch {
    return null;
  }
}

function normalizeSession(raw: unknown): LiveSession | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const id = str(s.id);
  if (!id) return null;
  const savedAt = str(s.savedAt);
  return {
    id,
    studentName: str(s.studentName),
    studentSlug: str(s.studentSlug),
    date: str(s.date) || todayStr(),
    topic: str(s.topic),
    corrections: Array.isArray(s.corrections)
      ? s.corrections.map(normalizeCorrection)
      : [],
    phrases: Array.isArray(s.phrases) ? s.phrases.map(normalizePhrase) : [],
    homework: Array.isArray(s.homework) ? s.homework.map(normalizeHomework) : [],
    savedAt: savedAt || undefined,
  };
}

/* ── 세션 → 수업 기록(LessonLog) 변환 ── */

/** 빈 행은 제외한다. puzzle은 보내지 않는다 — lib/puzzles.ts가 자동 생성한다. */
function buildLesson(s: LiveSession): LessonLog {
  return {
    id: s.id,
    date: s.date || todayStr(),
    topic: s.topic.trim() || "Lesson",
    corrections: s.corrections
      .filter((c) => c.fixed.trim() !== "")
      .map((c) => {
        const note = c.note.trim();
        return {
          said: c.said.trim(),
          fixed: c.fixed.trim(),
          rr: c.rr.trim(),
          ...(note ? { note } : {}),
        };
      }),
    phrases: s.phrases
      .filter((p) => p.ko.trim() !== "")
      .map((p) => ({ ko: p.ko.trim(), rr: p.rr.trim(), en: p.en.trim() })),
    homework: s.homework
      .filter((h) => h.en.trim() !== "")
      .map((h) => {
        // 빈 필드는 아예 보내지 않는다 — 포털에서 빈 줄이 생기지 않도록
        const item: HomeworkItem = { en: h.en.trim() };
        const ko = h.ko.trim();
        const rr = h.rr.trim();
        const how = h.how.trim();
        const target = h.target.trim();
        const packId = h.packId.trim();
        const phrases = h.phrases
          .filter((p) => p.ko.trim() !== "")
          .map((p) => ({ ko: p.ko.trim(), rr: p.rr.trim(), en: p.en.trim() }));
        if (ko) item.ko = ko;
        if (rr) item.rr = rr;
        if (how) item.how = how;
        if (target) item.target = target;
        if (phrases.length > 0) item.phrases = phrases;
        if (packId) item.packId = packId;
        return item;
      }),
  };
}

function lessonItemCount(lesson: LessonLog): number {
  return lesson.corrections.length + lesson.phrases.length + lesson.homework.length;
}

function formatSavedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function toMarkdown(s: LiveSession): string {
  const cell = (t: string) => (t || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  const lines: string[] = [];

  lines.push(`## ${s.date} — ${s.topic || "Lesson"}`);
  lines.push("");
  lines.push(`**Student:** ${s.studentName || "—"}`);
  lines.push("");
  lines.push("### Corrections");
  const corrections = s.corrections.filter((c) => c.fixed.trim() !== "");
  if (corrections.length === 0) {
    lines.push("_None today._");
  } else {
    lines.push("| Said | Fixed | RR | Note |");
    lines.push("| --- | --- | --- | --- |");
    for (const c of corrections) {
      lines.push(
        `| ${cell(c.said)} | ${cell(c.fixed)} | ${cell(c.rr)} | ${cell(c.note)} |`,
      );
    }
  }
  lines.push("");
  lines.push("### New Phrases");
  const phrases = s.phrases.filter((p) => p.ko.trim() !== "");
  if (phrases.length === 0) {
    lines.push("_None today._");
  } else {
    lines.push("| 한국어 | RR | English |");
    lines.push("| --- | --- | --- |");
    for (const p of phrases) {
      lines.push(`| ${cell(p.ko)} | ${cell(p.rr)} | ${cell(p.en)} |`);
    }
  }
  lines.push("");
  lines.push("### Homework");
  const homework = s.homework.filter((h) => h.en.trim() !== "");
  if (homework.length === 0) {
    lines.push("_None assigned._");
  } else {
    // 무엇을 / 얼마나 / 어떻게 / 무엇으로 순서로 들여쓴다
    for (const h of homework) {
      lines.push(`- [ ] ${h.en}${h.ko ? ` (${h.ko})` : ""}`);
      if (h.target.trim()) lines.push(`  - **Target:** ${h.target.trim()}`);
      if (h.how.trim()) lines.push(`  - **How:** ${h.how.trim()}`);
      const hwPhrases = h.phrases.filter((p) => p.ko.trim() !== "");
      for (const p of hwPhrases) {
        const rr = p.rr.trim() ? ` (${p.rr.trim()})` : "";
        const en = p.en.trim() ? ` — ${p.en.trim()}` : "";
        lines.push(`  - ${p.ko.trim()}${rr}${en}`);
      }
      if (h.packId.trim()) {
        const pack = packs.find((p) => p.id === h.packId.trim());
        lines.push(
          `  - **Pack:** ${pack ? pack.title.en : h.packId.trim()} — /library/${h.packId.trim()}`,
        );
      }
    }
  }
  return lines.join("\n");
}

/* ────────────────────────────────── 페이지 ────────────────────────────────── */

export default function LivePage() {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "present">("edit");
  const [studentFilter, setStudentFilter] = useState("all");
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [rosterState, setRosterState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const loadedRef = useRef(false);
  const linkedRef = useRef(false);
  /** 이미 제안 숙제를 자동 반영한 "세션id::slug" 조합 — 재반영·무한 루프 방지 */
  const autoFilledRef = useRef<Set<string>>(new Set());
  const [planState, setPlanState] = useState<PlanLoadState>("idle");

  // 최초 로드 — localStorage에서 복원(구버전 세션 보정), 없으면 새 세션 생성
  // localStorage와 crypto.randomUUID는 서버에 없다. lazy initializer로 읽으면
  // 하이드레이션이 깨지므로 마운트 후 1회 복원이 유일하게 안전한 방법이다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSIONS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const saved = Array.isArray(parsed)
        ? parsed
            .map(normalizeSession)
            .filter((s): s is LiveSession => s !== null)
        : [];
      if (saved.length > 0) {
        setSessions(saved);
        const savedCurrent = localStorage.getItem(CURRENT_KEY);
        setCurrentId(
          savedCurrent && saved.some((s) => s.id === savedCurrent)
            ? savedCurrent
            : saved[0].id,
        );
      } else {
        const s = createSession();
        setSessions([s]);
        setCurrentId(s.id);
      }
    } catch {
      const s = createSession();
      setSessions([s]);
      setCurrentId(s.id);
    } finally {
      loadedRef.current = true;
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 학생 목록 — 포털에 저장할 대상 선택용
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/students");
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          students?: RosterStudent[];
        } | null;
        if (cancelled) return;
        if (!res.ok || !data?.ok || !Array.isArray(data.students)) {
          setRosterState("error");
          return;
        }
        setRoster(
          data.students.map((s) => ({ slug: s.slug, name: s.name })),
        );
        setRosterState("ready");
      } catch {
        if (!cancelled) setRosterState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 예전 세션(slug 없음)을 이름이 정확히 같은 학생과 한 번만 연결해 준다
  useEffect(() => {
    if (rosterState !== "ready" || roster.length === 0 || linkedRef.current) {
      return;
    }
    linkedRef.current = true;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.studentSlug || !s.studentName.trim()) return s;
        const match = roster.find(
          (r) => r.name.trim() === s.studentName.trim(),
        );
        return match ? { ...s, studentSlug: match.slug } : s;
      }),
    );
  }, [roster, rosterState]);

  // 입력마다 자동 저장
  useEffect(() => {
    if (!loadedRef.current) return;
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
      if (currentId) localStorage.setItem(CURRENT_KEY, currentId);
    } catch {
      /* 저장 실패해도 화면 동작에는 지장 없음 */
    }
  }, [sessions, currentId]);

  const current = sessions.find((s) => s.id === currentId);

  // 제안 숙제 자동 반영 — 학생이 선택됐고(slug 있음) 현재 세션 숙제가 비어 있으면
  // GET /api/plan의 제안 숙제를 한 번만 자동으로 채운다. 같은 "세션id::slug" 조합은
  // autoFilledRef가 기억해 다시 채우지 않는다(튜터가 지운 뒤 자동 복원되는 것을 막는다).
  // setState는 async 콜백 안에서만 부르므로 set-state-in-effect 경고 대상이 아니다.
  useEffect(() => {
    if (!loadedRef.current || !current) return;
    const slug = current.studentSlug.trim();
    if (!slug || current.homework.length > 0) return;
    const key = `${current.id}::${slug}`;
    if (autoFilledRef.current.has(key)) return;
    autoFilledRef.current.add(key); // 재진입·중복 요청 방지 (fetch 시작 전에 표시)
    const sessionId = current.id;
    void (async () => {
      const hw = await fetchPlanHomework(slug);
      if (!hw || hw.length === 0) return;
      // 로딩 사이 튜터가 이미 입력했을 수 있으니 여전히 비어 있을 때만 채운다
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId && s.homework.length === 0
            ? { ...s, homework: hw }
            : s,
        ),
      );
    })();
  }, [current]);

  const markdown = useMemo(() => (current ? toMarkdown(current) : ""), [current]);
  const lesson = useMemo(() => (current ? buildLesson(current) : null), [current]);
  const puzzleCount = useMemo(
    () => (lesson ? puzzlesForLesson(lesson).length : 0),
    [lesson],
  );
  /** 숙제에 담을 후보 — 이번 세션에서 입력한 표현 중 한국어가 채워진 것 */
  const sessionPhrases = useMemo<LivePhrase[]>(
    () =>
      (current?.phrases ?? [])
        .filter((p) => p.ko.trim() !== "")
        .map((p) => ({ ko: p.ko.trim(), rr: p.rr.trim(), en: p.en.trim() })),
    [current],
  );

  const studentNames = useMemo(
    () =>
      Array.from(
        new Set(sessions.map((s) => s.studentName.trim()).filter(Boolean)),
      ),
    [sessions],
  );
  const visibleSessions = sessions.filter(
    (s) => studentFilter === "all" || s.studentName === studentFilter,
  );

  /** 목록에 없는 slug(삭제된 학생·목록 로딩 중)도 선택 상태를 잃지 않게 옵션에 넣는다 */
  const studentOptions: RosterStudent[] =
    current?.studentSlug && !roster.some((r) => r.slug === current.studentSlug)
      ? [
          {
            slug: current.studentSlug,
            name: current.studentName || current.studentSlug,
          },
          ...roster,
        ]
      : roster;

  /** 세션을 바꾸면 이전 저장 메시지는 지운다 */
  function selectSession(id: string) {
    setCurrentId(id);
    setSaveState({ status: "idle" });
    setPlanState("idle");
  }

  function updateCurrent(patch: Partial<LiveSession>) {
    setSessions((prev) =>
      prev.map((s) => (s.id === currentId ? { ...s, ...patch } : s)),
    );
  }

  function handleNewSession() {
    const s = createSession(current?.studentName ?? "", current?.studentSlug ?? "");
    setSessions((prev) => [s, ...prev]);
    selectSession(s.id);
  }

  function handleDeleteSession(id: string) {
    if (!window.confirm("이 세션을 삭제할까요? 되돌릴 수 없습니다.")) return;
    if (id === currentId) setSaveState({ status: "idle" });
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (id === currentId) {
        if (next.length > 0) {
          setCurrentId(next[0].id);
        } else {
          const fresh = createSession();
          setCurrentId(fresh.id);
          return [fresh];
        }
      }
      return next;
    });
  }

  /** 현재 세션을 수업 기록으로 학생 포털에 저장 (같은 id면 덮어쓰기) */
  async function saveToPortal() {
    if (!current || !lesson || saveState.status === "saving") return;

    const slug = current.studentSlug.trim();
    if (!slug) {
      setSaveState({ status: "error", message: "학생을 선택해 주세요." });
      return;
    }
    if (lessonItemCount(lesson) === 0) {
      setSaveState({
        status: "error",
        message: "저장할 내용이 없어요 — 교정·새 표현·숙제 중 하나는 입력해 주세요.",
      });
      return;
    }

    setSaveState({ status: "saving" });
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, lesson }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!res.ok || !data?.ok) {
        setSaveState({
          status: "error",
          message:
            res.status === 403
              ? "로그인이 만료됐어요. 다시 로그인한 뒤 저장해 주세요."
              : (data?.error ?? "저장에 실패했어요. 잠시 후 다시 시도해 주세요."),
        });
        return;
      }

      updateCurrent({ savedAt: new Date().toISOString() });
      setSaveState({
        status: "ok",
        slug,
        message: `${current.studentName || slug} 학생 포털에 저장했어요.`,
      });
    } catch {
      setSaveState({
        status: "error",
        message: "연결에 실패했어요. 네트워크를 확인한 뒤 다시 시도해 주세요.",
      });
    }
  }

  // 교정 / 표현 / 숙제 — 행 추가·수정·삭제 (동일 패턴)
  function addCorrection() {
    if (!current) return;
    updateCurrent({
      corrections: [
        ...current.corrections,
        { said: "", fixed: "", rr: "", note: "" },
      ],
    });
  }
  function updateCorrection(i: number, patch: Partial<LiveCorrection>) {
    if (!current) return;
    updateCurrent({
      corrections: current.corrections.map((c, idx) =>
        idx === i ? { ...c, ...patch } : c,
      ),
    });
  }
  function removeCorrection(i: number) {
    if (!current) return;
    updateCurrent({ corrections: current.corrections.filter((_, idx) => idx !== i) });
  }

  function addPhrase() {
    if (!current) return;
    updateCurrent({ phrases: [...current.phrases, { ko: "", rr: "", en: "" }] });
  }
  function updatePhrase(i: number, patch: Partial<LivePhrase>) {
    if (!current) return;
    updateCurrent({
      phrases: current.phrases.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    });
  }
  function removePhrase(i: number) {
    if (!current) return;
    updateCurrent({ phrases: current.phrases.filter((_, idx) => idx !== i) });
  }

  /**
   * 자동 채움 — 한국어를 입력하고 칸을 벗어나면(onBlur) 빈 로마자·영어를 채운다.
   * 로마자는 lib/romanize로 즉시, 영어는 /api/translate(사전+번역)로 비동기.
   * 튜터가 이미 넣은 값은 절대 덮어쓰지 않는다 (빈 칸만). 알고리즘/번역이라
   * 완벽하지 않으니 튜터가 확인·수정하는 것을 전제로 한다.
   */
  function autofillCorrectionRr(i: number) {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== currentId) return s;
        const c = s.corrections[i];
        if (!c || !c.fixed.trim() || c.rr.trim()) return s;
        return {
          ...s,
          corrections: s.corrections.map((x, idx) =>
            idx === i ? { ...x, rr: romanize(c.fixed.trim()) } : x,
          ),
        };
      }),
    );
  }

  function autofillPhrase(i: number) {
    // 1) 로마자 — 즉시
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== currentId) return s;
        const p = s.phrases[i];
        if (!p || !p.ko.trim() || p.rr.trim()) return s;
        return {
          ...s,
          phrases: s.phrases.map((x, idx) =>
            idx === i ? { ...x, rr: romanize(p.ko.trim()) } : x,
          ),
        };
      }),
    );

    // 2) 영어 뜻 — 비동기 번역 (빈 칸일 때만)
    const p = current?.phrases[i];
    if (!p || !p.ko.trim() || p.en.trim()) return;
    const ko = p.ko.trim();
    const sid = currentId;
    void (async () => {
      try {
        const res = await fetch(`/api/translate?ko=${encodeURIComponent(ko)}`);
        const data = (await res.json().catch(() => null)) as {
          ok?: boolean;
          en?: string;
        } | null;
        const en = data?.ok && typeof data.en === "string" ? data.en.trim() : "";
        if (!en) return;
        // 응답이 온 사이에 튜터가 표현을 바꿨거나 영어를 넣었으면 건드리지 않는다
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id !== sid) return s;
            const cur = s.phrases[i];
            if (!cur || cur.ko.trim() !== ko || cur.en.trim()) return s;
            return {
              ...s,
              phrases: s.phrases.map((x, idx) => (idx === i ? { ...x, en } : x)),
            };
          }),
        );
      } catch {
        /* 자동 번역 실패는 무시 — 튜터가 직접 입력 */
      }
    })();
  }

  function addHomework() {
    if (!current) return;
    updateCurrent({ homework: [...current.homework, emptyHomework()] });
  }
  function updateHomework(i: number, patch: Partial<LiveHomeworkItem>) {
    if (!current) return;
    updateCurrent({
      homework: current.homework.map((h, idx) => (idx === i ? { ...h, ...patch } : h)),
    });
  }
  function removeHomework(i: number) {
    if (!current) return;
    updateCurrent({ homework: current.homework.filter((_, idx) => idx !== i) });
  }
  /** 이 수업에서 입력한 표현을 그대로 숙제의 연습 문장으로 담는다 (스냅샷 복사) */
  function fillHomeworkPhrases(i: number) {
    if (!current) return;
    updateHomework(i, { phrases: sessionPhrases });
  }

  /**
   * 🪄 제안 숙제 불러오기 — 현재 학생의 자동 생성 제안 숙제로 기존 숙제를 대체한다.
   * 기존 숙제에 내용이 있으면 먼저 확인(confirm)한다. 자동 반영 가드에도 표시해
   * 뒤이어 자동 반영이 다시 건드리지 않게 한다.
   */
  async function loadSuggestedHomework() {
    if (!current || planState === "loading") return;
    const slug = current.studentSlug.trim();
    if (!slug) return; // 학생 미선택 — 버튼은 비활성, 안내 문구로 알린다
    if (
      current.homework.some(liveHomeworkHasContent) &&
      !window.confirm("기존 숙제를 제안 숙제로 바꿀까요?")
    ) {
      return;
    }
    const sessionId = current.id;
    setPlanState("loading");
    const hw = await fetchPlanHomework(slug);
    // 실패(null)든 제안이 비었든 조용히 "제안 숙제가 없어요"로 통일
    if (!hw || hw.length === 0) {
      setPlanState("empty");
      return;
    }
    // 이 조합은 이미 반영했으니 자동 반영이 다시 채우지 않게 표시
    autoFilledRef.current.add(`${sessionId}::${slug}`);
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, homework: hw } : s)),
    );
    setPlanState("ok");
  }

  /** 제안 숙제 불러오기 버튼 활성 여부 + 옆 안내 문구 */
  const hasStudent = Boolean(current?.studentSlug.trim());
  const planStatusText = !hasStudent
    ? "먼저 학생을 선택하세요"
    : planState === "loading"
      ? "제안 숙제 불러오는 중…"
      : planState === "ok"
        ? "제안 숙제를 불러왔어요 — 자유롭게 편집·삭제하세요"
        : planState === "empty"
          ? "제안 숙제가 없어요"
          : "";

  const saveLabel =
    saveState.status === "saving"
      ? "저장 중…"
      : saveState.status === "ok"
        ? "저장됨 ✓"
        : saveState.status === "error"
          ? "다시 저장"
          : "학생 포털에 저장";

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      {/* 미니 크롬: 저장·복사·모드 전환 — 브랜드는 글로벌 헤더가 담당, 헤더 아래 고정 */}
      <header className="sticky top-16 z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-ink-faint bg-paper/90 px-5 backdrop-blur">
        <span className="hidden font-mono text-[11px] tracking-[0.2em] text-ink-soft sm:inline">
          라이브 노트
        </span>
        <div className="flex flex-1 items-center justify-end gap-2.5">
          {current && (
            <>
              <button
                type="button"
                onClick={() => void saveToPortal()}
                disabled={saveState.status === "saving"}
                title="현재 세션을 학생 포털의 수업 기록으로 저장"
                className="min-h-9 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
              >
                <span className="sm:hidden">
                  {saveState.status === "idle" ? "포털 저장" : saveLabel}
                </span>
                <span className="hidden sm:inline">{saveLabel}</span>
              </button>
              <CopyButton
                text={markdown}
                label="마크다운 복사"
                copiedLabel="복사됨!"
              />
            </>
          )}
          <button
            type="button"
            onClick={() => setMode((m) => (m === "edit" ? "present" : "edit"))}
            className={`min-h-9 shrink-0 rounded-full border px-4 py-1.5 font-mono text-[11px] tracking-[0.1em] transition-colors ${
              mode === "present"
                ? "border-amber-line bg-amber-wash text-amber"
                : "border-ink-faint text-ink-soft hover:text-ink"
            }`}
          >
            {mode === "present" ? "입력 모드로" : "큰 화면 모드로"}
          </button>
        </div>
      </header>

      {/* 저장 결과 알림 — 화면공유 중(큰 화면 모드)에는 숨긴다 */}
      {mode === "edit" && saveState.message && (
        <div
          role="status"
          className={`border-b px-5 py-2.5 text-sm ${
            saveState.status === "error"
              ? "border-accent/30 bg-accent-wash text-accent"
              : "border-ink-faint bg-good-wash text-good"
          }`}
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1">
            <span>{saveState.message}</span>
            {saveState.status === "ok" && saveState.slug && (
              <a
                href={`/s/${saveState.slug}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-4"
              >
                학생 포털 열기 ↗
              </a>
            )}
          </div>
        </div>
      )}

      {!current ? (
        <div className="flex flex-1 items-center justify-center text-ink-soft">
          노트를 불러오는 중…
        </div>
      ) : mode === "present" ? (
        <PresentView session={current} />
      ) : (
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-5 py-6 lg:flex-row">
          {/* 세션 목록 */}
          <aside className="w-full shrink-0 lg:w-64">
            <button
              type="button"
              onClick={handleNewSession}
              className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong"
            >
              + 새 세션
            </button>
            {studentNames.length > 0 && (
              <select
                value={studentFilter}
                onChange={(e) => setStudentFilter(e.target.value)}
                className="mt-3 min-h-9 w-full rounded-xl border border-ink-faint bg-card px-3 py-1.5 text-sm"
              >
                <option value="all">전체 학생</option>
                {studentNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <ul className="mt-3 space-y-1.5">
              {visibleSessions.map((s) => (
                <li key={s.id} className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => selectSession(s.id)}
                    className={`min-h-11 flex-1 rounded-xl border px-3.5 py-2 text-left transition-colors ${
                      s.id === currentId
                        ? "border-accent bg-accent-wash/60"
                        : "border-ink-faint bg-card hover:border-accent/40"
                    }`}
                  >
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      <span className="truncate">
                        {s.studentName || "(이름 없음)"}
                      </span>
                      {s.savedAt && (
                        <span className="shrink-0 rounded-full bg-good-wash px-1.5 py-0.5 font-mono text-[10px] text-good">
                          저장됨
                        </span>
                      )}
                    </p>
                    <p className="truncate font-mono text-[11px] text-ink-soft">
                      {s.date} · {s.topic || "—"}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSession(s.id)}
                    aria-label="세션 삭제"
                    title="세션 삭제"
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-accent-wash hover:text-accent"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* 에디터 */}
          <main className="min-w-0 flex-1 space-y-8">
            {/* 세션 헤더 */}
            <section className="soft-card grid gap-4 p-5 sm:grid-cols-3">
              <Field label="학생">
                {studentOptions.length > 0 ? (
                  <select
                    value={current.studentSlug}
                    onChange={(e) => {
                      const slug = e.target.value;
                      const picked = studentOptions.find((s) => s.slug === slug);
                      updateCurrent({
                        studentSlug: slug,
                        studentName: picked ? picked.name : current.studentName,
                      });
                    }}
                    className="min-h-11 w-full rounded-xl border border-ink-faint bg-paper px-3.5 py-2 text-[16px] outline-none transition-colors focus:border-accent"
                  >
                    <option value="">학생 선택…</option>
                    {studentOptions.map((s) => (
                      <option key={s.slug} value={s.slug}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input
                      list="hanmadi-student-names"
                      value={current.studentName}
                      onChange={(e) => updateCurrent({ studentName: e.target.value })}
                      placeholder="학생 이름"
                      className="min-h-11 w-full rounded-xl border border-ink-faint bg-paper px-3.5 py-2 text-[16px] outline-none transition-colors focus:border-accent"
                    />
                    <datalist id="hanmadi-student-names">
                      {students.map((s) => (
                        <option key={s.slug} value={s.name} />
                      ))}
                    </datalist>
                  </>
                )}
                <span className="mt-1.5 block font-mono text-[11px] text-ink-soft">
                  {rosterState === "loading"
                    ? "학생 목록 불러오는 중…"
                    : rosterState === "error"
                      ? "학생 목록을 못 불러왔어요 — 저장하려면 새로고침이 필요해요"
                      : current.studentSlug
                        ? `/s/${current.studentSlug}`
                        : "저장하려면 학생을 선택해 주세요"}
                </span>
              </Field>
              <Field label="날짜">
                <input
                  type="date"
                  value={current.date}
                  onChange={(e) => updateCurrent({ date: e.target.value })}
                  className="min-h-11 w-full rounded-xl border border-ink-faint bg-paper px-3.5 py-2 text-[16px] outline-none transition-colors focus:border-accent"
                />
              </Field>
              <Field label="주제">
                <input
                  value={current.topic}
                  onChange={(e) => updateCurrent({ topic: e.target.value })}
                  placeholder="예: 카페에서 주문하기"
                  className="min-h-11 w-full rounded-xl border border-ink-faint bg-paper px-3.5 py-2 text-[16px] outline-none transition-colors focus:border-accent"
                />
              </Field>
            </section>

            {/* 교정 로그 */}
            <section>
              <SectionLabel>교정 로그</SectionLabel>
              <p className="mb-2 text-[12px] text-ink-soft">
                ✨ 교정 문장을 입력하고 칸을 벗어나면 로마자가 자동으로 채워져요
                (빈 칸만 — 수정 가능).
              </p>
              {current.corrections.length > 0 && (
                <div
                  className={`mb-1.5 hidden gap-2 px-1 font-mono text-[11px] text-ink-soft uppercase sm:grid ${CORRECTION_COLS}`}
                >
                  <span>학생이 말한 문장</span>
                  <span>자연스러운 교정</span>
                  <span>로마자 (RR)</span>
                  <span>노트 (선택)</span>
                  <span />
                </div>
              )}
              <div className="space-y-2">
                {current.corrections.map((c, i) => (
                  <div
                    key={i}
                    className={`soft-card grid gap-2 p-3 ${CORRECTION_COLS}`}
                  >
                    <RowInput
                      value={c.said}
                      onChange={(v) => updateCorrection(i, { said: v })}
                      placeholder="학생이 말한 문장…"
                      lang="ko"
                    />
                    <RowInput
                      value={c.fixed}
                      onChange={(v) => updateCorrection(i, { fixed: v })}
                      onBlur={() => autofillCorrectionRr(i)}
                      placeholder="자연스러운 교정"
                      lang="ko"
                      className="border-accent/40 font-display text-2xl focus:border-accent"
                    />
                    <RowInput
                      value={c.rr}
                      onChange={(v) => updateCorrection(i, { rr: v })}
                      placeholder="로마자 (RR)"
                      className="font-mono text-sm text-ink-soft"
                    />
                    <RowInput
                      value={c.note}
                      onChange={(v) => updateCorrection(i, { note: v })}
                      placeholder="노트 (선택)"
                    />
                    <RemoveButton onClick={() => removeCorrection(i)} />
                  </div>
                ))}
              </div>
              <AddButton onClick={addCorrection}>+ 교정 행 추가</AddButton>
            </section>

            {/* 새 표현 로거 */}
            <section>
              <SectionLabel>새 표현</SectionLabel>
              <p className="mb-2 text-[12px] text-ink-soft">
                ✨ 한국어를 입력하고 칸을 벗어나면 로마자·영어 뜻이 자동으로
                채워져요 (빈 칸만 — 언제든 수정 가능).
              </p>
              {current.phrases.length > 0 && (
                <div className="mb-1.5 hidden gap-2 px-1 font-mono text-[11px] text-ink-soft uppercase sm:grid sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <span>한국어</span>
                  <span>로마자</span>
                  <span>영어 뜻</span>
                  <span />
                </div>
              )}
              <div className="space-y-2">
                {current.phrases.map((p, i) => (
                  <div
                    key={i}
                    className="soft-card grid items-center gap-2 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
                  >
                    <RowInput
                      value={p.ko}
                      onChange={(v) => updatePhrase(i, { ko: v })}
                      onBlur={() => autofillPhrase(i)}
                      placeholder="한국어"
                      lang="ko"
                      className="font-display text-2xl"
                    />
                    <RowInput
                      value={p.rr}
                      onChange={(v) => updatePhrase(i, { rr: v })}
                      placeholder="로마자 (RR)"
                      className="font-mono text-sm text-ink-soft"
                    />
                    <RowInput
                      value={p.en}
                      onChange={(v) => updatePhrase(i, { en: v })}
                      placeholder="영어 뜻"
                    />
                    <RemoveButton onClick={() => removePhrase(i)} />
                  </div>
                ))}
              </div>
              <AddButton onClick={addPhrase}>+ 표현 추가</AddButton>
            </section>

            {/* 숙제 — 무엇을 · 얼마나 · 어떻게 · 무엇으로 */}
            <section>
              <SectionLabel>숙제</SectionLabel>
              <p className="mb-2 text-sm text-ink-soft">
                방법과 분량까지 채우면 학생 포털에 &ldquo;무엇을 · 얼마나 ·
                어떻게&rdquo;가 그대로 보여요. 학생이 읽는 칸(숙제·방법)은 영어로
                적어 주세요.
              </p>
              <p className="mb-3 text-sm text-ink-soft">
                학생을 선택하면 자동 생성된{" "}
                <strong className="font-medium text-ink">제안 숙제</strong>가 비어
                있는 숙제에 자동으로 채워져요. 자동·불러온 숙제는 제안이니 자유롭게
                편집하거나 삭제하세요.
              </p>
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <button
                  type="button"
                  onClick={() => void loadSuggestedHomework()}
                  disabled={!hasStudent || planState === "loading"}
                  title="이 학생의 자동 생성 제안 숙제를 불러와 현재 숙제를 대체합니다"
                  className="min-h-9 rounded-full border border-ink-faint bg-paper px-4 py-1.5 text-sm font-medium text-ink-soft transition-colors enabled:hover:border-accent/50 enabled:hover:text-accent disabled:opacity-45"
                >
                  🪄 제안 숙제 불러오기
                </button>
                {planStatusText && (
                  <span role="status" className="font-mono text-[11px] text-ink-soft">
                    {planStatusText}
                  </span>
                )}
              </div>
              <div className="space-y-3">
                {current.homework.map((h, i) => (
                  <div key={i} className="soft-card space-y-3 p-4">
                    {/* 무엇을 */}
                    <div className="flex items-start gap-2">
                      <div className="grid flex-1 gap-3 sm:grid-cols-2">
                        <Field label="숙제 (영어)">
                          <RowInput
                            value={h.en}
                            onChange={(v) => updateHomework(i, { en: v })}
                            placeholder="예: Order coffee out loud 3 times"
                          />
                        </Field>
                        <Field label="한국어 (선택)">
                          <RowInput
                            value={h.ko}
                            onChange={(v) => updateHomework(i, { ko: v })}
                            placeholder="예: 커피 주문 3번 말하기"
                            lang="ko"
                          />
                        </Field>
                      </div>
                      <div className="pt-6">
                        <RemoveButton onClick={() => removeHomework(i)} />
                      </div>
                    </div>

                    {/* 얼마나 + 로마자 */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="분량·빈도 (선택)">
                        <RowInput
                          value={h.target}
                          onChange={(v) => updateHomework(i, { target: v })}
                          placeholder="예: 3 times a day · 5 min"
                        />
                      </Field>
                      <Field label="한국어 로마자 (선택)">
                        <RowInput
                          value={h.rr}
                          onChange={(v) => updateHomework(i, { rr: v })}
                          placeholder="예: keopi jumun se beon"
                          className="font-mono text-sm text-ink-soft"
                        />
                      </Field>
                    </div>

                    {/* 어떻게 */}
                    <Field label="방법 (영어 — 학생이 그대로 읽는 안내)">
                      <RowTextarea
                        value={h.how}
                        onChange={(v) => updateHomework(i, { how: v })}
                        placeholder="예: Read each phrase 3 times — once slowly, once at normal speed, once while recording yourself."
                      />
                    </Field>

                    {/* 무엇으로 — 연결 팩 + 연습 문장 */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="연결 팩 (선택)">
                        <select
                          value={h.packId}
                          onChange={(e) =>
                            updateHomework(i, { packId: e.target.value })
                          }
                          className="min-h-11 w-full rounded-xl border border-ink-faint bg-paper px-3.5 py-2 text-[15px] outline-none transition-colors focus:border-accent"
                        >
                          <option value="">연결 안 함</option>
                          {packs.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.title.ko} — {p.title.en}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <FieldBox label="연습 문장 (선택)">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => fillHomeworkPhrases(i)}
                            disabled={sessionPhrases.length === 0}
                            title="위 '새 표현'에 입력한 문장을 이 숙제에 담는다"
                            className="min-h-11 rounded-xl border border-ink-faint bg-paper px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors enabled:hover:border-accent/50 enabled:hover:text-accent disabled:opacity-45"
                          >
                            이 수업 표현 넣기
                            {sessionPhrases.length > 0
                              ? ` (${sessionPhrases.length})`
                              : ""}
                          </button>
                          {h.phrases.length > 0 && (
                            <button
                              type="button"
                              onClick={() => updateHomework(i, { phrases: [] })}
                              className="min-h-11 rounded-xl px-2.5 py-2 text-sm text-ink-soft transition-colors hover:text-accent"
                            >
                              비우기
                            </button>
                          )}
                        </div>
                      </FieldBox>
                    </div>

                    {h.phrases.length > 0 && (
                      <ul className="flex flex-wrap gap-2">
                        {h.phrases.map((p, pi) => (
                          <li
                            key={pi}
                            className="rounded-xl border border-ink-faint bg-paper px-3 py-1.5"
                          >
                            <span lang="ko" className="text-[15px]">
                              {p.ko}
                            </span>
                            {p.rr && (
                              <span className="ml-1.5 font-mono text-[11px] text-ink-soft">
                                {p.rr}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
              <AddButton onClick={addHomework}>+ 숙제 추가</AddButton>
            </section>

            {/* 학생 포털에 저장 */}
            <section className="soft-card p-5">
              <SectionLabel>학생 포털에 저장</SectionLabel>
              <p className="text-sm text-ink-soft">
                저장하면 새 표현과 교정 문장이 학생 포털에서 복습 퍼즐로 자동
                생성돼요
                {puzzleCount > 0 ? ` — 이번 수업에서 퍼즐 ${puzzleCount}개` : ""}.
              </p>
              <p className="mt-2 font-mono text-[11px] text-ink-soft">
                {lesson
                  ? `교정 ${lesson.corrections.length} · 표현 ${lesson.phrases.length} · 숙제 ${lesson.homework.length}`
                  : ""}
                {current.savedAt
                  ? ` · 마지막 저장 ${formatSavedAt(current.savedAt)}`
                  : ""}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void saveToPortal()}
                  disabled={saveState.status === "saving"}
                  className="min-h-11 rounded-xl bg-accent px-5 py-2.5 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
                >
                  {saveLabel}
                </button>
                {current.studentSlug && (
                  <a
                    href={`/s/${current.studentSlug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="min-h-11 rounded-xl border border-ink-faint px-4 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
                  >
                    학생 포털 열기 ↗
                  </a>
                )}
              </div>
              {saveState.message && (
                <p
                  role="status"
                  className={`mt-3 text-sm ${
                    saveState.status === "error" ? "text-accent" : "text-good"
                  }`}
                >
                  {saveState.message}
                </p>
              )}
            </section>
          </main>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── 큰 화면 모드(화면공유용) ─────────────────────────── */

function PresentView({ session }: { session: LiveSession }) {
  const corrections = session.corrections.filter((c) => c.fixed.trim() !== "");
  const phrases = session.phrases.filter((p) => p.ko.trim() !== "");
  const homework = session.homework.filter((h) => h.en.trim() !== "");

  return (
    <div className="flex-1 overflow-y-auto px-6 py-12">
      <div className="mx-auto max-w-3xl text-center">
        <p className="font-mono text-sm text-ink-soft">
          {session.studentName || "오늘의 수업"} · {session.date}
        </p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl">
          {session.topic || "라이브 수업"}
        </h1>

        {corrections.length > 0 && (
          <div className="mx-auto mt-12 max-w-2xl space-y-5 text-left">
            {corrections.map((c, i) => (
              <div key={i} className="soft-card p-6">
                {c.said && (
                  <p className="text-lg text-ink-soft line-through">{c.said}</p>
                )}
                <p
                  lang="ko"
                  className="fixed-line mt-2 w-fit font-display text-4xl sm:text-5xl"
                >
                  {c.fixed}
                </p>
                {c.rr && (
                  <p className="mt-2 font-mono text-lg text-ink-soft">{c.rr}</p>
                )}
                {c.note && (
                  <p className="mt-3 text-lg text-ink-soft">{c.note}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {phrases.length > 0 && (
          <div className="mx-auto mt-12 grid max-w-2xl gap-4 text-left sm:grid-cols-2">
            {phrases.map((p, i) => (
              <div key={i} className="soft-card p-6">
                <p lang="ko" className="font-display text-5xl">
                  {p.ko}
                </p>
                {p.rr && (
                  <p className="mt-2 font-mono text-lg text-ink-soft">{p.rr}</p>
                )}
                {p.en && <p className="mt-1 text-xl">{p.en}</p>}
              </div>
            ))}
          </div>
        )}

        {homework.length > 0 && (
          <div className="mx-auto mt-12 max-w-xl text-left">
            <p className="mb-2 font-mono text-[12px] tracking-[0.15em] text-ink-soft uppercase">
              숙제
            </p>
            <ul className="space-y-4 text-xl">
              {homework.map((h, i) => (
                <li key={i}>
                  <p>
                    • {h.en}
                    {h.ko && (
                      <span lang="ko" className="ml-2 text-ink-soft">
                        {h.ko}
                      </span>
                    )}
                  </p>
                  {h.target.trim() && (
                    <p className="mt-1.5 pl-5">
                      <span className="rounded-full bg-accent-wash px-3 py-1 font-mono text-sm text-accent">
                        ⏱ {h.target}
                      </span>
                    </p>
                  )}
                  {h.how.trim() && (
                    <p className="mt-1.5 pl-5 text-lg leading-relaxed text-ink-soft">
                      {h.how}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {corrections.length === 0 && phrases.length === 0 && homework.length === 0 && (
          <p className="mt-16 text-lg text-ink-soft">
            아직 기록이 없어요 — 입력 모드에서 작성을 시작해 주세요.
          </p>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────── 보조 컴포넌트 ────────────────────────────── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Field와 같은 라벨이지만 label 요소가 아니다 — 버튼처럼 입력이 아닌 요소를 담을 때 */
function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1.5 block font-mono text-[11px] tracking-[0.1em] text-ink-soft uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 font-mono text-[12px] tracking-[0.2em] text-accent uppercase">
      {children}
    </p>
  );
}

function RowInput({
  value,
  onChange,
  onBlur,
  placeholder,
  className = "",
  lang,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
  lang?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      lang={lang}
      className={`min-h-11 w-full rounded-xl border border-ink-faint bg-paper px-3.5 py-2 text-[15px] outline-none transition-colors focus:border-accent ${className}`}
    />
  );
}

/** 여러 줄 입력 — 숙제 방법처럼 문장이 길어지는 칸 */
function RowTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="min-h-11 w-full resize-y rounded-xl border border-ink-faint bg-paper px-3.5 py-2 text-[15px] leading-relaxed outline-none transition-colors focus:border-accent"
    />
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="행 삭제"
      title="행 삭제"
      className="flex size-9 items-center justify-center justify-self-center rounded-full text-ink-soft transition-colors hover:bg-accent-wash hover:text-accent sm:justify-self-auto"
    >
      ×
    </button>
  );
}

function AddButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2.5 min-h-9 rounded-full border border-dashed border-ink-faint px-4 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
    >
      {children}
    </button>
  );
}
