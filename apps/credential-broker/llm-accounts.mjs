import { readVault, writeVault } from './vault.mjs';

// Credentials, prompts and results are encrypted together. Only the authenticated
// Pages service chooses an owner; browser request bodies never choose one.
const nameFor = owner => {
  if (!/^[a-f0-9]{64}$/.test(owner || '')) throw new Error('invalid owner');
  return `llm/account/${owner}`;
};
const problem = (error, status = 409) => ({ error, status });
const active = (job, now) => job && ['queued', 'running'].includes(job.state) && job.deadline > now;
export function publicAccount(value = {}, now = Date.now()) {
  const job = value.job;
  const expired = job && ['queued', 'running'].includes(job.state) && (job.deadline <= now || (job.state === 'running' && job.leaseUntil <= now));
  const state = expired ? 'failed' : job?.state;
  const device = !expired && job?.kind === 'connect' && state === 'running' ? job.device : null;
  return {
    connected: !!value.credential, provider: value.credential ? 'codex' : null,
    account: value.credential ? String(value.account || 'ChatGPT').slice(0, 200) : null,
    job: job ? { id: job.id, kind: job.kind, state, deadline: job.deadline,
      error: expired ? '연결 시간이 지났거나 실행기가 중단됐습니다. 다시 시도하세요.' : job.error || null,
      ...(device ? { device: { url: device.url, code: device.code } } : {}),
      ...(state === 'done' && job.kind === 'recommend' ? { result: job.result } : {}) } : null,
  };
}

export async function accountAction(env, owner, operation, input = {}, now = Date.now()) {
  const name = nameFor(owner);
  const record = await readVault(env, name);
  const value = record?.value || {};
  if (operation === 'status') {
    const heartbeat = await readVault(env, 'llm/runtime');
    return { ...publicAccount(value, now), available: heartbeat?.value.at > now - 30000,
      providers: [{ id: 'codex', available: true }, { id: 'claude', available: false,
        reason: 'Claude 구독 OAuth는 타사 앱의 토큰 수집·저장을 허용하지 않습니다. 공식 API 키 연결이 필요합니다.' }] };
  }
  if (operation === 'disconnect' || operation === 'cancel') {
    if (operation === 'cancel' && input.id !== value.job?.id) return problem('이미 변경된 연결 요청입니다.');
    const next = { lastRequest: value.lastRequest, lastKind: value.lastKind,
      ...(operation === 'disconnect' || value.job?.kind === 'connect' ? {} : { credential: value.credential, account: value.account }) };
    await writeVault(env, name, next, record?.revision || 0);
    return publicAccount(next, now);
  }
  if (!['connect', 'recommend'].includes(operation)) return problem('지원하지 않는 요청입니다.', 400);
  if (operation === 'connect' && input.provider !== 'codex') return problem('Claude 구독 토큰 연결은 지원되지 않습니다. Codex를 선택하세요.', 400);
  if (active(value.job, now) && !(value.job.state === 'running' && value.job.leaseUntil <= now)) return problem('이미 연결 또는 추천 요청을 처리 중입니다.');
  if (operation === 'connect' && value.credential) return publicAccount(value, now);
  if (operation === 'recommend' && !value.credential) return problem('LLM 계정을 먼저 연결하세요.', 428);
  const heartbeat = await readVault(env, 'llm/runtime');
  if (!(heartbeat?.value.at > now - 30000)) return problem('LLM 실행기가 오프라인입니다. 운영자에게 실행기 연결을 요청하세요.', 503);
  if (value.lastKind === operation && value.lastRequest > now - 5000) return problem('잠시 후 다시 시도하세요.', 429);
  const job = { id: crypto.randomUUID(), kind: operation, state: 'queued', deadline: now + (operation === 'connect' ? 600000 : 240000),
    ...(operation === 'recommend' ? { input: input.brief } : {}) };
  const next = { credential: value.credential, account: value.account, lastRequest: now, lastKind: operation, job };
  await writeVault(env, name, next, record?.revision || 0);
  return publicAccount(next, now);
}

// Runner JWT is verified before entering this function. Revision CAS is the
// cross-process claim/fence: cancelling or disconnecting invalidates late writes.
export async function accountRunner(env, input) {
  if (input.operation === 'poll') {
    const previous = await readVault(env, 'llm/runtime');
    try { await writeVault(env, 'llm/runtime', { at: Date.now() }, previous?.revision || 0); }
    catch (e) { if (e.status !== 409) throw e; }
    const cursor = /^[a-f0-9]{64}$/.test(input.cursor || '') ? nameFor(input.cursor) : 'llm/account/';
    const rows = await env.DB.prepare('SELECT name FROM credential_vault WHERE name > ? AND name < ? AND updated_at > ? ORDER BY name LIMIT 50')
      .bind(cursor, 'llm/account0', new Date(Date.now() - 20 * 60000).toISOString()).all();
    const records = [];
    for (const row of rows.results || []) {
      const record = await readVault(env, row.name);
      if (active(record?.value.job, Date.now())) records.push({ owner: row.name.slice('llm/account/'.length), ...record });
    }
    return { records, cursor: rows.results?.length === 50 ? rows.results.at(-1).name.slice('llm/account/'.length) : null };
  }
  const name = nameFor(input.owner);
  if (input.operation === 'read') return { record: await readVault(env, name) };
  if (input.operation === 'write' && Number.isSafeInteger(input.revision) && input.revision > 0 && input.value && typeof input.value === 'object') {
    return { revision: await writeVault(env, name, input.value, input.revision) };
  }
  throw new Error('invalid operation');
}
