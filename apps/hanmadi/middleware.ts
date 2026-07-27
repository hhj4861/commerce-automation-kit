import { NextResponse, type NextRequest } from "next/server";
import {
  TUTOR_COOKIE,
  getAuthSecret,
  isOpenPath,
  verifySession,
} from "@/lib/auth";

/**
 * 튜터 전용 영역 가드 — 학생 공개 경로(/s/*, /library*)와 로그인/등록을 제외한
 * 모든 요청을 서버에서 검사한다. 유효한 세션 쿠키가 없으면 페이지 HTML이
 * 브라우저에 도달하기 전에 /login으로 보낸다.
 *
 * /admin/tutors 만 소유자(owner) 전용 — 초대 튜터가 접근하면 홈으로 돌린다.
 * /admin/students 등 나머지 관리 화면은 로그인한 모든 튜터가 쓸 수 있다.
 */
/** 소유자 전용 경로 — 여기에 해당하지 않는 /admin/* 은 모든 튜터에게 열려 있다 */
const OWNER_ONLY = ["/admin/tutors"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isOpenPath(pathname)) return NextResponse.next();

  const session = await verifySession(
    req.cookies.get(TUTOR_COOKIE)?.value,
    getAuthSecret(process.env),
  );

  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    if (pathname !== "/") url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  const ownerOnly = OWNER_ONLY.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (ownerOnly && session.r !== "owner") {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // 정적 에셋과 Next 내부 경로는 검사하지 않는다
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)).*)",
  ],
};
