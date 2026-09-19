import { createRemoteJWKSet, importJWK, jwtVerify } from 'jose';
import { AUDIENCE, ISSUER, STATIC_KEYS, PAGE_KEYS, GITHUB_KEYS, authorizeGithub, authorizeMigration } from './policy.mjs';
import { readVault, writeVault } from './vault.mjs';
import { lease } from './leases.mjs';

const githubKeys = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`));
const response = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

export async function readSecrets(env, keys, required = true) {
  const values = {};
  for (const name of keys) {
    if (!STATIC_KEYS.includes(name)) throw new Error('unknown key');
    const binding = env[`SS_${name}`];
    if (!binding) {
      if (required) throw new Error('missing binding');
      continue;
    }
    const value = await binding.get();
    if (typeof value !== 'string' || !value) throw new Error('empty secret');
    values[name] = value;
  }
  return values;
}

async function verifyGithub(token) {
  return (await jwtVerify(token, githubKeys, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['RS256'], requiredClaims: ['exp', 'iat', 'sub'], maxTokenAge: '10m', clockTolerance: 5 })).payload;
}

async function verifyRunner(token, env) {
  const publicKey = await importJWK(JSON.parse(env.RUNNER_PUBLIC_JWK), 'EdDSA');
  return (await jwtVerify(token, publicKey, { issuer: 'cak-runner', audience: AUDIENCE, algorithms: ['EdDSA'], subject: 'shopshorts-runner', maxTokenAge: '60s', requiredClaims: ['exp', 'iat', 'jti'], clockTolerance: 5 })).payload;
}

export async function handleRequest(request, env, verify = { github: verifyGithub, runner: verifyRunner }) {
  const path = new URL(request.url).pathname;
  if (path === '/health' && request.method === 'GET') return response({ ok: true });
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return response({ error: 'unauthorized' }, 401);
  try {
    if (request.method !== 'POST' || !request.headers.get('content-type')?.startsWith('application/json')) return response({ error: 'invalid request' }, 400);
    // Bounded stream: never echo user payload or upstream exception text.
    const reader = request.body?.getReader();
    if (!reader) return response({ error: 'invalid request' }, 400);
    let size = 0; const chunks = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) { await reader.cancel(); return response({ error: 'too large' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const input = JSON.parse(new TextDecoder().decode(bytes));
    if (path === '/github/secrets') {
      let access;
      try { access = authorizeGithub(await verify.github(token), env); } catch { return response({ error: 'unauthorized' }, 403); }
      return response({ values: await readSecrets(env, access.keys) });
    }
    if (path === '/github/import') {
      try { authorizeMigration(await verify.github(token), env); } catch { return response({ error: 'unauthorized' }, 403); }
      if (!input.values || Object.keys(input.values).length !== GITHUB_KEYS.length || GITHUB_KEYS.some(k => typeof input.values[k] !== 'string' || !input.values[k] || new TextEncoder().encode(input.values[k]).length > 1024)) return response({ error: 'invalid migration values' }, 400);
      // First import only. A subsequent run cannot silently replace the sealed migration.
      await writeVault(env, 'migration/github', input.values, 0);
      return response({ ok: true, count: GITHUB_KEYS.length });
    }
    if (!['/runner/secrets', '/runner/vault', '/runner/lease'].includes(path)) return response({ error: 'not found' }, 404);
    try { await verify.runner(token, env); } catch { return response({ error: 'unauthorized' }, 403); }
    if (path === '/runner/lease') return response(await lease(env, input.operation, input.owner));
    if (path === '/runner/secrets') return response({ values: await readSecrets(env, STATIC_KEYS, false) });
    if (!['codex', 'youtube', 'youtube-client', 'migration/github', 'migration/pages'].includes(input.name)) return response({ error: 'unknown credential' }, 400);
    if (input.operation === 'read') return response({ record: await readVault(env, input.name) });
    if (input.operation === 'write' && !input.name.startsWith('migration/') && Number.isSafeInteger(input.revision) && input.revision >= 0 && input.value && typeof input.value === 'object') {
      return response({ revision: await writeVault(env, input.name, input.value, input.revision) });
    }
    if (input.operation === 'delete-migration' && input.name.startsWith('migration/')) {
      await env.DB.prepare('DELETE FROM credential_vault WHERE name = ?').bind(input.name).run();
      return response({ ok: true });
    }
    return response({ error: 'invalid request' }, 400);
  } catch (error) {
    return response({ error: error.status === 409 ? 'revision conflict' : 'credential service unavailable' }, error.status === 409 ? 409 : 503);
  }
}
