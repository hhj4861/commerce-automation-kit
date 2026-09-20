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

export async function accountAction(env, owner, operation, input = {}, now = Date.now()) {
  const name = nameFor(owner);
  const record = await readVault(env, name);
  const value = record?.value || {};
  if (operation === 'status') {
    const heartbeat = await readVault(env, 'llm/runtime');
    return { ...publicAccount(value, now), available: heartbeat?.value.at > now - 30000,
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
    const next = { lastRequest: value.lastRequest, lastKind: value.lastKind, lastProvider: value.lastProvider,
      ...(operation === 'disconnect' || value.job?.kind === 'connect' ? {} : { credential: value.credential, account: value.account, provider: value.provider }) };
    await writeVault(env, name, next, record?.revision || 0);
    return publicAccount(next, now);
  }
  if (!['connect', 'recommend'].includes(operation)) return problem('지원하지 않는 요청입니다.', 400);
  if (operation === 'connect' && !['codex', 'claude'].includes(input.provider)) return problem('Codex 또는 Claude를 선택하세요.', 400);
  if (active(value.job, now) && !(value.job.state === 'running' && value.job.leaseUntil <= now)) return problem('이미 연결 또는 추천 요청을 처리 중입니다.');
  if (operation === 'connect' && value.credential) return input.provider === (value.provider || 'codex') ? publicAccount(value, now) : problem('현재 계정을 해제한 뒤 다른 제공사를 연결하세요.');
  if (operation === 'recommend' && !value.credential) return problem('LLM 계정을 먼저 연결하세요.', 428);
  const heartbeat = await readVault(env, 'llm/runtime');
  if (!(heartbeat?.value.at > now - 30000)) return problem('LLM 실행기가 오프라인입니다. 운영자에게 실행기 연결을 요청하세요.', 503);
  const provider = operation === 'connect' ? input.provider : value.provider || 'codex';
  if (value.lastKind === operation && value.lastProvider === provider && value.lastRequest > now - 5000) return problem('잠시 후 다시 시도하세요.', 429);
  const job = { id: crypto.randomUUID(), kind: operation, provider, state: 'queued', deadline: now + (operation === 'connect' ? 600000 : 240000),
    ...(operation === 'recommend' ? { input: input.brief } : {}) };
  const next = { credential: value.credential, account: value.account, provider, lastRequest: now, lastKind: operation, lastProvider: provider, job };
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
