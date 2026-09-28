"use client";
import { useState } from "react";
import Link from "next/link";
import { languages, type Language } from "@/lib/courses";
import { learningLevels, type LearningProfile } from "@/lib/adaptive-learning";

export function AssessmentStudio({ language, studentSlug, questions, initialLessonId }: {
  language: Language; studentSlug?: string; initialLessonId?: string;
  questions: { id: string; prompt: string; choices: string[] }[];
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [minutes, setMinutes] = useState(15);
  const [days, setDays] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/learning-profile", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assess", language, studentSlug, answers, minutes, days, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "진단 결과를 저장하지 못했어요.");
      setProfile(data.profile);
    } catch (e) { setError(e instanceof Error ? e.message : "연결을 확인하고 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  const query = new URLSearchParams({ language, ...(initialLessonId ? { lesson: initialLessonId } : {}), ...(studentSlug ? { s: studentSlug } : {}) });
  if (profile) return <section className="mt-10 rounded-2xl border border-accent bg-card p-7" aria-live="polite">
    <p className="text-sm text-accent">1단계 완료 · {profile.score} / {questions.length}개</p>
    <h2 className="mt-3 font-display text-3xl">{learningLevels[profile.level].label}부터 대화해 볼까요?</h2>
    <p className="mt-4 text-ink-soft">문제 결과로 고른 임시 시작 단계예요. 이제 AI와 두 번 대화하고 체감 난이도를 알려 주면 학습 계획이 완성돼요.</p>
    <p className="mt-3">하루 {profile.minutes}분 · 주 {profile.days}회</p>
    <Link href={`/conversation?${query}`} className="mt-6 inline-flex min-h-12 items-center rounded-full bg-accent px-6 text-white">짧은 회화로 확인하기 →</Link>
  </section>;
  return <form onSubmit={submit} className="mt-8 space-y-6">
    <p className="text-sm text-ink-soft">1 / 2단계 · 짧은 문제 → 텍스트 회화. 모르는 문제는 편하게 ‘모르겠어요’를 선택하세요.</p>
    {questions.map((q, index) => <fieldset key={q.id} className="rounded-2xl border border-ink-faint bg-card p-5 sm:p-7">
      <legend className="px-2 font-medium">{index + 1}. {q.prompt}</legend>
      <div className="grid gap-3">
        {[...q.choices, "모르겠어요"].map((choice, i) => {
          const value = i === q.choices.length ? -1 : i;
          return <label key={i} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 ${answers[q.id] === value ? "border-accent bg-accent-wash" : "border-ink-faint"}`}>
            <input type="radio" name={q.id} value={value} checked={answers[q.id] === value} disabled={busy} required onChange={() => setAnswers(a => ({ ...a, [q.id]: value }))} />
            <span>{choice}</span>
          </label>;
        })}
      </div>
    </fieldset>)}
    <fieldset className="rounded-2xl bg-accent-wash p-6">
      <legend className="px-2 font-medium">무리 없이 이어갈 학습 시간</legend>
      <div className="flex flex-wrap gap-5">
        <label>하루 <select value={minutes} onChange={e => setMinutes(Number(e.target.value))} disabled={busy} className="ml-2 rounded-lg bg-card p-3">{[10, 15, 20].map(v => <option key={v} value={v}>{v}분</option>)}</select></label>
        <label>일주일 <select value={days} onChange={e => setDays(Number(e.target.value))} disabled={busy} className="ml-2 rounded-lg bg-card p-3">{[3, 5, 7].map(v => <option key={v} value={v}>{v}회</option>)}</select></label>
      </div>
      <p className="mt-4 text-sm text-ink-soft">결과는 공인 등급이 아닌 학습 시작점이에요. 읽기·표현 이해와 회화 체감을 확인하며, 발음이나 듣기 능력은 채점하지 않아요.</p>
    </fieldset>
    {error && <p role="alert" className="text-amber">{error}</p>}
    <button type="submit" disabled={busy || Object.keys(answers).length !== questions.length} className="min-h-12 rounded-full bg-accent px-7 text-white disabled:opacity-50">{busy ? "결과 저장 중…" : `${languages[language].name} 시작 단계 확인`}</button>
  </form>;
}
