import test from "node:test";
import assert from "node:assert/strict";
import { publicConnections, assertSelection, accountConfig } from "./model-connections";
const id = "a".repeat(32);
const connection = { id, provider: "codex", state: "connected", models: ["gpt-test"], apiKey: "must-not-escape", route: "private" };
test("public connection projection omits secrets and only allows the selected account model", () => {
  const records = publicConnections({ connections: [connection] });
  assert.equal(JSON.stringify(records).includes("must-not-escape"), false);
  assertSelection(records, id + ":gpt-test");
  assert.throws(() => assertSelection(records, id + ":other"));
  assert.throws(() => assertSelection(records, "b".repeat(32) + ":gpt-test"));
  assert.throws(() => assertSelection(publicConnections({ connections: [{ ...connection, state: "expired" }] }), id + ":gpt-test"));
});
test("device verification only exposes the exact official URL and unexpired code", () => {
  const challenge = { url: "https://auth.openai.com/codex/device", code: "ABCD-1234", expiresAt: Date.now() / 1000 + 60 };
  assert.ok(publicConnections({ connections: [{ ...connection, state: "authorizing", challenge }] })[0].challenge);
  assert.throws(() => publicConnections({ connections: [{ ...connection, state: "authorizing", challenge: { ...challenge, url: "https://evil.test" } }] }));
  assert.equal(publicConnections({ connections: [{ ...connection, state: "authorizing", challenge: { ...challenge, expiresAt: 0 } }] })[0].challenge, undefined);
});
test("account backend requires secret scope and safe server URL", () => {
  const env = { AI_ACCOUNTS_URL: "https://gateway.test/accounts", AI_ACCOUNTS_KEY: "k".repeat(32), AI_ACCOUNTS_SUBJECT_SECRET: "s".repeat(32) };
  assert.equal(accountConfig(env).base, "https://gateway.test/accounts");
  assert.throws(() => accountConfig({ ...env, AI_ACCOUNTS_URL: "http://public.test" }));
  assert.throws(() => accountConfig({ ...env, AI_ACCOUNTS_SUBJECT_SECRET: "short" }));
});
