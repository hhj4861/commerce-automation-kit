import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright";
import { verifyYoutubeSearch } from "./youtube-search-e2e.mjs";

const socket = createServer().listen(0, "127.0.0.1");
await once(socket, "listening");
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const dir = await mkdtemp(join(tmpdir(), "hanmadi-admin-e2e-"));
const secret = "admin-surface-fixture-secret";
const revision = "b".repeat(40);
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "development",
      HANMADI_DEPLOYMENT: "admin",
      HANMADI_RELEASE_SHA: revision,
      HANMADI_APP_URL: "https://hanmadi-lake.vercel.app",
      TUTOR_PINS: "owner:654321",
      AUTH_SECRET: secret,
      HANMADI_LOCAL_DATA_FILE: join(dir, "store.json"),
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
      KV_REST_API_URL: "",
      KV_REST_API_TOKEN: "",
      YOUTUBE_API_KEY: "fixture-youtube-key",
      LITELLM_BASE_URL: "",
      LITELLM_API_KEY: "",
    },
  },
);
let logs = "";
for (const stream of [child.stdout, child.stderr])
  stream.on("data", (data) => {
    logs = (logs + data).slice(-12000);
  });
let browser;
try {
  for (let i = 0; ; i++) {
    try {
      if ((await fetch(`${origin}/api/deployment`)).ok) break;
    } catch {}
    if (i >= 90 || child.exitCode !== null)
      throw new Error("Admin test server did not start");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.deepEqual(await (await fetch(`${origin}/api/deployment`)).json(), {
    application: "hanmadi-admin",
    revision,
  });
  assert.equal((await fetch(`${origin}/api/study/admin`)).status, 403);
  assert.equal(
    (
      await fetch(`${origin}/api/study/admin/videos`, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          ids: ["abcdefghijk"],
          language: "ja",
          scene: "cafe",
          level: 1,
        }),
      })
    ).status,
    403,
  );
  assert.equal((await fetch(`${origin}/api/study`)).status, 404);
  assert.equal((await fetch(`${origin}/api/study/account/google`)).status, 404);
  assert.equal((await fetch(`${origin}/api/study/account/google`, { method: "POST" })).status, 404);
  assert.equal(
    (await fetch(`${origin}/api/register`, { method: "POST" })).status,
    404,
  );
  const payload = Buffer.from(
    JSON.stringify({
      n: "guest",
      tid: "tutor-fixture",
      r: "tutor",
      t: Date.now(),
    }),
  ).toString("base64url");
  const cookie = `hanmadi_tutor=${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
  assert.equal(
    (await fetch(`${origin}/api/study/admin`, { headers: { cookie } })).status,
    403,
  );
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? { channel: process.env.PLAYWRIGHT_CHANNEL }
      : {}),
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(origin);
  await page.getByRole("heading", { name: "Hanmadi Admin" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/admin-login");
  await page.getByLabel("관리자 PIN").fill("654321");
  await page.getByRole("button", { name: "관리자 로그인" }).click();
  await page.getByRole("navigation", { name: "관리자 메뉴" }).waitFor();
  assert.equal(new URL(page.url()).pathname, "/study/admin");
  const prepared = await page.request.post(`${origin}/api/study/admin/videos`, {
    headers: { Origin: origin },
    data: {
      action: "prepare",
      ids: ["abcdefghijk"],
      language: "ja",
      scene: "cafe",
      level: 1,
    },
  });
  assert.equal(
    prepared.status(),
    200,
    "admin deployment allows owner-only video jobs",
  );
  assert.match(await page.title(), /Hanmadi Admin/);
  assert.equal(
    await page.getByRole("link", { name: "학습 앱 열기" }).getAttribute("href"),
    "https://hanmadi-lake.vercel.app/study",
  );
  assert.equal(
    (await page.request.get(`${origin}/api/study/admin`)).status(),
    200,
  );
  assert.equal(
    (await page.request.get(`${origin}/api/study/admin/learning`)).status(),
    200,
  );
  assert.equal((await page.request.get(`${origin}/study`)).status(), 404);
  const screenshots = resolve(
    process.env.HANMADI_E2E_SCREENSHOTS || ".next/admin-deployment-evidence",
  );
  await mkdir(screenshots, { recursive: true });
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: join(screenshots, `admin-${width}.png`),
    });
  }
  await verifyYoutubeSearch({
    adminPage: page,
    admin: page.context(),
    screenshots,
    post: async (body, context, path) => {
      if (context) {
        const response = await context.request.post(origin + path, {
          headers: { Origin: origin },
          data: body,
        });
        return { status: response.status(), data: await response.json() };
      }
      const response = await fetch(origin + path, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    },
  });
  console.log(
    "Admin deployment E2E passed: dedicated login, owner-only APIs, learner route isolation, app link, responsive layouts, release identity.",
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  await browser?.close();
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  await Promise.race([
    once(child, "exit"),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {}
  await rm(dir, { recursive: true, force: true });
}
