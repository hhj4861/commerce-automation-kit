import { authRoute, googleUser, legacyAuthorized, sameOrigin } from '../lib/google-auth.js';
export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  const response = await authRoute(request, env);
  if (response) return response;
  if (['/login', '/login.html'].includes(url.pathname)) return next();
  if (!['GET', 'HEAD'].includes(request.method) && !sameOrigin(request)) return Response.json({ error: '다른 사이트에서 요청할 수 없습니다.' }, { status: 403 });
  if (env.SHOPSHORTS_TOKEN && url.searchParams.get('token') === env.SHOPSHORTS_TOKEN) return new Response(null, { status: 302, headers: { location: url.pathname, 'set-cookie': `ss=${env.SHOPSHORTS_TOKEN}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`, 'cache-control': 'no-store' } });
  if (legacyAuthorized(request, env) || await googleUser(request, env)) return next();
  if (url.pathname.startsWith('/api/')) return Response.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  return new Response(null, { status: 302, headers: { location: '/login', 'cache-control': 'no-store' } });
}
