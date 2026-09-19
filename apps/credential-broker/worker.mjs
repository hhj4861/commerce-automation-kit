import { WorkerEntrypoint } from 'cloudflare:workers';
import { handleRequest, readSecrets } from './index.mjs';
import { PAGE_KEYS } from './policy.mjs';
import { writeVault } from './vault.mjs';
export default class CredentialBroker extends WorkerEntrypoint {
  fetch(request) { return handleRequest(request, this.env); }
  // Only Pages holding this service binding can call these RPC methods.
  getPagesSecrets() { return readSecrets(this.env, PAGE_KEYS, false); }
  async importPagesSecrets(values) {
    if (Date.now() >= Number(this.env.MIGRATION_EXPIRES_AT || 0)) throw new Error('migration closed');
    const selected = Object.fromEntries(PAGE_KEYS.filter(k => typeof values[k] === 'string' && values[k]).map(k => [k, values[k]]));
    if (!selected.WP_AUTO_BLOG_GITHUB_TOKEN) return;
    try { await writeVault(this.env, 'migration/pages', selected, 0); }
    catch (error) { if (error.status !== 409) throw error; }
  }
}
