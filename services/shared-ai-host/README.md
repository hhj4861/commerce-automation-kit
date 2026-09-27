# 공용 AI 클라우드 배포

**배포 준비 코드다. 아직 서버를 생성하거나 Hanmadi 운영 설정을 바꾸지 않았다.**
개인 GCP `replay-live-508202`의 결제 활성화와 기존 Cloud Run 서비스 없음은 조회했다.
Compute API는 아직 꺼져 있다. 월 예산 확정 후 실제 plan을 검토하고 apply한다.

2026-09-27: Terraform 1.5.7 / Google provider 7.46.1로 fmt·validate·시작 스크립트 문법 검사를 통과했다. Mac/Linux 공식 체크섬을 함께 고정했다. 개인 계정을 명시한 최종 plan은 **16 add / 0 change / 0 destroy**이며 apply는 실행하지 않았다. 새 자원의 실제 생성 권한·리전 수용량·앱 기동은 아직 검증되지 않았다.

## 구성

- Iowa VM: 기본 `e2-standard-2`(2 vCPU/8 GiB), 80 GiB balanced 영구 디스크. 여유 구성은 `e2-standard-4`(4 vCPU/16 GiB).
- Dify/LiteLLM은 기존 Compose와 별도 DB를 유지한다. 개인 Codex 워커는 계정별로 추가한다.
- Cloud Run은 TLS 프록시만 담당하며 관리형 `run.app` 주소를 제공한다. 별도 도메인을 구매하지 않는다.
- Direct VPC로 VM의 8080 포트에 연결한다. 프록시 전용 서브넷(`10.79.0.0/26`)만 해당 포트에 접근한다. Cloud Run 네트워크 태그는 egress 규칙용이므로 VM ingress의 source tag로 사용하지 않는다.
- VM 외부 IP는 패키지/모델 통신용이다. 인터넷에 22/80/443/8080을 개방하지 않는다. SSH는 IAP 범위만 허용한다.
- VM에는 서비스 계정을 붙이지 않는다. 프록시 서비스 계정에도 프로젝트 역할을 부여하지 않는다.
- 디스크 자동 삭제 방지, VM/Cloud Run 삭제 방지, 매일 스냅샷/7일 보존을 설정한다. 스냅샷은 crash-consistent이며 DB 논리 백업·복원 시험의 대체가 아니다.

기본 상시 비용 예산용 계산(730시간, USD, 할인/무료 크레딧 미반영): VM 약 $48.92 + 디스크 약 $8 + IPv4 약 $3.65 = **약 $60.57/월**. 스냅샷·Cloud Run·트래픽·세금·모델 API는 별도다. 4-vCPU 구성은 같은 고정 항목 기준 약 $109.49/월이다. $70/$120은 초기 예산 후보이며 청구 상한 보장이 아니다. 리전이나 가격이 바뀌면 apply 전에 다시 계산한다.

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
5. 이 디렉터리에서 `docker compose up -d`로 API 전용 edge를 시작한다. 기존 게이트웨이의 `--profile public`은 함께 사용하지 않는다. `/healthz`는 프록시 생존만 뜻한다.
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
