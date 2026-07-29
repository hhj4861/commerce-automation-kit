/**
 * 전역 인증 미들웨어 — 모든 경로(정적 UI 포함)에 토큰 게이트.
 * 로컬 서버와 동일한 스킴: ?token= 1회 접속 → 쿠키(30일) → 이후 무토큰.
 * 토큰 원본: Pages 시크릿 SHOPSHORTS_TOKEN (kit .env 와 동일 값 유지).
 */
export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const token = env.SHOPSHORTS_TOKEN;

  if (!token) {
    return new Response('서버 미구성: SHOPSHORTS_TOKEN 시크릿 없음', { status: 500 });
  }

  const q = url.searchParams.get('token');
  if (q === token) {
    const headers = new Headers({
      'set-cookie': `ss=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
      location: url.pathname,
    });
    return new Response(null, { status: 302, headers });
  }

  const cookie = /(?:^|;\s*)ss=([^;]+)/.exec(request.headers.get('cookie') ?? '')?.[1];
  if (cookie !== token) {
    // Authorization 헤더도 허용(워커·모니터 등 비브라우저 클라이언트용)
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${token}`) {
      return new Response('인증 필요 — 발급받은 ?token= 링크로 접속하세요', {
        status: 401,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  }
  return next();
}
