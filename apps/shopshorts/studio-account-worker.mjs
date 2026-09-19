import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runnerRequest } from '../credential-broker/runner-client.mjs';
import { executeAccountJob } from './studio-account-codex.mjs';

export function accountBroker(env = process.env) {
  const base = env.CAK_SECRETS_URL || 'https://cak-credential-broker.guswhd1085.workers.dev';
  const key = env.CAK_RUNNER_KEY_FILE || resolve(import.meta.dirname, 'data/credential-runner.jwk');
  return (path, body) => runnerRequest(base, key, path, body);
}

export function startAccountWorker({ env = process.env, call = accountBroker(env), execute = executeAccountJob, intervalMs = 5000, log = console.error, keepAlive = false } = {}) {
  const ownerId = randomUUID(), tasks = new Map(); let cursor = null, polling = false, stopped = false;
  const accountCall = body => call('/runner/accounts', body);
  async function launch(record) {
    const { owner } = record;
    const controller = new AbortController();
    const initial = { ...record.value, job: { ...record.value.job, state: 'running', runner: ownerId, leaseUntil: Date.now() + 60000 } };
    try { await accountCall({ operation: 'write', owner, revision: record.revision, value: initial }); }
    catch { return; } // Another runner or cancellation won the claim.
    if (stopped) return;
    let serial = Promise.resolve();
    const update = patch => {
      const next = serial.then(async () => {
        const { record: fresh } = await accountCall({ operation: 'read', owner });
        const job = fresh?.value.job;
        if (job?.id !== initial.job.id || job.runner !== ownerId || job.state !== 'running') throw Object.assign(new Error('Account request changed'), { code: 'STALE_ACCOUNT' });
        if (job.leaseUntil <= Date.now() || job.deadline <= Date.now()) throw new Error('Account lease expired');
        const value = { ...fresh.value, ...patch, job: { ...job, ...patch.job, leaseUntil: Date.now() + 60000 } };
        await accountCall({ operation: 'write', owner, revision: fresh.revision, value });
      });
      serial = next.catch(error => { controller.abort(error); });
      return next;
    };
    const deadline = setTimeout(() => controller.abort(), Math.max(1, initial.job.deadline - Date.now()));
    const renew = setInterval(() => update({}).catch(() => {}), 10000);
    const task = { controller, done: null };
    tasks.set(owner, task);
    task.done = (async () => {
      try { await execute(initial, { signal: controller.signal, update, env }); }
      catch {
        if (!controller.signal.aborted) await update({ job: { state: 'failed', device: null, error: 'Codex 요청에 실패했습니다. 계정을 다시 연결하거나 구독 사용 한도와 실행기 상태를 확인하세요.' } }).catch(() => {});
      } finally { clearTimeout(deadline); clearInterval(renew); await serial; tasks.delete(owner); }
    })();
  }
  const tick = async () => {
    if (polling || stopped) return;
    polling = true;
    try {
      const batch = await accountCall({ operation: 'poll', cursor }); cursor = batch.cursor;
      if (stopped) return;
      for (const record of batch.records) {
        if (record.value.job.state !== 'queued' || tasks.has(record.owner) || tasks.size >= 4) continue;
        await launch(record);
      }
    } catch { log('[llm-accounts] Cloudflare 연결 확인 실패; 다음 주기에 재확인합니다.'); }
    finally { polling = false; }
  };
  const timer = setInterval(tick, intervalMs); if (!keepAlive) timer.unref();
  tick();
  return { tick, async stop() { stopped = true; clearInterval(timer); for (const task of tasks.values()) task.controller.abort(); await Promise.all([...tasks.values()].map(task => task.done)); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const worker = startAccountWorker({ keepAlive: true });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await worker.stop(); process.exit(0); });
}
