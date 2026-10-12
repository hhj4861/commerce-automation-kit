# Accounts 서버리스 스테이징 배포·검증 — 2026-10-12

## 결과와 범위

PR #183을 승인 후 머지하고 API 키 전용 계정 서비스를 서버리스 스테이징에 배포했다. 운영 VM, 운영 edge, 기존 플랫폼의 URL·로그인·키는 유지했다. **VM 전체 기능의 이전 완료나 운영 전환을 뜻하지 않는다.**

- 담당: 현재 Codex 세션. 목표: 빠져 있던 accounts 스테이징을 배포하고 실제 HTTP·공통 클라이언트·영구 저장·격리·삭제를 확인한다.
- 코드: [PR #183](https://github.com/hhj4861/commerce-automation-kit/pull/183), 머지 `97a5c6c1f7072688048290e770eb3b54a1cb1e8c`. 머지 전 해당 head의 CI 10개 모두 성공을 재확인했다.
- 서비스 계약: `openai|claude` API 키 연결이다. 기존 D4 결정대로 Codex·Claude Code 구독 로그인은 지원하지 않는다. **기존 VM 구독 로그인과의 기능 동등성은 충족하지 않는다.**
- 정상 공급자 응답: 사용할 OpenAI·Claude 시험 API 키가 확인되지 않아 미검증이다. 저장 위치를 사용자에게 요청했으며 운영 사용자 자격을 임의로 복사하지 않았다.
- 앱 화면/실제 사용자의 연결·대화, 백업 복원, 비용 최적화 확정은 이번 완료 항목이 아니다.

## 실제 배포

이미지 prefix는 `us-central1-docker.pkg.dev/replay-live-508202/shared-ai/`이다. 두 빌드는 위 머지 커밋에서 실행했다.

| 이미지 | digest | 빌드 |
|---|---|---|
| accounts-staging | `sha256:86c55f51cb7694d7e5a197b477c8ef3a2f468d5ce6cca89b678b7f6ff8151ff4` | [38189162092](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38189162092) 성공 |
| edge-accounts | `sha256:8a18984b51d5b6b77343411651706a7e78112ae33e6d75c01761479f09027a81` | [38189163499](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38189163499) 성공 |

1. 전체 Terraform plan에서 계정 스테이징 시크릿 컨테이너 **3개 추가만** 확인 후 적용했다.
2. 기존 Neon 스테이징 안에 별도 빈 `accounts_stg` DB와 `accounts_stg_owner`를 만들었다. 소유자는 superuser/CREATEDB/CREATEROLE 권한이 없다. DB URL, 합성 플랫폼 토큰 2개, AES-256 키링은 별도 Secret Manager 컨테이너의 버전 1에 저장했다. 비밀값을 파일·Git·대화에 쓰지 않았다.
3. 첫 DB 생성은 소유자에 대한 SET ROLE 권한이 없어 실패했다. 새 스테이징 role에 대한 SET 권한만 생성 계정에 일시 부여해 `template0`에서 빈 DB를 만든 뒤 회수했으며, 권한이 false인 것을 조회했다. 기존 DB 데이터는 복사하지 않았다. [PostgreSQL 16의 DB 소유자 조건](https://www.postgresql.org/docs/16/sql-createdatabase.html)에 따른 조치다.
4. 서비스 계정·시크릿 접근·Job **6개 추가만** 확인 후 적용했다. `accounts-stg-migrate-mrtf2` 성공 후 SQL로 테이블과 0개 레코드를 확인했다.
5. accounts 서비스·만료 Job 호출 권한·Scheduler **3개 추가**, 스테이징 edge upstream **1개 변경**을 적용했다. 이어 스테이징 edge만 새 이미지로 바꿨다. 운영 자원 변경·삭제는 없었다.
6. 계정 서비스는 내부 ingress, min=0/max=2이며 앱의 플랫폼 키 인증을 요구한다. 스테이징 edge는 계속 운영자 IAM 인증을 요구하고 공개 invoker가 없다. 일일 만료 Job은 UTC 03:00에 실행하도록 구성했다.

스테이징 endpoint: `https://shared-ai-stg-d5cy7m6i7q-uc.a.run.app/accounts`.

## 실행한 기능 검증

`accounts-http-phase1.json`의 실제 HTTP 20건은 모두 기대한 status와 일치했다.

| 항목 | 실제 결과 |
|---|---|
| edge IAM 없음 / subject 없음 | 각각 401 |
| 외부에서 내부 accounts 직접 호출 | 404 |
| 닫힌 accounts health·authorize 경로 | 404 |
| Codex 구독 로그인 요청 | 400, 미지원 계약을 명시적으로 거부 |
| 초기 계정 목록 | 200, 빈 목록 |
| 잘못된 OpenAI·Claude 시험 키 | 각 202/error, 모델 목록 비어 있음; 정상 연결로 채택하지 않음 |
| 같은 공급자 중복 연결 | 각 409 |
| 다른 사용자·다른 플랫폼 조회/삭제 | 빈 목록 / 404 |
| error 계정으로 chat | 409, 추론 미실행 |
| 잘못된 키 연결 해제 | 각 200; SQL에서 암호문 0개 확인 |
| 합성 암호문 레코드 조회 / 미허용 모델 | 200 / 403 |

잘못된 키 검증은 실제 공급자의 model-list 경로에 가짜 시험 키를 각 1회 보낸 것이다. 유효한 API 키 인증·생성 성공의 증거가 아니다. 유료 추론 호출은 0회다.

### 암호문·리비전 교체·공통 클라이언트

- 실제 공급자 키 대신 **명시적인 합성 비자격 문자열**을 PR의 `Keyring`으로 암호화해 별도 시험 사용자의 PostgreSQL 레코드에 넣었다. 이 직접 DB fixture는 정상 연결 검증을 통과한 것으로 간주하지 않는다.
- 같은 이미지로 새 리비전 `accounts-stg-parity20261012`을 배포하고 트래픽 100%를 전환했다.
- 수정하지 않은 `packages/litellm-client/accounts.mjs`에 스테이징 IAM 헤더만 더해 목록이 이전 값과 동일한지 확인했다. 다른 플랫폼은 빈 목록/삭제 404였다.
- 공통 클라이언트로 연결 해제 후 목록이 비었고 SQL에서 해당 레코드가 `disconnected`, `secret_ct IS NULL`임을 확인했다.
- 시험용 리비전 이름과 gcloud client 메타데이터만 Terraform으로 정리했다. 이미지·환경값·서비스 제한은 동일하게 유지했다.

### 만료 정리

기한이 지난 합성 암호문 1개를 별도 생성하고 `accounts-stg-expire` Scheduler를 수동 트리거했다. 첫 SQL 확인은 Job 시작 대기 중이어서 `connected|false`였다. 이를 성공으로 처리하지 않고 실행 완료 증거를 기다렸다.

- 실행 `accounts-stg-expire-jsj47`은 01:02:37 UTC에 성공했다. 컨테이너 exit 0과 `Accounts maintenance complete`도 확인했다. Scheduler의 OAuth 호출로 실제 Job이 실행됐다.
- **API 조회 전에 SQL로** `expired|true`(expired 상태, 암호문 NULL)를 확인했다. 조회 시 자동 만료 처리와 혼동하지 않는다.
- 이어 실제 API에서 expired 목록 200/빈 모델, chat 거부 409, 연결 해제 200, 최종 빈 목록 200을 확인했다.
- 최종 DB에는 합성 시험 메타데이터 4개만 disconnected 상태로 남았다. 활성 연결 0개, 암호문 0개다. 실제 공급자 키를 생성·저장·폐기한 시험은 아니다.

## 최종 적용 상태

Terraform 전체 재계획은 detailed exit code 0으로 **변경 0개**였다. 2026-10-12 01:03:13 UTC 제어면 조회에서 아래 상태를 확인했다.

| 대상 | 최종 상태 |
|---|---|
| accounts-stg | `accounts-stg-00003-w57`, Ready, min=0/max=2 |
| 스테이징 edge | `shared-ai-stg-00007-r4m`, Ready, min=0, IAM 비공개 |
| LiteLLM / discovery 스테이징 | 기존 `00006-h2c` / `00003-gdp` 유지, Ready, min=0 |
| 운영 VM | RUNNING/e2-small, 기존 시작 시각 `2026-10-08T22:22:13.788-07:00` 유지 |
| 운영 edge | 기존 `shared-ai-00001-f8t` 유지 |
| 스케줄러 | 비용 시험용 `litellm-stg-warm` PAUSED, 계정 만료용 `accounts-stg-expire` ENABLED |

후속 Terraform 적용은 `terraform-inputs.json`에 기록한 기존 platform_staging과 새 accounts_staging 설정을 함께 유지한다. 이 파일은 비밀값 없는 적용 입력 스냅샷이며, 실제 자격값을 포함하지 않는다. 저장한 plan 파일은 적용 성공 후 삭제했다.

## 기존 경로와 남은 제한

- 새 edge에서도 LiteLLM 모델 목록 200, 기존 alias 5개 유지, discovery 인증 오류 401을 확인했다. 이번에는 생성·검색을 다시 실행하지 않았다.
- 유휴 후 LiteLLM 모델 목록 응답은 **46,343ms**였다. 기존 앱의 30초 제한 문제는 해결되지 않았다. 계정 API의 이번 빠른 응답을 전체 LLM 콜드 스타트 통과로 바꾸어 해석하지 않는다.
- 실제 OpenAI·Claude API 키 연결과 정상 텍스트·JSON 응답, Hanmadi 등 소비 앱 UI 흐름은 미검증이다. 공통 클라이언트 source 변경만으로 소비 앱의 vendored 패키지가 갱신되지는 않는다.
- 운영 VM 유지와 운영 전환 보류를 계속한다. 다음은 안전한 시험 API 키 주입 후 실제 공급자/소비 앱 검증이며, 구독 로그인 지원 범위와 min=0 지연 문제는 별도 미해결 항목이다.

## 증거 위치

비밀값 없는 원본·Terraform 입력은 `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261012-accounts-staging/`에 있다. DB URL/플랫폼 키/키링의 실제 값은 Secret Manager에만 있다.

- `terraform-inputs.json`, `serve-plan-summary.json`, `normalize-plan-summary.json`
- `accounts-http-phase1.json`, `accounts-common-client.json`, `existing-routes.json`
- `accounts-expiry-cleanup.json`, `expiry-execution-final.json`, `final-cloud-state.json`, `checksums.json`
- HTTP 기대값 20+4건, 공통 클라이언트 결과, SQL 최종 수량을 교차 확인했다. 증거 JSON 12개의 SHA-256을 기록하고 자격값 형태 검사에서 일치 0건을 확인했다. 검사 통과를 비밀정보 부재의 절대 보장으로 주장하지 않는다.
- 전체 클라우드/인프라 비용을 측정한 결과는 아니다. 이번 신규 계정 검증의 유료 모델 추론은 0회다.
