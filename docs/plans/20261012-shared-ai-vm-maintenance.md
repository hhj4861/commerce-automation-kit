# shared-ai VM 점검: Dify 삭제·accounts v1 퇴역·부팅 디스크 20GiB 재구성

- 목표: 한 번의 점검으로 세 가지를 끝낸다.
  1. 마스터 플랜 D6에 따라 Dify를 지운다.
  2. D4·#19에 따라 accounts v1(구독 로그인)을 퇴역시켜 구독 자격을 새 VM에 옮기지 않는다.
  3. 부팅 디스크를 80GiB에서 20GiB로 줄여 월 약 $6을 아낀다.
  - 이 과정에서 "새 VM에 백업을 복원하는 경로"를 실제 데이터로 처음 검증한다.
- 기준: main `32a1b98`. VM 실측은 2026-10-12에 IAP SSH 읽기 전용으로 했다. 비밀값 파일은 이름·크기만 보고 내용은 열지 않았다.
- 관련: `docs/PROGRESS.md` §7 #18·#19, `docs/20261009-shared-ai-serverless-migration-plan.md`의 D4·D5·D6과 Phase 2 「게이트 결과와 결정」.
- 승인 경계: 이 문서를 머지해도 실행 승인이 아니다. ★ 표시 단계는 각각 사용자 승인을 받는다. 대상은 코드 PR 머지, VM 정지, Terraform apply, 디스크·스냅샷 삭제, 유료 호출이다.
- 범위 밖:
  - 서버리스 재개
  - 머신 유형 변경(e2-small 유지)
  - LiteLLM·Postgres 버전 올리기
  - accounts v2 도입(§4)
  - D5·D6·#19의 저장소 코드 정리(§8)

## 지켜야 할 것

- 모든 `gcloud` 명령에 `--project=replay-live-508202 --account=<개인계정>`을 붙인다. 로컬 기본 프로젝트는 다른 프로젝트다.
- 비밀값을 화면·로그·커밋에 남기지 않는다. 값이 같은지는 길이와 SHA-256 앞 8자로만 확인한다. 비밀값이 든 파일은 GCP 밖(노트북, iCloud)으로 옮기지 않는다.
- 옛 디스크는 읽기 전용으로만 붙인다(`--mode=ro`, `mount -o ro,noload`).
- 옛 디스크를 붙인 채 새 VM을 재부팅하지 않는다. 두 디스크의 루트 파일시스템 레이블이 같다(`cloudimg-rootfs`).
- 유료 모델 호출은 건수와 비용을 먼저 보고하고 승인받는다.

## 1. 현재 상태 (2026-10-12 실측)

- **VM `shared-ai`**
  - e2-small, us-central1-a, 내부 IP `10.78.0.2` 고정, 외부 IP는 임시(아웃바운드 전용)
  - Ubuntu 24.04.5, Docker 29.1.3(containerd 이미지 저장소), Compose 2.40.3
- **부팅 디스크 `shared-ai-data`**: 80GiB pd-balanced, 21G 사용.
  - 이미지 저장소 `/var/lib/containerd`가 16G다. 그중 Dify 이미지가 약 10.9GB, 사용 중인 이미지가 약 4.2GB이고, 나머지는 쓰지 않는 이전 discovery·빌드 이미지다.
- **백업**: GCE 일일 스냅샷(04:00, 7일 보존)뿐이다. 자체 백업 cron·timer는 없다.
- **호스트 설정**: 스왑·`/etc/docker/daemon.json`·직접 만든 systemd 유닛·root crontab이 없다. 호스트에 필요한 것은 `startup.sh`가 설치하는 패키지와 `/opt/shared-ai` 아래 파일뿐이다.
- **Docker 로그**: 기본 json-file 드라이버이고 크기 상한이 없다. 컨테이너 로그가 이미 126MB다.
- **배포**: GitHub Actions에는 VM 배포 신원이 없다(`docs/deployment/platform-gitops.md` 2026-10-09). VM 배포는 개인 계정의 IAP SSH로 수동으로 했다. 따라서 인스턴스를 교체해도 CI 권한에는 영향이 없다.
- **외부 IP**: 2026-10-09에 머신 유형을 바꾸며 정지·시작했을 때 이미 바뀌었고, 그 뒤에도 서비스가 정상이었다. 외부 IP 허용목록에 의존하는 곳은 없다.
- **edge**: 실행 중인 Caddyfile은 main의 `services/shared-ai-host/Caddyfile`과 같다(SHA-256 앞자리 `a625d3e0…` 일치).
- **LiteLLM 팀**: 앱 팀 4개(festa, hanmadi, replay, rescene-game)이고 키는 팀마다 1개다. 구독 워커(D5)용 팀은 없다. `.runtime/subscriptions/`에는 잠금 파일만 있다.

| Compose 프로젝트 | 상태 | 실행 위치 | 상태 데이터 |
|---|---|---|---|
| `shared-ai-gateway` (LiteLLM, Postgres 16.15) | 실행 | `/opt/shared-ai/repo/services/ai-gateway` | 볼륨 `shared-ai-gateway_postgres-data`(DB 20MB, 기본 테이블 78개·뷰 포함 86개), `.env`, `.runtime/`(앱별 env, `litellm.json`) |
| `shared-ai-accounts` (accounts v1) | 실행 | `/opt/shared-ai/releases/accounts-476a7c0/services/ai-gateway` | 볼륨 `shared-ai-accounts_accounts-data`(180KB), 릴리스 안의 `.env.accounts`(링크가 아닌 실파일), `/opt/shared-ai/accounts/` |
| `shared-topic-discovery` | 실행 | `/opt/shared-ai/releases/discovery-7e9d866…/services/topic-discovery` | `/opt/shared-ai/discovery/`(`.env`, `jev.env`, `data/discovery.sqlite`). 릴리스 안의 `data`·`.env`는 이 경로를 가리키는 링크다 |
| `shared-ai-edge` (Caddy) | 실행 | `/opt/shared-ai/releases/discovery-e6df2e05…/services/shared-ai-host` | 없음(Caddyfile만) |
| `cak-dify` | 중지(컨테이너 14개) | `/opt/shared-ai/repo/services/dify/.upstream/dify/docker` | 소스·볼륨 359MB, `/opt/shared-ai/apps.json`·`dify-admin.json` |

- **사용 중인 이미지 5개**
  - `ghcr.io/berriai/litellm@sha256:87f3…`: 1.65GB
  - `postgres:16@sha256:1a6a…`: 642MB
  - `caddy:2@sha256:0c99…`: 89MB
  - `cak-accounts:claude-2.1.284`: 1.44GB, VM에서 빌드
  - `cak-discovery:7e9d866`: 359MB, VM에서 빌드
  - 이와 별도로 discovery 되돌리기용 직전 이미지가 `backups/discovery-7e9d866…/rollback-image.json`에 적혀 있다.
- **그 밖의 `/opt/shared-ai`**
  - `backups` 20MB: 그중 19MB는 2026-09-27 묶음(`20260927-post-apps`)이고, 파일 수 기준으로 거의 전부 Dify다.
  - `releases`: 1.7MB, 12개
  - `gitops`: 8KB
  - `venv`: 19MB, `startup.sh`가 다시 만든다

## 2. 방식

- GCE 디스크는 줄일 수 없다([디스크 크기 변경](https://cloud.google.com/compute/docs/disks/resize-persistent-disk)). 스냅샷으로 만든 디스크도 원본 디스크 크기 이상이어야 한다([스냅샷 복원](https://cloud.google.com/compute/docs/disks/restore-snapshot)). 그래서 새 20GiB 부팅 디스크로 VM을 다시 만들고 파일 단위로 옮긴다.
- 같은 이름(`shared-ai`)과 같은 내부 IP(`10.78.0.2`)로 인스턴스를 교체한다. Cloud Run 프록시가 이 IP를 가리키므로 프록시는 바뀌지 않는다.
- 옛 디스크는 지우지 않는다. 새 VM에 읽기 전용으로 붙여 복사하므로 비밀값이 GCP 밖으로 나가지 않는다. 옛 디스크가 그대로 남아 있어 되돌리기는 "옛 디스크로 다시 부팅"이다.
- 이미지는 재빌드하지 않는다. 옛 VM에서 `docker save`로 옛 디스크에 저장하고 새 VM에서 `docker load`한다.
- LiteLLM DB는 `pg_dump`/`pg_restore`로 옮기고 모든 테이블의 행 수를 대조한다. discovery SQLite는 서비스를 멈춘 뒤 복사하고 `integrity_check`로 확인한다.
- 새 VM의 Docker에는 컨테이너 로그 상한(파일당 10MB, 3개)을 둔다. 디스크가 4분의 1로 줄기 때문이다.
- edge는 accounts·Dify 경로를 뺀 Caddyfile로 새 릴리스를 설치한다. 그러면 두 경로가 404가 된다.
- 검토했지만 택하지 않은 안:
  - 새 VM을 옆에 만든 뒤 프록시 대상을 바꾸는 방식: 중단 시간은 짧다. 하지만 VM 이름·IP가 바뀌어 문서와 명령을 모두 고쳐야 한다. VM 사이에 통신 경로가 없어 복사가 노트북을 거쳐야 하는데, 그러면 비밀값이 GCP 밖으로 나간다.
  - 노트북을 거쳐 tar로 스트리밍하는 방식: 같은 이유로 택하지 않았다.

## 3. 옮길 것과 옮기지 않을 것

| 대상 | 처리 | 이유 |
|---|---|---|
| `/opt/shared-ai/repo/services/ai-gateway` (`.env`, `.runtime/` 포함) | 복사 | LiteLLM 실행 위치. salt key가 바뀌면 DB에 저장된 값이 깨지므로 파일 그대로 옮긴다 |
| LiteLLM DB | `pg_dump` → `pg_restore` | 복원 경로 검증. 실패하면 원시 볼륨 복사(같은 16.15 이미지)를 대체 경로로 쓴다 |
| `/opt/shared-ai/releases/` (`accounts-*` 제외) | 복사(링크 유지) | 실행 중인 discovery·edge 릴리스와 되돌리기용 이전 릴리스 |
| `/opt/shared-ai/discovery/`, `gitops/` | 복사 | discovery 비공개 설정·상태, 배포 기록 |
| `/opt/shared-ai/backups/` (`20260927-post-apps/`, `accounts-*` 제외) | 복사 | 배포 되돌리기 자료(이전 sqlite, `rollback-image.json`) |
| 새 edge 릴리스 `releases/edge-<sha>/` | 새로 설치 | §5-1 PR의 Caddyfile·compose.yaml(비밀값 없음) |
| accounts v1 전부: 볼륨, `/opt/shared-ai/accounts/`, `releases/accounts-*`, `backups/accounts-*`, 이미지 | 옮기지 않음 | §4: 퇴역. `claude-code/`의 Claude 구독 자격 파일과 암호화된 codex 토큰, 그 암호 키가 여기에 있다 |
| Dify(소스·볼륨·이미지·컨테이너, `apps.json`, `dify-admin.json`) | 옮기지 않음 | D6. 최종 스냅샷에 남는다 |
| `backups/20260927-post-apps/` | 옮기지 않음 | 9/27 묶음이고 대부분 Dify다. 이번 백업과 최종 스냅샷이 대신한다 |
| `/opt/shared-ai/venv` | 옮기지 않음 | `startup.sh`가 다시 만든다 |
| 쓰지 않는 이미지(이전 discovery 3개, `ca-trust-check`, `shared-topic-discovery-discovery:latest`, `node` 빌드 베이스, `busybox`) | 옮기지 않음 | 미사용 |

## 4. #19: accounts v1 퇴역

조사 근거는 코드 정적 분석과 VM 읽기 전용 확인이다.

- **v1이 받는 방식**: `codex`(ChatGPT 기기 로그인), `claude-code`(공식 CLI 로그인), Claude API 키의 세 가지다. `openai` provider는 없다(`services/ai-gateway/account_service.py` 166, 307-315행).
- **VM의 15행**: 모두 2026-09-29 시험 기록이다.

  | 앱 | provider | 상태 | 행 수 |
  |---|---|---|---|
  | Festa | claude | 연결 | 1 |
  | Festa | claude | 끊김 | 5 |
  | Festa | codex | 연결 | 1 |
  | Festa | codex | 끊김 | 4 |
  | Hanmadi | codex | 끊김 | 3 |
  | Hanmadi | codex | 오류(자격 남음) | 1 |

- **구독 자격이 있는 곳**: 두 곳이다. 암호 키가 암호문과 같은 디스크·스냅샷에 있다.
  - codex 토큰: SQLite `secret` 열. Fernet으로 암호화돼 있고 키는 `.env.accounts`에 있다.
  - Claude 구독 자격: `claude-code/<id>/`의 CLI 파일. 암호화되지 않는다.
- **소비 앱**
  - 운영 Hanmadi에는 `AI_ACCOUNTS_*`가 주입되지 않았다는 기록이 있다. Phase 0 기록이며, Vercel을 직접 확인한 것은 아니다.
  - Festa가 운영에서 쓰는지는 확인되지 않았다.
- **v2(#183)**: API 키 전용(openai·claude)이다. 코드 변경 없이 VM 로컬 Postgres에서 돌릴 수 있다고 판단한다. 다만 Hanmadi는 함께 바꿔야 할 것이 있고, 그 전에 BYOK 약관 확인이 먼저다.
  - 내장 클라이언트 0.4.0: openai를 모르고, 서버가 openai 기록을 하나라도 주면 목록 전체가 실패한다.
  - 연결 라우트와 화면

**결정(권장): 이번 점검에서 accounts v1을 퇴역시킨다.**

- 새 VM에는 accounts 데이터·`.env.accounts`·릴리스·백업·이미지를 옮기지 않는다. accounts 컨테이너도 띄우지 않는다.
- edge Caddyfile에서 `/accounts/*` 경로를 빼 404로 만든다. D4의 "폐기 때 `/accounts`는 404"와 같다. 같은 변경에서 Dify 경로(`/v1/chat-messages`, `/v1/workflows/run`)도 뺀다(D6).
- API 키 연결이 실제로 필요해지면 v2를 VM에 올리는 별도 과제로 한다(마스터 플랜 Phase 7, BYOK 약관 확인 뒤). 빈 DB로 시작하므로 이관할 것이 없다.
- 효과:
  - accounts 컨테이너 메모리 약 68MiB와 이미지 1.44GB가 빠진다.
  - 새 디스크 예상 사용량은 약 6GB(30%)다.
- 택하지 않은 안:
  - v1을 API 키 전용으로 고쳐 계속 운영하는 안: 약 10~20줄 수정이면 되지만 `openai`가 없어 Hanmadi API 키 흐름을 채우지 못한다.
  - v2를 점검 전에 올리는 안: accounts DB 덤프·복원이 더해지고, Hanmadi 변경과 약관 확인이 끝날 때까지 점검을 할 수 없다.

**선행 조건 (점검 전)**

1. ★ 사용자: 시험 때 연결한 자격을 제공사 쪽에서 해지한다.
   - 서비스의 DELETE는 제공사 승인을 취소하지 않는다.
   - 대상: Festa codex 연결 1건, Hanmadi codex 오류 1건, Festa claude 연결 1건.
   - Festa claude 연결이 claude-code 로그인인지 Claude API 키인지는 확인되지 않았다. 어느 쪽이든 해당 로그인 세션이나 키를 해지한다. 정확한 메뉴는 `TODO(D1)`.
   - Phase 0에서 이미 「accounts QA 연결의 제공사 쪽 세션·키 폐기」를 후속 과제로 적어 두었다(`docs/qa/20261009-serverless-phase0.md` 61행).
   - 해지하면 옛 디스크와 스냅샷에 남은 사본이 쓸모없어진다.
2. 운영 Hanmadi(Vercel) 환경 변수 이름에 `AI_ACCOUNTS_*`와 `DIFY_*`가 없는지 확인한다. 값은 보지 않는다. 있으면 퇴역 전에 Hanmadi에서 먼저 뺀다. `DIFY_*`가 있으면 Hanmadi가 Dify를 자동으로 고르기 때문이다(`apps/hanmadi/lib/conversation-provider.ts` 18-19행).
3. Festa 담당 저장소·세션에서 운영 Festa가 `/accounts`를 쓰는지 확인한다. 쓰면 이번 점검에서는 #19를 빼고 v1을 그대로 옮긴다. 이때는 §3의 accounts 행을 "복사"로 바꾸고, accounts 경로도 Caddyfile에 남긴다. #19는 열린 과제로 남는다.
- 2026-10-12 확인한 근거(Cloud Run `shared-ai` 요청 기록 30일, 읽기 전용):
  - Dify 경로: 9-27~28 구축·QA 뒤 호출이 0건이다.
  - `/accounts`:
    - 9-28~29 시험 때 호출이 몰려 있다.
    - 9-30에 2건이 있었다. Cloudflare 대역(172.71.x.x)에서 왔으며 Festa로 추정한다.
    - 10-04 16:48 UTC에 3건(`GET /accounts/connections`, 200)이 있었다. AWS us-east-1 대역(54.82.x.x)의 node 클라이언트이고, 같은 날 Hanmadi LiteLLM 호출과 같은 유형이라 Vercel 배포(운영 또는 프리뷰)로 추정한다.
    - 그 뒤로는 0건이다.
  - 따라서 선행 조건 2는 기록만으로 끝낼 수 없다. Vercel CLI와 프로젝트 연결이 없어 이름 조회를 못 했으므로, 사용자가 Vercel의 Hanmadi 운영·프리뷰 환경 변수에서 `AI_ACCOUNTS_*`를 확인한다.
  - `docs/HANMADI-V2-IMPLEMENTATION.md`는 이 변수를 v2 「개인 AI」 기능용으로 적고 있다. 변수가 있으면 퇴역 뒤 그 기능은 실패를 표시한다. 연결된 Hanmadi 계정은 없어(§4 표) 대화 기능에는 영향이 없다.

- **남는 사본**: 아래 셋은 순서대로 지운다(§8). 1번이 먼저 끝나면 남은 사본은 무해하다.
  - 옛 디스크
  - 원본을 지워도 남는 일일 자동 스냅샷
  - 최종 스냅샷

## 5. 사전 작업 (중단 없음)

### 5-1. 코드 PR ★

Terraform·`startup.sh`·Caddyfile·테스트·README를 한 PR로 만든다(#195, 2026-10-12 작성, CI 확인). 이 PR은 점검 시작 때 머지한다(§6 W6). 미리 머지해 두면 그사이 누가 apply할 때 새 디스크만 만들어지고 인스턴스 삭제에서 실패하는 어중간한 상태가 생길 수 있다.

`services/shared-ai-host/main.tf`:

```hcl
resource "google_compute_disk" "boot" {
  name       = "shared-ai-boot"
  type       = "pd-balanced"
  size       = 20
  image      = "projects/ubuntu-os-cloud/global/images/family/ubuntu-2404-lts-amd64"
  lifecycle { prevent_destroy = true }
  depends_on = [google_project_service.api]
}
# Retired 80 GiB boot disk, kept unattached as the rollback path until the soak ends
# (docs/plans/20261012-shared-ai-vm-maintenance.md). Deleting it is a separate, approved change.
resource "google_compute_disk" "data" { /* 그대로 */ }

resource "google_compute_disk_resource_policy_attachment" "backup" {
  name = google_compute_resource_policy.backup.name
  disk = google_compute_disk.boot.name
}

resource "google_compute_instance" "host" {
  # …
  boot_disk {
    source      = google_compute_disk.boot.id
    auto_delete = false
  }
}
```

`services/shared-ai-host/startup.sh` — Docker를 설치하기 전에 로그 상한을 둔다. 매 부팅마다 실행되므로 파일이 없을 때만 쓴다:

```bash
install -d -m 0755 /etc/docker
if ! test -f /etc/docker/daemon.json; then
  printf '%s\n' '{"log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "3"}}' > /etc/docker/daemon.json
fi
```

`services/shared-ai-host/Caddyfile` — `@accounts` 매처와 그 `handle`, `@dify` 매처와 그 `handle`을 지운다. 지운 경로는 마지막 `handle`이 404로 처리한다.

테스트를 먼저 쓰고 실패를 확인한 뒤 코드를 고친다. `services/shared-ai-host/tests/test_policy.py`:

```python
STARTUP = (Path(__file__).resolve().parents[1] / "startup.sh").read_text()


class BootDiskPolicy(unittest.TestCase):
    def test_vm_boots_from_the_20gib_disk(self):
        disk = block('resource "google_compute_disk" "boot"')
        self.assertRegex(disk, r'size\s*=\s*20\b')
        self.assertRegex(disk, r'type\s*=\s*"pd-balanced"')
        self.assertIn("prevent_destroy = true", disk)
        host = block('resource "google_compute_instance" "host"')
        self.assertRegex(host, r'source\s*=\s*google_compute_disk\.boot\.id')
        self.assertRegex(host, r'deletion_protection\s*=\s*true')

    def test_daily_snapshots_follow_the_boot_disk(self):
        attachment = block('resource "google_compute_disk_resource_policy_attachment" "backup"')
        self.assertRegex(attachment, r'disk\s*=\s*google_compute_disk\.boot\.name')

    def test_retired_disk_is_kept_but_not_booted(self):
        self.assertIn("prevent_destroy = true", block('resource "google_compute_disk" "data"'))
        self.assertNotIn("google_compute_disk.data", block('resource "google_compute_instance" "host"'))


class StartupPolicy(unittest.TestCase):
    def test_container_logs_are_capped_before_docker_starts(self):
        self.assertIn('"max-size": "10m"', STARTUP)
        self.assertIn('"max-file": "3"', STARTUP)
        self.assertLess(STARTUP.index("/etc/docker/daemon.json"), STARTUP.index("apt-get install"))
```

`services/shared-ai-host/tests/test_edge_config.py`:

```python
    def test_vm_edge_drops_retired_accounts_and_dify_routes(self):
        for absent in ("/accounts", "127.0.0.1:4190", "/v1/chat-messages", "/v1/workflows/run", "127.0.0.1:4180"):
            self.assertNotIn(absent, VM)
```

`services/shared-ai-host/tests/edge.py`(CI의 실제 Caddy 시험) 수정:

- 8080 라우팅 표에서 `/accounts/connections`, `/accounts/v1/chat/completions`, `/v1/chat-messages`, `/v1/workflows/run` 네 줄을 뺀다.
- 그 대신 아래 확인을 넣는다. 스테이징 edge(8082·8083)의 기존 404 확인은 그대로 둔다.

```python
    for path in ("/accounts/connections", "/accounts/v1/chat/completions", "/v1/chat-messages", "/v1/workflows/run"):
        assert request(8080, path, KEY)[0] == 404, path
```

- 실행:
  - `python3 -m unittest discover -s services/shared-ai-host/tests -p 'test_*.py' -v`
  - `terraform fmt -check`, `terraform validate`, `bash -n startup.sh`
  - CI: `tests/edge.py`
- README의 「구성」에 아래를 반영하고, 복원 절차는 이 문서를 가리키게 한다.
  - 부팅 디스크 이름·크기(20GiB `shared-ai-boot`)와 월 비용
  - accounts v1 퇴역, `/accounts`와 Dify 경로 404
- 2026-10-12에 Terraform 변경을 임시 복사본에 넣고 운영 state로 읽기 전용 plan(`-lock=false`)을 돌렸다.
  - 결과는 `Plan: 3 to add, 0 to change, 2 to destroy`다.
  - 인스턴스는 `boot_disk.source` 때문에 교체되며, 순서는 `-/+ destroy and then create replacement`다.
  - 정책 연결도 디스크가 바뀌어 교체된다. Cloud Run은 바뀌지 않는다. 내부 IP를 설정에 고정해 두어서 plan 단계에서 값이 이미 정해지기 때문이다.
  - 임시 복사본과 프로바이더 파일은 바로 지웠다.

### 5-2. 복원 리허설 (운영 VM, 중단 없음)

**결과 (2026-10-12):** 통과. 서비스 중단은 없었다.
- 덤프: 0.74MB, 0.9초
- 같은 digest의 임시 컨테이너(`--network none`, 데이터는 tmpfs) 준비: 3.3초
- 복원: 1.1초
- 기본 테이블 78개의 행 수가 모두 같았다(합계 2,884행). 덤프 중 바뀐 테이블은 없었다.
- 임시 컨테이너와 덤프는 지웠다.

1. 현재 DB를 덤프한다.
2. 네트워크가 없는 임시 `postgres:16` 컨테이너(같은 digest)에 복원한다.
3. 모든 테이블의 행 수가 같은지 본다.
4. 임시 컨테이너와 덤프를 지운다.

2026-09-27에는 빈 DB로만 해 봤으므로 실제 데이터로 하는 것은 처음이다. 리허설에 걸린 시간을 W2·W11 예상 시간에 반영한다.

행 수 SQL(리허설과 점검에서 함께 쓴다):

```sql
select table_name,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by 1;
```

### 5-3. 점검 시각

**결과 (2026-10-12):** LiteLLM 사용 기록 기준이다.
- 최근 14일 동안 매일 03~06시(KST)에 호출이 0건이었다.
- 최근 4주 주말(토·일)에는 10~15시(KST) 호출이 0건이었다(15시대 4건 제외).
- 평일 09시대가 가장 붐빈다(14일 중 11일).
- 사람이 지켜볼 수 있는 **주말 10~12시(KST)**를 권한다. 대안은 03~06시다.
- 일일 스냅샷(04:00 UTC = 13:00 KST)과는 겹치지 않는다.

최근 14일 LiteLLM 사용 기록에서 시간대별 호출 수를 세어 가장 한산한 1시간을 고른다. 날짜·시각은 사용자와 확정한다.

### 5-4. 선행 조건 확인

§4의 선행 조건 세 가지를 끝낸다: 제공사 해지, Hanmadi 환경 변수 이름, Festa 사용 여부. 하나라도 남으면 점검을 미루거나, §4의 대체안대로 #19를 빼고 진행한다.

## 6. 점검 절차 (예상 중단 45~60분)

리허설 결과 DB 덤프·복원은 합계 약 5초다. 예상 시간의 대부분은 VM 재생성, 시작 스크립트, 이미지 로드, 확인 단계다.

노트북에서 쓰는 이름:

```sh
P=replay-live-508202; Z=us-central1-a; A=<개인계정>
vm() { gcloud compute ssh shared-ai --zone=$Z --tunnel-through-iap --account=$A --project=$P --quiet --command="$1"; }
```

| 단계 | 할 일 | 확인·중단 기준 |
|---|---|---|
| W0 기록 (중단 전) | 백업 폴더 `B=/opt/shared-ai/backups/maint-<UTC시각>`(0700)을 만든다. 아래를 `$B`에 저장한다: `docker compose ls -a`의 프로젝트 이름과 설정 파일 목록, 컨테이너별 이미지 ID, LiteLLM 행 수(§5-2 SQL), 앱 키 4개(`.runtime/*.env`)의 `/v1/models` 모델 ID 목록, discovery 최근 작업 1건의 ID와 상태 | 파일 5개가 생겼는지 |
| W1 중단 시작 | `shared-ai-edge`를 먼저 멈춘다(공개 경로가 502를 돌려준다). 이어서 `shared-ai-accounts`, `shared-topic-discovery`, gateway 컨테이너를 멈추고 db는 둔다. 명령은 `docker compose -p <프로젝트> stop` | 실행 중인 컨테이너가 db 하나뿐인지 |
| W2 백업 | `pg_dump -Fc` → `$B/litellm.dump`. discovery SQLite는 `sqlite3` 백업 API로 `$B`에 복사하고 `integrity_check`가 `ok`인지 본다. accounts 데이터는 `$B`에 복사하지 않는다(새 VM으로 옮겨지기 때문). 이미지 4개(litellm·postgres·caddy·`cak-discovery:7e9d866`)와 discovery 직전 이미지를 `docker save --platform linux/amd64 -o /opt/shared-ai/migration/images.tar`로 저장한다. 마지막으로 `$B`의 `SHA256SUMS`를 만든다 | 덤프가 0바이트가 아니고 `pg_restore --list`가 성공하는지 |
| W3 정지 | db를 멈춘 뒤 ★ `gcloud compute instances stop shared-ai` | VM이 TERMINATED인지 |
| W4 최종 스냅샷 | `gcloud compute snapshots create shared-ai-data-final-<날짜> --source-disk=shared-ai-data --source-disk-zone=$Z --storage-location=us-central1` | READY인지 |
| W5 삭제 방지 해제 | ★ `gcloud compute instances update shared-ai --no-deletion-protection --zone=$Z` | 설정값 false |
| W6 교체 | ★ §5-1 PR을 머지한다. main의 깨끗한 worktree에서 `terraform plan -out`을 만들고 아래 기대값을 기계적으로 대조한 뒤, 그 plan 그대로 apply한다 | 기대값은 §5-1에서 미리 확인한 `3 to add, 0 to change, 2 to destroy`다. 추가는 디스크 `boot`·정책 연결·인스턴스이고, 삭제는 정책 연결·인스턴스다. 이와 다르면 apply하지 않는다 |
| W7 새 VM 확인 | 시작 스크립트 완료(`journalctl -u google-startup-scripts`), `docker compose version`, `/etc/docker/daemon.json` | 실패하면 한 번 재부팅한다. 그래도 실패하면 R2 |
| W8 옛 디스크 연결 | `gcloud compute instances attach-disk shared-ai --disk=shared-ai-data --mode=ro --device-name=old-data --zone=$Z`. VM에서 `lsblk`로 루트 파티션을 확인한 뒤 `mount -o ro,noload /dev/disk/by-id/google-old-data-part1 /mnt/old` | `/mnt/old/opt/shared-ai`가 보이는지 |
| W9 파일 복사 | rsync가 없으면 설치한다. `rsync -aHAX --numeric-ids`로 `/mnt/old/opt/shared-ai/`를 `/opt/shared-ai/`에 복사한다. §3의 제외 대상은 `--exclude`로 빼며, 앞의 `/`는 복사 기준 폴더에 고정한다는 뜻이다: `/repo/services/dify/`, `/apps.json`, `/dify-admin.json`, `/venv/`, `/migration/`, `/accounts/`, `/releases/accounts-*`, `/backups/accounts-*`, `/backups/20260927-post-apps/` | `.env`류 파일의 권한이 0600으로 유지됐는지. `find /opt/shared-ai \( -name .env.accounts -o -name claude-code -o -iname '*dify*' \)` 결과가 비었는지 |
| W10 이미지 | `docker load -i /mnt/old/opt/shared-ai/migration/images.tar` | W0의 이미지 ID와 모두 같은지. 공개 이미지가 다르면 digest로 pull한다 |
| W11 DB 복원 | ai-gateway 폴더에서 `docker compose up -d --wait db`(빈 볼륨으로 시작), `pg_restore -U litellm -d litellm --exit-on-error < $B/litellm.dump` | 행 수가 W0과 완전히 같은지. 하나라도 다르면 원시 볼륨 복사로 다시 하고, 그래도 다르면 R2 |
| W12 내부 기동 | gateway → discovery 순으로, W0에 기록한 프로젝트 이름·설정 파일 그대로 `docker compose up -d --wait`. accounts는 띄우지 않는다 | 헬스체크 healthy. `127.0.0.1:4100/health/readiness` 200 |
| W13 내부 확인 | VM 안에서 상태 코드만 출력하는 스크립트로 W0 기록과 비교한다: 앱 키 4개의 `/v1/models`가 200이고 모델 목록이 같은지, 키 없이 401인지, discovery 최근 작업 조회가 같은 상태인지, 4190 포트에 아무것도 없는지 | 하나라도 다르면 edge를 열지 않고 원인을 본다. 30분 안에 못 풀면 R2 |
| W14 edge 설치 | 노트북에서 머지된 커밋의 `services/shared-ai-host/{Caddyfile,compose.yaml}`를 `git archive`로 묶어 `gcloud compute scp`로 보낸다(비밀값 없음). `/opt/shared-ai/releases/edge-<sha>/`에 풀고 `docker compose -p shared-ai-edge up -d`. `/opt/shared-ai/gitops/edge.json`에 `jev-edge.json`과 같은 필드를 기록한다(sha, source, previous_source, updated_at, caddy_sha256) | Caddyfile SHA-256이 머지된 커밋의 파일과 같은지 |
| W15 공개 확인 | 공개 URL에서 `/health` 200, 키 없는 `/llm/v1/models` 401, 앱 키로 200, 관리 경로 404, `/accounts/connections`·`/v1/chat-messages` 404 | 실패하면 edge를 다시 멈추고 R2 |
| W16 유료 확인 (선택) ★ | 앱별 대표 모델에 1회씩, 모두 4회, `max_tokens` 8 이하로 호출한다. 실행 전에 단가를 다시 계산해 보고한다 | 200이고 응답이 비지 않았는지 |
| W17 정리 | `umount /mnt/old` 뒤 `gcloud compute instances detach-disk shared-ai --disk=shared-ai-data --zone=$Z`. `df -h /`, `free -m`, `docker compose ls`를 기록한다 | 디스크 사용률 약 30%(40% 이하) |

## 7. 되돌리기

- R1 (W6 전, 옛 인스턴스가 남아 있을 때):
  1. VM을 시작하고 삭제 방지를 다시 켠다.
  2. W1에서 멈춘 프로젝트를 `docker compose -p <프로젝트> start`로 켠다. 손으로 멈춘 컨테이너는 `unless-stopped`라도 부팅 때 저절로 켜지지 않는다. edge를 마지막에 켠다.
- R2 (W6 뒤):
  1. 옛 디스크가 붙어 있으면 뗀다.
  2. ★ §5-1 PR을 되돌리는 PR을 머지한다.
  3. 삭제 방지를 끄고 plan/apply한다. 인스턴스가 다시 `shared-ai-data`로 부팅한다. 이때 `shared-ai-boot`는 설정에서 빠지므로 함께 삭제된다. 새 디스크에만 쓴 데이터는 없다는 전제이므로, edge를 열기 전에 되돌리는 것이 원칙이다.
  4. R1의 2번과 같이 프로젝트를 켠다. 옛 디스크에는 accounts v1과 이전 edge 설정이 그대로 있어 점검 전 상태로 돌아간다.
  - 예상 소요: 15분 안팎.
- R3 (옛 디스크도 쓸 수 없을 때): 최종 스냅샷으로 80GiB 디스크를 새로 만들어 부팅 디스크로 쓴다. Terraform에서는 그 디스크를 import해야 한다.

## 8. 점검 뒤

- D+0: 결과(소요 시간, 행 수 대조, 디스크·메모리)를 `docs/PROGRESS.md`와 README에 기록한다. Codex 메일함에도 알린다.
- D+7까지 문제가 없으면:
  - ★ `google_compute_disk.data` 블록을 지우는 PR을 만들어 apply한다(plan 기대값: 삭제 1). 블록을 지우면 `prevent_destroy`도 함께 사라진다.
  - ★ 옛 디스크의 자동 스냅샷을 지운다. `on_source_disk_delete = KEEP_AUTO_SNAPSHOTS`라 원본을 지워도 남는다.
- D+30: ★ 최종 스냅샷을 지운다. Dify 데이터가 다시 필요할 가능성이 있으면 더 둔다.
- 저장소 코드 정리는 점검과 독립된 별도 PR로 한다. 점검으로 바뀐 실행 상태를 코드에 맞추는 작업이다.
  - #19: 아래 파일과 관련 테스트를 지우고, Hanmadi의 codex·claude-code 화면과 라우트를 정리한다. Hanmadi API 키 흐름(v2와 새 클라이언트 버전)은 BYOK 약관 확인 뒤 별도 과제다.
    - accounts v1: `account_service.py`, `account_worker.py`, `claude_code.py`, `subscription_runtime.py`, `Dockerfile.accounts`, `compose.accounts.yaml`
    - 워크플로: `hanmadi-model-connections.yml`
  - D5: 구독 라우트 import(`gateway.py`), `subscriptions.py`, `litellm-release.py`의 `write_configs`, `ai-gateway.yml` 구독 단계와 관련 테스트를 지운다. VM에는 남은 것이 없다(§1).
  - D6: `services/dify`, `dify.yml`, `hanmadi-dify.yml`, Hanmadi Dify 선택 로직을 지운다. `hanmadi-dify.yml`은 litellm-client가 바뀔 때 Hanmadi `npm test`·`tsc`를 돌리는 유일한 워크플로라, 그 검사를 다른 워크플로로 먼저 옮긴다.

## 9. 비용

| 항목 | 지금 | 점검 뒤 |
|---|---|---|
| 부팅 디스크(pd-balanced, $0.10/GiB-월) | 80GiB 약 $8.00 | 20GiB 약 $2.00 |
| e2-small·IPv4 | 약 $12.23 + $3.65 | 같음 |
| 월 고정 합계 | 약 $23.9 | **약 $17.9** |

- 일일 스냅샷 비용은 디스크에 저장된 양에 비례해 줄어든다(사용량이 21G에서 약 6G로 준다). 스냅샷 단가는 `TODO(D1)`이다.
- 일회성 비용:
  - 옛 디스크를 7일 보관: 약 $1.9
  - 최종 스냅샷을 30일 보관: 약 21GB 분량 × 스냅샷 단가(`TODO(D1)`)
  - W16 유료 확인: 실행 전에 계산

## 10. 위험과 대응

| 위험 | 대응 |
|---|---|
| `pg_restore` 실패나 행 수 불일치 | 리허설(§5-2)로 미리 확인한다. 점검 중에는 원시 볼륨 복사로 다시 하고, 그래도 안 되면 R2 |
| 이미지가 다르게 로드됨 | 공개 이미지 3개는 digest로 pull한다. discovery 이미지는 릴리스 폴더에서 다시 빌드하고, 시간이 넘치면 R2 |
| 옛 디스크 마운트 혼동(같은 레이블) | 장치 경로로 마운트한다. 붙어 있는 동안 재부팅하지 않는다 |
| 시작 스크립트 실패(apt 미러 장애 등) | 재부팅해 다시 실행한다. 그래도 안 되면 R2 |
| 운영 앱이 accounts를 쓰고 있었음 | §4 선행 조건 2·3에서 확인한다. 점검 뒤 드러나면 accounts 경로만 이전 Caddyfile로 되돌린다(v1 데이터는 최종 스냅샷에 있다) |
| 놓친 호스트 설정 | 실측상 없다(§1). W13·W15에서 기능으로 확인한다 |
| 점검 시간 초과 | 90분을 넘기면 그 시점의 단계에 맞춰 R1이나 R2로 돌아간다 |

## 11. 완료 조건

- 새 VM이 20GiB `shared-ai-boot`로 부팅하고, 일일 스냅샷 정책이 새 디스크에 붙어 있다.
- LiteLLM 행 수가 점검 전과 같고, W13·W15 확인을 모두 통과한다.
- 새 VM에 Dify 자산과 accounts v1 데이터(구독 자격 포함)가 없다. `/accounts`와 Dify 경로는 404다.
- 결과가 PROGRESS·README에 기록돼 있다.
- 옛 디스크와 스냅샷 삭제는 D+7·D+30 이후 별도 승인으로 한다.
