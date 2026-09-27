import assert from "node:assert/strict";
import { test } from "node:test";
import { ConversationError, parseConversation } from "./conversation";
import { assertProviderInput, difyUser, getConversationProvider, replyToConversation } from "./conversation-provider";

const id = "12345678-1234-1234-1234-123456789abc";
const env = { CONVERSATION_PROVIDER: "dify", DIFY_BASE_URL: "https://dify.example/v1/",
  DIFY_API_KEY: "app-test-only", DIFY_USER_SECRET: "test-identity-secret-at-least-32-characters" };
const config = getConversationProvider(env);
const input = () => parseConversation({ language: "ja", lessonId: "cafe", level: "beginner",
  storageConsent: true, messages: [{ role: "user", content: "こんにちは" }] });
const status = (code: number) => (e: unknown) => e instanceof ConversationError && e.status === code;

test("Dify configuration is server-only, explicit and fails closed", () => {
  assert.equal(config.provider, "dify");
  if (config.provider === "dify") assert.equal(config.baseUrl, "https://dify.example/v1");
  for (const base of ["http://external.example", "https://user:password@host", "https://host?key=x", "file:///tmp/x"])
    assert.throws(() => getConversationProvider({ ...env, DIFY_BASE_URL: base }), status(503));
  assert.throws(() => getConversationProvider({ ...env, DIFY_USER_SECRET: "short" }), status(503));
  assert.throws(() => getConversationProvider({ DIFY_API_KEY: "partial-config" }), status(503));
  assert.throws(() => getConversationProvider({ ...env, CONVERSATION_PROVIDER: "unknown" }), status(503));
  assert.equal(getConversationProvider({ ...env, DIFY_BASE_URL: "http://localhost:4180" }).provider, "dify");
});

test("authenticated identity and course settings scope Dify conversations", () => {
  const user = difyUser("actor-a", input(), env.DIFY_USER_SECRET);
  assert.match(user, /^[0-9a-f]{64}$/);
  assert.equal(user, difyUser("actor-a", input(), env.DIFY_USER_SECRET));
  for (const [actor, change] of [["actor-b", {}], ["actor-a", { language: "th" }],
    ["actor-a", { lessonId: "greetings" }], ["actor-a", { level: "intermediate" }]] as const)
    assert.notEqual(user, difyUser(actor, { ...input(), ...change }, env.DIFY_USER_SECRET));
});

test("only the current message and validated lesson inputs reach Dify", async () => {
  for (const [language, name] of [["ko", "한국어"], ["th", "태국어"], ["ja", "일본어"]] as const) {
    const parsed = { ...input(), language };
    const fake: typeof fetch = async (url, init) => {
      assert.equal(url, "https://dify.example/v1/chat-messages");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer app-test-only");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.inputs.language, name);
      assert.equal(body.inputs.level, "입문");
      assert.ok(body.inputs.scenario.length <= 300);
      assert.equal(body.query, "こんにちは");
      assert.equal(body.user, difyUser("actor", parsed, env.DIFY_USER_SECRET));
      assert.equal(body.messages, undefined);
      assert.equal(body.conversation_id, undefined);
      assert.equal(body.auto_generate_name, false);
      assert.equal(init?.redirect, "error");
      return Response.json({ answer: " hello ", conversation_id: id });
    };
    assert.deepEqual(await replyToConversation(parsed, "actor", config, fake), { reply: "hello", conversationId: id });
  }
});

test("continuation preserves id; consent and missing continuity fail before upstream", async () => {
  const continued = { ...input(), conversationId: id, messages: [...input().messages,
    { role: "assistant" as const, content: "earlier" }, { role: "user" as const, content: "now" }] };
  assert.throws(() => assertProviderInput({ ...continued, conversationId: undefined }, config), status(409));
  assert.throws(() => assertProviderInput({ ...input(), storageConsent: false }, config), status(400));
  await replyToConversation(continued, "actor", config, async (_, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.conversation_id, id);
    assert.equal(body.query, "now");
    assert.ok(!String(init?.body).includes("earlier"));
    return Response.json({ answer: "reply", conversation_id: id });
  });
  assert.throws(() => parseConversation({ ...input(), conversationId: "../../other" }), status(400));
});

test("Dify failures do not expose provider details or silently retry", async () => {
  for (const [upstream, expected] of [[401, 502], [429, 429], [404, 409], [500, 502]]) {
    let count = 0;
    await assert.rejects(replyToConversation(input(), "actor", config, async () => {
      count++; return new Response("secret provider diagnostic", { status: upstream });
    }), (error: unknown) => {
      assert.ok(status(expected)(error));
      assert.ok(!(error as Error).message.includes("secret"));
      return true;
    });
    assert.equal(count, 1);
  }
  await assert.rejects(replyToConversation(input(), "actor", config, async () => { throw new Error("timeout"); }), status(504));
  for (const body of [{ answer: "", conversation_id: id }, { answer: "reply", conversation_id: "bad" },
    { answer: "x".repeat(2001), conversation_id: id }])
    await assert.rejects(replyToConversation(input(), "actor", config, async () => Response.json(body)), status(502));
});

test("LiteLLM remains available when Dify is not configured", async () => {
  const direct = getConversationProvider({ LITELLM_BASE_URL: "http://localhost:4100", LITELLM_API_KEY: "key", LITELLM_MODEL: "hanmadi-chat" });
  assert.equal(direct.provider, "litellm");
  assert.throws(() => assertProviderInput({ ...input(), conversationId: id }, direct), status(409));
  assert.deepEqual(await replyToConversation(input(), "actor", direct, async () => Response.json({
    choices: [{ message: { content: "direct" }, finish_reason: "stop" }],
  })), { reply: "direct" });
});
