// Isolated E2E: real local studio API, browser UI, local worker, HyperFrames render, editor preview
// and final render. Script, intro clip and template values are synthetic fixtures; no subscription
// LLM, paid image/video API, Higgsfield credit, narration billing or publishing is used.
// Run: SHOPSHORTS_MOTION_NODE=<node 22+> PLAYWRIGHT_CHANNEL=chrome node apps/shopshorts/test/motion-browser.mjs
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp, readFile, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, sep} from 'node:path';
import {chromium} from 'playwright';
import {localStudioStore, startLocalStudio} from '../studio-local.mjs';
import {studioApi} from '../lib/studio-api.js';
import {normalizeEdit} from '../public/editor-model.js';
import {command} from '../studio-runner.mjs';

if (!process.env.SHOPSHORTS_MOTION_NODE) throw Error('SHOPSHORTS_MOTION_NODE (Node 22+) is required for the motion renderer');
const dir = process.env.MOTION_E2E_DIR || await mkdtemp(join(tmpdir(), 'motion-e2e-'));
// No GEMINI/Higgsfield credentials: any accidental provider path would fail instead of paying.
const env = {SHOPSHORTS_MOTION_NODE: process.env.SHOPSHORTS_MOTION_NODE};
const store = localStudioStore(dir, env);
const worker = startLocalStudio(store, env);
const publicRoot = resolve(import.meta.dirname, '../public');
let origin, browser;
const errors = [];
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin), path = url.pathname; let result;
    if (path === '/favicon.ico') result = new Response(null, {status: 204});
    else if (path === '/auth/status') result = Response.json({authenticated: true, user: {name: '모션 검증'}});
    else if (path.startsWith('/api/studio/llm/') || path === '/api/notifications') result = Response.json({items: [], unreadCount: 0, connected: false});
    else if (path.startsWith('/api/studio')) {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      result = await studioApi(new Request(url, {method: req.method, headers: req.headers, ...(chunks.length ? {body: Buffer.concat(chunks)} : {})}), {}, store);
    } else if (path.startsWith('/api/')) result = Response.json({jobs: [], items: []});
    else {
      const file = resolve(publicRoot, path === '/studio' ? 'studio.html' : path === '/' ? 'index.html' : path.slice(1));
      if (!file.startsWith(publicRoot + sep)) throw Error('invalid path');
      result = new Response(await readFile(file), {headers: {'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream'}});
    }
    res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(Buffer.from(await result.arrayBuffer()));
  } catch (e) { errors.push(e.message); res.writeHead(500); res.end('fixture failure'); }
});

try {
  // Synthetic 6s intro clip standing in for the Higgsfield opening (uploaded, not generated).
  const introClip = join(dir, 'intro-fixture.mp4');
  await command('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=0x2b3a4a:s=1080x1920:r=30:d=6', '-vf', 'drawbox=x=200:y=700:w=680:h=500:color=0xe8bd58@1:t=fill', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', introClip], {});
  await new Promise(r => server.listen(0, '127.0.0.1', r)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || undefined});
  const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await page.goto(origin + '/studio?new=1');
  await page.locator('#topic').fill('건물 아래 지하철 · 모션 템플릿 로컬 검증');
  await page.locator('#create').click(); await page.waitForURL(/id=/);
  const id = new URL(page.url()).searchParams.get('id');
  const post = async (action, body) => { const p = await store.get(id); const r = await page.request.post(`${origin}/api/studio/${id}/${action}`, {headers: {origin}, data: {revision: p.revision, ...body}}); return {status: r.status(), body: await r.json()}; };
  const scenes = [
    {id: 'scene-1', kind: 'video', duration: 6, narration: '도시 한가운데, 건물 바로 아래로 지하철이 지나가요.', prompt: '도심 건물 아래 터널 단면'},
    {id: 'scene-2', kind: 'video', duration: 6, narration: '얼마나 깊이 파야 할지 두 깊이를 비교해 볼게요.', prompt: '두 깊이 비교'},
  ];
  assert.equal((await post('scenes', {scenes})).status, 200);
  // Server-side guard: the opening scene can never become a motion template.
  const opening = await post('scenes', {scenes: [{...scenes[0], motion: {template: 'chapter'}}, scenes[1]]});
  assert.equal(opening.status, 400); assert.match(opening.body.error, /첫 장면/);
  const forged = await post('scenes', {scenes: [scenes[0], {...scenes[1], motion: {template: 'countup', vars: {heading: '<img src=x onerror=alert(1)>'}}}]});
  assert.equal(forged.status, 400);
  await page.reload(); await page.locator('#next').click();

  // Media step: opening keeps image/video only, body scene switches to a motion template.
  const kinds = page.locator('[data-kind]');
  assert.equal(await kinds.nth(0).locator('option[value=motion]').isDisabled(), true);
  await kinds.nth(1).selectOption('motion');
  await page.locator('[data-motion-template="scene-2"]').waitFor();
  await page.locator('[data-motion-template="scene-2"]').selectOption('countup');
  await page.locator('[data-motion-var="heading"][data-motion-scene="scene-2"]').waitFor();
  await page.locator('[data-motion-var="heading"][data-motion-scene="scene-2"]').fill('얼마나 깊을까');
  await page.locator('[data-motion-var="labelA"][data-motion-scene="scene-2"]').fill('건물 기초');
  await page.locator('[data-motion-var="valueA"][data-motion-scene="scene-2"]').fill('20');
  await page.locator('[data-motion-var="labelB"][data-motion-scene="scene-2"]').fill('지하철 터널');
  await page.locator('[data-motion-var="valueB"][data-motion-scene="scene-2"]').fill('35');
  // Client-side validation surfaces the same message as the server and saves nothing.
  await page.locator('[data-motion-var="valueA"][data-motion-scene="scene-2"]').fill('2.5');
  await page.locator('[data-motion-save="scene-2"]').click();
  await page.locator('#toast').filter({hasText: '정수'}).waitFor();
  await page.locator('[data-motion-var="valueA"][data-motion-scene="scene-2"]').fill('20');
  await page.locator('[data-motion-save="scene-2"]').click();
  await page.locator('#toast').filter({hasText: '저장했어요'}).waitFor();
  let project = await store.get(id);
  assert.deepEqual(project.scenes[1].motion, {template: 'countup', vars: {heading: '얼마나 깊을까', labelA: '건물 기초', valueA: 20, labelB: '지하철 터널', valueB: 35, unit: 'm', note: '예시값 · 실제 수치 아님'}});
  assert.equal(project.scenes[1].kind, 'video'); assert.equal(project.scenes[0].motion, undefined);
  assert.equal(await page.locator('[data-file="scene-2"]').count(), 0, 'motion scenes do not offer file replacement');
  assert.equal(await page.locator('[data-motion-capability="missing"]').count(), 0, 'ready worker shows no capability warning');
  await page.screenshot({path: join(dir, 'media-motion-form.png'), fullPage: true});

  // Approve, upload the intro fixture, then generate: only scene-2 renders on the local worker.
  await page.locator('#approve').check(); await page.locator('#approveOnly').click();
  await page.locator('#toast').filter({hasText: '검수 승인'}).waitFor();
  await page.locator('[data-file="scene-1"]').setInputFiles(introClip);
  await page.locator('#toast').filter({hasText: '파일을 등록'}).waitFor();
  await page.locator('#approve').check(); await page.locator('#generateMedia').click();
  const deadline = Date.now() + 180000;
  do { await new Promise(r => setTimeout(r, 500)); project = await store.get(id); if (project.task?.state === 'failed') throw Error(project.task.error); } while (!project.assets['scene-2'] && Date.now() < deadline);
  assert.equal(project.assets['scene-2'].provider, 'motion-hyperframes');
  assert.equal(project.assets['scene-2'].motionTemplate, 'countup');
  assert.equal(project.assets['scene-1'].source, 'owned');
  await page.waitForFunction(() => document.querySelectorAll('.media-view video').length === 2, {}, {timeout: 30000});
  const card = page.locator('.media-view video').nth(1);
  await card.evaluate(v => v.play()); await page.waitForTimeout(500); assert.ok(await card.evaluate(v => v.currentTime > 0 && v.videoHeight === 1920));
  await page.screenshot({path: join(dir, 'media-generated.png'), fullPage: true});
  const clip = join(dir, 'motion-clip.mp4'); await writeFile(clip, await store.readAsset(project.assets['scene-2'].key));
  const clipProbe = JSON.parse(await command('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', clip], {})).streams[0];
  assert.equal(clipProbe.width, 1080); assert.equal(clipProbe.height, 1920); assert.equal(clipProbe.nb_read_frames, '180');

  // Editor preview plays the rendered motion clip from the stored asset.
  await page.locator('#next').click();
  await page.locator('#monitorMedia').waitFor();
  const clips = page.locator('.cut-clip'); assert.equal(await clips.count(), 2);
  await clips.nth(1).click();
  await page.waitForFunction(() => document.querySelector('#monitorMedia video')?.src.includes('scene-2'), {}, {timeout: 15000});
  await page.screenshot({path: join(dir, 'editor-preview.png'), fullPage: true});

  // Final render with a caption through the unchanged render pipeline; nothing is published.
  const edit = normalizeEdit(project); edit.voice = 'none';
  edit.captions = [{id: 'caption-1', clipId: edit.clips[1].id, text: '같은 깊이라도 지반에 따라 달라요', startFrame: 0, endFrame: 150, font: 'gothic', size: 56, color: '#ffffff', position: 'bottom', background: true}];
  assert.equal((await post('edit', edit)).status, 200); assert.equal((await post('render', {})).status, 200);
  const renderDeadline = Date.now() + 120000;
  do { await new Promise(r => setTimeout(r, 500)); project = await store.get(id); if (project.task?.state === 'failed') throw Error(project.task.error); } while (!project.render && Date.now() < renderDeadline);
  assert.ok(project.render); assert.equal(project.upload, null);
  const final = join(dir, 'motion-final.mp4'); await writeFile(final, await store.readAsset(project.render.key));
  const probe = JSON.parse(await command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', final], {}));
  assert.equal(probe.streams[0].width, 1080); assert.equal(probe.streams[0].height, 1920); assert.ok(Math.abs(Number(probe.format.duration) - 12) < .15, probe.format.duration);
  await command('ffmpeg', ['-y', '-v', 'error', '-ss', '10.5', '-i', final, '-frames:v', '1', join(dir, 'final-motion-frame.png')], {});

  // Existing projects without motion keep their plain image/video controls; mobile has no overflow.
  await page.setViewportSize({width: 390, height: 844}); await page.goto(origin + `/studio?id=${id}`);
  await page.locator('.step').nth(2).click().catch(() => {});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({path: join(dir, 'mobile.png'), fullPage: true});
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({passed: true, dir, final, checks: ['opening motion rejected (server)', 'forged markup rejected (server)', 'template select + variable form saved', 'client validation message', 'local worker HyperFrames render', 'intro kept as uploaded clip', 'media card playback', 'editor monitor preview', 'final render with caption', 'mobile layout', 'no publish'], fixtures: ['synthetic script', 'synthetic intro clip (stands in for Higgsfield)', 'sample values 20m/35m']}, null, 2));
} finally { worker.stop(); await browser?.close(); await new Promise(r => server.close(r)); }
