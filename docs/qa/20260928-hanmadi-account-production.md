# Hanmadi 개인 모델 연결 — 운영 적용 기록

검증일: 2026-09-28. 사용자가 PR #55·#56 머지와 운영 배포를 승인했다.

## 적용 완료

- PR #55 MERGED: `d21d2729fdbf7e25598c664cf26c969d85e5b249`.
- PR #56 MERGED: `e978ba317361d90f9f84e96f32534d022ce00ecb`.
- PR #56 구현 최종 커밋 `baff7aa2710819a8ae7cfd5c6124a37826b3f48e`의 CI 5개 모두 성공. main의 Hanmadi/계정 서버/edge 소스가 검증한 PR 소스와 같은지 확인했다.
- 개인 GCP `replay-live-508202`, `shared-ai`, `us-central1-a`에 신규 계정 서비스 배포.
- 릴리스: `/opt/shared-ai/releases/accounts-e978ba3`. 머지한 Git archive의 계정 서비스·워커·Compose·subscription runtime·Caddyfile 5개만 전송했다.
- Compose 프로젝트 `shared-ai-accounts`, 컨테이너 `shared-ai-accounts-accounts-1`, persistent volume `shared-ai-accounts_accounts-data`. loopback 4190만 게시한다. 실행 상태 running, 재시작 횟수 0을 확인했다.
- 고정 이미지의 LiteLLM 1.102.1 및 FastAPI/cryptography import 검증 완료.
- 비공개 설정은 `/opt/shared-ai/accounts/.env.accounts`, 사용자 구분용 비밀은 `/opt/shared-ai/accounts/hanmadi-subject-secret`. 0700 디렉터리/0600 파일이며 기존 파일이 있으면 회전하지 않는다. 개인 OAuth 토큰을 개발 PC에서 복사하지 않았다.
- 기존 edge Caddy 설정 백업: `/opt/shared-ai/backups/20260928-accounts-56/Caddyfile.pre`. 새 Caddy 설정 validate 성공 후 edge만 재생성했다. 기존 Dify·LiteLLM 컨테이너와 공급자 설정은 변경하지 않았다.

공개 계정 API: `https://shared-ai-d5cy7m6i7q-uc.a.run.app/accounts`.

## 실제 서버 검증

- 내부·공개 HTTPS에서 인증된 계정 목록 GET 200, 미인증 GET 401.
- 테스트 전용 사용자 식별자로 실제 Codex 기기 인증 시작 202 → 공식 로그인 challenge 수신. 코드는 로그나 문서에 기록하지 않았으며 계정 소유자의 로그인 승인은 수행하지 않았다.
- 다른 사용자 목록에 연결이 나타나지 않고, 다른 사용자 연결 삭제는 404.
- 테스트 연결 취소 DELETE 200, 이후 목록이 빈 배열인 것을 확인했다. 대기 로그인 작업 종료 및 자격 삭제 경로를 사용했다.
- SSH/검증 명령은 모두 최종 exit 0까지 확인했다.

운영 모델 allowlist: Codex `gpt-5.5`, `gpt-6-astra`; Claude `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`. Codex 목록은 로컬 Codex 모델 카탈로그, Claude ID는 공식 [모델 문서](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions)로 확인했다. 실제 계정 entitlement·각 모델 실응답은 아직 검증하지 않았다. 연결 완료는 사용자의 새 로그인 및 probe 성공이 필요하다.

## 아직 미적용: Hanmadi Vercel 설정·화면

운영 사이트: https://hanmadi-lake.vercel.app . 작업 시작 시 배포는 `dpl_FxE9Dp3Rbz3p7m4Adsp6oCbXMNwT`, 고정 주소 https://hanmadi-ka03dj7hi-dean-10.vercel.app , READY였다. 이번 작업으로 Vercel 변수나 배포를 아직 변경하지 않았다.

자동 승인 검토가 신규 비밀값의 Vercel Production 전송에 구체적 승인이 필요하다며 아래 등록 명령을 실행 전에 거절했다. 비밀 등록은 실행되지 않았다. 사용자에게 대상과 범위를 명시해 승인을 요청했다.

- 목적지: `dean-10/hanmadi`, project `prj_xJ5tTXyMYNV6qL1fVnWxFBuIRoRf`, Production 한정.
- 전송값: `AI_ACCOUNTS_URL`, 한마디 전용 `AI_ACCOUNTS_KEY`, `AI_ACCOUNTS_SUBJECT_SECRET`.
- 계정 DB의 암호화 키 `ACCOUNT_ENCRYPTION_KEY`와 개인 OAuth 토큰은 전송 대상이 아니다.
- 방식: SSH stdout을 프로그램 메모리에서 받아 Vercel CLI stdin으로 전달. 실제 비밀값을 로그·Git·로컬 비밀 파일에 기록하지 않는다.

승인 후 순서: 변수 3개 등록 → 준비한 main 소스 `/private/tmp/hanmadi-release-e978ba3/apps/hanmadi` 운영 배포 → 실제 PIN 로그인/기본 Gemini 회화/모델 선택 및 연결 화면 검증. 실제 Codex 로그인 승인은 사용자가 직접 진행한다. 현재 기록은 부분 적용이며 전체 배포 완료가 아니다.
