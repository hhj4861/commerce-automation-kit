import { NextResponse } from "next/server";
import type { LessonLog, Student } from "@/data/types";
import { appendLesson, removeProgress, removeStudent, saveStudent } from "@/lib/store";
import {
  canAccessStudent,
  getStudentBySlug,
  getStudentForTutor,
  getStudentsForTutor,
  getTutorSession,
} from "@/lib/students";

export const runtime = "nodejs";

/**
 * 학생·수업 기록 API (튜터 전용).
 *
 * 튜터별 격리: 모든 응답과 변경은 로그인한 튜터가 담당하는 학생으로 제한된다.
 * 담당이 아닌 학생은 존재 여부도 알려주지 않고 404로 처리한다.
 */

/** 담당이 아닌 학생과 없는 학생을 같은 응답으로 처리 — 존재 여부 노출 방지 */
const notFound = () =>
  NextResponse.json(
    { ok: false, error: "학생을 찾을 수 없어요." },
    { status: 404 },
  );

/** 내 학생 목록 */
export async function GET() {
  const session = await getTutorSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 403 });

  const students = await getStudentsForTutor(session);
  return NextResponse.json({
    ok: true,
    students: students.map((s) => ({
      slug: s.slug,
      name: s.name,
      level: s.level,
      goal: s.goal,
      lessonCount: s.lessons.length,
      phraseCount: s.lessons.reduce((n, l) => n + l.phrases.length, 0),
    })),
  });
}

/**
 * 학생 생성/수정 또는 수업 기록 추가.
 * - { student }        → 학생 저장 (신규 또는 전체 갱신)
 * - { slug, lesson }   → 해당 학생에 수업 기록 추가/갱신
 */
export async function POST(req: Request) {
  const session = await getTutorSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 403 });

  const body = (await req.json().catch(() => null)) as {
    student?: Partial<Student>;
    slug?: unknown;
    lesson?: LessonLog;
    applyPlacement?: unknown;
  } | null;

  // ── 레벨 진단 결과를 확정(적용)해 level을 갱신
  if (typeof body?.slug === "string" && body.applyPlacement === true) {
    const student = await getStudentForTutor(body.slug, session);
    if (!student) return notFound();
    if (!student.placement) {
      return NextResponse.json(
        { ok: false, error: "적용할 진단 결과가 없어요." },
        { status: 400 },
      );
    }
    await saveStudent({
      ...student,
      level: student.placement.suggestedLevel,
      placement: { ...student.placement, applied: true },
    });
    return NextResponse.json({
      ok: true,
      slug: body.slug,
      level: student.placement.suggestedLevel,
    });
  }

  // ── 수업 기록 추가
  if (typeof body?.slug === "string" && body.lesson) {
    const slug = body.slug;
    const lesson = body.lesson;
    if (!lesson.id || !lesson.date) {
      return NextResponse.json(
        { ok: false, error: "수업 id와 날짜가 필요해요." },
        { status: 400 },
      );
    }

    const student = await getStudentForTutor(slug, session);
    if (!student) return notFound();

    // 저장소에 없고 샘플에만 있던 학생이면 먼저 저장소로 복사하며 담당을 확정한다
    if (!(await appendLesson(slug, lesson))) {
      await saveStudent({
        ...student,
        tutorId: student.tutorId ?? session.tid,
        tutorName: student.tutorName ?? session.n,
      });
      await appendLesson(slug, lesson);
    }
    return NextResponse.json({ ok: true, slug });
  }

  // ── 학생 저장
  const input = body?.student;
  if (!input?.slug || !input.name) {
    return NextResponse.json(
      { ok: false, error: "이름과 slug가 필요해요." },
      { status: 400 },
    );
  }
  if (!/^[a-z0-9가-힣-]{2,40}$/.test(input.slug)) {
    return NextResponse.json(
      { ok: false, error: "slug는 소문자·숫자·하이픈 2~40자로 입력해 주세요." },
      { status: 400 },
    );
  }

  // slug는 포털 주소라 전역에서 유일해야 한다.
  // 이미 있는 slug면 내 담당일 때만 갱신할 수 있다 (남의 학생 덮어쓰기 방지).
  const taken = await getStudentBySlug(input.slug);
  const mine = taken && canAccessStudent(taken, session) ? taken : null;
  if (taken && !mine) {
    // 남의 slug 점유 여부를 별도 상태코드/문구로 확인시켜 주지 않는다.
    // slug 형식 오류와 같은 400으로 응답해 존재 오라클을 좁힌다 (엔트로피가 1차 방어).
    return NextResponse.json(
      { ok: false, error: "이 포털 주소는 쓸 수 없어요. 다른 주소를 입력해 주세요." },
      { status: 400 },
    );
  }

  const student: Student = {
    slug: input.slug,
    tutorId: mine?.tutorId ?? session.tid,
    tutorName: mine?.tutorName ?? session.n,
    name: input.name,
    level: input.level ?? mine?.level ?? "absolute-beginner",
    goal: input.goal ?? mine?.goal,
    feedback: input.feedback ?? mine?.feedback ?? { doingWell: [], focusOn: [] },
    recommendedPackIds: input.recommendedPackIds ?? mine?.recommendedPackIds ?? [],
    nextLesson: input.nextLesson ?? mine?.nextLesson,
    lessons: input.lessons ?? mine?.lessons ?? [],
  };

  await saveStudent(student);
  return NextResponse.json({ ok: true, slug: student.slug });
}

/** 학생 삭제 — 담당 학생만, 퍼즐 진행 기록도 함께 정리 */
export async function DELETE(req: Request) {
  const session = await getTutorSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { slug?: unknown } | null;
  if (typeof body?.slug !== "string") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!(await getStudentForTutor(body.slug, session))) return notFound();

  const removed = await removeStudent(body.slug);
  if (removed) await removeProgress(body.slug);
  return NextResponse.json({
    ok: removed,
    error: removed
      ? undefined
      : "코드에 들어 있는 샘플 학생은 화면에서 지울 수 없어요.",
  });
}
