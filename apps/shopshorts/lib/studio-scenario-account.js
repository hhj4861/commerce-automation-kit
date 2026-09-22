import { busy, changeProject, fail } from './studio.js';
import { llmOwner } from './llm-account-api.js';
import { scenarioResult } from './studio-scenario.js';

const changed = project => ({ ...project, revision: project.revision + 1, updatedAt: new Date().toISOString() });

export async function scenarioRuntime(request, env, call) {
  if(!call)return null;
  const owner=await llmOwner(request,env);
  if(!owner)return {connected:false,available:false,scenarioAvailable:false};
  try {
    const status=await call(owner,'status',{});
    if(status.error)return {known:false};
    return {known:true,connected:!!status.connected,available:!!status.available,scenarioAvailable:!!status.scenarioAvailable,provider:status.provider};
  } catch { return {known:false}; }
}

export async function startScenario(request, env, store, project, body, call) {
  if (!call) fail('시나리오 계정 실행기가 설정되지 않았습니다.', 503);
  const owner = await llmOwner(request, env);
  if (!owner) fail('로그인이 필요합니다.', 401);
  const next = changeProject(project, 'scenario', body);
  const status = await call(owner, 'status', {});
  if (status.error) fail(status.error, status.status || 503);
  if (!status.connected) fail('Codex 또는 Claude 계정을 먼저 연결하세요.', 428);
  if (!status.available) fail('LLM 실행기가 오프라인입니다. 실행기를 연결한 뒤 다시 생성하세요.', 503);
  if (!status.scenarioAvailable) fail('시나리오를 지원하는 LLM 실행기를 연결하세요.', 503);
  if (['queued', 'running'].includes(status.job?.state)) fail('연결한 계정의 다른 요청이 끝난 뒤 다시 생성하세요.', 409);
  next.task = { ...next.task, runner: 'llm-account', accountOwner: owner, deadline: Date.now() + 240000 };
  const reserved = changed(next);
  if (!await store.cas(reserved, project.revision)) fail('다른 창에서 변경되었습니다. 새로고침 후 다시 시도하세요.', 409);
  // Reserve the project first. A competing browser cannot enqueue a second job.
  // An ambiguous transport failure remains bounded by the persisted deadline.
  try {
    const result = await call(owner, 'scenario', { id: reserved.task.id, projectId: project.id, brief: project.brief });
    if (result.error) {
      const failed = changed({ ...reserved, task: { ...reserved.task, state: 'failed', error: result.error } });
      await store.cas(failed, reserved.revision);
      fail(result.error, result.status || 503);
    }
  } catch (error) {
    if (error.status) throw error;
  }
  return reserved;
}

export async function syncScenario(store, project, call, now = Date.now()) {
  if (!call) return project;
  if (project.task?.action==='scenario' && project.task.state==='queued' && project.task.runner!=='llm-account') {
    const next=changed({...project,task:{...project.task,state:'failed',error:'이전 생성 요청은 시작되지 않았어요. 연결한 AI 계정으로 다시 생성해 주세요.'}});
    return await store.cas(next,project.revision)?next:await store.get(project.id)||project;
  }
  if (project.task?.runner !== 'llm-account') return project;
  const task = project.task;
  const input = { id: task.id, projectId: project.id };
  const acknowledge = async () => {
    try { await call(task.accountOwner, 'scenario-ack', input); } catch { /* Retry on the next read. */ }
  };
  if (!busy(project)) { await acknowledge(); return project; }
  let job;
  try { job = (await call(task.accountOwner, 'scenario-status', input)).job; }
  catch { /* Temporary broker outage must not discard a result. */ }
  let next = structuredClone(project);
  if (job && job.id === task.id && job.projectId === project.id) {
    if (job.state === 'done') {
      try {
        Object.assign(next, scenarioResult(job.result, project.brief), { assets: {}, edit: null, approved: false, render: null });
        next.task.state = 'done';
      } catch {
        next.task.state = 'failed'; next.task.error = '시나리오 형식 또는 길이가 맞지 않습니다. 다시 생성하세요.';
      }
    } else if (job.state === 'failed') {
      next.task.state = 'failed'; next.task.error = job.error || '시나리오 생성에 실패했습니다. 다시 시도하세요.';
    } else if (job.state === 'running') next.task.state = 'running';
  }
  if (busy(next) && now >= task.deadline) {
    next.task.state = 'failed'; next.task.error = '시나리오 생성 시간이 초과됐습니다. 계정 실행기 상태를 확인하고 다시 시도하세요.';
  }
  if (JSON.stringify(next.task) === JSON.stringify(task)) return project;
  next = changed(next);
  if (!await store.cas(next, project.revision)) return await store.get(project.id) || project;
  // Only acknowledge after the project CAS succeeds; results survive a lost race.
  if (!busy(next)) await acknowledge();
  return next;
}
