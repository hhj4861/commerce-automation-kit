import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { practiceSongs } from '../lib/original-music.ts';
import { musicLanguageLessons } from '../lib/music-language.ts';
const dir = process.env.HANMADI_E2E_ARTIFACTS;
const realVideo = process.env.HANMADI_E2E_REAL_VIDEO === '1';
const videoId = process.env.HANMADI_E2E_VIDEO_ID ?? 'TQ8WlA2GXbk';
assert(dir, 'Set a fresh HANMADI_E2E_ARTIFACTS directory');
await mkdir(dir, { recursive: true });
const dataFile = resolve(dir, 'store.json'); await writeFile(dataFile, '{}', { flag: 'wx' });
const units = practiceSongs.find(s => s.language === 'ja').lines.slice(0, 3).map(({ text, reading, meaning }, i) => ({ sourceIndex: i, line: { text, reading, meaning }, lesson: musicLanguageLessons.ja[i] }));
const subtitle = 'WEBVTT\n\n' + units.map((u, i) => `${i + 1}\n00:00:${String(i * 8).padStart(2, '0')}.000 --> 00:00:${String(i * 8 + 6).padStart(2, '0')}.000\n${u.line.text}`).join('\n\n');
let generations = 0, evaluations = 0, failJev = true;
const provider = createServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw); res.setHeader('Content-Type', 'application/json');
  if (req.url.endsWith('/chat/completions')) {
    assert.equal(req.headers.authorization, 'Bearer music-fixture-key'); generations++;
    assert.match(body.messages[1].content, /おはよう/);
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ units }) }, finish_reason: 'stop' }] }));
  } else if (body.questions) {
    assert.equal(req.headers.authorization, 'Bearer jev-fixture-key'); evaluations++;
    if (failJev) { res.statusCode = 503; res.end('{}'); return; }
    res.end(JSON.stringify({ model: 'jev-1.13.0', usage: { input_tokens: 10, output_tokens: 10 }, answers: Object.fromEntries(Object.keys(body.questions).map(id => {
      const low = id.endsWith('1'), failed = id === 'quality2';
      return [id, { type: 'choice', choice: failed ? 'fail' : 'pass', confidence: low ? .6 : .98, probabilities: { pass: failed ? .01 : low ? .6 : .99, fail: failed ? .99 : low ? .4 : .01 } }];
    })) }));
  } else { res.statusCode = 404; res.end('{}'); }
});
provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
const probe = createServer().listen(0, '127.0.0.1'); await once(probe, 'listening'); const port = probe.address().port; await new Promise(r => probe.close(r));
const base = `http://127.0.0.1:${port}`, secret = 'owned-music-fixture-only-secret-12345';
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, NODE_ENV: 'development', HANMADI_DEPLOYMENT: '', HANMADI_LOCAL_DATA_FILE: dataFile, AUTH_SECRET: secret, TUTOR_PINS: 'owner:654321',
    UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '', KV_REST_API_URL: '', KV_REST_API_TOKEN: '',
    LITELLM_BASE_URL: `http://127.0.0.1:${provider.address().port}`, LITELLM_API_KEY: 'music-fixture-key', LITELLM_MODEL: 'fixture-model', HANMADI_JEV_API_KEY: 'jev-fixture-key',
    ELEVENLABS_API_KEY: '', LITELLM_TTS_MODEL: '', AI_ACCOUNTS_URL: '', DIFY_BASE_URL: '', DIFY_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'],
});
const exit = once(app, 'exit'); let logs = '', browser, page, learnerPage;
app.stdout.on('data', b => { logs += b; }); app.stderr.on('data', b => { logs += b; });
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(base + '/study')).ok) break; } catch {}
    if (i >= 120 || app.exitCode !== null) throw new Error('Test server did not start');
    await new Promise(r => setTimeout(r, 500));
  }
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}), headless: true });
  const owner = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const learner = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const payload = Buffer.from(JSON.stringify({ n: 'owner', tid: 'owner:owner', r: 'owner', t: Date.now() })).toString('base64url');
  await owner.addCookies([{ name: 'hanmadi_tutor', value: `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`, url: base }]);
  const adminPath = '/api/study/admin/music', learnerPath = '/api/study/practice-music';
  assert.equal((await learner.request.get(base + adminPath)).status(), 403);
  assert.equal((await learner.request.get(base + learnerPath)).status(), 401);
  assert.equal((await owner.request.post(base + adminPath, { headers: { Origin: 'https://wrong.test' }, data: { action: 'save' } })).status(), 403);
  async function post(context, path, data) { const r = await context.request.post(base + path, { headers: { Origin: base }, data }); assert(r.ok(), await r.text()); return r.json(); }
  await post(learner, '/api/study/account', { action: 'signup', name: 'musicfixture', password: 'fixture-password-only-123' });
  await post(learner, '/api/study', { action: 'assess', language: 'ja', answers: [0, 0, 0], confidence: 1, minutes: 5 });
  assert.equal((await learner.request.post(base + adminPath, { headers: { Origin: base }, data: { action: 'generate' } })).status(), 403);
  page = await owner.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/study/admin'); await page.getByRole('button', { name: '음악 관리', exact: true }).click();
  await page.getByLabel('곡 제목', { exact: true }).fill('테스트 아침 노래');
  await page.getByLabel('아티스트', { exact: true }).fill('Hanmadi original fixture');
  await page.getByLabel('공식 YouTube 영상 링크 또는 ID').fill('https://youtu.be/' + videoId); // routing fixture only; no Pretender lyrics/audio are fetched
  await page.getByLabel('가사·자막 파일 연결 (선택)').setInputFiles({ name: 'morning.vtt', mimeType: 'text/vtt', buffer: Buffer.from(subtitle) });
  await page.getByLabel('학습에 사용할 원문').waitFor();
  await page.getByText('가사 시간 맞추기', { exact: true }).click();
  await page.getByRole('button', { name: '원문에서 줄 불러오기', exact: true }).click();
  assert.equal(await page.getByLabel('1번 줄 시작 (초)', { exact: true }).inputValue(), '0');
  await page.getByLabel('1번 줄 끝 (초)', { exact: true }).fill('9');
  await page.getByRole('button', { name: '시간을 원문에 적용', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '겹치지 않는' }).waitFor();
  await page.getByLabel('1번 줄 끝 (초)', { exact: true }).fill('6');
  await page.getByRole('button', { name: '시간을 원문에 적용', exact: true }).click();
  assert.match(await page.getByLabel('학습에 사용할 원문').inputValue(), /00:00:06.000/);
  await page.getByLabel('사용권 근거', { exact: true }).fill('직접 작성한 테스트 원문. AI 처리 및 가사·번역·발음 음성·개인 학습 저장 재사용 권한 보유.');
  await page.getByRole('checkbox', { name: /원문을 AI에 제공/ }).check();
  await page.getByRole('button', { name: '원문 등록', exact: true }).click();
  await page.getByRole('heading', { name: '테스트 아침 노래', exact: true }).waitFor();
  let registered = (await (await owner.request.get(base + adminPath)).json()).songs[0];
  assert.equal(registered.status, 'draft'); assert.equal((await (await learner.request.get(base + learnerPath)).json()).songs.length, 4);
  await page.getByRole('button', { name: 'AI 자료 만들기', exact: true }).click();
  await page.getByRole('button', { name: 'JEV 평가 다시 시도', exact: true }).waitFor();
  assert.equal(generations, 1); assert.equal(evaluations, 1);
  failJev = false; await page.getByRole('button', { name: 'JEV 평가 다시 시도', exact: true }).click();
  await page.getByRole('button', { name: '선택한 2개 구간 앱에 게시', exact: true }).waitFor();
  assert.equal(generations, 1); assert.equal(evaluations, 2);
  assert(await page.getByRole('checkbox', { name: '3번 구간 게시' }).isDisabled());
  assert(await page.getByRole('button', { name: '선택한 2개 구간 앱에 게시', exact: true }).isDisabled());
  await page.getByRole('checkbox', { name: /선택한 가사·단어·회화/ }).check();
  for (const width of [320, 390, 1024]) { await page.setViewportSize({ width, height: 844 }); assert(await page.locator('.music-admin').evaluate(el => el.scrollWidth <= el.clientWidth + 1)); }
  await page.screenshot({ path: resolve(dir, 'admin-review.png'), fullPage: true });
  await page.getByRole('button', { name: '선택한 2개 구간 앱에 게시', exact: true }).click();
  await page.getByRole('button', { name: '앱에서 게시 내리기', exact: true }).waitFor();
  const catalog = (await (await learner.request.get(base + learnerPath)).json()).songs;
  const song = catalog.find(s => s.managed); assert.equal(song.lines.length, 2); assert.equal(song.source, undefined); assert.equal(song.rights, undefined);
  learnerPage = await learner.newPage(); learnerPage.on('pageerror', e => errors.push(e.message));
  if (!realVideo) await learnerPage.route('https://www.youtube.com/iframe_api', r => r.fulfill({ contentType: 'application/javascript', body: `
    window.YT = { Player: class {
      constructor(frame, options) { this.frame=frame; this.events=options.events; this.time=0; this.state=2; this.rate=1; this.seeks=[]; window.musicVideo=this; setTimeout(()=>this.events.onReady(),0); }
      seekTo(t) { this.time=t; this.seeks.push(t); }
      playVideo() { this.state=1; this.events.onStateChange({data:1}); }
      pauseVideo() { this.state=2; }
      getCurrentTime() { return this.time; }
      getPlayerState() { return this.state; }
      getAvailablePlaybackRates() { return [.5,.75,1,1.25]; }
      getPlaybackRate() { return this.rate; }
      setPlaybackRate(n) { this.rate=n; this.events.onPlaybackRateChange({data:n}); }
      destroy() { this.state=-1; this.frame.remove(); }
    } }; window.onYouTubeIframeAPIReady();` }));
  if (!realVideo) await learnerPage.route('https://www.youtube-nocookie.com/**', r => r.fulfill({ contentType: 'text/html', body: '<title>Official embed fixture</title>' }));
  await learnerPage.route('**/api/study/audio', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"음성 테스트 응답"}' }));
  await learnerPage.goto(base + '/study'); await learnerPage.getByRole('button', { name: '음악', exact: true }).click();
  await learnerPage.getByLabel('학습할 곡', { exact: true }).selectOption(song.id);
  await learnerPage.getByRole('heading', { name: song.title, exact: true }).waitFor();
  if (videoId === 'TQ8WlA2GXbk') await learnerPage.getByRole('button', { name: 'Pretender · 공식 영상', exact: true }).click();
  await learnerPage.getByRole('heading', { name: song.title, exact: true }).waitFor(); // own catalog wins over the optional supplier
  await learnerPage.getByRole('button', { name: '이 줄 노래 듣기', exact: true }).click();
  assert.match(await learnerPage.locator('iframe').getAttribute('src'), /start=0&end=6/);
  if (realVideo) {
    await learnerPage.getByRole('button', {name:'앱에서 원곡 듣기',exact:true}).click();
    await learnerPage.getByLabel('재생 속도',{exact:true}).selectOption('0.75', {timeout:30000});
    const youtubeFrame = learnerPage.frameLocator('iframe');
    const playButton = youtubeFrame.getByRole('button', { name: /^(Play|재생)( |$)/ }).first();
    if (await playButton.isVisible().catch(() => false)) await playButton.click();
    await learnerPage.getByText('2번 줄 재생 중',{exact:true}).waitFor({timeout:35000});
    await learnerPage.screenshot({path:resolve(dir,'live-youtube-sync.png'),fullPage:true});
  } else {
  await learnerPage.waitForFunction(() => window.musicVideo?.state === 1);
  await learnerPage.locator('.hm-synced-lyrics li[aria-current=true]').waitFor();
  await learnerPage.getByLabel('재생 속도', { exact: true }).selectOption('0.75');
  assert.equal(await learnerPage.evaluate(() => window.musicVideo.rate), .75);
  await learnerPage.getByRole('checkbox', { name: '현재 줄 반복', exact: true }).check();
  await learnerPage.evaluate(() => { window.musicVideo.time=6.1; });
  await learnerPage.waitForFunction(() => window.musicVideo.time === 0);
  await learnerPage.getByRole('checkbox', { name: '현재 줄 반복', exact: true }).uncheck();
  await learnerPage.evaluate(() => { window.musicVideo.time=6.1; });
  await learnerPage.waitForFunction(() => window.musicVideo.state === 2);
  await learnerPage.evaluate(() => window.musicVideo.events.onError({data:150}));
  await learnerPage.getByText('이 영상은 앱 안에서 재생할 수 없어요. YouTube에서 공식 영상을 열어 주세요.',{exact:true}).waitFor();
  assert.equal(await learnerPage.locator('.hm-synced-lyrics li[aria-current=true]').count(),0);
  await learnerPage.getByRole('button', { name: '2번 가사 구간 듣기', exact: true }).click();
  await learnerPage.waitForFunction(() => window.musicVideo.time === 8 && window.musicVideo.state === 1);
  assert.equal(await learnerPage.locator('.hm-synced-lyrics li[aria-current=true]').innerText().then(t => t.includes(units[1].line.text)), true);
  assert.equal((await (await learner.request.get(base + learnerPath)).json()).progress[song.id].index, 0, 'listening does not mutate practice selection');
  await learnerPage.getByRole('button', { name: '번역 표시', exact: true }).click();
  assert.equal(await learnerPage.locator('.hm-synced-lyrics .hm-lyrics-meaning').count(), 0);
  await learnerPage.getByRole('button', { name: '번역 표시', exact: true }).click();
  await learnerPage.getByRole('button', { name: '발음 표시', exact: true }).click();
  assert.equal(await learnerPage.locator('.hm-synced-lyrics .hm-lyrics-reading').count(), 0);
  await learnerPage.getByRole('button', { name: '발음 표시', exact: true }).click();
  await learnerPage.setViewportSize({ width: 390, height: 844 });
  await learnerPage.screenshot({ path: resolve(dir, 'synced-lyrics.png'), fullPage: true });
  }
  await learnerPage.getByRole('button', { name: '단어 발음 듣기', exact: true }).click();
  await learnerPage.getByText('음성 테스트 응답', { exact: true }).waitFor(); assert.equal(await learnerPage.locator('iframe').count(), 0);
  await learnerPage.getByRole('button', { name: units[0].lesson.word.meaning, exact: true }).click();
  await learnerPage.getByText('맞았어요! 이제 대화에 써 볼까요?', { exact: true }).waitFor();
  await learnerPage.getByRole('button', { name: '단어장에 저장', exact: true }).click();
  await learnerPage.getByRole('button', { name: '단어장에 저장됨', exact: true }).waitFor();
  await learnerPage.getByRole('button', { name: '회화에 써보기', exact: true }).click();
  await learnerPage.getByRole('button', { name: '예시 답변 보기', exact: true }).click();
  await learnerPage.getByText(units[0].lesson.answer.text, { exact: true }).waitFor();
  await learnerPage.getByRole('button', { name: '혼자 말했어요', exact: true }).click();
  await learnerPage.getByRole('button', { name: '내 표현에 저장', exact: true }).click();
  await learnerPage.getByRole('button', { name: '내 표현에 저장됨', exact: true }).waitFor();
  for (const width of [320, 390, 1024]) { await learnerPage.setViewportSize({ width, height: 844 }); assert(await learnerPage.locator('.hm-original-music').evaluate(el => el.scrollWidth <= el.clientWidth + 1)); }
  await learnerPage.screenshot({ path: resolve(dir, 'learner-conversation.png'), fullPage: true });
  await learnerPage.getByRole('button', { name: '따라 불렀어요', exact: true }).click();
  await learnerPage.getByRole('button', { name: '다음 줄', exact: true }).click();
  await learnerPage.getByRole('button', { name: '따라 불렀어요', exact: true }).click();
  await learnerPage.getByRole('button', { name: '뜻 복습 시작', exact: true }).click();
  await learnerPage.getByRole('button', { name: units[0].line.meaning, exact: true }).click();
  await learnerPage.getByRole('button', { name: '다음 복습', exact: true }).click();
  await learnerPage.getByRole('button', { name: units[1].line.meaning, exact: true }).click();
  await learnerPage.getByRole('button', { name: '학습 결과 보기', exact: true }).click();
  await learnerPage.getByText('2개 구간을 따라 부르고 뜻까지 복습했어요.', { exact: true }).waitFor();
  await learnerPage.getByRole('button', { name: '단어·회화 다시 연습하기', exact: true }).click();
  await learnerPage.getByRole('button', { name: '회화에 써보기', exact: true }).click();
  await learnerPage.getByRole('button', { name: '새 AI 대화로 연습', exact: true }).click();
  await learnerPage.getByRole('heading', { name: '노래 속 표현으로 대화해요', exact: true }).waitFor();
  await learnerPage.reload(); await learnerPage.getByRole('button', { name: '음악', exact: true }).click(); await learnerPage.getByLabel('학습할 곡', { exact: true }).selectOption(song.id);
  await learnerPage.getByRole('button', { name: '단어장에 저장됨', exact: true }).waitFor();
  await learnerPage.getByRole('button', { name: '회화에 써보기', exact: true }).click(); await learnerPage.getByRole('button', { name: '내 표현에 저장됨', exact: true }).waitFor();
  assert.equal(await learnerPage.getByRole('button', { name: '혼자 말했어요', exact: true }).getAttribute('aria-pressed'), 'true');
  const saved = await post(learner, learnerPath, { action: 'save-word', trackId: song.id, revision: song.revision, index: 0, phrase: { text: 'FORGED' } });
  assert(!saved.state.expressions.some(e => e.text === 'FORGED')); assert.equal(saved.state.expressions.filter(e => e.text === units[0].lesson.word.text).length, 1);
  for (const authored of practiceSongs) {
    await post(learner, '/api/study', { action:'assess', language:authored.language, answers:[0,0,0], confidence:1, minutes:5 });
    await learnerPage.reload();
    await learnerPage.getByRole('combobox', { name:'학습 언어', exact:true }).selectOption(authored.language);
    await learnerPage.getByRole('button', { name:'음악', exact:true }).click();
    await learnerPage.getByLabel('학습할 곡', {exact:true}).selectOption(authored.id); // Wait for the catalog before choosing the original song; managed songs are first.
    await learnerPage.getByRole('heading', {name:authored.title, exact:true}).waitFor();
    await learnerPage.locator('audio').evaluate(el => { el.muted=true; });
    await learnerPage.getByRole('button', {name:'2번 가사 구간 듣기',exact:true}).click();
    await learnerPage.waitForFunction(() => { const a=document.querySelector('audio'); return a && !a.paused && a.readyState>=2; });
    await learnerPage.locator('.hm-synced-lyrics li[aria-current=true]').filter({hasText:authored.lines[1].text}).waitFor();
    await learnerPage.getByLabel('재생 속도', {exact:true}).selectOption('0.75');
    assert.equal(await learnerPage.locator('audio').evaluate(el => el.playbackRate),.75);
    await learnerPage.getByRole('checkbox', {name:'현재 줄 반복',exact:true}).check();
    await learnerPage.locator('audio').evaluate((el,end)=>{el.currentTime=end+.01;el.dispatchEvent(new Event('timeupdate'));}, authored.lines[1].endSeconds);
    assert(await learnerPage.locator('audio').evaluate((el,start)=> Math.abs(el.currentTime-start)<.5,authored.lines[1].startSeconds));
    for (const width of [320,390,1024]) { await learnerPage.setViewportSize({width,height:844}); assert(await learnerPage.locator('.hm-original-music').evaluate(el=>el.scrollWidth<=el.clientWidth+1)); }
    await learnerPage.screenshot({path:resolve(dir,`synced-${authored.language}.png`),fullPage:true});
    await learnerPage.locator('audio').evaluate(el=>el.pause());
  }
  const another = await browser.newContext(); await post(another, '/api/study/account', { action: 'signup', name: 'anothermusicfixture', password: 'fixture-password-only-123' });
  const other = await (await another.request.get(base + learnerPath)).json(); assert.deepEqual(other.progress[song.id].practiced, []); assert.equal(other.progress[song.id].wordsReviewed, undefined);
  await page.getByRole('button', { name: '앱에서 게시 내리기', exact: true }).click();
  await page.getByRole('button', { name: '선택한 2개 구간 앱에 게시', exact: true }).waitFor();
  assert.equal((await (await learner.request.get(base + learnerPath)).json()).songs.length, 4);
  assert.equal((await learner.request.post(base + learnerPath, { headers: { Origin: base }, data: { action: 'save-word', trackId: song.id, revision: song.revision, index: 0 } })).status(), 400);
  assert.equal(generations, 1); assert.equal(evaluations, 2); assert.deepEqual(errors, []);
  await writeFile(resolve(dir, 'result.json'), JSON.stringify({ passed: true, generations, evaluations, errors, model: 'HTTP fixture; no paid model calls', video: realVideo ? 'Live official YouTube embed; no lyrics fetched' : 'YouTube IFrame API fixture', tested: ['admin timing editor validation/apply', realVideo ? 'official YouTube sample playback clock and speed' : 'YouTube API fixture sync/loop/rate/error/disposal', 'four-language real audio sync/loop/rate', 'admin registration/upload', 'JEV failure retry retains generation', 'human review gate and excluded rows', 'publish and unpublish', 'learner catalog and timed embed', 'variable-length words and conversation', 'personal saves/reload/dedupe/isolation', 'AI conversation handoff', '320/390/1024 layout'] }, null, 2));
  console.log(JSON.stringify({ passed: true, generations, evaluations }));
} catch (error) {
  if (learnerPage) { await learnerPage.screenshot({path:resolve(dir,'learner-failure.png'),fullPage:true}).catch(()=>{}); await writeFile(resolve(dir,'learner-state.txt'), await learnerPage.locator('body').innerText()); }
  await writeFile(resolve(dir, 'error.txt'), String(error.stack ?? error)); if (page) await page.screenshot({ path: resolve(dir, 'failure.png'), fullPage: true }).catch(() => {}); throw error; }
finally { await browser?.close(); app.kill('SIGTERM'); await exit; await new Promise(r => provider.close(r)); await writeFile(resolve(dir, 'server.log'), logs); }
