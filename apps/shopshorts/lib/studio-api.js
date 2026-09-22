import { startScenario, syncScenario, scenarioRuntime } from './studio-scenario-account.js';
import { CATEGORIES, VOICES, PLATFORMS, createProject, changeProject, busy, fail, validateScenes } from './studio.js';
import { sameOrigin, workerAuthorized } from './google-auth.js';
import { recommendBrief } from './studio-recommendations.js';
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
export async function studioApi(request, env, store, { localWorker = false, recommendationGenerate, recommendationAccounts = false, scenarioAccounts } = {}) {
  const url = new URL(request.url), parts = url.pathname.replace(/^\/api\/studio\/?/, '').split('/').filter(Boolean);
  const worker = localWorker || workerAuthorized(request, env);
  try {
    if (!['GET', 'HEAD'].includes(request.method) && !sameOrigin(request)) fail('다른 사이트에서 요청할 수 없습니다.', 403);
    if (parts[0] === 'config' && request.method === 'GET') return json({ categories: CATEGORIES, voices: VOICES, platforms: PLATFORMS, execution: store.execution, capabilities: await store.capabilities(), scenarioRuntime: await scenarioRuntime(request, env, scenarioAccounts), recommendations: !!recommendationGenerate || recommendationAccounts, recommendationProvider: recommendationGenerate ? 'codex' : null, recommendationProviders: recommendationAccounts ? ['codex', 'claude'] : recommendationGenerate ? ['codex'] : [] });
    if (parts.length===1 && parts[0]==='recommendations' && request.method==='POST') return json(await recommendBrief(await request.json(),env,{generate:recommendationGenerate,signal:request.signal}));
    if (!parts.length) {
      if (request.method === 'GET') return json({ projects: await Promise.all((await store.list()).map(project => syncScenario(store, project, scenarioAccounts))) });
      if (request.method === 'POST') {
        const project = createProject(await request.json());
        await store.create(project); return json({ project }, 201);
      }
    }
    const [id, action, assetId] = parts;
    if (!/^[a-f0-9-]{36}$/.test(id || '')) fail('프로젝트를 찾을 수 없습니다.', 404);
    const project = await store.get(id);
    if (!project) fail('프로젝트를 찾을 수 없습니다.', 404);
    if (action === 'worker-media' && worker) {
      const key = url.searchParams.get('key') || '';
      if (!new RegExp(`^studio/${id}/[a-zA-Z0-9.-]+$`).test(key)) fail('미디어 키 오류');
      if (request.method === 'GET') return store.readAsset(key, request);
      if (request.method === 'PUT') {
        if (project.task?.state !== 'running') fail('실행 중인 작업이 없습니다.', 409);
        await store.writeAsset(key, request.body, request.headers.get('content-type') || 'application/octet-stream');
        return json({ ok: true });
      }
    }
    if (!action && request.method === 'GET') return json({ project: await syncScenario(store, project, scenarioAccounts) });
    if (action === 'assets' && assetId && request.method === 'GET') {
      const asset = project.assets[assetId] || (assetId === 'final' ? project.render : null);
      if (!asset) fail('미디어가 아직 없습니다.', 404);
      return await store.readAsset(asset.key, request);
    }
    const save = async next => {
      next.revision = project.revision + 1; next.updatedAt = new Date().toISOString();
      if (!await store.cas(next, project.revision)) fail('다른 창에서 변경되었습니다. 새로고침 후 다시 시도하세요.', 409);
      return json({ project: next });
    };
    if (action === 'assets' && request.method === 'POST') {
      if (busy(project) || project.upload) fail('작업 중이거나 업로드된 프로젝트입니다.', 409);
      if (url.searchParams.get('rights') !== 'confirmed') fail('직접 제작했거나 사용권이 있는 파일인지 확인하세요.');
      const kind = url.searchParams.get('kind'), sceneId = url.searchParams.get('scene');
      const type = request.headers.get('content-type')?.split(';')[0];
      const types = { 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mp4': 'm4a', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4' };
      if (!types[type] || !['audio', 'image', 'video'].includes(kind) || !type.startsWith(kind + '/')) fail('MP3/WAV/M4A, PNG/JPG/WebP, MP4 파일만 지원합니다.');
      if (kind !== 'audio' && (!project.approved || !project.scenes.some(s => s.id === sceneId && s.kind === kind))) fail('대본을 승인하고 장면 유형과 맞는 파일을 선택하세요.');
      if (Number(request.headers.get('content-length')) > 50 * 1024 * 1024) fail('파일은 50MB 이하만 지원합니다.', 413);
      const data = await request.arrayBuffer();
      if (!data.byteLength || data.byteLength > 50 * 1024 * 1024) fail('파일은 0바이트 초과, 50MB 이하만 지원합니다.', 413);
      const key = `studio/${id}/${crypto.randomUUID()}.${types[type]}`;
      await store.writeAsset(key, data, type);
      const next = structuredClone(project), name = kind === 'audio' ? crypto.randomUUID() : sceneId;
      next.assets[name] = { key, kind, name: (url.searchParams.get('name') || '내 파일').slice(0, 100), source: 'owned', type };
      next.render = null;
      return save(next);
    }
    if (request.method !== 'POST') fail('지원하지 않는 요청입니다.', 405);
    const body = await request.json();
    if (body.revision !== project.revision) fail('변경된 프로젝트를 다시 불러오세요.', 409);
    if (['claim', 'complete', 'checkpoint', 'failure'].includes(action)) {
      if (!worker) fail('제작 워커만 실행할 수 있습니다.', 403);
      if (project.task?.runner === 'llm-account') fail('이 시나리오는 연결한 계정 실행기가 처리합니다.', 409);
      const next = structuredClone(project);
      if (action === 'claim') {
        if (project.task?.state !== 'queued') fail('대기 작업이 없습니다.', 409);
        next.task.state = 'running'; next.task.startedAt = new Date().toISOString();
      } else {
        if (project.task?.state !== 'running' || body.taskId !== project.task.id) fail('현재 작업과 일치하지 않습니다.', 409);
        if (action === 'failure') { next.task.state = 'failed'; next.task.error = String(body.error || '제작 실패').slice(0, 1000); }
        else {
          const result = body.result || {};
          const legalKeys = { scenario: ['title', 'scenes'], media: ['assets'], render: ['render'], publish: ['upload'] }[project.task.action];
          for (const field of Object.keys(result)) if (!legalKeys?.includes(field)) fail('작업 결과 필드가 일치하지 않습니다.');
          if (result.scenes) { result.scenes = validateScenes(result.scenes); next.assets = {}; next.edit = null; }
          Object.assign(next, result);
          if (action === 'complete') next.task.state = 'done';
        }
      }
      return save(next);
    }
    if (action === 'approve') {
      if (busy(project) || project.upload || body.approved !== true || !project.scenes.length) fail('대본을 검수하고 확인하세요.');
      return save({ ...project, approved: true });
    }
    if (action === 'scenario') return json({ project: await startScenario(request, env, store, project, body, scenarioAccounts) }, 202);
    return save(changeProject(project, action, body));
  } catch (e) { return json({ error: e.status ? e.message : '요청을 처리하지 못했습니다. 저장소·서버 설정을 확인하세요.' }, e.status || 500); }
}
export function cloudStudioStore(env) {
  return {
    execution: 'cloud-worker',
    async capabilities() {
      const hb = await env.DB.prepare("SELECT value FROM meta WHERE key = 'studio_worker'").first();
      return hb ? JSON.parse(hb.value) : { workerAt: null };
    },
    async list() { return (await env.DB.prepare('SELECT data FROM studio_projects ORDER BY updated_at DESC').all()).results.map(r => JSON.parse(r.data)); },
    async get(id) { const r = await env.DB.prepare('SELECT data FROM studio_projects WHERE id = ?').bind(id).first(); return r ? JSON.parse(r.data) : null; },
    async create(p) { await env.DB.prepare('INSERT INTO studio_projects (id,revision,data,updated_at) VALUES (?,?,?,?)').bind(p.id, p.revision, JSON.stringify(p), p.updatedAt).run(); },
    async cas(p, revision) { const r = await env.DB.prepare('UPDATE studio_projects SET data=?, revision=?, updated_at=? WHERE id=? AND revision=?').bind(JSON.stringify(p), p.revision, p.updatedAt, p.id, revision).run(); return r.meta.changes === 1; },
    async writeAsset(key, data, type) { await env.MEDIA.put(key, data, { httpMetadata: { contentType: type } }); },
    async readAsset(key, request) {
      const object = await env.MEDIA.get(key, { range: request.headers });
      if (!object) return json({ error: '미디어 파일이 없습니다.' }, 404);
      const headers = new Headers({ 'cache-control': 'private, no-store', 'accept-ranges': 'bytes' });
      object.writeHttpMetadata(headers);
      const range = object.range;
      if (range && 'offset' in range) { headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`); headers.set('content-length', String(range.length)); }
      else headers.set('content-length', String(object.size));
      return new Response(object.body, { status: range ? 206 : 200, headers });
    },
  };
}
