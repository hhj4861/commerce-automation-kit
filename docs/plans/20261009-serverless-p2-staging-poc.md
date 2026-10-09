# 서버리스 전환 Phase 2 — 스테이징 PoC와 지속 게이트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Phase 0~1과 같은 네이티브 실행) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영 데이터 없이 스테이징에 Cloud Run LiteLLM과 edge 2단 경로를 띄운다. 그 위에서 콜드 스타트, 사용 기록, 예산 초기화, 기능, 종료, 비용을 잰다. 결과는 사용자가 서버리스를 계속할지 정하는 근거가 된다.

**Architecture:** Phase 1 이미지로 내부 전용 `litellm-stg`와 IAM 비공개 스테이징 edge `shared-ai-stg`를 띄운다. DB는 빈 Neon(Free)이다. 2단 경로가 본문 길이와 Host를 어떻게 넘기는지는, 같은 edge 이미지를 `caddy respond`로 띄운 내부 프로브가 보고한다. 측정 도구는 표준 라이브러리 스크립트 세 개다. `observe.py`는 Neon API·psql·Cloud Monitoring으로 관측하고, `poc.py`는 HTTP 호출을 재고, `neon_estimate.py`는 운영 트래픽 기준 Neon 비용을 계산한다. 결과는 `docs/qa/`에 남긴다.

**Tech Stack:** Terraform 1.5.7 + google ~> 7.0, Cloud Run(서비스·Job), Cloud Scheduler, Secret Manager, Cloud Monitoring API, Neon Free(PostgreSQL 16, aws-us-east-2)와 Neon API v2, Python 3 표준 라이브러리(CI는 3.12), psql 17(`/opt/homebrew/opt/libpq/bin/psql`).

**Spec:** `docs/20261009-shared-ai-serverless-migration-plan.md`의 Phase 2(§2·§4·§5·§7·§8 포함). Phase 1 결과는 `docs/plans/20261009-serverless-p1-foundation.md`와 `docs/qa/20261009-serverless-phase1.md`에 있다.

## 마스터 플랜과 다른 점 (실행 판단)

| ID | 판단 | 이유 | 틀렸을 때 비용 |
|---|---|---|---|
| P2-R1 | 스테이징 edge에만 LiteLLM 관리 경로 4개(`key/generate`·`key/info`·`key/delete`·`health/liveliness`)를 연다. 운영 edge 허용목록은 그대로 둔다 | 시험 키 발급과 보온 확인에 필요하다. 스테이징 edge는 `allUsers` 없이 운영자 계정만 호출할 수 있다 | 스테이징이 공개되면 관리 API가 노출된다. 그래도 master key가 필요하고, 정책 테스트가 `allUsers`를 막는다 |
| P2-R2 | Cloud Run IAM 토큰은 `X-Serverless-Authorization`, LiteLLM 키는 `Authorization`에 싣는다 | 한 헤더에 두 인증을 함께 실을 수 없다. 사용자 ID 토큰을 이 헤더에 실을 수 있는지와 `Authorization`이 그대로 전달되는지는 문서에 없다(D1 미확인) | 7-5 스모크의 `bad-key`·`models`에서 드러난다. 안 되면 ID 토큰은 `Authorization`, LiteLLM 키는 `x-litellm-api-key`(LiteLLM 1.102.1이 받으며 `Authorization`보다 우선, D1 확정)로 바꾼다 |
| P2-R3 | (g)는 두 가지로 잰다. ① 24시간 창 두 개(g1 보온 없음, g2 보온 5분)에서 Neon 상태 변화와 Cloud Run 과금 시간을 기록한다. g1에는 (a)의 희소 호출이 들어가고, g2에는 보온 ping만 둔다. ② 운영 비용은 VM이 정상 운영된 연속 14일의 spend log 시각에, ①과 (b)에서 잰 매개변수(축소 뒤 flush 시점, 보온 중 DB 접근 주기)를 넣어 계산한다 | 노트북에서 24시간 합성 트래픽을 안정적으로 낼 수 없다. 운영 시각 분포가 더 현실적이다 | 키 조회처럼 spend log에 남지 않는 DB 접근은 빠져 과소추정된다. 결과에 한계로 적는다 |
| P2-R4 | (a)(b)(d)와 (f) 스트리밍은 실제 공급자 호출로 잰다. (c)(e)(f) 유휴 사례는 `mock_response`(공급자 호출 없음)로 잰다. LiteLLM 1.102.1은 키 metadata에 `allow_client_mock_response: true`가 있을 때만 `mock_response`를 받으므로(D1 확정), 시험 키를 그렇게 발급한다. mock 요청에도 `max_tokens: 1`을 붙여, 필드가 버려져도 공급자 호출이 1토큰으로 끝나게 한다 | 지연과 비용 기록은 실제 경로여야 의미가 있다. 반복 호출은 무료가 낫다. mock 응답도 spend log에 비용과 함께 남는다(D1 확정) | 대체 호출 1건당 $0.0001 미만 |
| P2-R5 | 서비스 이미지는 Terraform이 처음 만들 때만 정하고, 이후 교체는 `gcloud`로 한다(`ignore_changes`) | 마스터 플랜 §2 원칙 4 | 없음 |
| P2-R6 | Neon 상태와 사용량은 Neon API로 읽는다. 사용자가 발급한 키를 Secret Manager `neon-stg-api-key`에 넣는다 | (e)(f)(g)는 compute가 실제로 멈췄는지 확인해야 한다. 10회·24시간 측정을 콘솔로 확인할 수는 없다 | 키가 없으면 (e)(f)는 대기 시간만으로 판단해 신뢰도가 떨어진다 |
| P2-R7 | Phase 1에서 미룬 "같은 커밋 재빌드 실패"를 여기서 고친다(태스크 3) | 스테이징 이미지를 다시 빌드하기 전이다 | 없음 |
| P2-R8 | 2단 hop의 본문 길이·Host 확인(마스터 2-1)은 새 이미지 없이 한다. 같은 edge 이미지를 `caddy respond` 프로브로 띄우고, 스모크 동안 edge의 `LLM_UPSTREAM`을 잠시 프로브로 돌린다 | 운영과 같은 라우트(`@llm`·`@jev`·`@hanmadiVideo`)를 그대로 거친다. LiteLLM은 chunked 본문도 받아들여 차이를 드러내지 못한다 | 프로브가 자리표시자를 치환하지 않으면 이 확인을 Phase 4 discovery 스모크로 미룬다 |
| P2-R9 | 보온 ping은 Scheduler가 내부 LiteLLM `/health/liveliness`를 직접 호출한다. 운영 edge 허용목록에 경로를 더하지 않는다 | 같은 프로젝트의 Cloud Scheduler는 기본 run.app URL로 internal ingress 서비스를 호출할 수 있다(D1 확정, 마스터 §8.1의 미확인 항목). OIDC 토큰은 IAM이 켜진 경로를 대비해 그대로 둔다 | 막히면 `-var warm_ping_via_edge=true`로 apply 1회 |
| P2-R10 | (c)가 실패할 때 쓸 보정 API는 원문 확인으로 끝낸다. `/key/update`의 `spend`(관리자 전용)와 `POST /key/{key}/reset_spend`가 있다(D1 확정). 실행 확인은 Phase 3-2 `litellm-admin` Job에서 한다 | 스테이징 edge는 `/key/update`를 열지 않는다 | Phase 3에서 보정 경로를 다시 설계할 수 있다 |
| P2-R11 | (a)는 master key가 아니라 발급한 시험 키로 잰다 | master key는 DB를 조회하지 않아, 가상 키를 DB에서 찾는 운영보다 빠르게 나온다 | 없음 |
| P2-R12 | 스테이징 자원을 두 번에 나눠 적용한다. 마이그레이션 Job을 먼저 만들어 실행한 뒤 서비스를 만든다 | 빈 DB에서 `DISABLE_SCHEMA_UPDATE=true`인 서비스가 먼저 뜨면 요청이 테이블 없음으로 실패할 수 있다 | `-target` apply 1회 |
| P2-R13 | (e)는 liveliness ping 없이, 앞 요청 뒤 Neon이 정지할 때까지(7분 이상, 최대 12분) 기다린 다음 잰다. 마스터의 "10분 유휴"는 Neon 정지를 확실히 하려는 값이라, API로 정지를 확인하는 것으로 대신한다 | DB에 연결된 LiteLLM은 60초마다 하트비트를 DB에 쓴다(D1 확정, `LiteLLM_ProxyWorkerHeartbeat`). ping으로 CPU를 주면 이 쓰기가 Neon을 깨운다. 인스턴스 유휴 보존은 최대 15분이다 | 인스턴스가 12분 안에 회수되면 그 시행은 콜드로 분류해 뺀다(로그 대조) |
| P2-R14 | 스테이징 edge는 운영 edge의 `shared-ai-proxy`(/26)가 아니라 새 서브넷 `shared-ai-staging`(10.79.0.64/26, Private Google Access)으로 나간다 | Direct VPC egress는 서브넷 IP를 블록 단위로 잡고 바뀐 리비전의 IP를 한동안 붙잡는다. 스테이징 리비전 교체가 운영 edge가 쓸 IP를 차지하면 Hanmadi·Festa 공개 경로가 실패할 수 있다. VM 방화벽(출발지: 프록시 서브넷)이 스테이징 edge를 신뢰하지 않게도 된다. 운영 /26에 edge와 admin Job을 함께 둘지는 마스터 §8.1의 미확인 항목으로 남는다 | 서브넷 1개(무료) |

## Global Constraints

- 대상 GCP 프로젝트는 `replay-live-508202` 하나다. 모든 `gcloud` 명령에 `--project=replay-live-508202`를 붙인다(기본 프로젝트가 회사 프로젝트다). Terraform은 `GOOGLE_OAUTH_ACCESS_TOKEN`(개인 계정)과 `TF_VAR_project_id`만 쓰고, state는 GCS backend다.
- 비밀값(master·salt 키, 공급자 키, DB URL, Neon API 키, 발급한 시험 키, ID·액세스 토큰)은 출력·커밋·로그·결과 파일에 남기지 않는다. 시크릿은 파이프와 환경변수로만 옮긴다. 같은지 확인할 때는 길이와 sha256 앞 8자리만 비교한다. 시험 키 파일은 로컬 `~/.cak-p2-keys`(디렉터리 0700, 파일 0600)에만 두고 iCloud에는 두지 않는다.
- 측정 로그(JSON lines, redact 통과)는 iCloud 작업 폴더 `tmp/<YYYYMMDD>-p2-poc/`에 둔다. 결과를 `docs/qa/`로 옮긴 뒤 지운다.
- 운영 데이터와 운영 가상 키를 스테이징에 넣지 않는다. 공급자 키만 운영 값을 쓴다. 시험 키는 `max_budget` $0.05, `duration` 7일로 발급한다.
- 운영 변경과 비용 발생은 태스크 7의 승인 묶음 A(준비)와 B(측정)로 받는다. 유료 호출 수와 예상 비용을 먼저 제시한다.
- 계약은 append-only다. 운영 edge(VM Caddy), 운영 LiteLLM, discovery는 바꾸지 않는다. 7-7은 VM DB를 읽기만 한다.
- 확실하지 않은 스펙은 `TODO(D1)`로 표기하고, 7-5 스모크나 해당 측정에서 실측한다.
- 로컬 디스크가 부족하다. `terraform init`이 받는 `.terraform/`(약 120MB)은 검증·적용 직후 지운다.
- 명령은 모두 저장소 루트(작업 worktree)에서 실행한다.
- 몇 시간 이상 도는 측정((a), g1·g2의 `neon-watch`)은 전원을 연결하고 덮개를 연 노트북에서 `nohup caffeinate -ims <명령> > <로그> 2>&1 &`로 띄운다. 잠자기 동안의 Neon 상태는 알 수 없으므로 `neon-gap`으로 따로 기록된다.

## Review Focus

1. **콜드 측정이 사실은 웜 인스턴스를 잰다.** 기대: 샘플 사이 20분 동안 다른 호출이 없고, Cloud Run 로그의 새 인스턴스 시작 시각이 샘플 직전이며, Neon이 정지 상태였다. → 태스크 5 `cold_sample`이 Neon 정지를 기다린 뒤 보내고 `neon_before`·`neon_waited_s`를 남긴다(`test_cold_sample_waits_for_neon_to_idle_before_calling`). 7-6은 인스턴스 시작 로그와 대조해 무효 샘플을 빼고 다시 잰다.
2. **하네스가 비밀을 남긴다.** 발급 키, ID 토큰, DB URL, Neon 키가 출력·결과 파일·오류 메시지에 섞일 수 있다. 기대: 모든 기록이 `observe.record()`를 거치고 응답 본문은 기록하지 않는다. 발급 키는 0600 파일에만 남고 해시만 보인다. → 태스크 4 `test_records_never_contain_secrets`, 태스크 5 `test_new_keys_go_to_a_private_file_and_only_their_hash_is_shown`.
3. **측정이 측정 대상을 바꾼다.** 대기 중에 키를 실은 호출이나 psql 조회가 LiteLLM에 CPU를 주거나 Neon을 깨우면 (b)(e)(f)가 틀린다. 기대: 대기 중에는 키 없는 liveliness와 Neon 제어면 API만 쓰고, SQL은 측정 대상 사건이 끝난 뒤에만 실행한다. → 태스크 4 `test_wait_polls_only_the_control_plane_until_idle`, 태스크 5 `test_warm_wait_touches_only_liveliness_until_the_measured_call`·`test_without_pings_the_wait_only_polls_neon`.
4. **장시간 측정이 ID 토큰 만료로 401이 된다.** gcloud ID 토큰은 1시간 유효하고, gcloud가 만료가 가까운 캐시 토큰을 돌려줄 수도 있다. 노트북이 잠들면 monotonic 시계는 멈춘다. 기대: 토큰 자체의 `exp`를 벽시계로 보고 15분 전에 다시 받는다. → 태스크 5 `test_id_token_is_refreshed_before_it_expires`·`test_a_cached_token_close_to_expiry_is_replaced`.
5. **스테이징 관리 경로가 공개된다.** 기대: `allUsers`가 없고, ID 토큰 없는 요청은 Cloud Run이 막는다. → 태스크 1 `test_is_private_to_the_operator`, 7-5 스모크 `no-id-token`.

## 순서와 일정

- 태스크 1~6(코드, 0.5일): PR 1개. CI가 `terraform validate`, 단위 테스트, 실제 Caddy `tests/edge.py`를 돌린다. 클라우드는 건드리지 않는다. 이 계획의 코드는 작성 때(2026-10-09) 로컬에서 그대로 실행해 확인했다. 단위 테스트 71개가 통과했고 `terraform validate`도 성공했다(최종 리뷰 지적 반영 후 기준). `tests/edge.py`는 Docker가 필요해 CI에서 처음 돈다.
- 태스크 7(운영): 준비 0.5일 → 측정 1일 → 관찰 2일(g1·g2 각 24시간) → 게이트 보고. 사용자 몫은 Neon 가입·URL·API 키 입력과 승인 묶음 A·B다.

---

### Task 1: 스테이징 Terraform 자원

**Files:**
- Create: `services/shared-ai-host/staging.tf`, `services/shared-ai-host/tests/test_staging.py`
- Modify: `services/shared-ai-host/main.tf`(API 목록, 시크릿 컨테이너 목록, `secret_versions` 기본값)

**Interfaces:**
- Consumes: Phase 1의 시크릿 컨테이너 `google_secret_manager_secret.managed`, AR 이미지 digest, `google_service_account.proxy`, `google_compute_network.ai`, `google_compute_subnetwork.proxy`(Private Google Access 켜짐).
- Produces: 서브넷 `shared-ai-staging`(10.79.0.64/26), Cloud Run 서비스 `litellm-stg`(내부)·`shared-ai-probe-stg`(내부)·`shared-ai-stg`(edge), Job `litellm-stg-migrate`, Scheduler `litellm-stg-warm`(처음에는 멈춤, 이후 apply가 재개·정지 상태를 되돌리지 않음), 출력 `staging_edge_url`·`staging_litellm_url`·`staging_probe_url`, 변수 `staging_images`·`staging_invoker`·`warm_ping_via_edge`.

- [ ] **Step 1: 실패하는 정책 테스트 작성** (`services/shared-ai-host/tests/test_staging.py`)

```python
"""Static policy checks for the Phase 2 staging PoC resources (no credentials needed)."""
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TF = (ROOT / "staging.tf").read_text()
MAIN = (ROOT / "main.tf").read_text()


def block(text, header):
    start = text.index(header)
    depth = 0
    for end in range(text.index("{", start), len(text)):
        depth += {"{": 1, "}": -1}.get(text[end], 0)
        if depth == 0:
            return text[start:end + 1]
    raise AssertionError(f"unbalanced block: {header}")


def env_pairs(text):
    return dict(re.findall(r'name\s*=\s*"([A-Z_]+)"\s*\n\s*value\s*=\s*"([^"]*)"', text))


class LiteLLMStagingTest(unittest.TestCase):
    SERVICE = block(TF, 'resource "google_cloud_run_v2_service" "litellm_stg"')

    def test_reachable_only_through_the_vpc(self):
        self.assertRegex(self.SERVICE, r'ingress\s*=\s*"INGRESS_TRAFFIC_INTERNAL_ONLY"')
        self.assertRegex(self.SERVICE, r'invoker_iam_disabled\s*=\s*true')

    def test_one_request_billed_instance_that_scales_to_zero(self):
        for pattern in (r'min_instance_count\s*=\s*0', r'max_instance_count\s*=\s*1', r'max_instance_request_concurrency\s*=\s*20',
                        r'cpu_idle\s*=\s*true', r'startup_cpu_boost\s*=\s*true', r'timeout\s*=\s*"300s"'):
            self.assertRegex(self.SERVICE, pattern)

    def test_env_only_settings_are_set_on_the_service(self):
        self.assertEqual(env_pairs(self.SERVICE), {"STORE_MODEL_IN_DB": "False", "LITELLM_TELEMETRY": "False",
                                                   "DISABLE_SCHEMA_UPDATE": "true", "GRACEFUL_SHUTDOWN_TIMEOUT": "3"})

    def test_secrets_resolve_at_pinned_versions(self):
        self.assertRegex(self.SERVICE, r'version\s*=\s*var\.secret_versions\[env\.value\]')
        self.assertNotRegex(TF, r'(?i)"latest"')

    def test_startup_probe_and_pipeline_owned_image(self):
        self.assertRegex(self.SERVICE, r'path\s*=\s*"/health/liveliness"')
        self.assertIn("template[0].containers[0].image", self.SERVICE)


class MigrateJobTest(unittest.TestCase):
    JOB = block(TF, 'resource "google_cloud_run_v2_job" "litellm_stg_migrate"')

    def test_runs_migrations_then_exits_without_retry(self):
        self.assertIn('"--skip_server_startup"', self.JOB)
        self.assertNotIn("DISABLE_SCHEMA_UPDATE", self.JOB)
        self.assertRegex(self.JOB, r'max_retries\s*=\s*0')


class ProbeTest(unittest.TestCase):
    PROBE = block(TF, 'resource "google_cloud_run_v2_service" "probe_stg"')

    def test_reuses_the_edge_image_as_an_internal_responder(self):
        self.assertIn("var.staging_images.edge", self.PROBE)
        self.assertIn('"respond"', self.PROBE)
        self.assertRegex(self.PROBE, r'ingress\s*=\s*"INGRESS_TRAFFIC_INTERNAL_ONLY"')

    def test_reply_reports_framing_but_never_credentials(self):
        reply = re.search(r'probe_reply\s*=\s*"(.*)"\n', TF).group(1)
        self.assertIn("{http.request.header.Content-Length}", reply)
        for header in ("Authorization", "Cookie", "Serverless"):
            self.assertNotIn(header, reply)


class EdgeStagingTest(unittest.TestCase):
    EDGE = block(TF, 'resource "google_cloud_run_v2_service" "edge_stg"')

    def test_reaches_internal_services_through_the_vpc(self):
        self.assertRegex(self.EDGE, r'egress\s*=\s*"ALL_TRAFFIC"')
        self.assertIn("google_cloud_run_v2_service.litellm_stg.uri", self.EDGE)

    def test_egress_uses_its_own_subnet_with_private_google_access(self):
        self.assertIn("google_compute_subnetwork.staging.name", self.EDGE)
        self.assertNotIn("google_compute_subnetwork.proxy", self.EDGE)
        subnet = block(TF, 'resource "google_compute_subnetwork" "staging"')
        self.assertRegex(subnet, r'ip_cidr_range\s*=\s*"10\.79\.0\.64/26"')
        self.assertRegex(subnet, r'private_ip_google_access\s*=\s*true')

    def test_is_private_to_the_operator(self):
        for public in ("allUsers", "allAuthenticatedUsers"):
            self.assertNotIn(public, TF)
        self.assertIn("var.staging_invoker", block(TF, 'resource "google_cloud_run_v2_service_iam_member" "edge_stg_invoker"'))


class WarmPingTest(unittest.TestCase):
    JOB = block(TF, 'resource "google_cloud_scheduler_job" "litellm_stg_warm"')

    def test_starts_paused_and_only_touches_liveliness(self):
        self.assertRegex(self.JOB, r'paused\s*=\s*true')
        self.assertEqual(len(re.findall(r'/health/liveliness"', self.JOB)), 2)
        self.assertIn("var.warm_ping_via_edge", self.JOB)
        self.assertIn("oidc_token", self.JOB)

    def test_resume_and_pause_survive_a_later_apply(self):
        self.assertRegex(self.JOB, r'ignore_changes\s*=\s*\[paused\]')


class PinningTest(unittest.TestCase):
    def test_images_are_digest_pinned(self):
        self.assertIn("@sha256:[0-9a-f]{64}$", block(TF, 'variable "staging_images"'))

    def test_staging_secret_versions_are_numbers(self):
        default = block(MAIN, 'variable "secret_versions"')
        for name in ("litellm-stg-master-key", "litellm-stg-salt-key", "litellm-stg-database-url",
                     "hanmadi-chat-api-key", "elevenlabs-api-key", "typesafe-api-key"):
            self.assertRegex(default, rf'"{name}"\s*=\s*"[1-9][0-9]*"')

    def test_scheduler_api_and_neon_key_container(self):
        self.assertIn('"cloudscheduler.googleapis.com"', block(MAIN, 'resource "google_project_service" "api"'))
        self.assertIn('"neon-stg-api-key"', block(MAIN, "locals {"))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 실패 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_staging.py' -v`
Expected: ERROR. `staging.tf`가 없어 모듈 로드에서 `FileNotFoundError`가 난다.

- [ ] **Step 3: `main.tf` 수정**

`google_project_service.api`의 `for_each` 줄을 다음으로 바꾼다(`cloudscheduler` 추가).

```hcl
  for_each           = toset(["compute.googleapis.com", "run.googleapis.com", "iam.googleapis.com", "iap.googleapis.com", "artifactregistry.googleapis.com", "secretmanager.googleapis.com", "cloudscheduler.googleapis.com"])
```

`local.secrets`의 `"hanmadi-chat-api-key", …, "typesafe-api-key",` 줄 다음에 한 줄을 더한다.

```hcl
    "neon-stg-api-key",
```

`variable "secret_versions"`의 `default     = {}`를 다음으로 바꾼다.

```hcl
  # Version 1 is the first value added to each container; bump after adding a new version.
  default = {
    "litellm-stg-master-key"   = "1"
    "litellm-stg-salt-key"     = "1"
    "litellm-stg-database-url" = "1"
    "hanmadi-chat-api-key"     = "1"
    "elevenlabs-api-key"       = "1"
    "typesafe-api-key"         = "1"
  }
```

- [ ] **Step 4: `staging.tf` 작성**

`staging_images` 기본값은 Phase 1에서 빌드한 digest다. 태스크 2를 반영한 edge 이미지는 7-3에서 다시 빌드해 `-var`로 넘긴다. 이미지는 처음 만들 때만 쓰이므로 기본값을 바꾸는 커밋은 필요 없다.

```hcl
# Phase 2 staging PoC (docs/plans/20261009-serverless-p2-staging-poc.md). No production data
# or virtual keys: a test master/salt key, an empty Neon (Free) database and the production
# provider keys only. Remove this file and apply if the gate stops the serverless path.
variable "staging_images" {
  description = "Digests for the first create only; later swaps go through gcloud run deploy (image changes are ignored)."
  type = object({
    litellm = string
    edge    = string
  })
  default = {
    litellm = "us-central1-docker.pkg.dev/replay-live-508202/shared-ai/litellm-staging@sha256:2c3f70cdbc08cac6bbc639905b1840740b26288425b095e43c0075c95fc39fb6"
    edge    = "us-central1-docker.pkg.dev/replay-live-508202/shared-ai/edge-staging@sha256:3ab3ac02426f806b398da4e68dcf9e5775727d1318a09906dd9598099f0a46a0"
  }
  validation {
    condition     = alltrue([for v in values(var.staging_images) : can(regex("^us-central1-docker\\.pkg\\.dev/replay-live-508202/shared-ai/[a-z-]+@sha256:[0-9a-f]{64}$", v))])
    error_message = "Staging images must be pinned by digest from the shared-ai registry."
  }
}
variable "staging_invoker" {
  description = "The only principal allowed to call the staging edge."
  type        = string
  default     = "user:guswhd1085@gmail.com"
}
variable "warm_ping_via_edge" {
  description = "Send the warm ping through the staging edge if Cloud Scheduler cannot reach the internal service."
  type        = bool
  default     = false
}
locals {
  # Env name -> Secret Manager secret, resolved at pinned numeric versions.
  litellm_stg_secrets = {
    LITELLM_MASTER_KEY   = "litellm-stg-master-key"
    LITELLM_SALT_KEY     = "litellm-stg-salt-key"
    DATABASE_URL         = "litellm-stg-database-url"
    HANMADI_CHAT_API_KEY = "hanmadi-chat-api-key"
    ELEVENLABS_API_KEY   = "elevenlabs-api-key"
    TYPESAFE_API_KEY     = "typesafe-api-key"
  }
  # Framing probe reply: how the second hop received a request. Never echoes credentials.
  probe_reply = "{\"method\":\"{http.request.method}\",\"path\":\"{http.request.uri}\",\"host\":\"{http.request.hostport}\",\"content_length\":\"{http.request.header.Content-Length}\"}"
}
resource "google_service_account" "litellm_stg" {
  account_id   = "shared-ai-litellm-stg"
  display_name = "Shared AI LiteLLM staging runtime (PoC)"
  depends_on   = [google_project_service.api]
}
resource "google_secret_manager_secret_iam_member" "litellm_stg" {
  for_each  = toset(values(local.litellm_stg_secrets))
  secret_id = google_secret_manager_secret.managed[each.value].id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.litellm_stg.email}"
}
resource "google_cloud_run_v2_service" "litellm_stg" {
  name                 = "litellm-stg"
  location             = local.region
  deletion_protection  = false
  ingress              = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  invoker_iam_disabled = true
  template {
    service_account                  = google_service_account.litellm_stg.email
    timeout                          = "300s"
    max_instance_request_concurrency = 20
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image = var.staging_images.litellm
      ports {
        container_port = 8080
      }
      resources {
        limits            = { cpu = "1", memory = "1Gi" }
        cpu_idle          = true
        startup_cpu_boost = true
      }
      env {
        name  = "STORE_MODEL_IN_DB"
        value = "False"
      }
      env {
        name  = "LITELLM_TELEMETRY"
        value = "False"
      }
      env {
        name  = "DISABLE_SCHEMA_UPDATE"
        value = "true"
      }
      env {
        name  = "GRACEFUL_SHUTDOWN_TIMEOUT"
        value = "3"
      }
      dynamic "env" {
        for_each = local.litellm_stg_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.managed[env.value].secret_id
              version = var.secret_versions[env.value]
            }
          }
        }
      }
      startup_probe {
        period_seconds    = 5
        timeout_seconds   = 3
        failure_threshold = 24
        http_get {
          path = "/health/liveliness"
        }
      }
    }
  }
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_iam_member.litellm_stg]
}
resource "google_cloud_run_v2_job" "litellm_stg_migrate" {
  name                = "litellm-stg-migrate"
  location            = local.region
  deletion_protection = false
  template {
    template {
      service_account = google_service_account.litellm_stg.email
      timeout         = "600s"
      max_retries     = 0
      containers {
        image = var.staging_images.litellm
        # Applies the Prisma migrations during setup, then exits (LiteLLM 1.102.1 CLI).
        args = ["--config", "/etc/litellm/config.json", "--skip_server_startup"]
        resources {
          limits = { cpu = "1", memory = "1Gi" }
        }
        env {
          name  = "STORE_MODEL_IN_DB"
          value = "False"
        }
        env {
          name  = "LITELLM_TELEMETRY"
          value = "False"
        }
        dynamic "env" {
          for_each = local.litellm_stg_secrets
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = google_secret_manager_secret.managed[env.value].secret_id
                version = var.secret_versions[env.value]
              }
            }
          }
        }
      }
    }
  }
  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
  depends_on = [google_secret_manager_secret_iam_member.litellm_stg]
}
# The staging edge image run as `caddy respond`: during the smoke, the edge's LLM_UPSTREAM
# points here briefly so the reply shows the Host and Content-Length the second hop received.
resource "google_cloud_run_v2_service" "probe_stg" {
  name                 = "shared-ai-probe-stg"
  location             = local.region
  deletion_protection  = false
  ingress              = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  invoker_iam_disabled = true
  template {
    service_account = google_service_account.proxy.email
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image   = var.staging_images.edge
      command = ["caddy"]
      args    = ["respond", "--listen", ":8080", "--header", "Content-Type: application/json", "--body", local.probe_reply]
      ports {
        container_port = 8080
      }
      resources {
        limits   = { cpu = "1", memory = "512Mi" }
        cpu_idle = true
      }
    }
  }
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}
# The staging edge gets its own subnet: its Direct VPC egress addresses never compete with the
# production edge on shared-ai-proxy, and the VM firewall (source: the proxy subnet) does not
# trust it.
resource "google_compute_subnetwork" "staging" {
  name                     = "shared-ai-staging"
  network                  = google_compute_network.ai.id
  ip_cidr_range            = "10.79.0.64/26"
  private_ip_google_access = true
}
resource "google_cloud_run_v2_service" "edge_stg" {
  name                = "shared-ai-stg"
  location            = local.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"
  template {
    service_account                  = google_service_account.proxy.email
    timeout                          = "300s"
    max_instance_request_concurrency = 40
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    # All egress enters the VPC (Private Google Access on the subnet), so internal-only
    # services accept the edge's requests.
    vpc_access {
      egress = "ALL_TRAFFIC"
      network_interfaces {
        network    = google_compute_network.ai.name
        subnetwork = google_compute_subnetwork.staging.name
      }
    }
    containers {
      image = var.staging_images.edge
      ports {
        container_port = 8080
      }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = false
      }
      env {
        name  = "LLM_UPSTREAM"
        value = google_cloud_run_v2_service.litellm_stg.uri
      }
    }
  }
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}
resource "google_cloud_run_v2_service_iam_member" "edge_stg_invoker" {
  location = local.region
  name     = google_cloud_run_v2_service.edge_stg.name
  role     = "roles/run.invoker"
  member   = var.staging_invoker
}
resource "google_service_account" "scheduler_stg" {
  account_id   = "shared-ai-scheduler-stg"
  display_name = "Shared AI staging warm ping (PoC)"
  depends_on   = [google_project_service.api]
}
resource "google_cloud_run_v2_service_iam_member" "edge_stg_scheduler" {
  location = local.region
  name     = google_cloud_run_v2_service.edge_stg.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_stg.email}"
}
# Paused until the g2 window. The liveliness route never queries the database.
resource "google_cloud_scheduler_job" "litellm_stg_warm" {
  name             = "litellm-stg-warm"
  region           = local.region
  schedule         = "*/5 * * * *"
  time_zone        = "Etc/UTC"
  paused           = true
  attempt_deadline = "60s"
  http_target {
    http_method = "GET"
    uri         = var.warm_ping_via_edge ? "${google_cloud_run_v2_service.edge_stg.uri}/llm/health/liveliness" : "${google_cloud_run_v2_service.litellm_stg.uri}/health/liveliness"
    oidc_token {
      service_account_email = google_service_account.scheduler_stg.email
      audience              = var.warm_ping_via_edge ? google_cloud_run_v2_service.edge_stg.uri : google_cloud_run_v2_service.litellm_stg.uri
    }
  }
  lifecycle {
    # Created paused; resume and pause during the PoC are runtime state, so a later apply
    # (for example warm_ping_via_edge=true) must not pause the job again.
    ignore_changes = [paused]
  }
  depends_on = [google_project_service.api, google_cloud_run_v2_service_iam_member.edge_stg_scheduler]
}
output "staging_edge_url" { value = google_cloud_run_v2_service.edge_stg.uri }
output "staging_litellm_url" { value = google_cloud_run_v2_service.litellm_stg.uri }
output "staging_probe_url" { value = google_cloud_run_v2_service.probe_stg.uri }
```

- [ ] **Step 5: 통과 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_*.py'`
Expected: `OK`(Phase 1 테스트 16개 + 새 테스트 16개 = 32개).

Run: `cd services/shared-ai-host && terraform fmt -check && terraform init -backend=false -input=false -lockfile=readonly >/dev/null && terraform validate; rm -rf .terraform`
Expected: `Success! The configuration is valid.`(2026-10-09 계획 작성 때 같은 파일로 확인함)

- [ ] **Step 6: 커밋**

```bash
git add services/shared-ai-host/staging.tf services/shared-ai-host/main.tf services/shared-ai-host/tests/test_staging.py
git commit -m "feat(shared-ai): add the Phase 2 staging LiteLLM, edge, probe and warm ping"
```

### Task 2: 스테이징 edge 관리 경로

**Files:**
- Modify: `services/shared-ai-host/edge/Caddyfile.staging`, `services/shared-ai-host/tests/test_edge_config.py`, `services/shared-ai-host/tests/edge.py`

**Interfaces:**
- Produces: 스테이징 edge 경로 `/llm/key/generate`·`/llm/key/info`·`/llm/key/delete`·`/llm/health/liveliness`(태스크 5와 7이 사용).

- [ ] **Step 1: 실패하는 정적 테스트 추가** (`test_edge_config.py`의 `EdgeConfigTest`, `test_listens_on_the_cloud_run_port` 앞)

```python
    def test_admin_routes_are_a_closed_staging_only_list(self):
        self.assertEqual(matcher_paths(STAGING, "admin"),
                         ["/llm/key/generate", "/llm/key/info", "/llm/key/delete", "/llm/health/liveliness"])
        self.assertNotIn("@admin", VM)
```

- [ ] **Step 2: 실패 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_edge_config.py' -v`
Expected: ERROR. `@admin` 매처가 없어 `AttributeError: 'NoneType' object has no attribute 'group'`이 난다.

- [ ] **Step 3: `Caddyfile.staging`에 관리 경로 추가** (`handle /health {` 앞)

```
    # Staging only: this edge is IAM-private (operator ID token, no public invoker), so the PoC
    # reaches the LiteLLM admin API here. The production edge never routes these paths.
    @admin path /llm/key/generate /llm/key/info /llm/key/delete /llm/health/liveliness
    handle @admin {
        uri strip_prefix /llm
        reverse_proxy {$LLM_UPSTREAM} {
            header_up Host {upstream_hostport}
        }
    }
```

- [ ] **Step 4: 통과 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_edge_config.py' -v`
Expected: PASS 6/6. 기존 `test_every_upstream_is_the_service_url_with_its_own_host`도 통과한다(새 `reverse_proxy`에도 `header_up Host`가 있다).

- [ ] **Step 5: `tests/edge.py`의 스테이징 검증 갱신(CI에서 실행)**

8082 검증의 404 목록 루프를 다음으로 바꾼다. 관리 경로 4개는 업스트림까지 가고, 나머지 관리 경로는 계속 404다.

```python
    for path in ("/llm/key/generate", "/llm/key/info", "/llm/key/delete", "/llm/health/liveliness"):
        assert request(8082, path)[0] == 401, path
        code, body, headers = request_with_headers(8082, path, KEY)
        assert code == 200 and json.loads(body)["path"] == path.removeprefix("/llm"), path
        assert headers["X-Echo-Host"] == "127.0.0.1:4100", (path, headers["X-Echo-Host"])
    for path in ("/discovery/v1/discover", "/accounts/connections", "/v1/chat-messages", "/llm/key/update",
                 "/llm/user/new", "/key/generate", "/llm/health/readiness", "/llm/v1/files"):
        assert request(8082, path, KEY)[0] == 404, path
```

Run: `python3 -m py_compile services/shared-ai-host/tests/edge.py`
Expected: 오류 없음. 실제 Caddy 실행은 PR CI의 `configuration` job이 한다(로컬에는 Docker가 없다).

- [ ] **Step 6: 커밋**

```bash
git add services/shared-ai-host/edge/Caddyfile.staging services/shared-ai-host/tests/test_edge_config.py services/shared-ai-host/tests/edge.py
git commit -m "feat(shared-ai): open the LiteLLM admin routes on the private staging edge"
```

### Task 3: 같은 커밋 재빌드는 기존 digest 보고로 끝내기

**Files:**
- Modify: `.github/workflows/shared-ai-images.yml`, `services/shared-ai-host/tests/test_images_workflow.py`

- [ ] **Step 1: 실패하는 테스트 추가** (`ImagesWorkflowTest`, `test_no_repository_secrets_are_used` 앞)

```python
    def test_existing_commit_tag_is_reported_instead_of_rebuilt(self):
        body = WF[WF.index('ref="$REGISTRY/$IMAGE:$SHA"'):]
        self.assertLess(body.index('gcloud artifacts docker images describe "$ref"'), body.index("docker build"))
```

- [ ] **Step 2: 실패 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_images_workflow.py' -v`
Expected: ERROR. `ValueError: substring not found`.

- [ ] **Step 3: 워크플로 수정** (`ref="$REGISTRY/$IMAGE:$SHA"` 줄 바로 다음)

```bash
          if existing=$(gcloud artifacts docker images describe "$ref" --format='value(image_summary.digest)' 2>/dev/null) && [ -n "$existing" ]; then
            echo "$IMAGE from $SHA already built: \`$REGISTRY/$IMAGE@$existing\`" >> "$GITHUB_STEP_SUMMARY"
            exit 0
          fi
```

- [ ] **Step 4: 통과 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_images_workflow.py' -v`
Expected: PASS 6/6. 새 줄에 `${{`가 없어 `test_inputs_reach_the_shell_only_through_env`도 통과한다.

- [ ] **Step 5: 커밋**

```bash
git add .github/workflows/shared-ai-images.yml services/shared-ai-host/tests/test_images_workflow.py
git commit -m "fix(shared-ai): report an existing commit image instead of failing the rebuild"
```

### Task 4: 관측 도구 `observe.py`

**Files:**
- Create: `services/shared-ai-host/poc/observe.py`, `services/shared-ai-host/tests/test_observe.py`

**Interfaces:**
- Produces: `observe.register_secret(value)`, `observe.redact(text) -> str`, `observe.record(entry: dict) -> str`(`body` 키 제외), `observe.emit(entry)`, `observe.safe(fn)`(API·네트워크 오류를 `"error:<이름>"`으로 돌려줌), `observe.Neon(api_key, project_id, opener=None)`의 `.endpoint() -> dict`·`.state() -> str`(`init`·`active`·`idle`)·`.usage() -> dict`·`.wait_for(wanted, timeout, interval=30, sleep, clock) -> str`, `observe.neon_from_env() -> Neon | None`, `observe.non_idle_seconds(records, end=None) -> float`(`neon-gap` 구간 제외), `observe.gap_seconds(records) -> float`, `observe.watch(neon, hours, interval, emit_fn=emit, sleep=time.sleep, clock=time.time)`(벽시계 마감, 폴링 간격이 3배를 넘으면 `neon-gap`, 시작·끝 줄은 항상 기록), `observe.pg_env(url) -> dict`, `observe.sql_text(name, key_hash=None, since=0.0) -> str`(`name` ∈ `spend-count`·`key-state`·`expire-budget`·`tables`), `observe.psql(sql, url, run=subprocess.run) -> str`, `observe.billable_seconds(service, start, end, access_token, opener=None) -> float`. CLI: `neon-state`, `neon-watch --hours H [--interval S]`, `neon-active FILE`, `neon-wait-idle [--timeout-minutes M]`, `sql {expire-budget,key-state,spend-count,tables} [--key-hash H] [--since EPOCH]`, `run-usage --start RFC3339 --end RFC3339`.

- [ ] **Step 1: 실패하는 테스트 작성** (`services/shared-ai-host/tests/test_observe.py`)

```python
"""Unit tests for the PoC observation helpers; no network, no database."""
import io
import json
import sys
import unittest
import urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "poc"))
import observe  # noqa: E402

KEY = "sk-" + "a" * 40
TOKEN = "eyJ" + "b" * 20 + "." + "c" * 20 + "." + "d" * 20
URL = "postgresql://owner:p%40ss@ep-x-123.us-east-2.aws.neon.tech/neondb?sslmode=require&connect_timeout=15"
HASH = "0" * 64


class Response(io.BytesIO):
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class Opener:
    def __init__(self, *payloads):
        self.payloads, self.requests = list(payloads), []

    def open(self, request, timeout):
        self.requests.append(request)
        return Response(json.dumps(self.payloads.pop(0)).encode())


class RedactionTest(unittest.TestCase):
    def test_records_never_contain_secrets(self):
        observe.register_secret("neon-api-key-value-123")
        text = f"key={KEY} token={TOKEN} db={URL} neon=neon-api-key-value-123"
        cleaned = observe.redact(text)
        for secret in (KEY, TOKEN, URL, "neon-api-key-value-123"):
            self.assertNotIn(secret, cleaned)
        line = observe.record({"step": "x", "body": {"key": KEY}, "note": URL})
        self.assertNotIn("body", json.loads(line))
        self.assertNotIn(URL, line)


    def test_api_errors_are_named_not_raised(self):
        def fail():
            raise urllib.error.URLError("timed out")

        self.assertEqual(observe.safe(fail), "error:URLError")
        self.assertEqual(observe.safe(lambda: "idle"), "idle")


class NeonTest(unittest.TestCase):
    def test_reads_the_primary_compute_state_and_usage(self):
        opener = Opener({"endpoints": [{"type": "read_only", "current_state": "active"},
                                       {"type": "read_write", "current_state": "idle"}]},
                        {"project": {"active_time_seconds": 120, "compute_time_seconds": 30, "name": "x"}})
        neon = observe.Neon("neon-api-key-value-123", "proj-1", opener=opener)
        self.assertEqual(neon.state(), "idle")
        self.assertEqual(neon.usage(), {"active_time_seconds": 120, "compute_time_seconds": 30})
        sent = opener.requests[0]
        self.assertEqual(sent.full_url, "https://console.neon.tech/api/v2/projects/proj-1/endpoints")
        self.assertEqual(sent.get_header("Authorization"), "Bearer neon-api-key-value-123")

    def test_wait_polls_only_the_control_plane_until_idle(self):
        states = iter(["active", "active", "idle"])
        neon = observe.Neon("k", "p", opener=None)
        neon.state = lambda: next(states)
        slept = []
        self.assertEqual(neon.wait_for("idle", timeout=600, interval=30, sleep=slept.append, clock=lambda: 30 * len(slept)), "idle")
        self.assertEqual(slept, [30, 30])


    def test_active_time_comes_from_the_state_changes(self):
        records = [{"step": "neon-watch-start", "at": 0}, {"step": "neon-state", "at": 0, "state": "idle"},
                   {"step": "neon-state", "at": 100, "state": "active"}, {"step": "neon-state", "at": 400, "state": "idle"},
                   {"step": "neon-state", "at": 1000, "state": "init"}, {"step": "neon-watch-end", "at": 1060}]
        self.assertEqual(observe.non_idle_seconds(records), 360.0)


    def test_time_inside_a_sleep_gap_is_unknown_not_active(self):
        records = [{"step": "neon-state", "at": 0, "state": "active"},
                   {"step": "neon-gap", "at": 1000, "from": 100, "to": 1000},
                   {"step": "neon-state", "at": 1000, "state": "active"},
                   {"step": "neon-state", "at": 1100, "state": "idle"}, {"step": "neon-watch-end", "at": 1200}]
        self.assertEqual(observe.non_idle_seconds(records), 200.0)
        self.assertEqual(observe.gap_seconds(records), 900.0)

    def test_watch_marks_a_sleep_gap_and_logs_the_state_again(self):
        now, steps, sleeps = [0.0], [], iter([60, 3600, 60])
        neon = observe.Neon("k", "p", opener=None)
        neon.endpoint = lambda: {"type": "read_write", "current_state": "idle", "last_active": "t0"}
        neon.usage = lambda: {"active_time_seconds": 1}
        observe.watch(neon, hours=3700 / 3600, interval=60, emit_fn=lambda e: steps.append(e["step"]),
                      sleep=lambda s: now.__setitem__(0, now[0] + next(sleeps)), clock=lambda: now[0])
        self.assertEqual(steps, ["neon-watch-start", "neon-state", "neon-gap", "neon-state", "neon-watch-end"])

    def test_watch_writes_its_end_line_even_when_usage_fails(self):
        def fail():
            raise urllib.error.URLError("timed out")

        neon, entries = observe.Neon("k", "p", opener=None), []
        neon.usage = fail
        observe.watch(neon, hours=0, interval=60, emit_fn=entries.append, sleep=lambda s: None, clock=lambda: 0.0)
        self.assertEqual([e["step"] for e in entries], ["neon-watch-start", "neon-watch-end"])
        self.assertEqual(entries[-1]["usage_error"], "error:URLError")


class DatabaseTest(unittest.TestCase):
    def test_password_reaches_libpq_through_the_environment(self):
        env = observe.pg_env(URL)
        self.assertEqual(env, {"PGHOST": "ep-x-123.us-east-2.aws.neon.tech", "PGPORT": "5432", "PGUSER": "owner",
                               "PGPASSWORD": "p@ss", "PGDATABASE": "neondb", "PGSSLMODE": "require",
                               "PGCONNECT_TIMEOUT": "15"})
        with self.assertRaises(ValueError):
            observe.pg_env("https://example.test/db")

    def test_queries_accept_only_a_key_hash_and_a_number(self):
        sql = observe.sql_text("spend-count", HASH, since=1700000000.5)
        self.assertIn(f"api_key = '{HASH}'", sql)
        self.assertIn("to_timestamp(1700000000.5)", sql)
        for bad in ("' OR 1=1 --", "A" * 64, "0" * 63, None):
            with self.assertRaises(ValueError):
                observe.sql_text("key-state", bad)
        self.assertIn("information_schema.tables", observe.sql_text("tables"))

    def test_psql_gets_the_url_only_through_its_environment(self):
        seen = {}

        def run(argv, env, **kwargs):
            seen.update(argv=argv, env=env)
            return type("Done", (), {"stdout": "3|0.01\n"})()

        self.assertEqual(observe.psql("SELECT 1", URL, run=run), "3|0.01")
        self.assertNotIn("p@ss", " ".join(seen["argv"]))
        self.assertEqual(seen["env"]["PGPASSWORD"], "p@ss")


class MonitoringTest(unittest.TestCase):
    def test_sums_billable_instance_seconds_for_one_service(self):
        opener = Opener({"timeSeries": [{"points": [{"value": {"doubleValue": 12.5}}, {"value": {"doubleValue": 7.5}}]},
                                        {"points": [{"value": {"doubleValue": 5}}]}]})
        total = observe.billable_seconds("litellm-stg", "2026-10-10T00:00:00Z", "2026-10-11T00:00:00Z",
                                         "access-token", opener=opener)
        self.assertEqual(total, 25.0)
        url = opener.requests[0].full_url
        self.assertIn("run.googleapis.com%2Fcontainer%2Fbillable_instance_time", url)
        self.assertIn("litellm-stg", url)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 실패 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_observe.py' -v`
Expected: ERROR. `ModuleNotFoundError: No module named 'observe'`.

- [ ] **Step 3: 구현** (`services/shared-ai-host/poc/observe.py`)

Neon 상태 필드(`current_state`: `init`·`active`·`idle`)와 사용량 필드(`active_time_seconds`, `compute_time_seconds`)는 Neon API v2 스펙으로 확인했다(D1 확정). 사용량 값은 15분마다 갱신되고 반영까지 최대 1시간 늦으므로, 활성 시간은 `neon-watch` 상태 변화 기록으로 계산하고 사용량 값은 교차 확인에만 쓴다. Free 플랜에서는 consumption history API를 쓸 수 없어(403) 쓰지 않는다. LiteLLM 표 이름과 열 이름(`"LiteLLM_SpendLogs".api_key`·`"startTime"`, `"LiteLLM_VerificationToken".token`)은 1.102.1 `schema.prisma`로 확인했다. 예산 초기화 작업은 만료되지 않았고 `budget_reset_at < now`이며 `budget_duration`이 있는 키를 고른다(D1 확정).

```python
"""Phase 2 observation helpers (stdlib only): Neon compute state and usage, the staging
database through psql, and Cloud Run billable instance time. Output is redacted JSON lines.

Environment: NEON_API_KEY and NEON_PROJECT_ID (Neon), STG_DATABASE_URL (psql),
STG_ACCOUNT (the personal gcloud account for Monitoring). Values are never printed.
"""
import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

NEON_API = "https://console.neon.tech/api/v2"
MONITORING = "https://monitoring.googleapis.com/v3/projects/replay-live-508202/timeSeries"
PSQL = "/opt/homebrew/opt/libpq/bin/psql"
PATTERNS = [re.compile(p) for p in (r"sk-[A-Za-z0-9_-]{8,}",
                                    r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+",
                                    r"postgres(?:ql)?://\S+")]
SECRET_VALUES = set()
KEY_HASH = re.compile(r"[0-9a-f]{64}")
QUERIES = {
    "spend-count": 'SELECT count(*), coalesce(sum(spend), 0) FROM "LiteLLM_SpendLogs" '
                   'WHERE api_key = {hash} AND "startTime" >= to_timestamp({since})',
    "key-state": 'SELECT spend, max_budget, budget_duration, budget_reset_at FROM "LiteLLM_VerificationToken" '
                 "WHERE token = {hash}",
    "expire-budget": 'UPDATE "LiteLLM_VerificationToken" SET spend = 0.01, '
                     "budget_reset_at = now() - interval '1 hour' WHERE token = {hash} RETURNING budget_reset_at",
    "tables": "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'",
}


def register_secret(value):
    if value:
        SECRET_VALUES.add(value)


def redact(text):
    for value in sorted(SECRET_VALUES, key=len, reverse=True):
        text = text.replace(value, "[redacted]")
    for pattern in PATTERNS:
        text = pattern.sub("[redacted]", text)
    return text


def record(entry):
    """One JSON line; response bodies are never recorded in full."""
    return redact(json.dumps({k: v for k, v in entry.items() if k != "body"}, ensure_ascii=False, sort_keys=True))


def emit(entry):
    print(record({"at": round(time.time(), 3), **entry}), flush=True)


def safe(fn):
    """Call fn; on a network or API error return the error name so long runs keep going."""
    try:
        return fn()
    except (OSError, ValueError, KeyError, StopIteration) as error:  # URLError is an OSError
        return "error:" + type(error).__name__


class Neon:
    """Read-only Neon control-plane calls. Neon does not document whether listing endpoints
    wakes an idle compute; 7-5 checks it (last_active must not move while polling)."""

    def __init__(self, api_key, project_id, opener=None):
        register_secret(api_key)
        self.api_key, self.project_id = api_key, project_id
        self.opener = opener or urllib.request.build_opener()

    def _get(self, path):
        request = urllib.request.Request(NEON_API + path, headers={
            "Authorization": "Bearer " + self.api_key, "Accept": "application/json"})
        with self.opener.open(request, timeout=30) as response:
            return json.loads(response.read())

    def endpoint(self):
        endpoints = self._get(f"/projects/{self.project_id}/endpoints")["endpoints"]
        return next(e for e in endpoints if e["type"] == "read_write")

    def state(self):
        return self.endpoint()["current_state"]

    def usage(self):
        project = self._get(f"/projects/{self.project_id}")["project"]
        return {k: project[k] for k in ("active_time_seconds", "compute_time_seconds") if k in project}

    def wait_for(self, wanted, timeout, interval=30, sleep=time.sleep, clock=time.monotonic):
        start = clock()
        while True:
            state = safe(self.state)
            if state == wanted or clock() - start >= timeout:
                return state
            sleep(interval)


def neon_from_env():
    if not (os.environ.get("NEON_API_KEY") and os.environ.get("NEON_PROJECT_ID")):
        return None
    return Neon(os.environ["NEON_API_KEY"], os.environ["NEON_PROJECT_ID"])


def non_idle_seconds(records, end=None):
    """Seconds the compute was not idle, from neon-watch lines (state changes with times).
    Time inside neon-gap lines (the watcher was not polling) is unknown, so it is left out
    here and reported by gap_seconds()."""
    changes = sorted((r["at"], r["state"]) for r in records if r.get("step") == "neon-state")
    gaps = [(r["from"], r["to"]) for r in records if r.get("step") == "neon-gap"]
    end = end if end is not None else max([r["at"] for r in records] or [0])
    total = 0.0
    for (at, state), (next_at, _) in zip(changes, changes[1:] + [(end, None)]):
        if state != "idle":
            unknown = sum(max(0.0, min(next_at, stop) - max(at, start)) for start, stop in gaps)
            total += max(0.0, next_at - at - unknown)
    return total


def gap_seconds(records):
    return float(sum(r["to"] - r["from"] for r in records if r.get("step") == "neon-gap"))


def watch(neon, hours, interval, emit_fn=emit, sleep=time.sleep, clock=time.time):
    """Log Neon state changes for `hours` of wall-clock time. A poll gap over three intervals
    (laptop asleep, process stopped) is logged as neon-gap and the state is logged again, so
    unknown time is never counted as a known state. Start and end lines are always written."""
    def usage():
        result = safe(neon.usage)
        return {"usage_error": result} if isinstance(result, str) else result

    emit_fn({"step": "neon-watch-start", **usage()})
    deadline, last, last_poll = clock() + hours * 3600, None, None
    while clock() < deadline:
        now = clock()
        if last_poll is not None and now - last_poll > 3 * interval:
            emit_fn({"step": "neon-gap", "from": last_poll, "to": now})
            last = None
        last_poll = now
        endpoint = safe(neon.endpoint)
        if isinstance(endpoint, str):
            emit_fn({"step": "neon-error", "error": endpoint})
        else:
            seen = (endpoint["current_state"], endpoint.get("last_active"))
            if seen != last:  # an unchanged last_active while idle shows polling does not wake it
                emit_fn({"step": "neon-state", "state": seen[0], "last_active": seen[1]})
                last = seen
        sleep(interval)
    emit_fn({"step": "neon-watch-end", **usage()})


def pg_env(url):
    """libpq settings for a postgres URL, so the password never reaches argv."""
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("postgres", "postgresql") or not parts.hostname:
        raise ValueError("not a postgres URL")
    query = dict(urllib.parse.parse_qsl(parts.query))
    env = {"PGHOST": parts.hostname, "PGPORT": str(parts.port or 5432),
           "PGUSER": urllib.parse.unquote(parts.username or ""),
           "PGPASSWORD": urllib.parse.unquote(parts.password or ""),
           "PGDATABASE": parts.path.lstrip("/") or "postgres", "PGSSLMODE": query.get("sslmode", "require")}
    if "connect_timeout" in query:
        env["PGCONNECT_TIMEOUT"] = query["connect_timeout"]
    return env


def sql_text(name, key_hash=None, since=0.0):
    query = QUERIES[name]
    if "{hash}" in query and not KEY_HASH.fullmatch(key_hash or ""):
        raise ValueError("key hash must be 64 lowercase hex characters")
    return query.format(hash=f"'{key_hash}'", since=repr(float(since)))


def psql(sql, url, run=subprocess.run):
    register_secret(url)
    done = run([PSQL, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql],
               env={**os.environ, **pg_env(url)}, check=True, capture_output=True, text=True)
    return done.stdout.strip()


def billable_seconds(service, start, end, access_token, opener=None):
    """Billable instance seconds of one Cloud Run service over [start, end] (RFC 3339)."""
    register_secret(access_token)
    query = urllib.parse.urlencode({
        "filter": 'metric.type="run.googleapis.com/container/billable_instance_time" '
                  f'AND resource.labels.service_name="{service}"',
        "interval.startTime": start, "interval.endTime": end,
        "aggregation.alignmentPeriod": "3600s", "aggregation.perSeriesAligner": "ALIGN_SUM"})
    request = urllib.request.Request(MONITORING + "?" + query, headers={"Authorization": "Bearer " + access_token})
    with (opener or urllib.request.build_opener()).open(request, timeout=30) as response:
        series = json.loads(response.read()).get("timeSeries", [])
    return float(sum(point["value"].get("doubleValue", 0) for s in series for point in s["points"]))


def access_token():
    argv = ["gcloud", "auth", "print-access-token"]
    if os.environ.get("STG_ACCOUNT"):
        argv.append("--account=" + os.environ["STG_ACCOUNT"])
    return subprocess.run(argv, check=True, capture_output=True, text=True).stdout.strip()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("neon-state")
    watch = sub.add_parser("neon-watch", help="log Neon state changes; usage at start and end")
    watch.add_argument("--hours", type=float, required=True)
    watch.add_argument("--interval", type=float, default=60)
    active = sub.add_parser("neon-active", help="non-idle seconds in a neon-watch log")
    active.add_argument("file")
    wait = sub.add_parser("neon-wait-idle")
    wait.add_argument("--timeout-minutes", type=float, default=15)
    sql = sub.add_parser("sql")
    sql.add_argument("query", choices=sorted(QUERIES))
    sql.add_argument("--key-hash")
    sql.add_argument("--since", type=float, default=0.0)
    usage = sub.add_parser("run-usage")
    usage.add_argument("--start", required=True)
    usage.add_argument("--end", required=True)
    args = parser.parse_args(argv)
    if args.command == "sql":
        emit({"step": "sql", "query": args.query, "result": psql(sql_text(args.query, args.key_hash, args.since),
                                                                  os.environ["STG_DATABASE_URL"])})
        return
    if args.command == "neon-active":
        records = [json.loads(line) for line in open(args.file) if line.strip()]
        emit({"step": "neon-active", "file": os.path.basename(args.file), "active_seconds": non_idle_seconds(records),
              "unknown_seconds": gap_seconds(records)})
        return
    if args.command == "run-usage":
        token = access_token()
        for service in ("litellm-stg", "shared-ai-stg"):
            emit({"step": "run-usage", "service": service, "start": args.start, "end": args.end,
                  "billable_seconds": billable_seconds(service, args.start, args.end, token)})
        return
    neon = neon_from_env()
    if neon is None:
        sys.exit("NEON_API_KEY and NEON_PROJECT_ID are required")
    if args.command == "neon-state":
        emit({"step": "neon-state", "state": neon.state(), **neon.usage()})
    elif args.command == "neon-wait-idle":
        emit({"step": "neon-wait-idle", "state": neon.wait_for("idle", args.timeout_minutes * 60)})
    elif args.command == "neon-watch":
        watch(neon, args.hours, args.interval)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 통과 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_observe.py' -v`
Expected: PASS 12/12.

- [ ] **Step 5: 커밋**

```bash
git add services/shared-ai-host/poc/observe.py services/shared-ai-host/tests/test_observe.py
git commit -m "feat(shared-ai): add Neon, database and Cloud Run observation helpers for the PoC"
```

### Task 5: HTTP 측정 하네스 `poc.py`

**Files:**
- Create: `services/shared-ai-host/poc/poc.py`, `services/shared-ai-host/tests/test_poc.py`

**Interfaces:**
- Consumes: 태스크 4의 `observe.register_secret`·`observe.record`·`observe.emit`·`observe.redact`·`observe.safe`·`observe.neon_from_env`·`Neon.state`·`Neon.wait_for`, 태스크 2의 스테이징 관리 경로, 태스크 1의 서비스 이름 `litellm-stg`.
- Produces: `poc.call(base, path, token, key, body=None, method=None, timeout=30, opener=None, content_type="application/json") -> dict`(`path`·`status`·`ms`, 성공 시 `body`, 네트워크 실패 시 `error`), `poc.stream(...) -> dict`(`events`·`done`·`first_ms`·`last_ms`), `poc.IdToken`(토큰의 `exp`를 벽시계로 보고 15분 전에 갱신), `poc.jwt_expiry(token) -> float | None`, `poc.cold_sample(base, token, key, path, body, neon, wait_seconds=900, call_fn=call) -> dict`, `poc.idle_neon_shutdown(base, token, key, neon, n, call_fn=call, gcloud_fn=None) -> dict`, `poc.key_hash(key) -> str`, `poc.write_secret_file(path, value)`, `poc.silent_wav()`, `poc.multipart(fields, files)`, `poc.percentile(values, p)`, `poc.stats(records) -> dict`, `poc.evaluate(summary) -> list[tuple[name, measured, limit, passed]]`, `poc.warm_trial(base, token, key, neon_state, idle_seconds, max_wait, ping_seconds=None, poll_seconds=30, ...) -> dict`. CLI: `smoke`, `probe`, `new-key --alias A --out PATH`, `cold --path {jev,chat} --confirm-paid`, `burst --n N [--every S] [--real]`, `features --tts-voice ID --confirm-paid`, `warm-neon [--db-idle-minutes 7] [--max-wait-minutes 12] [--ping-seconds 0]`, `shutdown --mode {idle-neon,stream}`, `stats FILE --step STEP`, `evaluate SUMMARY.json`.

- [ ] **Step 1: 실패하는 테스트 작성** (`services/shared-ai-host/tests/test_poc.py`)

```python
"""Unit tests for the staging PoC harness; no network, no gcloud."""
import base64
import http.client
import io
import json
import os
import stat
import sys
import tempfile
import unittest
import urllib.error
import wave
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "poc"))
import poc  # noqa: E402

KEY = "sk-" + "a" * 40
TOKEN = "eyJ" + "b" * 20 + "." + "c" * 20 + "." + "d" * 20


class Response(io.BytesIO):
    def __init__(self, status, body=b"", lines=None):
        super().__init__(body)
        self.status, self.lines = status, lines

    def __iter__(self):
        return iter(self.lines if self.lines is not None else super().readlines())

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class Opener:
    def __init__(self, outcome):
        self.outcome, self.requests = outcome, []

    def open(self, request, timeout):
        self.requests.append(request)
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


class FakeNeon:
    def __init__(self, events):
        self.events = events

    def wait_for(self, wanted, timeout, **kwargs):
        self.events.append(("wait", wanted))
        return wanted

    def state(self):
        self.events.append(("state",))
        return "idle"


class CallTest(unittest.TestCase):
    def test_cloud_run_and_litellm_credentials_travel_in_separate_headers(self):
        opener = Opener(Response(200, b'{"data": []}'))
        result = poc.call("https://edge.test/", "/llm/v1/models", TOKEN, KEY, opener=opener)
        sent = opener.requests[0]
        self.assertEqual(sent.full_url, "https://edge.test/llm/v1/models")
        self.assertEqual(sent.get_header("X-serverless-authorization"), "Bearer " + TOKEN)
        self.assertEqual(sent.get_header("Authorization"), "Bearer " + KEY)
        self.assertEqual((result["status"], result["body"]), (200, {"data": []}))

    def test_missing_credentials_are_omitted_not_sent_empty(self):
        opener = Opener(Response(403))
        poc.call("https://edge.test", "/llm/health/liveliness", "", "", opener=opener)
        self.assertIsNone(opener.requests[0].get_header("X-serverless-authorization"))
        self.assertIsNone(opener.requests[0].get_header("Authorization"))

    def test_errors_are_reported_and_records_stay_clean(self):
        denied = urllib.error.HTTPError("https://edge.test", 401, "denied", {}, io.BytesIO(b'{"error": "' + KEY.encode() + b'"}'))
        result = poc.call("https://edge.test", "/llm/v1/models", TOKEN, KEY, opener=Opener(denied))
        self.assertEqual(result["status"], 401)
        self.assertNotIn(KEY, poc.observe.record(result))
        failed = poc.call("https://edge.test", "/llm/v1/models", TOKEN, KEY, opener=Opener(urllib.error.URLError("timed out")))
        self.assertEqual((failed["status"], failed["error"]), (None, "URLError"))

    def test_a_truncated_body_is_a_failed_sample_not_a_crash(self):
        class Truncated(Response):
            def read(self):
                raise http.client.IncompleteRead(b"partial")

        result = poc.call("https://edge.test", "/llm/v1/models", TOKEN, KEY, opener=Opener(Truncated(200)))
        self.assertEqual((result["status"], result["error"]), (None, "IncompleteRead"))

    def test_a_stream_cut_mid_way_keeps_its_events(self):
        class Cut(Response):
            def __iter__(self):
                yield b'data: {"n": 1}\n'
                raise http.client.IncompleteRead(b"")

        ticks = iter([0.0, 0.5])
        result = poc.stream("https://edge.test", "/llm/v1/chat/completions", TOKEN, KEY, {"stream": True},
                            opener=Opener(Cut(200)), clock=lambda: next(ticks))
        self.assertEqual((result["status"], result["events"], result["done"], result["error"]),
                         (200, 1, False, "IncompleteRead"))

    def test_stream_reports_when_events_arrived(self):
        lines = [b'data: {"n": 1}\n', b"\n", b'data: {"n": 2}\n', b"\n", b"data: [DONE]\n"]
        ticks = iter([0.0, 0.5, 1.0, 1.5])
        result = poc.stream("https://edge.test", "/llm/v1/chat/completions", TOKEN, KEY, {"stream": True},
                            opener=Opener(Response(200, lines=lines)), clock=lambda: next(ticks))
        self.assertEqual(result, {"path": "/llm/v1/chat/completions", "status": 200, "events": 2, "done": True,
                                  "first_ms": 500, "last_ms": 1000})


class SecretHandlingTest(unittest.TestCase):
    def test_id_token_is_refreshed_before_it_expires(self):
        now, fetched = [0.0], iter([TOKEN, TOKEN + "x"])
        token = poc.IdToken(fetch=lambda: next(fetched), clock=lambda: now[0])
        self.assertEqual((token(), token()), (TOKEN, TOKEN))
        now[0] = 46 * 60
        self.assertEqual(token(), TOKEN + "x")
        self.assertNotIn(TOKEN, poc.observe.redact("token " + TOKEN))

    def test_a_cached_token_close_to_expiry_is_replaced(self):
        def jwt(exp):
            body = base64.urlsafe_b64encode(json.dumps({"exp": exp}).encode()).decode().rstrip("=")
            return "eyJhbGciOiJSUzI1NiJ9." + body + ".sig"

        fetched = iter([jwt(1000 + 600), jwt(1000 + 3600)])
        token = poc.IdToken(fetch=lambda: next(fetched), clock=lambda: 1000.0)
        first = token()
        self.assertNotEqual(token(), first)  # gcloud handed back a cached token with 10 minutes left

    def test_new_keys_go_to_a_private_file_and_only_their_hash_is_shown(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "key"
            poc.write_secret_file(path, KEY)
            self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
            with self.assertRaises(FileExistsError):
                poc.write_secret_file(path, KEY)
        self.assertRegex(poc.key_hash(KEY), r"^[0-9a-f]{64}$")


class PayloadTest(unittest.TestCase):
    def test_one_second_of_silence_is_a_valid_wav(self):
        with wave.open(io.BytesIO(poc.silent_wav()), "rb") as audio:
            self.assertEqual((audio.getnframes(), audio.getframerate(), audio.getnchannels()), (16000, 16000, 1))

    def test_multipart_carries_fields_and_the_file(self):
        body, content_type = poc.multipart({"model": "hanmadi-stt"}, [("file", "a.wav", "audio/wav", b"RIFF")])
        boundary = content_type.split("boundary=")[1]
        self.assertTrue(content_type.startswith("multipart/form-data; boundary="))
        self.assertIn(b'name="model"\r\n\r\nhanmadi-stt\r\n', body)
        self.assertIn(b'filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\nRIFF\r\n', body)
        self.assertTrue(body.endswith(f"--{boundary}--\r\n".encode()))


class GateTest(unittest.TestCase):
    def test_stats_use_nearest_rank_percentiles(self):
        records = [{"status": 200, "ms": ms} for ms in (1000, 2000, 3500, 4000)] + [{"status": None, "ms": 60000}]
        self.assertEqual(poc.stats(records), {"n": 5, "ok": 4, "p50_ms": 3500, "p95_ms": 60000,
                                              "max_ms": 60000, "over_3s_rate": 0.6})
        with self.assertRaises(ValueError):
            poc.percentile([], 95)

    def test_gate_criteria_follow_the_master_plan(self):
        verdicts = {name: passed for name, _, _, passed in poc.evaluate({
            "a_jev_p95_ms": 4800, "a_chat_p95_ms": 13000, "a_failures": 0, "a_chat_over_3s_rate": 0.4, "b_missing_spend": 0,
            "c_reset_missed": 0, "d_failures": 0, "e_failures": 1, "f_lost_spend": 0})}
        self.assertEqual(verdicts, {"a_jev_p95_ms": True, "a_chat_p95_ms": False, "a_failures": True, "a_chat_over_3s_rate": None,
                                    "b_missing_spend": True, "c_reset_missed": True, "d_failures": True,
                                    "e_failures": False, "f_lost_spend": True})
        self.assertIsNone(dict((n, p) for n, _, _, p in poc.evaluate({}))["a_jev_p95_ms"])


class MeasurementTest(unittest.TestCase):
    def test_warm_wait_touches_only_liveliness_until_the_measured_call(self):
        calls, states, clock = [], iter(["active", "active", "idle"]), [0.0]

        def fake_call(base, path, token, key, **kwargs):
            calls.append((path, bool(key)))
            return {"path": path, "status": 200, "ms": 5}

        result = poc.warm_trial("https://edge.test", lambda: TOKEN, KEY, neon_state=lambda: next(states),
                                idle_seconds=60, max_wait=900, ping_seconds=60, call_fn=fake_call,
                                sleep=lambda s: clock.__setitem__(0, clock[0] + s), clock=lambda: clock[0])
        self.assertEqual(calls, [("/llm/health/liveliness", False), ("/llm/health/liveliness", False),
                                 ("/llm/v1/chat/completions", True)])
        self.assertEqual((result["neon_before"], result["waited_s"], result["status"]), ("idle", 60, 200))

    def test_without_pings_the_wait_only_polls_neon(self):
        calls, clock = [], [0.0]
        poc.warm_trial("https://edge.test", lambda: TOKEN, KEY, neon_state=lambda: "idle", idle_seconds=90,
                       max_wait=900, ping_seconds=None,
                       call_fn=lambda base, path, token, key, **kw: calls.append(path) or {"path": path, "status": 200, "ms": 1},
                       sleep=lambda s: clock.__setitem__(0, clock[0] + s), clock=lambda: clock[0])
        self.assertEqual(calls, ["/llm/v1/chat/completions"])

    def test_cold_sample_waits_for_neon_to_idle_before_calling(self):
        events = []
        result = poc.cold_sample("https://edge.test", lambda: TOKEN, KEY, "/llm/typesafe/v1/systemone", {},
                                 FakeNeon(events), call_fn=lambda base, path, token, key, **kw:
                                 events.append(("call", path)) or {"path": path, "status": 200, "ms": 4100})
        self.assertEqual(events, [("wait", "idle"), ("call", "/llm/typesafe/v1/systemone")])
        self.assertEqual((result["neon_before"], result["status"]), ("idle", 200))

    def test_traffic_moves_to_the_prebuilt_revision_only_after_neon_idles(self):
        events = []
        result = poc.idle_neon_shutdown(
            "https://edge.test", lambda: TOKEN, KEY, FakeNeon(events), 2,
            call_fn=lambda base, path, token, key, **kw: events.append(("call", path)) or {"status": 200},
            gcloud_fn=lambda args: events.append(("gcloud", " ".join(args[:3]), "--no-traffic" in args)) or "done")
        self.assertEqual(events, [("gcloud", "run services update", True), ("call", "/llm/v1/chat/completions"),
                                  ("call", "/llm/v1/chat/completions"), ("wait", "idle"), ("state",),
                                  ("gcloud", "run services update-traffic", False)])
        self.assertEqual((result["ok"], result["neon_before"]), (2, "idle"))

    def test_neon_measurements_refuse_to_run_without_neon(self):
        with mock.patch.dict(os.environ, {"STG_EDGE": "https://edge.test", "STG_KEY": KEY}, clear=True):
            for argv in (["cold", "--path", "jev", "--confirm-paid"], ["warm-neon"], ["shutdown", "--mode", "idle-neon"]):
                with self.assertRaises(SystemExit):
                    poc.main(argv)

    def test_paid_commands_need_explicit_confirmation(self):
        for argv in (["features", "--tts-voice", "v"], ["cold", "--path", "jev"]):
            with self.assertRaises(SystemExit):
                poc.main(argv)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 실패 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_poc.py' -v`
Expected: ERROR. `ModuleNotFoundError: No module named 'poc'`(저장소 루트에서 실행해야 한다. `services/shared-ai-host`에서 실행하면 `poc/` 디렉터리가 namespace package로 잡혀 테스트마다 `AttributeError`가 난다).

- [ ] **Step 3: 구현** (`services/shared-ai-host/poc/poc.py`)

가상 키는 sha256 hex로 저장·기록된다(D1 확정, master key 호출은 해시 대신 별칭으로 남는다). `new-key`는 시험 키에 `max_budget` $0.05, `budget_duration` 30d, `duration` 7d, `metadata.allow_client_mock_response`를 준다. JEV 본문은 `packages/litellm-client/jev.mjs`가 만드는 형태(`model`·`state`·`questions`)와 같다. `shutdown`은 두 모드 모두 다음 리비전을 트래픽 없이 먼저 배포한다. 새 리비전이 기동하면서 DB에 연결해 Neon을 깨우기 때문이다. `idle-neon`은 그 뒤 호출 → Neon 정지 대기 → 트래픽만 이동 순서로 진행해, 옛 인스턴스의 종료 flush가 정지한 Neon을 처음 깨우게 한다. `stream`은 스트리밍 응답 도중에 트래픽을 옮긴다. 처리 중인 요청은 끝까지 처리된다(D1 확정, 예외적으로 처리 중 SIGTERM 가능). `cold`·`warm-neon`·`shutdown --mode idle-neon`은 Neon API 정보가 없으면 시작하지 않는다. 끊긴 응답(`http.client.HTTPException`)은 실패 샘플로 기록한다.

```python
"""Phase 2 staging PoC harness (stdlib only). Never prints keys, ID tokens or DB URLs.

Environment: STG_EDGE (staging edge URL); STG_KEY_FILE (a 0600 file holding a test key) or
STG_KEY (the master key, for new-key only); STG_ACCOUNT (personal gcloud account for the
Cloud Run ID token, refreshed before it expires); NEON_API_KEY and NEON_PROJECT_ID where a
measurement needs the Neon compute state. Output is redacted JSON lines.
"""
import argparse
import base64
import hashlib
import http.client
import io
import json
import math
import os
import secrets
import subprocess
import threading
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

import observe

CHAT_PATH = "/llm/v1/chat/completions"
JEV_PATH = "/llm/typesafe/v1/systemone"
NATIVE_PATH = "/llm/v1beta/models/hanmadi-chat:generateContent"
LIVELINESS = "/llm/health/liveliness"
CHAT = {"model": "hanmadi-chat", "max_tokens": 1, "messages": [{"role": "user", "content": "ping"}]}
# Honored only for keys whose metadata sets allow_client_mock_response (new-key does); otherwise
# LiteLLM drops the field and max_tokens keeps the provider call to one token.
MOCK = {"model": "hanmadi-chat", "mock_response": "pong", "max_tokens": 1, "messages": [{"role": "user", "content": "ping"}]}
LONG_STREAM = {"model": "hanmadi-chat", "max_tokens": 800, "stream": True,
               "messages": [{"role": "user", "content": "Write about 500 words on the history of tea."}]}
# Same shape as packages/litellm-client/jev.mjs builds.
JEV = {"model": "jev-1.13.0", "state": "A connectivity test for a staging gateway.",
       "questions": {"ok": {"type": "noul", "instructions": "Is this text a connectivity test?"}}}
NATIVE = {"contents": [{"role": "user", "parts": [{"text": "Reply with OK"}]}], "generationConfig": {"maxOutputTokens": 4}}
# Master plan Phase 2 gate; None is recorded but not judged (Festa shadow 3 s).
CRITERIA = {"a_jev_p95_ms": 5000, "a_chat_p95_ms": 12000, "a_failures": 0, "a_chat_over_3s_rate": None,
            "b_missing_spend": 0, "c_reset_missed": 0, "d_failures": 0, "e_failures": 0, "f_lost_spend": 0}
GCLOUD_SCOPE = ["--region=us-central1", "--project=replay-live-508202", "--quiet"]


def headers(token, key, content_type="application/json"):
    result = {"Content-Type": content_type}
    if token:
        result["X-Serverless-Authorization"] = "Bearer " + token
    if key:
        result["Authorization"] = "Bearer " + key
    return result


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def _request(base, path, token, key, body, method, content_type):
    data = body if body is None or isinstance(body, bytes) else json.dumps(body).encode()
    return urllib.request.Request(base.rstrip("/") + path, data=data, headers=headers(token, key, content_type),
                                  method=method or ("POST" if data is not None else "GET"))


def call(base, path, token, key, body=None, method=None, timeout=30, opener=None, content_type="application/json"):
    request = _request(base, path, token, key, body, method, content_type)
    start = time.monotonic()
    try:
        with (opener or urllib.request.build_opener(NoRedirect)).open(request, timeout=timeout) as response:
            raw, status = response.read(), response.status
    except urllib.error.HTTPError as error:
        with error:
            raw, status = error.read(), error.code
    except (urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException) as error:
        return {"path": path, "status": None, "ms": round((time.monotonic() - start) * 1000),
                "error": type(error).__name__}
    result = {"path": path, "status": status, "ms": round((time.monotonic() - start) * 1000)}
    try:
        result["body"] = json.loads(raw)
    except ValueError:
        result["body"] = None
    return result


def stream(base, path, token, key, body, timeout=120, opener=None, clock=time.monotonic):
    """POST a streaming request and report when its SSE events arrived (flush check)."""
    request = _request(base, path, token, key, body, "POST", "application/json")
    start, first, last, events, done, status = clock(), None, None, 0, False, None
    try:
        with (opener or urllib.request.build_opener(NoRedirect)).open(request, timeout=timeout) as response:
            status = response.status
            for line in response:
                if line.startswith(b"data: [DONE]"):
                    done = True
                elif line.startswith(b"data:"):
                    now = clock()
                    first = now if first is None else first
                    last, events = now, events + 1
    except urllib.error.HTTPError as error:
        error.close()
        return {"path": path, "status": error.code, "events": events, "done": False}
    except (urllib.error.URLError, TimeoutError, OSError, http.client.HTTPException) as error:
        return {"path": path, "status": status, "events": events, "done": False, "error": type(error).__name__}
    ms = (lambda t: None if t is None else round((t - start) * 1000))
    return {"path": path, "status": status, "events": events, "done": done, "first_ms": ms(first), "last_ms": ms(last)}


def jwt_expiry(token):
    """The exp claim of a JWT, or None when the token cannot be read."""
    try:
        payload = token.split(".")[1]
        return float(json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))["exp"])
    except (IndexError, ValueError, KeyError, TypeError):
        return None


class IdToken:
    """Cloud Run ID token from the personal gcloud account, renewed 15 minutes before it expires.
    gcloud may hand back a cached token, so the expiry comes from the token itself, and wall-clock
    time keeps the check right across laptop sleep."""
    MARGIN = 15 * 60

    def __init__(self, fetch=None, clock=time.time):
        self.fetch, self.clock, self.value, self.expires = fetch or self._gcloud, clock, None, 0.0

    @staticmethod
    def _gcloud():
        argv = ["gcloud", "auth", "print-identity-token"]
        if os.environ.get("STG_ACCOUNT"):
            argv.append("--account=" + os.environ["STG_ACCOUNT"])
        return subprocess.run(argv, check=True, capture_output=True, text=True).stdout.strip()

    def __call__(self):
        if self.value is None or self.clock() >= self.expires - self.MARGIN:
            self.value = self.fetch()
            self.expires = jwt_expiry(self.value) or self.clock() + 3600
            observe.register_secret(self.value)
        return self.value


def key_hash(key):
    """LiteLLM stores and logs virtual keys as their sha256 hex digest."""
    return hashlib.sha256(key.encode()).hexdigest()


def write_secret_file(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write(value)


def silent_wav(seconds=1, rate=16000):
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(b"\0\0" * rate * seconds)
    return buffer.getvalue()


def multipart(fields, files):
    boundary = "poc" + secrets.token_hex(12)
    parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
             for name, value in fields.items()]
    parts += [f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
              f"Content-Type: {content_type}\r\n\r\n".encode() + data + b"\r\n"
              for name, filename, content_type, data in files]
    return b"".join(parts) + f"--{boundary}--\r\n".encode(), "multipart/form-data; boundary=" + boundary


def percentile(values, p):
    ordered = sorted(values)
    if not ordered:
        raise ValueError("no samples")
    return ordered[max(0, math.ceil(p / 100 * len(ordered)) - 1)]


def stats(records):
    """Latency summary; a failed request counts at its elapsed time, never dropped."""
    times = [r["ms"] for r in records]
    return {"n": len(records), "ok": sum(r["status"] == 200 for r in records), "p50_ms": percentile(times, 50),
            "p95_ms": percentile(times, 95), "max_ms": max(times),
            "over_3s_rate": round(sum(t > 3000 or r["status"] != 200 for t, r in zip(times, records)) / len(records), 3)}


def evaluate(summary):
    return [(name, summary.get(name), limit,
             None if limit is None or name not in summary else summary[name] <= limit)
            for name, limit in CRITERIA.items()]


def warm_trial(base, token, key, neon_state, idle_seconds, max_wait, ping_seconds=None, poll_seconds=30,
               call_fn=call, sleep=time.sleep, clock=time.monotonic):
    """Wait until Neon has idled while LiteLLM stays up, then measure one keyed request.

    Optional liveliness pings (no key, no database) keep the instance warm; without them the
    instance lives only as long as Cloud Run's idle retention.
    """
    start = last_ping = clock()
    if ping_seconds:
        call_fn(base, LIVELINESS, token(), "")
    while True:
        state, waited = neon_state(), clock() - start
        if (waited >= idle_seconds and state == "idle") or waited >= max_wait:
            break
        sleep(poll_seconds)
        if ping_seconds and clock() - last_ping >= ping_seconds:
            call_fn(base, LIVELINESS, token(), "")
            last_ping = clock()
    return {"step": "warm-neon", "neon_before": state, "waited_s": round(waited),
            **call_fn(base, CHAT_PATH, token(), key, body=MOCK)}


def cold_sample(base, token, key, path, body, neon, wait_seconds=900, call_fn=call):
    """One cold-path sample: wait (control plane only) until Neon has idled, then call. The
    instance from the previous sample flushes on scale-down and wakes the database again."""
    start = time.time()
    state = neon.wait_for("idle", timeout=wait_seconds)
    return {"neon_before": state, "neon_waited_s": round(time.time() - start),
            **call_fn(base, path, token(), key, body=body, timeout=60)}


def idle_neon_shutdown(base, token, key, neon, n, call_fn=call, gcloud_fn=None):
    """(f) with a suspended database: deploy the next revision without traffic first (its startup
    connects to the database), send n calls to the serving revision, wait until Neon idles, then
    move traffic only. The old instance's SIGTERM flush is then the first thing to wake Neon."""
    gcloud_fn = gcloud_fn or gcloud
    started = time.time()
    deploy = gcloud_fn(["run", "services", "update", "litellm-stg", "--no-traffic",
                        f"--update-env-vars=POC_REV={int(started)}"])
    ok = sum(call_fn(base, CHAT_PATH, token(), key, body=MOCK)["status"] == 200 for _ in range(n))
    waited = neon.wait_for("idle", timeout=900)  # control plane only; LiteLLM gets no CPU meanwhile
    before = observe.safe(neon.state)
    switch = gcloud_fn(["run", "services", "update-traffic", "litellm-stg", "--to-latest"])
    return {"step": "shutdown", "mode": "idle-neon", "started": started, "sent": n, "ok": ok,
            "neon_waited": waited, "neon_before": before, "deploy": deploy, "switch": switch}


def gcloud(args, run=subprocess.run):
    done = run(["gcloud", *args, *GCLOUD_SCOPE], check=True, capture_output=True, text=True)
    lines = (done.stderr or "").strip().splitlines()
    return observe.redact(lines[-1] if lines else "")


def load_key():
    if os.environ.get("STG_KEY_FILE"):
        return Path(os.environ["STG_KEY_FILE"]).read_text().strip()
    return os.environ["STG_KEY"]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("smoke")
    sub.add_parser("probe")
    new_key = sub.add_parser("new-key")
    new_key.add_argument("--alias", required=True)
    new_key.add_argument("--out", required=True)
    cold = sub.add_parser("cold")
    cold.add_argument("--path", choices=["jev", "chat"], required=True)
    cold.add_argument("--samples", type=int, default=10)
    cold.add_argument("--gap-minutes", type=float, default=20)
    cold.add_argument("--initial-wait-minutes", type=float, default=0)
    cold.add_argument("--confirm-paid", action="store_true")
    burst = sub.add_parser("burst")
    burst.add_argument("--n", type=int, required=True)
    burst.add_argument("--every", type=float, default=0, help="seconds between calls")
    burst.add_argument("--real", action="store_true", help="max_tokens 1 provider calls instead of mock_response")
    features = sub.add_parser("features")
    features.add_argument("--tts-voice", required=True)
    features.add_argument("--confirm-paid", action="store_true")
    warm = sub.add_parser("warm-neon")
    warm.add_argument("--trials", type=int, default=10)
    warm.add_argument("--db-idle-minutes", type=float, default=7)
    warm.add_argument("--max-wait-minutes", type=float, default=12, help="stay under Cloud Run's 15-minute idle retention")
    warm.add_argument("--ping-seconds", type=float, default=0, help="liveliness pings; 0 (default) sends none")
    shutdown = sub.add_parser("shutdown")
    shutdown.add_argument("--mode", choices=["idle-neon", "stream"], required=True)
    shutdown.add_argument("--n", type=int, default=10)
    shutdown.add_argument("--confirm-paid", action="store_true")
    report = sub.add_parser("stats")
    report.add_argument("file")
    report.add_argument("--step", required=True)
    gate = sub.add_parser("evaluate")
    gate.add_argument("summary")
    args = parser.parse_args(argv)
    if args.command in ("features", "cold") or (args.command == "shutdown" and args.mode == "stream"):
        if not args.confirm_paid:
            parser.error(f"{args.command} makes paid provider calls; pass --confirm-paid after approval")
    if args.command == "stats":
        records = [json.loads(line) for line in Path(args.file).read_text().splitlines() if line.strip()]
        observe.emit({"step": "stats", "of": args.step, **stats([r for r in records if r.get("step") == args.step])})
        return
    if args.command == "evaluate":
        for name, measured, limit, passed in evaluate(json.loads(Path(args.summary).read_text())):
            observe.emit({"criterion": name, "measured": measured, "limit": limit, "passed": passed})
        return
    neon = observe.neon_from_env()
    if neon is None and (args.command in ("cold", "warm-neon") or getattr(args, "mode", None) == "idle-neon"):
        parser.error(f"{args.command} needs NEON_API_KEY and NEON_PROJECT_ID to confirm the compute idled")
    base, token = os.environ["STG_EDGE"], IdToken()
    key = "" if args.command == "probe" else load_key()  # the probe needs no LiteLLM key
    observe.register_secret(key)
    if args.command == "smoke":
        observe.emit({"step": "no-id-token", **call(base, "/llm/v1/models", "", key)})
        observe.emit({"step": "bad-key", **call(base, "/llm/v1/models", token(), "sk-invalid-poc-key")})
        observe.emit({"step": "models", **call(base, "/llm/v1/models", token(), key)})
        observe.emit({"step": "liveliness", **call(base, LIVELINESS, token(), "")})
        observe.emit({"step": "closed-admin", **call(base, "/llm/key/update", token(), key, body={})})
        mock = call(base, CHAT_PATH, token(), key, body=MOCK)
        choices = (mock.get("body") or {}).get("choices") or [{}]
        observe.emit({"step": "mock", "content": choices[0].get("message", {}).get("content"), **mock})
    elif args.command == "probe":
        for path, body in ((CHAT_PATH, CHAT), (JEV_PATH, JEV), (NATIVE_PATH, NATIVE)):
            data = json.dumps(body).encode()
            result = call(base, path, token(), "", body=data)
            seen = result.get("body") if isinstance(result.get("body"), dict) else {}
            observe.emit({"step": "probe", "sent_length": len(data), "seen": seen,
                          "ok": seen.get("content_length") == str(len(data)) and seen.get("path") == path[len("/llm"):],
                          **result})
    elif args.command == "new-key":
        result = call(base, "/llm/key/generate", token(), key, body={
            "key_alias": args.alias, "max_budget": 0.05, "budget_duration": "30d", "duration": "7d",
            "metadata": {"allow_client_mock_response": True}})
        created = (result.get("body") or {}).get("key") if result["status"] == 200 else None
        if created:
            observe.register_secret(created)
            write_secret_file(args.out, created)
        observe.emit({"step": "new-key", "alias": args.alias, "key_hash": created and key_hash(created), **result})
    elif args.command == "cold":
        path, body = (JEV_PATH, JEV) if args.path == "jev" else (CHAT_PATH, CHAT)
        time.sleep(args.initial_wait_minutes * 60)
        for sample in range(args.samples):
            if sample:
                time.sleep(args.gap_minutes * 60)
            observe.emit({"step": "cold-" + args.path, "sample": sample,
                          **cold_sample(base, token, key, path, body, neon)})
    elif args.command == "burst":
        started = time.time()
        for sent in range(args.n):
            if sent and args.every:
                time.sleep(args.every)
            observe.emit({"step": "burst", "started": started, **call(base, CHAT_PATH, token(), key,
                                                                         body=CHAT if args.real else MOCK)})
    elif args.command == "features":
        wav, content_type = multipart({"model": "hanmadi-stt"}, [("file", "silence.wav", "audio/wav", silent_wav())])
        cases = [("jev", JEV_PATH, JEV, "application/json"), ("gemini-native", NATIVE_PATH, NATIVE, "application/json"),
                 ("json-schema", CHAT_PATH, {"model": "hanmadi-chat", "max_tokens": 20,
                                             "messages": [{"role": "user", "content": "Return ok=true"}],
                                             "response_format": {"type": "json_schema", "json_schema": {"name": "r", "schema": {
                                                 "type": "object", "properties": {"ok": {"type": "boolean"}},
                                                 "required": ["ok"]}}}}, "application/json"),
                 ("tts", "/llm/v1/audio/speech", {"model": "hanmadi-tts", "voice": args.tts_voice, "input": "테스트",
                                                  "response_format": "mp3"}, "application/json"),
                 ("stt", "/llm/v1/audio/transcriptions", wav, content_type)]
        for name, path, body, ctype in cases:
            observe.emit({"step": "feature", "feature": name,
                          **call(base, path, token(), key, body=body, timeout=60, content_type=ctype)})
        observe.emit({"step": "feature", "feature": "stream", **stream(base, CHAT_PATH, token(), key, LONG_STREAM)})
    elif args.command == "warm-neon":
        observe.emit({"step": "warm-prime", **call(base, CHAT_PATH, token(), key, body=MOCK)})
        for trial in range(args.trials):
            observe.emit({"trial": trial, **warm_trial(base, token, key, lambda: observe.safe(neon.state),
                                                       args.db_idle_minutes * 60, args.max_wait_minutes * 60,
                                                       args.ping_seconds or None)})
    elif args.command == "shutdown":
        started = time.time()
        if args.mode == "idle-neon":
            observe.emit(idle_neon_shutdown(base, token, key, neon, args.n))
        else:
            gcloud(["run", "services", "update", "litellm-stg", "--no-traffic", f"--update-env-vars=POC_REV={int(started)}"])
            out = {}
            worker = threading.Thread(target=lambda: out.update(stream(base, CHAT_PATH, token(), key, LONG_STREAM)))
            worker.start()
            time.sleep(1)
            switched = gcloud(["run", "services", "update-traffic", "litellm-stg", "--to-latest"])
            worker.join()
            observe.emit({"step": "shutdown", "mode": args.mode, "started": started, "sent": 1, "switch": switched,
                          "stream": out})


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 통과 확인**

Run: `python3 -W error::ResourceWarning -m unittest discover -s services/shared-ai-host/tests -p 'test_poc.py' -v`
Expected: PASS 19/19(argparse 오류 메시지 몇 줄은 유료 확인·Neon 필수 테스트의 정상 출력이다).

- [ ] **Step 5: 커밋**

```bash
git add services/shared-ai-host/poc/poc.py services/shared-ai-host/tests/test_poc.py
git commit -m "feat(shared-ai): add the stdlib staging PoC harness"
```

### Task 6: 운영 트래픽 기준 Neon 비용 추정 `neon_estimate.py`

**Files:**
- Create: `services/shared-ai-host/poc/neon_estimate.py`, `services/shared-ai-host/tests/test_neon_estimate.py`

**Interfaces:**
- Produces: `neon_estimate.db_touches(requests, shutdown_after=None, periodic=None, window=None) -> list`, `neon_estimate.sessions(requests, shutdown_after) -> int`(인스턴스 세션 수 = 콜드 스타트 수), `neon_estimate.active_seconds(touches, idle=300) -> float`, `neon_estimate.monthly_cost(active_seconds_per_day, cu=0.25, price=0.106, days=30.4) -> dict`. CLI: 표준 입력의 epoch 초(한 줄에 하나) → JSON 한 줄(`sessions_per_day` 포함). 옵션 `--days`(필수), `--idle`, `--shutdown-after`, `--periodic`.

- [ ] **Step 1: 실패하는 테스트 작성** (`services/shared-ai-host/tests/test_neon_estimate.py`)

```python
"""Unit tests for the Neon compute-hour estimate."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "poc"))
import neon_estimate as ne  # noqa: E402


class EstimateTest(unittest.TestCase):
    def test_disjoint_touches_each_keep_the_compute_up_for_the_idle_window(self):
        self.assertEqual(ne.active_seconds([0, 1000], idle=300), 600)

    def test_overlapping_windows_are_counted_once(self):
        self.assertEqual(ne.active_seconds([0, 100, 200], idle=300), 500)

    def test_each_instance_session_ends_with_a_shutdown_flush(self):
        self.assertEqual(ne.db_touches([2000, 0, 100], shutdown_after=900), [0, 100, 1000, 2000, 2900])

    def test_each_instance_session_is_one_cold_start(self):
        self.assertEqual(ne.sessions([2000, 0, 100], shutdown_after=900), 2)
        self.assertEqual(ne.sessions([], shutdown_after=900), 0)

    def test_a_warm_instance_touches_the_database_periodically(self):
        self.assertEqual(ne.db_touches([50], periodic=600, window=(0, 1800)), [0, 50, 600, 1200, 1800])

    def test_monthly_cost_at_minimum_compute(self):
        cost = ne.monthly_cost(12 * 3600)
        self.assertEqual(cost["cu_hours_per_month"], 91.2)
        self.assertEqual(cost["usd_per_month"], 9.67)
        self.assertTrue(cost["cloud_sql_cheaper"])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: 실패 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_neon_estimate.py' -v`
Expected: ERROR. `ModuleNotFoundError: No module named 'neon_estimate'`.

- [ ] **Step 3: 구현** (`services/shared-ai-host/poc/neon_estimate.py`)

```python
"""Estimate Neon compute hours for the litellm database from request times (stdlib only).

Neon suspends a compute `idle` seconds after its last query. LiteLLM queries the database
on a request (key lookup, spend write) and once more when an instance scales down (the
shutdown flush). A session ends `shutdown_after` seconds after its last request. With a
warm ping or a minimum instance, the instance never scales down, but background jobs may
query every `periodic` seconds (measured in Phase 2 g2).

Input: one epoch-seconds value per line on stdin. Output: one JSON object.
"""
import argparse
import json
import math
import sys

NEON_LAUNCH_USD_PER_CU_HOUR = 0.106
CLOUD_SQL_F1_MICRO_USD = 9.4


def db_touches(requests, shutdown_after=None, periodic=None, window=None):
    ordered = sorted(requests)
    touches = list(ordered)
    if shutdown_after is not None:
        touches += [a + shutdown_after for a, b in zip(ordered, ordered[1:] + [math.inf]) if b - a > shutdown_after]
    if periodic:
        start, end = window
        touches += [start + i * periodic for i in range(int((end - start) // periodic) + 1)]
    return sorted(touches)


def sessions(requests, shutdown_after):
    """Instance sessions in the request times: each one starts cold and ends with a flush."""
    ordered = sorted(requests)
    return sum(1 for a, b in zip(ordered, ordered[1:] + [math.inf]) if b - a > shutdown_after)


def active_seconds(touches, idle=300):
    total, end = 0.0, -math.inf
    for touch in sorted(touches):
        stop = touch + idle
        if stop > end:
            total += stop - max(touch, end)
            end = stop
    return total


def monthly_cost(active_seconds_per_day, cu=0.25, price=NEON_LAUNCH_USD_PER_CU_HOUR, days=30.4):
    hours = active_seconds_per_day / 3600 * days
    usd = round(hours * cu * price, 2)
    return {"active_hours_per_day": round(active_seconds_per_day / 3600, 2),
            "cu_hours_per_month": round(hours * cu, 1), "usd_per_month": usd,
            "cloud_sql_cheaper": usd > CLOUD_SQL_F1_MICRO_USD}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=float, required=True, help="length of the window the input covers")
    parser.add_argument("--idle", type=float, default=300, help="Neon suspend delay in seconds")
    parser.add_argument("--shutdown-after", type=float, help="seconds from a session's last request to its shutdown flush")
    parser.add_argument("--periodic", type=float, help="seconds between background queries of a warm instance")
    args = parser.parse_args(argv)
    stamps = [float(line) for line in sys.stdin if line.strip()]
    if not stamps:
        parser.error("no request times on stdin")
    end = max(stamps)
    touches = db_touches(stamps, args.shutdown_after, args.periodic, (end - args.days * 86400, end))
    per_day = active_seconds(touches, args.idle) / args.days
    # Cold starts per day (master plan (g)); a warm ping keeps one instance, so there is none to count.
    cold = None if args.shutdown_after is None else round(sessions(stamps, args.shutdown_after) / args.days, 1)
    print(json.dumps({"requests": len(stamps), "days": args.days, "shutdown_after": args.shutdown_after,
                      "periodic": args.periodic, "sessions_per_day": cold, **monthly_cost(per_day)}))


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 통과 확인**

Run: `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_neon_estimate.py' -v && printf '0\n100\n2000\n' | python3 services/shared-ai-host/poc/neon_estimate.py --days 1 --shutdown-after 900`
Expected: PASS 6/6, 그리고 `"sessions_per_day": 2.0`과 `"active_hours_per_day": 0.36`이 든 JSON 한 줄.

- [ ] **Step 5: 전체 테스트와 커밋**

Run: `python3 -W error::ResourceWarning -m unittest discover -s services/shared-ai-host/tests -p 'test_*.py'`
Expected: `Ran 71 tests` … `OK`.

```bash
git add services/shared-ai-host/poc/neon_estimate.py services/shared-ai-host/tests/test_neon_estimate.py
git commit -m "feat(shared-ai): estimate Neon compute hours from request times"
```

### Task 7: 운영 반영과 측정 (사용자 승인 필요)

태스크 1~6의 PR이 CI를 통과하고 머지된 뒤 실행한다. 승인은 두 묶음으로 받는다.

| 묶음 | 내용 | 비용 |
|---|---|---|
| A 준비 | 7-2 시크릿 채우기(VM `.env`의 공급자 키 3개 복사 포함), 7-3 `edge-staging` 재빌드, 7-4 Terraform apply 2회(10개 + 8개 추가), 7-5 마이그레이션 Job 실행·스모크·프로브(공급자 호출 없음, edge 리비전 교체 2회) | 유휴 비용 거의 0. 시크릿 활성 버전 7개 추가(무료 6개는 청구 계정 합산이라 월 최대 약 $0.42) |
| B 측정 | 7-6 측정 (a)~(g): 유료 호출 약 50건, `litellm-stg` 리비전 교체 4회, 스테이징 DB 쓰기(시험 키 예산 만료 설정 2회), Scheduler 재개·정지. 7-7 VM DB 읽기 전용 조회 2회 | 합계 $0.01 미만 예상(JEV 1건 약 $0.0002라는 기존 기록 기준, Gemini `max_tokens` 1~800, ElevenLabs 3글자·1초). 시험 키마다 $0.05 상한 |

유료 호출 내역: (a) JEV 10 + Hanmadi chat 10, (b) chat 20, (d) JEV·Gemini native·json_schema·TTS·STT·스트리밍 각 1, (f) 긴 스트리밍 2. 합계 48건이다. 스모크와 (c)(e)(f) 유휴 사례는 mock이라 공급자 호출이 없다(mock이 막혀 있으면 1토큰 호출로 바뀌어 약 40건이 늘어난다. 여전히 $0.001 미만).

**공통 환경.** 각 단계의 명령 앞에 둔다. 비밀값은 없다. `<시작일>`은 7-2를 시작한 날짜(YYYYMMDD)로 고정한다.

```bash
export STG_ACCOUNT=guswhd1085@gmail.com
export OUT="/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/claude 작업/tmp/<시작일>-p2-poc"
export KEYS="$HOME/.cak-p2-keys"
install -d -m 0700 "$KEYS"; mkdir -p "$OUT"
P=services/shared-ai-host/poc
secret() { gcloud secrets versions access 1 --secret="$1" --project=replay-live-508202; }
run_url() { gcloud run services describe "$1" --region=us-central1 --project=replay-live-508202 --format='value(status.url)'; }
# 7-4 이후: 시험 키 발급(별칭·해시만 출력), Neon·DB 접근 정보는 환경변수로만 넘긴다.
new_key() { STG_KEY="$(secret litellm-stg-master-key)" python3 $P/poc.py new-key --alias "$1" --out "$KEYS/$1" | tee -a "$OUT/keys.jsonl"; }
neon_env() { export NEON_API_KEY="$(secret neon-stg-api-key)" NEON_PROJECT_ID="<7-4에서 받은 프로젝트 ID>"; }
sql() { STG_DATABASE_URL="$(secret litellm-stg-database-url)" python3 $P/observe.py sql "$@"; }
```

- [ ] **7-1 사용자 준비(Neon).**
  1. neon.com에 가입한다(Free). Launch 결제 수단은 Phase 3 운영 DB를 만들기 전에 등록하면 된다.
  2. 프로젝트 `shared-ai-stg`를 만든다. PostgreSQL 16, 리전 AWS US East 2(Ohio).
  3. Connect 화면에서 connection pooling을 끄고(direct) 연결 문자열을 복사한다. 물음표 뒤를 `sslmode=require&connect_timeout=15`로 바꾸고 다른 매개변수(`channel_binding` 등)는 지운다.
  4. 그 문자열을 클립보드에 둔 채, Claude Code 입력창에 `! pbpaste | tr -d '\r\n' | gcloud secrets versions add litellm-stg-database-url --data-file=- --project=replay-live-508202`를 실행한다. 값은 대화에 나오지 않는다.
  5. Hanmadi 운영의 `LITELLM_TTS_VOICE` 값(Vercel 환경변수, 비밀 아님)을 알려 준다. (d)의 TTS가 같은 음성을 쓴다.
  6. Neon API 키와 프로젝트 ID는 7-4a 적용 뒤에 받는다(아래 7-4).

- [ ] **7-2 시크릿 채우기(묶음 A).** staging master·salt 키는 새로 만들고, 공급자 키 3개는 VM `.env`에서 gateway와 같은 방식(`shlex`)으로 읽어 파이프로 넣는다. 아무 값도 출력하지 않는다.

```bash
for name in litellm-stg-master-key litellm-stg-salt-key; do
  python3 -c 'import secrets; print("sk-" + secrets.token_hex(32), end="")' \
    | gcloud secrets versions add "$name" --data-file=- --project=replay-live-508202
done
read_vm_env() {  # VM .env의 값 하나를 stdout으로(gateway.py read_env와 같은 해석)
  gcloud compute ssh shared-ai --zone=us-central1-a --project=replay-live-508202 --tunnel-through-iap \
    --command="sudo python3 - $1" <<'EOF'
import shlex, sys
for line in open("/opt/shared-ai/repo/services/ai-gateway/.env").read().splitlines():
    if line.strip() and not line.lstrip().startswith("#"):
        key, value = line.split("=", 1)
        if key.strip() == sys.argv[1]:
            sys.stdout.write(" ".join(shlex.split(value, comments=True)))
EOF
}
fingerprint() { python3 -c 'import hashlib, sys; v = sys.stdin.buffer.read(); print(len(v), hashlib.sha256(v).hexdigest()[:8])'; }
for pair in HANMADI_CHAT_API_KEY=hanmadi-chat-api-key ELEVENLABS_API_KEY=elevenlabs-api-key TYPESAFE_API_KEY=typesafe-api-key; do
  read_vm_env "${pair%%=*}" | gcloud secrets versions add "${pair#*=}" --data-file=- --project=replay-live-508202
  echo "${pair#*=}: vm=[$(read_vm_env "${pair%%=*}" | fingerprint)] secret-manager=[$(secret "${pair#*=}" | fingerprint)]"
done
```

Expected: 시크릿마다 `Created version [1]`이 나온다. 공급자 키 3줄은 `vm=[길이 해시8]`과 `secret-manager=[길이 해시8]`이 같다. 값이 비어 있으면 `gcloud`가 거부하므로 멈추고 원인을 기록한다. 길이·해시 결과는 `docs/qa`에 남긴다.

- [ ] **7-3 edge 이미지 재빌드(묶음 A).** 태스크 2의 관리 경로를 담는다. litellm 이미지는 Phase 1 digest(`sha256:2c3f70cd…`)를 그대로 쓴다(설정 파일이 바뀌지 않았다).

```bash
gh workflow run shared-ai-images.yml --ref main -f image=edge-staging
gh run list --workflow=shared-ai-images.yml --limit 1 --json databaseId,headSha,status
gh run watch <실행 ID> --exit-status
gcloud artifacts docker images describe "us-central1-docker.pkg.dev/replay-live-508202/shared-ai/edge-staging:<headSha>" \
  --project=replay-live-508202 --format='value(image_summary.digest)'
```

Expected: 실행 성공, digest 한 줄. 이 digest를 7-4의 `EDGE`에 넣는다.

- [ ] **7-4 Terraform 적용(묶음 A, 2단계).** 마이그레이션 Job과 그 의존 자원을 먼저 만든다(P2-R12).

```bash
cd services/shared-ai-host
export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token --account=guswhd1085@gmail.com)" TF_VAR_project_id=replay-live-508202
terraform init -input=false -lockfile=readonly >/dev/null
EDGE="us-central1-docker.pkg.dev/replay-live-508202/shared-ai/edge-staging@<7-3 digest>"
LITELLM="us-central1-docker.pkg.dev/replay-live-508202/shared-ai/litellm-staging@sha256:2c3f70cdbc08cac6bbc639905b1840740b26288425b095e43c0075c95fc39fb6"
IMAGES="staging_images={litellm=\"$LITELLM\",edge=\"$EDGE\"}"
terraform plan -input=false -var "$IMAGES" -target=google_cloud_run_v2_job.litellm_stg_migrate -out=p2a.tfplan
terraform apply -input=false p2a.tfplan
```

Expected 7-4a: `Plan: 10 to add, 0 to change, 0 to destroy.` 대상은 API `cloudscheduler`, 시크릿 컨테이너 `neon-stg-api-key`, SA `shared-ai-litellm-stg`, 시크릿 IAM 6개, Job `litellm-stg-migrate`다. 다른 값이 나오면 apply하지 않고 원인을 기록한다.

7-4a 뒤 사용자가 Neon API 키를 만든다. 가능하면 `shared-ai-stg` 하나로 범위를 제한한 project-scoped 키로 만든다(조직 Settings → API keys). Free 플랜에서 이 유형을 만들 수 있는지는 문서에 없어(D1 미확인), 안 되면 personal 키를 쓴다. `! pbpaste | tr -d '\r\n' | gcloud secrets versions add neon-stg-api-key --data-file=- --project=replay-live-508202`로 넣고, 프로젝트 ID(Settings → General, 비밀 아님)를 알려 준다. 그다음 7-5a를 실행하고 나머지를 적용한다.

```bash
terraform plan -input=false -var "$IMAGES" -out=p2b.tfplan
terraform apply -input=false p2b.tfplan
rm -f p2a.tfplan p2b.tfplan; rm -rf .terraform
```

Expected 7-4b: `Plan: 8 to add, 0 to change, 0 to destroy.` 대상은 서브넷 `shared-ai-staging`, 서비스 `litellm-stg`·`shared-ai-probe-stg`·`shared-ai-stg`, IAM 2개, SA `shared-ai-scheduler-stg`, Scheduler `litellm-stg-warm`(paused)이다.

- [ ] **7-5 마이그레이션·스모크·프로브(묶음 A, 무과금).**
  - **a. 마이그레이션(7-4a와 7-4b 사이).**

    ```bash
    gcloud run jobs execute litellm-stg-migrate --region=us-central1 --project=replay-live-508202 --wait
    gcloud logging read 'resource.type="cloud_run_job" AND resource.labels.job_name="litellm-stg-migrate"' \
      --project=replay-live-508202 --freshness=30m --order=asc --format='value(textPayload)' | grep -i -E "migrat|prisma|skip|error" | head -20
    STG_DATABASE_URL="$(secret litellm-stg-database-url)" python3 $P/observe.py sql tables
    ```

    Expected: 실행 성공. 로그에 마이그레이션 적용과 서버 시작 생략이 보인다(정확한 문구는 `TODO(D1)`). 테이블 수가 0보다 크다. VM의 LiteLLM은 같은 버전에서 86개였다(README).
  - **b. 2단 경로 스모크.**

    ```bash
    export STG_EDGE=$(run_url shared-ai-stg)
    new_key smoke
    STG_KEY_FILE="$KEYS/smoke" python3 $P/poc.py smoke | tee "$OUT/smoke.jsonl"
    ```

    Expected:
    - `no-id-token`은 403이나 401이다(Cloud Run IAM).
    - `bad-key`는 401이다(`Authorization`이 두 hop을 지나 LiteLLM에 닿음).
    - `models`는 200이다(내부 hop에 invoker 403 없음, `header_up Host` 동작). Caddy는 https 업스트림의 `{upstream_hostport}`를 `<서비스>.run.app:443`으로 만든다(소스 확인). Cloud Run이 이 Host를 거부해 404가 나면 `Caddyfile.staging`의 `header_up Host` 값을 `{http.reverse_proxy.upstream.host}`로 바꾸는 PR을 먼저 머지한다.
    - `liveliness`는 200, `closed-admin`은 404다.
    - `mock`은 200이고 `content`가 `"pong"`이다(시험 키 metadata로 허용, 공급자 호출 없음). `content`가 다르면 mock이 버려지고 1토큰 실호출이 된 것이다. 그때는 (c)(e)(f)도 `burst --real`과 같은 1토큰 호출로 잰다(P2-R4).
  - **c. 기동·종료 설정 로그.**

    ```bash
    gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="litellm-stg"' \
      --project=replay-live-508202 --freshness=1h --order=asc --limit=400 --format='value(textPayload)' \
      | grep -i -E "schema|migrat|graceful|shutdown|Starting new instance" | head -20
    ```

    Expected: 시작 시 마이그레이션을 생략했다는 줄이 있다. 종료 drain 3초 설정은 (f)에서 종료 로그로 확인한다.
  - **d. 프로브(P2-R8).** edge의 업스트림을 잠시 프로브로 돌렸다가 되돌린다.

    ```bash
    PROBE=$(run_url shared-ai-probe-stg); LITELLM_URL=$(run_url litellm-stg)
    gcloud run services update shared-ai-stg --region=us-central1 --project=replay-live-508202 --quiet --update-env-vars="LLM_UPSTREAM=$PROBE"
    python3 $P/poc.py probe | tee "$OUT/probe.jsonl"
    gcloud run services update shared-ai-stg --region=us-central1 --project=replay-live-508202 --quiet --update-env-vars="LLM_UPSTREAM=$LITELLM_URL"
    STG_KEY_FILE="$KEYS/smoke" python3 $P/poc.py smoke | grep '"step": "models"'
    ```

    프로브가 치환하는 자리표시자는 Caddy 소스(v2.11.7 `staticresp.go`, 요청마다 `ReplaceKnown`)로 확인했다. 문서에는 이 동작이 없다(D1).

    Expected: 프로브 3줄 모두 `"ok": true`다. 즉 `content_length`가 `sent_length`와 같고(chunked로 바뀌지 않음), `path`에 `/llm`이 없다. `host`는 프로브 호스트이며 `:443` 포함 여부를 기록한다. 되돌린 뒤 `models`가 200이다. `seen`에 `{http.request...}`가 그대로 보이면 프로브가 자리표시자를 치환하지 않은 것이다. 그때는 이 확인을 Phase 4로 넘긴다(P2-R8).

  - **e. Neon 조회가 compute를 깨우지 않는지 확인.** 문서에 없는 내용이라(D1 미확인) 측정 전에 확인한다. 7-5d의 마지막 요청 뒤 `litellm-stg` 인스턴스가 내려가면 종료 flush가 Neon을 다시 깨운다. 그래서 그 뒤에 시작한다.
    1. 마지막 요청 뒤 20분 이상 아무 요청도 보내지 않는다.
    2. `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="litellm-stg"' --project=replay-live-508202 --freshness=1h --format='value(timestamp,textPayload)' | grep -i -E "shutting down|finished server process"`로 종료 로그를 확인한다(문구는 `TODO(D1)`).
    3. `neon_env; python3 $P/observe.py neon-wait-idle --timeout-minutes 15` 뒤 `python3 $P/observe.py neon-watch --hours 0.25 --interval 60 > "$OUT/neon-poll-check.jsonl"`을 실행한다.

    Expected: `neon-state` 줄이 하나뿐이다(`idle`, `last_active` 그대로). 줄이 더 생기면 먼저 그 시각을 `litellm-stg` 인스턴스 시작·종료 로그와 대조한다. Neon이 스스로 하는 점검(D1)일 수도 있다. 우리 쪽 원인이 없는데도 조회 때마다 깨어나면, 1분 간격 조회가 compute를 깨운다고 결론 낸다. 그때는 모든 `--interval`을 600으로 늘리고, Neon 상태 판정은 600초 해상도로 한다고 기록한다.

- [ ] **7-6 측정 (a)~(g)(묶음 B).** 측정마다 시험 키를 새로 발급하고(`new_key`), 그 키의 해시로만 사용 기록을 센다. 몇 시간 이상 도는 명령은 Global Constraints대로 `nohup caffeinate -ims`로 띄운다. 순서는 (d) → (b) → (c) → (f) → (e) → (a)+g1 → g2다. (e)까지는 Scheduler가 멈춘 상태여야 한다. 보온 ping이 LiteLLM 하트비트를 깨워 Neon이 정지하지 않기 때문이다(P2-R13). (a)는 앞 측정이 끝나고 20분 이상 지난 뒤 시작한다. 대기 시간 동안에는 `litellm-stg`에 어떤 요청도 보내지 않는다(Review Focus 3). Neon은 오래 정지한 compute를 점검하려고 스스로 깨우기도 한다(D1). 그래서 우리 호출과 무관한 `active` 전환은 따로 표시한다.

  - **(d) 기능.** `new_key d-features` 뒤에 `STG_KEY_FILE="$KEYS/d-features" python3 $P/poc.py features --tts-voice <7-1의 음성 ID> --confirm-paid | tee "$OUT/d.jsonl"`을 실행한다.

    Expected: 6줄 모두 `status` 200이다. 스트리밍은 `done`이 true, `events`가 3 이상이고, `last_ms - first_ms`가 100 이상이다(flush, 마스터 2-1). STT는 무음이라 빈 텍스트가 나올 수 있다. 판정은 200 여부로 한다. `d_failures`는 200이 아닌 줄의 수다.
  - **(b) 사용 기록.** `new_key b-spend`를 하고, `neon_env; python3 $P/observe.py neon-watch --hours 1 --interval 60 > "$OUT/b-neon.jsonl"`을 백그라운드로 띄운다. 그다음 `STG_KEY_FILE="$KEYS/b-spend" python3 $P/poc.py burst --n 20 --real | tee "$OUT/b.jsonl"`을 실행한다. 30분 동안 아무 요청도 보내지 않은 뒤(축소와 종료 flush) 다음을 실행한다.

    ```bash
    sql spend-count --key-hash <b-spend 해시> --since <burst의 started>
    sql key-state --key-hash <b-spend 해시>
    ```

    Expected: `20|<합계>`. 키의 `spend`가 그 합계와 같다. `b_missing_spend = 20 - 건수`. `b-neon.jsonl`에서 마지막 호출 뒤 compute가 다시 `active`가 된 시각(종료 flush)을 찾아 `shutdown_after`(초)로 기록한다.
  - **(c) 예산 초기화.** `new_key c-budget`을 하고 `STG_KEY_FILE="$KEYS/c-budget" python3 $P/poc.py burst --n 1`로 키를 쓴다.
    - ① `sql expire-budget --key-hash <해시>` 뒤 `burst --n 12 --every 120`(24분)을 실행하고 `sql key-state --key-hash <해시>`로 확인한다.
    - ② 다시 `expire-budget`을 하고 30분 동안 호출하지 않는다(0대로 축소). 그다음 `burst --n 1`을 실행하고, 2분 뒤 `key-state`를 확인한다.

    Expected: 두 경우 모두 `budget_reset_at`이 약 30일 뒤로 옮겨지고 `spend`가 초기화된다. `c_reset_missed`는 초기화되지 않은 경우의 수(0~2)다. ②만 실패하면 마스터 플랜 게이트 규칙대로 Phase 3 admin Job에 월초 보정을 넣는다. 관리 API 지원 여부는 원문으로 확인한다(P2-R10).
  - **(f) 종료.** `new_key f-shutdown`을 하고 `neon_env`를 실행한다.
    - `STG_KEY_FILE="$KEYS/f-shutdown" python3 $P/poc.py shutdown --mode idle-neon --n 10 | tee -a "$OUT/f.jsonl"`을 2회 실행한다. 하네스가 다음 리비전을 트래픽 없이 먼저 배포한다. 그다음 옛 리비전으로 10건을 보내고, Neon 정지를 기다린 뒤 트래픽만 옮긴다(옛 인스턴스의 유휴는 약 6분이라 15분 안이다).
    - `... shutdown --mode stream --confirm-paid | tee -a "$OUT/f.jsonl"`을 2회 실행한다.
    - 회차마다 옛 리비전의 종료 로그(7-5c의 grep)가 나온 뒤에 센다. 종료 로그가 20분 안에 안 보이면 20분 시점에 센다. `sql spend-count --key-hash <해시> --since <그 회차 started - 60>`을 쓴다. 60초를 빼는 것은 노트북과 서버의 시계 차이 때문이다.

    Expected: idle-neon 회차는 `neon_before`(트래픽 이동 직전 상태)가 `"idle"`이고 10건이 기록된다. stream 회차는 `stream.done`이 true이고 1건이 기록된다. `f_lost_spend`는 회차마다 `ok` 수(응답 200)에서 기록 수를 뺀 값을 모두 더한 것이다. `litellm-stg` 종료 로그에서 drain 3초 설정이 보이는지도 확인한다. idle-neon 회차에서 트래픽 이동 전에 옛 인스턴스가 먼저 축소됐으면(로그) 그 회차는 "축소 flush"로 따로 적는다.
  - **(e) 웜 LiteLLM + 정지 Neon.** `new_key e-warm`을 하고 `neon_env` 뒤 `STG_KEY_FILE="$KEYS/e-warm" python3 $P/poc.py warm-neon --trials 10 > "$OUT/e.jsonl"`을 실행한다(기본값: ping 없음, 7분 이상 대기, 최대 12분). 끝나면 `gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="litellm-stg" AND textPayload:"Starting new instance"' --project=replay-live-508202 --freshness=3h --format='value(timestamp)' > "$OUT/e-instance-starts.txt"`로 인스턴스 시작 시각을 받는다.

    Expected:
    - 각 시행의 `neon_before`가 `"idle"`이다.
    - 측정 요청 직전 1분 안에 새 인스턴스 시작 로그가 없다. 있으면 그 시행은 콜드로 분류해 뺀다.
    - 남은 시행 중 200이 아닌 수가 `e_failures`다. 유효 시행이 10회가 안 되면 모자란 만큼 다시 잰다.
  - **(a) 콜드 경로 + g1(보온 없음 24시간).** Scheduler는 멈춘 상태다. `new_key a-cold`를 하고 `neon_env`를 실행한다. 아래 세 명령을 백그라운드로 띄운다.

    ```bash
    python3 $P/observe.py neon-watch --hours 24 --interval 60 > "$OUT/g1-neon.jsonl"
    STG_KEY_FILE="$KEYS/a-cold" python3 $P/poc.py cold --path jev --samples 10 --gap-minutes 20 --confirm-paid > "$OUT/a-jev.jsonl"
    STG_KEY_FILE="$KEYS/a-cold" python3 $P/poc.py cold --path chat --samples 10 --gap-minutes 20 --initial-wait-minutes 210 --confirm-paid > "$OUT/a-chat.jsonl"
    ```

    끝나면 다음을 실행한다.

    ```bash
    python3 $P/poc.py stats "$OUT/a-jev.jsonl" --step cold-jev
    python3 $P/poc.py stats "$OUT/a-chat.jsonl" --step cold-chat
    gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="litellm-stg" AND textPayload:"Starting new instance"' \
      --project=replay-live-508202 --freshness=1d --format='value(timestamp)' > "$OUT/a-instance-starts.txt"
    ```

    하네스는 간격(20분)을 기다린 뒤, 제어면만 보며 Neon이 정지할 때까지 더 기다렸다가 보낸다(`neon_waited_s`). 앞 샘플 인스턴스의 종료 flush가 Neon을 다시 깨우기 때문이다.

    Expected:
    - 샘플마다 `neon_before`가 `"idle"`이고, 직전 1분 안에 새 인스턴스 시작 로그가 있다.
    - 둘 중 하나라도 아닌 샘플은 무효다. p95와 실패 집계에서 빼고, 유효 샘플이 경로마다 10개가 될 때까지 같은 명령(`--samples`에 모자란 수)으로 다시 잰다(Review Focus 1).
    - `a_jev_p95_ms`·`a_chat_p95_ms`·`a_chat_over_3s_rate`를 유효 샘플로 기록하고, `a_failures`는 유효 샘플 중 200이 아닌 수다.
    - g1이 끝나면(24시간) `python3 $P/observe.py neon-active "$OUT/g1-neon.jsonl"`로 Neon 활성 초를 내고, `python3 $P/observe.py run-usage --start <g1 시작 RFC3339> --end <g1 끝> | tee "$OUT/g1-usage.jsonl"`로 Cloud Run 과금 시간을 기록한다. 두 창의 Neon 사용량 값(`neon-watch-start`·`end`의 `active_time_seconds`)은 최대 1시간 늦게 반영되므로 교차 확인에만 쓴다.
  - **g2(보온 5분 24시간).** g1이 끝나면 `gcloud scheduler jobs resume litellm-stg-warm --location=us-central1 --project=replay-live-508202`를 실행한다.
    - 6분 뒤 `gcloud logging read 'resource.type="cloud_scheduler_job" AND resource.labels.job_id="litellm-stg-warm"' --project=replay-live-508202 --freshness=15m --format='value(timestamp,httpRequest.status,jsonPayload.status)'`로 첫 실행이 성공했는지 본다. 403·404면 edge 경유로 바꾼다(P2-R9, 묶음 B 범위).
      - `cd services/shared-ai-host`에서 7-4처럼 `GOOGLE_OAUTH_ACCESS_TOKEN`·`TF_VAR_project_id`를 다시 설정하고 `terraform init -input=false -lockfile=readonly`를 실행한다(7-4b에서 `.terraform`을 지웠다).
      - `terraform plan -input=false -target=google_cloud_scheduler_job.litellm_stg_warm -var warm_ping_via_edge=true -out=p2c.tfplan`을 실행한다. 기대값은 `1 to change`(URI·audience)다. 이미지는 무시 대상이라 `-var "$IMAGES"`는 필요 없다. `paused`도 무시 대상이라 재개 상태가 유지된다.
      - apply한 뒤 `rm -rf .terraform p2c.tfplan`을 실행한다.
      - `gcloud scheduler jobs describe litellm-stg-warm --location=us-central1 --project=replay-live-508202 --format='value(state)'`가 `ENABLED`인지 보고, 다음 실행이 성공하는지 다시 확인한다.
    - 그다음 `neon_env`를 실행하고 `python3 $P/observe.py neon-watch --hours 24 --interval 60 > "$OUT/g2-neon.jsonl"`을 백그라운드로 띄운다. g2 동안에는 하네스 호출을 하지 않는다.

    Expected: 하트비트(60초) 때문에 ping마다 Neon이 깨어 거의 24시간 `active`일 가능성이 크다(D1 근거의 추론). `python3 $P/observe.py neon-active "$OUT/g2-neon.jsonl"`로 활성 초를 내고, `active` 전환 간격을 `periodic`(초)으로 기록한다. 계속 `active`였다면 300으로 적는다. g2가 끝나면 `run-usage`로 과금 시간을 기록하고 Scheduler를 `pause`한다.

- [ ] **7-7 운영 트래픽 추정(묶음 B, VM 읽기 전용).** VM이 꺼져 있던 기간을 빼기 위해 일별 건수를 먼저 보고, 정상 운영된 연속 14일을 고른다.

```bash
vm_sql() {
  gcloud compute ssh shared-ai --zone=us-central1-a --project=replay-live-508202 --tunnel-through-iap \
    --command='cd /opt/shared-ai/repo/services/ai-gateway && sudo docker compose exec -T db psql -U litellm -d litellm -At'
}
vm_sql > "$OUT/prod-daily.txt" <<'SQL'
SELECT date_trunc('day', "startTime")::date, count(*) FROM "LiteLLM_SpendLogs" WHERE "startTime" > now() - interval '60 days' GROUP BY 1 ORDER BY 1;
SQL
vm_sql > "$OUT/prod-epochs.txt" <<'SQL'
SELECT extract(epoch FROM "startTime") FROM "LiteLLM_SpendLogs" WHERE "startTime" >= '<창 시작일>' AND "startTime" < '<창 시작일 + 14일>' ORDER BY 1;
SQL
vm_sql <<'SQL'
SELECT count(*), round(sum(extract(epoch FROM ("endTime" - "startTime")))::numeric, 1) FROM "LiteLLM_SpendLogs" WHERE "startTime" >= '<창 시작일>' AND "startTime" < '<창 시작일 + 14일>';
SQL
python3 $P/neon_estimate.py --days 14 --shutdown-after <(b)의 shutdown_after> < "$OUT/prod-epochs.txt"
python3 $P/neon_estimate.py --days 14 --periodic <g2의 periodic> < "$OUT/prod-epochs.txt"
```

Expected: 보온 없음과 보온 5분 각각의 `usd_per_month`와 `cloud_sql_cheaper`가 나온다. 보온 없음 결과의 `sessions_per_day`가 운영 트래픽 기준 콜드 스타트 빈도다(마스터 (g)). 마지막 SQL의 요청 처리 시간 합은 Cloud Run 요청 기반 과금 추정에 쓴다.
    - LiteLLM 몫은 (요청 처리 초 + 세션 수 × (기동 초 + 종료 유예 10초)) × (vCPU $0.000024 + 1GiB × $0.0000025) × 30.4/14이다. 기동 초는 (a)의 유효 샘플 p50에서 공급자 응답 시간을 뺀 값으로 잡는다. 기동 중 startup CPU boost로 늘어난 vCPU 과금은 한계로 적는다.
    - edge(1 vCPU, 0.5GiB)도 같은 시간을 점유하므로 메모리를 0.5GiB로 바꾼 같은 식을 더한다. 무료 등급 적용값과 0값을 함께 낸다. 한계도 적는다. 키 조회처럼 spend log에 없는 DB 접근은 빠진다.

- [ ] **7-8 게이트 보고.** 측정 기록은 `docs/qa/<날짜>-serverless-phase2.md`에 쓴다. 명령, 시험 키 별칭과 해시, 건수, 지연, 프로브 결과를 담고 비밀값은 넣지 않는다. 7-6의 값으로 `summary.json`을 만들고(키: `a_jev_p95_ms`, `a_chat_p95_ms`, `a_failures`, `a_chat_over_3s_rate`, `b_missing_spend`, `c_reset_missed`, `d_failures`, `e_failures`, `f_lost_spend`), `python3 $P/poc.py evaluate summary.json`으로 판정표를 낸다. 여기에 (g) 비용표(g1·g2 실측과 7-7 운영 추정, 운영 기준 콜드 스타트 빈도, 무료 등급 적용과 0, VM e2-small 기준과 비교)를 더해 `docs/qa/<날짜>-serverless-phase2-gate.md`에 쓴다. 권고는 마스터 플랜 게이트 규칙을 그대로 따른다.
  - (a)(b)(d)(e)(f)가 통과하고 월 비용이 VM 축소안보다 낮으면 Phase 3로 간다. litellm DB는 (g)의 활성 시간으로 D2 기준에 따라 고른다.
  - (a)나 (e)가 보온으로도 실패하면 최소 인스턴스 1이 필요하다. (b)나 (f)가 실패하면 instance 기반 과금이 필요하다. 이 경우 서버리스를 계속할지 다시 묻는다.
  - (c)만 실패하면 Phase 3 admin Job에 월초 보정을 넣는다.

  PR로 올리고 사용자 결정을 기다린다.
- [ ] **7-9 정리.**
  - 시험 키 로컬 파일을 지운다(`rm -rf "$KEYS"`). 키 자체는 7일 뒤 만료되고 $0.05 상한이 있다.
  - Scheduler가 멈춰 있는지 확인한다.
  - `gcloud run services update litellm-stg --region=us-central1 --project=replay-live-508202 --quiet --remove-env-vars=POC_REV`로 Terraform과의 차이를 없앤다.
  - 결과를 `docs/qa`로 옮긴 뒤 `$OUT`을 지운다.
  - **계속하면** 스테이징을 Phase 3까지 둔다(유휴 비용 거의 0).
  - **중단하면** `staging.tf`와 `main.tf` 추가분을 지우는 PR을 머지하고 apply한다(18개 삭제). Neon 프로젝트를 지우고, 스테이징 시크릿 버전(master·salt·DB URL·Neon 키와 복사한 공급자 키)을 `gcloud secrets versions destroy`로 없앤다. VM은 e2-small로 유지한다.
