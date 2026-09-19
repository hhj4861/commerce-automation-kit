export async function cloudSecrets(env) {
  if (!env.CREDENTIALS) return env; // Existing deployment continues until service binding is configured.
  if (env.CAK_IMPORT_LEGACY_SECRETS === '1') {
    await env.CREDENTIALS.importPagesSecrets({ WP_AUTO_BLOG_GITHUB_TOKEN: env.WP_AUTO_BLOG_GITHUB_TOKEN });
  }
  const values = await env.CREDENTIALS.getPagesSecrets();
  if (!values.SHOPSHORTS_TOKEN || !values.SHOPSHORTS_SESSION_SECRET) throw new Error('Cloudflare credentials missing');
  return { ...env, ...values };
}
