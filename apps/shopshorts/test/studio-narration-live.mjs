// Opt-in one-scene TTS verification. Production is read-only; no render/upload.
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { accountBroker } from '../studio-account-worker.mjs';
import { localStudioStore, startLocalStudio } from '../studio-local.mjs';
import { studioApi } from '../lib/studio-api.js';
import { VOICES, createProject } from '../lib/studio.js';
import { normalizeEdit } from '../public/editor-model.js';
import { executeStudioTask, command } from '../studio-runner.mjs';

const fixture = process.argv.includes('--fixture');
if (!fixture && !process.argv.includes('--live-one-narration')) throw Error('Requires --fixture or --live-one-narration (uses ElevenLabs allowance).');
const sourceId = process.env.NARRATION_TEST_PROJECT;
let source, values, headers;
if (fixture) {
  source = createProject({ category: '심리학', topic: '음성 재생 검증', format: 'short', duration: 16 });
  source.scenes = [{ id: 'scene-1', narration: '로컬 테스트 신호입니다.', prompt: 'Local test image', duration: 6, kind: 'image' }];
  source.approved = true; source.assets = { 'scene-1': { kind: 'image' } };
  values = { ELEVENLABS_API_KEY: 'offline-fixture-never-sent' };
} else {
  if (!/^[a-f0-9-]{36}$/.test(sourceId || '')) throw Error('Select a reviewed test project.');
  ({ values } = await accountBroker(process.env)('/runner/secrets', {}));
  headers = { cookie: `ss=${values.SHOPSHORTS_TOKEN}` };
  const response = await fetch(`${values.SHOPSHORTS_CLOUD_URL}/api/studio/${sourceId}`, { headers });
  if (!response.ok) throw Error('Cannot read source project.');
  ({ project: source } = await response.json());
}
const scene = source.scenes[0];
if (!source.approved || !source.assets[scene?.id]) throw Error('Reviewed source image required.');
const env = { ELEVENLABS_API_KEY: values.ELEVENLABS_API_KEY };
const dataDir = resolve(import.meta.dirname, '../../../docs/out/narration-live', fixture ? 'fixture' : 'live');
await mkdir(dataDir, { recursive: true });
const store = localStudioStore(dataDir, env);
let project = (await store.list())[0];
if (!project) {
  project = { ...source, id: crypto.randomUUID(), revision: 0, title: '[음성 검증] ' + source.title, scenes: [scene], assets: {}, task: null, edit: null, render: null, upload: null };
  let data;
  if (fixture) {
    const file = resolve(dataDir, 'fixture.png');
    await command('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=360x640', '-frames:v', '1', file], {});
    data = await readFile(file);
  } else {
    const asset = await fetch(`${values.SHOPSHORTS_CLOUD_URL}/api/studio/${sourceId}/assets/${scene.id}`, { headers });
    if (!asset.ok) throw Error('Cannot read source image.');
    data = Buffer.from(await asset.arrayBuffer());
  }
  const key = `studio/${project.id}/scene.png`;
  await store.writeAsset(key, data, 'image/png');
  project.assets[scene.id] = { key, kind: 'image', type: 'image/png' };
  project.edit = normalizeEdit(project); project.edit.voice = VOICES[1].id;
  await store.create(project);
}
const worker = startLocalStudio(store, env, async (...args) => {
  if (args[0].task.action !== 'narration') throw Error('This test permits narration only.');
  return executeStudioTask(...args, fixture ? { runCli: async (workspace, args) => {
    if (workspace !== '@cak/tts-narration') throw Error('Unexpected fixture CLI');
    await command('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4', args[args.indexOf('--out') + 1]], {});
  } } : {});
});
await worker.recover();
const origin = 'http://127.0.0.1:5202', publicRoot = resolve(import.meta.dirname, '../public');
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, origin).pathname; let result;
    if (path === '/auth/status') result = Response.json({ authenticated: true });
    else if (path.startsWith('/api/studio')) {
      if (path.includes('/llm/')) result = Response.json({ items: [], unreadCount: 0, connected: false });
      else {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        result = await studioApi(new Request(new URL(req.url, origin), { method: req.method, headers: req.headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) }), {}, store);
      }
    } else if (path.startsWith('/api/')) result = Response.json({}, { status: 404 });
    else {
      const file = resolve(publicRoot, path === '/studio' ? 'studio.html' : path.slice(1));
      if (!file.startsWith(publicRoot + sep)) throw Error('not found');
      result = new Response(await readFile(file), { headers: { 'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream' } });
    }
    res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(Buffer.from(await result.arrayBuffer()));
  } catch { res.writeHead(500); res.end('test server error'); }
});
await new Promise(r => server.listen(5202, '127.0.0.1', r));
console.log(JSON.stringify({ url: `${origin}/studio?id=${project.id}`, productionChanged: false, fixture }));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => { worker.stop(); server.close(); });
