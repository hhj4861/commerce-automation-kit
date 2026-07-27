import type { Pack, Student } from "@/data/types";
import { trackForLevel, buildNextLessonPlan } from "@/lib/next-lesson";

/**
 * 학생별 커리큘럼 트랙 플랜.
 *
 * 학생의 레벨에 맞는 학습 팩 순서를 "완료 / 현재 / 예정" 타임라인으로 만든다.
 * "다음 수업 1개"(next-lesson)보다 넓은, 앞으로의 전체 여정을 보여주는 뷰다.
 *
 * 완료 판정: 수업 횟수만큼 트랙 앞쪽 팩을 완료로 본다 (팩=수업 1:1 근사).
 * 정확한 팩-수업 매핑 데이터가 아직 없으므로 이 근사를 쓰되, current는
 * next-lesson이 고른 다음 팩과 일치시켜 "지금 할 것"이 어긋나지 않게 한다.
 */

export type TrackStatus = "done" | "current" | "upcoming";

export type CurriculumStep = {
  pack: Pack;
  status: TrackStatus;
  /** 트랙 내 순번 (1부터) */
  index: number;
};

export type Curriculum = {
  level: Student["level"];
  steps: CurriculumStep[];
  doneCount: number;
  total: number;
  /** 현재 팩 (있으면) */
  current?: Pack;
  /** 진도율 0~100 */
  percent: number;
};

export function buildCurriculum(student: Student): Curriculum {
  const track = trackForLevel(student.level);
  const plan = buildNextLessonPlan(student);
  const currentId = plan.nextPack?.id;

  // 완료 개수 = 수업 횟수 (트랙 길이 상한). current 팩은 완료로 세지 않는다.
  const lessonsDone = Math.min(student.lessons.length, track.length);
  const currentIndex = currentId
    ? track.findIndex((p) => p.id === currentId)
    : lessonsDone;

  const steps: CurriculumStep[] = track.map((pack, i) => {
    let status: TrackStatus;
    if (i === currentIndex) status = "current";
    else if (i < (currentIndex >= 0 ? currentIndex : lessonsDone)) status = "done";
    else status = "upcoming";
    return { pack, status, index: i + 1 };
  });

  const doneCount = steps.filter((s) => s.status === "done").length;
  const total = steps.length;

  return {
    level: student.level,
    steps,
    doneCount,
    total,
    current: currentIndex >= 0 ? track[currentIndex] : undefined,
    percent: total === 0 ? 0 : Math.round((doneCount / total) * 100),
  };
}
