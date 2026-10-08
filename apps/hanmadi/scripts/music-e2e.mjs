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
// All examples are original fixture sentences, not Pretender lyrics.
const rows = [
  ["青いノートです。", "아오이 노오토데스.", "파란 공책이에요."],
  ["小さな丸を描きます。", "치이사나 마루오 에가키마스.", "작은 동그라미를 그려요."],
  ["窓の近くに置きます。", "마도노 치카쿠니 오키마스.", "창문 가까이에 놓아요."],
  ["ページを開きます。", "페에지오 히라키마스.", "페이지를 펼쳐요."],
  ["新しい言葉を書きます。", "아타라시이 코토바오 카키마스.", "새 단어를 적어요."],
  ["ゆっくり声に出します。", "윳쿠리 코에니 다시마스.", "천천히 소리 내요."],
  ["鉛筆を持ちます。", "엔피츠오 모치마스.", "연필을 들어요."],
  ["次のページを見ます。", "츠기노 페에지오 미마스.", "다음 페이지를 봐요."],
  ["もう一度読みます。", "모오 이치도 요미마스.", "한 번 더 읽어요."],
  ["今日はここまでです。", "쿄오와 코코마데데스.", "오늘은 여기까지예요."],
  ["ノートを閉じます。", "노오토오 토지마스.", "공책을 닫아요."],
  ["青いノートです。", "아오이 노오토데스.", "파란 공책이에요."],
];
let mode = "ready", calls = 0;
const lesson = {
  trackId: "pretender", revision: "fixture-v1", expiresAt: "2030-01-01T00:00:00Z",
  attribution: { label: "Original fixture material — not song lyrics", url: "https://example.com/fixture" },
  rights: { reference: "fixture-only", display: true, translation: true, pronunciation: true, speech: true },
  lines: rows.map(([text, reading, meaning], i) => ({ id: String(i), text, reading, meaning, ...(i === 2 ? {} : { startSeconds: i * 8, endSeconds: i * 8 + 6 }) })),
};
const supplier = createServer((req, res) => {
  calls++;
  assert.equal(req.headers.authorization, "Bearer fixture-secret");
  res.setHeader("Content-Type", "application/json");
  if (mode === "failure") { res.writeHead(503); res.end('{"secret":"upstream private details"}'); return; }
  res.end(JSON.stringify(mode === "expired" ? { ...lesson, expiresAt: "2020-01-01T00:00:00Z" } : lesson));
});
supplier.listen(0, "127.0.0.1"); await once(supplier, "listening");
const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
const port = probe.address().port; await new Promise(r => probe.close(r));
const base = `http://127.0.0.1:${port}`;
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, NODE_ENV: "development", HANMADI_LOCAL_DATA_FILE: dataFile,
    AUTH_SECRET: "lyrics-fixture-secret-more-than-32-characters", TUTOR_PINS: "",
    UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", KV_REST_API_URL: "", KV_REST_API_TOKEN: "",
    LITELLM_BASE_URL: "", LITELLM_API_KEY: "", LITELLM_MODEL: "", AI_ACCOUNTS_URL: "", DIFY_BASE_URL: "", DIFY_API_KEY: "", LITELLM_TTS_MODEL: "", ELEVENLABS_API_KEY: "",
    HANMADI_MUSIC_CATALOG_URL: `http://127.0.0.1:${supplier.address().port}/lesson.json`, HANMADI_MUSIC_CATALOG_TOKEN: "fixture-secret", HANMADI_MUSIC_LICENSE_APPROVED: "true" },
  stdio: ["ignore", "pipe", "pipe"],
});
const exited = once(app, "exit");
let logs = "", browser;
app.stdout.on("data", b => { logs += b; }); app.stderr.on("data", b => { logs += b; });
try {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(base + "/study")).ok) break; } catch {} await new Promise(r => setTimeout(r, 500)); }
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage(); const errors = [], audioRequests = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.addInitScript(() => { document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "nextjs-portal{display:none!important}"; document.head.append(s); }); });
  await page.route("**/api/study/audio", r => {
    audioRequests.push(r.request().postDataJSON());
    return r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"음성 테스트 응답"}' });
  });
  let videoRequests = 0;
  await page.route("https://www.youtube-nocookie.com/**", r => {
    videoRequests++; return r.fulfill({ contentType: "text/html", body: "<title>Official video fixture</title>" });
  });
  async function post(body, path = "/api/study") {
    const r = await context.request.post(base + path, { headers: { Origin: base }, data: body });
    assert(r.ok(), await r.text()); return r.json();
  }
  const music = () => context.request.get(base + "/api/study/music");
  assert.equal((await music()).status(), 401); assert.equal(calls, 0);
  await post({ action: "signup", name: "lyricsfixture" + Date.now(), password: "fixture-password-only-123" }, "/api/study/account");
  await post({ action: "assess", language: "ja", answers: [0, 0, 0], confidence: 1, minutes: 5 });
  let pending = true;
  await page.route("**/api/study/music", r => {
    if (r.request().method() === "GET" && pending) return r.fulfill({ contentType: "application/json", body: '{"status":"unavailable","reason":"not-configured"}' });
    return r.continue();
  });
  await page.goto(base + "/study");
  await page.getByRole("button", { name: "음악", exact: true }).click();
  await page.getByRole("heading", { name: "가사 학습 준비 중", exact: true }).waitFor();
  assert.equal(await page.locator(".hm-music-unit").count(), 0);
  assert.equal(videoRequests, 0);
  await page.getByRole("button", { name: "앱에서 영상 열기", exact: true }).click();
  await page.locator('iframe[title="Pretender 공식 뮤직비디오"]').waitFor();
  assert.match(await page.locator("iframe").getAttribute("src"), /cc_load_policy=1/);
  await page.screenshot({ path: resolve(dir, "music-pending.png") });
  pending = false; await page.getByRole("button", { name: "다시 확인", exact: true }).click();
  await page.getByText("가사 1 / 12", { exact: true }).waitFor();
  assert.equal(await page.locator("iframe").count(), 0, "full song unmounts before pronunciation practice");
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    assert(await page.locator(".hm-music").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.locator(".hm-music").scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(dir, `lyrics-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.getByRole("button", { name: "이전", exact: true }).isDisabled());
  await page.getByRole("button", { name: "뜻 가리기", exact: true }).click();
  assert.equal(await page.locator(".hm-lyrics-meaning").count(), 0);
  await page.getByRole("button", { name: "뜻 보기", exact: true }).click();
  await page.getByRole("button", { name: "원곡에서 이 구간 듣기", exact: true }).click();
  let frame = page.locator('iframe[title="현재 가사 원곡 구간"]');
  await frame.waitFor(); assert.match(await frame.getAttribute("src"), /start=0&end=6/);
  const beforeRepeat = videoRequests;
  await page.getByRole("button", { name: "이 구간 다시 듣기", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('iframe[title="현재 가사 원곡 구간"]'));
  await page.getByRole("button", { name: "발음 듣기", exact: true }).click();
  await page.getByText("음성 테스트 응답", { exact: true }).waitFor();
  assert.equal(await page.locator("iframe").count(), 0);
  assert(audioRequests.some(r => r.language === "ja" && r.text === rows[0][0]));
  assert(videoRequests >= beforeRepeat);
  let failSave = true;
  await page.route("**/api/study/music", r => {
    if (r.request().method() === "POST" && failSave) {
      failSave = false; return r.fulfill({ status: 503, contentType: "application/json", body: '{"error":"저장 재시도 테스트"}' });
    } return r.fallback();
  });
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByText("저장 재시도 테스트", { exact: true }).waitFor();
  assert.equal((await (await music()).json()).progress, undefined);
  for (let i = 1; i < 12; i++) {
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.getByText(`가사 ${i + 1} / 12`, { exact: true }).waitFor();
    assert.equal(await page.locator(".hm-lyrics-original").textContent(), rows[i][0]);
    assert.equal(await page.locator(".hm-lyrics-reading").textContent(), rows[i][1]);
    assert.equal(await page.locator(".hm-lyrics-meaning").textContent(), rows[i][2]);
    if (i === 2) assert.equal(await page.getByRole("button", { name: "원곡에서 이 구간 듣기", exact: true }).count(), 0);
  }
  await page.reload(); await page.getByRole("button", { name: "음악", exact: true }).click();
  await page.getByText("가사 12 / 12", { exact: true }).waitFor();
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await page.getByText("가사 11 / 12", { exact: true }).waitFor();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "처음부터 다시", exact: true }).click();
  await page.getByText("가사 1 / 12", { exact: true }).waitFor();
  const state = (await (await context.request.get(base + "/api/study")).json()).state;
  assert.equal(state.expressions.length, 0); assert.deepEqual(state.profiles.ja.completedLessons ?? {}, {});
  assert(!JSON.stringify(state).includes(rows[0][0]), "lyrics are not saved in account state");
  assert.equal((await context.request.post(base + "/api/study/music", { data: { revision: lesson.revision, index: 0 } })).status(), 403);
  for (const [index, revision, status] of [[200, lesson.revision, 400], [12, lesson.revision, 409], [0, "old", 409]]) {
    assert.equal((await context.request.post(base + "/api/study/music", { headers: { Origin: base }, data: { index, revision } })).status(), status);
  }
  const other = await browser.newContext();
  await other.request.post(base + "/api/study/account", { headers: { Origin: base }, data: { action: "signup", name: "lyricsother" + Date.now(), password: "fixture-password-only-123" } });
  assert.equal((await (await other.request.get(base + "/api/study/music")).json()).progress, undefined);
  await other.close();
  for (const failure of ["failure", "expired"]) {
    mode = failure;
    const raw = await music(); const result = await raw.json();
    assert.equal(result.status, "unavailable"); assert(!JSON.stringify(result).includes("upstream private details"));
    await page.reload(); await page.getByRole("button", { name: "음악", exact: true }).click();
    await page.getByRole("heading", { name: "지금은 가사를 불러올 수 없어요", exact: true }).waitFor();
    assert.equal(await page.locator(".hm-lyrics-original").count(), 0);
  }
  mode = "ready"; lesson.revision = "fixture-v2";
  await page.getByRole("button", { name: "다시 확인", exact: true }).click();
  await page.getByText("가사 1 / 12", { exact: true }).waitFor();
  await post({ action: "assess", language: "es", answers: [0, 0, 0], confidence: 1, minutes: 5 });
  await page.getByLabel("학습 언어", { exact: true }).selectOption("es");
  assert.equal(await page.getByRole("button", { name: "음악", exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  await writeFile(resolve(dir, "result.json"), JSON.stringify({ passed: true, supplier: "Hanmadi-contract fixture, no commercial provider connected", lines: 12, calls, videoRequests, audioRequests: audioRequests.length, errors, verified: ["pending UI", "no emotional lessons", "12 ordered lines including repeat", "Korean pronunciation/meaning", "manual segment replay", "speech unmounts video", "cursor persistence and account isolation", "no lyric persistence", "failed save/retry", "auth/origin/index/revision guards", "provider errors/expiry", "no overflow at 320/390/1024"] }, null, 2));
  console.log("PASS licensed lyrics fixture journey, 12 lines, progress, playback controls and errors");
} finally {
  await browser?.close(); app.kill("SIGTERM"); await exited;
  await new Promise(r => supplier.close(r)); await unlink(dataFile);
  await writeFile(resolve(dir, "server.log"), logs);
  console.log("Stopped fixture servers and removed account fixture state");
}
