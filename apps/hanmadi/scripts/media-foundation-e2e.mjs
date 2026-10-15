// Real Next UI/API/file persistence. Only existing YouTube metadata is a fixture; no provider/LLM calls.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const dir = process.env.HANMADI_E2E_ARTIFACTS;
assert(dir, 'Set a fresh HANMADI_E2E_ARTIFACTS'); await mkdir(dir, { recursive: true });
const dataFile = resolve(dir, 'store.json'); await writeFile(dataFile, '{}', { flag: 'wx' });
const preload = resolve(dir, 'offline-fixture.cjs');
await writeFile(preload, `const original=globalThis.fetch;globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input.url||String(input));if(u.hostname==='www.googleapis.com'&&u.pathname==='/youtube/v3/videos')return Promise.resolve(Response.json({items:[{id:u.searchParams.get('id'),snippet:{title:'Existing music fixture',channelTitle:'Own fixtures',liveBroadcastContent:'none'},contentDetails:{duration:'PT3M',caption:'false'},status:{privacyStatus:'public',embeddable:true}}]}));if(!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw new Error('Unexpected external fetch: '+u.hostname);return original(input,init);};`);
const probe = createServer().listen(0, '127.0.0.1'); await once(probe, 'listening'); const port = probe.address().port; await new Promise(r => probe.close(r));
const base = `http://127.0.0.1:${port}`, secret = 'media-local-fixture-secret';
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(preload)}`, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', HANMADI_DEPLOYMENT: 'admin', HANMADI_LOCAL_DATA_FILE: dataFile,
    AUTH_SECRET: secret, TUTOR_PINS: 'owner:654321', UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', KV_REST_API_URL: '', KV_REST_API_TOKEN: '',
    YOUTUBE_API_KEY: 'fixture', LITELLM_BASE_URL: '', LITELLM_API_KEY: '', HANMADI_JEV_API_KEY: '', ELEVENLABS_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
});
const exit = once(app, 'exit'); let logs = '', browser, page;
app.stdout.on('data', b => { logs += b; }); app.stderr.on('data', b => { logs += b; });
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(base + '/api/deployment')).ok) break; } catch {}
    if (i >= 120 || app.exitCode !== null) throw new Error('Next server did not start'); await new Promise(r => setTimeout(r, 500));
  }
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), headless: true });
  const context = await browser.newContext({ viewport: { width: 1120, height: 1000 } });
  const payload = Buffer.from(JSON.stringify({ n: 'owner', tid: 'owner:owner', r: 'owner', t: Date.now() })).toString('base64url');
  await context.addCookies([{ name: 'hanmadi_tutor', value: `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`, url: base }]);
  const endpoint = base + '/api/study/admin/media';
  assert.equal((await fetch(endpoint)).status, 403);
  assert.equal((await context.request.post(endpoint, { headers: { Origin: 'https://wrong.test' }, data: { action: 'collect' } })).status(), 403);
  assert.equal((await context.request.post(endpoint, { headers: { Origin: base }, data: { action: 'collect', video: 'https://localhost/private', title: 'bad', language: 'en', purposes: ['study'] } })).status(), 400);
  assert.equal((await context.request.post(endpoint, { headers: { Origin: base }, data: { raw: 'a'.repeat(65000) } })).status(), 413);
  const legacy = await context.request.post(base + '/api/study/admin/music', { headers: { Origin: base }, data: { action: 'collection-add', video: 'abcdefghijk', language: 'en' } }); assert.equal(legacy.status(), 200);
  page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  async function open() { await page.goto(base + '/study/admin'); await page.getByRole('button', { name: '원문·작업', exact: true }).click(); await page.getByRole('heading', { name: '원문과 처리 이력을 한곳에서' }).waitFor(); }
  async function storeSource(raw) {
    await page.getByLabel('보관할 원문', { exact: true }).fill(raw);
    await page.getByLabel('원문 보관·학습 이용 근거', { exact: true }).fill('Self authored local test; no external content');
    await page.getByLabel('이 원문을 보관하고 학습 자료 제작에 이용할 권한을 확인했어요.').check();
    await page.getByRole('button', { name: '새 원문 버전 저장', exact: true }).click();
  }
  const rows = { en: ['Good morning', 'Hello my friend'], ja: ['おはようございます', '今日も一緒に学ぼう'], th: ['สวัสดีตอนเช้า', 'มาเรียนด้วยกัน'], es: ['Buenos días', 'Vamos a aprender juntos'] };
  const saved = [];
  for (const [language, lines] of Object.entries(rows)) {
    await open(); await page.getByText('새 원본 등록', { exact: true }).click();
    await page.getByLabel('원본 제목', { exact: true }).fill(`Source ${language}`); await page.getByLabel('YouTube 링크 또는 ID').fill(`${language}123456789`);
    await page.getByLabel('원문 언어', { exact: true }).selectOption(language); await page.getByLabel('학습 용도', { exact: true }).selectOption('both');
    await page.getByRole('button', { name: '원본 등록', exact: true }).click(); await page.getByRole('heading', { name: `Source ${language}`, exact: true }).waitFor();
    if (language === 'en') {
      await storeSource('WEBVTT\n\n00:00:03.000 --> 00:00:01.000\nWrong\n\n00:00:04.000 --> 00:00:06.000\nSecond');
      await page.getByRole('button', { name: '정리·재개', exact: true }).click();
      await page.getByRole('heading', { name: /버전 1 · 처리 실패/ }).waitFor();
      await page.screenshot({ path: resolve(dir, 'failed-source.png'), fullPage: true });
    }
    const version = language === 'en' ? 2 : 1;
    await storeSource(lines.join('\n'));
    const job = page.getByRole('article', { name: `원문 버전 ${version} 작업`, exact: true });
    await job.getByRole('button', { name: '정리·재개', exact: true }).click();
    await job.getByRole('heading', { name: `버전 ${version} · 원문 정리 완료`, exact: true }).waitFor();
    await job.getByText('정리된 2개 줄 · 읽기용 · 구간 재생 미준비', { exact: true }).click();
    assert(await job.getByText(lines[1], { exact: true }).isVisible());
    await page.screenshot({ path: resolve(dir, `${language}-ready.png`), fullPage: true }); saved.push({ language, version, lines });
  }
  await open(); await page.getByText('기존 음악 수집함 연결', { exact: true }).click(); await page.getByRole('button', { name: '영상 정보 연결', exact: true }).click();
  await page.getByRole('heading', { name: 'Existing music fixture', exact: true }).waitFor();
  const list = await (await context.request.get(endpoint)).json(); assert.equal(list.sources.length, 5); assert.equal(JSON.stringify(list).includes('Good morning'), false);
  const imported = list.sources.find(s => s.videoId === 'abcdefghijk'); assert.equal(imported.originalCount, 0);
  const legacyAfter = await (await context.request.get(base + '/api/study/admin/music')).json(); assert.equal(legacyAfter.collection.length, 1); assert.equal(legacyAfter.collection[0].source, undefined);
  const english = list.sources.find(s => s.language === 'en' && s.videoId !== 'abcdefghijk');
  const duplicate = await context.request.post(endpoint, { headers: { Origin: base }, data: { action: 'save-source', id: english.id, revision: 0, raw: 'wrong\nversion', rights: 'Self authored local fixture', confirmed: true, requestId: 'stale-request' } }); assert.equal(duplicate.status(), 409);
  await open(); await page.getByRole('button', { name: 'Source en · 영어', exact: true }).click();
  await page.getByRole('heading', { name: '버전 2 · 원문 정리 완료', exact: true }).waitFor();
  const restored = await (await context.request.get(endpoint + '?id=' + english.id)).json();
  assert.equal(restored.source.originals.length, 2); assert.equal(restored.jobs[0].status, 'failed'); assert.equal(restored.jobs[1].status, 'ready');
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile page should not overflow');
  await page.screenshot({ path: resolve(dir, 'mobile-restored.png'), fullPage: true });
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: '공통 원문·작업 삭제', exact: true }).click();
  await page.getByText('공통 원문과 작업 이력을 삭제했어요.', { exact: true }).waitFor();
  assert.equal((await context.request.get(endpoint + '?id=' + english.id)).status(), 404);
  const storeText = await readFile(dataFile, 'utf8'); assert(!storeText.includes('Good morning')); assert(!storeText.includes('Wrong'));
  assert.equal(errors.length, 0, errors.join('\n')); assert(!logs.includes('Unexpected external fetch'), 'No unexpected external call');
  await writeFile(resolve(dir, 'result.json'), JSON.stringify({ status: 'pass', layers: ['Next UI', 'real API', 'file persistence'], languages: saved, authorization: 'owner/origin checked', legacy: 'metadata import only; unchanged collection', externalModelCalls: 0, microphoneOrLearningE2E: false }, null, 2));
  console.log('PASS: four-language source/job UI, real API/store, failures, reload, conflict, deletion and mobile');
} catch (error) {
  if (page) await page.screenshot({ path: resolve(dir, 'failure.png'), fullPage: true }).catch(() => {});
  throw error;
} finally {
  if (browser) await browser.close(); app.kill('SIGTERM'); await Promise.race([exit, new Promise(r => setTimeout(r, 5000))]);
  if (app.exitCode === null) app.kill('SIGKILL'); await writeFile(resolve(dir, 'server.log'), logs);
}
