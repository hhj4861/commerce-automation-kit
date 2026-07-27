import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPack } from "@/data/packs";
import type { LessonLog } from "@/data/types";
import { buildNextLessonPlan } from "@/lib/next-lesson";
import { countPuzzles, puzzleGroupsForStudent } from "@/lib/puzzles";
import { enrichHomework } from "@/lib/homework-display";
import { getProgress } from "@/lib/store";
import { getStudentBySlug } from "@/lib/students";
import { LEVEL_LABEL, LevelBadge, MinutesChip } from "@/components/pack-badges";
import { PackCard } from "@/components/pack-card";
import { HomeworkSlides } from "@/components/homework-slides";
import { CopyButton } from "@/components/copy-button";
import { PuzzleHero, PuzzleProvider } from "@/components/lesson-puzzle";
import { Chip, Section, StatChip, formatLessonDate } from "@/components/student-ui";

/**
 * 학생 포털 홈 — 수업 목록.
 *
 * 수업이 쌓일수록 한 페이지가 길어지는 문제를 2단 구조로 풀었다.
 *   여기(/s/[slug])         : 오늘의 복습 + 수업 목록 + 다음 수업 미리보기 + 이번 주 숙제
 *   상세(/s/[slug]/{id})    : 그 수업의 교정·표현·숙제·퍼즐 전체
 *
 * 로그인 없는 비공개 slug 링크, 학생이 폰으로 여는 것이 기본 시나리오.
 * 영어 우선 + 한국어 병기, 한국어에는 항상 RR 로마자를 함께 보여준다.
 */

// 학생·수업 기록이 저장소(Redis/파일)에서 동적으로 늘어나므로 요청 시마다 렌더한다
export const dynamic = "force-dynamic";

/** metadata와 페이지가 같은 요청에서 저장소를 두 번 읽지 않도록 메모이즈 */
const loadStudent = cache(getStudentBySlug);

export async function generateMetadata(
  props: PageProps<"/s/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const student = await loadStudent(slug);
  if (!student) return {};
  return { title: `${student.name}'s Portal` };
}

export default async function StudentPortalPage(props: PageProps<"/s/[slug]">) {
  const { slug } = await props.params;
  const student = await loadStudent(slug);
  if (!student) notFound();

  // 모든 수업의 새 표현·교정에서 자동 생성된 퍼즐 (최신 수업 순)
  const puzzleGroups = puzzleGroupsForStudent(student);
  const puzzleCount = countPuzzles(puzzleGroups);

  // 수업 카드에 보여줄 퍼즐 진행 — 기기 간 공유되는 서버 기록을 그대로 읽는다
  // (브라우저 localStorage는 클라이언트 컴포넌트 몫이라 여기서는 건드리지 않는다)
  const solvedAt = await getProgress(student.slug);
  const puzzleStats = new Map<string, { total: number; solved: number }>();
  for (const group of puzzleGroups) {
    const solved = group.puzzles.filter((puzzle, i) =>
      Boolean(solvedAt[puzzle.id ?? `${group.lessonId}:${i}`]),
    ).length;
    puzzleStats.set(group.lessonId, { total: group.puzzles.length, solved });
  }

  // lessons는 오래된 → 최신 순으로 저장된다. 목록에는 최신순 + 원래 회차 번호.
  const numbered = student.lessons.map((lesson, i) => ({
    lesson,
    number: i + 1,
  }));
  const lessonsRecent = [...numbered].reverse();
  const latest = lessonsRecent[0]?.lesson;
  const phraseCount = student.lessons.reduce((n, l) => n + l.phrases.length, 0);

  // 다음 수업 자동 편성 — 학생에게는 팩과 집중 포인트만 보여준다
  // (plan.reason은 튜터용 한국어 설명이라 이 화면에서는 쓰지 않는다)
  const plan = buildNextLessonPlan(student);

  const recommended = student.recommendedPackIds
    .map((id) => getPack(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  const hasFeedback =
    student.feedback.doingWell.length > 0 || student.feedback.focusOn.length > 0;

  return (
    <PuzzleProvider slug={student.slug} groups={puzzleGroups}>
      <div className="mx-auto max-w-3xl px-5 pt-8 pb-24 sm:pt-12">
        {/* 인사 — 짧게, 바로 아래 퍼즐 히어로로 이어진다 */}
        <header>
          <p className="font-display text-3xl sm:text-4xl">
            Hi, {student.name}! 👋
          </p>
          {student.goal && (
            <p className="mt-1.5 text-[16px] text-ink-soft">
              Goal: {student.goal}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            <StatChip>{LEVEL_LABEL[student.level].en}</StatChip>
            <StatChip>
              {student.lessons.length} lesson
              {student.lessons.length === 1 ? "" : "s"}
            </StatChip>
            <StatChip>{phraseCount} phrases</StatChip>
            {puzzleCount > 0 && <StatChip>{puzzleCount} puzzles</StatChip>}
          </div>
        </header>

        {/* 퍼즐 히어로 — 오늘의 복습 진입점 + 진행률 + 연속 학습 */}
        <PuzzleHero />

        {/* 수업 목록 — 이 화면의 중심. 카드 전체가 상세 페이지 링크 */}
        <Section en="Lessons" ko="수업 기록">
          {lessonsRecent.length === 0 ? (
            <div className="soft-card p-8 text-center">
              <p className="text-4xl" aria-hidden="true">
                🌱
              </p>
              <p className="mt-3 font-display text-2xl">
                Your journey starts here
              </p>
              <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">
                After our first lesson, every lesson shows up here — phrases,
                corrections, homework and review puzzles.
              </p>
              <p lang="ko" className="mt-1.5 text-[15px] text-ink-soft">
                첫 수업이 끝나면 이 목록이 채워져요.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {lessonsRecent.map(({ lesson, number }) => (
                <li key={lesson.id}>
                  <LessonRow
                    href={`/s/${student.slug}/${lesson.id}`}
                    lesson={lesson}
                    number={number}
                    puzzle={puzzleStats.get(lesson.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Up Next — 다음 수업에 열 팩 + 이번에 집중할 것 */}
        {(plan.nextPack || plan.focusAreas.length > 0) && (
          <Section en="Up Next" ko="다음 수업 미리보기">
            {plan.nextPack && (
              <Link
                href={`/library/${plan.nextPack.id}`}
                className="soft-card group block p-6 transition-colors hover:border-accent/60"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <LevelBadge level={plan.nextPack.level} />
                  <MinutesChip minutes={plan.nextPack.minutes} />
                  {plan.trackPosition && (
                    <Chip>
                      Step {plan.trackPosition.current} of{" "}
                      {plan.trackPosition.total}
                    </Chip>
                  )}
                </div>
                <p className="mt-4 font-display text-2xl group-hover:text-accent">
                  {plan.nextPack.title.en}
                </p>
                <p lang="ko" className="font-mono text-[13px] text-ink-soft">
                  {plan.nextPack.title.ko}
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
                  {plan.nextPack.summary}
                </p>
                <p className="mt-4 text-[15px] font-medium text-accent">
                  Open the pack{" "}
                  <span lang="ko" className="text-ink-soft">
                    자료 열기
                  </span>{" "}
                  →
                </p>
              </Link>
            )}

            {plan.focusAreas.length > 0 && (
              <div className="mt-4 rounded-2xl border border-accent/30 bg-accent-wash/40 p-5">
                <p className="font-mono text-[11px] tracking-[0.1em] text-accent uppercase">
                  What to focus on
                </p>
                <p lang="ko" className="mt-0.5 text-[13px] text-ink-soft">
                  이번에 집중할 것
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {plan.focusAreas.map((area) => (
                    <span
                      key={area.key}
                      className="rounded-full bg-card px-3 py-1.5 text-[14px]"
                    >
                      {area.en}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* This Week — 최신 수업의 숙제 */}
        {latest && (
          <Section en="This Week's Homework" ko="이번 주 숙제">
            {latest.homework.length > 0 ? (
              <>
                <HomeworkSlides
                  items={enrichHomework(latest)}
                  storageKey={`student:${student.slug}:hw:${latest.id}`}
                />
                <Link
                  href={`/s/${student.slug}/${latest.id}`}
                  className="mt-2 inline-flex min-h-11 items-center text-[15px] font-medium text-accent hover:text-accent-strong"
                >
                  See the full lesson{" "}
                  <span lang="ko" className="text-ink-soft">
                    수업 전체 보기
                  </span>{" "}
                  →
                </Link>
              </>
            ) : (
              <p className="text-[16px] text-ink-soft">
                No homework this week — enjoy the break!
              </p>
            )}
          </Section>
        )}

        {/* Tutor's Feedback */}
        {hasFeedback && (
          <Section en="Tutor's Feedback" ko="선생님 피드백">
            <div className="grid gap-4 sm:grid-cols-2">
              {student.feedback.doingWell.length > 0 && (
                <FeedbackList
                  label="Doing well"
                  ko="잘하고 있어요"
                  items={student.feedback.doingWell}
                  tone="good"
                />
              )}
              {student.feedback.focusOn.length > 0 && (
                <FeedbackList
                  label="Focus on"
                  ko="이번에 집중할 것"
                  items={student.feedback.focusOn}
                  tone="accent"
                />
              )}
            </div>
          </Section>
        )}

        {/* Next Lesson — 재예약 CTA */}
        {student.nextLesson && (
          <Section en="Next Lesson" ko="다음 수업">
            <div className="rounded-2xl border border-accent/30 bg-accent-wash/50 p-6">
              <p className="text-xl font-medium">{student.nextLesson.topic}</p>
              <p className="mt-1 text-[16px] text-ink-soft">
                {student.nextLesson.when}
              </p>
              {student.nextLesson.bookingUrl && (
                <a
                  href={student.nextLesson.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 flex min-h-13 w-full items-center justify-center rounded-full bg-accent px-6 font-medium text-white transition-colors hover:bg-accent-strong sm:w-auto sm:min-w-64"
                >
                  Book your next lesson →
                </a>
              )}
            </div>
          </Section>
        )}

        {/* Recommended for You */}
        {recommended.length > 0 && (
          <Section en="Recommended for You" ko="추천 학습 팩">
            <div className="grid gap-4 sm:grid-cols-2">
              {recommended.map((pack) => (
                <PackCard key={pack.id} pack={pack} compact />
              ))}
            </div>
          </Section>
        )}

        <div className="mt-12 flex justify-center">
          <CopyButton path={`/s/${student.slug}`} label="Copy portal link" />
        </div>
      </div>
    </PuzzleProvider>
  );
}

/* ────────────────────────────── 보조 컴포넌트 ────────────────────────────── */

/**
 * 수업 카드 — 카드 전체가 상세 페이지로 가는 링크.
 * 안에 버튼을 두지 않는다 (링크 안의 버튼은 모바일에서 오탭을 만든다).
 */
function LessonRow({
  href,
  lesson,
  number,
  puzzle,
}: {
  href: string;
  lesson: LessonLog;
  /** 몇 번째 수업인지 (오래된 수업이 1번) */
  number: number;
  puzzle?: { total: number; solved: number };
}) {
  const allSolved = Boolean(puzzle && puzzle.total > 0 && puzzle.solved === puzzle.total);

  return (
    <Link
      href={href}
      className="soft-card group block p-5 transition-colors hover:border-accent/60 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-accent-wash px-2.5 py-1 font-mono text-[11px] tracking-[0.08em] text-accent">
          Lesson {number}
        </span>
        <span className="font-mono text-[12px] text-ink-soft">
          {formatLessonDate(lesson.date)}
        </span>
      </div>

      <p className="mt-3 font-display text-2xl leading-snug group-hover:text-accent">
        {lesson.topic}
      </p>

      {lesson.tutorNote && (
        <p className="mt-1.5 line-clamp-2 text-[15px] leading-relaxed text-ink-soft italic">
          &ldquo;{lesson.tutorNote}&rdquo;
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {lesson.phrases.length > 0 && (
          <Chip>
            {lesson.phrases.length} phrase
            {lesson.phrases.length === 1 ? "" : "s"}
          </Chip>
        )}
        {lesson.corrections.length > 0 && (
          <Chip>
            {lesson.corrections.length} fix
            {lesson.corrections.length === 1 ? "" : "es"}
          </Chip>
        )}
        {puzzle && puzzle.total > 0 && (
          <Chip tone={allSolved ? "good" : "accent"}>
            {/* 서버에 기록이 없으면 개수만 — 0/n은 아직 안 푼 것처럼 보이지 않게 */}
            {puzzle.solved > 0
              ? `🧩 ${puzzle.solved}/${puzzle.total} solved`
              : `🧩 ${puzzle.total} puzzle${puzzle.total === 1 ? "" : "s"}`}
          </Chip>
        )}
        {lesson.homework.length > 0 && (
          <Chip>
            ✎ {lesson.homework.length} homework
          </Chip>
        )}
      </div>

      <p className="mt-4 text-[15px] font-medium text-accent">
        Open lesson{" "}
        <span lang="ko" className="text-ink-soft">
          수업 보기
        </span>{" "}
        →
      </p>
    </Link>
  );
}

function FeedbackList({
  label,
  ko,
  items,
  tone,
}: {
  label: string;
  ko: string;
  items: string[];
  tone: "good" | "accent";
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        tone === "good"
          ? "border-good/30 bg-good-wash/60"
          : "border-accent/30 bg-accent-wash/50"
      }`}
    >
      <p
        className={`font-mono text-[11px] tracking-[0.1em] uppercase ${
          tone === "good" ? "text-good" : "text-accent"
        }`}
      >
        {label}
      </p>
      <p lang="ko" className="mt-0.5 text-[13px] text-ink-soft">
        {ko}
      </p>
      <ul className="mt-3 space-y-2 text-[15px] leading-relaxed">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
