import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { verifyGoogleIdentity, type GoogleIdentity } from "@cak/google-identity";
import { ConversationError } from "./conversation";
import { assertConversationOrigin, conversationJson, readLimitedBody } from "./conversation-http";
import { isAdminDeployment } from "./deployment";
import { issueLearnerSession } from "./learner-auth";
import { v2Driver } from "./store";
import { transientStore, type TransientStore } from "./transient-store";

const FLOW_COOKIE = "hanmadi_google_flow", FLOW_TTL = 300;
type Env = Record<string, string | undefined>;
type DB = Pick<ReturnType<typeof v2Driver>, "get" | "cas" | "count">;
type Account = { id: string; name: string; email: string; provider: "google"; createdAt: number };
type Dependencies = { env?: Env; db?: DB; store?: TransientStore; verify?: typeof verifyGoogleIdentity;
  complete?: (account: Account) => Promise<unknown> };
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function config(env: Env) {
  const clientId = env.HANMADI_GOOGLE_CLIENT_ID?.trim();
  return clientId && /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(clientId) &&
    (env.AUTH_SECRET?.length ?? 0) >= 32 && !isAdminDeployment(env) ? { clientId, secret: env.AUTH_SECRET! } : null;
}
function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(`google-login:${value}`).digest("base64url");
}
function flowValue(req: Request, secret: string): { nonce: string; expires: number } {
  const values = (req.headers.get("cookie") ?? "").split(";").map(s => s.trim()).filter(s => s.startsWith(FLOW_COOKIE + "="));
  if (values.length !== 1) throw new Error("invalid_flow");
  const raw = values[0].slice(FLOW_COOKIE.length + 1);
  if (raw.length > 1024) throw new Error("invalid_flow");
  const [value, signature, extra] = raw.split(".");
  const expected = sign(value, secret);
  if (extra || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected)))
    throw new Error("invalid_flow");
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString());
  if (!/^[A-Za-z0-9_-]{43}$/.test(parsed.nonce) || !Number.isFinite(parsed.expires) ||
      parsed.expires <= Date.now() || parsed.expires > Date.now() + FLOW_TTL * 1000) throw new Error("invalid_flow");
  return parsed;
}
function flowCookie(value: string, age: number, env: Env) {
  return `${FLOW_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${age === 0 ? "; Expires=Thu, 01 Jan 1970 00:00:00 GMT" : ""}${env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
export async function googleLearnerAccount(identity: GoogleIdentity, db: DB): Promise<Account> {
  // Keep password accounts in their existing namespace. Never auto-link by name/email.
  const key = `google-learner:${hash(identity.subject)}`;
  const existing = await db.get(key);
  if (existing) return JSON.parse(existing) as Account;
  const account: Account = { id: randomUUID(), name: identity.name, email: identity.email, provider: "google", createdAt: Date.now() };
  if (await db.cas(key, null, JSON.stringify(account))) return account;
  const winner = await db.get(key);
  if (!winner) throw new ConversationError(503, "계정을 준비하지 못했어요. 다시 시도해 주세요.");
  return JSON.parse(winner) as Account;
}
export async function googleAccountRequest(req: Request, deps: Dependencies = {}) {
  const env = deps.env ?? process.env;
  if (isAdminDeployment(env)) return new Response("Not found", { status: 404 });
  const settings = config(env);
  if (req.method === "GET") return conversationJson(settings ? { available: true, clientId: settings.clientId } : { available: false });
  if (req.method !== "POST") return conversationJson({ error: "지원하지 않는 요청이에요." }, 405);
  let clearFlow = false;
  try {
    assertConversationOrigin(req);
    if (!settings) throw new ConversationError(503, "Google 로그인을 준비 중이에요. 아이디로 로그인해 주세요.");
    if (!req.headers.get("content-type")?.startsWith("application/json")) throw new ConversationError(415, "요청 형식을 확인해 주세요.");
    let body;
    try { body = JSON.parse(Buffer.from(await readLimitedBody(req, 16000)).toString()); }
    catch (e) { if (e instanceof ConversationError) throw e; throw new ConversationError(400, "요청 형식을 확인해 주세요."); }
    if (!body || !["challenge", "credential"].includes(body.action)) throw new ConversationError(400, "로그인 요청을 확인해 주세요.");
    clearFlow = body.action === "credential";
    const db = deps.db ?? v2Driver(), hour = Math.floor(Date.now() / 3600000);
    const ip = hash(req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown");
    const counts = await Promise.all([db.count(`google-auth:${hour}`), db.count(`google-auth:${hour}:${ip}`)]);
    if (counts[0] > 1000 || counts[1] > 60) throw new ConversationError(429, "로그인 시도가 많아요. 잠시 후 다시 시도해 주세요.");
    if (body.action === "challenge") {
      const nonce = randomBytes(32).toString("base64url"), expiresAt = Date.now() + FLOW_TTL * 1000;
      const value = Buffer.from(JSON.stringify({ nonce, expires: expiresAt })).toString("base64url");
      const response = conversationJson({ nonce, expiresAt });
      response.headers.append("set-cookie", flowCookie(`${value}.${sign(value, settings.secret)}`, FLOW_TTL, env));
      return response;
    }
    let identity: GoogleIdentity, nonce: string;
    try {
      nonce = flowValue(req, settings.secret).nonce;
      identity = await (deps.verify ?? verifyGoogleIdentity)(body.credential, { clientId: settings.clientId, nonce });
    } catch { throw new ConversationError(401, "Google 인증이 만료되었거나 확인되지 않았어요. 다시 로그인해 주세요."); }
    // Atomic one-use claim also prevents concurrent replay across serverless instances.
    if (!await (deps.store ?? transientStore()).claim(`google-used:${hash(nonce)}`, "used", FLOW_TTL))
      throw new ConversationError(401, "이미 사용한 로그인 요청이에요. 다시 로그인해 주세요.");
    const account = await googleLearnerAccount(identity, db);
    await (deps.complete ?? issueLearnerSession)(account);
    const response = conversationJson({ ok: true, name: account.name });
    response.headers.append("set-cookie", flowCookie("", 0, env));
    return response;
  } catch (error) {
    const response = conversationJson({ error: error instanceof ConversationError ? error.message : "로그인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요." }, error instanceof ConversationError ? error.status : 503);
    if (clearFlow) response.headers.append("set-cookie", flowCookie("", 0, env));
    return response;
  }
}
