# Shopshorts 자동 혼합 운영 배포 검증 — 2026-10-06

## 실제 반영
- 사용자 승인: PR #157 main 머지 후 deploy/shopshorts 반영 및 운영 배포.
- 원격 deploy/shopshorts를 검토된 main SHA `cca7b0986284520ec5580e17a529ee063086e58c`에서 최초 생성.
- Cloudflare Pages production_branch: `main` → `deploy/shopshorts`.
- 공식 Wrangler 수동 배포 성공: `f5186e9a-efca-4114-8930-bc1d56376ff0`, production, 2026-10-06T05:07:25Z. canonical deployment SHA/branch 일치.
- 운영 URL: https://shopshorts-dash.pages.dev/studio/dashboard?mode=auto
- 배포 URL: https://f5186e9a.shopshorts-dash.pages.dev
- 운영 checkout `/Users/admin/workSpace/shopshorts-production`: deec584 → cca7b098, 깨끗한 detached checkout 유지. 의존성 변경 없음.
- 실행·대기 작업 0건을 확인 후 `com.cak.studio-production`만 재시작. 기존 계정·토큰·프로젝트 보존. LLM 계정 워커는 재시작하지 않음.

## 검증
- 인증한 운영 요청에서 hybrid-plan.js, hybrid-graphics.js, automatic-creation.js, studio.js가 로컬 배포 SHA 파일과 SHA-256 동일. 비인증 요청의 login redirect를 자산 불일치로 잘못 판정하지 않음.
- 로그인된 Chrome 운영 자동 제작 화면에서 자동 혼합 라디오 선택 확인, 제작 워커 온라인 표시.
- 같은 운영 checkout/의존성으로 전체 Shopshorts 검사: 환경 보정 후 361 pass, 4 fail, 1 skip. 네 실패는 DISCOVERY_TEST_DIR 미설정으로 fixture 생성 전 발생. 명시적 경로로 관련 검사 재실행 통과, opt-in 혼합 렌더도 실제 실행 통과(두 파일 20 pass, 0 fail, 0 skip). 합산해 전체 366검사의 누락/실패를 해소했으며 한 번의 전체 검사 366 pass라고 주장하지 않음.
- 처음의 tsx EADDRINUSE는 긴 iCloud Unix socket 경로 문제. `/private/tmp/cak-hybrid-prod-1006`은 iCloud 작업 tmp를 가리키는 짧은 symlink로만 사용. 별도 로컬 대용량 저장소를 만들지 않음. 테스트 모션 런타임은 운영과 같은 Node 22 지정.
- 실제 혼합 renderer에서 웹툰/3D/모션 MP4, 오디오·자막 합성, ffprobe/ffmpeg decode, 재시도 시 유료 호출 중복 없음 검증. 공급자·TTS는 fixture이며 운영 유료 신규 생성/업로드를 수행한 것은 아님.
- 증거: [운영 화면](20261006-shopshorts-hybrid-production.png). 로그 및 MP4는 지정 iCloud 작업 루트의 `commerce-automation-kit/20261006-adaptive-hybrid/production-validation/`.

## 남은 항목 — 완료와 구분
- 자동 배포 GitOps는 미완료. 현재 GitHub 인증 permissions.admin=false, 브랜치 보호 PUT 404. deploy/shopshorts는 아직 unprotected. 강제/보호 우회 없이 사용자에게 설정 안내.
- Cloudflare CI 전용 `CAK_DEPLOY_CLOUDFLARE_API_TOKEN` 미등록; broker GITHUB_DEPLOY_ALLOWED_REFS에도 Shorts 미포함. 기존 Wrangler OAuth는 로컬 배포에만 사용했고 GitHub/CI로 복사하지 않음. 사용자에게 Pages Edit 계정 한정 토큰 준비 안내. 이후 Secrets Store 등록, binding/정책 검토, 보호된 브랜치 workflow_dispatch 첫 실행 검증 필요.
- 운영 heartbeat API 허용 목록이 `hybrid` 필드를 버리는 결함 발견. 워커 자체 capabilities.hybrid=true, 실제 실행/화면 경로는 해당 flag에 의존하지 않음. 이 표시 누락과 DISCOVERY_TEST_DIR 기본값 보완을 `fix/shopshorts-deploy-verification`(202e52e)에 분리, 관련 16검사 통과. 후속 [PR #158](https://github.com/hhj4861/commerce-automation-kit/pull/158)은 별도 사용자 머지 승인 전 운영 미반영.
- audioAccount.state=unavailable는 기존 상태로 관찰됨. voice capability=true와 구분하며 실제 유료 음성 계정 잔액·결제 검증으로 보고하지 않음.

## 추가 외부 연결 점검
- ElevenLabs 공식 subscription 읽기 요청은 HTTP 응답 이전 TLS 검증에서 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`로 실패. Node 20, Node 22 --use-system-ca, curl에서 재현.
- 반환된 공개 인증서 발급자가 Fortinet 장비 CA로 확인되어 현재 네트워크의 HTTPS 검사 경로와 관련됨. API 키 오류나 구독 한도라고 단정하지 않음. 인증서 검증 비활성화/우회/임의 CA 신뢰 등록은 수행하지 않음.
- 따라서 화면·워커 배포 및 fixture 기반 실제 렌더 검증과 별개로, 현재 네트워크에서 ElevenLabs 실통신 검증은 미완료. 네트워크 관리자가 제공하는 정식 신뢰 체인/정책 확인이 필요함.

## PR #158 승인 후 최종 반영
- 사용자가 PR #158 머지·재배포를 명시 승인. main merge SHA `7e03f5a2e15261c06d09740bab5fb12890260217`, 2026-10-06T05:25:37Z.
- 승인된 네 파일 차이만 확인하고 deploy/shopshorts를 해당 SHA로 정상 fast-forward. force/보호 우회 없음. 현재 보호·CI 토큰 미설정은 여전히 미완료이며 이번 배포는 승인된 Wrangler 수동 배포.
- 운영 checkout 동일 SHA, 영향 검사 16 pass/0 fail. Pages production deployment `2196032c-326a-4aa5-92a6-ee544abd0e0a` 성공, 운영 SHA 일치 확인.
- 운영 worker heartbeat → `/api/studio/config`: hybrid=true, motion=true, webtoon=true 확인. 위 ‘후속 PR 승인 대기’는 이 절로 해소됨.
- Higgsfield 공식 `account status` 비과금 조회 성공(확인 시 503.9크레딧). 앞선 `account` 부모 명령은 도움말을 반환하므로 계정 상태 검증 근거로 사용하지 않음.
- ElevenLabs TLS 및 GitOps 자격·보호 설정 미완료는 계속 남아 있음. 테스트용 TTS fixture와 실제 서비스 호출을 구분함.
