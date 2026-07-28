/**
 * /trial 데모 Part 2 — 스텝 5~10 (글자 퍼즐 → 표현 카드 → 드릴 → 문장 퍼즐 → 요약 → 포털 미리보기).
 * 스텝 1~4는 빠르게 통과(speedrun)하고, mark("start")부터를 최종 영상으로 트림한다.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = "https://hanmadi-lake.vercel.app";
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  recordVideo: { dir: "./video2", size: { width: 390, height: 844 } },
  colorScheme: "dark",
});
const page = await ctx.newPage();

const t0 = Date.now();
const events = [];
const mark = (name) => events.push({ name, tMs: Date.now() - t0 });
const pause = (ms) => page.waitForTimeout(ms);
const inMain = (sel, opts) => page.locator("main button", opts ?? undefined);
const btn = (name, exact = false) => page.getByRole("button", { name, exact });

await page.goto(`${BASE}/trial`, { waitUntil: "networkidle" });
await pause(800);

/* ── speedrun: 스텝 0~3 ── */
await page.locator("main button", { hasText: "안녕하세요" }).first().click();
await pause(400);
const footNext = page.locator("footer").getByRole("button", { name: "Next →" });
await footNext.click(); await pause(350); // goals
await page.locator("main button", { hasText: "K-Drama" }).first().click();
await pause(350);
await footNext.click(); await pause(350); // moods
await page.locator("main button", { hasText: "좋아요" }).first().click();
await pause(400);
await footNext.click(); await pause(350); // mixer (not gated)
await footNext.click(); await pause(900); // → step 4 자모 퍼즐

/* ── 여기부터 본편 ── */
mark("start");
await pause(600);

// 글자 퍼즐 R1: ㄴ + ㅏ = 나
await page.locator("main button").filter({ hasText: /^ㄴ/ }).first().click();
await pause(650);
mark("na"); // 조합 판정 순간 발음을 입힌다
await page.locator("main button").filter({ hasText: /^ㅏ/ }).first().click();
await pause(2100);
await btn(/Next letter/).click();
await pause(900);

// R2: ㅅ + ㅗ = 소
await page.locator("main button").filter({ hasText: /^ㅅ/ }).first().click();
await pause(650);
mark("so");
await page.locator("main button").filter({ hasText: /^ㅗ/ }).first().click();
await pause(2100);
await btn(/Done · 완성!/).click(); // onComplete → 자동으로 스텝 5
await pause(1100);

// 표현 카드 3장 — 열 때마다 발음
mark("annyeong");
await btn(/^Open Hello/).click();
await pause(1900);
mark("gamsa");
await btn(/^Open Thank you/).click();
await pause(1900);
mark("mannaseo");
await btn(/^Open Nice to meet you/).click();
await pause(2300);
await footNext.click(); // → 드릴
await pause(1000);

// 드릴: 표현 탭(발음) → 드릴 내부 Next 한 번
mark("annyeong2");
await page.getByRole("button", { name: "Play pronunciation: 안녕하세요" }).click();
await pause(2100);
await page.locator("main").getByRole("button", { name: "Next →" }).first().click();
await pause(1300);
await footNext.click(); // → 문장 퍼즐
await pause(1000);

// 문장 퍼즐 R1: 안·녕·하·세·요 순서로 조립 → Check
for (const s of ["안", "녕", "하", "세", "요"]) {
  await btn(s, true).click();
  await pause(420);
}
mark("annyeong3");
await btn(/Check ✓/).click();
await pause(2300);
await btn(/Next sentence/).click();
await pause(900);

// R2: 만나서 + 반가워요 → Check → 완성
await btn("만나서", true).click();
await pause(500);
await btn("반가워요", true).click();
await pause(500);
mark("mannaseo2");
await btn(/Check ✓/).click();
await pause(2400);
await btn(/Done · 완성!/).click(); // → 요약 스텝
await pause(2600); // 잘했어요 요약 감상

await footNext.click(); // → 포털 미리보기
await pause(3400); // "You'll get a page like this" + CTA 홀드

mark("end");
await ctx.close();
const video = await page.video().path();
await browser.close();
writeFileSync("./events2.json", JSON.stringify({ video, events }, null, 2));
console.log(JSON.stringify({ video, events }, null, 2));
