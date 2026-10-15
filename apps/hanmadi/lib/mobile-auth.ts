import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ConversationError } from "./conversation";
import { transientStore, type TransientStore } from "./transient-store";
import { isAdminDeployment } from "./deployment";
const TTL = 14 * 86400;
type Account = { id: string; name: string };
type Session = Account & { scope: "learner-mobile"; jti: string; expires: number };
const hash = (v: string) => createHash("sha256").update(v).digest("base64url");
export function mobileEnabled() { return process.env.HANMADI_NATIVE_CLIENT_ENABLED === "true" && !isAdminDeployment(); }
function secret() {
  const key = process.env.AUTH_SECRET;
  if (!mobileEnabled() || !key || key.length < 32) throw new ConversationError(503, "앱 로그인을 준비 중이에요.");
  return key;
}
function sign(value: string) { return createHmac("sha256", secret()).update(`learner-mobile:v1:${value}`).digest("base64url"); }
export function parseMobileToken(authorization: string | null, now = Date.now()): Session | null {
  if (!authorization?.startsWith("Bearer hm1.") || authorization.length > 2048) return null;
  try {
    const [prefix, value, sig, extra] = authorization.slice(7).split(".");
    const expected = sign(value);
    if (prefix !== "hm1" || extra || !sig || sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const s = JSON.parse(Buffer.from(value, "base64url").toString()) as Session;
    return s.scope === "learner-mobile" && typeof s.id === "string" && s.id.length > 0 && typeof s.name === "string" &&
      /^[A-Za-z0-9_-]{43}$/.test(s.jti) && Number.isFinite(s.expires) && s.expires > now && s.expires <= now + TTL * 1000 ? s : null;
  } catch { return null; }
}
export async function mobileSession(authorization: string | null, store = transientStore()) {
  const s = parseMobileToken(authorization);
  if (!s || await store.get(`mobile-session:${s.jti}`) !== hash(s.id)) return null;
  return { id: s.id, name: s.name };
}
export async function revokeMobileSession(authorization: string | null, store = transientStore()) {
  const s = parseMobileToken(authorization);
  if (s) await store.release(`mobile-session:${s.jti}`, hash(s.id));
}
export async function authorizeMobile(account: Account, challenge: unknown, state: unknown, store: TransientStore = transientStore()) {
  secret();
  if (typeof challenge !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || typeof state !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(state))
    throw new ConversationError(400, "앱에서 로그인을 다시 시작해 주세요.");
  const code = randomBytes(32).toString("base64url");
  await store.set(`mobile-code:${hash(code)}`, JSON.stringify({ account, challenge, state }), 120);
  return { callback: `hanmadi://auth?${new URLSearchParams({ code, state })}` };
}
export async function exchangeMobile(code: unknown, verifier: unknown, state: unknown, store: TransientStore = transientStore()) {
  secret();
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(code) || typeof verifier !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(verifier) || typeof state !== "string")
    throw new ConversationError(401, "앱 로그인 요청을 확인하지 못했어요. 다시 시작해 주세요.");
  const key = `mobile-code:${hash(code)}`, raw = await store.get(key);
  if (!raw) throw new ConversationError(401, "로그인이 만료됐어요. 다시 시작해 주세요.");
  const data = JSON.parse(raw) as { account: Account; challenge: string; state: string };
  if (data.challenge !== hash(verifier) || data.state !== state || !await store.claim(`mobile-code-used:${hash(code)}`, "used", 180))
    throw new ConversationError(401, "이미 사용했거나 올바르지 않은 로그인 요청이에요.");
  await store.release(key, raw);
  const s: Session = { ...data.account, scope: "learner-mobile", jti: randomBytes(32).toString("base64url"), expires: Date.now() + TTL * 1000 };
  await store.set(`mobile-session:${s.jti}`, hash(s.id), TTL);
  const value = Buffer.from(JSON.stringify(s)).toString("base64url");
  return { token: `hm1.${value}.${sign(value)}`, expiresAt: s.expires, name: s.name };
}
