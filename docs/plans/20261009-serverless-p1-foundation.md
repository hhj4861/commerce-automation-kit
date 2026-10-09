# 서버리스 전환 Phase 1 — 기반 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (사용자가 네이티브 실행을 선택함) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 2 스테이징 PoC에 필요한 기반을 만든다. 범위는 Terraform state의 GCS 이전과 e2-small 반영, Artifact Registry와 Secret Manager 컨테이너, WIF 이미지 빌드 경로, LiteLLM·edge 스테이징 이미지다.

**Architecture:** 기존 `services/shared-ai-host` Terraform 모듈에 레지스트리·시크릿 컨테이너를 추가하고 state를 GCS backend로 옮긴다. WIF 모듈(`ops/deploy/gcp-identity`)은 잃어버린 state를 `import` 블록으로 되살린 뒤, main의 이미지 워크플로만 신뢰하는 별도 provider와 SA를 더한다. 이미지는 GitHub Actions에서 빌드한다. 설정 파일은 비밀이 없으므로 이미지에 넣는다(마스터 플랜 §2 원칙 3).

**Tech Stack:** Terraform 1.5.7, google provider ~> 7.0, GitHub Actions(`google-github-actions/auth@v3`), Docker(CI 전용), Python 3 `unittest`, Caddy, LiteLLM 1.102.1(digest 고정).

**Spec:** `docs/20261009-shared-ai-serverless-migration-plan.md`(Phase 1, §2, §4). Phase 0 결과: `docs/qa/20261009-serverless-phase0.md`.

## 마스터 플랜과 다른 점 (실행 판단)

| ID | 판단 | 이유 | 틀렸을 때 비용 |
|---|---|---|---|
| R1 | 백업 버킷·Monitoring 알림·maintenance SA와 이미지를 Phase 3-2로 미룬다 | 운영 데이터가 생기는 Phase 3 전에는 쓸 곳이 없다. 게이트에서 중단하면 버려질 작업이다 | Phase 3가 반나절 늘어남 |
| R2 | Cloud Run 서비스·Job 골격과 그 런타임 SA(litellm·discovery·admin)는 처음 배포하는 Phase에서 만든다(스테이징은 2-1) | Terraform으로 서비스를 만들려면 이미지가 먼저 있어야 하고, SA·시크릿 IAM은 서비스와 함께 검토하는 편이 정확하다 | 없음 |
| R3 | 대상별 배포 SA는 Phase 5로 미룬다. 1-2는 import와 이미지 빌드 provider·SA만 한다 | 자동 배포는 Phase 5에서 붙는다. 그 전 배포는 승인받은 수동 `gcloud`다 | Phase 5가 반나절 늘어남 |
| R4 | Neon 리전은 지리상 가까운 aws-us-east-2로 정한다. Phase 2에서 왕복 지연을 재고 30ms를 넘으면 바꾼다 | 지연 비교용 프로젝트를 두 개 만드는 비용을 아낀다 | DB 조회마다 수 ms |
| R5 | 작업 worktree는 로컬(`commerce-automation-kit-worktrees/shared-ai-serverless`)에 두고 Phase가 끝나면 지운다 | iCloud 데몬이 I/O 대기에 묶여 git·Terraform 파일 읽기가 시간 초과된다(Phase 0 기록) | 로컬 디스크 약 0.3GB를 일시 사용 |
| R6 | (실행 중 추가) WIF는 import하지 않고 새로 만든다. 퇴역할 VM에 SSH·IAP 권한을 주는 기존 VM 배포 신원은 코드에서 지운다. 태스크 2의 `imports.tf`와 import 테스트는 쓰지 않았다 | 읽기 전용 plan과 gcloud 조회 결과 모듈이 적용된 적이 없었다(WIF pool·`cak-litellm-deploy` SA·STS API·저장소 변수 없음). 만들면 곧 퇴역할 VM에 새 권한만 생긴다 | 전환 기간에 VM용 GitOps 배포를 쓸 수 없다(원래도 동작한 적 없음) |

## Global Constraints

- 대상 GCP 프로젝트는 `replay-live-508202` 하나다. gcloud 기본 프로젝트가 회사 프로젝트(`socar-qa`)이므로 모든 `gcloud` 명령에 `--project=replay-live-508202`를 붙인다.
- Terraform 인증은 README대로 `GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token --account=guswhd1085@gmail.com)`와 `TF_VAR_project_id=replay-live-508202`만 쓴다. `GOOGLE_APPLICATION_CREDENTIALS`나 impersonation 변수는 넘기지 않는다.
- 비밀값은 출력·커밋·로그에 남기지 않는다. Terraform에는 시크릿 컨테이너만 두고 값(version)은 넣지 않는다. 참조는 숫자 버전만 쓴다(`latest` 금지).
- 다음 운영 변경은 사용자 승인 뒤에만 실행한다(태스크 6): 버킷 생성, state 이전, `terraform apply`, 저장소 변수 설정, 워크플로 실행, 시크릿 값 입력.
- 로컬에 Docker가 없다. Docker가 필요한 검증(`edge.py`, 이미지 부팅)은 CI에서만 돈다.
- 계약은 append-only다. 기존 VM 경로(`gateway.py render`, VM Caddyfile, 배포 WIF provider)의 동작을 바꾸지 않는다.
- 확실하지 않은 스펙은 `TODO(D1)`로 표기한다.

## Review Focus

1. **state 이전이 state를 잃거나 둘로 가른다.** 기대: 이전 뒤 `terraform state list`가 16개이고, plan에는 의도한 추가만 있으며 삭제·교체는 0이다. 로컬 사본은 지우고, iCloud 원본은 내용을 그대로 둔 채 이름만 바꿔 다시 쓰이지 않게 한다. 이전부터 PR 머지까지 다른 checkout에서 이 모듈의 terraform을 실행하지 않는다(main에는 아직 backend 블록이 없고 machine_type 기본값이 e2-standard-2라 두 번째 writer가 된다). → 태스크 6-2.
2. **레지스트리 정리 정책이 아직 쓰는 이미지를 지운다.** 롤백 후보 리비전은 이전 digest를 참조하므로 그 이미지가 지워지면 새 인스턴스가 뜨지 못한다. 기대: 패키지별 최근 5개 KEEP, 30일 미만 DELETE 없음, 태그 불변. → 태스크 1 `test_images_are_immutable_and_recent_ones_survive_cleanup`.
3. **WIF 확장이 다른 브랜치·워크플로에도 토큰을 준다.** 기대: 이미지 provider는 main의 `shared-ai-images.yml` 수동 실행만 받고, `repository_id`를 매핑하지 않아 배포 SA 바인딩을 쓸 수 없다. → 태스크 2 정책 테스트.
4. **렌더한 LiteLLM 설정이 비밀을 담거나 모델 별칭을 잃는다.** 기대: 자격 값은 `os.environ/` 참조뿐이고, production 별칭·모델이 VM과 같고, 구독 라우트가 없다. → 태스크 3.
5. **스테이징 edge가 관리 경로를 열거나 접두사를 잘못 뗀다.** 기대: VM과 같은 허용목록만 업스트림으로 가고, 접두사를 떼며, Host를 업스트림 값으로 바꾼다. 나머지는 404다. → 태스크 4 `edge.py` 스테이징 사례.

---

### Task 1: shared-ai-host Terraform 기반

**Files:**
- Create: `services/shared-ai-host/tests/test_policy.py`
- Modify: `services/shared-ai-host/main.tf`(terraform 블록, `machine_type`, `secret_versions` 변수, locals, `google_project_service.api`, 새 리소스 2종)
- Modify: `.github/workflows/shared-ai-host.yml`(정책 테스트 단계)
- Modify: `services/shared-ai-host/README.md`(state 위치, 머신 유형)

**Interfaces:**
- Produces: AR 저장소 `us-central1-docker.pkg.dev/replay-live-508202/shared-ai`(태스크 2·5가 사용), 시크릿 컨테이너 8개(Phase 2-1이 값을 넣음), 변수 `secret_versions: map(string)`(Phase 2-1이 사용), backend `gcs` prefix `shared-ai-host`.

- [ ] **Step 1: 실패하는 정책 테스트 작성**

```python
"""Static policy checks for the shared-ai Terraform module; runs without cloud credentials."""
import re
import unittest
from pathlib import Path

TF = (Path(__file__).resolve().parents[1] / "main.tf").read_text()


def block(header):
    """Return one block, from its header to the matching closing brace."""
    start = TF.index(header)
    depth = 0
    for end in range(TF.index("{", start), len(TF)):
        depth += {"{": 1, "}": -1}.get(TF[end], 0)
        if depth == 0:
            return TF[start:end + 1]
    raise AssertionError(f"unbalanced block: {header}")


class StatePolicy(unittest.TestCase):
    def test_state_lives_in_the_gcs_backend(self):
        backend = block('backend "gcs"')
        self.assertRegex(backend, r'bucket\s*=\s*"replay-live-508202-tfstate"')
        self.assertRegex(backend, r'prefix\s*=\s*"shared-ai-host"')


class ComputePolicy(unittest.TestCase):
    def test_machine_type_matches_the_running_vm(self):
        variable = block('variable "machine_type"')
        self.assertRegex(variable, r'default\s*=\s*"e2-small"')
        self.assertIn('contains(["e2-small", "e2-standard-2", "e2-standard-4"], var.machine_type)', variable)


class RegistryPolicy(unittest.TestCase):
    def test_registry_and_secret_apis_are_enabled(self):
        apis = block('resource "google_project_service" "api"')
        for api in ("artifactregistry.googleapis.com", "secretmanager.googleapis.com"):
            self.assertIn(f'"{api}"', apis)

    def test_images_are_immutable_and_recent_ones_survive_cleanup(self):
        repo = block('resource "google_artifact_registry_repository" "images"')
        self.assertRegex(repo, r'repository_id\s*=\s*"shared-ai"')
        self.assertRegex(repo, r'format\s*=\s*"DOCKER"')
        self.assertRegex(repo, r'immutable_tags\s*=\s*true')
        self.assertRegex(repo, r'cleanup_policy_dry_run\s*=\s*false')
        self.assertRegex(repo, r'action\s*=\s*"KEEP"\s*most_recent_versions\s*\{\s*keep_count\s*=\s*5\s*\}')
        older = re.search(r'older_than\s*=\s*"(\d+)s"', repo)
        self.assertIsNotNone(older)
        self.assertGreaterEqual(int(older.group(1)), 30 * 24 * 3600)


class SecretPolicy(unittest.TestCase):
    NAMES = ["litellm-stg-master-key", "litellm-stg-salt-key", "litellm-stg-database-url",
             "hanmadi-chat-api-key", "replay-chat-api-key", "festa-chat-api-key",
             "elevenlabs-api-key", "typesafe-api-key"]

    def test_secret_containers_are_declared_without_values(self):
        names = block("locals {")
        for name in self.NAMES:
            self.assertIn(f'"{name}"', names)
        self.assertRegex(block('resource "google_secret_manager_secret" "managed"'), r'for_each\s*=\s*local\.secrets')
        self.assertNotIn("google_secret_manager_secret_version", TF)

    def test_secret_versions_must_be_pinned_numbers(self):
        self.assertIn('can(regex("^[1-9][0-9]*$", v))', block('variable "secret_versions"'))
        self.assertNotRegex(TF, r'(?i)versions/latest|version\s*=\s*"latest"')


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 실패 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_policy.py' -v`
Expected: FAIL. `backend "gcs"`가 없어 `ValueError: substring not found`가 나고, `machine_type` 기본값이 e2-standard-2라서 실패한다.

- [ ] **Step 3: `main.tf` 수정**

terraform 블록에 backend를 추가한다.

```hcl
terraform {
  required_version = ">= 1.5.0, < 2.0.0"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 7.0" }
  }
  # Bucket bootstrapped once with gcloud (versioned, uniform access, public access prevention).
  backend "gcs" {
    bucket = "replay-live-508202-tfstate"
    prefix = "shared-ai-host"
  }
}
```

`machine_type`을 실제 VM에 맞추고 시크릿 버전 변수를 추가한다.

```hcl
variable "machine_type" {
  type    = string
  default = "e2-small"
  validation {
    condition     = contains(["e2-small", "e2-standard-2", "e2-standard-4"], var.machine_type)
    error_message = "Choose e2-small (serverless transition) or the reviewed 8-GiB/16-GiB configurations."
  }
}
variable "secret_versions" {
  description = "Secret Manager versions referenced by Cloud Run, pinned to numbers (never latest)."
  type        = map(string)
  default     = {}
  validation {
    condition     = alltrue([for v in values(var.secret_versions) : can(regex("^[1-9][0-9]*$", v))])
    error_message = "Pin Secret Manager versions to positive integers; latest is not allowed."
  }
}
```

locals에 시크릿 이름을 추가한다(기존 항목 유지).

```hcl
locals {
  region = "us-central1"
  zone   = "us-central1-a"
  name   = "shared-ai"
  caddy  = "docker.io/library/caddy@sha256:0c994536bddb66445885237f1a5dcc1916bccea922661c76b4e9fc24061f9b52"
  # Containers only; values are added out of band and referenced by numeric version.
  secrets = toset([
    "litellm-stg-master-key", "litellm-stg-salt-key", "litellm-stg-database-url",
    "hanmadi-chat-api-key", "replay-chat-api-key", "festa-chat-api-key", "elevenlabs-api-key", "typesafe-api-key",
  ])
}
```

API 목록에 두 개를 더하고(기존 4개 유지) 리소스 두 종을 추가한다.

```hcl
resource "google_project_service" "api" {
  for_each           = toset(["compute.googleapis.com", "run.googleapis.com", "iam.googleapis.com", "iap.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com"])
  service            = each.value
  disable_on_destroy = false
}
resource "google_artifact_registry_repository" "images" {
  location               = local.region
  repository_id          = "shared-ai"
  description            = "Shared AI images built from reviewed main commits"
  format                 = "DOCKER"
  cleanup_policy_dry_run = false
  docker_config {
    immutable_tags = true
  }
  # Rollback candidates reference older digests: keep the newest five per image and
  # delete only versions older than 30 days.
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s"
    }
  }
  depends_on = [google_project_service.api]
}
resource "google_secret_manager_secret" "managed" {
  for_each  = local.secrets
  secret_id = each.value
  replication {
    auto {}
  }
  depends_on = [google_project_service.api]
}
```

- [ ] **Step 4: 통과 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_policy.py' -v`
Expected: PASS 7/7.

Run: `cd services/shared-ai-host && terraform fmt -check && terraform init -backend=false -input=false -lockfile=readonly && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 5: CI와 README 반영**

`.github/workflows/shared-ai-host.yml`의 `bash -n` 단계 앞에 추가한다.

```yaml
      - run: python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_*.py' -v
```

README의 state 문장(18행)을 다음으로 바꾼다: "Terraform state는 GCS `gs://replay-live-508202-tfstate/shared-ai-host`(객체 버전 관리)에 있다. `terraform init -input=false`로 초기화한다. 저장소 이전 전 위치의 로컬 state는 이전 직후 보관용으로만 남긴다(쓰지 않음)." 비용 문단(33행)에는 "2026-10-09부터 e2-small(e2-standard-2 단가의 1/4, VM 약 $12.2 + 디스크 약 $8 + IPv4 약 $3.65 ≈ $23.9/월, 단가 `TODO(D1)`)"를 덧붙인다.

- [ ] **Step 6: 커밋**

```bash
git add services/shared-ai-host/main.tf services/shared-ai-host/tests/test_policy.py services/shared-ai-host/README.md .github/workflows/shared-ai-host.yml
git commit -m "feat(shared-ai): add GCS state backend, registry and secret containers"
```

### Task 2: WIF import와 이미지 빌드 신원

> **실행 중 변경(R6):** 모듈이 적용된 적이 없어 아래 Step 3의 `imports.tf`는 만들지 않았다. 대신 VM 배포 신원(배포 provider·SA·OS Login·IAP)을 코드에서 지우고, import 테스트를 `test_token_exchange_apis_are_enabled`·`test_no_vm_deploy_identity_is_created`로 바꿨다. 읽기 전용 plan 결과는 `7 to add, 0 to change, 0 to destroy`다.

**Files:**
- Create: `ops/deploy/gcp-identity/imports.tf`
- Create: `ops/deploy/test_identity_policy.py`
- Modify: `ops/deploy/gcp-identity/main.tf`(backend, 이미지 provider·SA·바인딩, outputs)

**Interfaces:**
- Consumes: 태스크 1의 AR 저장소 `shared-ai`(us-central1).
- Produces: 출력 `images_provider_variable`, `images_service_account_variable` → 저장소 변수 `GCP_IMAGES_WIF_PROVIDER`, `GCP_IMAGES_SERVICE_ACCOUNT`(태스크 5·6이 사용).

- [ ] **Step 1: 실패하는 정책 테스트 작성**

```python
"""Static checks for the deployment identity Terraform root module."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "gcp-identity"
MAIN = (ROOT / "main.tf").read_text()
IMPORTS_FILE = ROOT / "imports.tf"
WORKFLOW = "hhj4861/commerce-automation-kit/.github/workflows/shared-ai-images.yml@refs/heads/main"
SA = "cak-litellm-deploy@replay-live-508202.iam.gserviceaccount.com"


def block(text, header):
    start = text.index(header)
    depth = 0
    for end in range(text.index("{", start), len(text)):
        depth += {"{": 1, "}": -1}.get(text[end], 0)
        if depth == 0:
            return text[start:end + 1]
    raise AssertionError(f"unbalanced block: {header}")


class IdentityPolicy(unittest.TestCase):
    def test_state_lives_in_the_gcs_backend(self):
        backend = block(MAIN, 'backend "gcs"')
        self.assertRegex(backend, r'bucket\s*=\s*"replay-live-508202-tfstate"')
        self.assertRegex(backend, r'prefix\s*=\s*"gcp-identity"')

    def test_image_provider_trusts_only_the_reviewed_workflow_on_main(self):
        provider = block(MAIN, 'resource "google_iam_workload_identity_pool_provider" "images"')
        for clause in ("assertion.repository_id == '1310729493'", "assertion.repository_owner_id == '71001056'",
                       "assertion.repository == 'hhj4861/commerce-automation-kit'", "assertion.ref == 'refs/heads/main'",
                       f"assertion.workflow_ref == '{WORKFLOW}'", "assertion.runner_environment == 'github-hosted'",
                       "assertion.event_name == 'workflow_dispatch'"):
            self.assertIn(clause, provider)
        # Without repository_id, image tokens cannot match the deploy SA's principalSet binding.
        self.assertNotIn("attribute.repository_id", provider)

    def test_image_builder_can_only_write_the_shared_ai_repository(self):
        binding = block(MAIN, 'resource "google_service_account_iam_member" "images_federation"')
        self.assertIn("/subject/repo:hhj4861/commerce-automation-kit:ref:refs/heads/main", binding)
        writer = block(MAIN, 'resource "google_artifact_registry_repository_iam_member" "images_writer"')
        self.assertRegex(writer, r'repository\s*=\s*"shared-ai"')
        self.assertRegex(writer, r'role\s*=\s*"roles/artifactregistry\.writer"')
        self.assertNotRegex(MAIN, r'resource "google_project_iam_member" "images')

    def test_deploy_provider_still_trusts_only_deploy_litellm(self):
        provider = block(MAIN, 'resource "google_iam_workload_identity_pool_provider" "github"')
        self.assertIn("assertion.ref == 'refs/heads/deploy/litellm'", provider)

    @unittest.skipUnless(IMPORTS_FILE.exists(), "imports applied and removed")
    def test_every_pre_existing_resource_is_imported_once(self):
        imports = IMPORTS_FILE.read_text()
        self.assertEqual(sorted(re.findall(r'to\s*=\s*(\S+)', imports)), sorted([
            'google_project_service.identity["iamcredentials.googleapis.com"]',
            'google_project_service.identity["sts.googleapis.com"]',
            'google_project_service.identity["oslogin.googleapis.com"]',
            "google_iam_workload_identity_pool.github", "google_iam_workload_identity_pool_provider.github",
            "google_service_account.deploy", "google_service_account_iam_member.federation",
            "google_project_iam_member.instance_lookup", "google_compute_instance_iam_member.ssh",
            "google_project_iam_member.iap"]))
        self.assertIn(f"replay-live-508202 roles/iap.tunnelResourceAccessor serviceAccount:{SA} shared-ai-ssh-only", imports)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 실패 확인**

Run: `python3 -m unittest discover -s ops/deploy -p 'test_identity_policy.py' -v`
Expected: FAIL. `backend "gcs"`와 `"images"` provider가 없어 `ValueError: substring not found`가 난다. import 테스트는 파일이 없어 skip된다.

- [ ] **Step 3: `imports.tf` 작성**

```hcl
# One-time re-registration of resources applied before this module kept state in GCS.
# Delete this file in the commit after the import apply succeeds.
import {
  to = google_project_service.identity["iamcredentials.googleapis.com"]
  id = "replay-live-508202/iamcredentials.googleapis.com"
}
import {
  to = google_project_service.identity["sts.googleapis.com"]
  id = "replay-live-508202/sts.googleapis.com"
}
import {
  to = google_project_service.identity["oslogin.googleapis.com"]
  id = "replay-live-508202/oslogin.googleapis.com"
}
import {
  to = google_iam_workload_identity_pool.github
  id = "projects/replay-live-508202/locations/global/workloadIdentityPools/cak-deploy"
}
import {
  to = google_iam_workload_identity_pool_provider.github
  id = "projects/replay-live-508202/locations/global/workloadIdentityPools/cak-deploy/providers/github"
}
import {
  to = google_service_account.deploy
  id = "projects/replay-live-508202/serviceAccounts/cak-litellm-deploy@replay-live-508202.iam.gserviceaccount.com"
}
import {
  to = google_service_account_iam_member.federation
  id = "projects/replay-live-508202/serviceAccounts/cak-litellm-deploy@replay-live-508202.iam.gserviceaccount.com roles/iam.workloadIdentityUser principalSet://iam.googleapis.com/projects/581413260951/locations/global/workloadIdentityPools/cak-deploy/attribute.repository_id/1310729493"
}
import {
  to = google_project_iam_member.instance_lookup
  id = "replay-live-508202 roles/compute.viewer serviceAccount:cak-litellm-deploy@replay-live-508202.iam.gserviceaccount.com"
}
import {
  to = google_compute_instance_iam_member.ssh
  id = "projects/replay-live-508202/zones/us-central1-a/instances/shared-ai roles/compute.osAdminLogin serviceAccount:cak-litellm-deploy@replay-live-508202.iam.gserviceaccount.com"
}
import {
  to = google_project_iam_member.iap
  id = "replay-live-508202 roles/iap.tunnelResourceAccessor serviceAccount:cak-litellm-deploy@replay-live-508202.iam.gserviceaccount.com shared-ai-ssh-only"
}
```

- [ ] **Step 4: `main.tf`에 backend와 이미지 신원 추가**

terraform 블록에 backend를 추가한다.

```hcl
  backend "gcs" {
    bucket = "replay-live-508202-tfstate"
    prefix = "gcp-identity"
  }
```

파일 끝(outputs 앞)에 추가한다.

```hcl
# Image builds: a separate provider trusts only the reviewed image workflow, manually
# dispatched on main. repository_id is deliberately not mapped, so these tokens can
# never satisfy the deploy SA's principalSet binding.
resource "google_iam_workload_identity_pool_provider" "images" {
  project                            = data.google_project.personal.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-images"
  attribute_mapping = {
    "google.subject" = "assertion.sub"
  }
  attribute_condition = "assertion.repository_id == '1310729493' && assertion.repository_owner_id == '71001056' && assertion.repository == 'hhj4861/commerce-automation-kit' && assertion.ref == 'refs/heads/main' && assertion.workflow_ref == 'hhj4861/commerce-automation-kit/.github/workflows/shared-ai-images.yml@refs/heads/main' && assertion.runner_environment == 'github-hosted' && assertion.event_name == 'workflow_dispatch'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
}
resource "google_service_account" "images" {
  project      = data.google_project.personal.project_id
  account_id   = "cak-shared-ai-images"
  display_name = "Shared AI image builds from main"
}
resource "google_service_account_iam_member" "images_federation" {
  service_account_id = google_service_account.images.name
  role               = "roles/iam.workloadIdentityUser"
  # GitHub's default subject for a job without an environment.
  member = "principal://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/subject/repo:hhj4861/commerce-automation-kit:ref:refs/heads/main"
}
resource "google_artifact_registry_repository_iam_member" "images_writer" {
  project    = data.google_project.personal.project_id
  location   = "us-central1"
  repository = "shared-ai"
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.images.email}"
}
output "images_provider_variable" { value = google_iam_workload_identity_pool_provider.images.name }
output "images_service_account_variable" { value = google_service_account.images.email }
```

- [ ] **Step 5: 통과 확인**

Run: `python3 -m unittest discover -s ops/deploy -p 'test_identity_policy.py' -v`
Expected: PASS 5/5.

Run: `cd ops/deploy/gcp-identity && terraform fmt -check && terraform init -backend=false -input=false -lockfile=readonly && terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 6: 커밋**

```bash
git add ops/deploy/gcp-identity/main.tf ops/deploy/gcp-identity/imports.tf ops/deploy/test_identity_policy.py
git commit -m "feat(deploy): re-import WIF state and add a main-only image builder identity"
```

### Task 3: LiteLLM Cloud Run 설정과 이미지

**Files:**
- Create: `services/ai-gateway/cloudrun/settings.json`, `services/ai-gateway/cloudrun/staging.json`, `services/ai-gateway/cloudrun/production.json`, `services/ai-gateway/cloudrun/Dockerfile`
- Create: `services/ai-gateway/test_cloudrun.py`
- Modify: `services/ai-gateway/gateway.py`(모델 목록 함수 분리, `render_cloudrun`, `cloudrun_text`, CLI `render-cloudrun`)
- Modify: `.github/workflows/ai-gateway.yml`(이미지 부팅 job)

**Interfaces:**
- Produces: `gateway.model_list(env: dict) -> list[dict]`, `gateway.config_for(models: list) -> dict`, `gateway.render_cloudrun(settings: dict, target: str) -> dict`, `gateway.cloudrun_text(settings: dict, target: str) -> str`. 이미지 빌드 인자 `TARGET=staging|production`(태스크 5가 사용).

- [ ] **Step 1: 설정 파일과 실패하는 테스트 작성**

`services/ai-gateway/cloudrun/settings.json`(VM의 렌더 결과에서 옮긴 비밀 아닌 값, 2026-10-09):

```json
{
  "models": {
    "hanmadi": "gemini/gemini-flash-lite-latest",
    "replay": "gemini/gemini-flash-lite-latest",
    "festa": "gemini/gemini-3.5-flash-lite"
  },
  "targets": {
    "staging": {"apps": ["hanmadi"], "elevenlabs": true},
    "production": {"apps": ["hanmadi", "replay", "festa"], "elevenlabs": true}
  }
}
```

`services/ai-gateway/test_cloudrun.py`:

```python
"""Cloud Run LiteLLM config and image checks (no network, no Docker)."""
import json
import re
import sys
import unittest
from pathlib import Path
from unittest import mock

import gateway

ROOT = Path(__file__).resolve().parent
CLOUDRUN = ROOT / "cloudrun"
SETTINGS = json.loads((CLOUDRUN / "settings.json").read_text())


def leaves(value, path=""):
    if isinstance(value, dict):
        for key, item in value.items():
            yield from leaves(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from leaves(item, f"{path}[{index}]")
    elif isinstance(value, str):
        yield path, value


class CloudRunConfigTest(unittest.TestCase):
    def test_credentials_are_env_references_only(self):
        for target in SETTINGS["targets"]:
            for path, value in leaves(gateway.render_cloudrun(SETTINGS, target)):
                if path.endswith((".api_key", ".api_base", ".master_key")):
                    self.assertTrue(value.startswith("os.environ/"), (target, path))
                self.assertNotRegex(value, r"sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}", (target, path))

    def test_production_matches_the_vm_model_routes(self):
        config = gateway.render_cloudrun(SETTINGS, "production")
        self.assertEqual([(m["model_name"], m["litellm_params"]["model"]) for m in config["model_list"]], [
            ("hanmadi-chat", "gemini/gemini-flash-lite-latest"),
            ("replay-video-planner", "gemini/gemini-flash-lite-latest"),
            ("festa-travel", "gemini/gemini-3.5-flash-lite"),
            ("hanmadi-stt", "elevenlabs/scribe_v1"),
            ("hanmadi-tts", "elevenlabs/eleven_v3"),
        ])
        self.assertEqual(config["general_settings"], {"master_key": "os.environ/LITELLM_MASTER_KEY", "store_prompts_in_spend_logs": False})
        self.assertEqual(config["litellm_settings"], {"set_verbose": False, "turn_off_message_logging": True, "num_retries": 0, "request_timeout": 30})

    def test_staging_serves_only_the_poc_models(self):
        config = gateway.render_cloudrun(SETTINGS, "staging")
        self.assertEqual([m["model_name"] for m in config["model_list"]], ["hanmadi-chat", "hanmadi-stt", "hanmadi-tts"])

    def test_subscription_routes_are_never_added(self):
        fake = mock.Mock(routes=lambda root: [{"model_name": "codex-x", "litellm_params": {"model": "x"}}])
        with mock.patch.dict(sys.modules, {"subscriptions": fake}):
            config = gateway.render_cloudrun(SETTINGS, "production")
        self.assertNotIn("codex-x", [m["model_name"] for m in config["model_list"]])

    def test_committed_configs_are_current(self):
        for target in SETTINGS["targets"]:
            self.assertEqual((CLOUDRUN / f"{target}.json").read_text(), gateway.cloudrun_text(SETTINGS, target), target)

    def test_unknown_target_is_rejected(self):
        with self.assertRaises(ValueError):
            gateway.render_cloudrun(SETTINGS, "dev")


class CloudRunImageTest(unittest.TestCase):
    DOCKERFILE = (CLOUDRUN / "Dockerfile").read_text()

    def test_image_uses_the_vm_litellm_digest(self):
        digest = re.search(r"ghcr\.io/berriai/litellm@sha256:[0-9a-f]{64}", (ROOT / "compose.yaml").read_text()).group(0)
        self.assertIn(f"FROM {digest}", self.DOCKERFILE)

    def test_config_stays_outside_the_app_directory_and_listens_on_8080(self):
        self.assertIn("COPY ${TARGET}.json /etc/litellm/config.json", self.DOCKERFILE)
        self.assertNotRegex(self.DOCKERFILE, r"(?m)^COPY .* /app")
        self.assertIn('CMD ["--config", "/etc/litellm/config.json", "--host", "0.0.0.0", "--port", "8080"]', self.DOCKERFILE)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 실패 확인**

Run: `cd services/ai-gateway && python3 -m unittest test_cloudrun -v`
Expected: FAIL. `AttributeError: module 'gateway' has no attribute 'render_cloudrun'`, 그리고 Dockerfile이 없어 `FileNotFoundError`가 난다.

- [ ] **Step 3: `gateway.py` 리팩터링과 추가**

`render()`의 모델 목록 조립과 설정 조립을 두 함수로 빼고, `render()`는 그 함수를 호출하게 한다(동작 불변). 기존 `models = []`부터 ElevenLabs 블록까지를 `model_list(env)`로 옮긴다.

```python
def model_list(env):
    models = []
    for app, alias in (("HANMADI", "hanmadi-chat"), ("REPLAY", "replay-video-planner"), ("FESTA", "festa-travel")):
        # (기존 render()의 앱별 루프 본문을 그대로 옮긴다)
        ...
    if env.get("ELEVENLABS_API_KEY"):
        # (기존 ElevenLabs 블록을 그대로 옮긴다)
        ...
    return models


def config_for(models):
    return {"model_list": models,
            "general_settings": {"master_key": "os.environ/LITELLM_MASTER_KEY", "store_prompts_in_spend_logs": False},
            "litellm_settings": {"set_verbose": False, "turn_off_message_logging": True,
                                 "num_retries": 0, "request_timeout": 30}}


def render(root=ROOT):
    env = read_env(root / ".env")
    # (기존 인프라 비밀값 검사 두 개는 그대로 둔다)
    models = model_list(env)
    from subscriptions import routes
    models.extend(routes(root))
    private_write(root / ".runtime/litellm.json", json.dumps(config_for(models), indent=2) + "\n")
    return [m["model_name"] for m in models]


def render_cloudrun(settings, target):
    """Cloud Run config from committed, non-secret settings. Credentials stay env references
    resolved on the service; subscription routes (retired, D5) are never added."""
    if target not in settings["targets"]:
        raise ValueError(f"Unknown Cloud Run target: {target}")
    spec = settings["targets"][target]
    env = {}
    for app in spec["apps"]:
        env[f"{app.upper()}_CHAT_MODEL"] = settings["models"][app]
        env[f"{app.upper()}_CHAT_API_KEY"] = "set-on-service"  # presence marker; never rendered
    if spec.get("elevenlabs"):
        env["ELEVENLABS_API_KEY"] = "set-on-service"
    return config_for(model_list(env))


def cloudrun_text(settings, target):
    return json.dumps(render_cloudrun(settings, target), indent=2) + "\n"
```

`main()`에 서브커맨드를 추가한다.

```python
    sub.add_parser("render-cloudrun")
```

```python
        elif args.command == "render-cloudrun":
            settings = json.loads((ROOT / "cloudrun/settings.json").read_text())
            for target in settings["targets"]:
                (ROOT / f"cloudrun/{target}.json").write_text(cloudrun_text(settings, target))
            print("Rendered Cloud Run configs: " + ", ".join(settings["targets"]))
```

`services/ai-gateway/cloudrun/Dockerfile`:

```dockerfile
# LiteLLM for Cloud Run: the VM's reviewed digest plus a committed, secret-free config.
# Build with --build-arg TARGET=staging|production. The config stays outside /app (the
# image WORKDIR holding the entrypoint and Prisma schema).
FROM ghcr.io/berriai/litellm@sha256:87f34979b9f8cb274fac90ca8a4fdda07d8480de22755562a26adeb95ce20d02
ARG TARGET
COPY ${TARGET}.json /etc/litellm/config.json
CMD ["--config", "/etc/litellm/config.json", "--host", "0.0.0.0", "--port", "8080"]
```

설정 파일을 렌더한다: `cd services/ai-gateway && python3 gateway.py render-cloudrun`

- [ ] **Step 4: 통과 확인**

Run: `cd services/ai-gateway && python3 -m unittest test_cloudrun test_gateway -v`
Expected: PASS(새 테스트 8개와 기존 `test_gateway` 전부).

- [ ] **Step 5: CI 이미지 부팅 job 추가**

`.github/workflows/ai-gateway.yml`의 `jobs:` 아래에 추가한다.

```yaml
  cloudrun-image:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - name: Boot the Cloud Run image with the committed staging config
        run: |
          set -euo pipefail
          docker build --build-arg TARGET=staging -t cak-litellm-cloudrun services/ai-gateway/cloudrun
          docker run -d --name litellm -p 8080:8080 -e LITELLM_MASTER_KEY=sk-ci-only-placeholder-0000 \
            -e HANMADI_CHAT_API_KEY=ci-placeholder -e ELEVENLABS_API_KEY=ci-placeholder \
            -e STORE_MODEL_IN_DB=False -e LITELLM_TELEMETRY=False cak-litellm-cloudrun
          for i in $(seq 1 60); do curl -fsS localhost:8080/health/liveliness >/dev/null && break; sleep 3; done
          curl -fsS -H "Authorization: Bearer sk-ci-only-placeholder-0000" localhost:8080/v1/models \
            | python3 -c "import json,sys; ids=sorted(m['id'] for m in json.load(sys.stdin)['data']); assert ids == ['hanmadi-chat','hanmadi-stt','hanmadi-tts'], ids; print(ids)"
      - if: failure()
        run: docker logs litellm 2>&1 | tail -80
```

- [ ] **Step 6: 커밋**

```bash
git add services/ai-gateway/gateway.py services/ai-gateway/test_cloudrun.py services/ai-gateway/cloudrun .github/workflows/ai-gateway.yml
git commit -m "feat(ai-gateway): render a secret-free Cloud Run LiteLLM config and image"
```

### Task 4: 스테이징 edge 라우팅과 이미지

**Files:**
- Create: `services/shared-ai-host/edge/Caddyfile.staging`, `services/shared-ai-host/edge/Dockerfile`
- Create: `services/shared-ai-host/tests/test_edge_config.py`
- Modify: `services/shared-ai-host/tests/edge.py`(업스트림 Host 응답 헤더, 스테이징 Caddy 사례)

**Interfaces:**
- Produces: 이미지 빌드 인자 `VARIANT=staging`(태스크 5가 사용). 런타임 env `PORT`(Cloud Run이 설정), `LLM_UPSTREAM`(Phase 2-1이 스테이징 litellm의 https URL로 설정).

- [ ] **Step 1: 실패하는 정적 테스트 작성**

```python
"""Static checks for baked edge routing files; the live routing test is edge.py (CI, Docker)."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VM = (ROOT / "Caddyfile").read_text()
STAGING = (ROOT / "edge" / "Caddyfile.staging").read_text()


def matcher_paths(text, name):
    return re.search(rf"@{name} path ([^\n]+)", text).group(1).split()


class EdgeConfigTest(unittest.TestCase):
    def test_staging_llm_allowlist_equals_the_vm_allowlist(self):
        self.assertEqual(matcher_paths(STAGING, "llm"), matcher_paths(VM, "llm"))
        for path in ("path /llm/v1beta/models/hanmadi-chat:generateContent", "path /llm/typesafe/v1/systemone"):
            self.assertIn(path, STAGING)
            self.assertIn(path, VM)

    def test_every_upstream_is_the_service_url_with_its_own_host(self):
        upstreams = re.findall(r"reverse_proxy (\S+)", STAGING)
        self.assertEqual(set(upstreams), {"{$LLM_UPSTREAM}"})
        self.assertEqual(STAGING.count("header_up Host {upstream_hostport}"), len(upstreams))

    def test_listens_on_the_cloud_run_port(self):
        self.assertIn(":{$PORT:8080} {", STAGING)

    def test_staging_exposes_no_other_service(self):
        for absent in ("/discovery", "/accounts", "/v1/chat-messages", "/v1/workflows/run"):
            self.assertNotIn(absent, STAGING)

    def test_image_uses_the_reviewed_caddy_digest(self):
        digest = re.search(r"caddy@sha256:[0-9a-f]{64}", (ROOT / "main.tf").read_text()).group(0)
        dockerfile = (ROOT / "edge" / "Dockerfile").read_text()
        self.assertIn(f"FROM docker.io/library/{digest}", dockerfile)
        self.assertIn("COPY Caddyfile.${VARIANT} /etc/caddy/Caddyfile", dockerfile)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 실패 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_edge_config.py' -v`
Expected: FAIL(ERROR). `Caddyfile.staging`이 없어 모듈 로드에서 `FileNotFoundError`가 난다.

- [ ] **Step 3: 라우팅 파일과 Dockerfile 작성**

`services/shared-ai-host/edge/Caddyfile.staging`:

```
{
    admin off
    auto_https off
}
# Phase 2 staging edge: only the LiteLLM allowlist, proxied to an internal Cloud Run
# service. LLM_UPSTREAM is that service's https run.app URL; Cloud Run sets PORT.
:{$PORT:8080} {
    @llm path /llm/v1/models /llm/v1/chat/completions /llm/v1/responses /llm/v1/embeddings /llm/v1/audio/speech /llm/v1/audio/transcriptions
    handle @llm {
        uri strip_prefix /llm
        reverse_proxy {$LLM_UPSTREAM} {
            header_up Host {upstream_hostport}
            flush_interval -1
        }
    }
    @hanmadiVideo {
        method POST
        path /llm/v1beta/models/hanmadi-chat:generateContent
    }
    handle @hanmadiVideo {
        uri strip_prefix /llm
        reverse_proxy {$LLM_UPSTREAM} {
            header_up Host {upstream_hostport}
        }
    }
    @jev {
        method POST
        path /llm/typesafe/v1/systemone
    }
    handle @jev {
        uri strip_prefix /llm
        reverse_proxy {$LLM_UPSTREAM} {
            header_up Host {upstream_hostport}
        }
    }
    handle /health {
        respond "edge alive" 200
    }
    handle {
        respond "Not found" 404
    }
}
```

`services/shared-ai-host/edge/Dockerfile`:

```dockerfile
# Cloud Run edge: the reviewed Caddy digest with its routing file baked in, so a revision
# rollback also restores routes. Build with --build-arg VARIANT=staging.
FROM docker.io/library/caddy@sha256:0c994536bddb66445885237f1a5dcc1916bccea922661c76b4e9fc24061f9b52
ARG VARIANT
COPY Caddyfile.${VARIANT} /etc/caddy/Caddyfile
```

- [ ] **Step 4: 통과 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_edge_config.py' -v`
Expected: PASS 5/5.

- [ ] **Step 5: `edge.py`에 실제 Caddy 스테이징 사례 추가(CI에서 실행)**

`Upstream.do_POST`의 두 응답(401·200)에 받은 Host를 돌려주는 헤더를 추가한다. 기존 본문 비교는 바뀌지 않는다.

```python
            self.send_response(401)
            self.send_header("X-Echo-Host", self.headers.get("Host", ""))
            self.end_headers()
```

```python
        self.send_response(200)
        self.send_header("X-Echo-Host", self.headers.get("Host", ""))
        self.send_header("Content-Type", "application/json")
```

`request()`가 응답 헤더도 돌려주도록 별도 함수를 추가한다.

```python
def request_with_headers(port, path, key=None, method="POST", body=None):
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(f"http://127.0.0.1:{port}" + path, data=json.dumps(body if body is not None else {}).encode(), headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as res:
            return res.status, res.read(), res.headers
    except urllib.error.HTTPError as error:
        return error.code, error.read(), error.headers
```

Caddy 기동 목록에 스테이징 파일을 8082로 추가한다.

```python
    staging = ROOT / "edge" / "Caddyfile.staging"
    processes.append(subprocess.Popen(["docker", "run", "--rm", "--network=host", "-e", "PORT=8082", "-e", "LLM_UPSTREAM=http://127.0.0.1:4100", "-v", f"{staging}:/etc/caddy/Caddyfile:ro", IMAGE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
```

준비 대기 루프의 포트 목록을 `(8080, 8081, 8082)`로 바꾸고, 최종 `print` 앞에 검증을 추가한다.

```python
    for path in ("/llm/v1/models", "/llm/v1/chat/completions", "/llm/v1/audio/transcriptions",
                 "/llm/typesafe/v1/systemone", "/llm/v1beta/models/hanmadi-chat:generateContent"):
        assert request(8082, path)[0] == 401, path
        code, body, headers = request_with_headers(8082, path, KEY)
        assert code == 200 and json.loads(body)["path"] == path.removeprefix("/llm"), path
        assert headers["X-Echo-Host"] == "127.0.0.1:4100", (path, headers["X-Echo-Host"])
    for path in ("/discovery/v1/discover", "/accounts/connections", "/v1/chat-messages", "/llm/key/generate",
                 "/key/generate", "/llm/health/readiness", "/llm/v1/files"):
        assert request(8082, path, KEY)[0] == 404, path
    assert request(8082, "/llm/typesafe/v1/systemone", KEY, "GET")[0] == 404
    assert request(8082, "/health") == (200, b"edge alive")
```

- [ ] **Step 6: 커밋**

```bash
git add services/shared-ai-host/edge services/shared-ai-host/tests/test_edge_config.py services/shared-ai-host/tests/edge.py
git commit -m "feat(shared-ai): add a baked staging edge for the Cloud Run PoC"
```

### Task 5: 이미지 빌드 워크플로

**Files:**
- Create: `.github/workflows/shared-ai-images.yml`
- Create: `services/shared-ai-host/tests/test_images_workflow.py`
- Modify: `.github/workflows/shared-ai-host.yml`(paths에 새 워크플로 추가)

**Interfaces:**
- Consumes: 태스크 2의 저장소 변수 `GCP_IMAGES_WIF_PROVIDER`·`GCP_IMAGES_SERVICE_ACCOUNT`, 태스크 3 `TARGET`, 태스크 4 `VARIANT`.
- Produces: `us-central1-docker.pkg.dev/replay-live-508202/shared-ai/<image>:<commit sha>`와 실행 요약의 digest(Phase 2-1이 사용).

- [ ] **Step 1: 실패하는 테스트 작성**

```python
"""Security properties of the image build workflow (stdlib has no YAML parser; text checks)."""
import re
import unittest
from pathlib import Path

WORKFLOW = Path(__file__).resolve().parents[3] / ".github/workflows/shared-ai-images.yml"
WF = WORKFLOW.read_text()


class ImagesWorkflowTest(unittest.TestCase):
    def test_runs_only_by_manual_dispatch_on_main(self):
        self.assertRegex(WF, r"(?m)^on:\n  workflow_dispatch:")
        self.assertNotRegex(WF, r"(?m)^  (push|pull_request|pull_request_target|schedule|workflow_run):")
        self.assertIn("if: github.ref == 'refs/heads/main'", WF)

    def test_token_permissions_are_minimal(self):
        self.assertRegex(WF, r"(?m)^permissions:\n  contents: read\n  id-token: write\n(?!  )")

    def test_images_are_a_closed_list_pushed_by_commit(self):
        options = re.search(r"options: \[([^\]]+)\]", WF).group(1).split(", ")
        self.assertEqual(options, ["litellm-staging", "litellm-production", "edge-staging"])
        self.assertIn("REGISTRY: us-central1-docker.pkg.dev/replay-live-508202/shared-ai", WF)
        self.assertIn('ref="$REGISTRY/$IMAGE:$SHA"', WF)

    def test_inputs_reach_the_shell_only_through_env(self):
        bodies = re.findall(r"run: \|\n((?: {10}.*\n)+)", WF)
        self.assertTrue(bodies)
        for body in bodies:
            self.assertNotIn("${{", body)

    def test_no_repository_secrets_are_used(self):
        self.assertNotIn("secrets.", WF)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 실패 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_images_workflow.py' -v`
Expected: FAIL(ERROR). 워크플로 파일이 없어 `FileNotFoundError`가 난다.

- [ ] **Step 3: 워크플로 작성**

```yaml
name: Shared AI images
on:
  workflow_dispatch:
    inputs:
      image:
        description: Image to build from this main commit
        type: choice
        options: [litellm-staging, litellm-production, edge-staging]
permissions:
  contents: read
  id-token: write
concurrency:
  group: shared-ai-images-${{ inputs.image }}
  cancel-in-progress: false
jobs:
  build:
    # WIF trusts only this workflow dispatched on main; the guard fails fast elsewhere.
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    env:
      REGISTRY: us-central1-docker.pkg.dev/replay-live-508202/shared-ai
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - name: Check image builder identity configuration
        env:
          PROVIDER: ${{ vars.GCP_IMAGES_WIF_PROVIDER }}
          ACCOUNT: ${{ vars.GCP_IMAGES_SERVICE_ACCOUNT }}
        run: |
          test -n "$PROVIDER" && test -n "$ACCOUNT"
      - uses: google-github-actions/auth@v3
        with:
          workload_identity_provider: ${{ vars.GCP_IMAGES_WIF_PROVIDER }}
          service_account: ${{ vars.GCP_IMAGES_SERVICE_ACCOUNT }}
      - uses: google-github-actions/setup-gcloud@v3
      - name: Build and push ${{ inputs.image }}
        env:
          IMAGE: ${{ inputs.image }}
          SHA: ${{ github.sha }}
        run: |
          set -euo pipefail
          case "$IMAGE" in
            litellm-staging) context=services/ai-gateway/cloudrun; arg="TARGET=staging" ;;
            litellm-production) context=services/ai-gateway/cloudrun; arg="TARGET=production" ;;
            edge-staging) context=services/shared-ai-host/edge; arg="VARIANT=staging" ;;
            *) echo "Unknown image" >&2; exit 1 ;;
          esac
          gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
          ref="$REGISTRY/$IMAGE:$SHA"
          docker build --build-arg "$arg" -t "$ref" "$context"
          docker push "$ref"
          digest=$(docker inspect --format '{{index .RepoDigests 0}}' "$ref")
          echo "$IMAGE from $SHA: \`$digest\`" >> "$GITHUB_STEP_SUMMARY"
```

`.github/workflows/shared-ai-host.yml`의 `pull_request`·`push` paths 두 곳에 `".github/workflows/shared-ai-images.yml"`을 추가한다.

- [ ] **Step 4: 통과 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_images_workflow.py' -v`
Expected: PASS 5/5.

- [ ] **Step 5: 커밋**

```bash
git add .github/workflows/shared-ai-images.yml .github/workflows/shared-ai-host.yml services/shared-ai-host/tests/test_images_workflow.py
git commit -m "feat(shared-ai): add a main-only image build workflow"
```

### Task 6: 운영 반영 (사용자 승인 필요)

코드 태스크(1~5)와 PR CI가 통과한 뒤, 아래를 묶어 승인받아 순서대로 실행한다. 각 단계의 출력은 `docs/qa/20261009-serverless-phase1.md`에 기록한다(비밀값 제외).

- [x] **6-1 state 버킷 생성(승인).**

```bash
gcloud storage buckets create gs://replay-live-508202-tfstate --project=replay-live-508202 --location=us-central1 --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update gs://replay-live-508202-tfstate --project=replay-live-508202 --versioning
```

Expected: 버킷 생성, `versioning_enabled: true`.

- [x] **6-2 shared-ai-host state 이전과 plan(승인).** 로컬 0600 사본을 모듈 디렉터리의 `terraform.tfstate`로 둔다(`.gitignore`가 `*.tfstate*` 제외). `terraform init -input=false -force-copy`로 GCS에 복사하고, `terraform state list | wc -l`이 16인지 확인한다. 로컬 `terraform.tfstate*`와 스크래치패드 사본을 지운다. `terraform plan`의 기대값은 `11 to add, 0 to change, 0 to destroy`(API 2, AR 1, 시크릿 8)다. machine_type 변경이 없어야 한다. 이전 직후 iCloud 원본 `data/shared-ai/terraform.tfstate`의 이름을 `terraform.tfstate.migrated-20261009`로 바꾼다(내용은 그대로). 이 시점부터 PR 머지까지 다른 checkout에서 이 모듈의 terraform을 실행하지 않는다.
- [x] **6-3 shared-ai-host apply(승인).** 6-2의 plan을 저장한 파일로 apply한다. 6-4·6-5까지 마치면 PR 머지를 요청한다.
- [x] **6-4 WIF 이미지 신원 apply(승인).** 6-3(Artifact Registry 생성) 뒤에 한다. `terraform init -input=false`(빈 GCS prefix) 뒤 plan의 기대값은 `7 to add, 0 to change, 0 to destroy`다(R6, 사전 읽기 전용 plan과 같음). 다른 값이 보이면 멈추고 원인을 기록한다.
- [x] **6-5 저장소 변수 설정(승인).** `gh variable set GCP_IMAGES_WIF_PROVIDER --body "<output>"`, `gh variable set GCP_IMAGES_SERVICE_ACCOUNT --body "<output>"`. 둘 다 비밀이 아니다(기존 `GCP_DEPLOY_*`와 같은 성격).
- [ ] **6-6 머지 뒤 이미지 빌드(사용자 머지 + 승인).** PR이 main에 들어간 뒤 `gh workflow run shared-ai-images.yml -f image=litellm-staging`과 `-f image=edge-staging`을 실행한다. 실행 요약의 digest를 기록한다. 첫 실행에서 토큰 교환이 실패하면 GitHub OIDC `sub` 형식(`repo:hhj4861/commerce-automation-kit:ref:refs/heads/main`)을 확인한다(`TODO(D1)`).
- [ ] **6-6b (선택, 승인) 다른 브랜치 토큰 거부 실측.** 마스터 플랜 1-2의 검증 항목이다. job의 `if:`를 뺀 임시 브랜치 사본을 dispatch해 STS가 토큰을 거부하는지 기록하고, 임시 브랜치를 지운다. 하지 않으면 정적 정책 테스트(provider 조건의 ref·workflow_ref 고정)가 이 검증을 대신한다.
- [ ] **6-7 Neon 스테이징(사용자).** Neon 가입 → 프로젝트 `shared-ai-stg`(aws-us-east-2, PostgreSQL 16) 생성 → direct(비풀러) 연결 문자열에 `sslmode=require&connect_timeout=15`를 붙여 Secret Manager `litellm-stg-database-url`에 새 버전으로 넣는다(콘솔). 값은 대화에 붙여 넣지 않는다.

## 최종 리뷰 결과 (2026-10-09)

새 리뷰어가 브랜치 전체를 검토했다. Critical·Important는 없었고 Minor 7건이 나왔다. 출시됐을 때의 영향을 기준으로 다시 분류해 다음과 같이 처리했다.

| 지적 | 처리 |
|---|---|
| WIF subject 바인딩은 pool 단위다. 같은 pool에 나중에 추가될 provider가 이미지 SA의 subject를 만들 수 있다 | Important로 올려 수정했다. 이미지 전용 pool `cak-images`로 분리했다(테스트 `test_image_pool_is_dedicated_to_the_image_provider`) |
| README·런북이 state 이전을 끝난 것처럼 썼다. 이전부터 머지 사이에 낡은 state로 두 번째 writer가 생길 수 있다 | Important로 올려 수정했다. README 두 곳을 고치고, 6-2에 원본 이름 변경과 다른 checkout 실행 금지를 추가했다 |
| 다른 브랜치 토큰 거부를 실측하는 단계가 없다 | 6-6b(선택)를 추가했다. 하지 않으면 정적 테스트가 대신한다 |
| 런타임 SA 이연이 판단 표에 없다 | R2에 명시했다 |
| 레지스트리 보존 규칙이 배포 상태를 모른다(최신 5개 + 30일) | **보류(Phase 3 선행 조건).** 롤백용 이미지에 `keep-` 접두 태그를 붙이고 그 태그를 KEEP하는 규칙을 추가한다(AR `tag_state` 의미는 `TODO(D1)`) |
| 같은 SHA로 다시 빌드하면 불변 태그 때문에 실패한다 | **보류(Phase 2 전).** 태그가 이미 있으면 digest만 보고하고 빌드를 건너뛰는 분기를 넣는다 |
| edge 정적 테스트가 `@hanmadiVideo`의 `method POST`를 보지 않고, 8082 경로 우회 사례가 없다 | **보류(Phase 3 edge 작업 때 보강)** |

리뷰어가 판단을 보류한 항목 중 `edge.py`와 `cloudrun-image`는 PR #169 CI에서 실제로 실행돼 통과했다. GFE가 `Host: <svc>.run.app:443`과 SNI를 받는지는 Phase 2-1 스모크에서 확인한다. 받지 않으면 `header_up Host {upstream_host}`로 바꾼다.
