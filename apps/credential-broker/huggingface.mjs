import {readVault, writeVault} from './vault.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const publicState = value => ({configured: !!value.token, name: value.name || '', updatedAt: value.updatedAt || null,
  job: value.job ? {id:value.job.id, phase:value.job.phase, eventId:value.job.eventId, prompt:value.job.prompt || ''} : null});

// Private service-binding / signed-runner API only. The browser never receives token/URL.
export async function huggingFaceAccount(env, owner, operation, input = {}) {
  if (!/^[a-f0-9]{64}$/.test(owner || '')) fail('invalid owner');
  const key = `huggingface/${owner}`, record = await readVault(env, key);
  const value = record?.value || {}, revision = record?.revision || 0;
  if (operation === 'status') return publicState(value);
  if (operation === 'credential') return {...value, revision};
  if (operation === 'save') {
    if (!/^hf_[A-Za-z0-9]{10,200}$/.test(input.token || '') || typeof input.name !== 'string' || input.name.length > 100) fail('invalid credential');
    if (value.job) fail('clear job before replacing account', 409);
    await writeVault(env, key, {token:input.token, name:input.name, updatedAt:new Date().toISOString()}, revision);
  } else if (operation === 'disconnect') {
    if (value.job) fail('clear job before disconnecting account', 409);
    await writeVault(env, key, {}, revision);
  } else if (operation === 'reserve') {
    if (!/^[a-f0-9-]{36}$/.test(input.id || '')) fail('invalid request');
    if (value.job || input.revision !== revision || !value.token) fail('account or job changed', 409);
    value.job = {id:input.id, phase:'checking'};
    await writeVault(env, key, value, revision);
  } else if (operation === 'update') {
    if (!value.job || value.job.id !== input.id || value.job.phase !== input.expected) fail('job changed', 409);
    const allowed = {checking:['uncertain','failed'], uncertain:['submitted'], submitted:['complete','failed']};
    if (!allowed[value.job.phase]?.includes(input.phase)) fail('invalid transition');
    const job = {...value.job, phase:input.phase};
    if (input.phase === 'submitted') {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input.eventId || '')) fail('invalid event');
      job.eventId = input.eventId;
    }
    if (input.phase === 'complete') {
      const url = new URL(input.url);
      if (url.origin !== 'https://kandinskylab-kandinsky-6-0-pro-distill-5s.hf.space' || !url.pathname.startsWith('/gradio_api/file=') || url.username || url.password) fail('invalid media');
      job.url = url.href; job.prompt = String(input.prompt || '').slice(0,16000);
    }
    await writeVault(env, key, {...value,job}, revision);
  } else if (operation === 'clear') {
    if (!value.job || value.job.id !== input.id) fail('job changed',409);
    await writeVault(env, key, {...value,job:null}, revision);
  } else fail('invalid operation');
  return publicState((await readVault(env,key))?.value || {});
}
