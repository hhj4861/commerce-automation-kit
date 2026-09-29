import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
const testDataFile = resolve(".data/v2-e2e.json");
await mkdir(resolve(".data"), { recursive: true });
await writeFile(testDataFile, "{}", { flag: "wx" }); // Never overwrite another running test's state.
const phrases = {
  ja: {
    text: "韓国から来ました。",
    meaning: "한국에서 왔어요.",
    reading: "캉코쿠카라 키마시타",
  },
  th: {
    text: "มาจากเกาหลีค่ะ",
    meaning: "한국에서 왔어요.",
    reading: "마 짝 까올리 카",
  },
  en: {
    text: "I am from Korea.",
    meaning: "한국에서 왔어요.",
    reading: "아이 앰 프럼 코리아",
  },
  es: {
    text: "Soy de Corea.",
    meaning: "한국에서 왔어요.",
    reading: "소이 데 코레아",
  },
};
const modelCalls = [];
let audioCalls = 0;
let calls = 0,
  slowStarted;
const connections = new Map();
const mock = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  let b = {};
  try {
    b = JSON.parse(raw);
  } catch {}
  res.setHeader("Content-Type", "application/json");
  if (req.url?.includes("/connections")) {
    const subject = req.headers["x-ai-subject"];
    const list = connections.get(subject) || [];
    if (req.method === "GET")
      return res.end(JSON.stringify({ connections: list }));
    if (req.method === "DELETE") {
      connections.set(subject, []);
      return res.end(JSON.stringify({ ok: true }));
    }
    const c = {
      id: "a".repeat(32),
      provider: b.provider,
      state: "connected",
      models: ["test-model"],
    };
    connections.set(subject, [c]);
    return res.end(JSON.stringify(c));
  }
  if (req.url?.endsWith("/audio/transcriptions")) {
    audioCalls++;
    assert(!raw.includes('name="language"'), "auto STT omits forced language");
    return res.end(JSON.stringify({ text: "한국에서 왔어요" }));
  }
  if (req.url?.endsWith("/audio/speech")) {
    res.setHeader("Content-Type", "audio/mpeg");
    return res.end(Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]));
  }
  calls++;
  modelCalls.push({ model: b.model, subject: req.headers["x-ai-subject"] });
  const system = b.messages?.[0]?.content ?? "",
    input = b.messages?.at(-1)?.content ?? "";
  if (input.includes("SLOW")) {
    slowStarted?.();
    await new Promise((r) => setTimeout(r, 500));
  }
  if (input === "FAIL") {
    res.statusCode = 503;
    return res.end(JSON.stringify({ error: { message: "fixture failure" } }));
  }
  const language =
    system.includes("태국어") || system.includes("learner of th")
      ? "th"
      : system.includes("스페인어") || system.includes("learner of es")
        ? "es"
        : system.includes("영어") || system.includes("learner of en")
          ? "en"
          : "ja";
  let result = phrases[language];
  if (system.includes("travel translator"))
    result = {
      translated: system.includes("Source language is ko")
        ? result.text
        : result.meaning,
      reading: result.reading,
      practice: result,
    };
  if (system.includes("Create 3 to 8"))
    result = {
      units: [
        { ...result, text: result.text + " ", meaning: "추가 수업 표현" },
      ],
    };
  res.end(
    JSON.stringify({
      choices: [
        {
          message: {
            content: input === "INVALID" ? "not JSON" : JSON.stringify(result),
          },
        },
      ],
    }),
  );
});
mock.listen(0, "127.0.0.1");
await once(mock, "listening");
const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const appPort = probe.address().port;
await new Promise((r) => probe.close(r));
const base = `http://127.0.0.1:${appPort}`,
  mockBase = `http://127.0.0.1:${mock.address().port}`;
const app = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(appPort),
  ],
  {
    env: {
      ...process.env,
      NODE_ENV: "development",
      HANMADI_LOCAL_DATA_FILE: testDataFile,
      AUTH_SECRET: "e2e-only-secret-with-at-least-32-characters",
      TUTOR_PINS: "e2e-owner:839271",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      KV_REST_API_URL: "",
      KV_REST_API_TOKEN: "",
      DIFY_BASE_URL: "",
      DIFY_API_KEY: "",
      LITELLM_BASE_URL: mockBase + "/v1",
      LITELLM_API_KEY: "e2e-only",
      LITELLM_MODEL: "gemini-fixture",
      LITELLM_STT_MODEL: "stt-fixture",
      LITELLM_TTS_MODEL: "tts-fixture",
      LITELLM_TTS_VOICE: "fixture",
      AI_ACCOUNTS_URL: mockBase,
      AI_ACCOUNTS_KEY: "e2e-account-key-with-32-characters",
      AI_ACCOUNTS_SUBJECT_SECRET: "e2e-account-subject-32-characters-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
app.stdout.on("data", (b) => (logs = (logs + b).slice(-10000)));
app.stderr.on("data", (b) => (logs = (logs + b).slice(-10000)));
let browser;
const screenshots = resolve("../../docs/hanmadi-v2-e2e");
await mkdir(screenshots, { recursive: true });
try {
  for (let n = 0; n < 90; n++) {
    if (app.exitCode !== null) throw new Error("Next exited: " + logs);
    try {
      if ((await fetch(base + "/study")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
    if (n === 89) throw new Error("Next startup timeout");
  }
  browser = await chromium.launch({
    ...(process.platform === "darwin" ? { channel: "chrome" } : {}),
    headless: true,
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
    ],
  });
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  await context.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal { display:none !important; }";
    document.addEventListener(
      "DOMContentLoaded",
      () => document.head.append(style),
      { once: true },
    );
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function post(body, ctx = context, path = "/api/study") {
    const res = await ctx.request.post(base + path, {
      headers: { Origin: base },
      data: body,
    });
    return { status: res.status(), data: await res.json() };
  }
  async function state(ctx = context) {
    const res = await ctx.request.get(base + "/api/study");
    assert.equal(res.status(), 200);
    return res.json();
  }
  const guest = await post({
    action: "translate",
    language: "ja",
    from: "ko",
    text: "안녕",
  });
  assert.equal(guest.status, 401);
  await page.goto(base);
  await page.getByRole("button", { name: /일본어 日本語/ }).click();
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("button", { name: "처음이에요 · 계정 만들기" }).click();
  const name = `e2e_${Date.now()}`;
  await page.getByLabel("학습자 아이디").fill(name);
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-1234");
  await page
    .getByRole("button", { name: "학습 계정 만들기", exact: true })
    .click();
  await page.getByRole("heading", { name: "쓸 줄 몰라도 괜찮아요." }).waitFor();
  for (const choice of [
    "한국에서 왔어요.",
    "어떤 음료를 추천하세요?",
    "어떻게 가면 되나요?",
  ])
    await page.getByRole("button", { name: choice, exact: true }).click();
  await page.getByRole("button", { name: "내 연습 시작하기 →" }).click();
  await page.getByRole("button", { name: "오늘 연습 시작" }).waitFor();
  assert.equal((await state()).state.profiles.ja.level, 1);
  console.log("PASS learner signup → language → oral-first assessment → study");
  await page.locator(".hm-main").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: resolve(screenshots, "mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "상황별", exact: true }).click();
  await page.getByRole("button", { name: /스몰토크 처음 만난/ }).click();
  assert.equal(await page.locator(".hm-course-card").count(), 4);
  await page.locator(".hm-main").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: resolve(screenshots, "scenarios.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: /레벨별/, exact: true }).click();
  for (let level = 1; level <= 4; level++) {
    await page
      .locator(".hm-levels button")
      .nth(level - 1)
      .click();
    assert.equal(await page.locator(".hm-course-card").count(), 8);
    assert.equal(
      await page
        .locator('.hm-levels [aria-pressed="true"]')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(49, 87, 213)",
    );
  }
  await page.locator(".hm-main").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: resolve(screenshots, "levels.png"),
    fullPage: true,
  });
  console.log("PASS four levels × eight scenarios");
  for (const language of ["en", "th", "es"]) {
    await page.getByLabel("학습 언어", { exact: true }).selectOption(language);
    await page
      .getByRole("heading", { name: "쓸 줄 몰라도 괜찮아요." })
      .waitFor();
    const assessed = await post({
      action: "assess",
      language,
      answers: [0, 1, 2],
      confidence: 2,
      minutes: 10,
    });
    assert.equal(assessed.status, 200);
    await page.reload();
    await page.getByRole("button", { name: "오늘 연습 시작" }).waitFor();
  }
  await page.getByLabel("학습 언어", { exact: true }).selectOption("ja");
  await page.getByRole("button", { name: "번역", exact: true }).click();
  await page.getByLabel("자동 반영", { exact: true }).check();
  await page.getByText("직접 입력하거나 인식한 말 수정하기").click();
  await page.getByLabel("번역할 말").fill("한국에서 왔어요");
  await page.getByRole("button", { name: "번역하기", exact: true }).click();
  await page
    .getByText("내 표현에 반영했어요. 오늘 학습에서 다시 말해 보세요.")
    .waitFor();
  let snapshot = await state();
  assert.equal(
    snapshot.state.expressions.filter((e) => e.language === "ja").length,
    1,
  );
  assert.equal(snapshot.state.expressions[0].practicedAt, undefined);
  await page.locator(".hm-main").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: resolve(screenshots, "translation.png"),
    fullPage: true,
  });
  await post({
    action: "translate",
    language: "ja",
    from: "ko",
    text: "한국에서 왔어요",
  });
  assert.equal((await state()).state.expressions.length, 1);
  const before = calls;
  const ambiguous = await post({
    action: "translate",
    language: "ja",
    from: "auto",
    text: "OK",
  });
  assert.equal(ambiguous.data.needsConfirmation, true);
  assert.equal(calls, before);
  const fail = await post({
    action: "translate",
    language: "ja",
    from: "ko",
    text: "FAIL",
  });
  assert.equal(fail.status, 502);
  assert.equal((await state()).state.expressions.length, 1);
  const invalid = await post({
    action: "translate",
    language: "ja",
    from: "ko",
    text: "INVALID",
  });
  assert.equal(invalid.status, 502);
  const pii = await post({
    action: "translate",
    language: "ja",
    from: "ko",
    text: "email@example.com",
  });
  assert.equal(pii.data.saved, false);
  const fromForeign = await post({
    action: "translate",
    language: "ja",
    from: "auto",
    text: "韓国から来ました",
  });
  assert.equal(fromForeign.data.from, "ja");
  await page.getByRole("button", { name: "말하기 시작", exact: true }).click();
  await page
    .getByRole("button", { name: "녹음 마치기", exact: true })
    .waitFor();
  await new Promise((r) => setTimeout(r, 400)); // Capture real MediaRecorder frames before stopping.
  const audioResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/study/audio") && r.request().method() === "POST",
  );
  const translatedVoice = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/study") &&
      r.request().postDataJSON()?.action === "translate",
  );
  await page.getByRole("button", { name: "녹음 마치기", exact: true }).click();
  assert.equal((await audioResponse).status(), 200);
  assert.equal((await translatedVoice).status(), 200);
  assert.equal(audioCalls, 1);
  const speech = await context.request.post(base + "/api/study/audio", {
    headers: { Origin: base },
    data: { text: phrases.ja.text },
  });
  assert.equal(speech.status(), 200);
  assert.match(speech.headers()["content-type"], /audio/);
  assert((await speech.body()).length > 0);
  console.log(
    "PASS one-microphone browser recording → STT auto language → translation; speech API response",
  );
  let barrier;
  const started = new Promise((r) => {
    slowStarted = r;
  });
  const pending = post({
    action: "translate",
    language: "ja",
    from: "ko",
    text: "SLOW 한국에서 왔어요",
  });
  await started;
  const id = (await state()).state.expressions[0].id;
  barrier = await post({ action: "delete", language: "ja", id });
  assert.equal(barrier.status, 200);
  assert.equal((await pending).data.saved, false);
  assert.equal((await state()).state.expressions.length, 0);
  const startedOff = new Promise((r) => {
    slowStarted = r;
  });
  const pendingOff = post({
    action: "translate",
    language: "ja",
    from: "ko",
    text: "SLOW 한국에서 왔어요",
  });
  await startedOff;
  await post({ action: "settings", autoSave: false });
  assert.equal((await pendingOff).data.saved, false);
  console.log(
    "PASS translate, bidirectional, dedupe, ambiguity, failed/invalid AI, private text, delete/disable in-flight barrier",
  );
  await page.getByRole("button", { name: "AI 대화", exact: true }).click();
  await page.getByRole("button", { name: "AI가 먼저 말하기 →" }).click();
  await page.getByRole("button", { name: "이 표현 연습에 추가" }).waitFor();
  await page
    .getByLabel("말이 막히면 한국어로 도움 요청")
    .fill("한 번 더 알려줘");
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await page.locator(".hm-chat-assistant").nth(1).waitFor();
  assert.equal(await page.locator(".hm-chat-assistant").count(), 2);
  await page
    .locator(".hm-chat-assistant")
    .first()
    .getByRole("button", { name: /들어보기/ })
    .waitFor();
  await page
    .getByRole("button", { name: "이 표현 연습에 추가" })
    .first()
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "내 표현에 추가했어요." })
    .waitFor();
  await page.locator(".hm-main").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({
    path: resolve(screenshots, "chat.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "내 표현", exact: true }).click();
  const practicedResponse = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/study") &&
      r.request().postDataJSON()?.action === "practice",
  );
  await page
    .getByRole("button", { name: "혼자 말했어요", exact: true })
    .click();
  assert.equal((await practicedResponse).status(), 200);
  await page
    .locator(".hm-expression small")
    .filter({ hasText: "다음 복습" })
    .waitFor();
  assert((await state()).state.expressions[0].dueAt > Date.now());
  console.log(
    "PASS multi-turn AI conversation preserves previous phrase controls → explicit save → spoken practice → next review",
  );
  const other = await browser.newContext();
  await other.request.post(base + "/api/auth", { data: { pin: "839271" } });
  await post(
    {
      action: "signup",
      name: `other_${Date.now()}`,
      password: "test-password-1234",
    },
    other,
    "/api/study/account",
  );
  assert.equal((await state(other)).state.expressions.length, 0);
  assert.equal(
    (await other.request.get(base + "/api/study/admin")).status(),
    403,
  );
  assert.equal(
    (await context.request.get(base + "/api/study/admin")).status(),
    403,
  );
  const connected = await post(
    { provider: "codex" },
    context,
    "/api/model-connections",
  );
  assert.equal(connected.status, 202);
  const otherConnections = await other.request.get(
    base + "/api/model-connections",
  );
  assert.deepEqual((await otherConnections.json()).connections, []);
  const selected = await post({
    action: "chat",
    language: "ja",
    scene: "smalltalk",
    messages: [{ role: "user", content: "안녕" }],
    selection: "a".repeat(32) + ":test-model",
  });
  assert.equal(selected.status, 200);
  assert.equal(modelCalls.at(-1).model, "a".repeat(32) + ":test-model");
  assert.match(modelCalls.at(-1).subject, /^[a-f0-9]{64}$/);
  const disconnected = await context.request.delete(
    base + "/api/model-connections",
    { headers: { Origin: base }, data: { id: "a".repeat(32) } },
  );
  assert.equal(disconnected.status(), 200);
  const countBefore = calls;
  const revoked = await post({
    action: "chat",
    language: "ja",
    scene: "smalltalk",
    messages: [{ role: "user", content: "안녕" }],
    selection: "a".repeat(32) + ":test-model",
  });
  assert.equal(revoked.status, 409);
  assert.equal(calls, countBefore);
  console.log(
    "PASS learner personal AI isolation, selected model routing, revoked selection fails without default fallback",
  );
  const csrf = await context.request.post(base + "/api/study", {
    headers: { Origin: "https://evil.example" },
    data: { action: "delete", id },
  });
  assert.equal(csrf.status(), 403);
  const admin = await browser.newContext();
  await post(
    {
      action: "signup",
      name: `owner_switch_${Date.now()}`,
      password: "test-password-1234",
    },
    admin,
    "/api/study/account",
  );
  const adminPage = await admin.newPage();
  await adminPage.goto(base + "/login?from=%2Fstudy%2Fadmin");
  await adminPage.getByLabel("PIN", { exact: true }).fill("839271");
  await adminPage.getByRole("button", { name: "열기", exact: true }).click();
  await adminPage.waitForURL(base + "/study/admin");
  assert.equal((await state(admin)).identity.owner, true);
  const source = {
    language: "ja",
    scene: "smalltalk",
    level: 1,
    title: "E2E 추가 스몰토크",
    sourceUrl: "",
    rights: "본인이 직접 작성한 E2E 교육 원문, AI 처리 및 재사용 허용",
    rightsConfirmed: true,
    transcript:
      "직접 제작한 스몰토크 원문입니다. 한국에서 왔다고 소개하는 회화 연습입니다.",
  };
  const generated = await post(
    { action: "generate", ...source },
    admin,
    "/api/study/admin",
  );
  assert.equal(generated.status, 200);
  assert.equal(generated.data.draft.status, "draft");
  const draft = generated.data.draft;
  assert(!(await state()).units.some((u) => u.id.includes(draft.id)));
  assert.equal(
    (
      await post(
        { action: "save", ...draft, status: "published", reviewed: false },
        admin,
        "/api/study/admin",
      )
    ).status,
    400,
  );
  const published = await post(
    { action: "save", ...draft, status: "published", reviewed: true },
    admin,
    "/api/study/admin",
  );
  assert.equal(published.status, 200);
  assert((await state()).units.some((u) => u.id.includes(draft.id)));
  assert.equal(
    (
      await post(
        { action: "save", ...draft, status: "published", reviewed: true },
        admin,
        "/api/study/admin",
      )
    ).status,
    409,
  );
  await post(
    { action: "save", ...published.data.draft, status: "draft" },
    admin,
    "/api/study/admin",
  );
  assert(!(await state()).units.some((u) => u.id.includes(draft.id)));
  console.log(
    "PASS account isolation, CSRF, owner-only admin, draft/review/publish/unpublish, revision conflict",
  );
  await adminPage.goto(base + "/study/admin");
  await adminPage
    .getByRole("heading", { name: "좋은 대화를, 좋은 수업으로." })
    .waitFor();
  await adminPage
    .getByLabel("수업 제목", { exact: true })
    .fill("브라우저에서 만든 스몰토크");
  await adminPage
    .getByLabel("원문 사용권 근거", { exact: true })
    .fill(source.rights);
  await adminPage
    .getByLabel("직접 제공받은 텍스트·SRT·VTT 원문", { exact: true })
    .fill(source.transcript);
  await adminPage
    .getByLabel(
      "이 원문을 AI로 처리하고 학습 표현으로 재사용할 권한을 확인했어요.",
      { exact: true },
    )
    .check();
  await adminPage
    .getByRole("button", { name: "AI로 학습 초안 만들기", exact: true })
    .click();
  await adminPage
    .getByRole("status")
    .filter({ hasText: "초안을 저장했어요." })
    .waitFor();
  await adminPage.screenshot({
    path: resolve(screenshots, "admin.png"),
    fullPage: true,
  });
  await adminPage.locator(".hm-review-unit textarea").first().waitFor();
  await adminPage
    .getByLabel("목표 언어·발음 도움·난이도·개인정보·사용권을 검수했어요.", {
      exact: true,
    })
    .check();
  await adminPage
    .getByRole("button", { name: "검수 완료 · 학습에 게시", exact: true })
    .click();
  await adminPage
    .getByRole("status")
    .filter({ hasText: "게시했어요." })
    .waitFor();
  assert(
    (await state()).units.some((u) => u.title === "브라우저에서 만든 스몰토크"),
  );
  console.log(
    "PASS admin browser form → draft → human review → learner curriculum",
  );
  await adminPage.screenshot({
    path: resolve(screenshots, "admin.png"),
    fullPage: true,
  });
  await adminPage
    .getByRole("button", { name: "게시 내리고 초안 저장", exact: true })
    .click();
  await adminPage
    .getByRole("status")
    .filter({ hasText: "초안을 저장했어요." })
    .waitFor();
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.reload();
    await page.getByRole("button", { name: "오늘 연습 시작" }).waitFor();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow ${width}`,
    );
    assert.equal(await page.locator(".hm-bottom svg").count(), 4);
    assert.equal(
      await page
        .locator(".hm-course-hero")
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      "rgb(49, 87, 213)",
    );
    assert.equal(
      await page
        .locator(".hm-main")
        .evaluate((el) =>
          getComputedStyle(el).fontFamily.includes("Apple SD Gothic Neo"),
        ),
      true,
    );
    assert(
      await page
        .locator(".hm-device")
        .evaluate((el) => el.getBoundingClientRect().width <= 480),
    );
    for (const label of ["레벨별", "상황별", "오늘 추천"]) {
      await page.getByRole("button", { name: label, exact: true }).click();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${label} overflow ${width}`,
      );
    }
    assert(
      await page
        .locator(".hm-main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      `app horizontal overflow ${width}`,
    );
    const nav = await page.locator(".hm-bottom").boundingBox();
    assert(nav.y + nav.height <= 901, `navigation visible ${width}`);
    if (width === 1440) {
      await page.locator(".hm-main").evaluate((el) => (el.scrollTop = 0));
      await page.screenshot({
        path: resolve(screenshots, "desktop.png"),
        fullPage: true,
      });
    }
  }
  await page.getByRole("button", { name: "내 AI", exact: true }).click();
  await page.getByRole("heading", { name: "내 AI 연결" }).waitFor();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.getByRole("button", { name: "로그인", exact: true }).waitFor();
  assert.equal((await context.request.get(base + "/api/study")).status(), 401);
  assert.deepEqual(errors, []);
  console.log(
    "PASS responsive 360/390/768/1440, dialogs, logout, no browser exceptions",
  );
  await other.close();
  await admin.close();
  await context.close();
  console.log(
    "HANMADI V2 E2E PASSED (fixture upstream; no live provider claim)",
  );
} catch (e) {
  console.error(logs);
  throw e;
} finally {
  if (browser) await browser.close();
  app.kill("SIGTERM");
  await Promise.race([
    once(app, "exit"),
    new Promise((r) => setTimeout(r, 5000)),
  ]);
  if (app.exitCode === null && app.signalCode === null) {
    app.kill("SIGKILL");
    await once(app, "exit");
  }
  await new Promise((r) => mock.close(r));
  await unlink(testDataFile);
  console.log("E2E servers stopped; isolated test data removed");
}
