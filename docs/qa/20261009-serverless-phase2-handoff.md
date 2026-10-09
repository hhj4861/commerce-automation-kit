# Shared AI 서버리스 Phase 2 인계·준비 확인 — 2026-10-09

## 작업 범위

- 목적: Claude 중단 지점부터 승인된 준비 묶음 A를 이어서 실행한다. 공급자 유료 호출(묶음 B)과 운영 전환은 이번 승인에 포함하지 않는다.
- 담당: 현재 Codex 세션. 소스는 기존 로컬 worktree `commerce-automation-kit-worktrees/shared-ai-serverless-p2`의 `f84182f238f5e70b3eeac057fa1a1960c6bca1e4`를 사용한다.
- 완료 조건: 준비 상태를 실측하고, 가능한 A 단계 적용·검증 및 남은 의존성을 기록한다. 새로운 코드 변경은 없다.
- 기준 계획: main의 `docs/plans/20261009-serverless-p2-staging-poc.md`, Task 7.

## 인계 시 실측

- PR #173은 MERGED, 해당 revision의 GitOps/configuration CI 모두 SUCCESS. 74개 단위 테스트와 Caddy 검증은 해당 CI 증적을 재사용하며 이번 세션의 새 테스트 실행으로 주장하지 않는다.
- 이미지 빌드 run 37926972693은 동일 revision에서 SUCCESS.
- 기존 master·salt·Hanmadi chat·ElevenLabs·TypeSafe 시크릿은 각각 ENABLED 버전 1이다. 값은 재생성하거나 출력하지 않았다.
- `litellm-stg-database-url`은 버전이 없었다. `neon-stg-api-key` 컨테이너와 Scheduler API도 없었다.
- 남겨진 Terraform 계획(2026-10-09T11:59:22Z)은 두 리소스 추가만 포함했고 적용되지 않은 상태였다.

## 이번 GCP 적용

개인 계정과 프로젝트를 명시했다: `guswhd1085@gmail.com`, `replay-live-508202`.

최신 상태로 계획을 다시 만들고(2026-10-09T12:11:38Z) 다음 두 create만 있는지 검사한 뒤 저장한 계획을 적용했다.

- `google_project_service.api["cloudscheduler.googleapis.com"]`
- `google_secret_manager_secret.managed["neon-stg-api-key"]`

결과: **2 added, 0 changed, 0 destroyed**, exit 0. 후속 조회에서 API 활성화와 자동 복제 시크릿 컨테이너를 확인했다. 시크릿 값은 아직 없었다. 당시 Cloud Run 서비스 목록에는 기존 `shared-ai`만 있었다.

이는 7-4a의 선행 두 리소스를 먼저 적용한 것이다. 이후 7-4a 계획은 기존 10개에서 이미 생성된 두 개를 뺀 8개 추가가 예상되며, 정확한 주소를 다시 검토한다. 운영 VM·기존 DB·기존 서비스는 변경하지 않았다.

## Neon 확인 및 진행

사용자가 개인 Google 계정 로그인과 별도 무료 스테이징 DB 준비를 명시적으로 승인했다.

- 로그인 후 기존 `Vercel: DEAN` 조직에 `replay-live-db`만 있음을 확인했다. 조직 목록도 이 조직 하나였다. 기존 DB는 변경하지 않았다.
- 무료 `Shared AI Staging` 조직 생성 완료: `org-square-salad-25364489`.
- 무료 `shared-ai-stg` 프로젝트 생성 완료: `small-thunder-87572332`.
- 생성 설정: AWS US East 2 (Ohio), PostgreSQL 16, 데이터베이스 `litellm_stg`. Object storage·Functions·AI Gateway·Neon Auth는 선택하지 않았다.
- direct DB 연결 문자열을 `litellm-stg-database-url` 버전 1에 등록했다. 기존 버전이 없음을 먼저 확인하고 host·DB·비밀번호 유무를 검증했으며, `sslmode=require&connect_timeout=15`를 적용했다. 저장 후 값 전체를 메모리에서 대조해 일치함을 확인했고 클립보드의 복사값은 비웠다. 값 자체는 출력하지 않았다.
- Neon UI에서 Free 조직에서도 Project-scoped API 키를 선택할 수 있음을 확인했다. `shared-ai-stg` 한정 관측용 키 설정까지 준비했으며 생성 직전 사용자 확인을 요청했다. 사용자가 발급·보관을 승인한 뒤 키를 생성했고, API로 정확한 프로젝트 이름·ID·PG16·Ohio를 확인했다. `neon-stg-api-key` 버전 1 등록 및 메모리 내 전체 값 대조에 성공했다. 복사한 클립보드는 비웠다.
- 7-4a의 나머지 계획은 2026-10-09T12:23:08Z 기준 예상한 전용 SA 1개·시크릿 IAM 6개·Job 1개 추가만 포함했다. 적용은 exit 0, **8 added, 0 changed, 0 destroyed**로 완료했다. 마이그레이션 실행 `litellm-stg-migrate-dthkb`가 성공 종료했다. read-only `observe.py sql tables`는 exit 0, public 테이블 78개를 반환했다.
- 마이그레이션·HTTP 스모크·프록시 검증까지 완료했다. 남은 절전 사전 관측은 아래 상태를 따른다.

비밀값·Terraform state·토큰을 이 문서나 iCloud 작업 산출물에 기록하지 않는다.

## 서비스 배포와 스모크

- 7-4b 계획(2026-10-09T12:30:15Z)은 신규 서비스 3개·전용 서브넷·invoker IAM 2개·Scheduler SA·Scheduler만 포함했다. 적용 exit 0, **8 added, 0 changed, 0 destroyed**. 전체 인계 후 추가는 2+8+8=18개이며 기존 리소스 변경·삭제는 없다.
- `litellm-stg`, `shared-ai-probe-stg`, `shared-ai-stg` 모두 Ready=True. 기존 `shared-ai` Ready 전환 시각은 기존 2026-09-27 그대로다.
- `litellm-stg-warm`은 PAUSED. 스테이징 edge invoker는 개인 계정과 스테이징 Scheduler SA만 있으며 allUsers는 없다.
- HTTP 확인: ID 토큰 없음 401, 잘못된 LiteLLM 키 401, 정상 키 모델 목록 200, liveliness 200, 차단 관리 경로 404. 두 인증 헤더 분리와 HTTPS upstream Host가 이 경로에서 동작했다.
- 별도 시험 키(1시간·$0.05 상한·hanmadi-chat 한정)의 mock metadata=True를 조회로 확인한 뒤 mock 응답 `pong`/200을 확인했다. 응답 usage는 28 tokens이며 실공급자 비용으로 해석하지 않는다. 시험 키는 즉시 삭제(200), 재사용 모델 목록 요청 401로 폐기를 확인했다. 키 값은 파일에 저장하지 않았다.
- 마이그레이션 로그에 `All migrations have been successfully applied.`와 exit 0을 확인했다. 정확한 `skip_server` 문구는 없으므로 해당 문구를 확인했다고 주장하지 않는다.
- 임시 프로브에서 chat·JEV·Gemini native 세 경로 모두 HTTP 200, 본문 길이 93·170·114 bytes 및 `/llm` 접두어 제거를 확인했다. 프로브가 받은 Host에는 `:443`이 없었다. 이는 전송 경로 검증이며 실제 JEV/Gemini 공급자 기능 검증은 아니다.
- finally에서 LiteLLM upstream을 복구했고 정상 키 모델 목록 200을 재확인했다. 마지막 확인 요청: 2026-10-09T12:36:02.574Z.
- 복구 후 전체 Terraform plan은 **changed_resources 0**. 스테이징 코드와 실제 상태가 일치한다.

## 남은 무료 사전 관측과 승인 경계

- 7-5e는 시간 경과가 필요한 항목이다. 마지막 요청 후 20분 대기 → LiteLLM 종료 로그 확인 → Neon idle 확인(최대 15분) → 1분 간격으로 15분 상태 관측하는 **1회성 읽기 전용 프로세스**를 시작했다.
- `caffeinate -ims`는 이 프로세스 실행 동안만 적용한다. Neon 콘솔 확인용 탭은 닫았다. 모델 생성·DB SQL·서비스 재시작·Scheduler 재개는 하지 않는다.
- 시작 시각부터 전체 관측 완료를 주장하지 않는다. 종료 증거가 없거나 idle에 도달하지 않으면 실패 기록을 남기고 종료하며, 오류/잠자기 공백/상태 변경이 있으면 통과하지 않는다.
- 결과: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261009-serverless-p2/neon-poll-preflight.jsonl`. `preflight-result`의 실제 값을 읽어 판정한다.
- 관측은 빨라도 **2026-10-09 22:11 KST 이후** 끝난다. 추가 idle 대기 여부에 따라 늦어질 수 있다. 아직 결과 미확인이다.
- 유료 기능·부하·콜드 스타트·24시간 비용 측정(묶음 B)은 실행하지 않았다. 운영 트래픽 전환, 운영 VM 중지/삭제도 하지 않았다.
- 다음: 절전 사전 관측 결과 확인 후, 묶음 B의 실호출·관측 범위를 별도 승인받아 진행한다. Phase 2 전체 완료나 서버리스 전환 완료가 아니다.

