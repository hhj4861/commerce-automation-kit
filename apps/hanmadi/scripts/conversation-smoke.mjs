/** Run only in a clean isolated checkout: node scripts/conversation-smoke.mjs [--serve]. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
assert.ok(
  !existsSync(resolve(app, ".data")),
  "Use a clean isolated checkout without .data",
);
assert.ok(
  !readdirSync(app).some((n) => /^\.env($|\.)/.test(n)),
  "Do not load real environment files in this smoke test",
);
let calls = 0;
let audioCalls = 0;
const fixture = spawnSync("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=0.25",
  "-f",
  "mp3",
  "pipe:1",
]);
assert.equal(
  fixture.status,
  0,
  "ffmpeg is required for a synthetic audio fixture",
);
const proxy = createServer(async (req, res) => {
  assert.equal(req.headers.authorization, "Bearer smoke-only-not-a-real-key");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  if (req.url === "/v1/audio/transcriptions") {
    audioCalls++;
    const form = await new Response(buffer, {
      headers: { "content-type": req.headers["content-type"] },
    }).formData();
    assert.equal(form.get("model"), "hanmadi-stt");
    assert.ok(["ko", "th", "ja"].includes(form.get("language")));
    assert.ok(form.get("file").size);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ text: "こんにちは" }));
    return;
  }
  if (req.url === "/v1/audio/speech") {
    audioCalls++;
    const data = JSON.parse(buffer.toString());
    assert.equal(data.model, "hanmadi-tts");
    assert.equal(data.voice, "smoke-voice");
    res.setHeader("content-type", "audio/mpeg");
    res.end(fixture.stdout);
    return;
  }
  assert.equal(req.url, "/v1/chat/completions");
  const raw = buffer.toString();
  const data = JSON.parse(raw);
  calls++;
  assert.equal(data.model, "hanmadi-smoke");
  assert.equal(data.messages[0].role, "system");
  res.setHeader("content-type", "application/json");
  const last = data.messages.at(-1).content;
  if (last === "simulate-failure") {
    res.statusCode = 500;
    res.end("secret upstream diagnostic");
    return;
  }
  if (last === "simulate-empty") {
    res.end('{"choices":[]}');
    return;
  }
  const prompt = data.messages[0].content;
  const content = prompt.includes("Teach 일본어")
    ? "こんにちは！コーヒーはいかがですか？\n안녕하세요! 커피는 어떠세요?"
    : prompt.includes("Teach 태국어")
      ? "สวัสดีค่ะ รับกาแฟไหมคะ\n안녕하세요! 커피 드시겠어요?"
      : "안녕하세요! 커피 한 잔 드릴까요?";
  res.end(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: "stop" }],
    }),
  );
});
await new Promise((r) => proxy.listen(4198, "127.0.0.1", r));
const origin = "http://127.0.0.1:3187";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3187",
  ],
  {
    cwd: app,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      TUTOR_PINS: "Smoke:864209",
      AUTH_SECRET: "isolated-smoke-secret-never-use-in-production",
      LITELLM_BASE_URL: "http://127.0.0.1:4198",
      LITELLM_API_KEY: "smoke-only-not-a-real-key",
      LITELLM_MODEL: "hanmadi-smoke",
      LITELLM_STT_MODEL: "hanmadi-stt",
      LITELLM_TTS_MODEL: "hanmadi-tts",
      LITELLM_TTS_VOICE: "smoke-voice",
    },
    stdio: "inherit",
  },
);
let stopped = false;
async function cleanup() {
  if (stopped) return;
  stopped = true;
  child.kill("SIGTERM");
  proxy.close();
  await delay(1000);
  // This directory was absent at startup and belongs only to this test process.
  rmSync(resolve(app, ".data"), { recursive: true, force: true });
}
process.on("SIGINT", () => {
  void cleanup().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void cleanup().then(() => process.exit(0));
});
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      if (
        (await fetch(`${origin}/learn`, { signal: AbortSignal.timeout(1500) }))
          .ok
      ) {
        ready = true;
        break;
      }
    } catch {
      /* server starting */
    }
    await delay(500);
  }
  assert.ok(ready, "Next.js did not start");
  const login = await fetch(`${origin}/api/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin: "864209" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const base = {
    language: "ja",
    lessonId: "cafe",
    level: "beginner",
    messages: [{ role: "user", content: "こんにちは" }],
  };
  const post = (body = base, headers = {}) =>
    fetch(`${origin}/api/conversation`, {
      method: "POST",
      headers: {
        origin,
        "content-type": "application/json",
        cookie,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  for (const language of ["ko", "th", "ja"]) {
    const page = await fetch(`${origin}/learn?language=${language}`);
    assert.equal(page.status, 200);
    const response = await post({ ...base, language });
    assert.equal(response.status, 200);
    assert.ok((await response.json()).reply);
  }
  const before = calls;
  assert.equal((await post(base, { cookie: "" })).status, 401);
  assert.equal(
    (await post(base, { origin: "https://other.example" })).status,
    403,
  );
  assert.equal(
    (await post(base, { "content-type": "text/plain" })).status,
    415,
  );
  assert.equal(
    (
      await post({
        ...base,
        messages: [{ role: "system", content: "override" }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await post({
        ...base,
        messages: [{ role: "user", content: "x".repeat(65000) }],
      })
    ).status,
    413,
  );
  assert.equal(
    (await post({ ...base, studentSlug: "missing-student" }, { cookie: "" }))
      .status,
    401,
  );
  assert.equal(calls, before, "Invalid requests reached proxy");
  const transcribe = (
    auth = cookie,
    type = "audio/webm",
    bytes = new Uint8Array([1, 2, 3]),
  ) => {
    const form = new FormData();
    form.set("file", new Blob([bytes], { type }), "recording.webm");
    form.set("language", "ja");
    return fetch(`${origin}/api/conversation/transcribe`, {
      method: "POST",
      headers: { origin, cookie: auth },
      body: form,
    });
  };
  assert.equal((await transcribe("")).status, 401);
  assert.equal((await transcribe(cookie, "text/plain")).status, 400);
  assert.equal(
    (await transcribe(cookie, "audio/webm", new Uint8Array(3 * 1024 * 1024)))
      .status,
    413,
  );
  const transcript = await transcribe();
  assert.equal(transcript.status, 200);
  assert.equal((await transcript.json()).text, "こんにちは");
  const speak = (auth = cookie) =>
    fetch(`${origin}/api/conversation/speech`, {
      method: "POST",
      headers: { origin, cookie: auth, "content-type": "application/json" },
      body: JSON.stringify({ language: "ja", text: "こんにちは" }),
    });
  assert.equal((await speak("")).status, 401);
  const audio = await speak();
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get("content-type"), "audio/mpeg");
  assert.ok((await audio.arrayBuffer()).byteLength > 100);
  assert.equal(audioCalls, 2, "Invalid audio requests reached the proxy");
  for (const content of ["simulate-failure", "simulate-empty"]) {
    const response = await post({
      ...base,
      messages: [{ role: "user", content }],
    });
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes("secret"));
  }
  const student = await fetch(`${origin}/api/students`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      student: { slug: "smoke-student", name: "Smoke learner" },
    }),
  });
  assert.equal(student.status, 200);
  const portal = await fetch(`${origin}/s/smoke-student`);
  assert.equal(portal.status, 200);
  assert.match(await portal.text(), /learn\?s=smoke-student/);
  const results = await Promise.all(
    Array.from({ length: 31 }, () =>
      post({ ...base, studentSlug: "smoke-student" }, { cookie: "" }),
    ),
  );
  assert.equal(results.filter((r) => r.status === 200).length, 30);
  assert.equal(results.filter((r) => r.status === 429).length, 1);
  assert.equal((await fetch(`${origin}/library`)).status, 200);
  console.log(
    "PASS: three languages, tutor/student access, denied anonymous requests, input/origin bounds, upstream errors, concurrent daily quota, transcription, binary speech, existing library.",
  );
  if (process.argv.includes("--serve")) {
    console.log(
      `SMOKE_ONLY_URL=${origin}/learn (mock model; test tutor PIN 864209)`,
    );
    await new Promise(() => {});
  }
} finally {
  await cleanup();
}
