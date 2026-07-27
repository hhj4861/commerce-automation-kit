import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { LessonLog, Student } from "@/data/types";
import { puzzleGroupsForStudent, countPuzzles } from "@/lib/puzzles";
import { getStudentBySlug } from "@/lib/students";
import { enrichHomework } from "@/lib/homework-display";
import { HomeworkSlides } from "@/components/homework-slides";
import { LessonPuzzleButton, PuzzleProvider } from "@/components/lesson-puzzle";
import { Chip, Section, formatLessonDate } from "@/components/student-ui";

/**
 * 수업 상세 — 그 수업 하나만 보여준다.
 *
 * 목록(/s/[slug])에서 카드를 누르면 여기로 온다. 한 수업에서 나온 것을
 * 교정 → 새 표현 → 숙제 순으로 모아 두고, 맨 위에 그 수업 퍼즐 진입점을 둔다.
 * 학생 화면이므로 영어 우선 + 한국어 병기.
 */

export const dynamic = "force-dynamic";

/**
 * 라우트 타입.
 * 이 라우트가 처음 추가되는 시점에는 .next/types의 PageProps 목록에 아직
 * 올라와 있지 않으므로 params 형태를 직접 적는다 (빌드 시 검증되는 형태와 동일).
 */
type LessonPageProps = {
  params: Promise<{ slug: string; lessonId: string }>;
};

/** metadata와 페이지가 같은 요청에서 저장소를 두 번 읽지 않도록 메모이즈 */
const loadStudent = cache(getStudentBySlug);

/** 학생의 수업 목록에서 해당 수업과 앞뒤 수업, 회차 번호를 찾는다 */
function findLesson(student: Student, lessonId: string) {
  const index = student.lessons.findIndex((l) => l.id === lessonId);
  if (index === -1) return null;
  return {
    lesson: student.lessons[index],
    number: index + 1,
    /** 한 회 앞선(더 오래된) 수업 */
    older: student.lessons[index - 1],
    /** 한 회 뒤의(더 최근) 수업 */
    newer: student.lessons[index + 1],
    olderNumber: index,
    newerNumber: index + 2,
  };
}

export async function generateMetadata(
  props: LessonPageProps,
): Promise<Metadata> {
  const { slug, lessonId } = await props.params;
  const student = await loadStudent(slug);
  if (!student) return {};
  const found = findLesson(student, lessonId);
  if (!found) return {};
  return { title: `Lesson ${found.number} — ${found.lesson.topic}` };
}

export default async function LessonDetailPage(props: LessonPageProps) {
  const { slug, lessonId } = await props.params;
  const student = await loadStudent(slug);
  if (!student) notFound();

  const found = findLesson(student, lessonId);
  if (!found) notFound();

  const { lesson, number, older, newer, olderNumber, newerNumber } = found;

  // 이 수업에서 만들어진 퍼즐만 — 덱을 열면 이 수업 문장만 나온다.
  // 퍼즐 id는 lib/puzzles.ts가 수업 단위로 붙이므로 목록 화면과 진행 기록이 그대로 이어진다.
  const groups = puzzleGroupsForStudent(student).filter(
    (group) => group.lessonId === lesson.id,
  );
  const puzzleCount = countPuzzles(groups);
  // 숙제 연습 문장의 빈 로마자·영어를 그 수업 어휘로 채워 3단 표기가 항상 나오게 한다
  const homework = enrichHomework(lesson);

  return (
    <div className="mx-auto max-w-2xl px-5 pt-6 pb-24 sm:pt-10">
      <Link
        href={`/s/${student.slug}`}
        className="inline-flex min-h-11 items-center gap-1.5 text-[15px] text-ink-soft transition-colors hover:text-accent"
      >
        ← Back{" "}
        <span lang="ko" className="text-[13px]">
          수업 목록
        </span>
      </Link>

      {/* 수업 헤더 — 따뜻한 카드형 히어로 */}
      <header className="soft-card mt-3 p-6 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-accent px-3 py-1 font-mono text-[11px] tracking-[0.08em] text-white">
            Lesson {number}
          </span>
          <span className="font-mono text-[12px] text-ink-soft">
            {formatLessonDate(lesson.date)}
          </span>
        </div>

        <h1 className="mt-3.5 font-display text-3xl leading-tight sm:text-4xl">
          {lesson.topic}
        </h1>

        {lesson.tutorNote && (
          <p className="mt-3 rounded-xl bg-accent-wash/50 px-4 py-3 text-[15px] leading-relaxed text-ink-soft">
            <span aria-hidden="true">💬 </span>
            <span className="italic">{lesson.tutorNote}</span>
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {lesson.phrases.length > 0 && (
            <Chip>
              💬 {lesson.phrases.length} phrase
              {lesson.phrases.length === 1 ? "" : "s"}
            </Chip>
          )}
          {lesson.corrections.length > 0 && (
            <Chip>
              ✏️ {lesson.corrections.length} fix
              {lesson.corrections.length === 1 ? "" : "es"}
            </Chip>
          )}
          {puzzleCount > 0 && <Chip>🧩 {puzzleCount} puzzles</Chip>}
          {lesson.homework.length > 0 && (
            <Chip>📩 {lesson.homework.length} homework</Chip>
          )}
        </div>
      </header>

      {/* 이 수업 퍼즐 — 먼저 손을 움직이며 복습 */}
      {groups.length > 0 && (
        <Section en="Review with puzzles" ko="퍼즐로 복습">
          <PuzzleProvider slug={student.slug} groups={groups}>
            <LessonPuzzleButton lessonId={lesson.id} />
          </PuzzleProvider>
        </Section>
      )}

      {/* 새 표현 — 3단 위계 카드 (먼저 배운 것, 그다음 고친 것) */}
      {lesson.phrases.length > 0 && (
        <Section en="What you learned" ko="배운 표현">
          <ul className="grid gap-3 sm:grid-cols-2">
            {lesson.phrases.map((phrase, i) => (
              <li key={i} className="soft-card flex flex-col p-5">
                <p lang="ko" className="font-display text-3xl leading-snug">
                  {phrase.ko}
                </p>
                <p className="mt-1.5 font-mono text-[13px] text-ink-soft">
                  {phrase.rr}
                </p>
                <p className="mt-1 text-[16px] font-medium">{phrase.en}</p>
                {phrase.example && (
                  <p
                    lang="ko"
                    className="mt-3 border-t border-ink-faint pt-2.5 text-[15px] leading-relaxed text-ink-soft"
                  >
                    {phrase.example}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* 교정 — You said → Better */}
      {lesson.corrections.length > 0 && (
        <Section en="What we fixed" ko="고친 것">
          <div className="space-y-3">
            {lesson.corrections.map((correction, i) => (
              <div key={i} className="soft-card p-5">
                <p className="flex items-center gap-2 text-[16px] text-ink-soft">
                  <span
                    aria-hidden="true"
                    className="font-mono text-[11px] text-ink-soft"
                  >
                    ✗
                  </span>
                  <span className="line-through">{correction.said}</span>
                </p>
                <p
                  lang="ko"
                  className="fixed-line mt-2 flex w-fit items-baseline gap-2 text-2xl leading-relaxed font-medium"
                >
                  <span aria-hidden="true" className="text-[15px] text-good">
                    ✓
                  </span>
                  {correction.fixed}
                </p>
                <p className="mt-1 pl-6 font-mono text-[13px] text-ink-soft">
                  {correction.rr}
                </p>
                {correction.note && (
                  <p className="mt-3 border-t border-ink-faint pt-2.5 text-[15px] leading-relaxed text-ink-soft">
                    {correction.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* 숙제 — 슬라이드로 한 장씩. 체크 상태는 목록 화면과 같은 키를 공유 */}
      {homework.length > 0 && (
        <Section en="Your homework" ko="숙제">
          <HomeworkSlides
            items={homework}
            storageKey={`student:${student.slug}:hw:${lesson.id}`}
          />
        </Section>
      )}

      {/* 이전/다음 수업 */}
      {(older || newer) && (
        <nav className="mt-14 grid gap-4 border-t border-ink-faint pt-8 sm:grid-cols-2">
          {older ? (
            <LessonNavLink
              href={`/s/${student.slug}/${older.id}`}
              label={`← Lesson ${olderNumber}`}
              lesson={older}
            />
          ) : (
            <span />
          )}
          {newer ? (
            <LessonNavLink
              href={`/s/${student.slug}/${newer.id}`}
              label={`Lesson ${newerNumber} →`}
              lesson={newer}
              align="right"
            />
          ) : (
            <span />
          )}
        </nav>
      )}

      <div className="mt-10 text-center">
        <Link
          href={`/s/${student.slug}`}
          className="inline-flex min-h-11 items-center gap-1.5 text-[15px] text-ink-soft transition-colors hover:text-accent"
        >
          ← All lessons{" "}
          <span lang="ko" className="text-[13px]">
            수업 목록
          </span>
        </Link>
      </div>
    </div>
  );
}

/* ────────────────────────────── 보조 컴포넌트 ────────────────────────────── */

/** 이전/다음 수업 카드 */
function LessonNavLink({
  href,
  label,
  lesson,
  align = "left",
}: {
  href: string;
  label: string;
  lesson: LessonLog;
  align?: "left" | "right";
}) {
  return (
    <Link
      href={href}
      className={`soft-card block p-5 transition-colors hover:border-accent/60 ${
        align === "right" ? "text-right" : ""
      }`}
    >
      <p className="font-mono text-[11px] text-ink-soft">{label}</p>
      <p className="mt-1 font-medium">{lesson.topic}</p>
      <p className="mt-0.5 font-mono text-[12px] text-ink-soft">
        {formatLessonDate(lesson.date)}
      </p>
    </Link>
  );
}
