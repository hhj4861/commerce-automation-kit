import { spokenReply } from "./guided-speaking";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ConversationError, parseConversation, tutorPrompt } from "./conversation";
import { assertProviderInput, getConversationProvider, replyToConversation } from "./conversation-provider";

const id = "12345678-1234-1234-1234-123456789abc";
const env = { LITELLM_BASE_URL: "https://gateway.example/llm", LITELLM_API_KEY: "test-only", LITELLM_MODEL: "hanmadi-chat" };
const config = getConversationProvider(env);
const input = () => parseConversation({ language: "ja", lessonId: "cafe", level: "beginner",
  messages: [{ role: "user", content: "こんにちは" }] });
const status = (code: number) => (e: unknown) => e instanceof ConversationError && e.status === code;
const answer = (text = "reply") => Response.json({ choices: [{ message: { content: text }, finish_reason: "stop" }] });

test("retired or unknown classroom configuration never falls back to LiteLLM", () => {
  assert.equal(config.provider, "litellm");
  for (const provider of ["dify", "unknown"])
    assert.throws(() => getConversationProvider({ ...env, CONVERSATION_PROVIDER: provider }), status(503));
  for (const key of ["DIFY_BASE_URL", "DIFY_API_KEY", "DIFY_USER_SECRET"])
    assert.throws(() => getConversationProvider({ ...env, [key]: "stale" }), status(503));
  assert.equal(getConversationProvider({ ...env, DIFY_API_KEY: "stale", CONVERSATION_PROVIDER: "litellm" }).provider, "litellm");
});

test("all classroom languages send server instructions and full history, without identity or retired fields", async () => {
  for (const language of ["ko", "th", "ja"] as const) {
    const parsed = { ...input(), language, studentSlug: "private-student", learningRevision: "private-revision", storageConsent: true,
      messages: [...input().messages, { role: "assistant" as const, content: "earlier" }, { role: "user" as const, content: "now" }] };
    await replyToConversation(parsed, config, async (url, init) => {
      assert.equal(String(url), "https://gateway.example/llm/v1/chat/completions");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-only");
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, "hanmadi-chat");
      assert.deepEqual(body.messages, [{ role: "system", content: tutorPrompt(parsed) }, ...parsed.messages]);
      for (const secret of ["private-student", "private-revision", "storageConsent", "conversation_id"])
        assert.ok(!String(init?.body).includes(secret));
      return answer();
    });
  }
});

test("old stored conversation IDs are rejected before a provider call", async () => {
  let calls = 0;
  const continued = { ...input(), conversationId: id };
  assert.throws(() => assertProviderInput(continued), status(409));
  await assert.rejects(replyToConversation(continued, config, async () => { calls++; return answer(); }), status(409));
  assert.equal(calls, 0);
  assert.deepEqual(await replyToConversation({ ...input(), storageConsent: false }, config, async () => answer()), { reply: "reply" });
});

test("upstream failures are explicit and are not retried through another provider", async () => {
  for (const [upstream, expected] of [[401, 502], [429, 429], [500, 502]]) {
    let calls = 0;
    await assert.rejects(replyToConversation(input(), config, async () => {
      calls++; return new Response("secret diagnostic", { status: upstream });
    }), (e: unknown) => status(expected)(e) && !(e as Error).message.includes("secret"));
    assert.equal(calls, 1);
  }
  for (const content of ["", "x".repeat(2001)])
    await assert.rejects(replyToConversation(input(), config, async () => answer(content)), status(502));
});

test("guided speaking keeps each oral attempt independent with server-owned instructions", async () => {
  for (const language of ["ja", "th"] as const) for (const lessonId of ["greetings", "cafe", "directions"]) {
    const free = { ...input(), language, lessonId };
    for (const guidedStep of [0, 1]) {
      const guided = parseConversation({ ...free, guidedStep });
      await replyToConversation(guided, config, async (_, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.messages.length, 2);
        assert.match(body.messages[0].content, /쓰기 없이 듣고 말하는/);
        assert.match(body.messages[0].content, /음성 인식 결과/);
        assert.match(body.messages[0].content, /새 질문·새 어휘/);
        assert.equal(body.messages[1].content, free.messages[0].content);
        return answer("연습 표현을 다시 들어 보세요.");
      });
    }
    for (const guidedStep of [-1, 2, 1.5, "0", null]) assert.throws(() => parseConversation({ ...free, guidedStep }), status(400));
    assert.throws(() => parseConversation({ ...free, guidedStep: 0, conversationId: id }), status(400));
    assert.throws(() => parseConversation({ ...free, guidedStep: 0, messages: [free.messages[0], { role: "assistant", content: "reply" }, free.messages[0]] }), status(400));
  }
});

test("oral playback excludes coaching, mixed-script annotations and markup links", () => {
  assert.equal(spokenReply("**こんにちは。**\n한글 발음: 곤니치와\n뜻: 안녕하세요", "ja"), "こんにちは。");
  assert.equal(spokenReply("ลองพูดอีกครั้ง\n한국어 설명", "th"), "ลองพูดอีกครั้ง");
  assert.equal(spokenReply("こんにちは (안녕하세요)", "ja"), undefined);
  assert.equal(spokenReply("[こんにちは](https://invalid.example)", "ja"), undefined);
  assert.equal(spokenReply("한글 설명만 있어요", "ja"), undefined);
});
