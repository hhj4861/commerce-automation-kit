import {readScenarioRejection} from './lib/scenario-rejection.js';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runnerRequest } from '../credential-broker/runner-client.mjs';
import { executeAccountJob } from './studio-account-codex.mjs';
import { executeClaudeAccountJob } from './studio-account-claude.mjs';
import { discoveryRuntimeEnv } from '../../services/topic-discovery/runtime-config.mjs';
import { accountFailureCode, accountFailureMessage } from './lib/llm-account-errors.js';

export async function executeProviderJob(value, context) {
  let env = context.env;
  if (value.job.kind === 'recommend') {
    try { env = await discoveryRuntimeEnv(env, 'shopshorts'); }
    catch { throw Object.assign(new Error('Discovery credentials unavailable'), { code: 'DISCOVERY_UNAVAILABLE' }); }
  }
  return (value.job.provider === 'claude' ? executeClaudeAccountJob : executeAccountJob)(value, { ...context, env });
}

export function accountBroker(env = process.env) {
  const base = env.CAK_SECRETS_URL || 'https://cak-credential-broker.guswhd1085.workers.dev';
  const key = env.CAK_RUNNER_KEY_FILE || resolve(import.meta.dirname, 'data/credential-runner.jwk');
  return (path, body) => runnerRequest(base, key, path, body);
}

// A dropped broker response is not proof that its CAS write failed. Reconcile
// before retrying; never replay against a new revision or restore a cancelled job.
const transient = error => error?.name === 'TimeoutError' ||
  (error instanceof TypeError && error.message === 'fetch failed') ||
  [429, 502, 503, 504].includes(error?.status);
const withoutHistory = ({ recommendations, ...value }) => value;
const LEASE_MS = 120000; // Covers a bounded read/write retry; job deadline still wins.

export function startAccountWorker({ env = process.env, call = accountBroker(env), execute = executeProviderJob, intervalMs = 5000, log = console.error, keepAlive = false, retryDelayMs = 250, renewIntervalMs = 10000 } = {}) {
  const ownerId = randomUUID(), tasks = new Map(); let cursor = null, polling = false, stopped = false;
  const accountCall = async body => {
    for (let attempt = 0; ; attempt++) {
      try { return await call('/runner/accounts', body); }
      catch (error) {
        if (!transient(error) && !(body.operation === 'write' && error.status === 409)) throw error;
        if (body.operation === 'write') {
          try {
            const {record} = await call('/runner/accounts', {operation:'read', owner:body.owner});
            if (record?.revision > body.revision && isDeepStrictEqual(withoutHistory(record.value), withoutHistory(body.value))) return {revision:record.revision};
          } catch (readError) { if (!transient(readError)) throw readError; }
        }
        if (!transient(error) || attempt >= 1 || stopped) throw error;
        await delay(retryDelayMs);
      }
    }
  };
  async function launch(record) {
    const { owner } = record;
    const controller = new AbortController();
    const initial = { ...record.value, job: { ...record.value.job, state: 'running', runner: ownerId, leaseUntil: Math.min(record.value.job.deadline, Date.now() + LEASE_MS) } };
    try { await accountCall({ operation: 'write', owner, revision: record.revision, value: initial }); }
    catch { return; } // Another runner or cancellation won the claim.
    if (stopped) return;
    let serial = Promise.resolve();
    const read = async () => {
      const { record: fresh } = await accountCall({ operation: 'read', owner });
      const job = fresh?.value.job;
      if (job?.id !== initial.job.id || job.runner !== ownerId || job.state !== 'running') throw Object.assign(new Error('Account request changed'), { code: 'STALE_ACCOUNT' });
      if (job.leaseUntil <= Date.now() || job.deadline <= Date.now()) throw new Error('Account lease expired');
      return fresh;
    };
    const update = patch => {
      const next = serial.then(async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const fresh = await read();
          const value = { ...fresh.value, ...patch, job: { ...fresh.value.job, ...patch.job, leaseUntil: Math.min(initial.job.deadline, Date.now() + LEASE_MS) } };
          try { await accountCall({ operation: 'write', owner, revision: fresh.revision, value }); return; }
          catch (e) { if (e.status !== 409 || attempt === 2) throw e; }
        }
      });
      serial = next.catch(error => { controller.abort(error); });
      return next;
    };
    const deadline = setTimeout(() => controller.abort(), Math.max(1, initial.job.deadline - Date.now()));
    // Keep at most one renewal pending: slow broker calls must not queue ahead
    // of progress, credential rotation or final completion indefinitely.
    let renewing = false;
    const renew = setInterval(() => {
      if (renewing || controller.signal.aborted) return;
      renewing = true;
      update({}).catch(() => {}).finally(() => { renewing = false; });
    }, renewIntervalMs);
    const task = { controller, done: null };
    tasks.set(owner, task);
    task.done = (async () => {
      try { await execute(initial, { signal: controller.signal, subject: owner, update, read: async () => (await read()).value, env }); }
      catch (error) {
        if (!controller.signal.aborted) {
          log(`[llm-accounts] ${initial.job.provider === 'claude' ? 'claude' : 'codex'} ${['connect', 'recommend', 'scenario'].includes(initial.job.kind) ? initial.job.kind : 'unknown'} ${accountFailureCode(error)}`);
          const rejection = initial.job.kind === 'scenario' && error.code === 'SCENARIO_DEPTH_INVALID' ? await readScenarioRejection(error.rejection) : null;
          await update({ job: { state: 'failed', device: null, manual: null, code: null, rejection, error: accountFailureMessage(initial.job.provider, error) + (error.code === 'SCENARIO_DEPTH_INVALID' && !rejection ? ' 상세 검토 자료를 보관하지 못했습니다.' : '') } }).catch(() => {});
        }
      } finally { clearTimeout(deadline); clearInterval(renew); await serial; tasks.delete(owner); }
    })();
  }
  const tick = async () => {
    if (polling || stopped) return;
    polling = true;
    try {
      const batch = await accountCall({ operation: 'poll', cursor, scenario: true }); cursor = batch.cursor;
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
