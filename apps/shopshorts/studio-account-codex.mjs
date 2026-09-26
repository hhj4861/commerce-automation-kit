import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexEnvironment, createCodexGenerator } from './studio-codex.mjs';
import { recommendBrief } from './lib/studio-recommendations.js';
import { scenarioBrief } from './lib/studio-scenario.js';

const failure = () => new Error('Codex 인증을 확인하지 못했습니다. 다시 연결하거나 구독 사용 한도를 확인하세요.');
export function safeDevice(login) {
  const url = new URL(login.verificationUrl);
  if (url.origin !== 'https://auth.openai.com' || url.pathname !== '/codex/device' || url.search || url.hash || url.username || url.password || !/^[A-Za-z0-9-]{4,32}$/.test(login.userCode || '')) throw failure();
  return { url: url.href, code: login.userCode };
}

// Official app-server manages device OAuth and refresh. No copied client IDs,
// private endpoints, token exchange implementation or developer-home credentials.
export async function openAccountServer(env, { signal, spawnProcess = spawn } = {}) {
  const child = spawnProcess('codex', ['app-server'], { cwd: env.CODEX_HOME, env: codexEnvironment(env), stdio: ['pipe', 'pipe', 'pipe'], shell: false });
  const pending = new Map(); let seq = 0, buffer = '', closed = false, onNotification = () => {};
  const closedPromise = new Promise(resolve => child.once('close', resolve));
  const rejectPending = () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(failure()); } pending.clear(); };
  const abort = () => { child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 1500); timer.unref(); closedPromise.then(() => clearTimeout(timer)); };
  signal?.addEventListener('abort', abort, { once: true });
  child.on('error', () => { closed = true; rejectPending(); });
  child.once('close', () => { closed = true; rejectPending(); signal?.removeEventListener('abort', abort); onNotification({ method: 'closed' }); });
  child.stderr.resume(); child.stdin.on('error', () => {}); child.stdout.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    if (buffer.length > 1024 * 1024) { abort(); return; }
    let index;
    while ((index = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, index); buffer = buffer.slice(index + 1);
      let event; try { event = JSON.parse(line); } catch { abort(); return; }
      if (event.method && event.id !== undefined) { child.stdin.write(JSON.stringify({ id: event.id, error: { code: -32601, message: 'Unsupported request' } }) + '\n'); continue; }
      if (event.id !== undefined) { const p = pending.get(event.id); if (p) { pending.delete(event.id); clearTimeout(p.timer); event.error ? p.reject(failure()) : p.resolve(event.result); } }
      else onNotification(event);
    }
  });
  const rpc = {
    set notification(fn) { onNotification = fn; },
    call(method, params) {
      if (closed || signal?.aborted) return Promise.reject(failure());
      return new Promise((resolve, reject) => {
        const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(failure()); abort(); }, 30000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
      });
    },
    async close() { if (!closed) abort(); await closedPromise; },
  };
  try {
    if (signal?.aborted) abort();
    await rpc.call('initialize', { clientInfo: { name: 'shopshorts', version: '1.0.0' }, capabilities: {} });
    child.stdin.write('{"method":"initialized"}\n');
    return rpc;
  } catch (e) { await rpc.close(); throw e; }
}

export async function executeAccountJob(value, { signal, update, env = process.env, openServer = openAccountServer, generator = createCodexGenerator } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'shopshorts-account-'));
  const codexHome = join(home, '.codex'); let rpc, retainCache = false;
  const persist = async patch => {
    try { await update(patch); }
    catch (e) {
      if (e.code !== 'STALE_ACCOUNT' && signal?.reason?.code !== 'STALE_ACCOUNT' && patch.credential) retainCache = true;
      throw e;
    }
  };
  const runtime = { ...codexEnvironment(env), HOME: home, CODEX_HOME: codexHome };
  const authFile = join(codexHome, 'auth.json');
  const credential = async () => {
    const auth = JSON.parse(await readFile(authFile, 'utf8'));
    if (auth.auth_mode !== 'chatgpt' || !auth.tokens?.refresh_token || !auth.tokens?.access_token) throw failure();
    return auth;
  };
  try {
    await mkdir(codexHome, { mode: 0o700 });
    await writeFile(join(codexHome, 'config.toml'), 'cli_auth_credentials_store = "file"\n', { mode: 0o600 });
    if (value.credential) await writeFile(authFile, JSON.stringify(value.credential), { mode: 0o600 });
    rpc = await openServer(runtime, { signal });
    if (value.job.kind === 'connect') {
      let finish;
      const completed = new Promise(resolve => { finish = resolve; });
      rpc.notification = event => {
        if (event.method === 'account/login/completed') finish(event.params);
        if (event.method === 'closed') finish({ success: false });
      };
      const login = await rpc.call('account/login/start', { type: 'chatgptDeviceCode' });
      await update({ job: { device: safeDevice(login) } });
      const outcome = await completed;
      if (!outcome?.success || outcome.loginId !== login.loginId) throw failure();
    }
    const result = await rpc.call('account/read', { refreshToken: true });
    if (result.account?.type !== 'chatgpt') throw failure();
    await persist({ credential: await credential(), account: result.account.email || 'ChatGPT' });
    await rpc.close(); rpc = null;
    if (value.job.kind === 'connect') { await update({ job: { state: 'done', device: null } }); return; }
    try {
      const result = await (value.job.kind === 'scenario' ? scenarioBrief : recommendBrief)(value.job.input, env, { history: value.recommendations, generate: generator({ env: runtime }), signal });
      await persist({ credential: await credential(), job: { state: 'done', result } });
    } catch (e) {
      // Official CLI may rotate even on a failed generation; persist before cleanup.
      await persist({ credential: await credential() });
      throw e;
    }
  } finally {
    if (rpc) await rpc.close();
    if (retainCache) console.error('[llm-accounts] 인증 갱신 저장 실패. 복구용 비공개 캐시 보존:', home);
    else await rm(home, { recursive: true, force: true });
  }
}
