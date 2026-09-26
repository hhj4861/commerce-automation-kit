import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject, changeProject, VOICES } from '../lib/studio.js';
import { normalizeEdit, clipAt, splitClip } from '../public/editor-model.js';
import { narrationReady, narrationId, createNarrationPlayback } from '../public/narration-audio.js';
import { generateNarration, narrationFile } from '../studio-narration.mjs';
import { studioApi } from '../lib/studio-api.js';
import { localStudioStore } from '../studio-local.mjs';
import { command } from '../studio-runner.mjs';
import { executionStatus, resumeStep } from '../public/studio-status.js';

function project() {
  const p = createProject({ category: '심리학', topic: '대화', format: 'short', duration: 16 });
  p.scenes = [{ id: 'scene-1', narration: '천천히 이야기해요.', prompt: 'A calm family.', duration: 6, kind: 'image' }];
  p.approved = true;
  p.edit = normalizeEdit(p); p.edit.voice = VOICES[1].id;
  return p;
}
test('narration requires approval and voice; only the current worker may checkpoint audio', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'narration-api-'));
  try {
    const p = project(), store = localStudioStore(dir, {});
    assert.throws(() => changeProject({ ...p, approved: false }, 'narration', {}));
    assert.throws(() => changeProject({ ...p, edit: { ...p.edit, voice: 'none' } }, 'narration', {}));
    let queued = changeProject(p, 'narration', {}); await store.create(queued);
    const post = async (action, body, worker = false) => studioApi(new Request(`http://local/api/studio/${p.id}/${action}`, { method: 'POST', body: JSON.stringify({ revision: queued.revision, taskId: queued.task.id, ...body }) }), {}, store, { localWorker: worker });
    assert.equal((await post('claim', {})).status, 403);
    queued = (await (await post('claim', {}, true)).json()).project;
    assert.equal((await post('checkpoint', { result: { assets: {} } })).status, 403);
    assert.equal((await post('checkpoint', { taskId: 'stale', result: { assets: {} } }, true)).status, 409);
    assert.equal((await post('checkpoint', { result: { render: {} } }, true)).status, 400);
    assert.equal((await post('complete', { result: { assets: {} } }, true)).status, 200);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('real MP3 checkpoint survives restart, voice/text changes invalidate, duplicate clips share speech', async () => {
  const work = await mkdtemp(join(tmpdir(), 'narration-cache-')), objects = new Map();
  let calls = 0;
  const io = { readAsset: async key => objects.get(key), writeAsset: async (key, data) => objects.set(key, data) };
  const tools = { command, runCli: async (workspace, args, env) => {
    calls++; assert.equal(workspace, '@cak/tts-narration'); assert.equal(env.ELEVENLABS_VOICE_ID, VOICES[1].id);
    await command('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', args[args.indexOf('--out') + 1]], {});
  } };
  try {
    const p = project(); p.edit = splitClip(p.edit, 'clip-1', 60, 'second');
    assert.equal(narrationReady(p, p.edit), false);
    let updates = 0;
    const result = await generateNarration(p, work, { ELEVENLABS_API_KEY: 'fixture' }, io, async delta => { updates++; assert.ok(objects.has(delta.assets[narrationId('scene-1')].key)); }, tools);
    assert.equal(calls, 1); assert.equal(updates, 1);
    p.assets = result.assets;
    assert.equal(narrationReady(p, p.edit), true);
    assert.equal(narrationReady(p, { ...p.edit, voice: VOICES[2].id }), false);
    assert.equal(narrationReady({ ...p, scenes: [{ ...p.scenes[0], narration: '바뀐 대본' }] }, p.edit), false);
    await generateNarration(p, work, {}, io, async () => assert.fail('must reuse saved asset'), tools);
    const fresh = join(work, 'restart'); await mkdir(fresh);
    const reused = await narrationFile(p, p.scenes[0], fresh, {}, io, { command, runCli: () => assert.fail('no paid regeneration during render') });
    assert.ok(reused.duration > 0); assert.ok((await readFile(reused.file)).length > 0); assert.equal(calls, 1);
  } finally { await rm(work, { recursive: true, force: true }); }
});

test('failed checkpoint reuses completed local audio; synthesis errors are redacted and not marked ready', async () => {
  const work = await mkdtemp(join(tmpdir(), 'narration-retry-')); let calls = 0;
  const tools = { command: async () => '2', runCli: async (_, args) => { calls++; await writeFile(args[args.indexOf('--out') + 1], 'fixture-audio'); } };
  const io = { writeAsset: async () => {}, readAsset: async () => { throw Error('missing'); } };
  try {
    const p = project();
    await assert.rejects(generateNarration(p, work, { ELEVENLABS_API_KEY: 'fixture' }, io, async () => { throw Error('checkpoint unavailable'); }, tools), /checkpoint unavailable/);
    await generateNarration(p, work, {}, io, async () => {}, tools); assert.equal(calls, 1);
    p.scenes[0].narration = '새 대본';
    await assert.rejects(generateNarration(p, work, { ELEVENLABS_API_KEY: 'fixture' }, io, async () => assert.fail('no failed output'), { ...tools, runCli: async () => { throw Error('secret raw provider response'); } }), e => /인증과 사용 한도/.test(e.message) && !e.message.includes('secret'));
    assert.equal(narrationReady(p, p.edit), false);
  } finally { await rm(work, { recursive: true, force: true }); }
});

function fakeAudio() {
  return { readyState: 1, duration: 5, currentTime: 0, paused: true, plays: 0, loop: true,
    load() {}, removeAttribute() {}, pause() { this.paused = true; },
    async play() { this.plays++; this.paused = false; },
  };
}
test('narration work reopens in the editor and completion directs users to playback', () => {
  const p = project(); p.task = { action: 'narration', state: 'running' };
  assert.equal(resumeStep(p), 4);
  assert.equal(executionStatus({ project: p, step: 4 }).kind, 'running');
  p.task.state = 'done';
  assert.match(executionStatus({ project: p, step: 4 }).detail, /재생 버튼/);
});
test('timeline speech follows trim/split/seek, pauses, and does not loop beyond speech length', async () => {
  const a = fakeAudio(), playback = createNarrationPlayback(a, assert.fail), p = project();
  p.edit = splitClip(p.edit, 'clip-1', 60, 'second');
  playback.sync('/voice.mp3', clipAt(p.edit, 75), true); await Promise.resolve();
  assert.equal(a.currentTime, 2.5); assert.equal(a.loop, false); assert.equal(a.paused, false);
  playback.stop(); assert.equal(a.paused, true);
  playback.sync('/voice.mp3', clipAt(p.edit, 15), false); assert.equal(a.currentTime, .5); assert.equal(a.paused, true);
  playback.sync('/voice.mp3', clipAt(p.edit, 165), true); assert.equal(a.paused, true);
  playback.destroy(); assert.equal(a.onloadedmetadata, null);
});
test('stopped or destroyed preview cannot restart from late metadata or a stale play rejection', async () => {
  const a = fakeAudio(); a.readyState = 0; let errors = 0;
  const playback = createNarrationPlayback(a, () => errors++), at = clipAt(project().edit, 0);
  playback.sync('/a.mp3', at, true); playback.stop(); a.readyState = 1; a.onloadedmetadata(); assert.equal(a.plays, 0);
  let reject; a.play = () => new Promise((_, fail) => reject = fail);
  playback.sync('/a.mp3', at, true); playback.stop(); reject(Error('late')); await Promise.resolve();
  assert.equal(errors, 0); playback.destroy();
});
