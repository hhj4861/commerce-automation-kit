import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import {
  TUTOR_COOKIE,
  getAuthSecret,
  hashToken,
  verifySession,
} from "@/lib/auth";
import {
  INVITE_TTL_MS,
  addInvite,
  findTutorByEmail,
  listInvites,
  listTutors,
  removeTutor,
  revokeInvite,
} from "@/lib/store";
import { sendInviteEmail } from "@/lib/email";

export const runtime = "nodejs";

/** 소유자만 접근 가능 — 미들웨어와 별개로 API에서도 직접 확인한다 */
async function requireOwner() {
  const store = await cookies();
  const session = await verifySession(
    store.get(TUTOR_COOKIE)?.value,
    getAuthSecret(process.env),
  );
  return session?.r === "owner" ? session : null;
}

async function baseUrl(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

/** 초대·튜터 목록 조회 */
export async function GET() {
  if (!(await requireOwner())) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  return NextResponse.json({
    ok: true,
    tutors: (await listTutors()).map((t) => ({
      name: t.name,
      email: t.email,
      createdAt: t.createdAt,
    })),
    invites: (await listInvites()).map((i) => ({
      id: i.tokenHash,
      email: i.email,
      invitedBy: i.invitedBy,
      createdAt: i.createdAt,
      expiresAt: i.expiresAt,
      usedAt: i.usedAt,
      usedByName: i.usedByName,
    })),
  });
}

/** 초대 생성 + 메일 발송 */
export async function POST(req: Request) {
  const session = await requireOwner();
  if (!session) return NextResponse.json({ ok: false }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "이메일 형식을 확인해 주세요." },
      { status: 400 },
    );
  }
  if (await findTutorByEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "이미 등록된 튜터의 이메일이에요." },
      { status: 409 },
    );
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = await hashToken(token);
  const expiresAt = Date.now() + INVITE_TTL_MS;

  await addInvite({
    tokenHash,
    email,
    invitedBy: session.n,
    createdAt: Date.now(),
    expiresAt,
  });

  const url = `${await baseUrl()}/register?token=${token}`;
  const mail = await sendInviteEmail({
    to: email,
    inviterName: session.n,
    url,
    expiresAt,
  });

  // 메일 발송 실패 시에도 초대는 유효하다 — 링크를 직접 전달할 수 있게 반환한다
  return NextResponse.json({ ok: true, url, mailSent: mail.sent, mailError: mail.error });
}

/** 초대 취소 또는 등록 튜터 삭제 */
export async function DELETE(req: Request) {
  const session = await requireOwner();
  if (!session) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as {
    inviteId?: unknown;
    tutorName?: unknown;
  } | null;

  if (typeof body?.inviteId === "string") {
    return NextResponse.json({ ok: await revokeInvite(body.inviteId) });
  }
  if (typeof body?.tutorName === "string") {
    // 삭제한 튜터의 학생은 고아로 남기지 않고 삭제를 수행한 소유자에게 이관한다
    const ownerId = session.tid ?? `owner:${session.n}`;
    return NextResponse.json({
      ok: await removeTutor(body.tutorName, { id: ownerId, name: session.n }),
    });
  }
  return NextResponse.json({ ok: false }, { status: 400 });
}
