import Link from "next/link";
import { assessmentHref, learningLevels, type LearningProfile, type studyPlan } from "@/lib/adaptive-learning";
import type { Language } from "@/lib/courses";
export function LearningPlan({ language, profile, plan, studentSlug }: {
  language: Language; profile: LearningProfile; plan: ReturnType<typeof studyPlan>; studentSlug?: string;
}) {
  return <section aria-label="맞춤 학습 계획" className="my-8 rounded-2xl border border-accent/30 bg-accent-wash p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm text-accent">나의 시작점 · {learningLevels[profile.level].label}</p><h2 className="mt-2 font-display text-2xl">오늘부터 1주 학습 계획</h2><p className="mt-2 text-sm text-ink-soft">하루 {profile.minutes}분 · 주 {profile.days}회 · {profile.timeZone} 기준</p></div>
      <Link href={assessmentHref(language, studentSlug)} className="text-sm text-accent underline">시간 변경·레벨 다시 체크</Link>
    </div>
    <p className="mt-4 text-sm">{learningLevels[profile.level].task}. 어려웠던 확인 문제는 다음 날 계획에서 먼저 복습해요.</p>
    <ol className="mt-5 grid gap-3 sm:grid-cols-2">
      {plan.map((day, i) => <li key={day.date} className="rounded-xl bg-card p-4">
        <p className="text-xs text-ink-soft">{i === 0 ? "오늘 · " : ""}{day.date} · {day.type}{day.done ? " · 확인 완료" : ""}</p>
        <h3 className="mt-2 font-medium">{day.title}</h3>
        <p className="mt-2 text-sm">{day.task}</p>
        <p className="mt-2 text-sm">표현 {day.expressionMinutes}분 + 회화 {day.minutes - day.expressionMinutes}분</p>
        <p className="mt-2 text-xs text-ink-soft">{day.reason}</p>
        <Link href={`/learn?${new URLSearchParams({ language, lesson: day.lessonId, ...(studentSlug ? { s: studentSlug } : {}) })}`} className="mt-3 inline-block text-sm text-accent underline">이 수업 연습하기 →</Link>
      </li>)}
    </ol>
    <p className="mt-4 text-xs text-ink-soft">놓친 날은 밀린 숙제로 쌓지 않아요. 현재 기록을 바탕으로 오늘부터 다시 배치합니다. 새 단계는 회화 난이도 피드백이나 재진단으로 조절해요.</p>
  </section>;
}
