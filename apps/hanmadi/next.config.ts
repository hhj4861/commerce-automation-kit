import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  /*
   * 전 라우트 동적 렌더(ƒ). app/layout.tsx가 세션 쿠키를 읽어 튜터 전용 내비를
   * 게이팅하므로 루트 레이아웃부터 동적이다 — 의도한 트레이드오프다.
   * 정적으로 남는 것은 /icon.svg뿐. 되돌리려면 헤더 게이팅을 클라이언트로 옮겨야 한다.
   */

  // Cloud Run(Docker) 배포용 standalone 출력. Vercel에서는 Vercel이 알아서
  // 빌드하므로 끈다(VERCEL 환경변수는 Vercel 빌드 중에만 존재).
  output: process.env.VERCEL ? undefined : "standalone",

  // standalone 출력 루트를 이 프로젝트로 고정한다. 상위(workSpace)에 다른
  // lockfile이 있으면 Next가 루트를 위로 잡아 server.js가 깊이 중첩되는데,
  // 그러면 Dockerfile의 COPY 경로가 어긋난다. 프로젝트 루트로 고정해 방지.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
};

export default nextConfig;
