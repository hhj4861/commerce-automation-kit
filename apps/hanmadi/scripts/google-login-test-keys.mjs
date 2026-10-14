// Test process preload only. Production code always uses Google's fixed HTTPS JWKS URL.
// No endpoint/environment override exists in the shipped verifier.
if (process.env.HANMADI_GOOGLE_E2E_JWKS) {
  const jwks = JSON.parse(process.env.HANMADI_GOOGLE_E2E_JWKS);
  const original = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === 'https://www.googleapis.com/oauth2/v3/certs')
      return Promise.resolve(Response.json(jwks, { headers: { 'cache-control': 'public, max-age=3600' } }));
    return original(input, init);
  };
}
