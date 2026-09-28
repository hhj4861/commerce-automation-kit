"use client";
import { LearningPlan } from "./learning-plan";
import { learningTask, type LearningProfile, type studyPlan } from "@/lib/adaptive-learning";
import { languageSelectionHref } from "@/lib/learning-language";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { courses, languages, koreanReadings, type Language, type Lesson } from "@/lib/courses";

export function LearningStudio({
  initialLanguage,
  studentSlug,
  initialLessonId, initialProfile, initialPlan,
}: {
  initialLanguage: Language;
  studentSlug?: string;
  initialLessonId?: string; initialProfile?: LearningProfile | null; initialPlan?: ReturnType<typeof studyPlan>;
}) {
  const language = initialLanguage;
  const [lessonId, setLessonId] = useState(courses[language].find(l => l.id === initialLessonId)?.id ?? "greetings");
  const [profile, setProfile] = useState(initialProfile);
  const [plan, setPlan] = useState(initialPlan);
  const [sessionCompleted, setCompleted] = useState<string[]>([]);
  const [storageNote, setStorageNote] = useState("");
  const progressKey = `hanmadi:courses:v1:${studentSlug ?? "guest"}`;
  const savedProgress = useSyncExternalStore(
    subscribeProgress,
    () => {
      try {
        return localStorage.getItem(progressKey);
      } catch {
        return null;
      }
    },
    () => null,
  );
  let saved: string[] = [];
  try {
    const value: unknown = JSON.parse(savedProgress ?? "[]");
    if (Array.isArray(value))
      saved = value.filter((v): v is string => typeof v === "string");
  } catch {
    /* A corrupt cache does not prevent a new lesson. */
  }
  const completed = profile ? profile.completed.map(id => `${language}:${id}`) : [...new Set([...saved, ...sessionCompleted])];
  const lesson = courses[language].find((l) => l.id === lessonId)!;
  function complete() {
    const next = [...new Set([...completed, `${language}:${lesson.id}`])];
    setCompleted(next);
    try {
      localStorage.setItem(progressKey, JSON.stringify(next));
      window.dispatchEvent(new Event("hanmadi-course-progress"));
    } catch {
      setStorageNote("진도를 저장하지 못했어요. 현재 화면에서만 유지돼요.");
    }
  }
  async function recordAnswer(answer: number) {
    if (!profile) { if (answer === lesson.quiz.answer) complete(); return; }
    const response = await fetch("/api/learning-profile", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "quiz", language, studentSlug, assessmentId: profile.assessmentId, revision: profile.revision, lessonId: lesson.id, answer }), signal: AbortSignal.timeout(15000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "진도 저장에 실패했어요. 다시 선택해 주세요.");
    setProfile(data.profile); setPlan(data.plan);
  }
  const query = new URLSearchParams({ language, lesson: lesson.id });
  if (studentSlug) query.set("s", studentSlug);
  return (
    <div lang="ko" className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
      <h1 className="font-display text-4xl sm:text-5xl">
        {languages[language].name}로 한마디씩
      </h1>
      <p className="mt-4 text-ink-soft">
        표현을 익히고, 퀴즈로 확인하고, AI와 한마디씩 대화해요.
      </p>
      <div className="my-8 flex flex-wrap items-center gap-4">
        <span className="rounded-full bg-accent-wash px-4 py-2 text-accent">학습 중 · {languages[language].name}</span>
        <Link href={languageSelectionHref(`/learn?${query}`)} className="text-sm text-accent underline">학습 언어 변경</Link>
      </div>
      {profile && plan ? <LearningPlan language={language} profile={profile} plan={plan} studentSlug={studentSlug} /> : <p className="mb-6 text-sm text-ink-soft">미리보기예요. 로그인하거나 학생 개인 링크로 열면 레벨 체크와 맞춤 계획을 저장할 수 있어요.</p>}
      <div className="grid gap-8 md:grid-cols-[220px_1fr]">
        <aside>
          <h2 className="font-display text-xl">입문 회화</h2>
          <p className="my-2 text-sm text-ink-soft">
            {
              courses[language].filter((l) =>
                completed.includes(`${language}:${l.id}`),
              ).length
            }{" "}
            / {courses[language].length} 수업 완료
          </p>
          <nav aria-label="수업 선택" className="mt-4 flex flex-col gap-2">
            {courses[language].map((l, i) => (
              <button
                key={l.id}
                type="button"
                aria-current={l.id === lessonId ? "step" : undefined}
                onClick={() => setLessonId(l.id)}
                className={`rounded-lg px-3 py-3 text-left text-base ${l.id === lessonId ? "bg-ink text-paper" : "hover:bg-accent-wash"}`}
              >
                {i + 1}. {l.title}
                {completed.includes(`${language}:${l.id}`) ? " ✓" : ""}
              </button>
            ))}
          </nav>
          {language === "ko" && (
            <Link
              href="/library"
              className="mt-6 block text-sm text-accent underline"
            >
              기존 한글·문법 학습 팩 열기
            </Link>
          )}
          <p className="mt-6 text-xs leading-relaxed text-ink-soft">
            {profile ? "진도와 계획은 언어별로 서버에 저장돼요. 확인 문제는 하루 첫 응답으로 복습을 정해요." : "미리보기 진도는 이 브라우저에 저장돼요."}
          </p>
          {storageNote && (
            <p role="status" className="mt-3 text-sm text-amber">
              {storageNote}
            </p>
          )}
        </aside>
        <section aria-label={lesson.title}>
          <p
            lang={language}
            className="mb-6 break-words font-display text-4xl text-accent sm:text-5xl"
          >
            {languages[language].greeting}
          </p>
          <h2 className="font-display text-3xl">{lesson.title}</h2>
          <p className="mt-2 text-ink-soft">{lesson.goal}</p>
          {profile && <p className="mt-4 rounded-xl bg-accent-wash p-4">오늘의 연습 · {learningTask(profile.level, lesson.id)}</p>}
          <dl className="mt-6 divide-y divide-ink-faint border-y border-ink-faint">
            {lesson.phrases.map((p) => (
              <div key={p.text} className="py-5">
                <dt lang={language} className="text-2xl leading-relaxed">
                  {p.text}
                </dt>
                {p.koreanReading && <dd className="mt-2 font-medium text-accent">한글 발음 · {p.koreanReading}</dd>}
                <dd className="mt-1 text-sm text-ink-soft">{p.reading}</dd>
                <dd className="mt-2 text-base">{p.meaning}</dd>
              </div>
            ))}
          </dl>
          {language !== "ko" && <p className="mt-3 text-xs text-ink-soft">한글 발음은 읽기 보조예요. 태국어 성조와 일본어 장음·억양을 완전히 표현하지 못해요.</p>}
          <p className="my-6 rounded-xl bg-accent-wash p-5 text-base leading-relaxed">
            {lesson.note}
          </p>
          <LessonQuiz
            key={`${language}:${lesson.id}`}
            lesson={lesson}
            onAnswer={recordAnswer}
          />
          <Link
            href={`/conversation?${query}`}
            className="mt-8 inline-flex min-h-12 items-center rounded-full bg-accent px-6 py-3 font-medium text-white hover:bg-accent-strong"
          >
            이 주제로 AI와 대화하기
          </Link>
        </section>
      </div>
    </div>
  );
}
function subscribeProgress(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("hanmadi-course-progress", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("hanmadi-course-progress", callback);
  };
}
function LessonQuiz({
  lesson,
  onAnswer,
}: {
  lesson: Lesson;
  onAnswer: (answer: number) => Promise<void>;
}) {
  const [answer, setAnswer] = useState<number | null>(null);
  const correct = answer === lesson.quiz.answer;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <fieldset className="rounded-xl border border-ink-faint p-5">
      <legend className="px-2 font-medium">배운 표현 확인하기</legend>
      <p>{lesson.quiz.prompt}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {lesson.quiz.choices.map((choice, i) => (
          <button
            type="button"
            key={choice}
            aria-pressed={answer === i}
            disabled={busy}
            onClick={async () => {
              if (busy) return;
              setBusy(true); setError("");
              try { if (answer === null) await onAnswer(i); setAnswer(i); }
              catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요. 다시 선택해 주세요."); }
              finally { setBusy(false); }
            }}
            className={`min-h-11 rounded-lg border px-4 py-2 ${answer === i ? "border-accent bg-accent-wash" : "border-ink-faint"}`}
          >
            {choice}
            {koreanReadings[choice] && <span className="mt-1 block text-sm text-ink-soft">{koreanReadings[choice]}</span>}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-4 text-amber">{error}</p>}
      <p role="status" className="mt-4 text-base">
        {answer === null
          ? "첫 응답을 기록해 다음 복습에 반영해요."
          : correct
            ? `정답이에요! ${lesson.quiz.explanation}`
            : "다시 골라 보세요. 위의 표현을 참고해도 좋아요."}
      </p>
    </fieldset>
  );
}
