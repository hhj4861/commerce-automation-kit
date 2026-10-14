import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { wordPacks } from "../lib/word-study.ts";

const dir = process.env.HANMADI_E2E_ARTIFACTS;
assert(dir, "Set HANMADI_E2E_ARTIFACTS to an isolated artifact directory");
await mkdir(dir, { recursive: true });
const dataFile = resolve(dir, "word-study-fixture.json");
await writeFile(dataFile, "{}", { flag: "wx" });
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const port = probe.address().port; await new Promise(r => probe.close(r));
const base = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, NODE_ENV: "development", HANMADI_LOCAL_DATA_FILE: dataFile,
    AUTH_SECRET: "word-study-fixture-more-than-32-characters", TUTOR_PINS: "", HANMADI_DEPLOYMENT: "learner",
    UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", KV_REST_API_URL: "", KV_REST_API_TOKEN: "",
    LITELLM_BASE_URL: "", LITELLM_API_KEY: "", LITELLM_MODEL: "", LITELLM_TTS_MODEL: "", ELEVENLABS_API_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
const exited = once(app, "exit");
let logs = "", browser;
app.stdout.on("data", b => { logs += b; }); app.stderr.on("data", b => { logs += b; });
try {
  let ready = false;
  for (let i = 0; i < 90; i++) {
    if (app.exitCode !== null) break;
    try { if ((await fetch(base + "/study", { signal: AbortSignal.timeout(3000) })).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  assert(ready, "Local server must start");
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await context.addInitScript(() => {
    localStorage.setItem("hanmadi:v2:language", "ja");
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style"); style.textContent = "nextjs-portal{display:none!important}"; document.head.append(style);
    }, { once: true });
  });
  const page = await context.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route("**/api/study/audio", r => r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"테스트 음성은 재생하지 않아요."}' }));
  const dialog = page.locator("dialog[open]");
  const study = page.getByRole("region", { name: "단어 스터디", exact: true });
  const post = async (body, path = "/api/study", ctx = context) => {
    const response = await ctx.request.post(base + path, { headers: { Origin: base }, data: body });
    assert(response.ok(), await response.text()); return response.json();
  };
  const state = async () => (await (await context.request.get(base + "/api/study")).json()).state;
  const openWords = async () => { await page.getByRole("button", { name: "단어", exact: true }).click(); await study.waitFor(); };
  await page.goto(base + "/study");
  await page.getByRole("heading", { name: "한마디 시작하기", exact: true }).waitFor();
  assert.equal(await study.count(), 0, "study retains the existing login gate");
  console.log("PASS existing login gate");
  await post({ action: "signup", name: "words" + Date.now(), password: "fixture-password-123" }, "/api/study/account");
  for (const language of ["ja", "en", "th", "es"]) await post({ action: "assess", language, answers: [0, 0, 0], confidence: 1, minutes: 5 });
  await post({ action: "settings", language: "ja", autoSave: true });
  await page.reload(); await openWords();
  console.log("PASS learner entry");
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await page.locator(".hm-main").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert((await study.locator(".hm-word-start h2").boundingBox()).height < 100, "hero stays readable in the narrow desktop app frame");
    const modes = page.getByRole("navigation", { name: "학습 방식", exact: true });
    assert.equal(await modes.getByRole("button").count(), 3);
    for (const button of await modes.getByRole("button").all()) { const box = await button.boundingBox(); assert(box.width >= 44 && box.height >= 44); }
    await page.screenshot({ path: resolve(dir, `word-study-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  let failSave = true, failReview = true, saveCalls = 0, reviewCalls = 0;
  await page.route("**/api/study", route => {
    const body = route.request().postDataJSON();
    if (body?.action === "save-word") { saveCalls++; if (failSave) { failSave = false; return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"단어 저장 테스트 실패. 다시 눌러 주세요."}' }); } }
    if (body?.action === "practice") { reviewCalls++; if (failReview) { failReview = false; return route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"복습 저장 테스트 실패"}' }); } }
    return route.continue();
  });
  const pack = wordPacks("ja")[0];
  await study.getByRole("button", { name: "단어 5개 시작하기", exact: true }).click();
  for (let i = 0; i < pack.words.length; i++) {
    const word = pack.words[i];
    await dialog.getByRole("heading", { name: word.text, exact: true }).waitFor();
    assert.equal(await dialog.getByText(word.meaning, { exact: true }).count(), 0, "meaning is hidden until requested");
    await dialog.getByRole("button", { name: "뜻 확인하기", exact: true }).click();
    await dialog.getByText(word.example.text, { exact: true }).waitFor();
    assert(await dialog.locator(".hm-word-reveal > strong").evaluate(el => document.activeElement === el), "keyboard focus follows the revealed meaning");
    if (i === 0) {
      assert.equal((await state()).expressions.length, 0, "browsing does not auto-save");
      await dialog.getByRole("button", { name: "단어장에 저장", exact: true }).click();
      await dialog.getByText("단어 저장 테스트 실패. 다시 눌러 주세요.", { exact: true }).waitFor();
      assert.equal((await state()).expressions.length, 0);
      await dialog.getByRole("button", { name: "단어장에 저장", exact: true }).click();
      await dialog.getByRole("button", { name: "단어장에 저장됨", exact: true }).waitFor();
      assert.equal((await state()).expressions.length, 1);
      await dialog.getByRole("button", { name: "단어 듣기", exact: true }).click();
      await dialog.getByRole("alert").waitFor();
      for (const width of [320, 390, 1024]) {
        await page.setViewportSize({ width, height: 844 });
        assert(await dialog.locator(".hm-dialog-body").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
        await page.screenshot({ path: resolve(dir, `word-card-${width}.png`) });
      }
    }
    await dialog.getByRole("button", { name: i === 4 ? "뜻 퀴즈 시작" : "다음 단어", exact: true }).click();
  }
  for (let i = 0; i < pack.words.length; i++) {
    const word = pack.words[i];
    await dialog.getByRole("heading", { name: word.text, exact: true }).waitFor();
    const choices = dialog.getByRole("group", { name: "뜻 선택", exact: true });
    if (i === 0) {
      await choices.getByRole("button", { name: "물", exact: true }).click();
      await dialog.getByText("복습 저장 테스트 실패", { exact: true }).waitFor();
      assert(await dialog.getByRole("button", { name: "다음 문제", exact: true }).isDisabled());
      await dialog.getByRole("button", { name: "복습 기록 다시 저장", exact: true }).click();
      await dialog.getByText("단어장에 기록했어요. 내일 다시 복습해요.", { exact: true }).waitFor();
      assert.equal((await state()).expressions[0].confidence, "help");
      await page.screenshot({ path: resolve(dir, "word-quiz-feedback.png") });
    } else await choices.getByRole("button", { name: word.meaning, exact: true }).click();
    await dialog.getByRole("button", { name: i === 4 ? "학습 결과 보기" : "다음 문제", exact: true }).click();
  }
  await dialog.getByRole("heading", { name: "단어 5개를 연습했어요.", exact: true }).waitFor();
  await dialog.getByText("4개 정답", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(dir, "word-study-result.png") });
  await dialog.getByRole("button", { name: "헷갈린 1개 다시 익히기", exact: true }).click();
  await dialog.getByRole("button", { name: "뜻 확인하기", exact: true }).click();
  await dialog.getByRole("button", { name: "뜻 퀴즈 시작", exact: true }).click();
  await dialog.getByRole("group", { name: "뜻 선택" }).getByRole("button", { name: "커피", exact: true }).click();
  await dialog.getByText("단어장에 기록했어요. 3일 뒤 다시 복습해요.", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "학습 결과 보기", exact: true }).click();
  await dialog.getByRole("button", { name: "내 단어장 열기", exact: true }).click();
  await page.getByRole("article", { name: "コーヒー", exact: true }).waitFor();
  assert.equal((await state()).expressions.length, 1);
  assert.equal((await state()).expressions[0].confidence, "alone");
  assert.equal(saveCalls, 2); assert.equal(reviewCalls, 3);
  await page.reload(); await openWords();
  await study.getByRole("button", { name: "저장한 단어 연습", exact: true }).click();
  await dialog.getByRole("heading", { name: "コーヒー", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  assert(await study.getByRole("button", { name: "저장한 단어 연습", exact: true }).evaluate(el => el === document.activeElement));
  for (const language of ["en", "th", "es"]) {
    await page.getByLabel("학습 언어", { exact: true }).selectOption(language); await openWords();
    assert.equal(await study.getByRole("button", { name: "저장한 단어 연습", exact: true }).count(), 0);
    await study.getByRole("button", { name: /낯선 길을 찾을 때/ }).click();
    const lesson = wordPacks(language)[1];
    for (let i = 0; i < 5; i++) {
      await dialog.getByRole("heading", { name: lesson.words[i].text, exact: true }).waitFor();
      await dialog.getByRole("button", { name: "뜻 확인하기", exact: true }).click();
      await dialog.getByRole("button", { name: i === 4 ? "뜻 퀴즈 시작" : "다음 단어", exact: true }).click();
    }
    for (let i = 0; i < 5; i++) {
      if (language === "en" && i === 0) await dialog.getByRole("button", { name: "아직 모르겠어요", exact: true }).click();
      else await dialog.getByRole("group", { name: "뜻 선택" }).getByRole("button", { name: lesson.words[i].meaning, exact: true }).click();
      await dialog.getByRole("button", { name: i === 4 ? "학습 결과 보기" : "다음 문제", exact: true }).click();
    }
    await dialog.getByText(language === "en" ? "4개 정답" : "5개 정답", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "회화", exact: true }).click();
  await page.getByRole("button", { name: "오늘 연습 시작", exact: true }).click();
  await dialog.getByText("문장 1 / 10", { exact: true }).waitFor(); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "음악", exact: true }).click();
  await page.getByRole("region", { name: "스페인어 음악 학습", exact: true }).waitFor();
  await page.getByRole("region", { name: "연습곡 듣기", exact: true }).waitFor();
  const other = await browser.newContext();
  await post({ action: "signup", name: "otherwords" + Date.now(), password: "fixture-password-123" }, "/api/study/account", other);
  assert.equal((await (await other.request.get(base + "/api/study")).json()).state.expressions.length, 0);
  await other.close(); assert.deepEqual(errors, []);
  await writeFile(resolve(dir, "result.json"), JSON.stringify({ passed: true, languages: ["ja", "en", "th", "es"], widths: [320, 390, 1024], saveCalls, reviewCalls,
    checks: ["login gate", "explicit save", "save retry", "review retry", "wrong answers retry", "saved review after reload", "language and user isolation", "conversation and music entry", "focus return", "audio error", "unknown answer"] }, null, 2));
  console.log("PASS word study: 4 languages, learning/quiz/retry, saved reviews, isolation, responsive layout and existing entries");
} finally {
  await browser?.close(); app.kill("SIGTERM"); await exited;
  await writeFile(resolve(dir, "server.log"), logs);
  await unlink(dataFile).catch(() => {});
}
