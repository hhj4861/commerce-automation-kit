import { importJWK, SignJWT } from 'jose';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { AUDIENCE } from './policy.mjs';

export async function runnerRequest(base, keyPath, path, body, fetcher = fetch) {
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid broker URL');
  if (!['/runner/secrets', '/runner/vault', '/runner/lease'].includes(path)) throw new Error('Invalid broker operation');
  const jwk = JSON.parse(await readFile(keyPath, 'utf8'));
  const key = await importJWK(jwk, 'EdDSA');
  const token = await new SignJWT({}).setProtectedHeader({ alg: 'EdDSA' }).setIssuer('cak-runner').setSubject('shopshorts-runner').setAudience(AUDIENCE).setIssuedAt().setExpirationTime('60s').setJti(randomUUID()).sign(key);
  const result = await fetcher(`${url.origin}${path}`, { method: 'POST', redirect: 'error',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  if (!result.ok) throw new Error(`Credential service failed (${result.status})`);
  return result.json();
}
