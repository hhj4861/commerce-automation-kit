import { busy, changeProject, fail } from './studio.js';
import { llmOwner } from './llm-account-api.js';
import { readScenarioRejection } from './scenario-rejection.js';
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
  next.task = { ...next.task, runner: 'llm-account', accountOwner: owner, deadline: Date.now() + 900000 };
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
  const acknowledge = async saved => {
    if (saved.task.brokerAcknowledged === true) return saved;
    try {
      const result = await call(task.accountOwner, 'scenario-ack', input);
      // No job is also terminal: an older result may already have been cleared.
      if (result?.error || !(result?.ok === true || result && Object.hasOwn(result, 'job') && result.job === null)) return saved;
      const acknowledged = changed({ ...saved, task: { ...saved.task, brokerAcknowledged: true } });
      // Persist per task, after receipt success. A new task/revision must not be overwritten.
      return await store.cas(acknowledged, saved.revision) ? acknowledged : await store.get(saved.id) || saved;
    } catch { return saved; /* Retry on the next read; never pretend acknowledgement succeeded. */ }
  };
  const legacyFailure=task.state==='failed' && task.reviewAvailable===undefined && task.brokerAcknowledged!==true;
  if (!busy(project) && !legacyFailure) return acknowledge(project);
  let job, received=false;
  try { const status=await call(task.accountOwner, 'scenario-status', input); if(status&&!status.error&&Object.hasOwn(status,'job')){job=status.job;received=true;} }
  catch { /* Temporary broker outage must not discard a result. */ }
  let next = structuredClone(project);
  if(legacyFailure&&!received)return project;
  const matches=job && job.id===task.id && job.projectId===project.id;
  if(legacyFailure)next.task.reviewAvailable=!!(matches&&job.state==='failed'&&await readScenarioRejection(job.rejection));
  else if (matches) {
    if (job.state === 'done') {
      try {
        Object.assign(next, scenarioResult(job.result, project.brief), { assets: {}, edit: null, approved: false, render: null });
        next.task.state = 'done';
      } catch {
        next.task.state = 'failed'; next.task.error = '시나리오 형식 또는 길이가 맞지 않습니다. 다시 생성하세요.';
      }
    } else if (job.state === 'failed') {
      next.task.state = 'failed'; next.task.error = job.error || '시나리오 생성에 실패했습니다. 다시 시도하세요.';
      next.task.reviewAvailable=!!await readScenarioRejection(job.rejection);
    } else if (job.state === 'running') {next.task.state = 'running';if(['research','scenario','review','revision'].includes(job.phase))next.task.phase=job.phase;}
  }
  if (busy(next) && now >= task.deadline) {
    next.task.state = 'failed';
    const phase={research:'자료 검색',scenario:'대본 작성',review:'대본 검토',revision:'대본 보완'}[next.task.phase]||'계정 실행기 응답 대기';
    next.task.error = `${phase} 단계에서 제한 시간을 초과했습니다. 요청 ${task.id}의 실행기 상태를 확인한 뒤 다시 시도하세요.`;
  }
  if (JSON.stringify(next.task) === JSON.stringify(task)) return project;
  next = changed(next);
  if (!await store.cas(next, project.revision)) return await store.get(project.id) || project;
  // Only acknowledge after the project CAS succeeds; results survive a lost race.
  if (!busy(next)) return acknowledge(next);
  return next;
}
