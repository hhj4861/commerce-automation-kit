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
const dataFile = resolve(dir, "navigation-fixture.json");
await writeFile(dataFile, "{}", { flag: "wx" });
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const port = probe.address().port; await new Promise(r => probe.close(r));
const base = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, NODE_ENV: "development", HANMADI_LOCAL_DATA_FILE: dataFile,
    AUTH_SECRET: "navigation-fixture-more-than-32-characters", TUTOR_PINS: "", HANMADI_DEPLOYMENT: "learner",
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
  const post = async (body, path = "/api/study") => {
    const response = await context.request.post(base + path, { headers: { Origin: base }, data: body });
    assert(response.ok(), await response.text());
  };
  await page.goto(base + "/study");
  await page.getByRole("heading", { name: "한마디 시작하기", exact: true }).waitFor();
  assert.equal(await page.getByRole("navigation", { name: "주요 메뉴", exact: true }).count(), 0);
  await post({ action: "signup", name: "navigation" + Date.now(), password: "fixture-password-123" }, "/api/study/account");
  await post({ action: "assess", language: "ja", answers: [0, 0, 0], confidence: 1, minutes: 5 });
  await page.reload();
  const nav = page.getByRole("navigation", { name: "주요 메뉴", exact: true });
  await nav.waitFor();
  const sizes = [[320, 568], [390, 844], [768, 500], [844, 390], [1024, 768], [1440, 1000]];
  const checks = [];
  async function layout(label, width, height) {
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label + " document overflow");
    assert(await page.locator(".hm-main").evaluate(el => el.scrollWidth <= el.clientWidth + 1), label + " content overflow");
    const header = await page.locator(".hm-header, .hm-subheader").boundingBox();
    const main = await page.locator(".hm-main").boundingBox();
    const bounds = await nav.boundingBox();
    assert(header.y + header.height <= main.y + 1, label + " header overlap");
    assert(bounds.y + bounds.height <= height + 1, label + " navigation visibility");
    assert(width >= 1000 ? bounds.x + bounds.width <= main.x + 1 : main.y + main.height <= bounds.y + 1, label + " navigation overlap");
    for (const button of await nav.getByRole("button").all()) {
      const box = await button.boundingBox(); assert(box.width >= 44 && box.height >= 44, label + " touch target");
    }
    checks.push(`${label} ${width}x${height}`);
  }
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    for (const label of ["스터디", "AI 대화", "번역", "보관함"]) {
      const button = nav.getByRole("button", { name: label, exact: true });
      await button.click(); assert.equal(await button.getAttribute("aria-current"), "page");
      await layout(label, width, height);
      if (label === "스터디") {
        for (const mode of ["회화", "단어", "음악"]) {
          await page.getByRole("navigation", { name: "학습 방식", exact: true }).getByRole("button", { name: mode, exact: true }).click();
          await layout(mode, width, height);
          if (mode === "회화") for (const filter of ["레벨별", "상황별", "오늘 추천"]) {
            await page.getByRole("button", { name: filter, exact: true }).click(); await layout(filter, width, height);
          }
          if ([390, 1440].includes(width)) await page.screenshot({ path: resolve(dir, `${mode}-${width}.png`) });
        }
        await page.getByRole("button", { name: "회화", exact: true }).click();
      }
      if (label === "보관함") {
        const library = page.getByRole("navigation", { name: "보관함 보기", exact: true });
        for (const shelf of ["내 표현", "단어장"]) {
          await library.getByRole("button", { name: shelf, exact: true }).click();
          assert.equal(await library.getByRole("button", { name: shelf, exact: true }).getAttribute("aria-pressed"), "true");
          assert.equal(await button.getAttribute("aria-current"), "page"); await layout(shelf, width, height);
        }
        // Clicking the current library entry preserves the selected shelf.
        await button.click(); assert.equal(await library.getByRole("button", { name: "단어장", exact: true }).getAttribute("aria-pressed"), "true");
      }
      if ([390, 1440].includes(width) && label !== "스터디") await page.screenshot({ path: resolve(dir, `${label}-${width}.png`) });
    }
    await page.getByRole("button", { name: "설정", exact: true }).click();
    await page.getByRole("heading", { name: "학습 설정", exact: true }).waitFor(); await layout("설정", width, height);
    await page.getByRole("button", { name: "AI 설정 보기", exact: true }).click();
    await page.getByRole("heading", { name: "AI 대화 설정", exact: true }).waitFor(); await layout("AI 설정", width, height);
    await page.keyboard.press("Escape");
    await page.getByRole("heading", { name: "학습 설정", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await nav.getByRole("button", { name: "스터디", exact: true }).focus(); await page.keyboard.press("Enter");
    await page.getByRole("navigation", { name: "학습 방식", exact: true }).waitFor();
    assert.equal(await nav.getByRole("button").count(), 4);
    console.log(`PASS all navigation ${width}x${height}`);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert(await nav.getByRole("button").first().evaluate(el => getComputedStyle(el).transitionDuration === "0s"));
  assert.deepEqual(errors, []);
  await writeFile(resolve(dir, "result.json"), JSON.stringify({ passed: true, checks, browserErrors: errors, reducedMotion: true, keyboardNavigation: true }, null, 2));
} finally {
  await browser?.close(); app.kill("SIGTERM"); await exited;
  await writeFile(resolve(dir, "server.log"), logs);
  await unlink(dataFile).catch(() => {});
}
