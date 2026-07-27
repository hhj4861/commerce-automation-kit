import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  SESSION_TTL_MS,
  TUTOR_COOKIE,
  findEnvTutorByPin,
  getAuthSecret,
  parseEnvTutors,
  signSession,
} from "@/lib/auth";
import { addTutor, findRegisteredTutorByPin } from "@/lib/store";

export const runtime = "nodejs";

/** 로그인 실패 제한 — 프로세스 메모리 기준(간이 방어) */
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 8;
const LOCK_MS = 5 * 60 * 1000;

function clientKey(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

/** 로그인: PIN으로 튜터를 찾아 검증하고 서명 쿠키(60일)를 발급한다. */
export async function POST(req: Request) {
  const key = clientKey(req);
  const record = attempts.get(key);
  if (record && record.count >= MAX_ATTEMPTS && Date.now() < record.until) {
    const mins = Math.ceil((record.until - Date.now()) / 60000);
    return NextResponse.json(
      { ok: false, error: `시도가 너무 많아요. ${mins}분 후 다시 시도해 주세요.` },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as { pin?: unknown } | null;
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

  const envTutors = parseEnvTutors(process.env);
  const owner = findEnvTutorByPin(pin, envTutors);
  let registered = owner ? null : await findRegisteredTutorByPin(pin);

  if (!owner && !registered) {
    if (envTutors.length === 0) {
      return NextResponse.json(
        { ok: false, error: "서버에 TUTOR_PINS 환경변수가 설정되지 않았습니다." },
        { status: 500 },
      );
    }
    const next = record && Date.now() < record.until ? record.count + 1 : 1;
    attempts.set(key, { count: next, until: Date.now() + LOCK_MS });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  attempts.delete(key);

  // 불변 id 없는 레거시 튜터에는 여기서 id를 발급해 저장소에 backfill 한다
  // (세션 폐기·테넌시 격리가 이 id를 기준으로 동작한다).
  if (registered && !registered.id) {
    registered = { ...registered, id: randomUUID() };
    await addTutor(registered);
  }

  const session = owner
    ? { n: owner.name, r: "owner" as const, tid: `owner:${owner.name}`, t: Date.now() }
    : {
        n: registered!.name,
        e: registered!.email,
        r: "tutor" as const,
        tid: registered!.id,
        t: Date.now(),
      };

  const res = NextResponse.json({
    ok: true,
    name: session.n,
    role: session.r,
  });
  res.cookies.set(TUTOR_COOKIE, await signSession(session, getAuthSecret(process.env)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
  return res;
}

/** 로그아웃: 쿠키 제거 */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(TUTOR_COOKIE);
  return res;
}
