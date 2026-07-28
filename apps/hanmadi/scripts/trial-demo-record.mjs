/**
 * /trial 데모 녹화 — 모바일 뷰포트로 실제 인터랙션을 수행하며 영상을 남기고,
 * 각 소리 이벤트(발음 재생 순간)의 타임스탬프를 JSON으로 기록한다.
 * 오디오는 녹화에 안 담기므로 후반에 ffmpeg로 같은 TTS mp3를 해당 시점에 믹스한다.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = "https://hanmadi-lake.vercel.app";
const OUT = "./video";

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  recordVideo: { dir: OUT, size: { width: 780, height: 1688 } },
  colorScheme: "dark",
});
const page = await ctx.newPage();

const t0 = Date.now();
const events = [];
const mark = (name) => events.push({ name, tMs: Date.now() - t0 });
const pause = (ms) => page.waitForTimeout(ms);

await page.goto(`${BASE}/trial`, { waitUntil: "networkidle" });
await pause(1200);

// 1) 인트로 카드 탭 → 카드 플립 + "안녕하세요"
mark("annyeonghaseyo");
await page.locator("main button", { hasText: "안녕하세요" }).first().click();
await pause(2300);

const next = page.getByRole("button", { name: "Next →" });
await next.click(); // → goals
await pause(900);

// 2) 목표 선택: K-Drama
await page.locator("main button", { hasText: "K-Drama" }).first().click();
await pause(1400);
await next.click(); // → moods
await pause(900);

// 3) 기분 표현: 좋아요 (탭 시 발음)
mark("joayo");
await page.locator("main button", { hasText: "좋아요" }).first().click();
await pause(2300);
await next.click(); // → jamo mixer
await pause(1000);

// 4) 자모 조합기: ㄴ + ㅜ = 누
await page.locator("main button", { hasText: "ㄴ" }).first().click();
await pause(500);
await page.locator("main button", { hasText: "ㅜ" }).first().click();
await pause(700);
mark("nu");
await page.getByRole("button", { name: "Hear the letter" }).click();
await pause(1800);

// 5) ㅅ + ㅏ = 사
await page.locator("main button", { hasText: "ㅅ" }).first().click();
await pause(500);
await page.locator("main button", { hasText: "ㅏ" }).first().click();
await pause(700);
mark("sa");
await page.getByRole("button", { name: "Hear the letter" }).click();
await pause(2200);

mark("end");
await ctx.close(); // 비디오 저장 확정
const video = await page.video().path();
await browser.close();

writeFileSync("./events.json", JSON.stringify({ video, events }, null, 2));
console.log(JSON.stringify({ video, events }, null, 2));
