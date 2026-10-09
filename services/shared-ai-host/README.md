# 공용 AI 클라우드 배포

**2026-09-27: 개인 GCP에 서버를 생성했다. Hanmadi 운영 연결은 아직 미완료다.**
사용자가 PR #44 머지와 월 $70 목표 인프라 구성을 승인했다. 검증된 커밋
`5bb8c87e0cfa9259132e84e8537bb18c19d8de74`를 VM에 설치했으며, Terraform 적용 결과는
**16 add / 0 change / 0 destroy**다. 회사 계정·프로젝트는 변경하지 않았다.

Terraform 1.5.7 / Google provider 7.46.1의 fmt·validate·시작 스크립트 문법 검사 및 PR #44 머지 후 CI 4건이 통과했다. VM의 Docker Compose는 2.40.3이며 시작 스크립트 `Result=success`를 확인했다.

## 실제 적용 및 남은 작업

- 공용 API: `https://shared-ai-d5cy7m6i7q-uc.a.run.app` (관리 UI 주소가 아님).
- 개인 프로젝트 `replay-live-508202`, VM `shared-ai`, zone `us-central1-a`, 원격 설치 경로 `/opt/shared-ai/repo`.
- LiteLLM·Postgres 및 Dify 컨테이너 기동. 공급자 Gemini·ElevenLabs 키는 사용자가 지정한 로컬 `.env`에서 필요한 값만 SSH로 주입했다. 앱별 모델 허용 목록, 분당 30회, 초기 30일 $5 예산을 적용했다. 이 숫자는 공급자 청구의 절대 상한을 보장하지 않는다.
- 실제 공개 HTTPS 일본어 회화 HTTP 200, 일본어 TTS HTTP 200/audio-mpeg/47,273 bytes, 같은 음성의 STT HTTP 200 및 원문 일치를 확인했다. 미인증 401, Replay 키의 Hanmadi 모델 접근 403, 관리 경로 404를 확인했다.
- LiteLLM/DB 재시작 후 기존 앱 키로 모델 조회 HTTP 200. salt 및 앱 키 파일 권한은 0600.
- 서버 내 `/opt/shared-ai/backups/20260927-pre-apps`에 두 DB의 논리 백업과 비공개 설정을 보관했다. 네트워크가 없는 임시 DB에 복원하여 LiteLLM 86개·Dify 144개 public 테이블을 확인했고, 검사 컨테이너는 제거했다. 이는 아직 앱/대화가 없는 초기 상태의 복원 검증이며 전체 서버 재해 복구 시험은 아니다.
- 이전 Hanmadi 배포 ID는 개발 프로젝트의 Git 제외 `data/shared-ai/`에 0600으로 보관한다. 공급자·앱 키는 이 로컬 디렉터리에 복사하지 않았다.
- Terraform state는 GCS `gs://replay-live-508202-tfstate/shared-ai-host`(객체 버전 관리)에 있다(2026-10-09 서버리스 Phase 1에서 이전). `terraform init -input=false`로 초기화한다. 저장소를 옮기기 전 위치의 로컬 state는 이전 직후 보관용으로만 남기고 쓰지 않는다.
- **대기:** Dify 최초 관리자·워크스페이스 생성, 공식 플러그인/두 앱 설정, Dify 실회화, Hanmadi Vercel 비공개 변수 주입과 운영 E2E. 자동 승인 검토가 관리자 이메일·권한 범위의 구체적 승인을 요구하여 `guswhd1085@gmail.com` 단일 워크스페이스 소유자 생성 승인을 요청했다. 거부된 초기화는 실행되지 않았다.
- Hanmadi 기존 운영 배포 `dpl_5Humr4Kq3GBe47nTWboLqHFwpYu1`와 기존 변수는 변경하지 않았다. 개인 Codex OAuth도 클라우드에 복사하지 않았다.
- 배포된 이전 `/healthz`는 VM 내부에서 200, 공개 Cloud Run에서 404였다. 이 수정본은 공개 상태 경로를 `/health`로 변경한다. 적용 전까지 공개 상태 검사 성공으로 보고하지 않는다.

## 구성

- Iowa VM: 2026-10-09부터 `e2-small`(공유 2 vCPU/2 GiB, Dify 중지 뒤 상주 약 1.1GB), 80 GiB balanced 영구 디스크. 서버리스 전환(`docs/20261009-shared-ai-serverless-migration-plan.md`) 기간의 축소 구성이며, 이전 구성 `e2-standard-2`(2 vCPU/8 GiB)·`e2-standard-4`(4 vCPU/16 GiB)도 허용값으로 남긴다.
- Dify/LiteLLM은 기존 Compose와 별도 DB를 유지한다. 개인 Codex 워커는 계정별로 추가한다.
- Cloud Run은 TLS 프록시만 담당하며 관리형 `run.app` 주소를 제공한다. 별도 도메인을 구매하지 않는다.
- Direct VPC로 VM의 8080 포트에 연결한다. 프록시 전용 서브넷(`10.79.0.0/26`)만 해당 포트에 접근한다. Cloud Run 네트워크 태그는 egress 규칙용이므로 VM ingress의 source tag로 사용하지 않는다.
- VM 외부 IP는 패키지/모델 통신용이다. 인터넷에 22/80/443/8080을 개방하지 않는다. SSH는 IAP 범위만 허용한다.
- VM에는 서비스 계정을 붙이지 않는다. 프록시 서비스 계정에도 프로젝트 역할을 부여하지 않는다.
- 디스크 자동 삭제 방지, VM/Cloud Run 삭제 방지, 매일 스냅샷/7일 보존을 설정한다. 스냅샷은 crash-consistent이며 DB 논리 백업·복원 시험의 대체가 아니다.

기본 상시 비용 예산용 계산(730시간, USD, 할인/무료 크레딧 미반영): VM 약 $48.92 + 디스크 약 $8 + IPv4 약 $3.65 = **약 $60.57/월**. 스냅샷·Cloud Run·트래픽·세금·모델 API는 별도다. 4-vCPU 구성은 같은 고정 항목 기준 약 $109.49/월이다. $70/$120은 초기 예산 후보이며 청구 상한 보장이 아니다. 리전이나 가격이 바뀌면 apply 전에 다시 계산한다. 2026-10-09 이후 e2-small 기준은 VM 약 $12.2(e2-standard-2 단가의 1/4로 추정, 공식 단가 `TODO(D1)`) + 디스크 약 $8 + IPv4 약 $3.65 ≈ **$23.9/월**이다.

근거: [VM 가격](https://cloud.google.com/products/compute/pricing/general-purpose), [디스크 가격](https://cloud.google.com/compute/disks-image-pricing), [IPv4/트래픽 가격](https://cloud.google.com/vpc/network-pricing), [Cloud Run Direct VPC](https://docs.cloud.google.com/run/docs/configuring/vpc-direct-vpc).

## 검증 및 적용

Terraform 1.5 이상과 gcloud를 사용한다. 기존 회사 gcloud 기본 계정/프로젝트나 ADC를 변경하지 않는다. **개인 계정을 명시적으로 선택한 짧은 수명의 토큰만 Terraform 프로세스 환경에 전달한다.** 토큰을 tfvars, plan 파일, Git 또는 터미널 출력에 저장하지 않는다.

```sh
cd services/shared-ai-host
terraform init -backend=false -input=false
terraform fmt -check
terraform validate
bash -n startup.sh
```

개인 계정으로 인증한 `gcloud auth print-access-token --account=<개인계정>`의 stdout을 프로그램 내부에서 받아 `GOOGLE_OAUTH_ACCESS_TOKEN`으로 전달하고, 같은 프로세스에 `TF_VAR_project_id=replay-live-508202`를 설정한다. 기존 `GOOGLE_APPLICATION_CREDENTIALS`, impersonation/credential override 환경변수를 함께 전달하지 않는다. 이 상태에서 `terraform plan -input=false`로 생성할 자원을 검토한다. 사용자가 정한 예산 내에서 `terraform apply`하며, state는 개인 디렉터리에 0600으로 보관한다. `.tfstate`는 Git 제외다. 이 모듈에 공급자 API 키나 OAuth 토큰을 넣지 않는다.

실제 배포 순서:

1. Terraform plan/apply → VM 시작 스크립트 성공과 Docker Compose 2.24.4 이상 확인. 단순 VM RUNNING은 앱 기동 성공이 아니다.
2. 검증된 저장소 커밋을 `git archive`로 만들어 IAP SSH/SCP로 `/opt/shared-ai/repo`에 설치한다. 해당 디렉터리의 설치와 아래 Docker 작업은 VM에서 `sudo` 권한으로 수행한다. 개발 checkout이나 `.env` 전체를 복사하지 않는다. 모든 Compose 상태는 유지되는 디스크 경로에 둔다.
3. `services/ai-gateway/gateway.py init` 후 사용자 지정 키 파일에서 필요한 Gemini/ElevenLabs 값만 비공개 `.env`에 주입한다. `render` → `docker compose up -d --wait`. 앱별 가상 키와 사용 예산을 설정한다. 공급자 키·마스터 키를 브라우저에 전달하지 않는다.
4. `services/dify/dify.py prepare`와 기존 README의 Compose 명령으로 Dify를 시작한다. 관리자 UI는 IAP SSH 터널의 127.0.0.1:4180으로만 열어 초기화·플러그인/앱 설정을 한다. **CI 전용 `tests/integration.py`를 운영 초기화에 사용하지 않는다.**
5. 이 디렉터리에서 `docker compose up -d`로 API 전용 edge를 시작한다. 기존 게이트웨이의 `--profile public`은 함께 사용하지 않는다. `/health`는 프록시 생존만 뜻한다. Cloud Run은 일부 `z`로 끝나는 경로를 예약하므로 `/healthz`를 공개 상태 확인에 사용하지 않는다([공식 알려진 문제](https://docs.cloud.google.com/run/docs/known-issues#reserved-url-paths)).
6. 실제 모델 회화·언어별 답변·잘못된 키·앱/계정 격리·STT/TTS·재시작 유지·백업 복원을 검증한다. 개인 Codex는 서버에서 새 device login을 하고 개발자 토큰을 자동 복사하지 않는다. 공용 Hanmadi 앱에 개인 구독 키를 공유하지 않는다.
7. 검증 후 Hanmadi 서버의 비공개 운영 환경에 아래 값을 설정하고 새 배포에서 로그인한 회화 E2E를 수행한다. 이전 환경과 배포 ID를 비밀 저장소에 보존해 문제가 나면 복원한다.

| Hanmadi 변수 | 값 |
|---|---|
| `CONVERSATION_PROVIDER` | `dify` |
| `DIFY_BASE_URL` | Terraform `api_url` |
| `DIFY_API_KEY` | Hanmadi 앱 전용 Dify 키 |
| `DIFY_USER_SECRET` | 서버에서 생성한 32자 이상 무작위 값, 이후 유지 |
| `LITELLM_BASE_URL` | `api_url` + `/llm` |
| `LITELLM_API_KEY` | Hanmadi 전용 LiteLLM 키 |

Hanmadi의 대화 저장 동의와 인증된 사용자별 대화 구분을 유지한다. 신규 공개 경로는 Dify의 chat/workflow 실행과 LiteLLM 추론만 허용하며, UI·console·키 발급·파일 업로드 경로는 404다. 실제 인증/쿼터 검사는 각 업스트림이 수행한다.

CI는 실제 Caddy와 **가짜 업스트림**으로 라우팅·Authorization 보존·미인증 거부·관리 경로 차단을 검사한다. Terraform validate는 문법/공급자 스키마 검사이며 클라우드 배포 성공을 증명하지 않는다.
