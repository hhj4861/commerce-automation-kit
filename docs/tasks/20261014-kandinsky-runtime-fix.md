# Kandinsky 운영 연결 오류 수정

- 목표: 토큰 등록/영상 생성 시 표시되는 서버 연결 오류의 실행 환경 원인을 수정한다.
- 담당: Codex 단독, worker/Claude OFF. 격리 worktree `kandinsky-worker-fetch`, 기준 main f5d42f0. 승인 없이 추가 PR 머지/운영 배포하지 않는다.
- 재현: Cloudflare workerd, 운영과 같은 compatibility date 2026-07-01에서 `holder.fetch = fetch; holder.fetch(...)`는 Illegal invocation, 직접 호출해도 redirect:error는 Invalid redirect value TypeError. 네트워크에 도달하기 전에 실패한다. 일반 Node/대역 시험이 이 두 차이를 놓쳤다.
- 수정: 주입 fetch를 일반 함수 호출로 감싸고 redirect:manual을 사용한다. 3xx/opaqueredirect는 본문을 닫고 명시 오류로 거부한다. 리디렉션 목적지로 토큰을 전달하거나 자동 재시도하지 않는다. 기존 저장 토큰/계정 데이터는 수정하지 않는다.
- 완료 기준: workerd에서 합성 계정 확인→규격→단일 접수→SSE→MP4 성공, 5개 리디렉션 응답의 전송 차단, 관련 Node 회귀, Pages 빌드, 커밋·push·PR.
- 실제 HF 연결/생성은 이 격리 시험과 다르다. 사용자 토큰을 읽거나 생성에 소비하지 않는다.
- 시험: `MINIFLARE_ENTRY=<설치된 miniflare entry> node apps/shopshorts/test/kandinsky-runtime.mjs`. Miniflare 4 옵션과 설치된 5 alpha 변환기를 모두 지원하며, 미설치 시 조용히 생략하지 않는다.

## 검증 결과
- Node20 관련 시험 25/25, 실패·생략 0. 엄격한 this 검사와 301/302/303/307/308 및 브라우저 opaque redirect 차단 포함.
- Node22 + Miniflare 5.20260926.0-alpha/workerd: 실제 클라이언트 모듈 import, 네이티브 fetch 주입, 합성 계정 확인→규격→POST 1회→SSE→MP4 왕복 성공. 리디렉션 5종은 outbound 호출 1회로 종료, 목적지 호출 없음.
- 시험 서버를 처음 만들 때 모듈 상수까지 Worker entrypoint로 합쳐 런타임 시작이 실패했다. 실제 배포처럼 클라이언트와 entrypoint를 별도 모듈로 나눈 후 위 결과 확인. 실행 실패를 시험 통과로 세지 않았다.
- Wrangler 4.143.0 Pages Functions 빌드 성공. 로그는 공용 iCloud 작업 루트의 `shopshorts/kandinsky-token-20261014/runtime-fix-{tests,workerd,build}.log`.
- 운영/사용자 계정 값 변경 없음. PR 승인·배포 후 사용자가 저장/생성을 재확인해야 실제 HF 성공 여부를 알 수 있다. 계정 저장 버튼 자체가 오류로 끝났던 경우에는 기존 값이 저장되지 않았을 수 있으므로 재등록 불필요를 단정하지 않는다.
