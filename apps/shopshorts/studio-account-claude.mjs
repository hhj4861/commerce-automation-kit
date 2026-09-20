import { spawn, execFile } from 'node:child_process';
import { promisify, stripVTControlCharacters } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recommendBrief } from './lib/studio-recommendations.js';
import { claudeFailure as failure, classifyClaudeFailure } from './lib/llm-account-errors.js';

const exec = promisify(execFile);
export const claudeEnvironment = env => Object.fromEntries(['HOME', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'SSL_CERT_FILE', 'NODE_EXTRA_CA_CERTS', 'CLAUDE_CONFIG_DIR'].filter(k => env[k]).map(k => [k, env[k]]));
export function safeClaudeLogin(value) {
  const url = new URL(value);
  const routes = { 'https://claude.com': ['/cai/oauth/authorize'], 'https://claude.ai': ['/oauth/authorize'] };
  if (!routes[url.origin]?.includes(url.pathname) || url.username || url.password || url.hash || !/^[A-Za-z0-9._~-]{8,512}$/.test(url.searchParams.get('state') || '') || !url.searchParams.get('code_challenge') || url.searchParams.get('code_challenge_method') !== 'S256') throw failure();
  const redirect = new URL(url.searchParams.get('redirect_uri'));
  if (redirect.origin !== 'https://platform.claude.com' || redirect.pathname !== '/oauth/code/callback' || redirect.search || redirect.hash || redirect.username || redirect.password) throw failure();
  return { url: url.href, state: url.searchParams.get('state') };
}

function childRun(args, { env, signal, input, onOutput, spawnProcess = spawn, timeoutMs = 180000 }) {
  const child = spawnProcess('claude', args, { cwd: env.HOME, env: { ...claudeEnvironment(env), BROWSER: '/usr/bin/true' }, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
  let output = '', diagnostic = '', size = 0, failed = false, killTimer, failureCode;
  const stop = () => { child.kill('SIGTERM'); killTimer ||= setTimeout(() => child.kill('SIGKILL'), 1500); killTimer.unref(); };
  const timer = setTimeout(() => { failed = true; failureCode = 'CLAUDE_TIMEOUT'; stop(); }, timeoutMs);
  signal?.addEventListener('abort', stop, { once: true });
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-16384); });
  child.stdin.on('error', () => { failed = true; stop(); });
  const done = new Promise((resolve, reject) => {
    child.on('error', error => { failed = true; if (error.code === 'ENOENT') failureCode = 'CLAUDE_NOT_INSTALLED'; });
    child.stdout.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > 2 * 1024 * 1024) { failed = true; stop(); return; }
      output += chunk;
      if (onOutput) Promise.resolve(onOutput(output)).catch(() => { failed = true; stop(); });
    });
    child.once('close', code => {
      clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', stop);
      if (failed || signal?.aborted || code !== 0) reject(failure(failureCode || classifyClaudeFailure(diagnostic + '\n' + output))); else resolve(output);
      diagnostic = ''; output = '';
    });
  });
  if (signal?.aborted) stop();
  if (input !== undefined) child.stdin.end(input);
  return { done, stop, write: text => child.stdin.write(text) };
}

export async function loginClaude(env, { signal, update, read, spawnProcess, pollMs = 1500 }) {
  let manual, publishing = Promise.resolve(), polling = false, sent = false, inputFailure, pollTask = Promise.resolve();
  const run = childRun(['auth', 'login', '--claudeai'], { env, signal, spawnProcess, timeoutMs: 600000, onOutput(output) {
    if (manual) return publishing;
    for (const match of stripVTControlCharacters(output).matchAll(/https:\/\/[^\s]+(?=\s)/g)) {
      try { manual = safeClaudeLogin(match[0]); } catch { continue; }
      publishing = update({ job: { manual } });
      return publishing;
    }
  } });
  const poll = async () => {
    if (!manual || sent || polling) return;
    polling = true;
    try {
      const fresh = await read();
      if (fresh.job.code) {
        const [code, state] = fresh.job.code.split('#');
        if (state !== manual.state || !/^[A-Za-z0-9._~+=/-]{8,2048}$/.test(code) || code.startsWith('sk-')) throw failure();
        // Remove the one-time code from durable storage before feeding the official CLI.
        await update({ job: { code: null } });
        sent = true; run.write(`${code}#${state}\n`);
      }
    } catch (e) { inputFailure = e; run.stop(); }
    finally { polling = false; }
  };
  const timer = setInterval(() => { if (!polling) pollTask = poll(); }, pollMs);
  try { await run.done; await publishing; if (inputFailure || !manual) throw inputFailure || failure('CLAUDE_LOGIN_FAILED'); }
  catch (error) { if (error.code === 'CLAUDE_REQUEST_FAILED') throw failure('CLAUDE_LOGIN_FAILED'); throw error; }
  finally { clearInterval(timer); await pollTask; }
}

export function claudeArgs(model) {
  if (model && !/^[a-zA-Z0-9._-]+$/.test(model)) throw failure();
  // Only built-in web search is available. No shell, file, app, MCP or subagent tools.
  return ['-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--tools', 'WebSearch', '--allowedTools', 'WebSearch', '--permission-mode', 'dontAsk',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', '',
    ...(model ? ['--model', model] : [])];
}
export function parseClaudeEvents(output) {
  const searches = new Set(); let searched = false, result, answer = '';
  for (const line of output.split('\n').filter(Boolean)) {
    let event; try { event = JSON.parse(line); } catch { throw failure('CLAUDE_OUTPUT_INVALID'); }
    if (event.type === 'assistant') for (const block of event.message?.content || []) {
      if (block.type === 'tool_use' && block.name === 'WebSearch') searches.add(block.id);
      if (block.type === 'text') answer = block.text;
    }
    if (event.type === 'user') for (const block of event.message?.content || []) {
      if (block.type === 'tool_result' && searches.has(block.tool_use_id) && !block.is_error) searched = true;
    }
    if (event.type === 'result') result = event;
  }
  if (!result) throw failure('CLAUDE_OUTPUT_INVALID');
  if (result.is_error || result.subtype !== 'success') throw failure(classifyClaudeFailure(JSON.stringify(result)));
  try { return { searched, value: JSON.parse(String(result.result || answer).replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, '')) }; }
  catch { throw failure('CLAUDE_OUTPUT_INVALID'); }
}
export const generateClaude = (env, { spawnProcess } = {}) => async (prompt, { signal, model } = {}) =>
  parseClaudeEvents(await childRun(claudeArgs(model), { env, signal, input: prompt, spawnProcess }).done);

// Claude Code scopes its macOS Keychain item to CLAUDE_CONFIG_DIR. This adapter
// touches only the fresh private runtime namespace, never the operator's entry.
const service = dir => 'Claude Code-credentials-' + createHash('sha256').update(dir.normalize('NFC')).digest('hex').slice(0, 8);
export async function readClaudeCredential(env, { platform = process.platform, execute = exec } = {}) {
  let saved;
  if (platform === 'darwin') {
    try { saved = JSON.parse((await execute('/usr/bin/security', ['find-generic-password', '-s', service(env.CLAUDE_CONFIG_DIR), '-w'], { timeout: 5000, maxBuffer: 262144 })).stdout); }
    catch (e) { if (e.code !== 44) throw failure('CLAUDE_KEYCHAIN_FAILED'); }
  }
  if (!saved) {
    try { saved = JSON.parse(await readFile(join(env.CLAUDE_CONFIG_DIR, '.credentials.json'), 'utf8')); }
    catch { throw failure('CLAUDE_CREDENTIAL_FAILED'); }
  }
  const oauth = saved?.claudeAiOauth;
  if (typeof oauth?.accessToken !== 'string' || !oauth.accessToken || typeof oauth.refreshToken !== 'string' || !oauth.refreshToken || !Number.isFinite(oauth.expiresAt) || !Array.isArray(oauth.scopes) || !oauth.scopes.includes('user:inference')) throw failure('CLAUDE_CREDENTIAL_FAILED');
  return { claudeAiOauth: oauth };
}
async function clearKeychain(env) {
  if (process.platform !== 'darwin') return;
  try { await exec('/usr/bin/security', ['delete-generic-password', '-s', service(env.CLAUDE_CONFIG_DIR)], { timeout: 5000 }); }
  catch (e) { if (e.code !== 44) throw failure('CLAUDE_KEYCHAIN_FAILED'); } // 44: this isolated item does not exist.
}
async function accountStatus(env, signal) {
  try {
    const result = await exec('claude', ['auth', 'status'], { cwd: env.HOME, env: claudeEnvironment(env), signal, timeout: 15000, maxBuffer: 32768 });
    const status = JSON.parse(result.stdout);
    if (!status.loggedIn || status.authMethod !== 'claude.ai') throw failure('CLAUDE_AUTH_FAILED');
    return status;
  } catch (error) {
    if (error.code === 'CLAUDE_AUTH_FAILED') throw error;
    if (error.code === 'ENOENT') throw failure('CLAUDE_NOT_INSTALLED');
    const code = classifyClaudeFailure(String(error.stderr || ''));
    throw failure(error.killed ? 'CLAUDE_TIMEOUT' : code === 'CLAUDE_REQUEST_FAILED' ? 'CLAUDE_AUTH_FAILED' : code);
  }
}

export async function executeClaudeAccountJob(value, { signal, update, read, env = process.env,
  login = loginClaude, credential = readClaudeCredential, identify = accountStatus,
  generator = generateClaude, cleanup = clearKeychain } = {}) {
  const home = await mkdtemp(join(tmpdir(), 'shopshorts-claude-'));
  const runtime = { ...claudeEnvironment(env), HOME: home, CLAUDE_CONFIG_DIR: join(home, '.claude') };
  let retainCache = false;
  const persist = async patch => {
    if (patch.credential) await writeFile(join(runtime.CLAUDE_CONFIG_DIR, '.credentials.json'), JSON.stringify(patch.credential.credentials), { mode: 0o600 });
    try { await update(patch); }
    catch (e) { if (patch.credential && e.code !== 'STALE_ACCOUNT' && signal?.reason?.code !== 'STALE_ACCOUNT') retainCache = true; throw e; }
  };
  const capture = async () => {
    let credentials;
    try { credentials = await credential(runtime); }
    catch (e) { retainCache = true; throw e; }
    const profiles = {};
    for (const path of ['.claude.json', '.claude/.claude.json']) {
      try { const config = JSON.parse(await readFile(join(home, path), 'utf8')); if (config.oauthAccount) profiles[path] = { oauthAccount: config.oauthAccount }; }
      catch (e) { if (e.code !== 'ENOENT') throw failure(); }
    }
    return { credentials, profiles };
  };
  try {
    await mkdir(runtime.CLAUDE_CONFIG_DIR, { mode: 0o700 });
    if (value.credential) {
      await writeFile(join(runtime.CLAUDE_CONFIG_DIR, '.credentials.json'), JSON.stringify(value.credential.credentials), { mode: 0o600 });
      for (const path of ['.claude.json', '.claude/.claude.json']) if (value.credential.profiles?.[path]) await writeFile(join(home, path), JSON.stringify(value.credential.profiles[path]), { mode: 0o600 });
    }
    if (value.job.kind === 'connect') {
      await login(runtime, { signal, update, read });
      const status = await identify(runtime, signal);
      await persist({ credential: await capture(), account: status.email || 'Claude 구독 계정', provider: 'claude', job: { state: 'done', manual: null, code: null } });
      return;
    }
    await identify(runtime, signal);
    try {
      const result = await recommendBrief(value.job.input, env, { generate: generator(runtime), signal, provider: 'claude' });
      await persist({ credential: await capture(), job: { state: 'done', result } });
    } catch (e) { await persist({ credential: await capture() }); throw e; }
  } finally {
    if (retainCache) console.error('[llm-accounts] Claude 인증 갱신 저장 실패. 복구용 비공개 캐시 보존:', home);
    else { await cleanup(runtime); await rm(home, { recursive: true, force: true }); }
  }
}
