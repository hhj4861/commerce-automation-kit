import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
const dir = process.env.HANMADI_E2E_ARTIFACTS;
assert(dir, "Set HANMADI_E2E_ARTIFACTS to an isolated artifact directory");
await mkdir(dir, { recursive: true });
const dataFile = resolve(dir, "music-fixture.json");
await writeFile(dataFile, "{}", { flag: "wx" });
let calls = 0;
const mock = createServer(async (req, res) => {
  for await (const chunk of req) { void chunk; }
  calls++;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ meaning: "문맥 속 단어 뜻", reading: "테스트" }) } }] }));
});
mock.listen(0, "127.0.0.1"); await once(mock, "listening");
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const port = probe.address().port; await new Promise(r => probe.close(r));
const base = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, NODE_ENV: "development", HANMADI_LOCAL_DATA_FILE: dataFile,
    AUTH_SECRET: "dialog-fixture-secret-more-than-32-characters", TUTOR_PINS: "",
    UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", KV_REST_API_URL: "", KV_REST_API_TOKEN: "",
    LITELLM_BASE_URL: `http://127.0.0.1:${mock.address().port}/v1`, LITELLM_API_KEY: "fixture", LITELLM_MODEL: "fixture",
    AI_ACCOUNTS_URL: "", DIFY_BASE_URL: "", DIFY_API_KEY: "", LITELLM_TTS_MODEL: "", ELEVENLABS_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
const exited = once(app, "exit");
let logs = "", browser;
app.stdout.on("data", b => { logs += b; }); app.stderr.on("data", b => { logs += b; });
try {
  for (let i = 0; i < 90; i++) { try { if ((await fetch(base + "/study")).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage(); const errors = []; const audioRequests = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.head.append(s); }); });
  await page.route("**/api/study/audio", r => {
    audioRequests.push(r.request().postDataJSON());
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"음성 테스트 응답"}' });
  });
  let videoRequests = 0;
  await page.route("https://www.youtube-nocookie.com/**", r => {
    videoRequests++;
    return r.fulfill({ contentType: "text/html", body: "<title>Official video fixture</title>" });
  });
  async function post(body, path = "/api/study") {
    const r = await context.request.post(base + path, { headers: { Origin: base }, data: body });
    assert(r.ok(), await r.text()); return r.json();
  }
  const state = async () => (await (await context.request.get(base + "/api/study")).json()).state;
  const complete = (language, id) => context.request.post(base + "/api/study", { headers: { Origin: base }, data: { action: "completeLesson", language, id } });
  assert.equal((await complete("ja", "music:ja:pretender:1")).status(), 401);
  await post({ action: "signup", name: "musicfixture" + Date.now(), password: "fixture-password-only-123" }, "/api/study/account");
  await post({ action: "assess", language: "ja", answers: [0, 0, 0], confidence: 1, minutes: 5 });
  await page.goto(base + "/study");
  await page.getByRole("button", { name: "음악", exact: true }).click();
  await page.getByRole("heading", { name: "Pretender", exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "YouTube에서 공식 영상 듣기 ↗" }).getAttribute("href"), "https://www.youtube.com/watch?v=TQ8WlA2GXbk");
  assert.equal(videoRequests, 0, "no third-party player before opt-in");
  assert.equal(await page.locator("iframe").count(), 0);
  assert.equal(await page.locator(".hm-music-unit").count(), 4);
  const dialogs = page.locator("dialog[open]");
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await page.locator(".hm-music").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert(await page.locator(".hm-segments").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.screenshot({ path: resolve(dir, `music-overview-${width}.png`) });
    await page.getByRole("button", { name: "앱에서 영상 열기", exact: true }).click();
    const frame = page.locator('iframe[title="Pretender 공식 뮤직비디오"]');
    await frame.waitFor();
    assert.match(await frame.getAttribute("src"), /youtube-nocookie.com\/embed\/TQ8WlA2GXbk/);
    const box = await frame.boundingBox(); assert(box.width >= 200 && box.height >= 200);
    await page.screenshot({ path: resolve(dir, `music-${width}.png`) });
    await page.getByRole("button", { name: "영상 닫기", exact: true }).click();
    assert.equal(await page.locator("iframe").count(), 0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  // Opening a lesson always unmounts the video, so song and speech never overlap.
  await page.getByRole("button", { name: "앱에서 영상 열기", exact: true }).click();
  await page.locator(".hm-music-unit").first().click();
  assert.equal(await page.locator("iframe").count(), 0);
  await dialogs.first().getByText("문장 1 / 10", { exact: true }).waitFor();
  await dialogs.first().getByRole("button", { name: "들어보기", exact: true }).click();
  await dialogs.first().getByText("음성 테스트 응답").waitFor();
  assert(audioRequests.some(r => r.language === "ja" && r.text === "この曲が好きです。"));
  assert(audioRequests.every(r => r.language === "ja"));
  await dialogs.first().getByRole("button", { name: "닫기", exact: true }).click();
  assert.deepEqual((await state()).profiles.ja.completedLessons ?? {}, {}, "closing early does not complete a lesson");
  let failSave = true;
  await page.route("**/api/study", r => {
    const data = r.request().method() === "POST" ? r.request().postDataJSON() : null;
    if (data?.action === "completeLesson" && failSave) {
      failSave = false;
      return r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"저장 재시도 테스트"}' });
    }
    return r.continue();
  });
  const texts = new Set();
  for (let level = 1; level <= 4; level++) {
    await page.locator(".hm-music-unit").nth(level - 1).click();
    const d = dialogs.first();
    assert(await d.getByRole("button", { name: "이전", exact: true }).isDisabled());
    for (let n = 1; n <= 10; n++) {
      await d.getByText(`문장 ${n} / 10`, { exact: true }).waitFor();
      const original = await d.locator(".hm-word-sentence").textContent();
      // Every page presents a different original sentence, with reading and meaning.
      assert(original?.trim()); assert(!texts.has(original)); texts.add(original);
      if (n === 2) {
        await d.getByRole("button", { name: "이전", exact: true }).click();
        await d.getByText("문장 1 / 10", { exact: true }).waitFor();
        await d.getByRole("button", { name: "다음", exact: true }).click();
      }
      if (n < 10) await d.getByRole("button", { name: "다음", exact: true }).click();
    }
    await page.screenshot({ path: resolve(dir, `lesson-level-${level}.png`) });
    await d.getByRole("button", { name: "학습 마치기", exact: true }).click();
    if (level === 1) {
      await d.getByText("저장 재시도 테스트").waitFor();
      assert.equal((await state()).profiles.ja.completedLessons?.["music:ja:pretender:1"], undefined);
      await d.getByRole("button", { name: "학습 마치기", exact: true }).click();
    }
    await d.waitFor({ state: "detached" });
    assert.equal((await state()).profiles.ja.completedLessons[`music:ja:pretender:${level}`].phrases, 10);
  }
  assert.equal(texts.size, 40);
  await page.reload();
  await page.getByRole("button", { name: "음악", exact: true }).click();
  assert.equal(await page.locator(".hm-music-action").filter({ hasText: "학습 완료 · 다시 연습" }).count(), 4);
  assert.equal((await complete("es", "music:ja:pretender:1")).status(), 404);
  assert.equal((await complete("ja", "music:ja:pretender:5")).status(), 404);
  await post({ action: "assess", language: "es", answers: [0, 0, 0], confidence: 1, minutes: 5 });
  await page.getByLabel("학습 언어", { exact: true }).selectOption("es");
  await page.getByRole("button", { name: "오늘 연습 시작", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "음악", exact: true }).count(), 0);
  await page.getByLabel("학습 언어", { exact: true }).selectOption("ja");
  await page.getByRole("button", { name: "오늘 연습 시작", exact: true }).click();
  await dialogs.first().getByText("문장 1 / 10", { exact: true }).waitFor();
  await dialogs.first().getByRole("button", { name: "닫기", exact: true }).click();
  // Music expressions use the same explicit wordbook save flow as ordinary lessons.
  await page.getByRole("button", { name: "음악", exact: true }).click();
  await page.locator(".hm-music-unit").first().click();
  await dialogs.first().locator(".hm-word-sentence button").first().click();
  await dialogs.nth(1).getByText("문맥 속 단어 뜻", { exact: true }).waitFor();
  assert.equal((await state()).expressions.length, 0);
  await dialogs.nth(1).getByRole("button", { name: "단어장에 저장", exact: true }).click();
  await dialogs.nth(1).getByRole("button", { name: "단어장에 저장했어요", exact: true }).waitFor();
  await dialogs.nth(1).getByRole("button", { name: "닫기", exact: true }).click();
  assert.equal((await state()).expressions.filter(e => e.language === "ja").length, 1);
  await dialogs.first().getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "단어장", exact: true }).click();
  assert.equal(await page.locator(".hm-word-card").count(), 1);
  assert.deepEqual(errors, []);
  await writeFile(resolve(dir, "result.json"), JSON.stringify({ passed: true, provider: "fixture", calls, phrases: texts.size, videoRequests, audioRequests: audioRequests.length, errors, browsers: "Chromium responsive viewport; not physical iOS", verified: ["opt-in official video", "stop video before speech", "40 phrases", "four levels persisted", "save failure and retry", "guest/language/id guards", "early close", "wordbook explicit save", "language switching", "ordinary lesson regression"] }, null, 2));
  console.log("PASS music user journeys, 40 sentences, storage, isolation, retry and wordbook");
} finally {
  await browser?.close(); app.kill("SIGTERM"); await exited;
  await new Promise(r => mock.close(r)); await unlink(dataFile);
  await writeFile(resolve(dir, "server.log"), logs);
  console.log("Stopped fixture servers and removed test state");
}
