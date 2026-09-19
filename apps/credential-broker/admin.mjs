// Administrative migration only. Never print API responses, environment values or credential JSON.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { STATIC_KEYS } from './policy.mjs';
import { runnerRequest } from './runner-client.mjs';

const ACCOUNT = '8707f7095965c1c134cd93e0b68248ca';
const ROOT = resolve(import.meta.dirname, '../..');
const CONFIG = resolve(import.meta.dirname, 'wrangler.json');
const RUNNER_KEY = resolve(ROOT, 'apps/shopshorts/data/credential-runner.jwk');

export function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const m = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
    if (!m) return [];
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[m[1], value]];
  }));
}
async function cf(path, method = 'GET', body) {
  // Official Wrangler login cache; narrow, explicit credential source, never echoed.
  const auth = await readFile(resolve(homedir(), '.wrangler/config/default.toml'), 'utf8');
  const token = auth.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  if (!token) throw new Error('Wrangler login required');
  const result = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/${path}`, { method, redirect: 'error',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const data = await result.json();
  if (!result.ok || !data.success) throw new Error(`Cloudflare operation failed (${result.status}; codes ${data.errors?.map(e => e.code).join(',') || 'unknown'})`);
  return data.result;
}
async function getConfig() { return JSON.parse(await readFile(CONFIG, 'utf8')); }
async function saveConfig(config) { await writeFile(CONFIG, `${JSON.stringify(config, null, 2)}\n`); }
async function upsert(config, values) {
  const store = config.vars.STORE_ID;
  const existing = await cf(`secrets_store/stores/${store}/secrets?per_page=100`);
  for (const [name, value] of Object.entries(values)) {
    if (![...STATIC_KEYS, 'VAULT_KEY'].includes(name) || typeof value !== 'string' || !value || Buffer.byteLength(value) > 1024) throw new Error(`Invalid value for ${name}`);
    const secretName = `CAK_${name}`;
    const old = existing.find(item => item.name === secretName);
    if (old) await cf(`secrets_store/stores/${store}/secrets/${old.id}`, 'PATCH', { value, scopes: ['workers'] });
    else await cf(`secrets_store/stores/${store}/secrets`, 'POST', [{ name: secretName, value, scopes: ['workers'], comment: 'commerce-automation-kit managed credential' }]);
    const binding = name === 'VAULT_KEY' ? name : `SS_${name}`;
    if (!config.secrets_store_secrets.some(b => b.binding === binding)) config.secrets_store_secrets.push({ binding, store_id: store, secret_name: secretName });
    console.log(`registered ${name}`);
    await saveConfig(config); // Safe metadata only; permits resuming a partial API failure.
  }
}
async function broker(path, body) {
  const config = await getConfig();
  return runnerRequest(config.vars.BROKER_URL, RUNNER_KEY, path, body);
}
async function main() {
  const action = process.argv[2];
  if (action === 'init') {
    const stores = await cf('secrets_store/stores');
    const store = stores.find(x => x.name === 'cak-secrets');
    if (!store) throw new Error('Create cak-secrets store first');
    let privateKey;
    try { privateKey = JSON.parse(await readFile(RUNNER_KEY, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      privateKey = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' });
      await mkdir(dirname(RUNNER_KEY), { recursive: true, mode: 0o700 });
      await writeFile(RUNNER_KEY, JSON.stringify(privateKey), { mode: 0o600, flag: 'wx' });
    }
    const { d, ...publicKey } = privateKey;
    const subdomain = await cf('workers/subdomain');
    const config = {
      name: 'cak-credential-broker', main: 'worker.mjs', compatibility_date: '2026-09-01', account_id: ACCOUNT,
      workers_dev: true, preview_urls: false,
      observability: { enabled: false },
      d1_databases: [{ binding: 'DB', database_name: 'shopshorts', database_id: '19e3ee3c-87d5-483e-b420-50f2814c45b8' }],
      vars: { STORE_ID: store.id, BROKER_URL: `https://cak-credential-broker.${subdomain.subdomain}.workers.dev`, RUNNER_PUBLIC_JWK: JSON.stringify(publicKey), GITHUB_ALLOWED_REFS: 'refs/heads/main,refs/heads/feat/common-video-generator' },
      secrets_store_secrets: [],
    };
    // Refuse reinitialization: rotating the vault key would strand encrypted records.
    try { await stat(CONFIG); throw new Error('Config exists; use register-local'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await saveConfig(config);
    await upsert(config, { VAULT_KEY: randomBytes(32).toString('base64') });
  } else if (action === 'register-local') {
    const config = await getConfig();
    const env = { ...parseEnv(await readFile(resolve(ROOT, 'packages/keyword-intel/.env'), 'utf8')), ...parseEnv(await readFile(resolve(ROOT, '.env'), 'utf8')) };
    await upsert(config, Object.fromEntries(STATIC_KEYS.filter(k => env[k]).map(k => [k, env[k]])));
    console.log(`Unavailable locally: ${STATIC_KEYS.filter(k => !env[k]).join(', ')}`);
  } else if (action === 'import-oauth') {
    const env = parseEnv(await readFile(resolve(ROOT, '.env'), 'utf8'));
    for (const [name, file] of [['codex', resolve(homedir(), '.codex/auth.json')], ['youtube', env.YOUTUBE_TOKEN_PATH || resolve(homedir(), '.cak-youtube-tokens.json')], ['youtube-client', env.YOUTUBE_CLIENT_SECRET]]) {
      if (!file) continue;
      const value = JSON.parse(await readFile(file, 'utf8'));
      const { record } = await broker('/runner/vault', { operation: 'read', name });
      if (record) { console.log(`already registered ${name}; preserved`); continue; }
      await broker('/runner/vault', { operation: 'write', name, value, revision: 0 });
      const saved = await broker('/runner/vault', { operation: 'read', name });
      if (JSON.stringify(saved.record?.value) !== JSON.stringify(value)) throw new Error(`Verification failed for ${name}`);
      console.log(`encrypted and verified ${name}`);
    }
  } else if (action === 'promote-migration') {
    const name = process.argv[3];
    if (!['github', 'pages'].includes(name)) throw new Error('Invalid migration');
    const { record } = await broker('/runner/vault', { operation: 'read', name: `migration/${name}` });
    if (!record) throw new Error('Migration has not arrived');
    await upsert(await getConfig(), record.value);
    console.log('Redeploy bindings and verify before deleting migration');
  } else if (action === 'verify') {
    const { values } = await broker('/runner/secrets', {});
    console.log(`Cloudflare values readable: ${Object.keys(values).sort().join(', ')}`);
  } else if (action === 'inventory') {
    console.log(JSON.stringify(await cf('pages/projects/shopshorts-dash').then(p => ({ production_branch: p.production_branch, latest_deployment_id: p.canonical_deployment?.id, environments: Object.fromEntries(Object.entries(p.deployment_configs || {}).map(([k,v]) => [k, { env_vars: Object.keys(v.env_vars || {}), services: v.services }])) })), null, 2));
  } else throw new Error('Unknown admin action');
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch(error => { console.error(error.message.startsWith('Cloudflare operation failed') ? error.message : 'Administrative operation failed; credential values suppressed.'); process.exitCode = 1; });
}
