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
const dataFile = resolve(dir, "dialog-fixture.json");
await writeFile(dataFile, "{}", { flag: "wx" });
let fail = false, calls = 0;
const mock = createServer(async (req, res) => {
  for await (const chunk of req) { void chunk; }
  calls++;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ choices: [{ message: { content: fail ? "{}" : JSON.stringify({ meaning: "문맥 속 단어 뜻", reading: "테스트" }) } }] }));
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
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage(); const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.head.append(s); }); });
  // Audio is unrelated to this interaction test; avoid prefetch calling any voice provider.
  await page.route("**/api/study/audio", r => r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"fixture audio disabled"}' }));
  async function post(body, path = "/api/study") {
    const r = await context.request.post(base + path, { headers: { Origin: base }, data: body });
    assert(r.ok(), await r.text()); return r.json();
  }
  const state = async () => (await (await context.request.get(base + "/api/study")).json()).state;
  const guest = await context.request.post(base + "/api/study", { headers: { Origin: base }, data: { action: "lookup-word", language: "ja", text: "韓国", sentence: "韓国から" } });
  assert.equal(guest.status(), 401);
  await post({ action: "signup", name: "wordfixture" + Date.now(), password: "fixture-password-only-123" }, "/api/study/account");
  for (const language of ["ja", "th", "en", "es"]) await post({ action: "assess", language, answers: [0, 0, 0], confidence: 1, minutes: 5 });
  await post({ action: "settings", autoSave: true, language: "ja" });
  await page.goto(base + "/study");
  const dialogs = page.locator("dialog[open]");
  async function openLesson() { await page.getByRole("button", { name: "오늘 연습 시작", exact: true }).click(); await dialogs.first().getByText("문장 1 / 10", { exact: true }).waitFor(); }
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await openLesson();
    const d = dialogs.first(), close = d.getByRole("button", { name: "닫기", exact: true });
    const before = await close.boundingBox();
    const scrolling = await d.locator(".hm-dialog-body").evaluate(el => { el.scrollTop = el.scrollHeight; return { top: el.scrollTop, overflow: el.scrollWidth - el.clientWidth }; });
    const after = await close.boundingBox();
    assert(Math.abs(before.y - after.y) < 1); assert(after.y >= 0 && after.y + after.height <= viewport.height); assert(scrolling.overflow <= 1);
    if (viewport.width === 320 || viewport.height === 390) assert(scrolling.top > 0);
    await page.screenshot({ path: resolve(dir, `close-${viewport.width}.png`) });
    await close.click(); assert.equal(await dialogs.count(), 0);
    await openLesson(); await page.touchscreen.tap(2, 2); assert.equal(await dialogs.count(), 0);
    await openLesson(); await page.keyboard.press("Escape"); assert.equal(await dialogs.count(), 0);
  }
  console.log("PASS fixed header at three sizes, outside tap and Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const language of ["ja", "th", "en", "es"]) {
    await page.getByLabel("학습 언어", { exact: true }).selectOption(language);
    await openLesson(); const d = dialogs.first();
    const token = d.locator(".hm-word").first(); const text = await token.innerText();
    const initial = (await state()).expressions.length;
    await token.tap(); await dialogs.last().getByText("문맥 속 단어 뜻", { exact: true }).waitFor();
    assert.equal(await dialogs.count(), 2);
    assert.equal(await dialogs.last().locator(".hm-native").innerText(), text);
    assert.equal((await state()).expressions.length, initial, "lookup must not auto-save even when translation autoSave is on");
    await dialogs.last().getByRole("button", { name: "내 표현에 추가", exact: true }).click();
    await dialogs.last().getByRole("button", { name: "내 표현에 저장했어요", exact: true }).waitFor();
    assert((await state()).expressions.some(e => e.text === text && e.language === language && e.source === "vocabulary"));
    await page.screenshot({ path: resolve(dir, `word-${language}.png`) });
    await page.keyboard.press("Escape"); assert.equal(await dialogs.count(), 1);
    assert(await token.evaluate(el => document.activeElement === el), "focus returns to selected word");
    // Browser selection API represents the range produced by mobile selection handles.
    await d.locator(".hm-word-sentence").evaluate(el => {
      const range = document.createRange(); range.setStart(el.firstChild.firstChild, 0);
      range.setEnd(el.children[1].firstChild, el.children[1].textContent.length);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(range); document.dispatchEvent(new Event("selectionchange"));
    });
    await d.getByRole("button", { name: "선택한 표현 뜻 보기", exact: true }).click();
    await dialogs.last().getByText("문맥 속 단어 뜻", { exact: true }).waitFor();
    await page.touchscreen.tap(2, 2); assert.equal(await dialogs.count(), 1);
    await d.getByRole("button", { name: "닫기", exact: true }).click();
  }
  console.log("PASS four-language word taps, selected ranges, nested close/focus, explicit persistence");
  await page.getByLabel("학습 언어", { exact: true }).selectOption("ja");
  await openLesson();
  const sentence = dialogs.first().locator(".hm-word-sentence");
  await sentence.scrollIntoViewIfNeeded();
  const first = await sentence.locator(".hm-word").first().boundingBox();
  const last = await sentence.locator(".hm-word").nth(1).boundingBox();
  await page.mouse.move(first.x + 1, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width - 1, last.y + last.height / 2, { steps: 16 });
  await page.mouse.up();
  await dialogs.first().getByRole("button", { name: "선택한 표현 뜻 보기", exact: true }).click();
  await dialogs.last().getByText("문맥 속 단어 뜻", { exact: true }).waitFor();
  assert.equal(await dialogs.count(), 2);
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  console.log("PASS real pointer drag opens selected expression without closing the lesson");
  await openLesson(); fail = true;
  await dialogs.first().locator(".hm-word").first().tap();
  await dialogs.last().getByRole("alert").waitFor();
  fail = false; await dialogs.last().getByRole("button", { name: "다시 시도", exact: true }).click();
  await dialogs.last().getByText("문맥 속 단어 뜻", { exact: true }).waitFor();
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "내 표현", exact: true }).click();
  await page.getByText("단어장에서", { exact: true }).first().waitFor();
  await page.reload(); await page.getByRole("button", { name: "내 표현", exact: true }).click();
  await page.getByText("단어장에서", { exact: true }).first().waitFor();
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.body).overflow), "hidden");
  assert.deepEqual(errors, []);
  await writeFile(resolve(dir, "result.json"), JSON.stringify({ passed: true, provider: "fixture", calls, errors, browsers: "Chrome mobile viewport and touch emulation; not physical iOS" }, null, 2));
  console.log("PASS lookup error/retry and persisted vocabulary after reload");
} finally {
  await browser?.close(); app.kill("SIGTERM"); await exited;
  await new Promise(r => mock.close(r)); await unlink(dataFile);
  await writeFile(resolve(dir, "server.log"), logs);
  console.log("Stopped fixture servers and removed test state");
}
