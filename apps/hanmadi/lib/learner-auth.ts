import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { getAuthSecret } from "./auth";
import { getConversationTutor } from "./conversation-access";
import { ConversationError } from "./conversation";
import { hashPin, verifyPin, v2Driver } from "./store";
const COOKIE = "hanmadi_learner";
const TTL = 30 * 86400;
type Learner = { id: string; name: string; passwordHash: string };
function secret() {
  if (
    !process.env.AUTH_SECRET &&
    !process.env.TUTOR_PINS &&
    !process.env.TUTOR_PIN
  )
    throw new ConversationError(503, "로그인 설정을 준비 중이에요.");
  const key = getAuthSecret(process.env);
  if (!key) throw new ConversationError(503, "로그인 설정을 준비 중이에요.");
  return key;
}
function signature(value: string) {
  return createHmac("sha256", secret())
    .update(`learner:${value}`)
    .digest("base64url");
}
export async function learnerSession(): Promise<{
  id: string;
  name: string;
} | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const [value, sig] = raw.split("."),
      expected = signature(value);
    if (
      !sig ||
      sig.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    )
      return null;
    const data = JSON.parse(Buffer.from(value, "base64url").toString());
    if (
      typeof data.id !== "string" ||
      typeof data.name !== "string" ||
      !Number.isFinite(data.expires) ||
      data.expires < Date.now()
    )
      return null;
    return { id: data.id, name: data.name };
  } catch {
    return null;
  }
}
export async function studyIdentity() {
  const learner = await learnerSession();
  if (learner)
    return {
      actor: createHash("sha256").update(`learner:${learner.id}`).digest("hex"),
      name: learner.name,
      owner: false,
    };
  const tutor = await getConversationTutor();
  if (tutor)
    return {
      actor: createHash("sha256")
        .update(`tutor:${tutor.tid ?? tutor.n}`)
        .digest("hex"),
      name: tutor.n,
      owner: tutor.r === "owner",
    };
  throw new ConversationError(401, "학습 기록을 이어가려면 로그인해 주세요.");
}
export async function learnerLogin(
  action: "login" | "signup",
  name: string,
  password: string,
) {
  if (
    !/^[a-z0-9_-]{3,32}$/.test(name) ||
    password.length < 12 ||
    password.length > 128
  )
    throw new ConversationError(
      400,
      "아이디는 영문 소문자·숫자 3~32자, 비밀번호는 12~128자로 입력해 주세요.",
    );
  secret();
  const db = v2Driver(),
    hour = Math.floor(Date.now() / 3600000);
  const [total, perName] = await Promise.all([
    db.count(`auth:${hour}`),
    db.count(`auth:${hour}:${name}`),
  ]);
  if (total > 500 || perName > 20)
    throw new ConversationError(
      429,
      "로그인 시도가 많아요. 한 시간 뒤 다시 시도해 주세요.",
    );
  const raw = await db.get(`learner:${name}`);
  let account: Learner;
  if (action === "signup") {
    account = { id: randomUUID(), name, passwordHash: hashPin(password) };
    if (!(await db.cas(`learner:${name}`, null, JSON.stringify(account))))
      throw new ConversationError(
        409,
        "사용할 수 없는 아이디예요. 다른 아이디로 시도해 주세요.",
      );
  } else {
    account = raw
      ? JSON.parse(raw)
      : { id: "", name, passwordHash: hashPin("invalid-password-value") };
    if (!verifyPin(password, account.passwordHash) || !raw)
      throw new ConversationError(401, "아이디 또는 비밀번호를 확인해 주세요.");
  }
  return issueLearnerSession(account);
}

/** Shared session boundary for password and verified Google identities. */
export async function issueLearnerSession(account: { id: string; name: string }) {
  const value = Buffer.from(
    JSON.stringify({ id: account.id, name: account.name, expires: Date.now() + TTL * 1000 }),
  ).toString("base64url");
  // A learner login must not retain privileges from a previous tutor session.
  const jar = await cookies();
  jar.delete("hanmadi_tutor");
  jar.delete("hanmadi_language");
  jar.delete("hanmadi_google_flow");
  (await cookies()).set(COOKIE, `${value}.${signature(value)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL,
  });
  return { name: account.name };
}
export async function learnerLogout() {
  const jar = await cookies();
  jar.delete(COOKIE);
  jar.delete("hanmadi_tutor");
  jar.delete("hanmadi_language");
  jar.delete("hanmadi_google_flow");
}
