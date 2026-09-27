/** Isolated Next.js -> Dify test. Optional signed Dify app fixture from disposable CI. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temp = mkdtempSync(join(tmpdir(), "hanmadi-dify-test-"));
const app = join(temp, "app");
const externalFile = process.env.HANMADI_DIFY_CI_FILE;
if (externalFile) assert.equal(process.env.GITHUB_ACTIONS, "true", "Real Dify fixture is restricted to disposable CI");
const fixture = externalFile ? JSON.parse(readFileSync(externalFile, "utf8")) : {
  DIFY_BASE_URL: "http://127.0.0.1:4197/v1", DIFY_API_KEY: "app-dify-smoke-only",
};
const contexts = new Map();
let calls = 0;
let audioCalls = 0;
const mock = createServer(async (req, res) => {
  assert.equal(req.headers.authorization, "Bearer app-dify-smoke-only");
  assert.equal(req.url, "/v1/chat-messages");
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  assert.match(body.user, /^[0-9a-f]{64}$/);
  assert.ok(["한국어", "태국어", "일본어"].includes(body.inputs.language));
  assert.ok(["입문", "중급"].includes(body.inputs.level));
  calls++;
  res.setHeader("content-type", "application/json");
  if (body.conversation_id && contexts.get(body.conversation_id) !== body.user) {
    res.writeHead(404); res.end('{"message":"not found"}'); return;
  }
  const id = body.conversation_id || randomUUID();
  contexts.set(id, body.user);
  res.end(JSON.stringify({ answer: "CI mock response", conversation_id: id }));
});
const audioFixture = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
  "sine=frequency=440:duration=0.25", "-f", "mp3", "pipe:1"]);
assert.equal(audioFixture.status, 0, "ffmpeg is required for a synthetic audio fixture");
const recordedFixture = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
  "sine=frequency=440:duration=0.25", "-c:a", "libopus", "-f", "webm", "pipe:1"]);
assert.equal(recordedFixture.status, 0, "ffmpeg must support browser-compatible WebM/Opus");
const voice = createServer(async (req, res) => {
  assert.equal(req.headers.authorization, "Bearer audio-smoke-only");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  audioCalls++;
  if (req.url === "/v1/audio/transcriptions") {
    const form = await new Response(body, { headers: { "content-type": req.headers["content-type"] } }).formData();
    assert.equal(form.get("model"), "hanmadi-stt");
    assert.ok(form.get("file").size > 0);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ text: "こんにちは" }));
  } else {
    assert.equal(req.url, "/v1/audio/speech");
    assert.equal(JSON.parse(body).model, "hanmadi-tts");
    res.setHeader("content-type", "audio/mpeg");
    res.end(audioFixture.stdout);
  }
});
let child;
let stopped = false;
async function cleanup() {
  if (stopped) return;
  stopped = true;
  if (child && child.exitCode === null) {
    const ended = new Promise((done) => child.once("exit", done));
    child.kill("SIGTERM");
    await Promise.race([ended, delay(5000)]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL"); await ended;
    }
  }
  mock.close(); voice.close();
  rmSync(temp, { recursive: true, force: true });
}
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { void cleanup().then(() => process.exit(0)); });
try {
  cpSync(source, app, { recursive: true, filter: (path) => !relative(source, path).split(sep).some((part) =>
    part.startsWith(".env") || ["node_modules", ".next", ".data", ".litellm", "ops", ".vercel"].includes(part)) });
  assert.ok(existsSync(join(source, "node_modules")), "Run npm ci first");
  symlinkSync(join(source, "node_modules"), join(app, "node_modules"), "dir");
  if (!externalFile) await new Promise((done) => mock.listen(4197, "127.0.0.1", done));
  await new Promise((done) => voice.listen(4198, "127.0.0.1", done));
  const origin = "http://127.0.0.1:3188";
  child = spawn(process.execPath, [join(app, "node_modules/next/dist/bin/next"), "dev", "--webpack",
    "--hostname", "127.0.0.1", "--port", "3188"], {
    cwd: app, stdio: "inherit", env: {
      PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1",
      TUTOR_PINS: "Smoke:864209,Other:973105", AUTH_SECRET: "isolated-smoke-secret-never-use-in-production",
      CONVERSATION_PROVIDER: "dify", DIFY_BASE_URL: fixture.DIFY_BASE_URL, DIFY_API_KEY: fixture.DIFY_API_KEY,
      DIFY_USER_SECRET: "isolated-dify-identity-secret-not-production",
      LITELLM_BASE_URL: "http://127.0.0.1:4198", LITELLM_API_KEY: "audio-smoke-only",
      LITELLM_STT_MODEL: "hanmadi-stt", LITELLM_TTS_MODEL: "hanmadi-tts", LITELLM_TTS_VOICE: "smoke-voice",
    },
  });
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    try { if ((await fetch(origin + "/learn", { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } }
    catch { /* Cold compilation. */ }
    if (child.exitCode !== null) break;
    await delay(1000);
  }
  assert.ok(ready, "Next.js did not start");
  async function login(pin) {
    const res = await fetch(origin + "/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pin }) });
    assert.equal(res.status, 200);
    return res.headers.getSetCookie().find(value => value.startsWith("hanmadi_tutor="))?.split(";")[0];
  }
  const cookie = await login("864209");
  const otherCookie = await login("973105");
  const base = { language: "ja", lessonId: "cafe", level: "beginner", storageConsent: true,
    messages: [{ role: "user", content: "こんにちは" }] };
  const post = (body = base, extra = {}) => fetch(origin + "/api/conversation", {
    method: "POST", headers: { "content-type": "application/json", origin, cookie, ...extra }, body: JSON.stringify(body),
  });
  for (const language of ["ko", "th", "ja"]) {
    const page = await fetch(`${origin}/conversation?language=${language}&lesson=cafe`, { headers: { cookie } });
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes("대화가 회화 서버에 저장되는 것에 동의해요"));
    assert.ok(!html.includes(fixture.DIFY_API_KEY));
    const first = await post({ ...base, language });
    assert.equal(first.status, 200);
    const answer = await first.json();
    assert.equal(answer.reply, "CI mock response");
    assert.ok(answer.conversationId);
    const continuation = { ...base, language, conversationId: answer.conversationId, messages: [
      ...base.messages, { role: "assistant", content: answer.reply }, { role: "user", content: "한 번 더 연습할게요" }] };
    const second = await post(continuation);
    assert.equal(second.status, 200);
    assert.equal((await second.json()).conversationId, answer.conversationId);
    // Client-supplied identity cannot override the server's authenticated actor.
    assert.equal((await post({ ...continuation, user: "Smoke" }, { cookie: otherCookie })).status, 409);
    assert.equal((await post({ ...continuation, level: "intermediate" })).status, 409);
    const reset = await post({ ...base, language });
    assert.notEqual((await reset.json()).conversationId, answer.conversationId);
  }
  const before = calls;
  assert.equal((await post(base, { cookie: "" })).status, 401);
  assert.equal((await post(base, { origin: "https://other.example" })).status, 403);
  assert.equal((await post({ ...base, storageConsent: false })).status, 400);
  assert.equal((await post({ ...base, conversationId: "../../other" })).status, 400);
  assert.equal(calls, before);
  const student = await fetch(origin + "/api/students", { method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ student: { slug: "dify-smoke-student", name: "Synthetic learner" } }) });
  assert.equal(student.status, 200);
  assert.equal((await post({ ...base, studentSlug: "dify-smoke-student" }, { cookie: "" })).status, 200);
  const form = new FormData();
  form.set("file", new Blob([recordedFixture.stdout], { type: "audio/webm" }), "synthetic.webm"); form.set("language", "ja");
  const transcribed = await fetch(origin + "/api/conversation/transcribe", { method: "POST", headers: { origin, cookie }, body: form });
  assert.equal(transcribed.status, 200);
  const transcript = (await transcribed.json()).text;
  const spokenReply = await post({ ...base, messages: [{ role: "user", content: transcript }] });
  assert.equal(spokenReply.status, 200);
  const speech = await fetch(origin + "/api/conversation/speech", { method: "POST", headers: { origin, cookie, "content-type": "application/json" },
    body: JSON.stringify({ language: "ja", text: (await spokenReply.json()).reply }) });
  assert.equal(speech.status, 200); assert.ok((await speech.arrayBuffer()).byteLength > 100); assert.equal(audioCalls, 2);
  console.log(`PASS: Next.js -> ${externalFile ? "real Dify -> real LiteLLM -> mock model" : "mock Dify"}; 3 languages, continuation, new conversation, user/course isolation, consent, tutor/student access, transcript -> chat -> speech.`);
  if (process.argv.includes("--serve")) {
    console.log(`SMOKE_ONLY_URL=${origin}/conversation?language=ja&lesson=cafe (synthetic owner PIN 864209)`);
    await new Promise(() => {});
  }
} finally { await cleanup(); }
