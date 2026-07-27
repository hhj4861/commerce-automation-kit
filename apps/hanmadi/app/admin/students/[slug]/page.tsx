import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPack } from "@/data/packs";
import type { HomeworkItem, LessonLog, Student, VocabEntry } from "@/data/types";
import {
  buildCurriculum,
  type CurriculumStep,
  type TrackStatus,
} from "@/lib/curriculum";
import { buildNextLessonPlan, type FocusArea } from "@/lib/next-lesson";
import { PLACEMENT_LEVEL_LABEL } from "@/lib/placement";
import { countPuzzles, puzzleGroupsForStudent, puzzlesForLesson } from "@/lib/puzzles";
import { getProgress } from "@/lib/store";
import type { PuzzleProgress } from "@/lib/store";
import { getStudentForTutor, getTutorSession } from "@/lib/students";
import { LevelBadge, MinutesChip } from "@/components/pack-badges";
import { CopyButton } from "@/components/copy-button";
import { ApplyPlacementButton } from "./apply-placement-button";

/**
 * 학생 상세 (튜터 전용) — "이 학생 어디까지 했더라?"에 한 화면으로 답한다.
 *
 * 화면 구성 (위 → 아래, 스캔하기 쉬운 순서)
 * 1) 요약 대시보드: 총 수업·마지막 수업·복습률·커리큘럼 단계·진단 상태를 카드로 압축
 * 2) 학습 계획: 레벨 진단 + 커리큘럼 트랙을 2열로 나란히 (넓은 화면)
 * 3) 수업 진행 리스트: 회차별로 무엇을 했는지 + 학생 화면으로 바로 점프
 * 4) 다음 수업 자료: lib/next-lesson.ts가 레벨·교정 기록에서 자동 계산한 초안
 *
 * 복습 퍼즐은 학생 포털에서 자동으로 숙제가 되므로, 숙제 섹션은 "추가 제안"으로 안내한다.
 *
 * 튜터 전용 화면이므로 전면 한국어. 학생 데이터(표현·숙제 원문)는 영어 그대로 둔다.
 *
 * 접근은 담당 튜터로 제한된다 — 다른 튜터가 slug를 알더라도 404다.
 * metadata도 같은 경로로 조회해 담당이 아닌 학생 이름이 title로 새지 않게 한다.
 */

// 수업 기록·퍼즐 진행이 저장소(Redis/파일)에서 계속 바뀌므로 요청마다 렌더한다
export const dynamic = "force-dynamic";

/** metadata와 페이지가 같은 요청에서 쿠키·저장소를 두 번 읽지 않도록 메모이즈 */
const loadSession = cache(getTutorSession);

/** 로그인한 튜터가 담당하는 학생만 — 아니면 null (존재 여부도 알려주지 않는다) */
const loadStudent = cache(async (slug: string): Promise<Student | null> => {
  const session = await loadSession();
  if (!session) return null;
  return getStudentForTutor(slug, session);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const student = await loadStudent(slug);
  return student ? { title: `${student.name} · 학생 상세` } : {};
}

/* ────────────────────────────── 날짜 유틸 ────────────────────────────── */

const DAY_MS = 86_400_000;

/** ms → 한국 시간 기준 YYYY-MM-DD (en-CA 로케일이 곧 ISO 날짜 형식) */
const KST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** YYYY-MM-DD → 그날 자정(ms). 형식이 어긋나면 null */
function dayStart(date: string): number | null {
  const ms = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

/** 오늘로부터 며칠 지났는지 (오늘 0, 미래는 음수) */
function daysBetween(date: string, today: string): number | null {
  const from = dayStart(date);
  const to = dayStart(today);
  if (from === null || to === null) return null;
  return Math.round((to - from) / DAY_MS);
}

/** 경과일을 튜터가 읽는 말로 */
function elapsedLabel(days: number | null): string {
  if (days === null) return "";
  if (days < 0) return "예정";
  if (days === 0) return "오늘";
  if (days === 1) return "어제";
  return `${days}일 전`;
}

/* ────────────────────────────── 집계 ────────────────────────────── */

type LessonRow = {
  lesson: LessonLog;
  /** 몇 번째 수업인지 (오래된 순 기준) */
  n: number;
  puzzleTotal: number;
  puzzleSolved: number;
};

type ReviewStats = {
  total: number;
  solved: number;
  unsolved: number;
  percent: number;
  /** 최근 7일간 푼 개수 */
  last7: number;
  /** 마지막으로 푼 날 (KST YYYY-MM-DD) */
  lastSolvedDate?: string;
  today: string;
};

/**
 * 수업 회차 목록과 퍼즐 진행을 한 번에 집계한다.
 * Date.now()는 컴포넌트 렌더 밖(이 함수)에서만 읽는다 — 렌더는 순수하게 유지.
 */
function summarize(
  student: Student,
  progress: PuzzleProgress,
): { rows: LessonRow[]; review: ReviewStats } {
  const now = Date.now();
  const today = KST_DATE.format(new Date(now));

  // lessons는 오래된 → 최신 순으로 저장된다. 회차 번호는 저장 순서 그대로.
  const rows: LessonRow[] = student.lessons.map((lesson, i) => {
    const puzzles = puzzlesForLesson(lesson);
    const solved = puzzles.filter((p) => p.id && progress[p.id]).length;
    return {
      lesson,
      n: i + 1,
      puzzleTotal: puzzles.length,
      puzzleSolved: solved,
    };
  });

  // 화면에는 최신 수업이 위로 (같은 날짜면 나중 회차가 위)
  rows.sort((a, b) =>
    a.lesson.date === b.lesson.date
      ? b.n - a.n
      : a.lesson.date < b.lesson.date
        ? 1
        : -1,
  );

  // 전체 퍼즐 수는 학생 단위로 다시 센다 (수업별 중복 제거 규칙과 동일)
  const groups = puzzleGroupsForStudent(student);
  const total = countPuzzles(groups);

  const liveIds = new Set<string>();
  for (const group of groups) {
    for (const puzzle of group.puzzles) {
      if (puzzle.id) liveIds.add(puzzle.id);
    }
  }

  let solved = 0;
  let last7 = 0;
  let lastSolvedAt = 0;
  for (const [id, solvedAt] of Object.entries(progress)) {
    // 지워진 수업의 옛 기록은 세지 않는다 (비율이 100%를 넘지 않게)
    if (!liveIds.has(id)) continue;
    solved += 1;
    if (now - solvedAt <= 7 * DAY_MS) last7 += 1;
    if (solvedAt > lastSolvedAt) lastSolvedAt = solvedAt;
  }

  return {
    rows,
    review: {
      total,
      solved,
      unsolved: Math.max(0, total - solved),
      percent: total > 0 ? Math.round((solved / total) * 100) : 0,
      last7,
      lastSolvedDate: lastSolvedAt
        ? KST_DATE.format(new Date(lastSolvedAt))
        : undefined,
      today,
    },
  };
}

/** 숙제 제안 → 마크다운. 튜터가 메시지·채팅에 보낼 때만 복사해 쓴다. */
function homeworkMarkdown(
  student: Student,
  plan: ReturnType<typeof buildNextLessonPlan>,
): string {
  const lines: string[] = [`## ${student.name} — 다음 수업 숙제 제안`, ""];

  if (plan.nextPack) {
    lines.push(
      `- 다음 학습 팩: ${plan.nextPack.title.en} (${plan.nextPack.title.ko}) — /library/${plan.nextPack.id}`,
    );
  }
  lines.push(`- 선정 근거: ${plan.reason}`);
  if (plan.focusAreas.length > 0) {
    lines.push(
      `- 집중 약점: ${plan.focusAreas.map((f) => `${f.ko} ${f.count}회`).join(", ")}`,
    );
  }
  lines.push("");

  plan.homework.forEach((hw, i) => {
    lines.push(`### ${i + 1}. ${hw.en}`);
    if (hw.ko) lines.push(`- 한국어: ${hw.ko}${hw.rr ? ` (${hw.rr})` : ""}`);
    if (hw.how) lines.push(`- 방법: ${hw.how}`);
    if (hw.target) lines.push(`- 분량: ${hw.target}`);
    if (hw.packId) lines.push(`- 학습 팩: /library/${hw.packId}`);
    if (hw.phrases && hw.phrases.length > 0) {
      lines.push("- 연습 문장:");
      for (const p of hw.phrases) {
        lines.push(`  - ${p.ko} (${p.rr}) — ${p.en}`);
      }
    }
    lines.push("");
  });

  if (plan.reviewPhrases.length > 0) {
    lines.push("### 복습 추천 표현");
    for (const p of plan.reviewPhrases) {
      lines.push(`- ${p.ko} (${p.rr}) — ${p.en}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/* ────────────────────────────── 페이지 ────────────────────────────── */

export default async function TutorStudentDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const student = await loadStudent(slug);
  if (!student) notFound();

  // 퍼즐 진행은 보조 정보 — 저장소가 흔들려도 페이지는 뜨게 한다
  const progress = await getProgress(slug).catch<PuzzleProgress>(() => ({}));
  const { rows, review } = summarize(student, progress);
  const plan = buildNextLessonPlan(student);

  const phraseCount = student.lessons.reduce((n, l) => n + l.phrases.length, 0);
  const correctionCount = student.lessons.reduce(
    (n, l) => n + l.corrections.length,
    0,
  );
  const firstLesson = rows[rows.length - 1]?.lesson;
  const lastLesson = rows[0]?.lesson;
  const sinceLast = lastLesson
    ? daysBetween(lastLesson.date, review.today)
    : null;

  // 안 푼 퍼즐이 쌓였거나 최근 7일간 한 문제도 안 풀었으면 독려 신호
  const needsNudge =
    review.total > 0 && (review.percent < 60 || review.last7 === 0);
  const nextPack = plan.nextPack;

  // 레벨 진단 & 커리큘럼 트랙 — 모두 순수 계산(placement.takenAt은 고정값이라 렌더에서 써도 안전)
  const placement = student.placement;
  const placementDate = placement
    ? KST_DATE.format(new Date(placement.takenAt))
    : null;
  const placementMatchesLevel = placement
    ? placement.suggestedLevel === student.level
    : false;
  const curriculum = buildCurriculum(student);

  // 수업이 많으면 최근 4회만 펼치고 나머지는 접어 밀도를 낮춘다
  const SHOW_RECENT = 4;
  const hasOlder = rows.length > 5;
  const recentRows = hasOlder ? rows.slice(0, SHOW_RECENT) : rows;
  const olderRows = hasOlder ? rows.slice(SHOW_RECENT) : [];

  return (
    <div className="mx-auto max-w-5xl px-5 pt-10 pb-24 sm:pt-14">
      {/* 헤더 */}
      <header>
        <Link
          href="/admin/students"
          className="text-sm text-ink-soft hover:text-accent"
        >
          ← 학생 관리로
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl">{student.name}</h1>
          <LevelBadge level={student.level} />
          {student.tutorName && (
            <span className="font-mono text-[11px] tracking-[0.12em] text-ink-soft">
              담당 {student.tutorName}
            </span>
          )}
        </div>

        {student.goal && (
          <p className="mt-2.5 max-w-[52ch] text-[16px] leading-relaxed text-ink-soft">
            🎯 {student.goal}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <code className="rounded-lg border border-ink-faint bg-paper px-3 py-2 font-mono text-[12px] break-all">
            /s/{student.slug}
          </code>
          <CopyButton
            path={`/s/${student.slug}`}
            label="포털 링크 복사"
            copiedLabel="복사됨!"
            className="min-h-11 rounded-full border border-ink-faint bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
          />
          <Link
            href={`/s/${student.slug}`}
            className="inline-flex min-h-11 items-center rounded-full border border-ink-faint bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
          >
            학생 화면 열기 →
          </Link>
        </div>
      </header>

      {/* 요약 대시보드 — 핵심 지표 한눈에 */}
      <section className="mt-8" aria-label="학생 요약">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <SummaryTile
            label="총 수업"
            value={`${student.lessons.length}회`}
            sub={`표현 ${phraseCount} · 교정 ${correctionCount}`}
          />
          <SummaryTile
            label="마지막 수업"
            value={lastLesson ? elapsedLabel(sinceLast) : "—"}
            sub={lastLesson ? lastLesson.date : "기록 없음"}
            tone={sinceLast !== null && sinceLast >= 14 ? "amber" : "plain"}
          />
          <SummaryTile
            label="복습률"
            value={review.total > 0 ? `${review.percent}%` : "—"}
            sub={
              review.total > 0
                ? `${review.solved}/${review.total} 퍼즐`
                : "퍼즐 없음"
            }
            barPercent={review.total > 0 ? review.percent : undefined}
            tone={
              review.total === 0
                ? "plain"
                : needsNudge
                  ? "amber"
                  : review.percent >= 70
                    ? "good"
                    : "plain"
            }
          />
          <SummaryTile
            label="커리큘럼 단계"
            value={
              plan.trackPosition
                ? `${plan.trackPosition.current}/${plan.trackPosition.total}`
                : "—"
            }
            sub={
              curriculum.current ? curriculum.current.title.ko : "배치된 팩 없음"
            }
          />
          <SummaryTile
            label="레벨 진단"
            value={
              placement ? (placement.applied ? "적용됨" : "제안 대기") : "미실시"
            }
            sub={
              placement
                ? PLACEMENT_LEVEL_LABEL[placement.suggestedLevel].ko
                : "링크 전송 필요"
            }
            tone={placement ? (placement.applied ? "good" : "amber") : "plain"}
          />
        </div>

        {/* 복습 독려 — 지금 움직일 신호라 접지 않고 항상 보인다 */}
        {needsNudge && (
          <div className="mt-4 rounded-2xl border border-amber-line bg-amber-wash p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p className="font-mono text-[11px] tracking-[0.2em] text-amber">
                복습 독려
              </p>
              <p className="mt-2 text-[15px] leading-relaxed">
                {review.last7 === 0
                  ? "최근 7일간 푼 퍼즐이 없어요."
                  : `아직 ${review.unsolved}개가 남아 있어요.`}{" "}
                다음 수업 전에 포털 링크를 다시 보내 복습을 권해 보세요.
              </p>
            </div>
            <div className="mt-3 sm:mt-0 sm:shrink-0">
              <CopyButton
                path={`/s/${student.slug}`}
                label="포털 링크 복사"
                copiedLabel="복사됨!"
                className="min-h-11 rounded-full border border-amber-line bg-card px-4 py-2 text-sm font-medium text-amber transition-colors hover:border-amber"
              />
            </div>
          </div>
        )}

        {/* 복습 상세는 기본은 접어 둔다 — 헤드라인 %는 위 카드에 이미 보인다 */}
        {review.total > 0 && (
          <details className="group mt-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-full border border-ink-faint bg-card px-4 py-2 text-[14px] font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent">
              <span>복습 현황 자세히</span>
              <span
                aria-hidden="true"
                className="transition-transform group-open:rotate-180"
              >
                ⌄
              </span>
            </summary>
            <div className="soft-card mt-3 p-6">
              <p className="text-[15px] leading-relaxed text-ink-soft">
                퍼즐은 수업의 새 표현·교정 문장에서 자동으로 만들어져요. 튜터가
                따로 입력할 건 없어요.
              </p>
              <div
                className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-ink-faint"
                role="img"
                aria-label={`복습 진행률 ${review.percent}%`}
              >
                <div
                  className={`h-full rounded-full ${
                    review.percent >= 70 ? "bg-good" : "bg-accent"
                  }`}
                  style={{ width: `${Math.min(100, review.percent)}%` }}
                />
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Stat label="최근 7일" value={`${review.last7}개`} />
                <Stat
                  label="마지막으로 푼 날"
                  value={review.lastSolvedDate ?? "—"}
                  sub={
                    review.lastSolvedDate
                      ? elapsedLabel(
                          daysBetween(review.lastSolvedDate, review.today),
                        )
                      : "기록 없음"
                  }
                />
                <Stat
                  label="안 푼 퍼즐"
                  value={`${review.unsolved}개`}
                  tone={needsNudge ? "amber" : "plain"}
                />
              </div>
            </div>
          </details>
        )}
      </section>

      {/* 학습 계획 — 레벨 진단 + 커리큘럼 트랙 (넓은 화면은 2열) */}
      <Section
        title="학습 계획"
        hint="현재 레벨 진단 결과와 앞으로 나아갈 학습 팩 순서예요."
      >
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          {/* 레벨 진단 */}
          <Panel
            title="레벨 진단"
            hint="학생이 진단 링크로 스스로 푼 배치 테스트 결과예요. 맞으면 학생 레벨로 확정하세요."
          >
            {placement ? (
              <div className="soft-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[11px] tracking-[0.12em] text-ink-soft">
                      제안 레벨
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
                      <span lang="ko" className="font-display text-3xl">
                        {PLACEMENT_LEVEL_LABEL[placement.suggestedLevel].ko}
                      </span>
                      <span className="font-mono text-[13px] text-ink-soft">
                        {PLACEMENT_LEVEL_LABEL[placement.suggestedLevel].en}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-[11px] tracking-[0.12em] text-ink-soft">
                      종합 점수
                    </p>
                    <p className="mt-1 font-display text-3xl leading-none">
                      {placement.score}
                      <span className="ml-0.5 text-lg text-ink-soft">/100</span>
                    </p>
                  </div>
                </div>

                {/* 적용 상태 / 버튼 */}
                <div className="mt-5 border-t border-ink-faint pt-5">
                  {placement.applied ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-good-wash px-3.5 py-1.5 text-[14px] font-medium text-good">
                      <span aria-hidden="true">✓</span> 적용됨 — 현재 레벨에
                      반영돼 있어요
                    </span>
                  ) : placementMatchesLevel ? (
                    <p className="text-[14px] leading-relaxed text-ink-soft">
                      진단 제안이 현재 레벨(
                      <b className="text-ink">
                        {PLACEMENT_LEVEL_LABEL[student.level].ko}
                      </b>
                      )과 같아요. 따로 바꿀 건 없어요.
                    </p>
                  ) : (
                    <div>
                      <p className="mb-3 text-[14px] leading-relaxed text-ink-soft">
                        현재 레벨은{" "}
                        <b className="text-ink">
                          {PLACEMENT_LEVEL_LABEL[student.level].ko}
                        </b>
                        예요. 진단 제안대로 바꾸면 옆 커리큘럼 트랙도 새 레벨에
                        맞게 다시 짜여요.
                      </p>
                      <ApplyPlacementButton
                        slug={student.slug}
                        targetLevelLabel={
                          PLACEMENT_LEVEL_LABEL[placement.suggestedLevel].ko
                        }
                      />
                    </div>
                  )}
                </div>

                {/* 축별 정답 */}
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <AxisBar label="한글 읽기" axis={placement.axes.hangul} />
                  <AxisBar label="어휘" axis={placement.axes.vocab} />
                  <AxisBar label="문법·회화" axis={placement.axes.grammar} />
                </div>

                <p className="mt-4 font-mono text-[12px] text-ink-soft">
                  진단일 {placementDate}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-ink-faint p-6">
                <p className="font-display text-xl">
                  아직 레벨 진단을 하지 않았어요
                </p>
                <p className="mt-2 max-w-[50ch] text-[15px] leading-relaxed text-ink-soft">
                  학생이 진단 링크로 배치 테스트를 풀면 제안 레벨과 축별 결과가
                  여기에 나타나요. 지금 레벨은 튜터가 정한{" "}
                  <b className="text-ink">
                    {PLACEMENT_LEVEL_LABEL[student.level].ko}
                  </b>
                  예요.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <code className="rounded-lg border border-ink-faint bg-paper px-3 py-2 font-mono text-[12px] break-all">
                    /level-test?s={student.slug}
                  </code>
                  <CopyButton
                    path={`/level-test?s=${student.slug}`}
                    label="진단 링크 복사"
                    copiedLabel="복사됨!"
                    className="min-h-11 rounded-full border border-ink-faint bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
                  />
                </div>
              </div>
            )}
          </Panel>

          {/* 커리큘럼 트랙 */}
          <Panel
            title="커리큘럼 트랙"
            hint="학생 레벨에 맞춘 학습 팩 순서예요. 요약을 보고, 전체 여정은 펼쳐서 확인하세요."
          >
            {curriculum.total === 0 ? (
              <p className="rounded-2xl border border-dashed border-ink-faint p-6 text-center leading-relaxed text-ink-soft">
                이 레벨에 배치된 학습 팩이 아직 없어요.
              </p>
            ) : (
              <>
                {/* 진도 요약 */}
                <div className="soft-card p-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[17px]">
                      전체 {curriculum.total}단계 중{" "}
                      <span className="font-display text-2xl">
                        {curriculum.doneCount}단계
                      </span>{" "}
                      완료
                    </p>
                    <p className="font-mono text-[13px] text-ink-soft">
                      {curriculum.percent}%
                    </p>
                  </div>

                  <div
                    className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-ink-faint"
                    role="img"
                    aria-label={`커리큘럼 진행률 ${curriculum.percent}%`}
                  >
                    <div
                      className={`h-full rounded-full ${
                        curriculum.percent >= 70 ? "bg-good" : "bg-accent"
                      }`}
                      style={{ width: `${Math.min(100, curriculum.percent)}%` }}
                    />
                  </div>

                  {curriculum.current && (
                    <p className="mt-3 text-[15px] text-ink-soft">
                      지금 단계 ·{" "}
                      <span lang="ko" className="text-ink">
                        {curriculum.current.title.ko}
                      </span>{" "}
                      {curriculum.current.title.en}
                    </p>
                  )}
                </div>

                {/* 전체 타임라인 — 기본은 접어 밀도를 낮춘다 */}
                <details className="group mt-3">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-full border border-ink-faint bg-card px-4 py-2 text-[14px] font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent">
                    <span>전체 트랙 {curriculum.total}단계 보기</span>
                    <span
                      aria-hidden="true"
                      className="transition-transform group-open:rotate-180"
                    >
                      ⌄
                    </span>
                  </summary>
                  <ol className="mt-3 space-y-3">
                    {curriculum.steps.map((step) => (
                      <TrackStepRow
                        key={step.pack.id}
                        step={step}
                        focusAreas={
                          step.status === "current" ? plan.focusAreas : []
                        }
                      />
                    ))}
                  </ol>
                  <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">
                    레벨을 바꾸면(위 진단 적용 등) 트랙 구성과 현재 단계도 새
                    레벨에 맞게 다시 계산돼요.
                  </p>
                </details>
              </>
            )}
          </Panel>
        </div>
      </Section>

      {/* 수업 진행 리스트 */}
      <Section
        title="수업 진행 리스트"
        hint="최신 수업이 위에 있어요. 회차를 누르면 학생이 보는 화면으로 바로 이동해요."
      >
        {rows.length === 0 ? (
          <div className="soft-card p-8 text-center">
            <p className="text-3xl" aria-hidden="true">
              🌱
            </p>
            <p className="mt-3 font-display text-xl">아직 수업 기록이 없어요</p>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
              첫 수업을 마치고 라이브 노트에서 저장하면 회차별로 여기에 쌓여요.
              아래 &ldquo;다음 수업 자료&rdquo;는 레벨만으로도 미리 만들어 둡니다.
            </p>
            <Link
              href="/live"
              className="mt-5 inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-medium text-white transition-colors hover:bg-accent-strong"
            >
              라이브 노트 열기 →
            </Link>
          </div>
        ) : (
          <>
            {firstLesson && (
              <p className="mb-4 font-mono text-[12px] text-ink-soft">
                첫 수업 {firstLesson.date} ·{" "}
                {elapsedLabel(daysBetween(firstLesson.date, review.today))} · 총{" "}
                {rows.length}회
              </p>
            )}

            <ol className="space-y-3">
              {recentRows.map((row) => (
                <LessonCard
                  key={row.lesson.id}
                  row={row}
                  today={review.today}
                  slug={student.slug}
                />
              ))}
            </ol>

            {olderRows.length > 0 && (
              <details className="group mt-3">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-full border border-ink-faint bg-card px-4 py-2 text-[14px] font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent">
                  <span>이전 수업 {olderRows.length}개 더 보기</span>
                  <span
                    aria-hidden="true"
                    className="transition-transform group-open:rotate-180"
                  >
                    ⌄
                  </span>
                </summary>
                <ol className="mt-3 space-y-3">
                  {olderRows.map((row) => (
                    <LessonCard
                      key={row.lesson.id}
                      row={row}
                      today={review.today}
                      slug={student.slug}
                    />
                  ))}
                </ol>
              </details>
            )}
          </>
        )}
      </Section>

      {/* 다음 수업 자료 (자동 생성) */}
      <Section
        title="다음 수업 자료"
        hint="학생 레벨과 지금까지의 교정 기록에서 자동으로 계산한 초안이에요. 그대로 쓰거나 고쳐서 쓰세요."
      >
        {/* 다음 팩 */}
        {nextPack ? (
          <article className="soft-card p-6">
            <div className="flex flex-wrap items-center gap-2">
              <LevelBadge level={nextPack.level} />
              <MinutesChip minutes={nextPack.minutes} />
              {plan.trackPosition && (
                <span className="inline-flex items-center rounded-full border border-ink-faint px-2.5 py-1 font-mono text-[11px] text-ink-soft">
                  트랙 {plan.trackPosition.current}/{plan.trackPosition.total}
                </span>
              )}
            </div>
            <h3 lang="ko" className="mt-3 font-display text-2xl">
              {nextPack.title.ko}
            </h3>
            <p className="mt-1 text-[15px] text-ink-soft">
              {nextPack.title.en}
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
              {nextPack.summary}
            </p>
            <p className="mt-4 rounded-xl border border-ink-faint bg-paper p-4 text-[15px] leading-relaxed">
              <span className="mr-2 font-mono text-[12px] text-accent">
                선정 근거
              </span>
              {plan.reason}
            </p>
            <Link
              href={`/library/${nextPack.id}`}
              className="mt-4 inline-flex min-h-11 items-center rounded-full bg-accent px-5 font-medium text-white transition-colors hover:bg-accent-strong"
            >
              학습 팩 열기 →
            </Link>
          </article>
        ) : (
          <div className="rounded-2xl border border-amber-line bg-amber-wash p-5">
            <p className="font-mono text-[11px] tracking-[0.2em] text-amber">
              추천 팩 없음
            </p>
            <p className="mt-2 text-[15px] leading-relaxed">{plan.reason}</p>
          </div>
        )}

        {/* 집중 약점 + 복습 추천 표현 (넓은 화면은 2열) */}
        {(plan.focusAreas.length > 0 || plan.reviewPhrases.length > 0) && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
            {plan.focusAreas.length > 0 && (
              <Panel
                title="집중할 약점"
                hint="교정 기록에서 반복해서 나온 항목이에요."
              >
                <ul className="flex flex-wrap gap-2">
                  {plan.focusAreas.map((focus) => (
                    <li key={focus.key}>
                      {focus.packId ? (
                        <Link
                          href={`/library/${focus.packId}`}
                          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-line bg-amber-wash px-4 py-2 text-[15px] text-amber transition-colors hover:border-amber"
                        >
                          {focus.ko}
                          <span className="font-mono text-[12px]">
                            {focus.count}회
                          </span>
                          <span aria-hidden="true">→</span>
                        </Link>
                      ) : (
                        <span className="inline-flex min-h-11 items-center gap-2 rounded-full border border-amber-line bg-amber-wash px-4 py-2 text-[15px] text-amber">
                          {focus.ko}
                          <span className="font-mono text-[12px]">
                            {focus.count}회
                          </span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Panel>
            )}

            {plan.reviewPhrases.length > 0 && (
              <Panel
                title="복습 추천 표현"
                hint="지난 수업에서 뽑았어요. 수업 초반 워밍업으로 쓰기 좋아요."
              >
                <ul className="grid gap-3 sm:grid-cols-2">
                  {plan.reviewPhrases.map((phrase, i) => (
                    <ReviewPhraseCard
                      key={`${phrase.ko}-${i}`}
                      phrase={phrase}
                    />
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        )}

        {/* 숙제 — 퍼즐은 포털에서 자동 숙제가 되므로 "추가 제안"으로 안내 */}
        {plan.homework.length > 0 && (
          <div className="mt-10">
            <div className="rounded-2xl border border-accent/30 bg-accent-wash/40 p-5">
              <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] text-accent">
                <span aria-hidden="true">🧩</span> 자동 숙제
              </p>
              <p className="mt-2 text-[15px] leading-relaxed">
                학생 포털에서 복습 퍼즐이 자동으로 숙제가 돼요. 아래는 튜터가
                추가로 보낼 수 있는 숙제 제안이에요 — 꼭 붙여넣지 않아도 됩니다.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-display text-xl">
                  숙제 제안 {plan.homework.length}개
                </h3>
                <p className="mt-1 text-[13px] text-ink-soft">
                  메시지나 채팅으로 보낼 때만 아래 마크다운을 복사해 쓰세요.
                </p>
              </div>
              <CopyButton
                text={homeworkMarkdown(student, plan)}
                label="메시지용 마크다운 복사"
                copiedLabel="복사됨!"
                className="min-h-11 shrink-0 rounded-full border border-ink-faint bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-accent/50 hover:text-accent"
              />
            </div>

            <ol className="mt-4 space-y-4">
              {plan.homework.map((item, i) => (
                <HomeworkCard key={`${item.en}-${i}`} item={item} n={i + 1} />
              ))}
            </ol>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ────────────────────────────── 보조 컴포넌트 ────────────────────────────── */

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="font-display text-2xl">{title}</h2>
      {hint && (
        <p className="mt-1.5 max-w-[54ch] text-[15px] leading-relaxed text-ink-soft">
          {hint}
        </p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** 섹션 안에서 성격이 비슷한 하위 묶음을 2열로 배치할 때 쓰는 소제목 패널 */
function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="font-display text-xl">{title}</h3>
      {hint && (
        <p className="mt-1 max-w-[46ch] text-[14px] leading-relaxed text-ink-soft">
          {hint}
        </p>
      )}
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** 요약 대시보드의 지표 타일 — 선택적으로 얇은 진행 막대를 곁들인다 */
function SummaryTile({
  label,
  value,
  sub,
  tone = "plain",
  barPercent,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "amber" | "good";
  barPercent?: number;
}) {
  const styles = {
    plain: {
      box: "border-ink-faint bg-paper",
      label: "text-ink-soft",
      sub: "text-ink-soft",
      bar: "bg-accent",
    },
    amber: {
      box: "border-amber-line bg-amber-wash",
      label: "text-amber",
      sub: "text-amber",
      bar: "bg-amber",
    },
    good: {
      box: "border-good/30 bg-good-wash",
      label: "text-good",
      sub: "text-good",
      bar: "bg-good",
    },
  }[tone];

  return (
    <div className={`rounded-xl border px-4 py-3 ${styles.box}`}>
      <p
        className={`font-mono text-[11px] tracking-[0.12em] ${styles.label}`}
      >
        {label}
      </p>
      <p className="mt-1 text-[18px] leading-tight font-medium">{value}</p>
      {barPercent !== undefined && (
        <div
          className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-faint"
          role="img"
          aria-label={`${label} ${barPercent}%`}
        >
          <div
            className={`h-full rounded-full ${styles.bar}`}
            style={{ width: `${Math.min(100, barPercent)}%` }}
          />
        </div>
      )}
      {sub && <p className={`mt-1 text-[13px] ${styles.sub}`}>{sub}</p>}
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "plain",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "amber";
}) {
  const amber = tone === "amber";
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        amber ? "border-amber-line bg-amber-wash" : "border-ink-faint bg-paper"
      }`}
    >
      <p
        className={`font-mono text-[11px] tracking-[0.12em] ${
          amber ? "text-amber" : "text-ink-soft"
        }`}
      >
        {label}
      </p>
      <p className="mt-1 text-[17px] font-medium">{value}</p>
      {sub && (
        <p
          className={`mt-0.5 text-[13px] ${amber ? "text-amber" : "text-ink-soft"}`}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

/** 수업 카드의 숫자 칩 */
function Metric({
  label,
  value,
  sub,
  tone = "plain",
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "plain" | "amber";
}) {
  const amber = tone === "amber";
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 rounded-full border px-3 py-1.5 text-[14px] ${
        amber
          ? "border-amber-line bg-amber-wash text-amber"
          : "border-ink-faint text-ink-soft"
      }`}
    >
      {label}
      <span className="font-mono text-[13px] font-medium">{value}</span>
      {sub && <span className="font-mono text-[11px]">· {sub}</span>}
    </span>
  );
}

/** 수업 1회 카드 — 회차·날짜·주제·지표 + 학생 화면 점프 */
function LessonCard({
  row,
  today,
  slug,
}: {
  row: LessonRow;
  today: string;
  slug: string;
}) {
  return (
    <li className="soft-card p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[12px] font-medium text-paper">
          {row.n}
        </span>
        <span className="font-mono text-[13px] text-ink-soft">
          {row.lesson.date}
          <span className="ml-1.5">
            {elapsedLabel(daysBetween(row.lesson.date, today))}
          </span>
        </span>
        <h3 className="min-w-0 font-display text-xl">{row.lesson.topic}</h3>
      </div>

      {row.lesson.tutorNote && (
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft italic">
          &ldquo;{row.lesson.tutorNote}&rdquo;
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Metric label="교정" value={row.lesson.corrections.length} />
        <Metric label="새 표현" value={row.lesson.phrases.length} />
        <Metric label="숙제" value={row.lesson.homework.length} />
        <Metric
          label="퍼즐"
          value={row.puzzleTotal}
          sub={row.puzzleTotal > 0 ? `${row.puzzleSolved} 완료` : undefined}
          tone={
            row.puzzleTotal > 0 && row.puzzleSolved === 0 ? "amber" : "plain"
          }
        />
      </div>

      <Link
        href={`/s/${slug}/${row.lesson.id}`}
        className="mt-3 inline-flex min-h-11 items-center text-[15px] font-medium text-accent hover:underline"
      >
        이 수업 학생 화면에서 보기 →
      </Link>
    </li>
  );
}

function ReviewPhraseCard({ phrase }: { phrase: VocabEntry }) {
  return (
    <li className="rounded-xl border border-ink-faint bg-card p-4">
      <p lang="ko" className="font-display text-2xl leading-snug">
        {phrase.ko}
      </p>
      <p className="mt-1 font-mono text-[13px] text-ink-soft">{phrase.rr}</p>
      <p className="mt-0.5 text-[15px]">{phrase.en}</p>
      {phrase.example && (
        <p
          lang="ko"
          className="mt-2.5 border-t border-ink-faint pt-2 text-sm text-ink-soft"
        >
          {phrase.example}
        </p>
      )}
    </li>
  );
}

function HomeworkCard({ item, n }: { item: HomeworkItem; n: number }) {
  const pack = item.packId ? getPack(item.packId) : undefined;
  // 퍼즐 리드 항목(target이 "N puzzles" 형태)은 포털 자동 숙제와 이어지므로 두드러지게
  const isPuzzle = /puzzle/i.test(item.target ?? "") || /puzzle/i.test(item.en);

  return (
    <li
      className={`soft-card p-5 ${
        isPuzzle ? "border-accent/40 bg-accent-wash/25 ring-1 ring-accent/15" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-medium ${
            isPuzzle
              ? "bg-accent-wash text-[14px]"
              : "bg-ink text-paper"
          }`}
          aria-hidden={isPuzzle ? "true" : undefined}
        >
          {isPuzzle ? "🧩" : n}
        </span>
        <div className="min-w-0">
          {isPuzzle && (
            <p className="font-mono text-[10px] tracking-[0.16em] text-accent">
              자동 복습 퍼즐
            </p>
          )}
          <p className="text-[17px] font-medium">{item.en}</p>
          {item.ko && (
            <p className="mt-0.5 text-[15px] text-ink-soft">
              <span lang="ko">{item.ko}</span>
              {item.rr && (
                <span className="ml-1.5 font-mono text-[12px]">{item.rr}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {(item.how || item.target) && (
        <dl className="mt-3 space-y-2 border-t border-ink-faint pt-3">
          {item.how && (
            <div className="flex flex-wrap gap-x-2.5 gap-y-1">
              <dt className="shrink-0 font-mono text-[12px] text-accent">
                방법
              </dt>
              <dd className="min-w-0 flex-1 text-[15px] leading-relaxed text-ink-soft">
                {item.how}
              </dd>
            </div>
          )}
          {item.target && (
            <div className="flex flex-wrap gap-x-2.5 gap-y-1">
              <dt className="shrink-0 font-mono text-[12px] text-accent">
                분량
              </dt>
              <dd className="min-w-0 flex-1 text-[15px] leading-relaxed text-ink-soft">
                {item.target}
              </dd>
            </div>
          )}
        </dl>
      )}

      {item.phrases && item.phrases.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {item.phrases.map((phrase, i) => (
            <li
              key={`${phrase.ko}-${i}`}
              className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 rounded-lg bg-accent-wash/40 px-3.5 py-2"
            >
              <span lang="ko" className="text-lg">
                {phrase.ko}
              </span>
              <span className="font-mono text-[12px] text-ink-soft">
                {phrase.rr}
              </span>
              <span className="text-[14px] text-ink-soft">{phrase.en}</span>
            </li>
          ))}
        </ul>
      )}

      {item.packId && (
        <Link
          href={`/library/${item.packId}`}
          className="mt-3 inline-flex min-h-11 items-center text-[15px] font-medium text-accent hover:underline"
        >
          학습 팩 열기: {pack ? pack.title.ko : item.packId} →
        </Link>
      )}
    </li>
  );
}

/** 진단 축별 정답 막대 (한글 읽기 / 어휘 / 문법·회화) */
function AxisBar({
  label,
  axis,
}: {
  label: string;
  axis: { correct: number; total: number };
}) {
  const percent =
    axis.total === 0 ? 0 : Math.round((axis.correct / axis.total) * 100);
  return (
    <div className="rounded-xl border border-ink-faint bg-paper px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] tracking-[0.12em] text-ink-soft">
          {label}
        </p>
        <p className="font-mono text-[13px] text-ink-soft">
          {axis.correct}/{axis.total}
        </p>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink-faint"
        role="img"
        aria-label={`${label} ${axis.total}문항 중 ${axis.correct}문항 정답`}
      >
        <div
          className={`h-full rounded-full ${percent >= 50 ? "bg-good" : "bg-accent"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** 커리큘럼 트랙의 상태 배지 (완료 / 현재 / 예정) */
function StepStatusBadge({ status }: { status: TrackStatus }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center rounded-full bg-good-wash px-2.5 py-0.5 font-mono text-[11px] text-good">
        완료
      </span>
    );
  }
  if (status === "current") {
    return (
      <span className="inline-flex items-center rounded-full bg-accent px-2.5 py-0.5 font-mono text-[11px] text-white">
        현재
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-ink-faint px-2.5 py-0.5 font-mono text-[11px] text-ink-soft">
      예정
    </span>
  );
}

/** 커리큘럼 트랙 한 단계 — 순번·상태·팩 제목·시간·링크. 현재 단계는 두드러지게. */
function TrackStepRow({
  step,
  focusAreas,
}: {
  step: CurriculumStep;
  focusAreas: FocusArea[];
}) {
  const { pack, status, index } = step;
  const done = status === "done";
  const current = status === "current";

  return (
    <li
      className={`rounded-2xl border p-5 ${
        current
          ? "border-accent/40 bg-accent-wash/30 ring-1 ring-accent/20"
          : done
            ? "border-ink-faint bg-paper"
            : "border-ink-faint bg-card opacity-80"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* 순번 / 상태 표식 */}
        <span
          className={`mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-medium ${
            done
              ? "bg-good text-white"
              : current
                ? "bg-accent text-white"
                : "border border-ink-faint text-ink-soft"
          }`}
        >
          {done ? "✓" : index}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 lang="ko" className="min-w-0 font-display text-xl">
              {pack.title.ko}
            </h3>
            <StepStatusBadge status={status} />
          </div>
          <p className="mt-0.5 text-[14px] text-ink-soft">{pack.title.en}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-3">
            <MinutesChip minutes={pack.minutes} />
            <Link
              href={`/library/${pack.id}`}
              className="inline-flex min-h-11 items-center text-[15px] font-medium text-accent hover:underline"
            >
              학습 팩 열기 →
            </Link>
          </div>

          {/* 현재 단계에는 이번에 볼 약점을 곁들인다 */}
          {current && focusAreas.length > 0 && (
            <div className="mt-3 border-t border-ink-faint pt-3">
              <p className="font-mono text-[11px] tracking-[0.12em] text-accent">
                이번에 볼 것
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {focusAreas.map((focus) => (
                  <li
                    key={focus.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-ink-faint bg-card px-3 py-1 text-[13px] text-ink-soft"
                  >
                    {focus.ko}
                    <span className="font-mono text-[11px]">
                      {focus.count}회
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
