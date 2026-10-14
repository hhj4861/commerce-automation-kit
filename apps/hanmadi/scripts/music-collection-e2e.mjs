// Local integration: real Next routes/store/UI; official YouTube HTTP responses are fixtures.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
const dir = process.env.HANMADI_E2E_ARTIFACTS;
assert(dir, 'Set a fresh HANMADI_E2E_ARTIFACTS directory'); await mkdir(dir, { recursive: true });
const dataFile = resolve(dir, 'store.json'); await writeFile(dataFile, '{}', { flag: 'wx' });
const id = 'abcdefghijk', secondId = 'xyzabcdefgh';
const subtitle = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nGood morning\n\n00:00:04.000 --> 00:00:06.000\nHello my friend';
let denied = true, searches = 0, downloads = 0;
const provider = createServer(async (req, res) => {
  for await (const chunk of req) void chunk;
  const u = new URL(req.url, 'http://fixture.test'); res.setHeader('Content-Type', 'application/json');
  if (u.pathname === '/token') return res.end(JSON.stringify({ access_token: 'fixture-access' }));
  if (u.pathname === '/youtube/v3/search') {
    searches++; assert.equal(u.searchParams.get('videoCategoryId'), '10'); assert.equal(u.searchParams.get('videoEmbeddable'), 'true');
    const more = u.searchParams.has('pageToken');
    return res.end(JSON.stringify({ items: [{ id: { videoId: more ? secondId : id }, snippet: { title: more ? 'Second original song' : 'Morning original song', channelTitle: 'Hanmadi fixture' } }], ...(!more ? { nextPageToken: 'PAGE2' } : {}) }));
  }
  if (u.pathname === '/youtube/v3/videos') return res.end(JSON.stringify({ items: [{ id: u.searchParams.get('id'), snippet: { title: u.searchParams.get('id') === id ? 'Morning original song' : 'Second original song', channelTitle: 'Hanmadi fixture', liveBroadcastContent: 'none' }, contentDetails: { duration: 'PT3M', caption: 'true' }, status: { privacyStatus: 'public', embeddable: true } }] }));
  if (u.pathname.startsWith('/youtube/v3/captions')) {
    assert.equal(req.headers.authorization, 'Bearer fixture-access');
    if (denied) { res.statusCode = 403; return res.end(JSON.stringify({ error: { errors: [{ reason: 'forbidden' }] } })); }
    if (u.pathname.endsWith('/captions')) return res.end(JSON.stringify({ items: [{ id: 'track', snippet: { videoId: id, language: 'en', name: 'Original captions', status: 'serving', trackKind: 'standard' } }] }));
    downloads++; res.setHeader('Content-Type', 'text/vtt'); return res.end(subtitle);
  }
  res.statusCode = 500; res.end('{}');
});
provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
const preload = resolve(dir, 'youtube-fixture.cjs');
await writeFile(preload, `const original=globalThis.fetch; globalThis.fetch=(input,init)=>{const u=new URL(typeof input==='string'?input:input.url||String(input));if(['www.googleapis.com','oauth2.googleapis.com'].includes(u.hostname)){u.protocol='http:';u.host='127.0.0.1:${provider.address().port}';return original(u,init);}return original(input,init);};`);
const probe = createServer().listen(0, '127.0.0.1'); await once(probe, 'listening'); const port = probe.address().port; await new Promise(r => probe.close(r));
const base = `http://127.0.0.1:${port}`, secret = 'music-collection-local-fixture-secret';
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, NODE_OPTIONS: `--require ${JSON.stringify(preload)}`, NODE_ENV: 'development', HANMADI_DEPLOYMENT: '', HANMADI_LOCAL_DATA_FILE: dataFile, AUTH_SECRET: secret, TUTOR_PINS: 'owner:654321',
    UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', KV_REST_API_URL: '', KV_REST_API_TOKEN: '',
    YOUTUBE_API_KEY: 'fixture-key', YOUTUBE_CAPTIONS_CLIENT_ID: 'fixture-client', YOUTUBE_CAPTIONS_CLIENT_SECRET: 'fixture-secret', YOUTUBE_CAPTIONS_REFRESH_TOKEN: 'fixture-refresh',
    LITELLM_BASE_URL: '', LITELLM_API_KEY: '', HANMADI_JEV_API_KEY: '', ELEVENLABS_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
});
const exit = once(app, 'exit'); let logs = '', browser, page;
app.stdout.on('data', b => { logs += b; }); app.stderr.on('data', b => { logs += b; });
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(base + '/study')).ok) break; } catch {}
    if (i >= 120 || app.exitCode !== null) throw new Error('Test server did not start'); await new Promise(r => setTimeout(r, 500));
  }
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), headless: true });
  const owner = await browser.newContext({ viewport: { width: 1024, height: 900 } });
  const payload = Buffer.from(JSON.stringify({ n: 'owner', tid: 'owner:owner', r: 'owner', t: Date.now() })).toString('base64url');
  await owner.addCookies([{ name: 'hanmadi_tutor', value: `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`, url: base }]);
  const endpoint = base + '/api/study/admin/music';
  assert.equal((await fetch(endpoint)).status, 403);
  assert.equal((await owner.request.post(endpoint, { headers: { Origin: 'https://wrong.test' }, data: { action: 'collection-add', video: id, language: 'en' } })).status(), 403);
  await owner.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ contentType: 'text/html', body: '<title>Official player fixture</title>' }));
  await owner.route('https://www.youtube.com/iframe_api', r => r.fulfill({ contentType: 'application/javascript', body: `window.YT={Player:class {
    constructor(frame,options){this.frame=frame;this.events=options.events;setTimeout(()=>options.events.onReady(),0);}
    getAvailablePlaybackRates(){return [1];}setPlaybackRate(){}getPlaybackRate(){return 1;}seekTo(){}getCurrentTime(){return 0;}getPlayerState(){return 2;}playVideo(){}pauseVideo(){}destroy(){this.frame.remove();}
  }};window.onYouTubeIframeAPIReady();` }));
  page = await owner.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/study/admin'); await page.getByRole('button', { name: '음악 관리', exact: true }).click();
  await page.getByLabel('수집할 학습 언어').selectOption('en'); await page.getByLabel('노래·아티스트 검색').fill('Morning');
  await page.getByRole('button', { name: '음악 영상 검색', exact: true }).click();
  await page.getByRole('button', { name: '수집함에 담기', exact: true }).click();
  let card = page.getByRole('article', { name: 'Morning original song 수집 정보', exact: true });
  await card.waitFor();
  await card.getByRole('button', { name: '원곡 미리보기', exact: true }).click();
  await card.getByRole('button', { name: '앱에서 원곡 듣기', exact: true }).click();
  await card.locator('iframe').waitFor(); assert.match(await card.locator('iframe').getAttribute('src'), /youtube-nocookie.com\/embed\/abcdefghijk/);
  await card.getByRole('button', { name: '미리보기 닫기', exact: true }).click(); assert.equal(await card.locator('iframe').count(), 0);
 assert(await page.getByRole('button', { name: '수집됨', exact: true }).isDisabled());
  await page.getByRole('button', { name: '검색 결과 더 보기', exact: true }).click();
  await page.getByRole('link', { name: 'Second original song ↗', exact: true }).waitFor(); assert.equal(searches, 2);
  await page.getByLabel('수집할 YouTube 주소').fill('https://youtu.be/' + secondId);
  await page.getByRole('button', { name: '주소로 수집', exact: true }).click();
  await page.getByRole('article', { name: 'Second original song 수집 정보', exact: true }).waitFor();
  await card.getByText('자막 연결', { exact: true }).click();
  await card.getByRole('button', { name: 'YouTube 자막 확인', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '권한이 없어요' }).waitFor();
  assert.equal((await (await owner.request.get(endpoint)).json()).collection.length, 2);
  denied = false; await card.getByRole('button', { name: 'YouTube 자막 확인', exact: true }).click();
  await card.getByRole('button', { name: '선택한 자막 가져오기', exact: true }).click();
  await card.getByText('자막 확보 · 학습 등록 전', { exact: true }).waitFor(); assert.equal(downloads, 1);
  await page.reload(); await page.getByRole('button', { name: '음악 관리', exact: true }).click();
  card = page.getByRole('article', { name: 'Morning original song 수집 정보', exact: true }); await card.waitFor();
  assert.equal((await (await owner.request.get(endpoint)).json()).collection.find(v => v.video.id === id).source, subtitle);
  await card.getByText('자막 연결 · YouTube에서 확보', { exact: true }).click();
  await card.getByLabel('수집 영상 자막 파일').setInputFiles({ name: 'edited.vtt', mimeType: 'text/vtt', buffer: Buffer.from(subtitle.replace('Good morning', 'Good evening')) });
  await page.getByText('자막을 수정했어요.', { exact: false }).waitFor();
  assert(await card.getByRole('button', { name: '이 자막으로 학습 원문 등록', exact: true }).isDisabled());
  await card.getByRole('button', { name: '자막 보관', exact: true }).click();
  await card.getByText('자막 연결 · 파일·직접 등록', { exact: true }).waitFor();
  await card.getByRole('button', { name: '이 자막으로 학습 원문 등록', exact: true }).click();
  assert.equal(await page.getByLabel('곡 제목', { exact: true }).inputValue(), 'Morning original song');
  assert.match(await page.getByLabel('학습에 사용할 원문').inputValue(), /Good evening/);
  assert.equal(await page.getByLabel('아티스트', { exact: true }).inputValue(), '');
  await page.getByLabel('아티스트', { exact: true }).fill('Hanmadi fixture');
  await page.getByLabel('사용권 근거', { exact: true }).fill('Original fixture, permission for AI processing and learning reuse.');
  await page.getByRole('checkbox', { name: /원문을 AI에 제공/ }).check();
  await page.getByRole('button', { name: '원문 등록', exact: true }).click();
  await card.getByText('학습 원문 등록됨', { exact: true }).waitFor();
  const state = await (await owner.request.get(endpoint)).json(); assert.equal(state.songs.length, 1); assert.equal(state.songs[0].status, 'draft');
  const stale = await owner.request.post(endpoint, { headers: { Origin: base }, data: { action: 'collection-source', id: 'en:' + id, revision: 1, source: 'wrong\ntext' } }); assert.equal(stale.status(), 409);
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.locator('.music-collection').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `collection overflow at ${width}`);
    await page.screenshot({ path: resolve(dir, `collection-${width}.png`), fullPage: true });
  }
  page.on('dialog', d => d.accept());
  await card.getByRole('button', { name: '수집함에서 지우기', exact: true }).click(); await card.waitFor({ state: 'detached' });
  const remaining = await (await owner.request.get(endpoint)).json(); assert.equal(remaining.collection.length, 1); assert.equal(remaining.songs.length, 1);
  assert.deepEqual(errors, []);
  await writeFile(resolve(dir, 'result.json'), JSON.stringify({ passed: true, searches, downloads, errors, upstream: 'YouTube HTTP fixture; no real captions or paid models', checks: ['owner and origin checks', 'music search/pagination', 'collected video official player and close', 'URL collection', '403 retains video', 'OAuth caption import and persistence', 'file edit and unsaved handoff guard', 'draft registration rights gate', 'stale source conflict', 'collection removal preserves learning', '320/390/1024 layout'] }, null, 2));
  console.log(JSON.stringify({ passed: true, searches, downloads, errors }));
} catch (e) {
  await writeFile(resolve(dir, 'error.txt'), String(e.stack ?? e)); if (page) await page.screenshot({ path: resolve(dir, 'failure.png'), fullPage: true }).catch(() => {}); throw e;
} finally { await browser?.close(); app.kill('SIGTERM'); await exit; await new Promise(r => provider.close(r)); await writeFile(resolve(dir, 'server.log'), logs); await rm(preload, { force: true }); }
