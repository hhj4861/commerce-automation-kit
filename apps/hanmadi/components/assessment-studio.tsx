"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { languages, type Language } from "@/lib/courses";
import { learningLevels, type LearningProfile } from "@/lib/adaptive-learning";
import { useSessionDraft } from "@/lib/use-session-draft";

type Draft = { answers: Record<string, number>; minutes: number; days: number; step: number; speaking?: boolean; retake?: boolean };
const initialDraft: Draft = { answers: {}, minutes: 15, days: 5, step: 0 };
function validDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const v = value as Draft;
  return !!v.answers && typeof v.answers === "object" && !Array.isArray(v.answers) &&
    Object.values(v.answers).every(a => Number.isInteger(a) && a >= -1 && a <= 2) &&
    (v.speaking === undefined || typeof v.speaking === "boolean") && (v.retake === undefined || typeof v.retake === "boolean") && [10, 15, 20].includes(v.minutes) && [3, 5, 7].includes(v.days) && Number.isInteger(v.step) && v.step >= 0 && v.step <= 6;
}
export function AssessmentStudio({ language, studentSlug, questions, initialLessonId, cacheKey, existingProfile }: {
  language: Language; studentSlug?: string; initialLessonId?: string; cacheKey: string; existingProfile?: LearningProfile | null;
  questions: { id: string; prompt: string; choices: string[] }[];
}) {
  const [draft, setDraft, unavailable] = useSessionDraft(cacheKey, initialDraft, validDraft);
  const { answers, minutes, days, step } = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(existingProfile);
  const heading = useRef<HTMLHeadingElement>(null);
  const lock = useRef(false);
  function move(next: number) {
    setDraft(d => ({ ...d, step: next }));
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step < questions.length) { if (answers[questions[step].id] !== undefined) move(step + 1); return; }
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/learning-profile", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: draft.speaking ? "start-speaking" : "assess", language, studentSlug, answers, minutes, days, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }), signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "진단 결과를 저장하지 못했어요.");
      setProfile(data.profile); setDraft(initialDraft);
      requestAnimationFrame(() => heading.current?.focus());
    } catch (e) { setError(e instanceof Error && e.name !== "TimeoutError" && e.name !== "TypeError" ? e.message : "결과를 저장하지 못했어요. 답은 그대로 있으니 연결을 확인하고 다시 시도해 주세요."); }
    finally { lock.current = false; setBusy(false); }
  }
  const query = new URLSearchParams({ language, ...(initialLessonId ? { lesson: initialLessonId } : {}), ...(studentSlug ? { s: studentSlug } : {}) });
  if (profile && !draft.retake) return <section className="mt-8 rounded-2xl border border-accent bg-card p-6">
    <p className="text-sm text-accent">{profile.source === "first-speaking" ? "처음부터 듣고 말하기 · 시험 없이 시작" : `${profile.confirmed ? "저장된 학습 단계" : "1단계 완료"} · ${profile.score} / ${questions.length}개`}</p>
    <h2 ref={heading} tabIndex={-1} className="mt-3 scroll-mt-24 font-display text-3xl">{learningLevels[profile.level].label}부터 대화해 볼까요?</h2>
    <p className="mt-4 text-ink-soft">{profile.source === "first-speaking" ? "글자를 읽거나 쓸 필요 없어요. 짧은 소리를 듣고 따라 말한 뒤, 상황에 맞게 한마디씩 해 봐요." : profile.confirmed ? "현재 단계와 학습 계획이 저장되어 있어요. 다시 진단하면 이 언어의 시작 단계와 계획을 새로 정해요." : profile.level === "beginner" && language !== "ko" ? "문제 결과는 시작점의 참고예요. 소리를 듣고 따라 말한 뒤, 말해 본 느낌을 알려 주면 계획이 완성돼요." : "문제 결과를 저장했어요. AI와 두 번 대화하고 체감 난이도를 알려 주면 학습 계획이 완성돼요."}</p>
    <p className="mt-3">하루 {profile.minutes}분 · 주 {profile.days}회</p>
    <Link href={`/${profile.source === "first-speaking" ? "conversation" : profile.confirmed ? "learn" : "conversation"}?${query}`} className="mt-6 inline-flex min-h-12 items-center rounded-full bg-accent px-6 text-accent-ink">{profile.source === "first-speaking" ? "듣고 말하기 시작 →" : profile.confirmed ? "학습 이어가기 →" : "짧은 회화로 확인하기 →"}</Link>
    <button type="button" onClick={() => { setDraft({ ...initialDraft, retake: true, minutes: profile.minutes, days: profile.days }); }} className="mt-4 block min-h-11 text-sm text-accent underline">문제부터 다시 체크하기</button>
    <p className="mt-2 text-xs text-ink-soft">새 결과를 저장하기 전까지 현재 단계는 유지돼요. 저장하면 이 언어의 진도는 새 진단 기준으로 시작해요.</p>
  </section>;
  const q = questions[step];
  const answered = questions.filter(q => answers[q.id] !== undefined).length;
  return <form onSubmit={submit} className="mt-5 space-y-4">
    {step === 0 && language !== "ko" && <section className="rounded-2xl bg-accent-wash p-5" aria-label="처음 배우는 분">
      <p className="font-display text-2xl">아무것도 몰라도 괜찮아요.</p>
      <p className="mt-3 text-sm">글자를 읽거나 쓸 필요 없이, 소리를 듣고 따라 말하는 것부터 시작해요.</p>
      <button type="button" onClick={() => { setDraft(d => ({ ...d, speaking: true, step: questions.length })); requestAnimationFrame(() => heading.current?.focus()); }} className="mt-4 min-h-12 rounded-full bg-accent px-5 text-accent-ink">처음이에요 · 듣고 말하기부터</button>
    </section>}
    <p className="text-sm text-ink-soft">{draft.speaking ? "문자 시험 없이 입문부터 시작해요. 말해 본 느낌으로 다음 연습을 조절해요." : "배운 적이 있다면 아래 선택 문제로 시작점을 확인할 수 있어요. 쓰기 시험은 아니에요."}</p>
    <h2 ref={heading} tabIndex={-1} className="scroll-mt-24 font-display text-xl">{q ? `질문 ${step + 1} / ${questions.length}` : "마지막으로 학습 시간을 정해요"}</h2>
    <progress aria-label="레벨 체크 진행" value={answered} max={questions.length} className="h-2 w-full accent-[var(--accent)]" />
    {q ? <fieldset key={q.id} className="rounded-2xl border border-ink-faint bg-card p-5">
      <legend className="px-2 font-medium">{q.prompt}</legend>
      <div className="grid gap-3">{[...q.choices, "모르겠어요"].map((choice, i) => {
        const value = i === q.choices.length ? -1 : i;
        return <label key={i} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 ${answers[q.id] === value ? "border-accent bg-accent-wash" : "border-ink-faint"}`}>
          <input type="radio" name={q.id} value={value} checked={answers[q.id] === value} required onChange={() => setDraft(d => ({ ...d, answers: { ...d.answers, [q.id]: value } }))} /><span>{choice}</span>
        </label>;
      })}</div>
    </fieldset> : <fieldset className="rounded-2xl bg-accent-wash p-5">
      <legend className="px-2 font-medium">무리 없이 이어갈 학습 시간</legend>
      <div className="flex flex-wrap gap-5">
        <label>하루 <select value={minutes} onChange={e => setDraft(d => ({ ...d, minutes: Number(e.target.value) }))} disabled={busy} className="ml-2 rounded-lg bg-card p-3">{[10, 15, 20].map(v => <option key={v} value={v}>{v}분</option>)}</select></label>
        <label>일주일 <select value={days} onChange={e => setDraft(d => ({ ...d, days: Number(e.target.value) }))} disabled={busy} className="ml-2 rounded-lg bg-card p-3">{[3, 5, 7].map(v => <option key={v} value={v}>{v}회</option>)}</select></label>
      </div>
      <p className="mt-4 text-sm text-ink-soft">공인 등급이 아닌 학습 시작점이에요. 발음이나 듣기 능력은 채점하지 않아요.</p>
    </fieldset>}
    {error && <p role="alert" className="text-amber">{error}</p>}
    <div className="flex justify-between gap-3">
      <button type="button" disabled={busy || step === 0} onClick={() => { if (draft.speaking) { setDraft(d => ({ ...d, speaking: false, step: 0 })); } else move(step - 1); }} className="min-h-12 rounded-full border border-ink-faint px-6 disabled:opacity-40">이전</button>
      <button type="submit" disabled={busy || (q ? answers[q.id] === undefined : !draft.speaking && answered !== questions.length)} className="min-h-12 rounded-full bg-accent px-6 text-accent-ink disabled:opacity-50">{busy ? "결과 저장 중…" : q ? "다음" : draft.speaking ? "듣고 말하기로 시작" : `${languages[language].name} 시작 단계 확인`}</button>
    </div>
    <p className="text-xs text-ink-soft">{unavailable ? "이 브라우저에서는 임시 저장이 안 돼요. 이 화면에서 체크를 마쳐 주세요." : "이 탭에서 새로고침해도 24시간 동안 이어서 풀 수 있어요."}</p>
  </form>;
}
