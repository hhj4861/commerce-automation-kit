import { googleUser, legacyAuthorized, sameOrigin } from './google-auth.js';
import { recommendationInput } from './studio-recommendations.js';

export async function llmOwner(request, env) {
  const user = await googleUser(request, env);
  const identity = user?.sub ? `google:${user.sub}` : legacyAuthorized(request, env) ? 'legacy-operator' : null;
  if (!identity) return null;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity)))].map(n => n.toString(16).padStart(2, '0')).join('');
}

export async function llmAccountApi(request, env, call) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/studio/llm/') && path !== '/api/studio/recommendations') return null;
  const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
  try {
    const owner = await llmOwner(request, env);
    if (!owner) return json({ error: '로그인이 필요합니다.' }, 401);
    if (!sameOrigin(request)) return json({ error: '다른 사이트에서 요청할 수 없습니다.' }, 403);
    const operation = path === '/api/studio/recommendations' ? 'recommend' : path.slice('/api/studio/llm/'.length);
    if (!['status', 'connect', 'code', 'disconnect', 'cancel', 'recommend'].includes(operation)) return json({ error: '잘못된 요청입니다.' }, 404);
    if (request.method !== (operation === 'status' ? 'GET' : 'POST')) return json({ error: '지원하지 않는 요청입니다.' }, 405);
    let input = {};
    if (request.method === 'POST') {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON 요청이 필요합니다.' }, 415);
      const reader = request.body?.getReader(); let text = '', size = 0;
      const decoder = new TextDecoder();
      if (!reader) return json({ error: '요청 내용이 없습니다.' }, 400);
      for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length;
        if (size > 16000) { await reader.cancel(); return json({ error: '요청이 너무 큽니다.' }, 413); }
        text += decoder.decode(value, { stream: true }); }
      try { input = JSON.parse(text + decoder.decode()); } catch { return json({ error: 'JSON 요청을 확인하세요.' }, 400); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: '요청을 확인하세요.' }, 400);
    }
    if (operation === 'recommend') input = { brief: recommendationInput(input) };
    // No browser-controlled owner/provider token is forwarded.
    const result = await call(owner, operation, input);
    return json(result, result.status || (['connect', 'recommend'].includes(operation) ? 202 : 200));
  } catch (e) {
    return json({ error: e.status && e.status !== 409 ? e.message : e.status === 409 ? '연결 상태가 변경됐습니다. 다시 시도하세요.' : '계정 연결 서비스를 사용할 수 없습니다. 잠시 후 다시 시도하세요.' }, e.status || 503);
  }
}
