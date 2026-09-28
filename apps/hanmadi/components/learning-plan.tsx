"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { assessmentHref, learningLevels, type LearningProfile, type studyPlan } from "@/lib/adaptive-learning";
import type { Language } from "@/lib/courses";
export function LearningPlan({ language, profile, plan, studentSlug, onUpdate }: {
  language: Language; profile: LearningProfile; plan: ReturnType<typeof studyPlan>; studentSlug?: string;
  onUpdate: (profile: LearningProfile, plan: ReturnType<typeof studyPlan>) => void;
}) {
  const [minutes, setMinutes] = useState<number>(profile.minutes);
  const [days, setDays] = useState<number>(profile.days);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (lock.current) return;
    lock.current = true; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/learning-profile", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settings", language, studentSlug, assessmentId: profile.assessmentId, revision: profile.revision, minutes, days }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "저장하지 못했어요. 다시 시도해 주세요.");
      onUpdate(data.profile, data.plan); setNotice("학습 시간을 변경했어요. 레벨과 진도는 유지돼요.");
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인하고 다시 시도해 주세요."); }
    finally { lock.current = false; setBusy(false); }
  }
  const href = (id: string) => `/${profile.level === "beginner" && language !== "ko" ? "conversation" : "learn"}?${new URLSearchParams({ language, lesson: id, ...(studentSlug ? { s: studentSlug } : {}) })}#lesson`;
  const today = plan[0];
  return <section aria-label="맞춤 학습 계획" className="my-6 rounded-2xl border border-accent/30 bg-accent-wash p-5 sm:p-7">
    <p className="text-sm text-accent">나의 시작점 · {learningLevels[profile.level].label}</p>
    <h2 className="mt-2 font-display text-2xl">오늘부터 1주 학습 계획</h2>
    <p className="mt-2 text-sm text-ink-soft">하루 {profile.minutes}분 · 주 {profile.days}회 · {profile.timeZone} 기준</p>
    {today && <div className="mt-4 rounded-xl bg-card p-4">
      <h3 className="font-medium">오늘 · {today.title}{today.done ? " · 연습 기록 있음" : ""}</h3>
      <p className="mt-2 text-sm">{today.task}</p>
      <p className="mt-2 text-sm text-ink-soft">듣고 따라 말하기 {today.expressionMinutes}분 + 상황 회화 {today.minutes - today.expressionMinutes}분</p>
      <Link href={href(today.lessonId)} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm text-accent-ink">{today.done ? "오늘 학습 더 연습하기 →" : "오늘 학습 시작하기 →"}</Link>
    </div>}
    <details className="mt-3">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">이번 주 계획 펼치기 · 남은 {Math.max(0, plan.length - 1)}회</summary>
      <ol className="mt-2 grid gap-3 sm:grid-cols-2">{plan.slice(1).map(day => <li key={day.date} className="rounded-xl bg-card p-4">
        <p className="text-xs text-ink-soft">{day.date} · {day.type}</p>
        <h3 className="mt-2 font-medium">{day.title}</h3>
        <p className="mt-2 text-sm">{day.task}</p><p className="mt-2 text-xs text-ink-soft">{day.reason}</p>
        <Link href={href(day.lessonId)} className="mt-2 inline-flex min-h-11 items-center text-sm text-accent underline">이 수업 연습하기 →</Link>
      </li>)}</ol>
      <p className="mt-3 text-xs text-ink-soft">놓친 날은 숙제로 쌓지 않아요. 현재 기록을 바탕으로 오늘부터 다시 배치해요.</p>
    </details>
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">학습 시간 변경</summary>
      <form onSubmit={save} className="rounded-xl bg-card p-4">
        <div className="flex flex-wrap gap-4">
          <label>하루 <select aria-label="하루 학습 시간" value={minutes} disabled={busy} onChange={e => setMinutes(Number(e.target.value))} className="ml-2 rounded-lg bg-paper p-3">{[10, 15, 20].map(n => <option key={n} value={n}>{n}분</option>)}</select></label>
          <label>일주일 <select aria-label="주간 학습 횟수" value={days} disabled={busy} onChange={e => setDays(Number(e.target.value))} className="ml-2 rounded-lg bg-paper p-3">{[3, 5, 7].map(n => <option key={n} value={n}>{n}회</option>)}</select></label>
        </div>
        <button disabled={busy} className="mt-4 min-h-11 rounded-full bg-accent px-5 text-sm text-accent-ink disabled:opacity-50">{busy ? "저장 중…" : "시간 저장"}</button>
        {error && <p role="alert" className="mt-3 text-sm text-amber">{error}</p>}
        {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
      </form>
    </details>
    <Link href={assessmentHref(language, studentSlug)} className="inline-flex min-h-11 items-center text-sm text-accent underline">레벨 다시 체크</Link>
  </section>;
}
