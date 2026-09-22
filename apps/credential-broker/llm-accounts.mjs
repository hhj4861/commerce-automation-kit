import { readVault, writeVault } from './vault.mjs';
import { validateBrief } from '../shopshorts/lib/studio.js';

// Credentials, prompts and results are encrypted together. Only the authenticated
// Pages service chooses an owner; browser request bodies never choose one.
const nameFor = owner => {
  if (!/^[a-f0-9]{64}$/.test(owner || '')) throw new Error('invalid owner');
  return `llm/account/${owner}`;
};
const problem = (error, status = 409) => ({ error, status });
const active = (job, now) => job && ['queued', 'running'].includes(job.state) && job.deadline > now;
const savedRecommendations = value => value.recommendations || [];
const recommendation = (job, now) => ({ id: job.id, input: job.input, state: job.state, result: job.result,
  error: job.error, elapsedMs: Math.max(0, now - (job.createdAt || job.deadline - 240000)), occurredAt: new Date(now).toISOString(), read: false });
const notification = item => ({ id: `recommendation:${item.id}`, source: 'recommendation', sourceId: item.id,
  title: item.state === 'done' ? `${item.input?.focus === 'direction' ? '분위기' : '이야기'} 추천이 준비됐어요` : 'AI 추천을 완료하지 못했어요',
  name: `${item.input?.category || '영상 기획'} · ${item.state === 'done' ? '제안을 확인하고 적용하세요' : '결과를 열어 다시 시도하세요'}`,
  kind: item.state === 'done' ? 'success' : 'error', occurredAt: item.occurredAt, read: item.read,
  href: `/studio?new=1&recommendation=${encodeURIComponent(item.id)}` });
export function publicAccount(value = {}, now = Date.now()) {
  const job = value.job;
  const expired = job && ['queued', 'running'].includes(job.state) && (job.deadline <= now || (job.state === 'running' && job.leaseUntil <= now));
  const state = expired ? 'failed' : job?.state;
  const device = !expired && job?.kind === 'connect' && state === 'running' ? job.device : null;
  const manual = !expired && job?.kind === 'connect' && state === 'running' ? job.manual : null;
  return {
    connected: !!value.credential, provider: value.credential ? value.provider || 'codex' : null,
    account: value.credential ? String(value.account || (value.provider === 'claude' ? 'Claude' : 'ChatGPT')).slice(0, 200) : null,
    job: job ? { id: job.id, kind: job.kind, provider: job.provider || value.provider || 'codex', state, deadline: job.deadline,
      error: expired ? '연결 시간이 지났거나 실행기가 중단됐습니다. 다시 시도하세요.' : job.error || null,
      ...(device ? { device: { url: device.url, code: device.code } } : {}),
      ...(manual ? { manual: { url: manual.url }, codeSubmitted: job.codeSubmitted === true } : {}),
      ...(state === 'done' && job.kind === 'recommend' ? { result: job.result } : {}) } : null,
  };
}

// Preserve completed results separately before replacing the account job.
// Account revision orders competing snapshots; a stale cancellation cannot
// overwrite a newer completed result even if its eventual account CAS fails.
const uuid = value => /^[a-f0-9-]{36}$/.test(value || '');
const scenarioName = (owner, id) => `llm/scenario/${owner}/${id}`;
function scenarioJob(value, now) {
  const job = publicAccount(value, now).job;
  if (job?.kind !== 'scenario') return null;
  return { ...job, projectId: value.job.projectId,
    ...(job.state === 'done' ? { result: value.job.result } : {}) };
}
async function retainScenario(env, owner, record, now) {
  const value = record?.value || {};
  const job = scenarioJob(value, now);
  if (!job || value.job.acknowledged) return;
  const snapshot = ['queued', 'running'].includes(job.state)
    ? { ...job, state: 'failed', error: '계정 연결 또는 생성 요청이 취소됐습니다.' } : job;
  const name = scenarioName(owner, job.id);
  for (let attempt = 0; attempt < 3; attempt++) {
    const previous = await readVault(env, name);
    if (previous?.value.sourceRevision >= record.revision) return;
    try { await writeVault(env, name, { sourceRevision: record.revision, job: snapshot }, previous?.revision || 0); return; }
    catch (error) { if (error.status !== 409 || attempt === 2) throw error; }
  }
}

export async function accountAction(env, owner, operation, input = {}, now = Date.now()) {
  const name = nameFor(owner);
  const record = await readVault(env, name);
  const value = record?.value || {};
  if (operation === 'scenario-status' || operation === 'scenario-ack') {
    if (!uuid(input.id) || !uuid(input.projectId)) return problem('시나리오 요청을 확인하세요.', 400);
    const current = value.job?.id === input.id;
    const archived = current ? null : await readVault(env, scenarioName(owner, input.id));
    const job = current ? scenarioJob(value, now) : archived?.value.job;
    if (!job || job.projectId !== input.projectId) return { job: null };
    if (operation === 'scenario-status') return { job };
    if (current && value.job.acknowledged) return { ok: true };
    if (['queued', 'running'].includes(job.state)) return problem('아직 생성 중입니다.');
    if (current) await writeVault(env, name, { ...value, job: { ...value.job, result: null, acknowledged: true } }, record.revision);
    // Keep the source revision tombstone to fence delayed archival writers.
    else await writeVault(env, scenarioName(owner, input.id), { sourceRevision: archived.value.sourceRevision, job: null }, archived.revision);
    return { ok: true };
  }
  if (operation === 'notifications') {
    const items = savedRecommendations(value).map(notification);
    return { items, unreadCount: items.filter(item => !item.read).length };
  }
  if (operation === 'recommendation') {
    const saved = savedRecommendations(value).find(item => item.id === input.id);
    const current = value.job?.kind === 'recommend' && value.job.id === input.id ? value.job : null;
    if (saved) return { recommendation: saved };
    if (current) return { recommendation: { ...recommendation(current, now), state: publicAccount(value, now).job.state, error: publicAccount(value, now).job.error } };
    return problem('보관된 추천을 찾지 못했어요. 최근 추천은 최대 10개까지 보관됩니다.', 404);
  }
  if (operation === 'notification-read') {
    if (typeof input.read !== 'boolean' || !Array.isArray(input.ids) || input.ids.length > 10 || input.ids.some(id => typeof id !== 'string')) return problem('읽음 처리할 알림을 확인하세요.', 400);
    const recommendations = savedRecommendations(value).map(item => input.ids.includes(item.id) ? { ...item, read: input.read } : item);
    if (input.ids.some(id => !recommendations.some(item => item.id === id))) return problem('알림을 찾지 못했어요.', 404);
    await writeVault(env, name, { ...value, recommendations }, record?.revision || 0);
    return { ok: true };
  }
  if (operation === 'status') {
    const heartbeat = await readVault(env, 'llm/runtime');
    return { ...publicAccount(value, now), available: heartbeat?.value.at > now - 30000,
      scenarioAvailable: heartbeat?.value.at > now - 30000 && heartbeat.value.scenario === true,
      providers: [{ id: 'codex', available: true }, { id: 'claude', available: true }] };
  }
  if (operation === 'code') {
    const job = value.job;
    if (job?.id !== input.id || job.provider !== 'claude' || job.kind !== 'connect' || job.state !== 'running' || !active(job, now) || job.leaseUntil <= now || !job.manual || job.codeSubmitted) return problem('진행 중인 Claude 인증 요청을 확인하세요.');
    if (typeof input.code !== 'string' || input.code.startsWith('sk-') || !/^[A-Za-z0-9._~+=/-]{8,2048}(#[A-Za-z0-9._~-]{8,512})?$/.test(input.code)) return problem('토큰이 아닌 공식 인증 화면의 일회용 코드를 입력하세요.', 400);
    const [code, state] = input.code.split('#');
    if (state && state !== job.manual.state) return problem('다른 연결 요청의 인증 코드입니다. 현재 인증 화면의 코드를 입력하세요.', 400);
    await writeVault(env, name, { ...value, job: { ...job, code: `${code}#${job.manual.state}`, codeSubmitted: true } }, record.revision);
    return publicAccount({ ...value, job: { ...job, codeSubmitted: true } }, now);
  }
  if (operation === 'disconnect' || operation === 'cancel') {
    if (operation === 'cancel' && input.id !== value.job?.id) return problem('이미 변경된 연결 요청입니다.');
    await retainScenario(env, owner, record, now);
    const next = { recommendations: savedRecommendations(value), lastRequest: value.lastRequest, lastKind: value.lastKind, lastProvider: value.lastProvider,
      ...(operation === 'disconnect' || value.job?.kind === 'connect' ? {} : { credential: value.credential, account: value.account, provider: value.provider }) };
    await writeVault(env, name, next, record?.revision || 0);
    return publicAccount(next, now);
  }
  if (!['connect', 'recommend', 'scenario'].includes(operation)) return problem('지원하지 않는 요청입니다.', 400);
  if (operation === 'connect' && !['codex', 'claude'].includes(input.provider)) return problem('Codex 또는 Claude를 선택하세요.', 400);
  if (active(value.job, now) && !(value.job.state === 'running' && value.job.leaseUntil <= now)) return problem('이미 연결 또는 생성 요청을 처리 중입니다.');
  if (operation === 'connect' && value.credential) return input.provider === (value.provider || 'codex') ? publicAccount(value, now) : problem('현재 계정을 해제한 뒤 다른 제공사를 연결하세요.');
  if (['recommend', 'scenario'].includes(operation) && !value.credential) return problem('LLM 계정을 먼저 연결하세요.', 428);
  if (operation === 'scenario') {
    if (!uuid(input.id) || !uuid(input.projectId)) return problem('시나리오 요청을 확인하세요.', 400);
    input = { ...input, brief: validateBrief(input.brief) };
  }
  const heartbeat = await readVault(env, 'llm/runtime');
  if (!(heartbeat?.value.at > now - 30000)) return problem('LLM 실행기가 오프라인입니다. 운영자에게 실행기 연결을 요청하세요.', 503);
  if (operation === 'scenario' && heartbeat.value.scenario !== true) return problem('시나리오를 지원하는 LLM 실행기를 연결하세요.', 503);
  const provider = operation === 'connect' ? input.provider : value.provider || 'codex';
  if (value.lastKind === operation && value.lastProvider === provider && value.lastRequest > now - 5000) return problem('잠시 후 다시 시도하세요.', 429);
  const job = { id: operation === 'scenario' ? input.id : crypto.randomUUID(), kind: operation, provider, state: 'queued', createdAt: now, deadline: now + (operation === 'connect' ? 600000 : 240000),
    ...(['recommend', 'scenario'].includes(operation) ? { input: input.brief } : {}),
    ...(operation === 'scenario' ? { projectId: input.projectId } : {}) };
  await retainScenario(env, owner, record, now);
  const next = { recommendations: savedRecommendations(value), credential: value.credential, account: value.account, provider, lastRequest: now, lastKind: operation, lastProvider: provider, job };
  await writeVault(env, name, next, record?.revision || 0);
  return publicAccount(next, now);
}

// Runner JWT is verified before entering this function. Revision CAS is the
// cross-process claim/fence: cancelling or disconnecting invalidates late writes.
export async function accountRunner(env, input) {
  if (input.operation === 'poll') {
    const previous = await readVault(env, 'llm/runtime');
    try { await writeVault(env, 'llm/runtime', { at: Date.now(), scenario: input.scenario === true }, previous?.revision || 0); }
    catch (e) { if (e.status !== 409) throw e; }
    const cursor = /^[a-f0-9]{64}$/.test(input.cursor || '') ? nameFor(input.cursor) : 'llm/account/';
    const rows = await env.DB.prepare('SELECT name FROM credential_vault WHERE name > ? AND name < ? AND updated_at > ? ORDER BY name LIMIT 50')
      .bind(cursor, 'llm/account0', new Date(Date.now() - 20 * 60000).toISOString()).all();
    const records = [];
    for (const row of rows.results || []) {
      const record = await readVault(env, row.name);
      if (active(record?.value.job, Date.now()) && (record.value.job.kind !== 'scenario' || input.scenario === true)) records.push({ owner: row.name.slice('llm/account/'.length), ...record });
    }
    return { records, cursor: rows.results?.length === 50 ? rows.results.at(-1).name.slice('llm/account/'.length) : null };
  }
  const name = nameFor(input.owner);
  if (input.operation === 'read') return { record: await readVault(env, name) };
  if (input.operation === 'write' && Number.isSafeInteger(input.revision) && input.revision > 0 && input.value && typeof input.value === 'object') {
    const current = await readVault(env, name);
    let recommendations = savedRecommendations(current?.value || {});
    const job = input.value.job;
    if (job?.kind === 'recommend' && ['done', 'failed'].includes(job.state) && !recommendations.some(item => item.id === job.id)) {
      recommendations = [recommendation(job, Date.now()), ...recommendations].slice(0, 10);
      // Bound the encrypted account payload below the runner's request limit.
      while (recommendations.length > 1 && new TextEncoder().encode(JSON.stringify(recommendations)).length > 120000) recommendations.pop();
    }
    // Completion, result and unread notification commit together under the same CAS.
    return { revision: await writeVault(env, name, { ...input.value, recommendations }, input.revision) };
  }
  throw new Error('invalid operation');
}
