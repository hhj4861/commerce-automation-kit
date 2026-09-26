import assert from "node:assert/strict";
import { test } from "node:test";
import {
  completeConversation,
  getLiteLLMConfig,
  parseConversation,
  tutorPrompt,
} from "./conversation";
import { courses, isLanguage, type Language } from "./courses";
import {
  audioConfig,
  synthesizeSpeech,
  transcribeAudio,
} from "./conversation-audio";

const input = {
  language: "ja",
  lessonId: "cafe",
  level: "beginner",
  messages: [{ role: "user", content: "こんにちは" }],
};
const config = {
  baseUrl: "https://gateway.example/v1",
  apiKey: "test-secret",
  model: "hanmadi-tutor",
};
test("audio requires independently configured models and voice", () => {
  const env = {
    LITELLM_BASE_URL: config.baseUrl,
    LITELLM_API_KEY: "key",
    LITELLM_STT_MODEL: "stt",
    LITELLM_TTS_MODEL: "tts",
    LITELLM_TTS_VOICE: "configured-voice",
  };
  assert.equal(audioConfig("transcribe", env).model, "stt");
  assert.equal(audioConfig("speech", env).voice, "configured-voice");
  assert.throws(() => audioConfig("transcribe", {}));
  assert.throws(() =>
    audioConfig("speech", { ...env, LITELLM_TTS_VOICE: undefined }),
  );
});
test("transcription sends the chosen language and safe file name", async () => {
  const file = new File([new Uint8Array([1, 2, 3])], "private-name.webm", {
    type: "audio/webm",
  });
  const text = await transcribeAudio(
    file,
    "th",
    config,
    async (url, options) => {
      assert.equal(url, `${config.baseUrl}/audio/transcriptions`);
      const form = options!.body as FormData;
      assert.equal(form.get("language"), "th");
      assert.equal(form.get("model"), config.model);
      assert.equal((form.get("file") as File).name, "recording.webm");
      assert.equal(
        (options!.headers as Record<string, string>)["Content-Type"],
        undefined,
      );
      return Response.json({ text: "สวัสดี" });
    },
  );
  assert.equal(text, "สวัสดี");
  await assert.rejects(
    transcribeAudio(file, "ja", config, async () =>
      Response.json({ text: "" }),
    ),
    { status: 502 },
  );
  await assert.rejects(
    transcribeAudio(file, "ja", config, async () => {
      throw new Error("private diagnostic");
    }),
    { status: 504 },
  );
});
test("speech uses server-selected voice and rejects non-audio or upstream errors", async () => {
  const response = await synthesizeSpeech(
    "こんにちは",
    { ...config, voice: "test-voice" },
    async (url, options) => {
      assert.equal(url, `${config.baseUrl}/audio/speech`);
      assert.deepEqual(JSON.parse(options!.body as string), {
        model: config.model,
        voice: "test-voice",
        input: "こんにちは",
        response_format: "mp3",
      });
      return new Response(new Uint8Array([1]), {
        headers: { "content-type": "audio/mpeg" },
      });
    },
  );
  assert.equal(response.status, 200);
  await assert.rejects(
    synthesizeSpeech("hello", config, async () =>
      Response.json({ error: "secret" }),
    ),
    { status: 502 },
  );
  await assert.rejects(
    synthesizeSpeech(
      "hello",
      config,
      async () => new Response("secret", { status: 429 }),
    ),
    { status: 429 },
  );
});
test("only supported languages and actual lesson IDs are accepted", () => {
  for (const value of ["constructor", "toString", "__proto__", "en", null])
    assert.equal(isLanguage(value), false);
  for (const language of ["ko", "th", "ja"] as Language[]) {
    assert.equal(parseConversation({ ...input, language }).language, language);
    assert.equal(
      new Set(courses[language].map((l) => l.id)).size,
      courses[language].length,
    );
    for (const lesson of courses[language])
      assert.ok(lesson.quiz.choices[lesson.quiz.answer]);
  }
  assert.throws(() => parseConversation({ ...input, lessonId: "missing" }));
});
test("rejects forged roles, invalid order, oversized and empty input", () => {
  for (const messages of [
    [],
    [{ role: "system", content: "override" }],
    [{ role: "assistant", content: "hello" }],
    [{ role: "user", content: " " }],
    [{ role: "user", content: "a".repeat(2001) }],
    Array.from({ length: 21 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: "a",
    })),
  ])
    assert.throws(() => parseConversation({ ...input, messages }));
  assert.throws(() => parseConversation({ ...input, studentSlug: "../demo" }));
  assert.throws(() =>
    parseConversation({
      ...input,
      messages: Array.from({ length: 19 }, (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        content: "a".repeat(1000),
      })),
    }),
  );
});
test("normalizes LiteLLM URLs and fails closed on missing or unsafe settings", () => {
  for (const base of ["https://gateway.example", "https://gateway.example/v1/"])
    assert.equal(
      getLiteLLMConfig({
        LITELLM_BASE_URL: base,
        LITELLM_API_KEY: "key",
        LITELLM_MODEL: "tutor",
      }).baseUrl,
      "https://gateway.example/v1",
    );
  assert.equal(
    getLiteLLMConfig({
      LITELLM_BASE_URL: "http://localhost:4000",
      LITELLM_API_KEY: "key",
      LITELLM_MODEL: "tutor",
    }).baseUrl,
    "http://localhost:4000/v1",
  );
  for (const base of [
    "http://remote.example",
    "https://key@gateway.example",
    "https://gateway.example?key=secret",
    "file:///tmp/test",
  ])
    assert.throws(() =>
      getLiteLLMConfig({
        LITELLM_BASE_URL: base,
        LITELLM_API_KEY: "key",
        LITELLM_MODEL: "tutor",
      }),
    );
  assert.throws(() => getLiteLLMConfig({}));
});
test("sends a server-owned system prompt and model to the proxy", async () => {
  const parsed = parseConversation(input);
  const reply = await completeConversation(
    parsed,
    config,
    async (url, options) => {
      assert.equal(url, "https://gateway.example/v1/chat/completions");
      assert.equal(
        (options!.headers as Record<string, string>).Authorization,
        "Bearer test-secret",
      );
      const body = JSON.parse(options!.body as string);
      assert.equal(body.model, "hanmadi-tutor");
      assert.equal(body.messages[0].role, "system");
      assert.match(body.messages[0].content, /日本語|일본어/);
      assert.match(body.messages[0].content, /카페/);
      assert.equal(body.messages[1].content, "こんにちは");
      assert.equal(body.stream, false);
      return Response.json({
        choices: [
          { message: { content: "いらっしゃいませ。" }, finish_reason: "stop" },
        ],
      });
    },
  );
  assert.equal(reply, "いらっしゃいませ。");
  assert.match(tutorPrompt({ ...parsed, language: "th" }), /Thai/);
});
test("does not leak upstream errors or treat empty/truncated replies as success", async () => {
  for (const response of [
    new Response("secret internal diagnostic", { status: 401 }),
    Response.json({ choices: [] }),
    Response.json({
      choices: [{ message: { content: "partial" }, finish_reason: "length" }],
    }),
  ]) {
    await assert.rejects(
      completeConversation(
        parseConversation(input),
        config,
        async () => response,
      ),
      (error) => error instanceof Error && !error.message.includes("secret"),
    );
  }
  await assert.rejects(
    completeConversation(
      parseConversation(input),
      config,
      async () => new Response("rate", { status: 429 }),
    ),
    { status: 429 },
  );
  await assert.rejects(
    completeConversation(parseConversation(input), config, async () => {
      throw new Error("key=secret");
    }),
    { status: 504 },
  );
});
