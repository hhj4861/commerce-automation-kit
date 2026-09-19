// Shared Node/Pages authentication. Admission is explicitly configured per environment.
import { verifyGoogleIdToken } from './google-id-token.js';
const encoder = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const unb64 = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const cookies = request => Object.fromEntries((request.headers.get('cookie') || '').split(';').map(v => v.trim().split(/=(.*)/s).slice(0, 2)));
const secret = env => env.SHOPSHORTS_SESSION_SECRET;
async function key(env) {
  if (!secret(env) || secret(env).length < 32) throw new Error('SHOPSHORTS_SESSION_SECRET must have at least 32 characters');
  return crypto.subtle.importKey('raw', encoder.encode(secret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signSession(value, env) {
  const payload = b64(encoder.encode(JSON.stringify(value)));
  return `${payload}.${b64(new Uint8Array(await crypto.subtle.sign('HMAC', await key(env), encoder.encode(payload))))}`;
}
export async function readSession(value, env) {
  try {
    const [payload, signature, extra] = (value || '').split('.');
    if (extra || !signature || !await crypto.subtle.verify('HMAC', await key(env), unb64(signature), encoder.encode(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(unb64(payload)));
    return data.exp > Date.now() ? data : null;
  } catch { return null; }
}
const allowed = env => (env.SHOPSHORTS_GOOGLE_ALLOWED_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
const allowSignups = env => env.SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS === '1';
const admitted = (env, email) => !!email && (allowSignups(env) || allowed(env).includes(email));
export function authConfig(env) {
  const mode = env.GOOGLE_AUTH_MODE || 'code';
  const required = ['GOOGLE_CLIENT_ID', 'SHOPSHORTS_ORIGIN', 'SHOPSHORTS_SESSION_SECRET'];
  if (mode !== 'gis') required.push('GOOGLE_CLIENT_SECRET');
  if (!allowSignups(env)) required.push('SHOPSHORTS_GOOGLE_ALLOWED_EMAILS');
  const missing = required.filter(k => !env[k]);
  if (!['gis', 'code'].includes(mode)) missing.push('GOOGLE_AUTH_MODE (gis 또는 code)');
  if (env.SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS && !['0', '1'].includes(env.SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS)) missing.push('SHOPSHORTS_GOOGLE_ALLOW_SIGNUPS (0 또는 1)');
  if (env.SHOPSHORTS_SESSION_SECRET && env.SHOPSHORTS_SESSION_SECRET.length < 32) missing.push('SHOPSHORTS_SESSION_SECRET (32자 이상)');
  try {
    const origin = new URL(env.SHOPSHORTS_ORIGIN);
    if (origin.origin !== env.SHOPSHORTS_ORIGIN || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) missing.push('SHOPSHORTS_ORIGIN (HTTPS 원본 주소)');
  } catch { if (!missing.includes('SHOPSHORTS_ORIGIN')) missing.push('SHOPSHORTS_ORIGIN'); }
  return { ready: missing.length === 0, missing, mode, clientId: env.GOOGLE_CLIENT_ID || null, allowSignups: allowSignups(env), redirectUri: env.SHOPSHORTS_ORIGIN ? `${env.SHOPSHORTS_ORIGIN}/auth/google/callback` : null };
}
export async function googleUser(request, env) {
  const data = await readSession(cookies(request).ss_google, env);
  return data?.type === 'user' && admitted(env, data.email) ? { sub: data.sub, email: data.email, name: data.name } : null;
}
export function workerAuthorized(request, env) {
  return !!env.SHOPSHORTS_TOKEN && request.headers.get('authorization') === `Bearer ${env.SHOPSHORTS_TOKEN}`;
}
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return (!origin || origin === new URL(request.url).origin) && request.headers.get('sec-fetch-site') !== 'cross-site';
}
export function legacyAuthorized(request, env) {
  return workerAuthorized(request, env) || (!!env.SHOPSHORTS_TOKEN && cookies(request).ss === env.SHOPSHORTS_TOKEN);
}
const cookie = (name, value, seconds, env) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${env.SHOPSHORTS_ORIGIN?.startsWith('https:') ? '; Secure' : ''}`;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
export async function authRoute(request, env, fetcher = fetch, verifyCredential = verifyGoogleIdToken) {
  const url = new URL(request.url), path = url.pathname;
  if (['/login', '/login.html'].includes(path) && request.method === 'GET' && (await googleUser(request, env) || legacyAuthorized(request, env))) {
    return new Response(null, { status: 302, headers: { location: '/', 'cache-control': 'no-store' } });
  }
  if (path === '/auth/status' && request.method === 'GET') {
    const user = await googleUser(request, env);
    return json({ ...authConfig(env), user, authenticated: !!user || legacyAuthorized(request, env) });
  }
  if (path === '/auth/logout' && request.method === 'POST') {
    if (!sameOrigin(request)) return json({ error: '다른 사이트에서 로그아웃할 수 없습니다.' }, 403);
    const headers = new Headers({ 'cache-control': 'no-store' });
    headers.append('set-cookie', cookie('ss_google', '', 0, env));
    headers.append('set-cookie', cookie('ss', '', 0, env));
    return new Response('{}', { headers });
  }
  if (['/auth/google/challenge', '/auth/google/credential'].includes(path)) {
    if (!sameOrigin(request)) return json({ error: '다른 사이트에서 로그인할 수 없습니다.' }, 403);
    const config = authConfig(env);
    if (!config.ready || config.mode !== 'gis') return json({ error: 'Google 로그인 설정을 확인하세요.' }, 503);
    if (path.endsWith('/challenge')) {
      if (request.method !== 'GET') return json({ error: 'GET 요청만 지원합니다.' }, 405);
      const nonce = b64(crypto.getRandomValues(new Uint8Array(32)));
      const exp = Date.now() + 300000;
      return Response.json({ nonce, expiresAt: exp }, { headers: {
        'cache-control': 'no-store',
        'set-cookie': cookie('ss_oauth', await signSession({ type: 'gis', nonce, exp }, env), 300, env)
      } });
    }
    if (request.method !== 'POST') return json({ error: 'POST 요청만 지원합니다.' }, 405);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSON 요청이 필요합니다.' }, 415);
    const headers = new Headers({ 'cache-control': 'no-store', 'set-cookie': cookie('ss_oauth', '', 0, env) });
    try {
      const flow = await readSession(cookies(request).ss_oauth, env);
      if (!flow || flow.type !== 'gis') throw new Error('challenge');
      const text = await request.text();
      if (text.length > 16000) throw new Error('size');
      const { credential } = JSON.parse(text);
      const user = await verifyCredential(credential, env.GOOGLE_CLIENT_ID, flow.nonce);
      if (!admitted(env, user.email)) return Response.json({ error: '이 계정의 로그인이 허용되지 않았습니다.' }, { status: 403, headers });
      headers.append('set-cookie', cookie('ss_google', await signSession({ type: 'user', ...user, exp: Date.now() + 86400000 }, env), 86400, env));
      return Response.json({ ok: true, redirect: '/' }, { headers });
    } catch {
      return Response.json({ error: 'Google 인증을 확인하지 못했어요. 다시 시도해 주세요.' }, { status: 401, headers });
    }
  }
  if (!['/auth/google/start', '/auth/google/callback'].includes(path)) return null;
  if (request.method !== 'GET') return json({ error: 'GET 요청만 지원합니다.' }, 405);
  if (authConfig(env).mode === 'gis') return new Response(null, { status: 302, headers: { location: '/login', 'cache-control': 'no-store' } });
  if (!authConfig(env).ready) return json({ error: 'Google 로그인을 먼저 설정하세요.', ...authConfig(env) }, 503);
  const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
  if (path.endsWith('/start')) {
    const state = random(), verifier = random();
    const challenge = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
    const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    target.search = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: authConfig(env).redirectUri, response_type: 'code', scope: 'openid email profile', state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' }).toString();
    return new Response(null, { status: 302, headers: { location: target.href, 'cache-control': 'no-store', 'set-cookie': cookie('ss_oauth', await signSession({ type: 'flow', state, verifier, exp: Date.now() + 600000 }, env), 600, env) } });
  }
  const headers = new Headers({ 'cache-control': 'no-store', 'set-cookie': cookie('ss_oauth', '', 0, env) });
  const flow = await readSession(cookies(request).ss_oauth, env);
  if (!flow || flow.type !== 'flow' || !url.searchParams.get('state') || flow.state !== url.searchParams.get('state') || !url.searchParams.get('code')) {
    headers.set('location', '/login?error=cancelled');
    return new Response(null, { status: 302, headers });
  }
  try {
    const tokenResponse = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, code: url.searchParams.get('code'), code_verifier: flow.verifier, grant_type: 'authorization_code', redirect_uri: authConfig(env).redirectUri }), signal: AbortSignal.timeout(15000) });
    if (!tokenResponse.ok) throw new Error('exchange');
    const tokens = await tokenResponse.json();
    if (!tokens.access_token) throw new Error('token');
    const infoResponse = await fetcher('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(15000) });
    if (!infoResponse.ok) throw new Error('userinfo');
    const info = await infoResponse.json();
    const email = String(info.email || '').toLowerCase();
    if (!info.sub || info.email_verified !== true || !admitted(env, email)) {
      headers.set('location', '/login?error=access');
      return new Response(null, { status: 302, headers });
    }
    headers.append('set-cookie', cookie('ss_google', await signSession({ type: 'user', sub: info.sub, email, name: String(info.name || email).slice(0, 100), exp: Date.now() + 86400000 }, env), 86400, env));
    headers.set('location', '/');
  } catch { headers.set('location', '/login?error=provider'); }
  return new Response(null, { status: 302, headers });
}
