/** Browser -> Next -> mock Dify regression; no production credentials or student data. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, symlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(join(tmpdir(), 'hanmadi-language-'));
const app = join(temp, 'app');
const origin = 'http://127.0.0.1:3190';
const requests = [];
const answers = { '일본어': 'こんにちは。\n한글 발음: 곤니치와\n뜻: 안녕하세요.', '태국어': 'สวัสดีค่ะ\n한글 발음: 싸왓디이 카\n뜻: 안녕하세요.', '한국어': '안녕하세요. 만나서 반가워요.' };
const mock = createServer(async (req, res) => {
  assert.equal(req.headers.authorization, 'Bearer language-smoke-only');
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); requests.push(body);
  assert.ok(answers[body.inputs.language]);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ answer: answers[body.inputs.language], conversation_id: body.conversation_id || randomUUID() }));
});
let child, browser;
async function cleanup() {
  await browser?.close(); browser = undefined;
  if (child && child.exitCode === null && child.signalCode === null) {
    const ended = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM'); await Promise.race([ended, delay(5000)]);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await ended; }
  }
  mock.closeAllConnections(); await new Promise(resolve => mock.close(resolve));
  rmSync(temp, { recursive: true, force: true });
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void cleanup().then(() => process.exit(0)));
try {
  cpSync(source, app, { recursive: true, filter: path => !relative(source, path).split(sep).some(part =>
    part.startsWith('.env') || ['node_modules', '.next', '.data', '.litellm', 'ops', '.vercel'].includes(part)) });
  symlinkSync(join(source, 'node_modules'), join(app, 'node_modules'), 'dir');
  mkdirSync(join(app, '.data'), { recursive: true });
  writeFileSync(join(app, '.data/tutors.json'), JSON.stringify({ 'hanmadi:students': {
    'private-student': JSON.stringify({ slug: 'private-student', name: 'Synthetic', tutorId: 'owner:Smoke', lessons: [] }),
    'other-student': JSON.stringify({ slug: 'other-student', name: 'Other synthetic', tutorId: 'owner:Other', lessons: [] }),
  } }));
  await new Promise((resolve, reject) => { mock.once('error', reject); mock.listen(4196, '127.0.0.1', resolve); });
  child = spawn(process.execPath, [join(app, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', '3190'], {
    cwd: app, stdio: 'inherit', env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
      TUTOR_PINS: 'Smoke:864209,Other:753108', AUTH_SECRET: 'isolated-language-flow-never-use-in-production', CONVERSATION_PROVIDER: 'dify',
      DIFY_BASE_URL: 'http://127.0.0.1:4196', DIFY_API_KEY: 'language-smoke-only', DIFY_USER_SECRET: 'isolated-language-flow-secret-not-production' },
  });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(origin + '/languages', { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch { /* Cold compilation. */ }
    if (child.exitCode !== null) break;
    await delay(1000);
  }
  assert.ok(ready, 'Next server did not start');
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const post = body => page.request.post(origin + '/api/learning-profile', { headers: { Origin: origin }, data: body });
  const unknown = { greeting: -1, meaning: -1, request: -1, past: -1, reason: -1, situation: -1 };
  const full = { greeting: 0, meaning: 1, request: 2, past: 0, reason: 1, situation: 2 };
  const profiles = {};
  async function login(pin = '864209') {
    await page.goto(origin + '/login');
    await page.getByPlaceholder('PIN', { exact: true }).fill(pin);
    await page.getByRole('button', { name: '열기', exact: true }).click();
    await page.waitForURL('**/languages**');
  }
  async function chat(text = '안녕하세요') {
    await page.locator('textarea').fill(text);
    const pending = page.waitForResponse(r => r.url().endsWith('/api/conversation') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    assert.equal((await pending).status(), 200);
    await page.getByRole('button', { name: '보내기', exact: true }).waitFor();
  }
  for (const [code, name, pronunciation, answers, level] of [
    ['th', '태국어', '싸왓디이', unknown, '입문'],
    ['ja', '일본어', '곤니치와', full, '중급 연습'],
    ['ko', '한국어', null, { ...full, reason: -1, situation: -1 }, '기초'],
  ]) {
    await login();
    await page.getByRole('button', { name: new RegExp(name + ' 시작하기') }).click();
    await page.waitForURL('**/assessment?**');
    assert.ok(page.url().includes('language=' + code));
    for (const [id, value] of Object.entries(answers)) await page.locator(`input[name="${id}"][value="${value}"]`).check();
    const pendingAssessment = page.waitForResponse(r => r.url().endsWith('/api/learning-profile') && r.request().method() === 'POST');
    await page.getByRole('button', { name: name + ' 시작 단계 확인', exact: true }).click();
    const assessment = await pendingAssessment; assert.equal(assessment.status(), 200);
    const result = await assessment.json(); profiles[code] = result.profile;
    assert.equal(result.profile.confirmed, false);
    assert.equal((await post({ action: 'feedback', language: code, assessmentId: result.profile.assessmentId, revision: result.profile.revision, difficulty: 'right' })).status(), 400);
    await page.getByRole('link', { name: '짧은 회화로 확인하기 →', exact: true }).click();
    await page.waitForURL('**/conversation?language=' + code);
    assert.ok((await page.locator('body').innerText()).includes('맞춤 난이도 · ' + level));
    assert.equal(await page.getByRole('button', { name: '적당해요', exact: true }).isEnabled(), false);
    await page.getByLabel('대화가 회화 서버에 저장되는 것에 동의해요.').check();
    if (await page.getByLabel('답변 자동 듣기').isEnabled()) await page.getByLabel('답변 자동 듣기').uncheck();
    await chat(); await chat('한 번 더 연습해요');
    assert.equal(requests.at(-1).inputs.language, name);
    assert.equal(requests.at(-1).inputs.level, ({ "기초": "초급", "중급 연습": "중급" })[level] ?? level);
    const pendingFeedback = page.waitForResponse(r => r.url().endsWith('/api/learning-profile') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '적당해요', exact: true }).click();
    const feedback = await pendingFeedback; assert.equal(feedback.status(), 200);
    profiles[code] = (await feedback.json()).profile;
    await page.getByRole('link', { name: '나의 학습 계획 보기 →', exact: true }).click();
    await page.waitForURL('**/learn?language=' + code);
    assert.ok(await page.getByRole('heading', { name: name + '로 한마디씩' }).isVisible());
    assert.ok(await page.getByRole('heading', { name: '오늘부터 1주 학습 계획' }).isVisible());
    if (pronunciation) assert.ok((await page.locator('body').innerText()).includes('한글 발음 · ' + pronunciation));
    if (code === 'ko') {
      const quizSaved = page.waitForResponse(r => r.url().endsWith('/api/learning-profile') && r.request().method() === 'POST');
      await page.getByRole('group', { name: '배운 표현 확인하기' }).getByRole('button').first().click();
      const quiz = await quizSaved; assert.equal(quiz.status(), 200);
      assert.ok((await quiz.json()).profile.completed.includes('greetings'));
    }
    await page.reload();
    assert.ok((await page.locator('body').innerText()).includes('나의 시작점 · ' + level));
    const cookie = (await context.cookies()).find(c => c.name === 'hanmadi_language');
    assert.equal(cookie.value, code); assert.equal(cookie.httpOnly, true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile viewport overflow');
    await page.goto(origin + '/conversation');
    assert.ok((await page.locator('body').innerText()).includes(name + ' · 인사와 자기소개'));
    // The server owns the level even if an old or modified client claims another one.
    const forged = await page.request.post(origin + '/api/conversation', { headers: { Origin: origin }, data: {
      language: code, lessonId: 'greetings', level: 'beginner', learningRevision: profiles[code].revision,
      storageConsent: true, messages: [{ role: 'user', content: '연습해요' }],
    } });
    assert.equal(forged.status(), 200); assert.equal(requests.at(-1).inputs.level, ({ "기초": "초급", "중급 연습": "중급" })[level] ?? level);
    await page.request.delete(origin + '/api/auth');
  }
  // First-attempt persistence, duplicate request idempotency, and invalid input.
  await login(); await page.getByRole('button', { name: /태국어 시작하기/ }).click();
  await page.waitForURL('**/learn?language=th');
  const th = profiles.th;
  const first = await post({ action: 'quiz', language: 'th', assessmentId: th.assessmentId, revision: th.revision, lessonId: 'cafe', answer: 1 });
  assert.equal(first.status(), 200);
  const firstResult = await first.json(); assert.equal(firstResult.saved, true);
  const duplicate = await post({ action: 'quiz', language: 'th', assessmentId: th.assessmentId, revision: th.revision, lessonId: 'cafe', answer: 0 });
  assert.equal((await duplicate.json()).saved, false);
  await page.reload(); assert.ok(await page.getByRole('heading', { name: '오늘부터 1주 학습 계획' }).isVisible());
  const bad = await post({ action: 'assess', language: 'th', answers: {}, minutes: 15, days: 5, timeZone: 'Asia/Seoul' });
  assert.equal(bad.status(), 400);
  const cross = await page.request.post(origin + '/api/learning-profile', { headers: { Origin: 'https://invalid.example' }, data: {} });
  assert.equal(cross.status(), 403);
  // Retaking Japanese resets only Japanese and rejects a stale conversation revision.
  const retake = await post({ action: 'assess', language: 'ja', answers: unknown, minutes: 10, days: 3, timeZone: 'Asia/Seoul' });
  assert.equal(retake.status(), 200); const retaken = await retake.json();
  assert.equal(retaken.profile.level, 'beginner'); assert.equal(retaken.profile.confirmed, false);
  const stale = await page.request.post(origin + '/api/conversation', { headers: { Origin: origin }, data: {
    language: 'ja', lessonId: 'greetings', level: 'intermediate', learningRevision: profiles.ja.revision, storageConsent: true, messages: [{ role: 'user', content: 'hello' }],
  } }); assert.equal(stale.status(), 409);
  await page.goto(origin + '/learn?language=ja'); await page.waitForURL('**/conversation?language=ja');
  await page.goto(origin + '/learn?language=th'); assert.ok(await page.getByRole('heading', { name: '오늘부터 1주 학습 계획' }).isVisible());
  // Explicit student scope never falls back to the tutor profile.
  const studentResult = await post({ action: 'assess', language: 'th', studentSlug: 'private-student', answers: full, minutes: 20, days: 7, timeZone: 'Asia/Seoul' });
  assert.equal(studentResult.status(), 200); assert.notEqual((await studentResult.json()).profile.assessmentId, th.assessmentId);
  const deniedStudent = await post({ action: 'assess', language: 'th', studentSlug: 'other-student', answers: full, minutes: 20, days: 7, timeZone: 'Asia/Seoul' });
  assert.equal(deniedStudent.status(), 403);
  await page.request.delete(origin + '/api/auth');
  await login('753108'); await page.getByRole('button', { name: /태국어 시작하기/ }).click();
  await page.waitForURL('**/assessment?**'); // Other account has no Thai profile.
  for (let i = 0; i < 11; i++) {
    const r = await post({ action: 'assess', language: 'th', answers: unknown, minutes: 10, days: 3, timeZone: 'Asia/Seoul' });
    assert.equal(r.status(), i < 10 ? 200 : 429);
  }
  await page.request.delete(origin + '/api/auth');
  assert.equal((await post({ action: 'assess', language: 'th', answers: full, minutes: 15, days: 5, timeZone: 'Asia/Seoul' })).status(), 401);
  // A stored private student link still grants only that student's learning scope.
  await page.goto(origin + '/conversation?s=private-student&language=th');
  assert.ok((await page.locator('body').innerText()).includes('맞춤 난이도 · 중급 연습'));
  const invalid = await page.request.post(origin + '/api/learning-language', { headers: { Origin: origin }, form: { language: 'xx' } });
  assert.equal(invalid.status(), 400);
  assert.deepEqual(errors, []);
  console.log('PASS: three-language assessment -> two real API turns -> feedback -> persistent plan; server-owned levels, retake isolation, stale revision rejection, first-attempt idempotency, actor/student isolation, mobile, auth and origin checks.');
  if (process.argv.includes('--serve')) { console.log('LANGUAGE_SMOKE_URL=' + origin + '/login (synthetic PIN 864209)'); await new Promise(() => {}); }
} finally { await cleanup(); }
