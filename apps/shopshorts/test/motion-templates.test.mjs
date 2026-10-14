import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {spawnSync} from 'node:child_process';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createProject, changeProject, validateScenes} from '../lib/studio.js';
import {MOTION_TEMPLATES, motionDefaults, motionSpec} from '../public/motion-templates.js';
import {sceneWithKind, sceneWithTemplate, motionBlockedReason} from '../public/studio-motion-ui.js';
import {renderMotionScene, MotionRenderError} from '../studio-motion.mjs';
import {executeStudioTask, command, capabilities} from '../studio-runner.mjs';

const brief = {category: '과학', topic: '건물 아래 지하철은 어떻게 만들까', direction: '차분한 설명', format: 'short', duration: 20};
const intro = {id: 'scene-1', kind: 'video', duration: 6, narration: '도시 한가운데 건물 아래로 지하철이 지나가요.', prompt: '도심 건물 아래 터널 단면'};
const motion = {template: 'chapter', vars: {chapterNo: '02', title: '땅속을 파는 방법', accent: '#c95d47'}};
const body = {id: 'scene-2', kind: 'video', duration: 4, narration: '이제 땅속을 어떻게 파는지 볼게요.', prompt: '챕터 전환', motion};

test('every template validates with its own defaults and keeps only declared variables', () => {
  for (const t of MOTION_TEMPLATES) assert.deepEqual(motionSpec({template: t.id}), {template: t.id, vars: motionDefaults(t.id)});
  assert.deepEqual(motionSpec(motion), motion);
  assert.equal(motionSpec({template: 'countup', vars: {valueA: '12'}}).vars.valueA, 12);
});

test('schema rejects unknown templates, extra keys, markup, URLs and out-of-range values', () => {
  const rejects = [
    undefined, null, [], 'chapter',
    {template: 'unknown'}, {template: '../chapter'}, {template: 'chapter.html'}, {template: '__proto__'},
    {template: 'chapter', html: '<div></div>'}, {template: 'chapter', vars: []},
    {template: 'chapter', vars: {showSafe: true}}, {template: 'chapter', vars: {script: 'x'}},
    {template: 'chapter', vars: {title: '<script>alert(1)</script>'}},
    {template: 'chapter', vars: {title: 'https://evil.example'}},
    {template: 'chapter', vars: {title: 'javascript:alert(1)'}},
    {template: 'chapter', vars: {title: '줄\n바꿈'}},
    {template: 'chapter', vars: {title: '열두글자를넘기는아주긴제목'}},
    {template: 'chapter', vars: {title: '   '}},
    {template: 'chapter', vars: {accent: 'red'}}, {template: 'chapter', vars: {accent: 'url(x)'}},
    {template: 'countup', vars: {valueA: -1}}, {template: 'countup', vars: {valueA: 10000}},
    {template: 'countup', vars: {valueA: 2.5}}, {template: 'countup', vars: {valueA: 'abc'}}, {template: 'countup', vars: {valueA: Infinity}},
    {template: 'summary', vars: {icon1: 'skull'}}, {template: 'summary', vars: {icon1: '<svg>'}},
  ];
  for (const value of rejects) assert.throws(() => motionSpec(value), e => e.status === 400, JSON.stringify(value));
});

test('scene rules: opening stays Higgsfield, motion is video-only and not mixed with illustrated animation', () => {
  const [, normalized] = validateScenes([intro, body]);
  assert.deepEqual(normalized.motion, motion);
  assert.equal(normalized.kind, 'video');
  assert.throws(() => validateScenes([{...intro, motion}]), /첫 장면/);
  assert.throws(() => validateScenes([intro, {...body, kind: 'image'}]), /영상/);
  assert.throws(() => validateScenes([intro, body], {animationStyle: true}), /애니메이션/);
  // AI scenario output never selects templates, so a stray key cannot break or smuggle anything.
  assert.equal(validateScenes([{...intro, motion: {template: 'x'}}, body], {stripMotion: true})[1].motion, undefined);
  // Existing image/video scenes keep their exact shape.
  const legacy = validateScenes([intro, {...body, motion: undefined, kind: 'image'}]);
  assert.equal('motion' in legacy[0], false); assert.equal('motion' in legacy[1], false);
});

test('changing template content or length invalidates only that generated clip', () => {
  const job = {...createProject(brief), scenes: [intro, body], assets: {'scene-1': {source: 'ai', kind: 'video', key: 'a'}, 'scene-2': {source: 'ai', kind: 'video', key: 'b'}}, approved: true};
  for (const patch of [{motion: {...motion, vars: {...motion.vars, title: '다른 제목'}}}, {motion: {template: 'summary'}}, {duration: 5}]) {
    const next = changeProject(job, 'scenes', {scenes: [intro, {...body, ...patch}]});
    assert.equal(next.assets['scene-2'], undefined, JSON.stringify(patch));
    assert.equal(next.assets['scene-1'].key, 'a');
  }
  assert.equal(changeProject(job, 'scenes', {scenes: [intro, body]}).assets['scene-2'].key, 'b');
});

test('UI helpers switch kinds without leaving stale motion data', () => {
  const asMotion = sceneWithKind({...body, motion: undefined}, 'motion');
  assert.equal(asMotion.kind, 'video'); assert.equal(asMotion.motion.template, MOTION_TEMPLATES[0].id);
  assert.equal('motion' in sceneWithKind(body, 'image'), false);
  assert.deepEqual(sceneWithTemplate(body, 'countup').motion, {template: 'countup', vars: motionDefaults('countup')});
  assert.match(motionBlockedReason({brief}, 0), /도입부/);
  assert.equal(motionBlockedReason({brief}, 1), '');
});

// Fake child process for failure-path tests: never touches Chrome or ffmpeg.
function fakeSpawn(behaviour) {
  return (cmd, args) => {
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.kill = () => setImmediate(() => child.emit('close', null));
    setImmediate(() => behaviour(child, cmd, args));
    return child;
  };
}
const versionOk = (child, cmd, args) => { if (args[0] === '-p') { child.stdout.emit('data', '22.23.3\n'); child.emit('close', 0); return true; } return false; };

test('failures are distinguished: missing dependency, old node, render failure, timeout', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'motion-fail-')); t.after(() => rm(dir, {recursive: true, force: true}));
  const job = {...createProject(brief), scenes: [intro, body]};
  await assert.rejects(renderMotionScene(job, body, dir, {SHOPSHORTS_MOTION_CLI: join(dir, 'missing.mjs')}), e => e instanceof MotionRenderError && e.code === 'MOTION_DEPENDENCY_MISSING');
  await assert.rejects(renderMotionScene(job, body, dir, {}, {spawnImpl: fakeSpawn(child => { child.stdout.emit('data', '20.19.3\n'); child.emit('close', 0); })}), e => e.code === 'MOTION_NODE_TOO_OLD' && /Node 22/.test(e.message));
  await assert.rejects(renderMotionScene(job, body, dir, {}, {spawnImpl: fakeSpawn((child, cmd, args) => { if (versionOk(child, cmd, args)) return; child.stderr.emit('data', 'Lint error: boom'); child.emit('close', 1); })}), e => e.code === 'MOTION_RENDER_FAILED' && /boom/.test(e.message));
  await assert.rejects(renderMotionScene(job, body, dir, {SHOPSHORTS_MOTION_TIMEOUT_MS: '50'}, {spawnImpl: fakeSpawn((child, cmd, args) => { versionOk(child, cmd, args); })}), e => e.code === 'MOTION_TIMEOUT');
  await assert.rejects(renderMotionScene(job, {...body, motion: {template: 'nope'}}, dir), e => e.status === 400);
  assert.equal(existsSync(join(dir, 'scene-2-motion')), false, 'per-scene project is cleaned up after failures');
});

test('worker heartbeat reports motion readiness as a boolean', () => {
  assert.equal(typeof capabilities({}).motion, 'boolean');
  assert.equal(capabilities({SHOPSHORTS_MOTION_CLI: '/nonexistent/hyperframes.mjs'}).motion, false);
});

// Real HyperFrames render through the worker route. Needs a Node 22+ binary for the CLI.
const node22 = process.env.SHOPSHORTS_MOTION_NODE || (Number(process.versions.node.split('.')[0]) >= 22 ? process.execPath : '');
test('worker renders a motion scene to MP4 without any paid provider call and resumes without re-rendering', {timeout: 240000, skip: node22 ? false : 'SHOPSHORTS_MOTION_NODE (Node 22+) not set'}, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'motion-real-')); t.after(() => rm(dir, {recursive: true, force: true}));
  // The opening already has an uploaded clip, so only the motion scene is produced.
  // countup ends on a full chart, so a loop back to its blank first frame would be visible.
  const counted = {...body, duration: 6, motion: {template: 'countup'}};
  const job = {...createProject(brief), scenes: [intro, counted], assets: {'scene-1': {key: 'uploaded', kind: 'video', type: 'video/mp4', source: 'owned'}}, task: {id: 'motion-fixture', action: 'media'}};
  const stored = new Map(), deltas = [];
  const io = {workDir: dir, writeAsset: async (k, data, type) => stored.set(k, {data, type})};
  const env = {SHOPSHORTS_MEDIA_PROVIDER: 'higgsfield', SHOPSHORTS_MOTION_NODE: node22};
  const result = await executeStudioTask(job, env, io, async d => deltas.push(d), {fetcher: () => { throw Error('must not call provider'); }, runHiggsfield: () => { throw Error('must not call Higgsfield'); }});
  const asset = result.assets['scene-2'];
  assert.equal(asset.provider, 'motion-hyperframes'); assert.equal(asset.motionTemplate, 'countup');
  assert.equal(asset.kind, 'video'); assert.equal(asset.source, 'ai'); assert.equal(deltas.length, 1);
  const file = join(dir, 'actual.mp4'); await writeFile(file, stored.get(asset.key).data);
  const probe = JSON.parse(await command('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-of', 'json', file], {})).streams[0];
  assert.equal(probe.codec_name, 'h264'); assert.equal(probe.width, 1080); assert.equal(probe.height, 1920);
  assert.equal(probe.nb_read_frames, '180', '5s template held to the 6s scene length');
  const hashes = (await command('ffmpeg', ['-v', 'error', '-i', file, '-f', 'framemd5', '-'], {})).split('\n').filter(l => l && !l.startsWith('#')).map(l => l.split(',').at(-1));
  assert.ok(new Set(hashes).size > 30, 'frames actually move');
  // Padding must hold the final template frame, not loop back to the (blank) opening frame.
  // H.264 refines a static picture over P-frames, so compare downscaled gray frames by mean
  // absolute difference instead of exact hashes (measured: hold ≈0.003, opening vs end ≈8.1).
  const gray = n => spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `select='eq(n\\,${n})',scale=270:480,format=gray`, '-frames:v', '1', '-f', 'rawvideo', '-'], {maxBuffer: 1 << 22}).stdout;
  const mad = (a, b) => { const x = gray(a), y = gray(b); assert.equal(x.length, 270 * 480); let s = 0; for (let i = 0; i < x.length; i++) s += Math.abs(x[i] - y[i]); return s / x.length; };
  assert.ok(mad(149, 179) < 1, 'last padded frame matches the final template frame');
  assert.ok(mad(0, 179) > 4, 'last padded frame is not the opening frame (no loop)');
  const resumed = await executeStudioTask({...job, assets: result.assets}, env, io, async () => { throw Error('completed scenes must not render again'); });
  assert.deepEqual(resumed.assets, result.assets);
});
