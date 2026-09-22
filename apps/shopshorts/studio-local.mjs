import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve, join, dirname, extname, sep } from 'node:path';
import { accountBroker } from './studio-account-worker.mjs';
import { llmAccountApi } from './lib/llm-account-api.js';
import { studioApi } from './lib/studio-api.js';
import { executeStudioTask, capabilities } from './studio-runner.mjs';

export function localStudioStore(dataDir, env, onPersist = () => {}) {
  const file = join(dataDir, 'studio-projects.json');
  const mediaRoot = resolve(dataDir, 'studio-media');
  const load = () => existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
  const persist = items => { mkdirSync(dataDir, { recursive: true }); writeFileSync(`${file}.tmp`, JSON.stringify(items)); renameSync(`${file}.tmp`, file); onPersist(items); };
  const assetPath = key => {
    const path = resolve(mediaRoot, key);
    if (!path.startsWith(mediaRoot + sep)) throw new Error('미디어 경로 오류');
    return path;
  };
  return {
    execution: 'local', workDir: join(dataDir, 'studio-work'),
    async capabilities() { return capabilities(env); },
    async list() { return load().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); },
    async get(id) { return load().find(p => p.id === id) || null; },
    async create(p) { const all = load(); all.push(p); persist(all); },
    async cas(p, revision) { const all = load(), index = all.findIndex(x => x.id === p.id); if (index < 0 || all[index].revision !== revision) return false; all[index] = p; persist(all); return true; },
    async writeAsset(key, data, type) { const path = assetPath(key); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, Buffer.from(data)); writeFileSync(`${path}.type`, type); },
    async readAsset(key, request) {
      const path = assetPath(key);
      if (!existsSync(path)) return new Response('미디어 파일 없음', { status: 404 });
      const data = readFileSync(path);
      if (!request) return data;
      const type = existsSync(`${path}.type`) ? readFileSync(`${path}.type`, 'utf8') : extname(path) === '.mp4' ? 'video/mp4' : 'application/octet-stream';
      const headers = { 'content-type': type, 'cache-control': 'private, no-store', 'accept-ranges': 'bytes' };
      const range = request.headers.get('range');
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${data.length}` } });
        const start = match[1] ? Number(match[1]) : Math.max(0, data.length - Number(match[2]));
        const end = match[1] && match[2] ? Math.min(Number(match[2]), data.length - 1) : data.length - 1;
        if (start > end || start >= data.length) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${data.length}` } });
        return new Response(data.subarray(start, end + 1), { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${data.length}`, 'content-length': String(end - start + 1) } });
      }
      return new Response(data, { headers: { ...headers, 'content-length': String(data.length) } });
    },
  };
}
export function startLocalStudio(store, env, execute = executeStudioTask) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const queued of await store.list()) {
        if (queued.task?.state !== 'queued' || queued.task.runner === 'llm-account') continue;
        let job = { ...queued, revision: queued.revision + 1, task: { ...queued.task, state: 'running', startedAt: new Date().toISOString() } };
        if (!await store.cas(job, queued.revision)) continue;
        const update = async (result, state) => {
          const fresh = await store.get(job.id);
          if (fresh.task?.id !== job.task.id || fresh.task.state !== 'running') throw new Error('제작 도중 프로젝트가 변경되었습니다.');
          const next = { ...fresh, ...result, revision: fresh.revision + 1, updatedAt: new Date().toISOString(), task: { ...fresh.task, ...(state ? { state } : {}) } };
          if (!await store.cas(next, fresh.revision)) throw new Error('제작 결과 저장 충돌');
          job = next;
        };
        try { const result = await execute(job, env, store, delta => update(delta)); await update(result, 'done'); }
        catch (e) {
          const fresh = await store.get(job.id);
          if (fresh.task?.id === job.task.id && fresh.task.state === 'running') await store.cas({ ...fresh, revision: fresh.revision + 1, task: { ...fresh.task, state: 'failed', error: String(e.message).slice(0, 1000) }, updatedAt: new Date().toISOString() }, fresh.revision);
        }
      }
    } finally { running = false; }
  };
  const timer = setInterval(() => tick().catch(e => console.error('[studio]', e.message)), 3000);
  timer.unref();
  // A server restart never automatically retries potentially paid work or publishing.
  const recover = async () => {
    for (const job of await store.list()) if (job.task?.state === 'running' && job.task.runner !== 'llm-account') await store.cas({ ...job, revision: job.revision + 1, task: { ...job.task, state: 'failed', error: '제작 서버가 재시작되었습니다. 생성은 다시 요청할 수 있으며, 업로드는 플랫폼 접수 여부를 먼저 확인하세요.' } }, job.revision);
  };
  return { tick, recover, stop: () => clearInterval(timer) };
}
export async function handleLocalStudio(req, res, origin, env, store) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 51 * 1024 * 1024) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
  const controller = new AbortController();
  const abort = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', abort);
  const request = new Request(new URL(req.url, origin), { method: req.method, headers: req.headers, signal: controller.signal, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Buffer.concat(chunks) }) });
  try {
    const result = await llmAccountApi(request, env, (owner, operation, input) => accountBroker(env)('/runner/account-action', { owner, operation, input })) || await studioApi(request, env, store, { recommendationAccounts: true, scenarioAccounts: (owner, operation, input) => accountBroker(env)('/runner/account-action', { owner, operation, input }) });
    if (!res.destroyed) await sendResponse(res, result);
  } finally { res.off('close', abort); }
}
export async function sendResponse(res, response) {
  const headers = Object.fromEntries(response.headers);
  if (response.headers.getSetCookie().length) headers['set-cookie'] = response.headers.getSetCookie();
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}
