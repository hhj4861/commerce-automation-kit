import { executeStudioTask, capabilities } from './studio-runner.mjs';
export function startStudioWorker({ env, cloud, token, workDir }) {
  let running = false;
  async function api(path, options = {}) {
    const response = await fetch(`${cloud}/api/studio${path}`, { ...options, headers: { authorization: `Bearer ${token}`, ...options.headers }, signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`studio API ${response.status}`);
    return response;
  }
  async function tick() {
    await api('/worker', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(capabilities(env)) });
    if (running) return;
    running = true;
    try {
      const { projects } = await (await api('')).json();
      for (const pending of projects.filter(p => p.task?.state === 'queued')) {
        let job = pending;
        const update = async (action, body = {}) => {
          const response = await api(`/${job.id}/${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, revision: job.revision, taskId: job.task.id }) });
          job = (await response.json()).project;
        };
        try { await update('claim'); } catch { continue; }
        const io = {
          workDir,
          readAsset: async key => Buffer.from(await (await api(`/${job.id}/worker-media?key=${encodeURIComponent(key)}`)).arrayBuffer()),
          writeAsset: async (key, data, type) => { await api(`/${job.id}/worker-media?key=${encodeURIComponent(key)}`, { method: 'PUT', headers: { 'content-type': type }, body: data }); },
        };
        try {
          const result = await executeStudioTask(job, env, io, result => update('checkpoint', { result }));
          await update('complete', { result });
        } catch (e) {
          await update('failure', { error: e.message }).catch(() => console.error('[studio-worker] 결과 저장 실패. 중복 실행하지 말고 실행 중인 작업을 확인하세요.'));
        }
      }
    } finally { running = false; }
  }
  const timer = setInterval(() => tick().catch(e => console.error('[studio-worker]', e.message)), 10000);
  timer.unref();
  return { stop: () => clearInterval(timer), tick };
}
