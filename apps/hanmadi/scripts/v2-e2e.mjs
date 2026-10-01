import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { chromium } from "playwright";
import { verifyYoutubeSearch } from "./youtube-search-e2e.mjs";
import { learningProviderFixture, verifyLearning } from "./learning-e2e.mjs";
const testDataFile = resolve(process.env.HANMADI_E2E_DATA_FILE || ".data/v2-e2e.json");
await mkdir(dirname(testDataFile), { recursive: true });
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
const speechInputs = [];
// A real, decodable PCM clip: exercise browser playback instead of an empty ID3 header.
const speechClip = Buffer.alloc(44 + 4000);
speechClip.write("RIFF", 0); speechClip.writeUInt32LE(speechClip.length - 8, 4);
speechClip.write("WAVEfmt ", 8); speechClip.writeUInt32LE(16, 16);
speechClip.writeUInt16LE(1, 20); speechClip.writeUInt16LE(1, 22);
speechClip.writeUInt32LE(8000, 24); speechClip.writeUInt32LE(16000, 28);
speechClip.writeUInt16LE(2, 32); speechClip.writeUInt16LE(16, 34);
speechClip.write("data", 36); speechClip.writeUInt32LE(4000, 40);
let calls = 0,
  slowStarted;
const connections = new Map();
let loginFixture = false;
const claudeState = "s".repeat(43);
const claudeLoginUrl =
  "https://claude.com/cai/oauth/authorize?redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&response_type=code&code_challenge_method=S256&state=" +
  claudeState;
const nativeCode = "fixture-code-only#" + claudeState;
const mock = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  let b = {};
  try {
    b = JSON.parse(raw);
  } catch {}
  res.setHeader("Content-Type", "application/json");
  if (learningProviderFixture(req, res, raw)) return;
  if (req.url?.includes("/connections")) {
    const subject = req.headers["x-ai-subject"];
    const list = connections.get(subject) || [];
    if (req.method === "GET")
      return res.end(JSON.stringify({ connections: list }));
    if (req.method === "DELETE") {
      connections.set(subject, []);
      return res.end(JSON.stringify({ ok: true }));
    }
    if (req.url.endsWith("/authorize")) {
      const c = list.find(
        (c) => req.url === "/connections/" + c.id + "/authorize",
      );
      if (
        !c ||
        c.provider !== "claude" ||
        c.state !== "authorizing" ||
        c.challenge?.submitted ||
        b.code !== nativeCode
      ) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: "invalid_authorization_code" }));
      }
      c.challenge.submitted = true;
      res.statusCode = 202;
      return res.end(JSON.stringify({ ok: true }));
    }
    const c = {
      id: (b.provider === "claude" ? "b" : "a").repeat(32),
      provider: b.provider,
      state: loginFixture ? "authorizing" : "connected",
      models: loginFixture ? [] : ["test-model"],
    };
    if (loginFixture && b.provider === "claude")
      assert.equal(b.authMethod, "claude-code");
    connections.set(subject, [c]);
    return res.end(JSON.stringify(c));
  }
  if (req.url?.endsWith("/audio/transcriptions")) {
    audioCalls++;
    assert(!raw.includes('name="language"'), "auto STT omits forced language");
    return res.end(JSON.stringify({ text: "한국에서 왔어요" }));
  }
  if (req.url?.endsWith("/audio/speech")) {
    speechInputs.push(b.input);
    await new Promise(resolve => setTimeout(resolve, 200));
    res.setHeader("Content-Type", "audio/wav");
    return res.end(speechClip);
  }
  calls++;
  modelCalls.push({
    model: b.model,
    subject: req.headers["x-ai-subject"],
    system: b.messages?.[0]?.content ?? "",
  });
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
  if (system.includes("speaking coach")) {
    assert.equal(b.response_format?.type, "json_schema");
    assert.equal(b.response_format.json_schema.strict, true);
    for (const message of b.messages.filter((m) => m.role === "assistant"))
      assert.equal(
        typeof JSON.parse(message.content).text,
        "string",
        "assistant history preserves JSON",
      );
  }
  let result = phrases[language];
  if (input === "곤니치와, 현종데스요" && !system.includes("REPAIR:"))
    result = { ...result, text: "안녕하세요! 저는 하나예요." };
  if (b.response_format?.json_schema?.name === "hanmadi_learner_turn") {
    if (language === "th" && input === "얼음 없이 커피 한 잔 주세요.") {
      return res.end(JSON.stringify({choices:[{message:{content:JSON.stringify({
        phrase:{text:"ขอแฟหนึ่งแก้วไม่เอาหวาน",reading:"커 핝 깨우 마이 아우 완",meaning:input},reusable:true,
      })}}]}));
    }
    if (input.includes("변환실패")) {
      res.statusCode = 503;
      return res.end(
        JSON.stringify({ error: { message: "learner-only failure" } }),
      );
    }
    result = {
      phrase: input.includes("예시부터 알려") ? null : phrases[language],
      reusable: !input.includes("현종") && !input.includes("예시부터 알려"),
    };
  }
  if (system.includes("travel translator")) {
    assert.equal(b.response_format?.json_schema?.name, "hanmadi_translation");
    result = {
      translated: system.includes("Source language is ko")
        ? result.text
        : result.meaning,
      reading: result.reading,
      practice: result,
    };
    if (language === "th" && input === "얼음 없이 커피 한 잔 주세요.") {
      result = {translated: system.includes("REPAIR:") ? "ขอกาแฟหนึ่งแก้ว ไม่ใส่น้ำแข็ง" : "ขอแฟเย็นไม่ใส่น้ำแข็งค่ะ", reading:"커 까패 능 깨우 마이 싸이 남캥", practice:null};
    }
    if (language === "es" && input === "계산서 주세요.") {
      result = {translated: "La cuenta, por favor.",
        reading: system.includes("REPAIR:") ? "라 꾸엔따, 포르 파보르." : "라 꿰운따, 포르 파보르.", practice: null};
    }
    if (language === "es" && input === "Un café sin hielo, por favor.") {
      result = {translated: system.includes("REPAIR:") ? "얼음 없는 커피 한 잔 주세요." : "얼음 없는 커피 한 잔 주세요, 포르 파보르.",
        reading: "운 까페 신 이에로, 포르 파보르.", practice: null};
    }
    if (input === "따뜻한 커피 한 잔 주세요." && !system.includes("REPAIR:"))
      result.reading = "kho ka fae";
  }
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
      YOUTUBE_API_KEY: "e2e-unusable-key",
      LITELLM_BASE_URL: mockBase + "/v1",
      LITELLM_API_KEY: "e2e-only",
      LITELLM_MODEL: "gemini-fixture",
      HANMADI_EMBEDDING_BASE_URL: mockBase + "/v1",
      HANMADI_EMBEDDING_API_KEY: "embedding-fixture-key",
      HANMADI_EMBEDDING_MODEL: "embedding-fixture",
      HANMADI_TRAINING_BASE_URL: mockBase + "/v1",
      HANMADI_TRAINING_API_KEY: "training-fixture-key",
      HANMADI_TRAINING_MODEL: "training-fixture",
      HANMADI_TRAINING_ENABLED: "true",
      HANMADI_TRAINING_MIN_EXAMPLES: "10",
      HANMADI_TRAINED_MODELS: JSON.stringify({
        "ft:fixture:trained": "hanmadi-trained-fixture",
      }),
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
const screenshots = resolve(
  process.env.HANMADI_E2E_SCREENSHOTS || "../../docs/hanmadi-v2-e2e",
);
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
    window.__playedAudio = 0;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = async function () {
      await play.call(this);
      window.__playedAudio++;
    };
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
  await page.getByRole("heading", { name: "한마디 시작하기" }).waitFor();
  assert.equal(await page.locator(".hm-bottom").count(), 0);
  await page.screenshot({
    path: resolve(screenshots, "login-entry.png"),
    fullPage: true,
  });
  assert.equal(
    await page
      .getByRole("combobox", { name: "학습 언어", exact: true })
      .count(),
    0,
  );
  await page.getByRole("button", { name: "처음이에요 · 계정 만들기" }).click();
  const name = `e2e_${Date.now()}`;
  await page.getByLabel("학습자 아이디").fill(name);
  await page.getByLabel("비밀번호", { exact: true }).fill("test-password-1234");
  await page
    .getByRole("button", { name: "학습 계정 만들기", exact: true })
    .click();

  await page.getByRole("button", { name: /일본어 日本語/ }).waitFor();
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const brand = page.locator(".hm-header > .hm-wordmark");
    await brand.waitFor();
    const box = await brand.boundingBox();
    assert(
      box.height <= 44,
      `onboarding brand must stay on one line at ${width}`,
    );
    assert(
      await page
        .locator(".hm-header")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      `onboarding header overflow ${width}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  console.log("PASS onboarding brand and header 360/390/768/1440");
  await page.getByRole("button", { name: /일본어 日本語/ }).click();
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    for (const lang of ["en", "ja", "th", "es"]) {
      await page
        .getByRole("combobox", { name: "학습 언어", exact: true })
        .selectOption(lang);
      const layout = await page
        .getByRole("combobox", { name: "학습 언어", exact: true })
        .evaluate((el) => {
          const css = getComputedStyle(el);
          return {
            available:
              el.clientWidth -
              parseFloat(css.paddingLeft) -
              parseFloat(css.paddingRight),
            required:
              el.selectedOptions[0].textContent.length *
              parseFloat(css.fontSize),
            left: el.getBoundingClientRect().left,
          };
        });
      assert(
        layout.available >= layout.required,
        `full language label ${lang} at ${width}`,
      );
      assert(
        await page
          .locator(".hm-header")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
        `header overflow ${width}`,
      );
      const actionBox = await page
        .getByRole("button", { name: "내 AI", exact: true })
        .boundingBox();
      assert(
        actionBox.x > layout.left,
        `language left, actions right ${width}`,
      );
    }
    if (width === 390)
      await page.screenshot({
        path: resolve(screenshots, "spanish-header.png"),
        fullPage: true,
      });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("combobox", { name: "학습 언어", exact: true })
    .selectOption("ja");
  console.log(
    "PASS all language labels fit and header actions align 320–1440px",
  );
  await page.getByRole("heading", { name: "쓸 줄 몰라도 괜찮아요." }).waitFor();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByRole("heading", { name: "학습 설정", exact: true }).waitFor();
  assert.equal(await page.locator(".hm-settings-languages button").count(), 4);
  assert.equal(
    await page.getByRole("button", { name: "5분", exact: true }).isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "번역", exact: true }).click();
  await page
    .getByRole("button", { name: "말하기 시작", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "스터디", exact: true }).click();
  await page.getByRole("heading", { name: "쓸 줄 몰라도 괜찮아요." }).waitFor();
  console.log(
    "PASS settings controls and translation accessible before assessment",
  );
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
  await page
    .getByRole("button", { name: "오늘 연습 시작", exact: true })
    .click();
  const lesson = page.getByRole("dialog");
  await lesson.getByText("문장 1 / 10", { exact: true }).waitFor();
  const firstAudioText = await lesson.locator(".hm-native").innerText();
  await lesson.getByRole("button", { name: "들어보기", exact: true }).click();
  await page.waitForFunction(() => window.__playedAudio >= 1);
  const repeatStart = performance.now();
  await lesson.getByRole("button", { name: "들어보기", exact: true }).click();
  await page.waitForFunction(() => window.__playedAudio >= 2);
  const replayMs = Math.round(performance.now() - repeatStart);
  assert.equal(speechInputs.filter(text => text === firstAudioText).length, 1,
    "repeated listening must not request speech twice");
  console.log(`PASS real browser audio playback; replay without upstream request (${replayMs}ms including automation)`);
  const speechCount = speechInputs.filter(text => text === firstAudioText).length;
  const serverCacheHit = await context.request.post(base + "/api/study/audio", {
    headers:{Origin:base}, data:{text:firstAudioText,language:"ja"},
  });
  assert.equal(serverCacheHit.status(),200);
  assert.equal(serverCacheHit.headers()["x-hanmadi-audio"],"lesson-cache");
  assert((await serverCacheHit.body()).length > 0);
  assert.equal(speechInputs.filter(text => text === firstAudioText).length,speechCount);
  console.log("PASS authenticated lesson audio API reuses server cache without another TTS request");

  assert.equal(
    await lesson
      .getByRole("button", { name: "이전", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(await lesson.getByText("③ 지금은 얼마나 편했나요?").count(), 0);
  const seenPhrases = new Set();
  const beforeLesson = (await state()).state.profiles.ja;
  for (let index = 1; index <= 10; index++) {
    await lesson.getByText(`문장 ${index} / 10`, { exact: true }).waitFor();
    seenPhrases.add(await lesson.locator(".hm-native").innerText());
    if (index === 1)
      await page.screenshot({
        path: resolve(screenshots, "ten-phrase-lesson.png"),
        fullPage: true,
      });
    if (index < 10)
      await lesson.getByRole("button", { name: "다음", exact: true }).click();
  }
  assert.equal(seenPhrases.size, 10);
  assert.deepEqual(
    (await state()).state.profiles.ja.completedLessons,
    beforeLesson.completedLessons,
  );
  await lesson.getByRole("button", { name: "이전", exact: true }).click();
  await lesson.getByText("문장 9 / 10", { exact: true }).waitFor();
  await lesson.getByRole("button", { name: "다음", exact: true }).click();
  await lesson
    .getByRole("button", { name: "학습 마치기", exact: true })
    .click();
  await lesson.waitFor({ state: "hidden" });
  const completedProfile = (await state()).state.profiles.ja;
  assert.equal(Object.values(completedProfile.completedLessons).length, 1);
  assert.equal(Object.values(completedProfile.completedLessons)[0].phrases, 10);
  assert.deepEqual(completedProfile.practiced, beforeLesson.practiced);
  await page
    .getByRole("button", { name: "오늘 연습 시작", exact: true })
    .click();
  await lesson.getByRole("button", { name: "다음", exact: true }).click();
  await lesson.getByRole("button", { name: "닫기", exact: true }).click();
  assert.deepEqual(
    (await state()).state.profiles.ja.completedLessons,
    completedProfile.completedLessons,
  );
  assert.equal(
    (
      await post({
        action: "completeLesson",
        language: "ja",
        id: "starter:es:smalltalk:1",
      })
    ).status,
    404,
  );
  assert.equal(
    (await post({ action: "completeLesson", language: "ja", id: "unknown" }))
      .status,
    404,
  );
  console.log(
    "PASS ten distinct phrases, previous/next, completion persistence, early close, language isolation",
  );

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
  await page.getByRole("button", { name: "상황별", exact: true }).click();
  await page.getByRole("button", { name: /클럽·바 음악을 매개로/ }).click();
  const clubTitles = [
    "첫 인사와 간단한 요청",
    "취향 묻고 답 주고받기",
    "취향과 이유로 대화 이어가기",
    "정중한 거절과 상황 조율",
  ];
  const clubSeen = new Set();
  for (let level = 1; level <= 4; level++) {
    await page
      .getByRole("button", {
        name: new RegExp(`Lv.${level} · ${clubTitles[level - 1]}`),
      })
      .click();
    const clubDialog = page.getByRole("dialog");
    await clubDialog
      .getByRole("heading", { name: clubTitles[level - 1], exact: true })
      .waitFor();
    assert(
      await clubDialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      "club lesson fits mobile width",
    );
    for (let i = 1; i <= 10; i++) {
      await clubDialog.getByText(`문장 ${i} / 10`, { exact: true }).waitFor();
      const phrase = await clubDialog.locator(".hm-native").innerText();
      assert(
        !clubSeen.has(phrase),
        `repeated club expression at level ${level}`,
      );
      clubSeen.add(phrase);
      if (i === 1 && (level === 1 || level === 4))
        await page.screenshot({
          path: resolve(screenshots, `club-level-${level}.png`),
          fullPage: true,
        });
      if (i < 10)
        await clubDialog
          .getByRole("button", { name: "다음", exact: true })
          .click();
    }
    await clubDialog.getByRole("button", { name: "닫기", exact: true }).click();
  }
  assert.equal(clubSeen.size, 40);
  assert.deepEqual(
    (await state()).state.profiles.ja.completedLessons,
    completedProfile.completedLessons,
  );
  console.log(
    "PASS club four levels: 40 distinct displayed sentences, mobile fit, close without changing progress",
  );

  const scenePlans = JSON.parse(
    await readFile(resolve("lib/v2-scene-plans.json"), "utf8"),
  );
  const sceneNames = {
    smalltalk: "스몰토크",
    cafe: "카페",
    restaurant: "식당",
    hotel: "호텔",
    directions: "길 찾기·교통",
    shopping: "쇼핑",
    friends: "친구와 약속",
  };
  const curriculumSeen = new Set(clubSeen);
  for (const [sceneId, plans] of Object.entries(scenePlans)) {
    await page.getByRole("button", { name: "모든 상황", exact: true }).click();
    await page
      .locator(".hm-scene-grid button")
      .filter({ has: page.getByText(sceneNames[sceneId], { exact: true }) })
      .click();
    for (const [i, plan] of plans.entries()) {
      const card = page.getByRole("button", {
        name: new RegExp(`Lv.${i + 1} · ${plan.title}`),
      });
      assert((await card.innerText()).includes(plan.goal));
      await card.click();
      const dialog = page.getByRole("dialog");
      await dialog
        .getByRole("heading", { name: plan.title, exact: true })
        .waitFor();
      assert(
        (await dialog.locator(".hm-lesson-context").innerText()).includes(
          plan.context,
        ),
      );
      const navigationBox = await dialog
        .locator(".hm-lesson-navigation")
        .boundingBox();
      const dialogBox = await dialog.boundingBox();
      assert(
        navigationBox &&
          dialogBox &&
          navigationBox.y + navigationBox.height <=
            dialogBox.y + dialogBox.height + 1,
        "lesson navigation is visible before scrolling",
      );
      for (let n = 1; n <= 10; n++) {
        await dialog.getByText(`문장 ${n} / 10`, { exact: true }).waitFor();
        await dialog
          .getByText(plan.steps[n - 1].cue, { exact: true })
          .waitFor();
        const phrase = await dialog.locator(".hm-native").innerText();
        assert(
          !curriculumSeen.has(phrase),
          `duplicate displayed ${sceneId}:${i + 1}:${n}`,
        );
        curriculumSeen.add(phrase);
        assert(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
          `${sceneId}:${i + 1}:${n} fits mobile`,
        );
        if (sceneId === "cafe" && n === 1 && (i === 0 || i === 3)) {
          await page.screenshot({
            path: resolve(screenshots, `cafe-level-${i + 1}.png`),
            fullPage: true,
          });
        }
        if (n < 10)
          await dialog
            .getByRole("button", { name: "다음", exact: true })
            .click();
      }
      await dialog.getByRole("button", { name: "이전", exact: true }).click();
      await dialog.getByText("문장 9 / 10", { exact: true }).waitFor();
      await dialog.getByRole("button", { name: "닫기", exact: true }).click();
    }
  }
  assert.equal(curriculumSeen.size, 320);
  assert.deepEqual(
    (await state()).state.profiles.ja.completedLessons,
    completedProfile.completedLessons,
  );
  console.log(
    "PASS all 32 lessons: 320 distinct displayed phrases, goals, cues, next/previous, mobile fit, preserved progress",
  );

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
    await page.getByRole("button", { name: "레벨별", exact: true }).click();
    for (let level = 1; level <= 4; level++) {
      await page.locator(".hm-levels button").nth(level - 1).click();
      assert.equal(await page.locator(".hm-course-card").count(), 8);
      const labels = await page.locator(".hm-course-card").allTextContents();
      const expectedTitles = [...Object.values(scenePlans).map(plans => plans[level-1].title), clubTitles[level-1]];
      for (const title of expectedTitles)
        assert(labels.some(label => label.includes(title)), `${language} level ${level}: ${title}`);
    }
    const rows = JSON.parse(await readFile(resolve("lib/v2-scene-phrases.json"), "utf8"));
    const column = {en:5, th:3, es:7}[language];
    const seen = new Set();
    await page.getByRole("button", {name:"상황별", exact:true}).click();
    for (const [sceneId, name] of Object.entries({...sceneNames, club:"클럽·바"})) {
      const back = page.getByRole("button", {name:"모든 상황",exact:true});
      if (await back.count()) await back.click();
      await page.locator(".hm-scene-grid button").filter({has:page.getByText(name,{exact:true})}).click();
      assert.equal(await page.locator(".hm-course-card").count(), 4);
      for (let level = 1; level <= 4; level++) {
        await page.locator(".hm-course-card").nth(level-1).click();
        const dialog = page.getByRole("dialog");
        for (let n=0; n<10; n++) {
          await dialog.getByText(`문장 ${n+1} / 10`, {exact:true}).waitFor();
          const native = dialog.locator(".hm-native");
          const text = await native.innerText();
          assert.equal(await native.getAttribute("lang"), language);
          assert(!seen.has(text), `${language}:${sceneId}:${level}:${n} duplicate`);
          seen.add(text);
          const row = rows[`${sceneId}:${level}`]?.[n];
          if (row) {
            assert.equal(text, row[column]);
            assert.equal(await dialog.locator(".hm-reading").innerText(), row[column+1]);
            await dialog.getByText(row[0], {exact:true}).waitFor();
            await dialog.getByText(scenePlans[sceneId][level-1].steps[n].cue,{exact:true}).waitFor();
          }
          assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), `${language} layout`);
          if(n<9) await dialog.getByRole("button",{name:"다음",exact:true}).click();
        }
        await dialog.getByRole("button",{name:"닫기",exact:true}).click();
      }
    }
    assert.equal(seen.size,320);
    console.log(`PASS ${language}: 32 scene/level lessons, 320 unique phrases, exact pronunciation/meaning, level filters and mobile layout`);
    await page.getByRole("button",{name:"번역",exact:true}).click();
    const details = page.getByText("직접 입력하거나 인식한 말 수정하기");
    await details.click();
    await page.getByLabel("번역할 말").fill("한국에서 왔어요");
    await page.getByRole("button",{name:"번역하기",exact:true}).click();
    await page.getByText(phrases[language].text,{exact:true}).waitFor();
    await page.getByText(phrases[language].reading,{exact:true}).waitFor();
    const reverse = await post({action:"translate",language,from:language,text:phrases[language].text});
    assert.equal(reverse.status,200);
    assert.match(reverse.data.translated, /[가-힣]/);
    if (language === "th") {
      const repaired = await post({action:"translate", language, from:"ko", text:"얼음 없이 커피 한 잔 주세요."});
      assert.equal(repaired.status,200);
      assert.equal(repaired.data.translated,"ขอกาแฟหนึ่งแก้ว ไม่ใส่น้ำแข็ง");
      console.log("PASS reported Thai coffee meaning drift is repaired before returning to learner");
    }
    if (language === "es") {
      const before = calls;
      await page.getByLabel("번역할 말").fill("계산서 주세요.");
      await page.getByRole("button", {name:"번역하기",exact:true}).click();
      await page.getByText("La cuenta, por favor.", {exact:true}).waitFor();
      await page.getByText("라 꾸엔따, 포르 파보르.", {exact:true}).waitFor();
      assert.equal(await page.getByText("라 꿰운따, 포르 파보르.", {exact:true}).count(), 0);
      assert.equal(calls - before, 2, "Spanish pronunciation has one bounded repair");
      const reverse = await post({action:"translate", language, from:language, text:"Un café sin hielo, por favor."});
      assert.equal(reverse.status, 200);
      assert.equal(reverse.data.translated, "얼음 없는 커피 한 잔 주세요.");
      assert.equal(calls - before, 4, "reverse meaning has one bounded repair");
      assert(!(await state()).state.expressions.some(e => /꿰운따|포르 파보르/.test(e.meaning)), "bad meaning never saved");
      await page.locator(".hm-main").evaluate(el => (el.scrollTop = 0));
      await page.screenshot({path:resolve(screenshots,"spanish-translation-repair.png"),fullPage:true});
      console.log("PASS Spanish pronunciation repaired in browser; reverse phonetic leakage repaired before response/save");
    }
    // Restore the screen's collapsed input before the existing Japanese translation journey.
    await details.click();
    await page.getByRole("button", {name:"스터디",exact:true}).click();
    console.log(`PASS ${language}: Korean → target UI and target → Korean API (fixture provider)`);
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
  const callsBeforeRepair = calls;
  const recoveredTranslation = await post({
    action: "translate",
    language: "ja",
    from: "ko",
    text: "따뜻한 커피 한 잔 주세요.",
  });
  assert.equal(recoveredTranslation.status, 200);
  assert.equal(recoveredTranslation.data.reading, phrases.ja.reading);
  assert.equal(calls, callsBeforeRepair + 2);
  assert.equal((await state()).state.expressions.length, 1);
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
  for (const width of [320, 360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const controls = page.locator(".hm-chat-controls");
    const modelBox = await controls
      .getByRole("button", { name: /기본 Gemini/ })
      .boundingBox();
    const newBox = await controls
      .getByRole("button", { name: "새 대화", exact: true })
      .boundingBox();
    assert(
      Math.abs(modelBox.y - newBox.y) < 1,
      `chat buttons baseline ${width}`,
    );
    assert(
      modelBox.x + modelBox.width <= newBox.x,
      `chat buttons overlap ${width}`,
    );
    assert(
      await controls.evaluate((el) => el.scrollWidth <= el.clientWidth),
      `chat toolbar overflow ${width}`,
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "AI가 먼저 말하기 →" }).click();
  await page.getByRole("button", { name: "이 표현 연습에 추가" }).waitFor();
  await page
    .getByLabel("말이 막히면 한국어로 도움 요청")
    .fill("곤니치와, 현종데스요");
  let releaseChat;
  const chatRelease = new Promise((resolve) => {
    releaseChat = resolve;
  });
  let chatRequested;
  const chatRequest = new Promise((resolve) => {
    chatRequested = resolve;
  });
  await page.route("**/api/study", async (route) => {
    const body = route.request().postDataJSON();
    if (body?.action === "chat") {
      chatRequested();
      await chatRelease;
    }
    await route.continue();
  });
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await chatRequest;
  const nextDraft = "다음에는 차가운 음료를 주문하고 싶어";
  await page.getByLabel("말이 막히면 한국어로 도움 요청").fill(nextDraft);
  releaseChat();
  await page.locator(".hm-chat-assistant").nth(1).waitFor();
  assert.equal(
    await page.getByLabel("말이 막히면 한국어로 도움 요청").inputValue(),
    nextDraft,
    "an arriving AI response must not erase the next message being typed",
  );
  await page.unroute("**/api/study");
  await page.screenshot({ path: resolve(screenshots, "chat-draft-preserved.png"), fullPage: true });
  await page.route("**/api/study", async (route) => {
    if (route.request().postDataJSON()?.action === "chat") {
      await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "잠시 후 다시 시도해 주세요." }) });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "보내기", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "잠시 후 다시 시도해 주세요." }).waitFor();
  assert.equal(await page.getByLabel("말이 막히면 한국어로 도움 요청").inputValue(), nextDraft);
  assert.equal(await page.locator(".hm-chat-assistant").count(), 2, "failed send must not append a fake reply");
  await page.unroute("**/api/study");
  await page.getByLabel("말이 막히면 한국어로 도움 요청").fill("");
  console.log("PASS delayed AI reply preserves next draft; failed send preserves text and conversation");
  assert.equal(await page.locator(".hm-chat-assistant").count(), 2);
  assert(
    !(await page.locator(".hm-chat-assistant").nth(1).innerText()).includes(
      "저는 하나예요",
    ),
  );
  assert(
    (await page.locator(".hm-chat-assistant").nth(1).innerText()).includes(
      "韓国から来ました",
    ),
  );
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
  await page.getByRole("button", { name: "내 AI", exact: true }).click();
  await page.getByRole("button", { name: /codex · test-model/ }).click();
  await page.getByRole("button", { name: /이 AI로 대화하기/ }).click();
  await page.getByRole("button", { name: "AI가 먼저 말하기 →" }).click();
  await page.getByRole("button", { name: "이 표현 연습에 추가" }).waitFor();
  assert.equal(modelCalls.at(-1).model, "a".repeat(32) + ":test-model");
  await page.getByRole("button", { name: "내 AI", exact: true }).click();
  await page
    .getByRole("button", { name: /기본 Gemini 별도 연결 없이 사용/ })
    .click();
  await page
    .getByRole("button", { name: "이전 화면으로", exact: true })
    .click();
  console.log(
    "PASS model cards → selected personal model → conversation → default model",
  );
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
  await verifyYoutubeSearch({ adminPage, post, admin, screenshots });
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
  // New shared knowledge flow uses actual Next handlers and persistent local CAS.
  const adminSnapshot = async () =>
    (await admin.request.get(base + "/api/study/admin")).json();
  assert.equal((await adminSnapshot()).contributions.length, 0);
  await post({
    action: "translate",
    language: "ja",
    from: "ko",
    text: "한국에서 왔어요.",
  });
  assert.equal(
    (await adminSnapshot()).contributions.length,
    0,
    "personal practice consent is not shared consent",
  );
  await post({ action: "settings", language: "ja" });
  const contributorPage = await context.newPage();
  await contributorPage.goto(base + "/study");
  await contributorPage
    .getByRole("button", { name: "번역", exact: true })
    .click();
  await contributorPage
    .getByText("공용 학습 자료 제공 (선택)", { exact: true })
    .click();
  const consent = contributorPage.getByLabel(
    "이번 번역의 일반 표현을 공용 학습 자료로 제공하는 데 동의해요.",
    { exact: true },
  );
  assert.equal(await consent.isChecked(), false);
  await consent.check();
  await contributorPage.getByText("직접 입력하거나 인식한 말 수정하기").click();
  await contributorPage.getByLabel("번역할 말").fill("한국에서 왔어요.");
  await contributorPage
    .getByRole("button", { name: "번역하기", exact: true })
    .click();
  await contributorPage
    .getByRole("status")
    .filter({ hasText: "관리자 검수 후보" })
    .waitFor();
  assert.equal(
    await consent.isChecked(),
    false,
    "consent applies to one translation only",
  );
  await contributorPage
    .getByText("공용 학습 자료 제공 (선택)", { exact: true })
    .click();
  const candidate = (await adminSnapshot()).contributions[0];
  assert.equal(
    candidate.actor,
    undefined,
    "admin does not receive contributor identity",
  );
  assert.equal(
    (
      await post({
        action: "translate",
        language: "ja",
        from: "ko",
        text: "한국에서 왔어요.",
        shareForLearning: true,
      })
    ).data.contribution,
    "duplicate",
  );
  await adminPage.reload();
  await adminPage
    .getByRole("button", { name: "번역 후보 (1)", exact: true })
    .click();
  await adminPage
    .getByRole("button", { name: "교재 초안으로 가져오기", exact: true })
    .click();
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
  const shared = (await adminSnapshot()).drafts.find(
    (d) => d.contributionId === candidate.id,
  );
  assert(shared && shared.status === "draft");
  const previewQuery = {
    action: "preview",
    mode: "chat",
    language: "ja",
    level: 1,
    scene: "smalltalk",
    query: "한국에서 왔어요.",
  };
  assert.equal(
    (await post(previewQuery, admin, "/api/study/admin")).data.matches.length,
    0,
  );
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
  assert((await state()).units.some((u) => u.id.includes(shared.id)));
  assert.equal(
    (await post(previewQuery, admin, "/api/study/admin")).data.matches[0].id,
    shared.id,
  );
  await post({ action: "level", language: "ja", level: 1, minutes: 10 });
  assert.equal(
    (
      await post({
        action: "chat",
        language: "ja",
        scene: "smalltalk",
        messages: [{ role: "user", content: "한국에서 왔어요." }],
      })
    ).status,
    200,
  );
  assert.match(
    modelCalls.findLast((c) => c.system.includes("speaking coach")).system,
    /Reference examples/,
  );
  assert.match(
    modelCalls.findLast((c) => c.system.includes("speaking coach")).system,
    /추가 수업 표현/,
  );
  await adminPage
    .getByRole("button", { name: "앱 반영 확인", exact: true })
    .click();
  await adminPage
    .getByRole("button", { name: "적용 자료 확인", exact: true })
    .click();
  await adminPage.getByRole("status").filter({ hasText: "1개 표현" }).waitFor();
  for (const width of [390, 1440]) {
    await adminPage.setViewportSize({ width, height: 1000 });
    assert(
      await adminPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `admin preview overflow ${width}`,
    );
  }
  await post({ action: "withdraw-contributions" }, other);
  assert.equal(
    (await post(previewQuery, admin, "/api/study/admin")).data.matches.length,
    1,
    "other learner cannot withdraw owner's examples",
  );
  await contributorPage
    .getByRole("button", { name: "내가 제공한 공용 자료 회수", exact: true })
    .click();
  await contributorPage
    .getByRole("button", { name: "공용 자료 전체 회수", exact: true })
    .click();
  await contributorPage
    .getByRole("status")
    .filter({ hasText: "공용 후보 1개를 회수" })
    .waitFor();
  await contributorPage.close();
  assert(!(await state()).units.some((u) => u.id.includes(shared.id)));
  assert.equal(
    (await post(previewQuery, admin, "/api/study/admin")).data.matches.length,
    0,
  );
  assert.equal(
    (
      await post(
        { action: "save", ...shared, reviewed: true, status: "published" },
        admin,
        "/api/study/admin",
      )
    ).status,
    409,
  );
  await post({
    action: "chat",
    language: "ja",
    scene: "smalltalk",
    messages: [{ role: "user", content: "한국에서 왔어요." }],
  });
  assert(
    !modelCalls
      .findLast((c) => c.system.includes("speaking coach"))
      .system.includes("Reference examples"),
  );
  assert.equal((await adminSnapshot()).contributions.length, 0);
  const collectionStarted = new Promise((resolve) => {
    slowStarted = resolve;
  });
  const lateCollection = post({
    action: "translate",
    language: "ja",
    from: "ko",
    text: "SLOW",
    shareForLearning: true,
  });
  await collectionStarted;
  await post({ action: "withdraw-contributions" });
  assert.equal((await lateCollection).data.contribution, "withdrawn");
  slowStarted = undefined;
  assert.equal((await adminSnapshot()).contributions.length, 0);
  console.log(
    "PASS shared consent → candidate → admin browser review/publish → learner lesson + actual model context → owner-scoped withdrawal",
  );
  await adminPage.goto(base + "/study/admin");
  await adminPage
    .getByRole("button", { name: "자료 만들기", exact: true })
    .click();
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
  await page.goto(base + "/study");
  await page.getByRole("button", { name: "레벨별", exact: true }).click();
  await page.locator(".hm-levels button").first().click();
  await page
    .getByRole("button", { name: /브라우저에서 만든 스몰토크/ })
    .click();
  await page
    .getByRole("dialog")
    .getByText("문장 1 / 1", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "다음", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "학습 마치기", exact: true })
    .click();
  await page
    .getByText("1문장 학습을 마쳤어요. 내일 다시 연습해 봐요.", { exact: true })
    .waitFor();
  const adminUnit = (await state()).units.find(
    (u) => u.title === "브라우저에서 만든 스몰토크",
  );
  assert.equal(
    (await state()).state.profiles.ja.completedLessons[adminUnit.id].phrases,
    1,
  );
  console.log(
    "PASS admin expression: one approved phrase, no filler, accurate completion count",
  );
  for (const width of [390, 1440]) {
    await adminPage.setViewportSize({ width, height: 1000 });
    assert(
      await adminPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `admin editor overflow ${width}`,
    );
    await adminPage.screenshot({
      path: resolve(screenshots, `knowledge-admin-${width}.png`),
      fullPage: true,
    });
  }
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
  await page
    .getByRole("button", { name: "이전 화면으로", exact: true })
    .click();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page
    .getByRole("region", { name: "현재 로그인 계정", exact: true })
    .getByText("로그인됨", { exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "연결·모델 선택", exact: true })
    .click();
  await page
    .locator(".hm-provider-row button:enabled")
    .filter({ hasText: "API 키로 연결" })
    .waitFor();
  assert(
    await page
      .getByRole("button", { name: "API 키로 연결", exact: true })
      .isEnabled(),
  );
  assert.equal(await page.locator(".hm-provider-card").count(), 2);
  assert.equal(
    await page.getByRole("heading", { name: "Codex", exact: true }).count(),
    1,
  );
  assert.equal(
    await page.getByRole("heading", { name: "Claude", exact: true }).count(),
    1,
  );
  await post({ provider: "codex" }, context, "/api/model-connections");
  for (const list of connections.values())
    for (const connection of list) {
      if (connection.provider === "codex") {
        connection.state = "error";
        connection.models = [];
      }
    }
  // Reopen so the connection GET reflects the failed fixture immediately.
  await page
    .getByRole("button", { name: "이전 화면으로", exact: true })
    .click();
  await page
    .getByRole("button", { name: "연결·모델 선택", exact: true })
    .click();
  const codexCard = page.getByRole("region", {
    name: "Codex 연결 관리",
    exact: true,
  });
  await codexCard.getByText("연결에 실패했어요", { exact: true }).waitFor();
  assert.equal(
    await page.getByRole("heading", { name: "Codex", exact: true }).count(),
    1,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Codex 계정 연결", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await codexCard
      .getByRole("button", { name: "연결 해제", exact: true })
      .count(),
    1,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await codexCard.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve(screenshots, "provider-error.png"),
    fullPage: true,
  });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await codexCard.evaluate((el) => el.scrollWidth <= el.clientWidth),
      `provider card overflow ${width}`,
    );
  }
  await codexCard
    .getByRole("button", { name: "연결 해제", exact: true })
    .click();
  await codexCard
    .getByRole("button", { name: "Codex 계정 연결", exact: true })
    .waitFor();
  assert.equal(
    await codexCard.getByText("연결에 실패했어요", { exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("heading", { name: "Codex", exact: true }).count(),
    1,
  );
  console.log(
    "PASS one card per provider; failed Codex → disconnect → connect action without duplicate entry",
  );
  // Only provider pages are fixtures; the browser, Hanmadi API and polling run normally.
  loginFixture = true;
  await context.route("https://auth.openai.com/codex/device", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Codex device login fixture</h1>",
    }),
  );
  await context.route("https://claude.com/cai/oauth/authorize?**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Claude login fixture</h1>",
    }),
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: base,
  });
  await page.getByRole("checkbox").check();
  const popupEvent = context.waitForEvent("page");
  await codexCard
    .getByRole("button", { name: "Codex 계정 연결", exact: true })
    .click();
  const codexPopup = await popupEvent;
  await codexCard.getByText("공식 인증창을 준비하고 있어요…").waitFor();
  const currentConnection = () =>
    [...connections.values()].flat().find((c) => c.state === "authorizing");
  let authorizing = currentConnection();
  assert.equal(authorizing.provider, "codex");
  authorizing.challenge = {
    url: "https://auth.openai.com/codex/device",
    code: "TEST-1234",
    expiresAt: Date.now() / 1000 + 900,
  };
  await codexPopup.waitForURL(authorizing.challenge.url);
  await page.bringToFront();
  await codexCard.getByLabel("Codex 인증코드", { exact: true }).waitFor();
  await codexCard
    .getByRole("button", { name: "인증코드 복사", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => navigator.clipboard.readText()),
    "TEST-1234",
  );
  await codexCard.getByText("인증코드를 복사했어요.").waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await codexCard.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve(screenshots, "codex-authorizing.png"),
    fullPage: true,
  });
  authorizing.state = "connected";
  authorizing.models = ["test-model"];
  delete authorizing.challenge;
  await codexCard.getByText("연결됨", { exact: true }).waitFor();
  await page.getByRole("button", { name: /codex · test-model/ }).waitFor();
  assert.equal(
    await codexCard.getByRole("button", { name: /확인/ }).count(),
    0,
  );
  await codexPopup.close();
  await codexCard
    .getByRole("button", { name: "연결 해제", exact: true })
    .click();
  await codexCard
    .getByRole("button", { name: "Codex 계정 연결", exact: true })
    .waitFor();
  console.log(
    "PASS Codex click → delayed official popup → copy code → automatic connected/model state without confirmation",
  );
  const claudeCard = page.getByRole("region", {
    name: "Claude 연결 관리",
    exact: true,
  });
  const claudePopupEvent = context.waitForEvent("page");
  await claudeCard
    .getByRole("button", { name: "Claude 계정 연결", exact: true })
    .click();
  const claudePopup = await claudePopupEvent;
  await claudeCard.getByText("공식 인증창을 준비하고 있어요…").waitFor();
  authorizing = currentConnection();
  assert.equal(authorizing.provider, "claude");
  authorizing.challenge = {
    kind: "code-entry",
    url: claudeLoginUrl,
    code: "",
    expiresAt: Date.now() / 1000 + 900,
  };
  await claudePopup.waitForURL(claudeLoginUrl);
  await page.bringToFront();
  await claudeCard.getByLabel("2. Claude 승인코드", { exact: true }).waitFor();
  await claudeCard.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve(screenshots, "claude-authorizing.png"),
    fullPage: true,
  });
  await claudeCard
    .getByLabel("2. Claude 승인코드", { exact: true })
    .fill("wrong-code");
  await claudeCard
    .getByRole("button", { name: "승인코드로 연결", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "승인코드 전체를 붙여넣어" })
    .waitFor();
  assert.equal(
    await claudeCard
      .getByLabel("2. Claude 승인코드", { exact: true })
      .inputValue(),
    "",
  );
  const foreignGrant = await other.request.post(
    base + "/api/model-connections",
    {
      headers: { Origin: base },
      data: { action: "authorize", id: authorizing.id, code: nativeCode },
    },
  );
  assert.equal(foreignGrant.status(), 400);
  const grantCsrf = await context.request.post(
    base + "/api/model-connections",
    {
      headers: { Origin: "https://evil.test" },
      data: { action: "authorize", id: authorizing.id, code: nativeCode },
    },
  );
  assert.equal(grantCsrf.status(), 403);
  await claudeCard
    .getByLabel("2. Claude 승인코드", { exact: true })
    .fill(nativeCode);
  await claudeCard
    .getByRole("button", { name: "승인코드로 연결", exact: true })
    .click();
  await claudeCard
    .getByText(
      "인증 완료를 기다리고 있어요. 연결되면 모델 목록이 자동으로 나타나요.",
    )
    .waitFor();
  assert.equal(authorizing.challenge.submitted, true);
  assert.equal(
    await claudeCard
      .getByRole("button", { name: "승인코드로 연결", exact: true })
      .count(),
    0,
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    assert(
      await claudeCard.evaluate((el) => el.scrollWidth <= el.clientWidth),
      `Claude authorization overflow ${width}`,
    );
  }
  authorizing.state = "connected";
  authorizing.models = ["claude-test"];
  delete authorizing.challenge;
  await claudeCard.getByText("연결됨", { exact: true }).waitFor();
  await page.getByRole("button", { name: /claude · claude-test/ }).waitFor();
  authorizing.state = "error";
  authorizing.models = [];
  await claudeCard
    .getByRole("alert")
    .filter({ hasText: "연결에 실패했어요" })
    .waitFor();
  await claudePopup.close();
  await claudeCard
    .getByRole("button", { name: "연결 해제", exact: true })
    .click();
  await claudeCard
    .getByRole("button", { name: "Claude 계정 연결", exact: true })
    .waitFor();
  await page.getByRole("checkbox").uncheck();
  loginFixture = false;
  console.log(
    "PASS Claude native popup → invalid/valid code → automatic success/failure; subject isolation, CSRF, cleared codes",
  );
  assert.equal(
    await page.getByLabel("Claude API 키", { exact: true }).count(),
    0,
  );
  await page
    .getByRole("button", { name: "API 키로 연결", exact: true })
    .click();
  assert.equal(
    await page
      .getByRole("link", { name: /Claude Console에서 키 발급하기/ })
      .getAttribute("href"),
    "https://platform.claude.com/settings/keys",
  );
  assert(
    await page
      .getByRole("button", { name: "키 확인하고 연결", exact: true })
      .isDisabled(),
  );
  await page
    .getByLabel("Claude API 키", { exact: true })
    .fill("sk-ant-api-e2e-fixture-only");
  assert(
    await page
      .getByRole("button", { name: "키 확인하고 연결", exact: true })
      .isDisabled(),
  );
  await page.getByRole("checkbox").check();
  assert(
    await page
      .getByRole("button", { name: "키 확인하고 연결", exact: true })
      .isEnabled(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "키 확인하고 연결", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: resolve(screenshots, "claude-connect.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page
    .getByRole("button", { name: "API 키로 연결", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Claude API 키", { exact: true }).inputValue(),
    "",
  );
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page
    .getByRole("button", { name: "이전 화면으로", exact: true })
    .click();
  console.log(
    "PASS explicit login identity and Claude button → Console/key steps, consent and cancel clearing",
  );
  await page.getByRole("button", { name: "15분", exact: true }).click();
  await page.getByText("학습 설정을 저장했어요.", { exact: true }).waitFor();
  assert.equal((await state()).state.profiles.ja.minutes, 15);
  await page.locator(".hm-settings-levels button").nth(1).click();
  await page.waitForFunction(
    () =>
      document
        .querySelectorAll(".hm-settings-levels button")[1]
        .getAttribute("aria-pressed") === "true",
  );
  assert.equal((await state()).state.profiles.ja.level, 2);
  const autoSaveResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/study") &&
    response.request().method() === "POST" &&
    response.request().postDataJSON()?.action === "settings" &&
    response.request().postDataJSON()?.autoSave === true,
  );
  await page.getByRole("switch", { name: "번역 자동 학습" }).click();
  assert.equal((await autoSaveResponse).status(), 200);
  await page.waitForFunction(
    () =>
      document.querySelector('[role="switch"]').getAttribute("aria-checked") ===
      "true",
  );
  assert.equal((await state()).state.autoSave, true);
  await page.reload();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "15분", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page
      .locator(".hm-settings-levels button")
      .nth(1)
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.route("**/api/study", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.action === "settings" &&
      route.request().postDataJSON()?.language
    ) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "언어 저장 실패 테스트" }),
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "태국어", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "언어 저장 실패 테스트" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "일본어", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page.evaluate(() => localStorage.getItem("hanmadi:v2:language")),
    "ja",
  );
  await page.unroute("**/api/study");
  await page.getByRole("button", { name: "태국어", exact: true }).click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".hm-settings-languages button")]
        .find((el) => el.textContent === "태국어")
        .getAttribute("aria-pressed") === "true",
  );
  await page.getByRole("button", { name: "일본어", exact: true }).click();
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll(".hm-settings-languages button")]
        .find((el) => el.textContent === "일본어")
        .getAttribute("aria-pressed") === "true",
  );
  for (const [width, height] of [
    [320, 640],
    [360, 800],
    [390, 844],
    [768, 500],
    [1440, 900],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator(".hm-main").evaluate((el) => (el.scrollTop = 0));
    assert(
      await page
        .locator(".hm-main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      `settings overflow ${width}`,
    );
    const header = await page.locator(".hm-subheader").boundingBox();
    const main = await page.locator(".hm-main").boundingBox();
    const nav = await page.locator(".hm-bottom").boundingBox();
    assert(
      header.y + header.height <= main.y + 1 &&
        main.y + main.height <= nav.y + 1 &&
        nav.y + nav.height <= height + 1,
      `settings layout ${width}x${height}`,
    );
    if (width === 390) {
      await page.screenshot({
        path: resolve(screenshots, "settings.png"),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "로그아웃", exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(screenshots, "settings-bottom.png"),
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "연결·모델 선택" }).click();
    await page
      .getByRole("heading", { name: "내 AI 연결", exact: true })
      .waitFor();
    assert(
      await page
        .locator(".hm-main")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
      `AI settings overflow ${width}`,
    );
    if (width === 390)
      await page.screenshot({
        path: resolve(screenshots, "ai-settings.png"),
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "이전 화면으로", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "학습 설정", exact: true })
      .waitFor();
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  console.log(
    "PASS settings persistence, language rollback, AI return navigation, 320–1440px and short viewport layouts",
  );
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await page.getByRole("button", { name: "로그인", exact: true }).waitFor();
  assert.equal((await context.request.get(base + "/api/study")).status(), 401);
  assert.deepEqual(errors, []);
  console.log(
    "PASS responsive 360/390/768/1440, dialogs, logout, no browser exceptions",
  );
  const learnerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  assert.equal(
    (
      await post(
        {
          action: "signup",
          name: "learner-recast",
          password: "fixture-password-only",
        },
        learnerContext,
        "/api/study/account",
      )
    ).status,
    200,
  );
  for (const language of ["ja", "th", "en", "es"])
    await post(
      {
        action: "assess",
        language,
        answers: [0, 1, 2],
        confidence: 1,
        minutes: 10,
      },
      learnerContext,
    );
  await post({ action: "settings", language: "ja" }, learnerContext);
  await learnerContext.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "nextjs-portal { display:none !important; }";
    document.addEventListener(
      "DOMContentLoaded",
      () => document.head.append(style),
      { once: true },
    );
  });
  const learnerPage = await learnerContext.newPage();
  await learnerPage.goto(base + "/study");
  await learnerPage
    .getByRole("button", { name: "AI 대화", exact: true })
    .click();
  await learnerPage
    .getByLabel("말이 막히면 한국어로 도움 요청")
    .fill("한국에서 왔어요");
  await learnerPage
    .getByRole("button", { name: "보내기", exact: true })
    .click();
  const learnerCard = learnerPage.locator(".hm-chat-learner");
  await learnerCard
    .getByText("내 표현에 저장했어요 · 스터디에서 복습할 수 있어요.")
    .waitFor();
  assert.equal(
    await learnerCard.locator(".hm-native").innerText(),
    phrases.ja.text,
  );
  assert.equal(
    await learnerCard.locator(".hm-reading").innerText(),
    phrases.ja.reading,
  );
  const lines = await learnerCard
    .locator(".hm-expression > p")
    .allTextContents();
  assert.deepEqual(lines.slice(0, 3), [
    phrases.ja.text,
    phrases.ja.reading,
    phrases.ja.meaning,
  ]);
  await learnerCard.getByRole("button", { name: /들어보기/ }).waitFor();
  for (const width of [320, 390, 768]) {
    await learnerPage.setViewportSize({ width, height: 844 });
    assert(
      await learnerCard.evaluate((el) => el.scrollWidth <= el.clientWidth),
      `learner recast overflow ${width}`,
    );
  }
  await learnerPage.setViewportSize({ width: 390, height: 844 });
  await learnerCard.scrollIntoViewIfNeeded();
  await learnerPage.screenshot({
    path: resolve(screenshots, "learner-recast.png"),
  });
  let learnerState = (await state(learnerContext)).state;
  assert.equal(learnerState.expressions.length, 1);
  assert.equal(learnerState.expressions[0].source, "chat");
  assert.equal(learnerState.expressions[0].text, phrases.ja.text);
  assert.equal(
    learnerState.expressions[0].content,
    undefined,
    "raw conversation not persisted",
  );
  await learnerPage
    .getByRole("button", { name: "스터디", exact: true })
    .click();
  await learnerPage.getByText(phrases.ja.text, { exact: true }).waitFor();
  await learnerPage.reload();
  await learnerPage
    .getByRole("button", { name: "내 표현", exact: true })
    .click();
  await learnerPage.getByText(phrases.ja.text, { exact: true }).waitFor();
  const chatBody = (text, language = "ja") => ({
    action: "chat",
    language,
    scene: "cafe",
    messages: [{ role: "user", content: text }],
  });
  for (const language of ["ja", "th", "en", "es"]) {
    const response = await post(
      chatBody("한국에서 왔어요", language),
      learnerContext,
    );
    assert.equal(response.status, 200);
    assert.equal(response.data.learnerPhrase.text, phrases[language].text);
    assert.equal(response.data.learning, "saved");
  }
  assert.equal(
    (await state(learnerContext)).state.expressions.length,
    4,
    "same-language recast deduplicated",
  );
  assert(
    !(await state(other)).state.expressions.some(
      (e) => e.id === learnerState.expressions[0].id,
    ),
    "private expressions isolated by learner",
  );
  await learnerPage.getByRole("button", { name: "설정", exact: true }).click();
  await learnerPage
    .getByRole("switch", { name: "내 말 자동 학습", exact: true })
    .click();
  await learnerPage
    .getByRole("switch", {
      name: "내 말 자동 학습",
      exact: true,
      checked: false,
    })
    .waitFor();
  await learnerPage.reload();
  assert.equal((await state(learnerContext)).state.autoSaveChat, false);
  assert.equal(
    (await post(chatBody("한국에서 왔어요"), learnerContext)).data.learning,
    "disabled",
  );
  await post({ action: "settings", autoSaveChat: true }, learnerContext);
  const personal = await post(chatBody("현종이에요"), learnerContext);
  assert.equal(personal.data.learning, "not-reusable");
  const beforeThaiFailure = (await state(learnerContext)).state.expressions.length;
  const thaiMeaningFailure = await post(chatBody("얼음 없이 커피 한 잔 주세요.", "th"), learnerContext);
  assert.equal(thaiMeaningFailure.status,200);
  assert.equal(thaiMeaningFailure.data.learning,"unavailable");
  assert.equal(thaiMeaningFailure.data.learnerPhrase,null);
  assert(thaiMeaningFailure.data.reply.text);
  assert.equal((await state(learnerContext)).state.expressions.length,beforeThaiFailure);
  console.log("PASS incorrect Thai no-ice recast is withheld after repair failure; no bad study item is saved");
  const failure = await post(chatBody("변환실패"), learnerContext);
  assert.equal(failure.status, 200);
  assert.equal(failure.data.learning, "unavailable");
  assert(
    failure.data.reply.text,
    "AI reply survives learner conversion failure",
  );
  const control = await post(
    chatBody("짧은 인사와 예시부터 알려 주세요"),
    learnerContext,
  );
  assert.equal(control.data.learnerPhrase, null);
  assert.equal(control.data.learning, "not-needed");
  const offStarted = new Promise((r) => {
    slowStarted = r;
  });
  const inFlight = post(chatBody("SLOW 한국에서 왔어요"), learnerContext);
  await offStarted;
  await post({ action: "settings", autoSaveChat: false }, learnerContext);
  assert.equal(
    (await inFlight).data.learning,
    "disabled",
    "in-flight opt out respected",
  );
  await post({ action: "settings", autoSaveChat: true }, learnerContext);
  const deletionStarted = new Promise((r) => {
    slowStarted = r;
  });
  const duringDelete = post(chatBody("SLOW 한국에서 왔어요"), learnerContext);
  await deletionStarted;
  await post(
    { action: "delete", id: learnerState.expressions[0].id },
    learnerContext,
  );
  assert.equal(
    (await duringDelete).data.learning,
    "not-saved",
    "in-flight delete barrier respected",
  );
  assert(
    !(await state(learnerContext)).state.expressions.some(
      (e) => e.language === "ja",
    ),
  );
  await learnerContext.close();
  console.log(
    "PASS learner recast: 4 languages, three-line UI, study/reload, dedupe, isolation, opt-out, privacy, failure, deletion barriers",
  );
  await verifyLearning({
    adminPage,
    post,
    admin,
    other,
    base,
    screenshots,
    modelCalls,
  });
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
