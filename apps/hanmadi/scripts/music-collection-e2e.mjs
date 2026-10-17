import { saveSource, musicReview } from "./content-flow-helpers.mjs";
import { openAdminTool } from "./admin-navigation.mjs";
// Local integration: real Next routes/store/UI; official YouTube HTTP responses are fixtures.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { practiceSongs } from '../lib/original-music.ts';
import { musicLanguageLessons } from '../lib/music-language.ts';
const dir = process.env.HANMADI_E2E_ARTIFACTS;
assert(dir, 'Set a fresh HANMADI_E2E_ARTIFACTS directory'); await mkdir(dir, { recursive: true });
const dataFile = resolve(dir, 'store.json'); await writeFile(dataFile, '{}', { flag: 'wx' });
const id = 'abcdefghijk', secondId = 'xyzabcdefgh';
const subtitle = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nGood morning\n\n00:00:04.000 --> 00:00:06.000\nHello my friend';
const english = [
  { sourceIndex: 0, line: { text: 'Good evening', reading: '굿 이브닝', meaning: '좋은 저녁이에요.' }, lesson: { word: { text: 'evening', reading: '이브닝', meaning: '저녁' }, note: '저녁 인사에 써요.', situation: '친구와 저녁에 인사하기', question: { text: 'Good evening! How are you?', reading: '굿 이브닝 하우 아 유', meaning: '좋은 저녁! 잘 지내?' }, answer: { text: 'Good evening! I am fine.', reading: '굿 이브닝 아이 엠 파인', meaning: '좋은 저녁! 잘 지내.' } } },
  { sourceIndex: 1, line: { text: 'Hello my friend', reading: '헬로 마이 프렌드', meaning: '안녕, 내 친구야.' }, lesson: { word: { text: 'friend', reading: '프렌드', meaning: '친구' }, note: '친한 사람을 소개할 때 써요.', situation: '친구를 소개하기', question: { text: 'Who is this?', reading: '후 이즈 디스', meaning: '이 사람은 누구야?' }, answer: { text: 'This is my friend.', reading: '디스 이즈 마이 프렌드', meaning: '내 친구야.' } } },
];
const unitsByLanguage = Object.fromEntries(practiceSongs.map(song => [song.language, song.language === 'en' ? english : song.lines.slice(0, 2).map(({text, reading, meaning}, i) => ({ sourceIndex: i, line: {text, reading, meaning}, lesson: musicLanguageLessons[song.language][i] }))]));
unitsByLanguage.es[0].lesson = { ...unitsByLanguage.es[0].lesson, answer: { text: 'Sí, hoy hace buen tiempo.', reading: '씨 오이 아쎄 부엔 띠엠뽀', meaning: '응, 오늘 날씨가 좋아.' } };
let denied = true, searches = 0, downloads = 0, generations = 0, evaluations = 0;
const provider = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const u = new URL(req.url, 'http://fixture.test'); res.setHeader('Content-Type', 'application/json');
  if (u.pathname.endsWith('/chat/completions')) {
    assert.equal(req.headers.authorization, 'Bearer music-fixture-key'); generations++;
    const input = JSON.parse(JSON.parse(raw).messages[1].content);
    const units = Object.values(unitsByLanguage).find(rows => rows[0].line.text === input.lines[0].text);
    assert(units, 'generation uses exactly the collected source');
    return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ units }) }, finish_reason: 'stop' }] }));
  }
  if (req.headers['content-type']?.includes('application/json') && raw && JSON.parse(raw).questions) {
    assert.equal(req.headers.authorization, 'Bearer jev-fixture-key'); evaluations++;
    return res.end(JSON.stringify({ model: 'jev-1.13.0', usage: { input_tokens: 10, output_tokens: 10 }, answers: Object.fromEntries(Object.keys(JSON.parse(raw).questions).map(id => [id, { type: 'choice', choice: 'pass', confidence: .98, probabilities: { pass: .99, fail: .01 } }])) }));
  }
  if (u.pathname === '/token') return res.end(JSON.stringify({ access_token: 'fixture-access' }));
  if (u.pathname === '/youtube/v3/search') {
    searches++; assert([null, '10'].includes(u.searchParams.get('videoCategoryId'))); if (u.searchParams.get('videoCategoryId') === '10') assert.equal(u.searchParams.get('videoEmbeddable'), 'true');
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
    LITELLM_BASE_URL: `http://127.0.0.1:${provider.address().port}`, LITELLM_API_KEY: 'music-fixture-key', LITELLM_MODEL: 'fixture-model', HANMADI_JEV_API_KEY: 'jev-fixture-key', ELEVENLABS_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
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
  await page.goto(base + '/study/admin'); await openAdminTool(page, '영상 찾기');
  await page.getByText('연결 채널의 영상만 자막 가져오기를 시도할 수 있어요', { exact: true }).waitFor();
  assert.equal((await (await owner.request.get(base + '/api/study/admin')).json()).captionImportConfigured, true);
  await page.getByLabel('검색어', { exact: true }).fill('Morning');
  await page.getByRole('button', { name: '영상 검색', exact: true }).click();
  await page.getByText('자막 가져오기 권한 미확인 · 파일로도 준비 가능', { exact: true }).waitFor();
  await page.getByRole('checkbox', { name: 'Morning original song 선택', exact: true }).check();
  await page.getByLabel('수집 언어').selectOption('en'); await page.getByLabel('수집 용도').selectOption('both');
  assert(await page.getByRole('button', { name: '공통 준비함에 담기', exact: true }).isDisabled(), 'Collection requires a declared acquisition route');
  await page.getByLabel('원문 확보 방법', { exact: true }).selectOption('file');
  await page.getByRole('button', { name: '공통 준비함에 담기', exact: true }).click();
  await page.getByRole('heading', { name: '원문·작업', exact: true, level: 1 }).waitFor();
  const common = await (await owner.request.get(base + '/api/study/admin/media')).json();
  assert.equal(common.youtube.captions, true);
  assert.equal(common.sources.length, 1); assert.deepEqual(common.sources[0].purposes, ['music', 'study']);
  assert.equal(generations, 0); assert.equal(evaluations, 0);
  await page.getByText('YouTube 자막 가져오기', { exact: true }).click();
  await page.getByRole('button', { name: 'YouTube 자막 확인', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '권한이 없어요' }).waitFor();
  assert.equal(await page.getByLabel('보관할 원문', { exact: true }).inputValue(), '');
  denied = false;
  await page.getByRole('button', { name: 'YouTube 자막 확인', exact: true }).click();
  await page.getByRole('button', { name: '선택한 자막 가져오기', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('textarea')?.value.includes('Good morning'));
  assert.equal(await page.getByLabel('보관할 원문', { exact: true }).inputValue(), subtitle);
  assert.equal((await (await owner.request.get(base + '/api/study/admin/media')).json()).sources[0].originalCount, 0, 'caption preview is not saved without consent');
  denied = true;
  // Historical caption integration remains accessible from preparation; metadata/caption providers are real routes with HTTP fixtures.
  const legacyPost = async data => { const r = await owner.request.post(endpoint, { headers: { Origin: base }, data }); assert(r.ok(), await r.text()); return r.json(); };
  await legacyPost({ action: 'collection-add', video: id, language: 'en' });
  const next = await legacyPost({ action: 'collection-search', query: 'Morning', language: 'en', pageToken: 'PAGE2' });
  assert.equal(next.videos[0].id, secondId); assert.equal(searches, 2);
  await legacyPost({ action: 'collection-add', video: 'https://youtu.be/' + secondId, language: 'en' });
  await openAdminTool(page, '기존 음악 수집함');
  let card = page.getByRole('article', { name: 'Morning original song 수집 정보', exact: true });
  await card.waitFor();
  await card.getByRole('button', { name: '원곡 미리보기', exact: true }).click();
  await card.getByRole('button', { name: '앱에서 원곡 듣기', exact: true }).click();
  await card.locator('iframe').waitFor(); assert.match(await card.locator('iframe').getAttribute('src'), /youtube-nocookie.com\/embed\/abcdefghijk/);
  await card.getByRole('button', { name: '미리보기 닫기', exact: true }).click(); assert.equal(await card.locator('iframe').count(), 0);
  await card.locator('summary').filter({ hasText: /^자막 연결/ }).click();
  await card.getByRole('button', { name: 'YouTube 자막 확인', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '권한이 없어요' }).waitFor();
  assert.equal((await (await owner.request.get(endpoint)).json()).collection.length, 2);
  denied = false; await card.getByRole('button', { name: 'YouTube 자막 확인', exact: true }).click();
  await card.getByRole('button', { name: '선택한 자막 가져오기', exact: true }).click();
  await card.getByText('자막 확보 · 학습 등록 전', { exact: true }).waitFor(); assert.equal(downloads, 1);
  await page.reload(); await openAdminTool(page, '기존 음악 수집함');
  card = page.getByRole('article', { name: 'Morning original song 수집 정보', exact: true }); await card.waitFor();
  assert.equal((await (await owner.request.get(endpoint)).json()).collection.find(v => v.video.id === id).source, subtitle);
  await card.getByText('자막 연결 · YouTube에서 확보', { exact: true }).click();
  await card.getByLabel('수집 영상 자막 파일').setInputFiles({ name: 'edited.vtt', mimeType: 'text/vtt', buffer: Buffer.from(subtitle.replace('Good morning', 'Good evening')) });
  await page.getByText('자막을 수정했어요.', { exact: false }).waitFor();
  assert(await card.getByRole('button', { name: '이 자막으로 학습 원문 등록', exact: true }).isDisabled());
  await card.getByRole('button', { name: '자막 보관', exact: true }).click();
  await card.getByText('자막 연결 · 파일·직접 등록', { exact: true }).waitFor();
  await card.getByRole('button', { name: '이 자막으로 학습 원문 등록', exact: true }).click();
  await page.getByLabel('보관할 원문', { exact: true }).waitFor();
  assert.match(await page.getByLabel('보관할 원문').inputValue(), /Good evening/);
  await saveSource(page, subtitle.replace('Good morning', 'Good evening'));
  assert.equal(generations, 0, 'source saving and normalization have no model calls');
  await musicReview(page);
  await openAdminTool(page, '기존 음악 수집함');
  card = page.getByRole('article', { name: 'Morning original song 수집 정보', exact: true });
  await card.getByText('학습 원문 등록됨 · 자료 생성 필요', { exact: true }).waitFor();
  const state = await (await owner.request.get(endpoint)).json(); assert.equal(state.songs.length, 1); assert.equal(state.songs[0].status, 'draft');
  const stale = await owner.request.post(endpoint, { headers: { Origin: base }, data: { action: 'collection-source', id: 'en:' + id, revision: 1, source: 'wrong\ntext' } }); assert.equal(stale.status(), 409);
  for (const width of [320, 390, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.locator('.music-collection').evaluate(el => el.scrollWidth <= el.clientWidth + 1), `collection overflow at ${width}`);
    await page.screenshot({ path: resolve(dir, `collection-${width}.png`), fullPage: true });
  }
  // Continue the collected source all the way into the real learner UI, with its own account.
  const learner = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const learnerPage = await learner.newPage(); learnerPage.on('pageerror', e => errors.push(e.message));
  const learnerPath = '/api/study/practice-music';
  async function post(context, path, data) { const r = await context.request.post(base + path, { headers: { Origin: base }, data }); assert(r.ok(), await r.text()); return r.json(); }
  const registered = state.songs[0], learningPath = `/study/music/en/${registered.id}`;
  await learnerPage.goto(base + learningPath);
  await learnerPage.getByRole('button', { name: '처음이에요 · 계정 만들기', exact: true }).click();
  await learnerPage.getByLabel('학습자 아이디', { exact: true }).fill('collectedmusicfixture');
  await learnerPage.getByLabel('비밀번호', { exact: true }).fill('fixture-password-only-123');
  await learnerPage.getByRole('button', { name: '학습 계정 만들기', exact: true }).click();
  await learnerPage.getByText('선택한 곡은 아직 게시되지 않았거나 게시가 내려갔어요.', { exact: false }).waitFor();
  assert.equal(new URL(learnerPage.url()).pathname, learningPath, 'login retains the chosen song');
  assert.equal(await learnerPage.locator('.hm-song-practice').count(), 0, 'unpublished deep links never substitute a different song');
  await openAdminTool(page, '음악 검수');
  const musicCard = page.getByRole('article', { name: 'Morning original song 관리', exact: true });
  await musicCard.getByRole('button', { name: 'AI 자료 만들기', exact: true }).click();
  const publish = musicCard.getByRole('button', { name: '선택한 2개 구간 앱에 게시', exact: true });
  await publish.waitFor(); assert(await publish.isDisabled());
  await musicCard.getByRole('button', { name: '선택한 2개 구간 앱에 게시', exact: true }).waitFor();
  assert.equal((await (await learner.request.get(base + learnerPath)).json()).songs.filter(s => s.managed).length, 0);
  await musicCard.getByRole('checkbox', { name: /선택한 가사·단어·회화/ }).check(); await publish.click();
  await openAdminTool(page, '음악 관리');
  await musicCard.getByRole('button', { name: '앱에서 게시 내리기', exact: true }).waitFor();
  assert.equal(await musicCard.getByRole('link', { name: '앱에서 이 곡 학습 ↗', exact: true }).getAttribute('href'), learningPath);
  await learnerPage.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ contentType: 'text/html', body: '<title>Official player fixture</title>' }));
  await learnerPage.route('https://www.youtube.com/iframe_api', r => r.fulfill({ contentType: 'application/javascript', body: `window.YT={Player:class {
    constructor(frame,options){this.frame=frame;this.events=options.events;this.time=0;this.state=2;window.musicVideo=this;setTimeout(()=>options.events.onReady(),0);}
    getAvailablePlaybackRates(){return [1];}setPlaybackRate(){}getPlaybackRate(){return 1;}seekTo(t){this.time=t;}getCurrentTime(){return this.time;}getPlayerState(){return this.state;}playVideo(){this.state=1;this.events.onStateChange({data:1});}pauseVideo(){this.state=2;}destroy(){this.frame.remove();}
  }};window.onYouTubeIframeAPIReady();` }));
  await learnerPage.getByRole('button', { name: '곡 목록 새로고침', exact: true }).click();
  await learnerPage.getByRole('heading', { name: 'Morning original song', exact: true }).waitFor();
  const publishedCatalog = await (await learner.request.get(base + learnerPath)).json();
  const learned = publishedCatalog.songs.find(s => s.id === registered.id);
  assert.equal(learned.videoId, id); assert.equal(learned.lines[0].text, 'Good evening'); assert.equal(learned.lines[0].startSeconds, 1); assert.equal(learned.lines[0].endSeconds, 3);
  for (const field of ['source', 'rights', 'judgments', 'reviewedBy']) assert.equal(learned[field], undefined);
  await learnerPage.getByRole('button', { name: '1번 가사 구간 듣기', exact: true }).click();
  await learnerPage.waitForFunction(() => window.musicVideo?.time === 1 && window.musicVideo?.state === 1);
  assert.match(await learnerPage.locator('iframe').getAttribute('src'), /embed\/abcdefghijk/);
  await learnerPage.getByRole('button', { name: english[0].lesson.word.meaning, exact: true }).click();
  await learnerPage.getByRole('button', { name: '단어장에 저장', exact: true }).click();
  await learnerPage.getByRole('button', { name: '단어장에 저장됨', exact: true }).waitFor();
  await learnerPage.getByRole('button', { name: '회화에 써보기', exact: true }).click();
  await learnerPage.getByRole('button', { name: '예시 답변 보기', exact: true }).click();
  await learnerPage.getByText(english[0].lesson.answer.text, { exact: true }).waitFor();
  await learnerPage.getByRole('button', { name: '혼자 말했어요', exact: true }).click();
  await learnerPage.getByRole('button', { name: '내 표현에 저장', exact: true }).click();
  await learnerPage.getByRole('button', { name: '내 표현에 저장됨', exact: true }).waitFor();
  await learnerPage.screenshot({ path: resolve(dir, 'collected-song-study.png'), fullPage: true });
  async function completeStudy(units) {
    await learnerPage.getByRole('button', { name: '따라 불렀어요', exact: true }).click();
    await learnerPage.getByRole('button', { name: '다음 줄', exact: true }).click();
    await learnerPage.getByRole('button', { name: '따라 불렀어요', exact: true }).click();
    await learnerPage.getByRole('button', { name: '뜻 복습 시작', exact: true }).click();
    await learnerPage.getByRole('button', { name: units[0].line.meaning, exact: true }).click();
    await learnerPage.getByRole('button', { name: '다음 복습', exact: true }).click();
    await learnerPage.getByRole('button', { name: units[1].line.meaning, exact: true }).click();
    await learnerPage.getByRole('button', { name: '학습 결과 보기', exact: true }).click();
    await learnerPage.getByText('2개 구간을 따라 부르고 뜻까지 복습했어요.', { exact: true }).waitFor();
  }
  await completeStudy(english); await learnerPage.reload();
  await learnerPage.getByRole('heading', { name: '한 곡을 내 한마디로!', exact: true }).waitFor();
  const progress = (await (await learner.request.get(base + learnerPath)).json()).progress[registered.id];
  assert.equal(progress.practiced.length, 2); assert.equal(progress.reviewed.length, 2); assert.equal(progress.wordsReviewed.length, 1); assert.equal(progress.conversations['source-0'], 'alone');
  // Each supported language uses the collected video, published units and its own study progress.
  for (const language of ['ja', 'th', 'es']) {
    const { item } = await post(owner, '/api/study/admin/music', { action: 'collection-add', video: secondId, language });
    const units = unitsByLanguage[language], source = units.map(u => u.line.text).join('\n');
    await post(owner, '/api/study/admin/music', { action: 'collection-source', id: item.id, revision: item.revision, source });
    const { song: saved } = await post(owner, '/api/study/admin/music', { action: 'save', title: `Collected ${language}`, artist: 'Original fixture', videoId: secondId, language, source, rights: 'Original test material with learning reuse permission.', rightsConfirmed: true });
    const { song: reviewed } = await post(owner, '/api/study/admin/music', { action: 'generate', id: saved.id, revision: saved.revision });
    await post(owner, '/api/study/admin/music', { action: 'publish', id: reviewed.id, revision: reviewed.revision, indices: [0, 1], reviewed: true });
    await learnerPage.goto(`${base}/study/music/${language}/${saved.id}`);
    await learnerPage.getByRole('heading', { name: `Collected ${language}`, exact: true }).waitFor();
    assert.equal(await learnerPage.getByRole('combobox', { name: '학습 언어', exact: true }).inputValue(), language);
    for (const width of [320, 390, 1024]) { await learnerPage.setViewportSize({ width, height: 900 }); assert(await learnerPage.locator('.hm-original-music').evaluate(el => el.scrollWidth <= el.clientWidth + 1)); }
    await completeStudy(units); await learnerPage.screenshot({ path: resolve(dir, `collected-${language}-complete.png`), fullPage: true });
  }
  // Switching languages inside music must not send a new learner to the conversation assessment.
  await learnerPage.getByRole('combobox', { name: '학습 언어', exact: true }).selectOption('en');
  await learnerPage.getByRole('heading', { name: 'Morning original song', exact: true }).waitFor();
  assert.equal(await learnerPage.getByRole('combobox', { name: '학습할 곡', exact: true }).inputValue(), registered.id, 'published songs are selected before original practice songs');
  await learnerPage.getByRole('heading', { name: '한 곡을 내 한마디로!', exact: true }).waitFor();
  page.on('dialog', d => d.accept());
  await openAdminTool(page, '기존 음악 수집함');
  await card.getByRole('button', { name: '수집함에서 지우기', exact: true }).click(); await card.waitFor({ state: 'detached' });
  const remaining = await (await owner.request.get(endpoint)).json(); assert.equal(remaining.collection.length, 4); assert.equal(remaining.songs.length, 4);
  assert((await (await learner.request.get(base + learnerPath)).json()).songs.some(s => s.id === registered.id), 'collection removal preserves published study');
  await openAdminTool(page, '음악 관리');
  await musicCard.getByRole('button', { name: '앱에서 게시 내리기', exact: true }).click();
  await openAdminTool(page, '음악 검수');
  await musicCard.getByRole('button', { name: '선택한 2개 구간 앱에 게시', exact: true }).waitFor();
  await learnerPage.getByRole('button', { name: '곡 목록 새로고침', exact: true }).click();
  await learnerPage.getByText('선택한 곡은 아직 게시되지 않았거나 게시가 내려갔어요.', { exact: false }).waitFor();
  assert.equal(await learnerPage.locator('.hm-song-practice').count(), 0);
  assert.equal((await learner.request.post(base + learnerPath, { headers: { Origin: base }, data: { action: 'practice', trackId: registered.id, revision: learned.revision, index: 0 } })).status(), 400);
  assert.equal(generations, 4); assert.equal(evaluations, 4);
  assert.deepEqual(errors, []);
  await writeFile(resolve(dir, 'result.json'), JSON.stringify({ passed: true, searches, downloads, errors, upstream: 'YouTube/player/LLM/JEV fixtures; real Next routes, store and UI; no real captions or paid calls', checks: ['owner and origin checks', 'music search/pagination', 'collected video official player and close', 'URL collection', '403 retains video', 'OAuth caption import and persistence', 'file edit and unsaved handoff guard', 'draft registration rights gate', 'stale source conflict', 'collection removal preserves learning', '320/390/1024 layout', 'collection → generated units → human publication → exact video/source learning', 'unassessed learner signup retains music link', 'four-language collected song study and review completion', 'word/expression save and progress reload', 'published catalog refresh and unpublish'] }, null, 2));
  console.log(JSON.stringify({ passed: true, searches, downloads, errors }));
} catch (e) {
  await writeFile(resolve(dir, 'error.txt'), String(e.stack ?? e)); if (page) await page.screenshot({ path: resolve(dir, 'failure.png'), fullPage: true }).catch(() => {}); throw e;
} finally { await browser?.close(); app.kill('SIGTERM'); await exit; await new Promise(r => provider.close(r)); await writeFile(resolve(dir, 'server.log'), logs); await rm(preload, { force: true }); }
