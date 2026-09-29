import test from "node:test";
import assert from "node:assert/strict";
import {
  publicConnections,
  assertSelection,
  accountConfig,
  accountRequest,
} from "./model-connections";
const id = "a".repeat(32);
const connection = {
  id,
  provider: "codex",
  state: "connected",
  models: ["gpt-test"],
  apiKey: "must-not-escape",
  route: "private",
};
test("public connection projection omits secrets and only allows the selected account model", () => {
  const records = publicConnections({ connections: [connection] });
  assert.equal(JSON.stringify(records).includes("must-not-escape"), false);
  assertSelection(records, id + ":gpt-test");
  assert.throws(() => assertSelection(records, id + ":other"));
  assert.throws(() => assertSelection(records, "b".repeat(32) + ":gpt-test"));
  assert.throws(() =>
    assertSelection(
      publicConnections({ connections: [{ ...connection, state: "expired" }] }),
      id + ":gpt-test",
    ),
  );
});
test("device verification only exposes the exact official URL and unexpired code", () => {
  const challenge = {
    url: "https://auth.openai.com/codex/device",
    code: "ABCD-1234",
    expiresAt: Date.now() / 1000 + 60,
  };
  assert.ok(
    publicConnections({
      connections: [{ ...connection, state: "authorizing", challenge }],
    })[0].challenge,
  );
  assert.throws(() =>
    publicConnections({
      connections: [
        {
          ...connection,
          state: "authorizing",
          challenge: { ...challenge, url: "https://evil.test" },
        },
      ],
    }),
  );
  assert.equal(
    publicConnections({
      connections: [
        {
          ...connection,
          state: "authorizing",
          challenge: { ...challenge, expiresAt: 0 },
        },
      ],
    })[0].challenge,
    undefined,
  );
});
test("account backend requires secret scope and safe server URL", () => {
  const env = {
    AI_ACCOUNTS_URL: "https://gateway.test/accounts",
    AI_ACCOUNTS_KEY: "k".repeat(32),
    AI_ACCOUNTS_SUBJECT_SECRET: "s".repeat(32),
  };
  assert.equal(accountConfig(env).base, "https://gateway.test/accounts");
  assert.throws(() =>
    accountConfig({ ...env, AI_ACCOUNTS_URL: "http://public.test" }),
  );
  assert.throws(() =>
    accountConfig({ ...env, AI_ACCOUNTS_SUBJECT_SECRET: "short" }),
  );
});

test("native Claude login and approval use the scoped account service without exposing credentials", async () => {
  const identity = {
    base: "https://accounts.test",
    key: "k".repeat(40),
    secret: "s".repeat(40),
    subject: "a".repeat(64),
  };
  const calls: { url: string; body: unknown }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(
      new Headers(init?.headers).get("X-AI-Subject"),
      identity.subject,
    );
    calls.push({ url: String(url), body: JSON.parse(init?.body as string) });
    return new Response(
      JSON.stringify(
        String(url).endsWith("/authorize")
          ? { ok: true }
          : { id, provider: "claude", state: "authorizing", models: [] },
      ),
    );
  };
  await accountRequest(
    identity,
    "/connections",
    "POST",
    { provider: "claude", authMethod: "claude-code" },
    fetcher,
  );
  const code = "fixture-code#" + "s".repeat(43);
  assert.deepEqual(
    await accountRequest(
      identity,
      `/connections/${id}/authorize`,
      "POST",
      { code },
      fetcher,
    ),
    { ok: true },
  );
  assert.deepEqual(calls, [
    {
      url: "https://accounts.test/connections",
      body: { provider: "claude", authMethod: "claude-code" },
    },
    {
      url: `https://accounts.test/connections/${id}/authorize`,
      body: { code },
    },
  ]);
  await assert.rejects(
    accountRequest(
      identity,
      `/connections/${id}/authorize`,
      "POST",
      { code: "invalid" },
      fetcher,
    ),
    /승인코드/,
  );
  assert.equal(calls.length, 2);
});
