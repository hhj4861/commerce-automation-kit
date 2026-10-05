# 플랫폼별 배포 브랜치

지정 브랜치에 PR을 머지하면 GitHub Actions가 해당 서비스만 배포한다.
이 구성은 브랜치 기반 CI/CD이며 실행 중 설정의 drift를 주기적으로 복구하는 컨트롤러는 아니다.

| 플랫폼 | 저장소 | 배포 브랜치 | 배포 대상 |
|---|---|---|---|
| Shorts 웹 | commerce-automation-kit | `deploy/shopshorts` | Cloudflare Pages `shopshorts-dash` |
| Hanmadi 웹 | commerce-automation-kit | `deploy/hanmadi` | Vercel `hanmadi`; [학습 앱 활성화 상태](hanmadi-learner.md) |
| Hanmadi 관리자 | commerce-automation-kit | `deploy/hanmadi-admin` | Vercel `hanmadi-admin`; [분리·활성화 상태](hanmadi-admin.md) |
| FIRSTFRAME | commerce-automation-kit | `deploy/firstframe` | Cloudflare Pages `firstframe-showcase` |
| LiteLLM | commerce-automation-kit | `deploy/litellm` | 개인 GCP `replay-live-508202`의 `shared-ai` |
| Replay 웹·API | **replay-live** | 목표 `deploy/replay` | Vercel `replay-live-poc` + `replay-live-api`; 별도 저장소에서 연결 필요 |
| Festa 웹 | **venture-studio** | 목표 `deploy/festa` (현재 `feature/agent-test`) | Cloudflare Pages `festacheck`; 별도 저장소에서 연결 필요 |

`targets.json`이 대상 정보 원본이다. `paths`는 해당 서비스 소스 범위 참고용이며 배포 필터가 아니다.
개발 브랜치와 `main` push는 운영 배포를 실행하지 않는다. 배포 브랜치 최초 생성/삭제도 배포하지 않는다.
배포 브랜치의 모든 후속 push는 해당 플랫폼을 배포한다. 다른 앱 변경만 포함된 경우에도 재배포하여
연속 머지·대기 작업 교체 때문에 필요한 배포가 누락되는 일을 방지한다.
플랫폼마다 실행을 직렬화하고 실행 직전 원격 브랜치보다 오래된 revision은 거부한다.

## 적용 상태

이 PR은 워크플로·권한 정책·서버 릴리스 도구를 추가한다. **운영 활성화는 아직 하지 않았다.**
배포 토큰 등록, broker 재배포, GCP identity 적용, 브랜치 생성/보호, 첫 운영 배포 검증이 남아 있다.
Cloudflare Pages는 조회 시 Git 연결 없는 Direct Upload이고, Shorts/FIRSTFRAME의 production branch는 `main`이었다.
Festa는 `feature/agent-test`였다. Vercel Git 연결 상태는 API 접근 제한으로 확인하지 못했다.

## 활성화 순서

1. 검증한 이 PR을 사용자 승인 후 `main`에 머지한다. 아직 배포 브랜치가 없으므로 서비스는 배포되지 않는다.
2. 웹 배포 인증정보를 Cloudflare Secrets Store에 등록하고 broker를 활성화한다.
3. LiteLLM 배포용 GCP Workload Identity Federation을 적용한다.
4. 검토된 머지 커밋에서 위 네 배포 브랜치를 만들고 보호한다. PR을 필수로 하고 force push와 삭제를 금지한다.
   `Platform GitOps verification`을 필수 검사로 지정한다. 보호되지 않은 브랜치는 배포 코드가 거부한다.
   `GITHUB_REF_PROTECTED`는 보호 규칙의 존재만 검증하므로 PR 필수 규칙은 관리자가 실제 설정해야 한다.
5. Cloudflare 프로젝트의 production branch를 각각 `deploy/shopshorts`, `deploy/firstframe`으로 바꾼다.
   프로젝트 정보의 production branch가 다르면 배포 스크립트가 preview 업로드 전에 중단한다.
6. 각 배포 브랜치에서 `Platform deployment`를 수동 실행해 첫 배포와 사이트/서버 상태를 확인한다.
   이후 `main` → 해당 배포 브랜치 PR을 만들고 승인·머지하면 자동 배포한다.

Hanmadi의 `vercel.json`은 Vercel 자체 Git 배포를 끄므로 Actions와 중복 배포되지 않는다.
**이 설정이 머지된 뒤에는 기존 native Git 배포에 의존하지 말고 인증/브랜치 준비 후 첫 Actions 배포까지 확인한다.**
학습 앱과 관리자는 각각의 프로젝트 전용 토큰으로 테스트 → 소스 업로드 → Vercel production 원격 빌드·배포를 사용한다.
팀 조회가 필요한 `pull`은 사용하지 않는다. 학습 앱도 운영 SHA·Google 로그인 준비 상태·공개 개인정보처리방침·비로그인 관리자 접근 차단을 확인한 뒤 배포 성공으로 처리한다.
[학습 앱 활성화 상태](hanmadi-learner.md)와 [관리자 설정](hanmadi-admin.md)을 구분한다.

## 인증정보

GitHub Secrets에 배포 키를 추가하지 않는다. 기존 `CAK_SECRETS_URL` 변수를 사용해
GitHub의 짧은 수명 OIDC 토큰으로 Cloudflare broker에 필요한 키만 요청한다.

| Cloudflare Secrets Store 이름 | 용도 |
|---|---|
| `CAK_DEPLOY_CLOUDFLARE_API_TOKEN` | 위 Cloudflare 계정의 Pages 편집용 API 토큰 |
| `CAK_DEPLOY_VERCEL_TOKEN` | 학습 앱 Vercel `hanmadi` 프로젝트 전용 배포 토큰 |

로컬 로그인 토큰을 복사하지 말고 CI용 토큰을 발급한다. Cloudflare 토큰은 Pages 편집에 필요한 계정 범위로 제한한다.
Vercel 토큰은 대상 프로젝트만 접근하도록 제한하고 만료를 설정한다. 토큰 값은 Git·로그·채팅에 남기지 않는다.
권한 `0600`인 비공개 JSON 파일에 필요한 키만 넣어 다음 명령으로 등록한다.

```sh
node apps/credential-broker/admin.mjs register-deploy /private/path/deploy-credentials.json
```

JSON 키는 `DEPLOY_CLOUDFLARE_API_TOKEN`, `DEPLOY_VERCEL_TOKEN`이다.
명령은 Secret Store 값과 `wrangler.json`의 binding 메타데이터를 갱신한다.
파일 변경 전 task-finish track을 적용하고 binding 메타데이터만 검토·커밋한다.
broker의 `GITHUB_DEPLOY_ALLOWED_REFS`를 다음 값으로 설정하고 검토된 broker를 별도 배포한다.

```text
refs/heads/deploy/shopshorts,refs/heads/deploy/firstframe,refs/heads/deploy/hanmadi
```

기본값은 빈 문자열이므로 준비 전에는 모든 배포 토큰 요청을 거부한다.
정확한 저장소 ID·소유자 ID·브랜치·워크플로·이벤트·GitHub-hosted runner·immutable subject를 검증한다.
Shorts/FIRSTFRAME은 Cloudflare 키만, Hanmadi는 Vercel 키만 받는다.
기존 수집/음성 작업, Pages runtime, 제작 워커에 배포 키를 제공하지 않는다.
LiteLLM은 broker 배포 키를 사용하지 않는다.

## LiteLLM의 GCP 인증과 배포

`gcp-identity/`는 기존 서버 인프라와 분리한 Terraform root module이다.
회사 계정/프로젝트를 사용하지 않는다. 검증된 개인 계정으로 plan을 검토한 뒤 apply한다.
기존 Terraform state에 임의로 합치지 않고, 해당 state는 접근 제한된 운영 저장소에 보존한다.
리소스: 배포용 서비스 계정, WIF pool/provider, VM 조회 권한,
**shared-ai 인스턴스에만** OS Admin Login, IP `10.78.0.2` 포트 22에 한정한 IAP 터널 권한.
WIF는 정확한 저장소·배포 브랜치·워크플로의 push/manual 이벤트만 신뢰한다.
VM의 OS Login이 활성화되어 있어야 한다. VM에 서비스 계정을 연결할 경우 추가 `actAs` 권한을 별도 검토한다.

```sh
cd ops/deploy/gcp-identity
terraform init -lockfile=readonly
terraform plan -out=identity.tfplan
# plan 검토와 적용 승인 이후
terraform apply identity.tfplan
```

출력 `github_provider_variable`, `github_service_account_variable`을 각각 GitHub **Variables**의
`GCP_DEPLOY_WIF_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`에 설정한다. 이 값은 비밀이 아니다.
장기 서비스 계정 JSON 키는 생성하지 않는다.

릴리스는 triggering SHA의 소스를 archive해 IAP SSH로 전달하고 `/opt/shared-ai/releases/gitops-litellm-<SHA>`에 설치한다.
기존 `.env`와 `.runtime`을 공유하며 비밀번호·암호화 키·구독 인증을 재발급하지 않는다.
`shared-ai-gateway` compose project/DB 볼륨을 유지하고 gateway 및 기존 Codex 계정 워커만 갱신한다.
DB·Dify·별도 accounts 서비스·edge는 재시작하지 않는다. DB/네트워크/볼륨 구조 변경은 별도 운영 작업이다.
계정 관리 명령과 같은 lock을 잡고, DB dump와 생성 설정 백업 후 render → Compose 검증 → up → readiness를 확인한다.

실패 시 생성 설정과 이전 컨테이너 구성을 복구한다. **DB 스키마 migration은 자동 되돌리지 않는다.**
`/opt/shared-ai/backups/gitops-litellm-*`의 비공개 dump로 별도 복구가 필요할 수 있다.
배포 성공 기록은 `/opt/shared-ai/gitops/litellm.json`에 SHA·이전 소스·백업 경로로 남는다.
같은 SHA의 release 디렉터리가 있으면 덮어쓰지 않는다. 실패 후 재시도는 원인 수정 커밋을 검토·머지하거나,
서버 관리자가 해당 디렉터리가 사용 중이지 않음을 확인해 정리한 뒤 수동 실행한다.
이전 버전으로 되돌릴 때는 코드 revert PR을 배포 브랜치에 머지한다. force push하지 않는다.

## Festa 담당 세션 인계

사용자 제공 확정 정보:

- 저장소: `hhj4861/venture-studio` — https://github.com/hhj4861/venture-studio
- 최신 머지 브랜치: `feature/agent-test`
- 앱 경로: `ventures/market/party-festival-guide/app`
- 로컬 작업 기준: 위 `app` 폴더
- Cloudflare 프로젝트: `festacheck`
- 현재 수동 배포이며 자동 배포 연결 필요

해당 저장소에서 앱의 실제 빌드/검사 명령을 확인하고 전용 배포 워크플로를 작성한다.
목표 배포 브랜치는 `deploy/festa`로 통일한다. 현재 `feature/agent-test`의 검토된 소스를 승격하고
Cloudflare production branch를 일치시킨다. 최초 브랜치 생성이 운영 배포를 자동 실행하지 않게 한다.
commerce-automation-kit의 Festa 설정은 **공용 AI 서버의 소비자 설정**이며 Festa 웹 소스가 아니다.
현재 broker는 venture-studio OIDC 요청을 거부한다. Festa용 별도 repo ID·workflow·branch 신뢰 정책과 키 범위를 검토해야 한다.
그 전에 이 저장소의 배포 키/저장소 신뢰 범위를 임의로 공유하지 않는다.

담당 세션별 사용자 요청과 완료 기준은 [Codex GitOps 인계](codex-gitops-handoff.md)에 있다.
직접 전달/수신 여부는 해당 문서에 구분한다. venture-studio 파일은 이번 작업에서 변경하지 않았다.

## Replay 담당 세션 인계

로컬 `/Users/admin/workSpace/replay-live-poc`의 origin은 `hhj4861/replay-live`다.
로컬 운영 문서 기준 배포 대상은 Vercel 웹 `replay-live-poc`와 API `replay-live-api` 두 프로젝트다.
웹 소스는 `web/`, API는 저장소 루트이며 공용 LiteLLM VM 배포와 별개다.
현재 클라우드 실제 배포 설정은 Replay 담당자가 재조회해야 한다.

기존 `docs/branch-workflow.md`의 `feat/* → develop → main` 통합 규칙을 유지하고,
검증한 `main → deploy/replay` PR 머지를 운영 배포 트리거로 추가한다.
두 프로젝트와 worker snapshot의 호환성, 마이그레이션·복구·기존 방송 영향을 확인한 뒤 승격한다.
기존 CI는 검증 파이프라인이므로 배포 성공 증거로 사용하지 않는다.
Cloudflare의 별도 Replay 배포 자격과 repository ID·workflow·branch별 OIDC 신뢰가 필요하다.
GitHub Secrets로 장기 키를 복사하거나 이 저장소의 신뢰 정책을 모든 저장소에 개방하지 않는다.
Replay의 기존 GCP 진단 중단 지시는 유지하며 이번 GitOps 요청을 GCP 이전으로 해석하지 않는다.
replay-live 파일은 이번 작업에서 변경하지 않았고 해당 저장소의 자동 배포는 아직 구현·활성화 전이다.

## 검증과 경계

```sh
node --test ops/deploy/test.mjs apps/credential-broker/test/*.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s ops/deploy -p 'test_*.py'
terraform -chdir=ops/deploy/gcp-identity fmt -check
terraform -chdir=ops/deploy/gcp-identity validate
```

단위 테스트는 브랜치 격리·수동 실행 불일치·OIDC 권한·서버 백업/복구를 검증한다.
mock 서버 테스트 통과는 실제 GCP 배포 성공을 의미하지 않는다. 첫 Actions 배포에서 실제 인증과 readiness를 확인해야 한다.
Shorts 제작 워커, Dify, 독립 accounts, broker bootstrap의 자동 배포는 이 파이프라인에 포함하지 않는다.

공식 근거: [Pages CI Direct Upload](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
[Pages branch controls](https://developers.cloudflare.com/pages/configuration/branch-build-controls/),
[Vercel Git deployment 설정](https://vercel.com/docs/project-configuration/git-configuration),
[Google GitHub Actions 인증](https://github.com/google-github-actions/auth),
[GitHub Actions workflow 문법](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax).
