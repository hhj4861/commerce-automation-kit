// Static service credentials only. Never persist to CDN/KV/disk, or cache auth decisions.
// A rotation/revocation becomes visible within 30 seconds in a warm isolate.
const bundles = new WeakMap();
const TTL_MS = 30_000;

export async function cloudSecrets(env) {
  if (!env.CREDENTIALS) return env; // Existing deployment continues until service binding is configured.
  const binding = env.CREDENTIALS;
  const migrating = env.CAK_IMPORT_LEGACY_SECRETS === '1';
  if (migrating) {
    bundles.delete(binding);
    await env.CREDENTIALS.importPagesSecrets({ WP_AUTO_BLOG_GITHUB_TOKEN: env.WP_AUTO_BLOG_GITHUB_TOKEN });
  }
  const now = Date.now(), cached = bundles.get(binding);
  if (!migrating && cached && now >= cached.readAt && now < cached.expiresAt) {
    return { ...env, ...cached.values };
  }
  bundles.delete(binding); // Expired values must never become an outage fallback.
  // Cache only settled strings, not an in-flight Promise/RPC object across request contexts.
  const values = await binding.getPagesSecrets();
  if (!values.SHOPSHORTS_TOKEN || !values.SHOPSHORTS_SESSION_SECRET) throw new Error('Cloudflare credentials missing');
  if (Object.values(values).some(value => typeof value !== 'string')) throw new Error('Invalid Cloudflare credentials');
  if (!migrating) bundles.set(binding, { values: Object.freeze({ ...values }), readAt: now, expiresAt: now + TTL_MS });
  return { ...env, ...values };
}
