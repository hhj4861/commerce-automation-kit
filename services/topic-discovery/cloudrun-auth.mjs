// Optional runtime identity for the IAM-private staging edge, never a provider key.
export function cloudRunFetch(baseUrl, audience, fetcher = globalThis.fetch) {
  if (!audience) return fetcher;
  const base = new URL(baseUrl);
  if (base.protocol !== 'https:' || base.origin !== audience ||
      !/^shared-ai-stg-[a-z0-9-]+\.a\.run\.app$/.test(base.hostname) ||
      base.username || base.password || base.search || base.hash) throw Error('invalid_staging_audience');
  return async (url, options = {}) => {
    if (new URL(url).origin !== audience) throw Error('invalid_staging_destination');
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000);
    const identity = await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=' + encodeURIComponent(audience),
      {headers: {'Metadata-Flavor': 'Google'}, signal, redirect: 'error'});
    if (!identity.ok) throw Error('staging_identity_unavailable');
    const token = await identity.text();
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token) || token.length > 16384) throw Error('invalid_staging_identity');
    return fetcher(url, {...options, signal, redirect: 'error',
      headers: {...options.headers, 'X-Serverless-Authorization': 'Bearer ' + token}});
  };
}
