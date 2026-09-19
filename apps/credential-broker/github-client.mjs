import { appendFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { AUDIENCE, GITHUB_KEYS } from './policy.mjs';

function endpoint(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid broker URL');
  return url.origin;
}
const mask = value => console.log(`::add-mask::${value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`);

export async function run(env = process.env, fetcher = fetch) {
  const base = endpoint(env.CAK_SECRETS_URL);
  const action = env.CAK_SECRETS_ACTION || 'load';
  if (!['load', 'verify', 'import'].includes(action)) throw new Error('Unknown secrets action');
  const oidc = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if (oidc.protocol !== 'https:' || !oidc.hostname.endsWith('.actions.githubusercontent.com')) throw new Error('Invalid GitHub OIDC endpoint');
  oidc.searchParams.set('audience', AUDIENCE);
  const tokenResponse = await fetcher(oidc, { headers: { authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!tokenResponse.ok) throw new Error('GitHub OIDC request failed');
  const { value: token } = await tokenResponse.json();
  if (typeof token !== 'string' || !token) throw new Error('GitHub OIDC token missing');
  mask(token);
  const values = action === 'import' ? Object.fromEntries(GITHUB_KEYS.map(name => [name, env[name]])) : undefined;
  if (values && Object.values(values).some(value => typeof value !== 'string' || !value)) throw new Error('Migration requires all GitHub secrets');
  const result = await fetcher(`${base}/github/${action === 'import' ? 'import' : 'secrets'}`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ values }), redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  if (!result.ok) {
    const error = await result.json().catch(() => ({}));
    if (['github-signature', 'github-policy', 'migration-policy'].includes(error.stage)) console.error(`Credential rejection stage: ${error.stage}`);
    if (error.stage === 'github-policy') {
      // Public repository/workflow identifiers only; never print the JWT or arbitrary claims.
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      const fields = ['repository', 'repository_id', 'repository_owner_id', 'ref', 'sub', 'event_name', 'runner_environment', 'workflow_ref', 'job_workflow_ref'];
      console.error(JSON.stringify(Object.fromEntries(fields.map(k => [k, claims[k]]))));
    }
    throw new Error(`Cloudflare credential request failed (${result.status})`);
  }
  const body = await result.json();
  if (action === 'import') { console.log(`Cloudflare sealed migration stored (${body.count} keys)`); return; }
  if (!body.values || !Object.keys(body.values).length) throw new Error('Empty credentials');
  const entries = Object.entries(body.values);
  for (const [name, value] of entries) {
    if (!GITHUB_KEYS.includes(name) || typeof value !== 'string' || !value) throw new Error('Invalid credential response');
    mask(value);
  }
  if (action === 'load') {
    if (!env.GITHUB_ENV) throw new Error('GITHUB_ENV missing');
    let content = '';
    for (const [name, value] of entries) {
      let delimiter;
      do { delimiter = `CAK_${randomUUID()}`; } while (value.includes(delimiter));
      content += `${name}<<${delimiter}\n${value}\n${delimiter}\n`;
    }
    appendFileSync(env.GITHUB_ENV, content, { mode: 0o600 });
  }
  console.log(`Cloudflare credentials ${action === 'verify' ? 'verified' : 'loaded'} (${entries.length} keys)`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  run().catch(error => {
    const safe = ['Invalid broker URL', 'Invalid GitHub OIDC endpoint', 'GitHub OIDC request failed', 'GitHub OIDC token missing', 'Migration requires all GitHub secrets', 'Empty credentials', 'Invalid credential response', 'GITHUB_ENV missing'];
    console.error(safe.includes(error.message) || /^Cloudflare credential request failed \(\d{3}\)$/.test(error.message) ? error.message : 'Cloudflare credential operation failed; values suppressed.');
    process.exitCode = 1;
  });
}
