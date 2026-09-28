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
  if (req.url === '/v1/audio/transcriptions') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ text: 'สวัสดีค่ะ' }));
  }
  if (req.url === '/v1/audio/speech') {
    const wav = Buffer.alloc(44 + 8820);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
    wav.write('data', 36); wav.writeUInt32LE(8820, 40);
    res.setHeader('content-type', 'audio/wav'); return res.end(wav);
  }
  const body = JSON.parse(raw); requests.push(body);
  assert.ok(answers[body.inputs.language]);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ answer: body.query === '긴 답변 테스트' ? '**첫 문장**\n' + '긴 답변 연습입니다.\n'.repeat(40) + '<img src=x onerror=alert(1)>' : answers[body.inputs.language], conversation_id: body.conversation_id || randomUUID() }));
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
      LITELLM_BASE_URL: 'http://127.0.0.1:4196/v1', LITELLM_API_KEY: 'language-smoke-only', LITELLM_STT_MODEL: 'mock-stt', LITELLM_TTS_MODEL: 'mock-tts', LITELLM_TTS_VOICE: 'mock-voice',
      DIFY_BASE_URL: 'http://127.0.0.1:4196', DIFY_API_KEY: 'language-smoke-only', DIFY_USER_SECRET: 'isolated-language-flow-secret-not-production' },
  });
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(origin + '/languages', { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch { /* Cold compilation. */ }
    if (child.exitCode !== null) break;
    await delay(1000);
  }
  assert.ok(ready, 'Next server did not start');
  browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  async function screenshot(name) {
    if (!process.env.HANMADI_QA_OUTPUT) return;
    mkdirSync(process.env.HANMADI_QA_OUTPUT, { recursive: true });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ style: 'nextjs-portal { display: none; }', path: join(process.env.HANMADI_QA_OUTPUT, '20260928-ux-' + name + '.png'), fullPage: true, caret: 'initial' });
  }
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error' && /hydrated|hydration/i.test(message.text())) errors.push(message.text()); });
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
    if (code === 'th') await screenshot('assessment-mobile');
    assert.equal(await page.locator('main').count(), 1, 'one main landmark');
    assert.equal(await page.locator('fieldset').count(), 1, 'one question at a time');
    assert.equal(await page.getByRole('button', { name: '다음', exact: true }).isEnabled(), false);
    for (const [id, value] of Object.entries(answers)) {
      await page.locator(`input[name="${id}"][value="${value}"]`).check();
      if (id === 'greeting') {
        await page.reload();
        await page.locator(`input[name="${id}"][value="${value}"]:checked`).waitFor();
      }
      await page.getByRole('button', { name: '다음', exact: true }).click();
      await page.waitForFunction(() => document.activeElement === document.querySelector('h2'));
    }
    await page.getByRole('button', { name: '이전', exact: true }).click();
    assert.ok(await page.locator(`input[name="situation"][value="${answers.situation}"]`).isChecked());
    await page.getByRole('button', { name: '다음', exact: true }).click();
    if (code === 'th') {
      await page.route('**/api/learning-profile', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic outage' }) }), { times: 1 });
      await page.getByRole('button', { name: name + ' 시작 단계 확인', exact: true }).click();
      await page.locator('p[role=alert]').waitFor();
      assert.ok(await page.getByRole('button', { name: name + ' 시작 단계 확인', exact: true }).isEnabled());
    }
    const pendingAssessment = page.waitForResponse(r => r.url().endsWith('/api/learning-profile') && r.request().method() === 'POST');
    await page.getByRole('button', { name: name + ' 시작 단계 확인', exact: true }).click();
    const assessment = await pendingAssessment; assert.equal(assessment.status(), 200);
    const result = await assessment.json(); profiles[code] = result.profile;
    assert.equal(result.profile.confirmed, false);
    assert.equal((await post({ action: 'feedback', language: code, assessmentId: result.profile.assessmentId, revision: result.profile.revision, difficulty: 'right' })).status(), 400);
    await page.reload(); // Saved assessment resumes instead of starting over.
    await page.getByRole('link', { name: '짧은 회화로 확인하기 →', exact: true }).click();
    await page.waitForURL('**/conversation?language=' + code);
    assert.ok((await page.locator('body').innerText()).includes('맞춤 난이도 · ' + level));
    assert.equal(await page.getByRole('button', { name: '적당해요', exact: true }).isEnabled(), false);
    await page.getByLabel('대화가 회화 서버에 저장되는 것에 동의해요.').check();
    if (await page.getByLabel('답변 자동 듣기').isEnabled()) await page.getByLabel('답변 자동 듣기').uncheck();
    if (code === 'th') {
      await page.locator('textarea').fill('아직 보내지 않은 문장');
      await page.reload();
      await page.waitForFunction(() => document.querySelector('textarea')?.value === '아직 보내지 않은 문장');
      assert.equal(await page.getByLabel('답변 자동 듣기').isChecked(), false, 'listening preference survives reload');
      await page.route('**/api/conversation', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '잠시 후 다시 보내 주세요.' }) }), { times: 1 });
      await page.getByRole('button', { name: '보내기', exact: true }).click();
      await page.locator('p[role=alert]').waitFor();
      assert.equal(await page.locator('textarea').inputValue(), '아직 보내지 않은 문장');
    }
    if (code === 'th') {
      await page.evaluate(() => {
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async constraints => {
          navigator.mediaDevices.getUserMedia = original;
          throw new DOMException('Synthetic denial', 'NotAllowedError');
        };
      });
      await page.getByRole('button', { name: '마이크로 말하기', exact: true }).click();
      await page.getByText(/마이크를 사용할 수 없어요/).waitFor();
      assert.ok(await page.locator('textarea').isEnabled());
      await page.getByRole('button', { name: '마이크로 말하기', exact: true }).click();
      await page.getByRole('button', { name: '녹음 끝내고 문장 확인', exact: true }).waitFor();
      await delay(300);
      await page.getByRole('button', { name: '녹음 끝내고 문장 확인', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('textarea')?.value === 'สวัสดีค่ะ');
    }
    await chat();
    await page.reload();
    await page.getByRole('log').getByText('한마디 AI', { exact: true }).waitFor();
    if (await page.getByLabel('답변 자동 듣기').isEnabled()) await page.getByLabel('답변 자동 듣기').uncheck();
    if (code === 'th') {
      const speech = page.waitForResponse(r => r.url().endsWith('/api/conversation/speech'));
      await page.getByRole('button', { name: '마지막 답변 다시 듣기', exact: true }).click();
      assert.equal((await speech).status(), 200);
    }
    await chat('한 번 더 연습해요');
    assert.ok(requests.at(-1).conversation_id, 'server conversation continues after reload');
    await page.getByRole('button', { name: '새 대화', exact: true }).click();
    await page.getByRole('button', { name: '계속 이어가기', exact: true }).click();
    assert.equal(await page.getByRole('log').getByText('한마디 AI', { exact: true }).count(), 2);
    assert.equal(requests.at(-1).inputs.language, name);
    assert.equal(requests.at(-1).inputs.level, ({ "기초": "초급", "중급 연습": "중급" })[level] ?? level);
    if (code === 'th') await screenshot('conversation-mobile');
    const pendingFeedback = page.waitForResponse(r => r.url().endsWith('/api/learning-profile') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '적당해요', exact: true }).click();
    const feedback = await pendingFeedback; assert.equal(feedback.status(), 200);
    profiles[code] = (await feedback.json()).profile;
    if (code === 'ja') {
      await page.getByRole('button', { name: '새 난이도로 계속 대화하기', exact: true }).click();
      await page.getByText('오늘의 난이도 피드백이 저장됐어요. 다음 피드백은 내일 남길 수 있어요.').waitFor();
      assert.ok(await page.locator('textarea').isEnabled());
      await page.getByRole('link', { name: '연습하던 수업으로 돌아가기', exact: true }).click();
    } else await page.getByRole('link', { name: '나의 학습 계획 보기 →', exact: true }).click();
    await page.waitForURL(url => url.pathname === '/learn' && url.searchParams.get('language') === code);
    assert.ok(await page.getByRole('heading', { name: name + '로 한마디씩' }).isVisible());
    assert.ok(await page.getByRole('heading', { name: '오늘부터 1주 학습 계획' }).isVisible());
    if (code === 'th') {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await screenshot('plan-mobile');
      await page.setViewportSize({ width: 1280, height: 900 }); await screenshot('plan-desktop');
      await page.setViewportSize({ width: 390, height: 844 });
    }
    if (pronunciation) assert.ok((await page.locator('body').innerText()).includes('한글 발음 · ' + pronunciation));
    if (code === 'ko') {
      const quizSaved = page.waitForResponse(r => r.url().endsWith('/api/learning-profile') && r.request().method() === 'POST');
      await page.getByRole('group', { name: '배운 표현 확인하기' }).getByRole('button').first().click();
      const quiz = await quizSaved; assert.equal(quiz.status(), 200);
      assert.ok((await quiz.json()).profile.completed.includes('greetings'));
    }
    if (code === 'th') {
      const settings = page.getByText('학습 시간 변경', { exact: true });
      await settings.click();
      await page.getByLabel('하루 학습 시간').selectOption('10');
      await page.getByLabel('주간 학습 횟수').selectOption('3');
      const saved = page.waitForResponse(r => r.url().endsWith('/api/learning-profile') && r.request().method() === 'POST');
      await page.getByRole('button', { name: '시간 저장', exact: true }).click();
      const result = await (await saved).json();
      assert.equal(result.profile.assessmentId, profiles.th.assessmentId);
      assert.equal(result.profile.confirmed, true); assert.equal(result.profile.minutes, 10);
      assert.equal(result.plan.length, 3);
      await page.getByRole('navigation', { name: '수업 선택' }).getByRole('link').nth(1).click();
      await page.waitForURL('**/learn?language=th&lesson=cafe#lesson');
      await page.reload();
      assert.ok(await page.getByRole('navigation', { name: '수업 선택' }).getByRole('link').nth(1).getAttribute('aria-current'));
      await page.getByRole('link', { name: '이 주제로 AI와 대화하기', exact: true }).click();
      await page.waitForURL('**/conversation?language=th&lesson=cafe');
      assert.equal(await page.getByRole('log').getByText('한마디 AI', { exact: true }).count(), 0, 'another topic has its own history');
      await page.getByRole('link', { name: '연습하던 수업으로 돌아가기', exact: true }).click();
      await page.waitForURL('**/learn?language=th&lesson=cafe#lesson');
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
  assert.equal((await post({ action: 'settings', language: 'th', assessmentId: th.assessmentId, revision: th.revision, minutes: 99, days: 3 })).status(), 400);
  await page.getByRole('link', { name: '레벨 다시 체크', exact: true }).click();
  await page.getByRole('button', { name: '문제부터 다시 체크하기', exact: true }).click();
  await page.locator('input[name=greeting][value="-1"]').check();
  await page.reload();
  await page.locator('input[name=greeting][value="-1"]:checked').waitFor();
  await page.goto(origin + '/learn?language=th'); // An unfinished retake must not reset the confirmed profile.
  await page.getByRole('heading', { name: '오늘부터 1주 학습 계획' }).waitFor();
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
  assert.equal(await page.locator('input:checked').count(), 0, 'other accounts cannot see a saved draft');
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
  // A long model reply must keep its beginning visible and never become HTML.
  await page.getByLabel('대화가 회화 서버에 저장되는 것에 동의해요.').check();
  await page.getByLabel('답변 자동 듣기').uncheck();
  await chat('긴 답변 테스트');
  assert.equal(await page.getByRole('log').locator('img').count(), 0);
  assert.equal(await page.getByRole('log').locator('strong').innerText(), '첫 문장');
  assert.ok(await page.getByRole('log').evaluate(el => {
    const reply = el.querySelector('[data-last-reply]').getBoundingClientRect();
    return Math.abs(reply.top - el.getBoundingClientRect().top - 20) < 4;
  }), 'long reply starts at top of scroll pane');
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width} ${colorScheme} overflow`);
      await page.locator('textarea').fill('대비 확인');
      const contrast = await page.getByRole('button', { name: '보내기', exact: true }).evaluate(el => {
        const luminance = rgb => {
          const values = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
          return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
        };
        const style = getComputedStyle(el), a = luminance(style.color), b = luminance(style.backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      });
      assert.ok(contrast >= 4.5, `button contrast ${contrast}`);
    }
  }
  await page.getByRole('button', { name: '새 대화', exact: true }).click();
  await page.getByRole('button', { name: '비우고 시작', exact: true }).click();
  assert.equal(await page.locator('textarea').inputValue(), '');
  assert.equal(await page.getByRole('log').getByText('한마디 AI', { exact: true }).count(), 0);
  // Storage restrictions must not make the composer or wizard unusable.
  const noStorage = await context.newPage();
  noStorage.on('pageerror', e => errors.push(e.message));
  await noStorage.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Synthetic quota', 'QuotaExceededError'); };
  });
  await noStorage.goto(origin + '/conversation?s=private-student&language=th');
  await noStorage.locator('textarea').fill('저장 제한에서도 입력 유지');
  assert.equal(await noStorage.locator('textarea').inputValue(), '저장 제한에서도 입력 유지');
  await noStorage.getByText(/이 브라우저에서는 임시 저장이 안 돼요/).waitFor();
  await noStorage.close();
  assert.deepEqual(errors, []);
  console.log('PASS: three-language assessment -> two real API turns -> feedback -> persistent plan; server-owned levels, retake isolation, stale revision rejection, first-attempt idempotency, actor/student isolation, mobile/desktop/light/dark, draft recovery, goal edits, lesson navigation, failed-save retry, fake-microphone denial/recovery, audio replay, long replies, auth and origin checks.');
  if (process.argv.includes('--serve')) { console.log('LANGUAGE_SMOKE_URL=' + origin + '/login (synthetic PIN 864209)'); await new Promise(() => {}); }
} finally { await cleanup(); }
