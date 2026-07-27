"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PackLevel } from "@/data/types";
import { CopyButton } from "@/components/copy-button";

/**
 * 학생 관리 — 진입 화면은 "등록 / 관리" 두 장의 카드다.
 * 등록은 모달에서, 관리는 목록 화면으로 전환해서 처리한다.
 * (예전에는 등록 폼과 목록이 한 화면에 같이 있어 수업 직전에 눈이 분산됐다)
 * 튜터 전용 화면이므로 전면 한국어.
 */

type StudentRow = {
  slug: string;
  name: string;
  level: PackLevel;
  goal?: string;
  lessonCount: number;
  phraseCount: number;
};

/** 카드 화면 ↔ 목록 화면 */
type View = "cards" | "list";

const LEVELS: { value: PackLevel; ko: string; en: string }[] = [
  { value: "absolute-beginner", ko: "완전 초보", en: "Absolute Beginner" },
  { value: "beginner", ko: "초보", en: "Beginner" },
  { value: "upper-beginner", ko: "초중급", en: "Upper Beginner" },
];

const LEVEL_KO: Record<PackLevel, string> = {
  "absolute-beginner": "완전 초보",
  beginner: "초보",
  "upper-beginner": "초중급",
};

/** 서버(app/api/students/route.ts)와 동일한 slug 규칙 */
const SLUG_PATTERN = /^[a-z0-9가-힣-]{2,40}$/;

/** 모달 안에서 Tab을 순환시킬 때 훑는 요소들 */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

/** lib/students.ts의 suggestSlug와 같은 규칙 — 이름에서 기본 slug를 만든다 */
function slugBase(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "") || "student"
  );
}

/** 추측하기 어려운 임의 접미사 — 포털은 로그인 없는 비공개 링크라 필수 */
function randomSuffix(): string {
  // l/1, o/0 처럼 헷갈리는 글자는 제외 (튜터가 채팅으로 불러 줄 수도 있어서)
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export default function StudentAdminPage() {
  const [view, setView] = useState<View>("cards");

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  // 방금 등록한 학생 — 목록에서 강조 + 링크 복사 배너의 근거가 된다
  const [created, setCreated] = useState<{ name: string; slug: string } | null>(
    null,
  );

  // ── 등록 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [level, setLevel] = useState<PackLevel>("absolute-beginner");
  const [goal, setGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // 서버 렌더에서 난수를 쓰면 hydration이 어긋나므로 이벤트 시점에만 만든다
  const suffixRef = useRef<string | null>(null);
  function suffix(): string {
    if (!suffixRef.current) suffixRef.current = randomSuffix();
    return suffixRef.current;
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/students", { cache: "no-store" });
      if (!res.ok) {
        setListError(
          res.status === 403
            ? "로그인이 만료됐어요. 다시 로그인해 주세요."
            : "학생 목록을 불러오지 못했어요.",
        );
        return;
      }
      const data = (await res.json()) as { students?: StudentRow[] };
      setStudents(data.students ?? []);
      setListError(null);
    } catch {
      setListError("연결에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 최초 1회 목록 로드 — 카드에 학생 수를 보여줘야 해서 진입하자마자 불러온다.
    // 상태 갱신은 fetch 응답 이후(비동기)에만 일어난다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  /* ─────────────────────────── 모달 열고 닫기 ─────────────────────────── */

  const openModal = useCallback(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    // 열 때마다 빈 폼으로 시작 — 직전 입력이 남아 엉뚱한 학생이 등록되는 걸 막는다
    setName("");
    setSlug("");
    setSlugTouched(false);
    setLevel("absolute-beginner");
    setGoal("");
    setFormError(null);
    setCreated(null);
    suffixRef.current = null; // 학생마다 새 접미사
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    if (busy) return; // 등록 중에는 닫지 않는다 (요청 결과를 놓치지 않도록)
    setModalOpen(false);
    // 모달을 연 버튼으로 포커스 복귀 — 화면이 바뀌어 사라졌으면 건너뛴다
    const trigger = restoreFocusRef.current;
    if (trigger && document.contains(trigger)) trigger.focus();
    restoreFocusRef.current = null;
  }, [busy]);

  // ESC로 닫기
  useEffect(() => {
    if (!modalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, closeModal]);

  // 열려 있는 동안 배경 스크롤 잠금
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [modalOpen]);

  // 열릴 때 첫 입력(이름)에 포커스
  useEffect(() => {
    if (modalOpen) nameInputRef.current?.focus();
  }, [modalOpen]);

  /** 모달 안에서만 Tab이 돌도록 가둔다 */
  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /* ───────────────────────────── 등록 / 삭제 ───────────────────────────── */

  function changeName(value: string) {
    setName(value);
    if (slugTouched) return;
    setSlug(value.trim() ? `${slugBase(value)}-${suffix()}` : "");
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const trimmedName = name.trim();
    const trimmedSlug = (
      slug.trim() || `${slugBase(trimmedName)}-${suffix()}`
    ).toLowerCase();

    if (!trimmedName) {
      setFormError("학생 이름을 입력해 주세요.");
      nameInputRef.current?.focus();
      return;
    }
    if (!SLUG_PATTERN.test(trimmedSlug)) {
      setFormError("포털 주소는 소문자·숫자·하이픈 2~40자로 입력해 주세요.");
      return;
    }
    if (students.some((s) => s.slug === trimmedSlug)) {
      setFormError(
        "이미 같은 포털 주소를 쓰는 학생이 있어요. 주소를 바꿔 주세요.",
      );
      return;
    }

    setBusy(true);
    setFormError(null);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student: {
            slug: trimmedSlug,
            name: trimmedName,
            level,
            goal: goal.trim() || undefined,
          },
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        slug?: string;
        error?: string;
      } | null;

      if (!res.ok || !data?.ok) {
        // 409(주소 중복)·400 등 서버가 준 이유를 그대로 보여준다
        setFormError(
          data?.error ??
            (res.status === 403
              ? "로그인이 만료됐어요. 다시 로그인해 주세요."
              : "학생을 등록하지 못했어요."),
        );
        return;
      }

      const newSlug = data.slug ?? trimmedSlug;
      setModalOpen(false);
      restoreFocusRef.current = null;
      setCreated({ name: trimmedName, slug: newSlug });
      setListError(null);
      setView("list"); // 등록하면 바로 목록에서 결과를 확인한다
      await load();
    } catch {
      setFormError("연결에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(student: StudentRow) {
    const confirmed = window.confirm(
      `${student.name} 학생을 삭제할까요?\n\n` +
        `수업 기록 ${student.lessonCount}회와 배운 표현 ${student.phraseCount}개가 함께 사라지고, ` +
        `포털 링크(/s/${student.slug})도 더 이상 열리지 않아요.\n` +
        `되돌릴 수 없어요.`,
    );
    if (!confirmed) return;

    setRemoving(student.slug);
    setListError(null);
    if (created?.slug === student.slug) setCreated(null);
    try {
      const res = await fetch("/api/students", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: student.slug }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!data?.ok) {
        setListError(
          data?.error ??
            (res.status === 403
              ? "로그인이 만료됐어요. 다시 로그인해 주세요."
              : `${student.name} 학생을 삭제하지 못했어요.`),
        );
      }
      await load();
    } catch {
      setListError("연결에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setRemoving(null);
    }
  }

  /* ─────────────────────────────── 화면 ─────────────────────────────── */

  const countLabel = loading ? "불러오는 중…" : `학생 ${students.length}명`;

  return (
    <div className="mx-auto max-w-3xl px-5 pt-12 pb-24 sm:pt-16">
      <Link href="/" className="text-sm text-ink-soft hover:text-accent">
        ← 허브로
      </Link>
      <h1 className="mt-4 font-display text-4xl">학생 관리</h1>
      <p className="mt-3 max-w-[52ch] text-[16px] leading-relaxed text-ink-soft">
        학생을 등록하면 바로 포털 주소가 생겨요. 수업이 끝나면 라이브 노트에서
        기록을 저장하고, 링크를 채팅으로 보내 주세요. 코드 수정이나 재배포는
        필요 없어요.
      </p>
      <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent-wash px-3.5 py-1.5 text-[13px] text-accent">
        <span aria-hidden="true">🔒</span>
        학생은 담당 튜터에게만 보여요
      </p>

      {view === "cards" ? (
        /* ── 진입 화면: 등록 / 관리 두 갈래 */
        <section aria-label="학생 관리 메뉴" className="mt-8">
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={openModal}
              className="soft-card group flex flex-col p-6 text-left transition-colors hover:border-accent/60"
            >
              <span className="font-mono text-[11px] tracking-[0.2em] text-accent">
                NEW
              </span>
              <span className="mt-2 font-display text-2xl group-hover:text-accent">
                학생 등록
              </span>
              <span className="mt-3 text-[15px] leading-relaxed text-ink-soft">
                새 학생을 추가하고 포털 링크를 만들어요.
              </span>
              <span className="mt-auto pt-5 text-sm font-medium text-accent">
                등록 창 열기 →
              </span>
            </button>

            <button
              type="button"
              onClick={() => setView("list")}
              className="soft-card group flex flex-col p-6 text-left transition-colors hover:border-accent/60"
            >
              <span className="font-mono text-[11px] tracking-[0.2em] text-accent">
                MANAGE
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-2 font-display text-2xl group-hover:text-accent">
                학생 관리
                <span className="rounded-full bg-accent-wash px-2.5 py-1 font-mono text-[11px] tracking-[0.03em] text-accent">
                  {countLabel}
                </span>
              </span>
              <span className="mt-3 text-[15px] leading-relaxed text-ink-soft">
                등록된 학생을 확인하고 포털 링크 복사·삭제를 할 수 있어요.
              </span>
              <span className="mt-auto pt-5 text-sm font-medium text-accent">
                목록 열기 →
              </span>
            </button>
          </div>

          <p className="mt-5 flex items-start gap-2 rounded-xl border border-ink-faint bg-paper px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
            <span aria-hidden="true">🧭</span>
            <span>
              학생에게 레벨 진단 링크를 보내면 스스로 레벨을 확인하고, 결과가
              여기로 전달돼요.
            </span>
          </p>

          {listError && (
            <p role="alert" className="mt-4 text-sm text-accent">
              {listError}
            </p>
          )}
        </section>
      ) : (
        /* ── 목록 화면 */
        <section aria-label="등록된 학생" className="mt-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setView("cards")}
              className="min-h-11 rounded-full border border-ink-faint bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
            >
              ← 카드로 돌아가기
            </button>
            <button
              type="button"
              onClick={openModal}
              className="min-h-11 rounded-full bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-strong"
            >
              학생 등록
            </button>
          </div>

          {/* 방금 등록한 학생 — 포털 링크를 바로 복사해서 채팅으로 보낸다 */}
          {created && (
            <div className="mt-5 rounded-xl border border-good/40 bg-good-wash/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[15px] font-medium text-good">
                  {created.name} 학생을 등록했어요 🎉
                </p>
                <button
                  type="button"
                  onClick={() => setCreated(null)}
                  aria-label="등록 안내 닫기"
                  className="-m-2 shrink-0 p-2 text-ink-soft transition-colors hover:text-accent"
                >
                  ✕
                </button>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                아래 링크를 채팅으로 보내면 바로 열려요. 수업 기록은 라이브
                노트에서 저장하면 이 포털에 쌓입니다.
              </p>

              <p className="mt-4 text-[13px] font-medium text-good">
                포털 링크
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 rounded-lg border border-ink-faint bg-paper px-3 py-2 font-mono text-[12px] break-all">
                  /s/{created.slug}
                </code>
                <CopyButton
                  path={`/s/${created.slug}`}
                  label="링크 복사"
                  copiedLabel="복사됨!"
                  className="min-h-11 shrink-0 rounded-full border border-ink-faint bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
                />
              </div>

              <p className="mt-4 text-[13px] font-medium text-good">
                레벨 진단 링크
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                새 학생은 아직 레벨을 모르니, 먼저 진단 링크를 보내 스스로 레벨을
                확인하도록 권해 주세요. 결과는 여기로 전달돼요.
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 rounded-lg border border-ink-faint bg-paper px-3 py-2 font-mono text-[12px] break-all">
                  /level-test?s={created.slug}
                </code>
                <CopyButton
                  path={`/level-test?s=${created.slug}`}
                  label="링크 복사"
                  copiedLabel="복사됨!"
                  className="min-h-11 shrink-0 rounded-full border border-ink-faint bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
                />
              </div>
            </div>
          )}

          <h2 className="mt-8 mb-1 font-display text-2xl">
            등록된 학생
            {!loading && students.length > 0 && (
              <span className="ml-2 font-mono text-[13px] text-ink-soft">
                {students.length}명
              </span>
            )}
          </h2>
          <p className="mb-4 text-[14px] text-ink-soft">
            학생을 누르면 수업 진행·복습 현황·다음 수업 자료를 볼 수 있어요.
          </p>

          {listError && (
            <p role="alert" className="mb-4 text-sm text-accent">
              {listError}
            </p>
          )}

          {loading ? (
            <p className="text-ink-soft">학생 목록을 불러오는 중…</p>
          ) : students.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-ink-faint p-8 text-center leading-relaxed text-ink-soft">
              아직 등록한 학생이 없어요 — <b className="text-ink">학생 등록</b>
              으로 시작하세요.
            </p>
          ) : (
            <ul className="space-y-3">
              {students.map((s) => (
                <li
                  key={s.slug}
                  className={`soft-card group relative p-5 transition-colors hover:border-accent/50 ${
                    created?.slug === s.slug
                      ? "border-good/60 ring-2 ring-good/30"
                      : ""
                  }`}
                >
                  {/*
                    행 전체가 튜터용 학생 상세로 가는 링크.
                    버튼(링크 복사·삭제)은 아래에서 z-10으로 이 오버레이 위에 올린다
                    — 링크 안에 버튼을 중첩하지 않으려는 구조다.
                  */}
                  <Link
                    href={`/admin/students/${s.slug}`}
                    aria-label={`${s.name} 학생 상세 보기`}
                    className="absolute inset-0 rounded-[16px] outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  />
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-medium transition-colors group-hover:text-accent">
                          {s.name}
                        </span>
                        <span
                          aria-hidden="true"
                          className="text-ink-soft transition-colors group-hover:text-accent"
                        >
                          →
                        </span>
                        <span className="rounded-full bg-accent-wash px-2.5 py-1 font-mono text-[11px] tracking-[0.03em] text-accent">
                          {LEVEL_KO[s.level]}
                        </span>
                        {created?.slug === s.slug && (
                          <span className="rounded-full bg-good-wash px-2.5 py-1 font-mono text-[11px] tracking-[0.03em] text-good">
                            방금 등록
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-[12px] break-all text-ink-soft">
                        /s/{s.slug} · 수업 {s.lessonCount}회 · 표현{" "}
                        {s.phraseCount}개
                      </p>
                      {s.goal && (
                        <p className="mt-1.5 max-w-[46ch] text-[14px] leading-relaxed text-ink-soft">
                          🎯 {s.goal}
                        </p>
                      )}
                    </div>
                    <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        href={`/s/${s.slug}`}
                        className="flex min-h-11 items-center rounded-full border border-ink-faint bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
                      >
                        학생 화면
                      </Link>
                      <CopyButton
                        path={`/s/${s.slug}`}
                        label="포털 링크"
                        copiedLabel="복사됨!"
                        className="min-h-11 rounded-full border border-ink-faint bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
                      />
                      <CopyButton
                        path={`/level-test?s=${s.slug}`}
                        label="진단 링크"
                        copiedLabel="복사됨!"
                        className="min-h-11 rounded-full border border-ink-faint bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
                      />
                      <button
                        type="button"
                        onClick={() => remove(s)}
                        disabled={removing === s.slug}
                        className="min-h-11 rounded-full border border-ink-faint px-4 py-2 text-sm text-ink-soft transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-60"
                      >
                        {removing === s.slug ? "삭제 중…" : "삭제"}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── 등록 모달 */}
      {modalOpen && (
        <div
          // 배경 클릭으로 닫기 — mousedown 기준이라 폼 안에서 드래그해 나가도 닫히지 않는다
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink/40 sm:items-center sm:p-6"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-student-title"
            onKeyDown={trapTab}
            // soft-card는 border-radius가 고정이라 여기서는 유틸리티로 직접 그린다
            // (모바일은 아래에서 올라오는 시트라 위쪽만 둥글어야 한다)
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-ink-faint bg-card p-6 shadow-2xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="create-student-title" className="font-display text-2xl">
                  학생 등록
                </h2>
                <p className="mt-1 text-[14px] text-ink-soft">
                  등록하면 바로 포털 주소가 만들어져요.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={busy}
                aria-label="등록 창 닫기"
                className="-mt-2 -mr-2 flex min-h-11 min-w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:text-accent disabled:opacity-60"
              >
                ✕
              </button>
            </div>

            <form onSubmit={create} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[15px] font-medium">
                    이름 <span className="text-accent">*</span>
                  </span>
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={name}
                    onChange={(e) => {
                      changeName(e.target.value);
                      setFormError(null);
                    }}
                    placeholder="Emma"
                    required
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-ink-faint bg-paper px-4 py-2 text-[16px] outline-none transition-colors focus:border-accent"
                  />
                  <span className="mt-1 block text-[13px] text-ink-soft">
                    포털 인사에 쓰이는 이름 — 학생이 부르는 이름 그대로.
                  </span>
                </label>

                <label className="block">
                  <span className="text-[15px] font-medium">레벨</span>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value as PackLevel)}
                    className="mt-1.5 min-h-11 w-full rounded-xl border border-ink-faint bg-paper px-4 py-2 text-[16px] outline-none transition-colors focus:border-accent"
                  >
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.ko} · {l.en}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[13px] text-ink-soft">
                    추천 학습 팩을 고르는 기준이 돼요.
                  </span>
                </label>
              </div>

              <label className="block">
                <span className="text-[15px] font-medium">포털 주소</span>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-ink-faint bg-paper px-4 transition-colors focus-within:border-accent">
                  <span className="shrink-0 font-mono text-[14px] text-ink-soft">
                    /s/
                  </span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugTouched(true);
                      setFormError(null);
                    }}
                    placeholder="emma-k7x2p"
                    className="min-h-11 w-full min-w-0 bg-transparent py-2 font-mono text-[15px] outline-none"
                  />
                </div>
                <span className="mt-1 block text-[13px] leading-relaxed text-ink-soft">
                  이름에서 자동으로 만들어져요. 로그인 없이 열리는 비공개 링크라
                  추측하기 어려운 접미사가 붙어요 — 바꿔도 되지만 짧게 줄이지는
                  마세요.
                </span>
              </label>

              <label className="block">
                <span className="text-[15px] font-medium">
                  학습 목표{" "}
                  <span className="font-normal text-ink-soft">(선택)</span>
                </span>
                <input
                  type="text"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="Watch K-dramas without subtitles someday"
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-ink-faint bg-paper px-4 py-2 text-[16px] outline-none transition-colors focus:border-accent"
                />
                <span className="mt-1 block text-[13px] text-ink-soft">
                  학생 포털 헤더에 그대로 보여요 — 영어로 적어 주세요.
                </span>
              </label>

              {formError && (
                <p role="alert" className="text-sm text-accent">
                  {formError}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={busy}
                  className="min-h-11 rounded-full border border-ink-faint bg-card px-5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent disabled:opacity-60"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="min-h-11 rounded-full bg-accent px-6 py-2 font-medium text-white transition-colors hover:bg-accent-strong disabled:opacity-60"
                >
                  {busy ? "등록하는 중…" : "학생 등록"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
