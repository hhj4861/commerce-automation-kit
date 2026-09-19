// Isolated runtime cache, not the credential authority. The official CLIs perform OAuth refresh.
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { runnerRequest } from './runner-client.mjs';

export async function prepareRuntime(call, baseEnv = process.env) {
  const owner = randomUUID();
  await call('/runner/lease', { operation: 'acquire', owner });
  let dir;
  try {
    const { values } = await call('/runner/secrets', {});
    dir = await mkdtemp(join(tmpdir(), 'cak-credentials-'));
    const codexHome = join(dir, 'codex');
    await mkdir(codexHome, { mode: 0o700 });
    // Enforce file credential storage in the private runtime; no developer-home dependency.
    await writeFile(join(codexHome, 'config.toml'), 'cli_auth_credentials_store = "file"\n', { mode: 0o600 });
    const mapping = { codex: join(codexHome, 'auth.json'), youtube: join(dir, 'youtube.json'), 'youtube-client': join(dir, 'youtube-client.json') };
    const records = {};
    for (const [name, file] of Object.entries(mapping)) {
      const { record } = await call('/runner/vault', { operation: 'read', name });
      if (!record) continue;
      const text = JSON.stringify(record.value);
      await writeFile(file, text, { mode: 0o600, flag: 'wx' });
      records[name] = { file, text, revision: record.revision };
    }
    if (!records.codex) throw new Error('Codex credential missing');
    let serial = Promise.resolve();
    const flush = () => {
      serial = serial.then(async () => {
        await call('/runner/lease', { operation: 'renew', owner });
        for (const [name, record] of Object.entries(records)) {
          if (name === 'youtube-client') continue;
          const value = JSON.parse(await readFile(record.file, 'utf8'));
          const text = JSON.stringify(value);
          if (text === record.text) continue;
          const updated = await call('/runner/vault', { operation: 'write', name, revision: record.revision, value });
          record.revision = updated.revision; record.text = text;
        }
      });
      return serial;
    };
    const env = { ...baseEnv, ...values, CODEX_HOME: codexHome };
    if (records.youtube) env.YOUTUBE_TOKEN_PATH = mapping.youtube;
    if (records['youtube-client']) env.YOUTUBE_CLIENT_SECRET = mapping['youtube-client'];
    return { env, dir, flush, async close() {
      // Keep the restricted cache for recovery if persistence fails; never silently drop refreshed tokens.
      await flush();
      await call('/runner/lease', { operation: 'release', owner });
      await rm(dir, { recursive: true, force: true });
    } };
  } catch (error) {
    if (dir) await rm(dir, { recursive: true, force: true });
    await call('/runner/lease', { operation: 'release', owner }).catch(() => {});
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) throw new Error('Node entry point required');
  const base = process.env.CAK_SECRETS_URL || 'https://cak-credential-broker.guswhd1085.workers.dev';
  const key = process.env.CAK_RUNNER_KEY_FILE || resolve(import.meta.dirname, '../shopshorts/data/credential-runner.jwk');
  const runtime = await prepareRuntime((path, body) => runnerRequest(base, key, path, body));
  let failed = false;
  const child = spawn(process.execPath, args, { env: runtime.env, stdio: 'inherit' });
  const terminate = signal => child.kill(signal);
  const onTerm = () => terminate('SIGTERM');
  const onInt = () => terminate('SIGINT');
  process.on('SIGTERM', onTerm); process.on('SIGINT', onInt);
  let checking = false;
  const timer = setInterval(async () => {
    if (checking) return;
    checking = true;
    try { await runtime.flush(); }
    catch {
      failed = true; clearInterval(timer); terminate('SIGTERM');
      setTimeout(() => terminate('SIGKILL'), 5000).unref();
      console.error('Cloudflare credential persistence failed; runner stopped. Restricted runtime cache retained.');
    } finally { checking = false; }
  }, 15000);
  let code;
  try { [code] = await once(child, 'close'); }
  finally {
    clearInterval(timer);
    process.off('SIGTERM', onTerm); process.off('SIGINT', onInt);
    if (!failed) await runtime.close();
  }
  process.exitCode = failed ? 1 : (code ?? 1);
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(() => { console.error('Cloudflare runner failed; credential values suppressed.'); process.exitCode = 1; });
}
