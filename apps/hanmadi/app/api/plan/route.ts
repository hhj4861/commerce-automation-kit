import { NextResponse } from "next/server";
import { buildNextLessonPlan } from "@/lib/next-lesson";
import { getStudentForTutor, getTutorSession } from "@/lib/students";

export const runtime = "nodejs";

/**
 * 다음 수업 자료 (튜터 전용) — /live에서 "제안 숙제 불러오기"에 쓴다.
 *
 * GET ?slug={slug} → 그 학생의 자동 생성 숙제 제안(HomeworkItem[])을 반환한다.
 * 튜터별 격리: 담당 학생이 아니면 404 (존재 여부도 노출하지 않는다).
 * 반환하는 homework는 buildNextLessonPlan의 결과이며 학생 데이터만으로 결정된다.
 */
export async function GET(req: Request) {
  const session = await getTutorSession();
  if (!session) return NextResponse.json({ ok: false }, { status: 403 });

  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const student = slug ? await getStudentForTutor(slug, session) : null;
  if (!student) {
    return NextResponse.json(
      { ok: false, error: "학생을 찾을 수 없어요." },
      { status: 404 },
    );
  }

  const plan = buildNextLessonPlan(student);
  return NextResponse.json({ ok: true, homework: plan.homework });
}
