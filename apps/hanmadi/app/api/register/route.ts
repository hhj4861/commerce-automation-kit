import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  SESSION_TTL_MS,
  TUTOR_COOKIE,
  findEnvTutorByPin,
  getAuthSecret,
  hashToken,
  parseEnvTutors,
  signSession,
  validatePin,
} from "@/lib/auth";
import {
  addTutor,
  findInviteByTokenHash,
  findRegisteredTutorByPin,
  findTutorByName,
  hashPin,
  listStudents,
  markInviteUsed,
} from "@/lib/store";

export const runtime = "nodejs";

type InviteState =
  | { ok: true; email: string }
  | { ok: false; error: string };

async function checkInvite(token: string): Promise<InviteState> {
  if (!token) return { ok: false, error: "초대 링크가 올바르지 않아요." };
  const invite = await findInviteByTokenHash(await hashToken(token));
  if (!invite) return { ok: false, error: "초대 링크가 올바르지 않아요." };
  if (invite.usedAt) return { ok: false, error: "이미 사용된 초대 링크예요." };
  if (Date.now() > invite.expiresAt) {
    return { ok: false, error: "초대 링크가 만료됐어요. 다시 초대를 요청해 주세요." };
  }
  return { ok: true, email: invite.email };
}

/** 초대 토큰 확인 — 등록 화면에서 이메일을 보여주기 위해 사용 */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const state = await checkInvite(token);
  return NextResponse.json(state, { status: state.ok ? 200 : 400 });
}

/** PIN 등록 — 성공하면 바로 로그인 상태가 된다 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    token?: unknown;
    name?: unknown;
    pin?: unknown;
  } | null;

  const token = typeof body?.token === "string" ? body.token : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";

  const state = await checkInvite(token);
  if (!state.ok) return NextResponse.json(state, { status: 400 });

  if (name.length < 1 || name.length > 20) {
    return NextResponse.json(
      { ok: false, error: "이름은 1~20자로 입력해 주세요." },
      { status: 400 },
    );
  }
  const envTutors = parseEnvTutors(process.env);
  if ((await findTutorByName(name)) || envTutors.some((t) => t.name === name)) {
    return NextResponse.json(
      { ok: false, error: "이미 사용 중인 이름이에요. 다른 이름을 써주세요." },
      { status: 409 },
    );
  }
  // 이름 재사용으로 (삭제된 튜터가 남긴) 학생을 상속하는 것을 원천 차단한다:
  // 그 이름을 담당(tutorName)으로 가진 학생이 이미 있으면 등록을 거부한다.
  if ((await listStudents()).some((s) => s.tutorName === name)) {
    return NextResponse.json(
      { ok: false, error: "이미 사용 중인 이름이에요. 다른 이름을 써주세요." },
      { status: 409 },
    );
  }

  const pinError = validatePin(pin);
  if (pinError) return NextResponse.json({ ok: false, error: pinError }, { status: 400 });

  // PIN은 튜터 간 유일해야 한다 (PIN만으로 로그인하므로)
  if (findEnvTutorByPin(pin, envTutors) || (await findRegisteredTutorByPin(pin))) {
    return NextResponse.json(
      { ok: false, error: "이미 사용 중인 PIN이에요. 다른 번호를 입력해 주세요." },
      { status: 409 },
    );
  }

  const id = randomUUID();
  await addTutor({
    id,
    name,
    email: state.email,
    pinHash: hashPin(pin),
    createdAt: Date.now(),
  });
  await markInviteUsed(await hashToken(token), name);

  const res = NextResponse.json({ ok: true, name });
  res.cookies.set(
    TUTOR_COOKIE,
    await signSession(
      { n: name, e: state.email, r: "tutor", tid: id, t: Date.now() },
      getAuthSecret(process.env),
    ),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_TTL_MS / 1000,
      path: "/",
    },
  );
  return res;
}
