/**
 * Part 3 — 학생 포털 데모 (필러4 "매 수업 개인 노트" 차별점).
 * /s/emma(시드 샘플 학생, 가상 인물) 흐름: 포털 홈 → 수업 상세(배운 표현·교정 발음 탭)
 * → 복습 퍼즐 2판 풀기. 소리 이벤트는 {name:"sound", text} 로 기록해 후반에서 믹스.
 */
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = "https://hanmadi-lake.vercel.app";

// 퍼즐 정답 후보 — Emma 시드의 표현/교정 문장 (칩 멀티셋 매칭으로 어느 퍼즐인지 판별)
const CANDIDATES = [
  "저는 엠마예요",
  "미국에서 왔어요",
  "만나서 반가워요",
  "저는 엠마예요. 미국에서 왔어요.",
  "아이스 아메리카노 한 잔 주세요",
  "얼마예요?",
  "포장이요",
  "커피 한 잔 주세요.",
  "감사합니다",
];
const tokensOf = (ko) => ko.replaceAll(/[.?!]/g, "").split(/\s+/).filter(Boolean);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  recordVideo: { dir: "./video3", size: { width: 390, height: 844 } },
  colorScheme: "dark",
});
const page = await ctx.newPage();

const t0 = Date.now();
const events = [];
const mark = (name, text) => events.push({ name, text: text ?? null, tMs: Date.now() - t0 });
const pause = (ms) => page.waitForTimeout(ms);

await page.goto(`${BASE}/s/emma`, { waitUntil: "networkidle" });
await pause(500);
mark("start");
await pause(1800); // 포털 홈: Hi Emma + 요약 칩

// 수업 2(카페) 상세로
await page.locator('a[href="/s/emma/l2"]').first().click();
await pause(1900);

// 배운 표현 — 발음 탭
mark("sound", "아이스 아메리카노 한 잔 주세요");
await page.getByRole("button", { name: "Play pronunciation: 아이스 아메리카노 한 잔 주세요" }).first().click();
await pause(3400);

// 교정 섹션으로 스크롤 → ✓ 문장 발음 탭
await page.getByText("What we fixed").scrollIntoViewIfNeeded();
await pause(900);
mark("sound", "커피 한 잔 주세요.");
await page.getByRole("button", { name: /Play pronunciation: 커피 한 잔 주세요/ }).first().click();
await pause(2700);

// 포털 홈으로 복귀 → 복습 시작
await page.getByRole("link", { name: /All lessons/ }).click();
await pause(1400);
const startReview = page.getByRole("button", { name: /Start review|Play them all again|복습 시작/ });
await startReview.scrollIntoViewIfNeeded();
await pause(700);
await startReview.click();
await pause(1400);

// 퍼즐 2판 — 칩 멀티셋으로 정답 문장 판별 후 순서대로 조립
for (let round = 0; round < 2; round++) {
  const chipTexts = await page
    .locator('main button[lang="ko"]')
    .evaluateAll((els) =>
      els
        .filter((e) => e.className.includes("rounded-full") && e.textContent.trim().length > 0)
        .map((e) => e.textContent.trim()),
    );
  // 칩은 문장부호를 유지("주세요.")하므로 비교는 정규화, 탭은 칩 원문으로
  const norm = (s) => s.replaceAll(/[.?!]/g, "");
  const answer = CANDIDATES.find((c) => {
    const t = tokensOf(c);
    return (
      t.length === chipTexts.length &&
      [...t].sort().join("|") === chipTexts.map(norm).sort().join("|")
    );
  });
  if (!answer) throw new Error(`퍼즐 칩 매칭 실패: ${JSON.stringify(chipTexts)}`);

  const remaining = [...chipTexts];
  for (const w of tokensOf(answer)) {
    const idx = remaining.findIndex((c) => norm(c) === w);
    const chipText = remaining.splice(idx, 1)[0];
    await page.getByRole("button", { name: chipText, exact: true }).first().click();
    await pause(430);
  }
  mark("sound", answer);
  await page.getByRole("button", { name: /Check ✓/ }).click();
  await pause(2900); // 🎉 정답 패널 + 발음

  const next = page.getByRole("button", { name: /Next puzzle|Finish/ });
  const label = await next.first().textContent();
  await next.first().click();
  if (/Finish/.test(label ?? "")) break;
  await pause(1100);
}

await pause(2600); // 마무리(스트릭/완료) 홀드
mark("end");

await ctx.close();
const video = await page.video().path();
await browser.close();
writeFileSync("./events3.json", JSON.stringify({ video, events }, null, 2));
console.log(JSON.stringify({ video, events }, null, 2));
