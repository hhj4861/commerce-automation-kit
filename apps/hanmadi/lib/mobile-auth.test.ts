import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { authorizeMobile, exchangeMobile, mobileSession, parseMobileToken, revokeMobileSession } from "./mobile-auth";
import { memoryTransientStore } from "./transient-store";
import { assertStudyClientOrigin } from "./study-client-origin";
process.env.AUTH_SECRET = "test-mobile-secret-never-use-in-production-012345";
process.env.HANMADI_NATIVE_CLIENT_ENABLED = "true";
const verifier = "a".repeat(43), state = "b".repeat(43), challenge = createHash("sha256").update(verifier).digest("base64url");
async function code(store = memoryTransientStore()) { const r = await authorizeMobile({ id: "learner-one", name: "테스트" }, challenge, state, store); return { store, code: new URL(r.callback).searchParams.get("code")! }; }
test("PKCE binds the account, verifier and state; concurrent replay has one winner", async () => {
  const f = await code();
  await assert.rejects(exchangeMobile(f.code, "x".repeat(43), state, f.store));
  await assert.rejects(exchangeMobile(f.code, verifier, "bad-state", f.store));
  const results = await Promise.allSettled([exchangeMobile(f.code, verifier, state, f.store), exchangeMobile(f.code, verifier, state, f.store)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const token = (results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof exchangeMobile>>>).value.token;
  assert.deepEqual(await mobileSession(`Bearer ${token}`, f.store), { id: "learner-one", name: "테스트" });
  assert.equal(parseMobileToken(`Bearer ${token}x`), null);
  assert.equal(parseMobileToken(`Bearer ${token}`, Date.now() + 15 * 86400000), null);
  await revokeMobileSession(`Bearer ${token}`, f.store);
  assert.equal(await mobileSession(`Bearer ${token}`, f.store), null);
});
test("code expires and native auth is off by default and on the admin deployment", async () => {
  let now = Date.now(); const store = memoryTransientStore(() => now), f = await code(store); now += 121000;
  await assert.rejects(exchangeMobile(f.code, verifier, state, store));
  delete process.env.HANMADI_NATIVE_CLIENT_ENABLED;
  await assert.rejects(authorizeMobile({id: "one", name: "one"}, challenge, state, store));
  process.env.HANMADI_NATIVE_CLIENT_ENABLED = "true"; process.env.HANMADI_DEPLOYMENT = "admin";
  await assert.rejects(authorizeMobile({id: "one", name: "one"}, challenge, state, store));
  delete process.env.HANMADI_DEPLOYMENT;
});
test("browser Origin is still required and learner tokens never open admin endpoints", async () => {
  const f = await code(); const r = await exchangeMobile(f.code, verifier, state, f.store);
  await assert.rejects(assertStudyClientOrigin(new Request("https://test/api/study", {method: "POST", headers: {Origin: "https://evil.test", Authorization: `Bearer ${r.token}`}})));
  await assert.rejects(assertStudyClientOrigin(new Request("https://test/api/study/admin", {method: "POST", headers: {Authorization: `Bearer ${r.token}`}})));
  await assert.rejects(assertStudyClientOrigin(new Request("https://test/api/study", {method: "POST", headers: {Authorization: "Bearer invalid"}})));
  await assertStudyClientOrigin(new Request("https://test/api/study", {method: "POST", headers: {Origin: "https://test"}}));
});

test("native learner access checks revocation before Origin exemption", async () => {
 const r = await authorizeMobile({id: "native", name: "Native"}, challenge, state);
 const token = (await exchangeMobile(new URL(r.callback).searchParams.get("code"), verifier, state)).token;
 const req = () => new Request("https://test/api/study", {method: "POST", headers: {Authorization: `Bearer ${token}`}});
 await assertStudyClientOrigin(req()); await revokeMobileSession(`Bearer ${token}`);
 await assert.rejects(assertStudyClientOrigin(req()));
});
