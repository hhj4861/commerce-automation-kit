import { cookies } from "next/headers";
import type { Student } from "@/data/types";
import { students as seedStudents } from "@/data/students";
import { TUTOR_COOKIE, getAuthSecret, verifySession } from "@/lib/auth";
import type { Session } from "@/lib/auth";
import { findTutorById, getStoredStudent, listStudents } from "@/lib/store";

/**
 * 학생 조회 — 저장소(Redis/파일)가 원본이고, data/students/index.ts의 샘플은
 * 저장소에 없는 slug에 한해 폴백으로 쓴다.
 *
 * ## 튜터별 격리
 * 학생은 담당 튜터(Student.tutorId)에게만 보인다. 격리는 **불변 id**로만 판정한다 —
 * 표시이름(tutorName)은 바뀌거나 재사용될 수 있어 신뢰하지 않는다. 다른 튜터가
 * slug를 알더라도 관리 화면·API에서는 접근할 수 없다.
 *
 * 예외 2가지
 * - tutorId·tutorName이 모두 없는 레코드(초기 데이터·샘플)는 소유자(owner)에게만 보인다.
 * - 학생 포털(/s/{slug})은 로그인이 없으므로 격리 대상이 아니다 —
 *   비공개 slug 자체가 열쇠다. 포털은 getStudentBySlug를 그대로 쓴다.
 */

/** 포털용 — 튜터 격리 없이 slug로만 찾는다 (학생 본인이 여는 화면) */
export async function getStudentBySlug(slug: string): Promise<Student | null> {
  const stored = await getStoredStudent(slug);
  if (stored) return stored;
  return seedStudents.find((s) => s.slug === slug) ?? null;
}

/** 저장소 + 샘플 전체 (같은 slug는 저장소 우선) — 내부용 */
async function getAllStudents(): Promise<Student[]> {
  const stored = await listStudents();
  const storedSlugs = new Set(stored.map((s) => s.slug));
  const seeds = seedStudents.filter((s) => !storedSlugs.has(s.slug));
  return [...stored, ...seeds];
}

/** 이 튜터가 볼 수 있는 학생인가 — 판정은 불변 id로만 한다 */
export function canAccessStudent(student: Student, session: Session): boolean {
  // 담당이 지정되지 않은 초기 데이터·샘플은 소유자만
  if (!student.tutorId && !student.tutorName) return session.r === "owner";
  // 불변 tutorId가 있으면 그것만으로 판정한다 (표시이름은 신뢰하지 않는다).
  // 세션에 tid가 없으면(옛 쿠키) tutorId가 있는 학생에는 접근 불가 — fail closed.
  if (student.tutorId) return Boolean(session.tid) && student.tutorId === session.tid;
  // tutorId가 아직 없는 레거시 레코드에 한해 이름으로 폴백한다.
  // 이름 재사용 상속은 removeTutor의 학생 이관 + register의 이름 검사로 차단된다.
  return student.tutorName === session.n;
}

/**
 * 현재 로그인한 튜터의 세션 — 없거나 폐기됐으면 null.
 *
 * 무상태 서명 쿠키를 매 요청 저장소와 대조해 폐기를 구현한다:
 * 초대 튜터는 tid에 해당하는 튜터가 저장소에 남아 있어야 유효하다(삭제되면 즉시 무효).
 * 소유자(owner)는 환경변수 기반이라 저장소 대조 대상이 아니다.
 */
export async function getTutorSession(): Promise<Session | null> {
  const store = await cookies();
  const session = await verifySession(
    store.get(TUTOR_COOKIE)?.value,
    getAuthSecret(process.env),
  );
  if (!session) return null;

  if (session.r === "tutor") {
    // 불변 id 없는 옛 초대 튜터 쿠키는 재로그인이 필요하다
    if (!session.tid) return null;
    // 삭제(폐기)된 튜터의 쿠키를 무효화한다
    if (!(await findTutorById(session.tid))) return null;
  }
  return session;
}

/** 이 튜터가 담당하는 학생 목록 */
export async function getStudentsForTutor(session: Session): Promise<Student[]> {
  return (await getAllStudents()).filter((s) => canAccessStudent(s, session));
}

/** 관리 화면용 — 담당이 아니면 null (존재 여부도 알려주지 않는다) */
export async function getStudentForTutor(
  slug: string,
  session: Session,
): Promise<Student | null> {
  const student = await getStudentBySlug(slug);
  if (!student) return null;
  return canAccessStudent(student, session) ? student : null;
}

/** 새 학생의 slug 후보 — 추측하기 어렵게 임의 접미사를 붙인다 */
export function suggestSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, "-")
      .replace(/^-+|-+$/g, "") || "student";
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}
