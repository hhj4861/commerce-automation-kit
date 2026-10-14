import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { googleAccountRequest, googleLearnerAccount } from "./google-learner-auth";
import { memoryTransientStore } from "./transient-store";
const origin = "https://hanmadi.example";
const env = { HANMADI_GOOGLE_CLIENT_ID: "app.apps.googleusercontent.com", AUTH_SECRET: "test-only-secret-32-characters-long", NODE_ENV: "production" };
const identity = { subject: "subject-1", email: "learner@example.com", name: "Learner" };
function fixture() {
  const data = new Map<string, string>(), counts = new Map<string, number>();
  const db = {
    async get(k: string) { return data.get(k) ?? null; },
    async cas(k: string, expected: string | null, value: string) {
      if ((data.get(k) ?? null) !== expected) return false;
      data.set(k, value); return true;
    },
    async count(k: string) { const n = (counts.get(k) ?? 0) + 1; counts.set(k, n); return n; },
  };
  let verified = 0, completed = 0;
  return { env, db, data, store: memoryTransientStore(),
    verify: async (_credential: string, options: { clientId: string; nonce: string }) => {
      assert.equal(options.clientId, env.HANMADI_GOOGLE_CLIENT_ID);
      assert.equal(options.nonce.length, 43); verified++; return identity;
    },
    complete: async () => { completed++; },
    calls: () => ({ verified, completed }),
  };
}
function request(body: unknown, cookie = "", headers: Record<string, string> = {}) {
  return new Request(origin + "/api/study/account/google", { method: "POST",
    headers: { origin, "content-type": "application/json", cookie, ...headers }, body: JSON.stringify(body) });
}
async function challenge(f = fixture()) {
  const response = await googleAccountRequest(request({ action: "challenge" }), f);
  assert.equal(response.status, 200);
  return { f, response, cookie: response.headers.get("set-cookie")!.split(";")[0], data: await response.json() };
}
test("configuration is hidden until explicit client/secret; admin rejects learner routes", async () => {
  for (const config of [{}, { ...env, AUTH_SECRET: "short" }, { ...env, HANMADI_GOOGLE_CLIENT_ID: "invalid" }]) {
    const r = await googleAccountRequest(new Request(origin), { env: config });
    assert.deepEqual(await r.json(), { available: false });
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
  const r = await googleAccountRequest(new Request(origin), { env });
  assert.deepEqual(await r.json(), { available: true, clientId: env.HANMADI_GOOGLE_CLIENT_ID });
  assert.equal((await googleAccountRequest(request({ action: "challenge" }), { env: { ...env, HANMADI_DEPLOYMENT: "admin" } })).status, 404);
});
test("rejects cross-origin, malformed, oversized and unconfigured requests without verification", async () => {
  const f = fixture();
  for (const [req, status] of [
    [request({ action: "challenge" }, "", { origin: "https://attacker.example" }), 403],
    [request({ action: "challenge" }, "", { "content-type": "text/plain" }), 415],
    [request({ action: "unknown" }), 400], [request({ action: "credential", credential: "x".repeat(16000) }), 413],
  ] as const) assert.equal((await googleAccountRequest(req, f)).status, status);
  assert.equal((await googleAccountRequest(request({ action: "challenge" }), { ...f, env: {} })).status, 503);
  assert.deepEqual(f.calls(), { verified: 0, completed: 0 });
});
test("challenge is private, expiring and tied to a secure HttpOnly browser cookie", async () => {
  const { response, data } = await challenge();
  const cookie = response.headers.get("set-cookie")!;
  for (const attr of ["HttpOnly", "SameSite=Lax", "Secure", "Path=/", "Max-Age=300"]) assert.ok(cookie.includes(attr));
  assert.match(data.nonce, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(data.expiresAt > Date.now());
  assert.equal(response.headers.get("cache-control"), "no-store");
});
test("successful Google login issues only learner identity, clears flow and rejects concurrent replay", async () => {
  const { f, cookie } = await challenge();
  const results = await Promise.all([1, 2].map(() => googleAccountRequest(request({ action: "credential", credential: "signed-token" }, cookie), f)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
  const success = results.find(r => r.status === 200)!;
  assert.deepEqual(await success.json(), { ok: true, name: "Learner" });
  assert.match(success.headers.get("set-cookie")!, /Max-Age=0/);
  assert.match(success.headers.get("set-cookie")!, /Expires=Thu, 01 Jan 1970/);
  assert.equal(f.calls().completed, 1);
  assert.equal(f.data.size, 1);
  const record = JSON.parse([...f.data.values()][0]);
  assert.equal(record.provider, "google");
  assert.equal(record.owner, undefined); assert.equal(record.role, undefined);
});
test("same Google subject is stable under concurrent creation; email never links accounts", async () => {
  const f = fixture();
  f.data.set("learner:learner", JSON.stringify({ id: "password-account", passwordHash: "keep" }));
  const records = await Promise.all(Array.from({ length: 5 }, () => googleLearnerAccount(identity, f.db)));
  assert.equal(new Set(records.map(x => x.id)).size, 1);
  assert.equal((await googleLearnerAccount({ ...identity, email: "changed@example.com" }, f.db)).id, records[0].id);
  assert.notEqual((await googleLearnerAccount({ ...identity, subject: "other-sub" }, f.db)).id, records[0].id);
  assert.equal(JSON.parse(f.data.get("learner:learner")!).id, "password-account");
});
test("invalid, duplicate and expired cookies fail before token verification", async () => {
  const { f, cookie } = await challenge();
  const value = Buffer.from(JSON.stringify({ nonce: "a".repeat(43), expires: Date.now()-1 })).toString("base64url");
  const sig = createHmac("sha256", env.AUTH_SECRET).update(`google-login:${value}`).digest("base64url");
  for (const flow of ["", cookie + "x", cookie + "; " + cookie, `hanmadi_google_flow=${value}.${sig}`]) {
    const r = await googleAccountRequest(request({ action: "credential", credential: "invalid" }, flow), f);
    assert.equal(r.status, 401); assert.match(r.headers.get("set-cookie")!, /Max-Age=0/);
  }
  assert.deepEqual(f.calls(), { verified: 0, completed: 0 }); assert.equal(f.data.size, 0);
});
test("provider verification failure never creates account, emits credential or exception", async () => {
  const { f, cookie } = await challenge();
  const response = await googleAccountRequest(request({ action: "credential", credential: "sensitive-token" }, cookie), {
    ...f, verify: async () => { throw new Error("sensitive-token-provider-details"); },
  });
  assert.equal(response.status, 401); assert.doesNotMatch(await response.text(), /sensitive-token/);
  assert.equal(f.data.size, 0); assert.equal(f.calls().completed, 0);
});
test("rate limits challenge and credentials before provider verification", async () => {
  const f = fixture();
  const response = await googleAccountRequest(request({ action: "challenge" }), { ...f, db: { ...f.db, count: async () => 1001 } });
  assert.equal(response.status, 429); assert.deepEqual(f.calls(), { verified: 0, completed: 0 });
});
