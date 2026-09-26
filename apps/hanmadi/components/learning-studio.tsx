"use client";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { courses, languages, type Language, type Lesson } from "@/lib/courses";

export function LearningStudio({
  initialLanguage,
  studentSlug,
}: {
  initialLanguage: Language;
  studentSlug?: string;
}) {
  const [language, setLanguage] = useState(initialLanguage);
  const [lessonId, setLessonId] = useState("greetings");
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
  const completed = [...new Set([...saved, ...sessionCompleted])];
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
  const query = new URLSearchParams({ language, lesson: lesson.id });
  if (studentSlug) query.set("s", studentSlug);
  return (
    <div lang="ko" className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
      <h1 className="font-display text-4xl sm:text-5xl">
        오늘은 어떤 말로 인사할까요?
      </h1>
      <p className="mt-4 text-ink-soft">
        표현을 익히고, 퀴즈로 확인하고, AI와 한마디씩 대화해요.
      </p>
      <div aria-label="학습 언어" className="my-8 flex flex-wrap gap-3">
        {(Object.keys(languages) as Language[]).map((code) => (
          <button
            type="button"
            key={code}
            aria-pressed={language === code}
            onClick={() => {
              setLanguage(code);
              setLessonId("greetings");
            }}
            className={`min-h-14 rounded-xl border px-5 py-3 ${language === code ? "border-accent bg-accent-wash text-accent" : "border-ink-faint bg-card"}`}
          >
            <span lang={code}>{languages[code].native}</span>
            <span className="ml-3 text-sm">{languages[code].name}</span>
          </button>
        ))}
      </div>
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
            진도는 이 브라우저에 저장돼요. 언어별로 따로 기록합니다.
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
          <dl className="mt-6 divide-y divide-ink-faint border-y border-ink-faint">
            {lesson.phrases.map((p) => (
              <div key={p.text} className="py-5">
                <dt lang={language} className="text-2xl leading-relaxed">
                  {p.text}
                </dt>
                <dd className="mt-1 text-sm text-ink-soft">{p.reading}</dd>
                <dd className="mt-2 text-base">{p.meaning}</dd>
              </div>
            ))}
          </dl>
          <p className="my-6 rounded-xl bg-accent-wash p-5 text-base leading-relaxed">
            {lesson.note}
          </p>
          <LessonQuiz
            key={`${language}:${lesson.id}`}
            lesson={lesson}
            onComplete={complete}
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
  onComplete,
}: {
  lesson: Lesson;
  onComplete: () => void;
}) {
  const [answer, setAnswer] = useState<number | null>(null);
  const correct = answer === lesson.quiz.answer;
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
            onClick={() => {
              setAnswer(i);
              if (i === lesson.quiz.answer) onComplete();
            }}
            className={`min-h-11 rounded-lg border px-4 py-2 ${answer === i ? "border-accent bg-accent-wash" : "border-ink-faint"}`}
          >
            {choice}
          </button>
        ))}
      </div>
      <p role="status" className="mt-4 text-base">
        {answer === null
          ? "정답을 고르면 수업 완료로 기록돼요."
          : correct
            ? `정답이에요! ${lesson.quiz.explanation}`
            : "다시 골라 보세요. 위의 표현을 참고해도 좋아요."}
      </p>
    </fieldset>
  );
}
