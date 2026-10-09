# 공용 AI 서버리스 전환 계획 — Devils Advocate 검토

> 개정 전 초안을 대상으로 한 리뷰다. 반영 결과는 `docs/20261009-shared-ai-serverless-migration-plan.md` 부록 B에 있다.

- **대상:** `docs/20261009-shared-ai-serverless-migration-plan.md` (worktree `origin/main` `7c257fe`)
- **검토:** devils-advocate, 2026-10-09
- **결과:** 15건(high 4 · medium 8 · low 3) → **gate_pass: false**
- **근거 범위:** 플랜 본문과 관련 소스 — `services/shared-ai-host/{main.tf,Caddyfile,tests/edge.py}`, `services/ai-gateway/{gateway.py,compose.yaml,.env.example}`, `services/topic-discovery/{server.py,service.py,jev-bridge.mjs,client.mjs,README.md}`, `ops/deploy/{targets.json,litellm-release.py}`, `apps/hanmadi/lib/{video-provider.ts,llm-diagnostics-types.ts}`. 네트워크·유료 호출은 하지 않았다. Cloud Run·Neon·Prisma·Caddy 동작은 공식 문서 기준 지식이며, "확인 필요"로 적은 항목은 PoC 또는 `TODO(D1)`에서 실측해야 한다.

## 요약표

| ID | 심각도 | 범주 | 제목 |
|---|---|---|---|
| DA-001 | high | failure | Secret 볼륨 `latest` 참조 시 edge 리비전 롤백이 무력화되고 인스턴스별 라우팅이 섞임 |
| DA-002 | medium | failure | LiteLLM 설정 볼륨을 `/app`에 마운트하면 이미지가 가려지고, env 전용 설정을 설정 파일에 넣으면 무시됨 |
| DA-003 | high | edge_case | 이관과 전환 사이 동결 창이 없음(2-4 → 2-5 PoC → 2-6, 3-2 → 3-4) |
| DA-004 | medium | failure | 롤백·재전환 시 데이터 분기, 리비전 롤백의 누적성, Terraform 드리프트 |
| DA-005 | high | scalability | 보온 ping이 LiteLLM 내부 스케줄러를 살려 Neon을 상시 기동 → Free CU 소진 시 장기 전면 중단 |
| DA-006 | medium | edge_case | "웜 LiteLLM + 정지된 Neon" 조합이 PoC에 없음 |
| DA-007 | medium | dependency | Neon 풀러(트랜잭션 모드)와 Prisma migrate·pg_dump/restore·psycopg가 맞지 않고 PG 메이저 버전도 미정 |
| DA-008 | medium | failure | "같은 salt" 이관은 `/key/info`로 검증되지 않음, 시크릿 값 변형, 복원 소유권 |
| DA-009 | medium | failure | Cloud Run SIGTERM 유예(10초)와 `GRACEFUL_SHUTDOWN_TIMEOUT`(기본 30초)·종료 flush |
| DA-010 | high | failure | maintenance Job이 실패해도 알림이 없고 14일 수명주기가 정상 백업을 모두 지움, 예산 보정은 네트워크상 불가능 |
| DA-011 | medium | dependency | discovery→JEV 5초 제한과 전환 순서, 오류 코드가 하나로 뭉개짐, JEV 키 만료(11-02) |
| DA-012 | medium | edge_case | edge→Cloud Run 2단 hop 함정(Host·IAM·chunked·이중 strip) — `tests/edge.py`로는 못 잡음 |
| DA-013 | low | scalability | 무료 등급이 청구 계정 단위로 합산(같은 청구 계정의 다른 프로젝트 2개) |
| DA-014 | low | security | BYOK 키를 삭제해도 백업·PITR에 남음 |
| DA-015 | low | failure | 전환 기간에 `deploy/litellm` 배포 경로가 비어 있음 |

---

## DA-001 (high, failure) Secret 볼륨 `latest` 참조 → 롤백 무력화와 라우팅 혼재

- **발생 조건:** 2-6·3-4·4-3에서 Caddyfile을, 2-1에서 LiteLLM 설정을 Secret Manager 볼륨으로 마운트하면서 버전을 `latest`로 참조하는 경우다. 많은 Terraform 예제가 기본으로 이렇게 한다. `latest`는 리비전 배포 시점이 아니라 인스턴스가 기동하거나 파일을 읽는 시점에 해석된다. Caddy는 Caddyfile을 기동 시 한 번만 읽는다(`--watch` 없음).
- **영향:**
  1. 설계 원칙 2와 Phase 2·3 롤백("edge 이전 리비전으로 되돌린다")이 듣지 않는다. 이전 리비전에서 새로 뜬 인스턴스도 `latest`, 즉 새 Caddyfile을 읽기 때문이다.
  2. 시크릿 버전을 추가하는 것만으로 이미 떠 있는 인스턴스(구 라우팅)와 새로 뜬 인스턴스(신 라우팅)가 함께 돈다(edge 최대 2대, `main.tf` L139-176). 그러면 `/discovery` 요청이 VM SQLite와 Neon에 동시에 기록되는 split-brain이 생기고, 멱등 키와 일일 예산(`per_day`)이 두 저장소에서 따로 계산된다.
  3. LiteLLM도 같다. 보온 ping으로 며칠씩 사는 인스턴스와 새로 뜬 인스턴스의 모델 목록이 달라 같은 요청이 인스턴스에 따라 200 또는 400을 받는다.
- **보완안:**
  - 모든 Secret 볼륨·env 참조를 숫자 버전으로 고정하고, Terraform validation으로 `latest`를 막는다. 라우팅 변경은 언제나 "새 버전 + 새 리비전"으로 한다.
  - 롤백 후보 리비전이 참조하는 버전은 Phase 6 전까지 disable·destroy하지 않는다. 현재 서빙 중인 리비전의 버전을 지우면 다음 콜드 스타트부터 edge 전체가 장애가 난다.
  - 2-6 검증에 "구 리비전으로 traffic을 옮긴 뒤 `/llm`이 실제로 VM으로 가는지"를 넣는다.

## DA-002 (medium, failure) LiteLLM 설정 볼륨 경로와 env 전용 설정

- **발생 조건:**
  - 현행 `services/ai-gateway/compose.yaml` L6·L15는 단일 파일을 `/app/platform-config.json`에 바인드한다. Cloud Run 시크릿 볼륨은 디렉터리 단위로 마운트된다. 이 경로를 그대로 옮겨 마운트 경로를 `/app`으로 잡으면 이미지의 `/app`이 가려진다. 이 디렉터리는 LiteLLM 공식 이미지의 WORKDIR이고 상대경로 entrypoint `docker/prod_entrypoint.sh`와 `schema.prisma`가 있는 곳이다(확인 필요).
  - 2-1은 `DISABLE_SCHEMA_UPDATE`와 `GRACEFUL_SHUTDOWN_TIMEOUT`을 "설정에 포함"하고 렌더 스냅샷으로 검증한다고 적었다. 그러나 둘 다 프로세스 환경변수다.
- **영향:**
  - 서비스와 `litellm-migrate` Job이 기동에 실패한다(entrypoint·스키마 없음).
  - env가 무시되면 콜드 스타트마다 `prisma migrate deploy`가 풀러를 거쳐 실행된다. DA-007의 잠금 문제가 겹치고, 콜드 스타트가 몇 초 늘며, 두 인스턴스가 동시에 뜨면 마이그레이션끼리 경합한다.
  - 스냅샷 테스트는 그래도 통과하므로 잘못 안심하게 된다.
- **보완안:** 설정 파일은 `/etc/litellm/` 같은 전용 디렉터리에 마운트하고 `--config` 경로를 바꾼다. 두 값은 Cloud Run env로 넣고, 기동 로그(마이그레이션 생략, 종료 시 drain 로그)로 검증한다.

## DA-003 (high, edge_case) 이관–전환 사이 동결 창 부재

- **발생 조건:**
  - Phase 2는 2-4 이관 → 2-5 PoC(콜드 스타트 10회, 15분 유휴, 보온 ping 측정 등 수 시간~수일) → 2-6 전환 순서다. D0에서 VM을 다시 켜므로 그동안 Hanmadi·Festa 트래픽의 spend 배치 기록(10초 주기), 예산 초기화, 키 발급·회수가 VM DB에만 쌓인다.
  - Phase 3도 3-2 복사와 3-4 전환 사이에 진행 중 요청이 있을 수 있다. 요청은 600초 뒤 만료되고 start → claim → 생성 → complete 다단계로 진행된다(`services/topic-discovery/client.mjs`).
- **영향:**
  - 전환 순간 Neon의 spend와 `budget_reset_at`이 며칠 전 값이다. 30일 예산이 적게 집계돼 상한을 넘어 지출하고, spend 로그에 공백이 생겨 Phase 6의 "spend 기록 일치" 관찰이 실패한다.
  - 그 사이 발급된 키는 401이 되고, 회수한 키는 되살아난다.
  - discovery는 VM에서 claim된 요청의 `complete`가 Cloud Run으로 가서 `request_not_found`(404)나 `invalid_completion_binding`(409)을 받는다. 이미 쓴 Codex 생성 비용이 버려진다.
- **보완안:** 2-4와 3-2는 리허설로 정하고, 전환 직전에 최종 이관을 한 번 더 한다.
  - LiteLLM: `/llm`을 503 유지보수 리비전(고정 버전)으로 돌린다 → VM gateway에서 배치 flush를 15초 이상 기다린 뒤 정지 → 빈 DB(또는 `--clean`)로 dump/restore, 행 수·해시 비교 → 전환.
  - discovery: edge에서 `POST /discovery/v1/discover`만 503으로 막는다 → `active` 테이블이 빌 때까지(최대 600초) 기다린다 → 복사 → 전환.
  - 동결 시간과 소비자 영향(Hanmadi·Festa 수 분간 503)을 승인 요청에 적는다.

## DA-004 (medium, failure) 롤백·재전환 시 데이터 분기

- **발생 조건:**
  - (a) `/discovery`를 전환한 뒤 `/llm` 문제로 "이전 리비전"으로 롤백하면, 그 리비전은 3-4 이전 상태라 `/discovery`까지 VM으로 돌아간다. 리비전 롤백은 경로별이 아니라 그때까지의 변경 전체를 되돌린다.
  - (b) edge는 Terraform(`google_cloud_run_v2_service.proxy`)이 관리한다. gcloud로 traffic을 되돌려도 다음 `terraform apply`(예: Phase 4의 accounts 추가)가 traffic을 최신 리비전으로 다시 옮겨, 의도하지 않은 재전환이 일어난다.
  - (c) 롤백한 뒤의 VM DB는 Neon에서 운영한 기간의 spend를 모른다.
- **영향:**
  - 예산이 적게 집계돼 과지출이 생기고, Neon에서 회수한 키가 VM에서 되살아난다.
  - discovery는 Cloud Run 기간의 accepted 이력이 VM에 없어 같은 주제를 다시 추천한다. 플랫폼 일일 예산(`per_day`)이 두 배로 소비되고, 같은 `Idempotency-Key`로 재시도하면 새 요청이 생긴다.
  - 재전환 때 VM→Neon을 다시 이관하면 Neon에만 있던 기간의 데이터가 덮어써져 영구히 사라진다.
- **보완안:**
  - 롤백은 "해당 경로만 VM으로 돌린 새 리비전"을 정방향으로 배포하는 방식으로 한다. 경로별 롤백 Caddyfile 버전을 미리 렌더해 둔다.
  - Terraform에 traffic 정책을 명시하거나, 롤백 직후 TF 코드도 같은 상태로 커밋한다.
  - 롤백·재전환마다 기준 DB를 정하고, Neon에만 있는 spend를 CSV로 보존하며, 예산 보정 절차를 런북으로 만든다.
  - discovery는 Postgres에만 있는 complete 이력을 SQLite로 되돌리는 역방향 스크립트를 준비하거나, 손실을 명시한다.

## DA-005 (high, scalability) 보온 ping → Neon 상시 기동 → Free 소진

- **발생 조건:**
  - 5분 간격 보온 ping은 LiteLLM 인스턴스를 계속 살려 둔다. ping 경로(`/health/liveliness`)는 DB를 건드리지 않지만, 살아 있는 인스턴스의 내부 스케줄러(예산 초기화 약 600초 주기, 스펜드 배치 등)가 ping이 만든 CPU 창이나 요청 처리 중에 DB를 조회하면 Neon은 5분 유휴에 도달하지 못한다.
  - 600초 주기 조회만으로도 최소 약 50% 가동이다. 0.25 CU × 약 365시간 ≈ 91 CU-시간/월로, 트래픽을 빼고도 이만큼이 바닥값이다.
  - (a) 최소 인스턴스 1, (b) instance 기반 과금도 같은 효과를 낸다.
- **영향:**
  - Neon Free 100 CU-시간/월을 다 쓰면 다음 주기까지 compute가 정지된다. LiteLLM은 기본값대로 DB를 쓸 수 없으면 요청을 막으므로 Hanmadi·Festa·discovery JEV가 최대 2주간 전면 중단된다.
  - 같은 기간 maintenance pg_dump도 실패한다. DA-010의 14일 수명주기와 겹치면 백업이 사라진다.
  - §7 비용표의 (a)(b)에는 Neon CU 증가가 빠져 있어 Phase 2 게이트 판단(VM e2-small $16~24와 비교)이 왜곡된다.
  - §9의 "사용량 70% 경보"는 구현 수단이 없다.
- **보완안:**
  - 2-5(e)를 보온 ping을 켠 상태로 최소 24시간 측정하고(Neon compute active time), (a)(b) 각 경우의 Neon CU를 비용표에 넣는다.
  - litellm 프로젝트는 전환 시점부터 Launch(소진 정지 없음)로 두고, Free는 discovery·accounts에만 쓴다.
  - maintenance에 Neon 사용량 조회(API 키는 Secret Manager)를 넣어 70% 경보를 실제로 만든다. compute가 정지되면 바로 Launch로 바꾸는 런북을 둔다.

## DA-006 (medium, edge_case) "웜 LiteLLM + 정지된 Neon" 조합

- **발생 조건:** DA-005의 스케줄러가 DB를 건드리지 않는 경우(CPU 제한으로 잡이 밀리거나 건너뛰는 경우)에는, 보온 ping이 만드는 가장 흔한 상태가 "LiteLLM은 웜, Neon은 5분 유휴로 정지"다. Neon이 정지하면 기존 연결은 끊긴다. 키 캐시 TTL(60초)이 지난 첫 요청은 DB를 조회해야 한다.
- **영향:**
  - 유휴 뒤 첫 요청이 끊긴 풀 연결 때문에 실패하면, 기본 차단 정책에 따라 401/500이 난다.
  - Hanmadi는 중복 요청을 막으려고 자동 재시도를 하지 않는다(`apps/hanmadi/lib/llm-diagnostics-types.ts` L21).
  - 2-5(a)는 "LiteLLM 기동 + Neon 재개"만 재고 이 조합은 재지 않는다.
- **보완안:** 2-5(a)(e)에 "웜 인스턴스에서 Neon을 10분 유휴시킨 뒤 첫 요청"을 10회 추가하고, Prisma 재연결 동작과 오류율을 기록한다. 실패율이 0이 아니면 보온 ping은 대응책이 될 수 없으므로 게이트에서 다시 결정한다.

## DA-007 (medium, dependency) Neon 풀러 비호환과 PG 버전

- **발생 조건:** 1-3은 풀러 연결 문자열만 Secret Manager에 등록한다.
  1. `prisma migrate deploy`(2-2)는 세션 수준 advisory lock과 DDL을 쓴다. 트랜잭션 풀링에서는 잠금과 해제가 서로 다른 서버 연결로 갈 수 있어 잠금이 새고, 다음 배포가 잠금 대기 timeout(P1002)으로 실패할 수 있다.
  2. Neon 문서는 pg_dump/pg_restore(1-4, 2-4)에 비풀러 연결을 권장한다.
  3. Prisma 런타임은 Neon 재개 지연이 기본 connect_timeout(5초)을 넘으면 P1001을 낸다. 엔진 버전에 따라 `pgbouncer=true`가 필요한지도 다르다(`TODO(D1)`).
  4. discovery의 `pg_advisory_xact_lock`은 트랜잭션 범위라 풀러와 호환된다. 그러나 3-1 CI는 Postgres 서비스 컨테이너에 직접 붙으므로 psycopg3 자동 prepare(`prepare_threshold`)나 세션 `SET` 같은 풀러 전용 문제를 잡지 못한다.
  5. Neon 신규 프로젝트의 기본 메이저 버전이 VM(16)과 다르면 maintenance 이미지의 pg_dump 버전이 맞지 않아 덤프가 중단된다.
- **영향:** 배포 파이프라인이 간헐적으로 실패하고, 백업·이관이 실패하며, 운영에서만 나는 간헐 오류가 생긴다.
- **보완안:**
  - 프로젝트마다 direct·pooled 연결 문자열을 둘 다 등록한다. migrate·maintenance·restore는 direct, 서비스는 pooled를 쓴다.
  - Prisma URL에 `connect_timeout=15` 등을 넣고, Neon PG 메이저는 16으로 고정한다.
  - 3-1 CI에 PgBouncer(transaction mode) 컨테이너를 추가해 동시성 테스트를 풀러 경유로 돌린다. 세션 설정은 `SET LOCAL`만 쓴다.

## DA-008 (medium, failure) "같은 salt" 이관의 검증 공백

- **발생 조건:**
  - 원칙 1은 "같은 salt로 이관해 기존 키를 그대로 쓴다"고 하고, 2-4는 `/key/info` 정책이 같은지로 검증한다. 그러나 virtual key는 SHA-256 해시로 저장되고 조회된다(`gateway.py` L153). 그래서 `/key/info`가 통과해도 salt가 맞는지는 증명되지 않는다.
  - salt는 DB에 암호화해 저장한 값을 풀 때만 쓰인다. 현행은 `STORE_MODEL_IN_DB: "False"`(`compose.yaml` L12)이고 TypeSafe 키도 env라, salt가 실제로 쓰이는 곳이 거의 없다.
  - `.env` 값을 손으로 옮기다가 `echo`로 줄바꿈이 붙거나(`gcloud secrets versions add --data-file=-`) 따옴표가 섞이면 값이 달라진다.
  - 복원을 owner 역할로 하고 런타임·migrate를 "최소 권한 역할"로 돌리면 DDL 권한이 없다.
- **영향:**
  - master key 값이 변형되면 관리 API가 401을 내므로 2-4에서 드러난다. salt가 변형되면 드러나지 않고, 나중에 암호화된 값을 저장하거나 읽을 때 복호화가 실패한다.
  - 최소 권한 migrate Job은 다음 LiteLLM 업그레이드 때 `ALTER TABLE` 권한 오류로 막힌다.
  - 이미 데이터가 있는 DB에 다시 이관하면 중복 키 오류가 난다.
- **보완안:**
  - 이관 전에 암호화 값을 담는 테이블의 행 수를 세서, salt를 "미사용·미검증"으로 기록할지 "복호화 시험 필요"로 둘지 정한다.
  - 시크릿은 `printf '%s'`나 파일로 넣고, 길이·해시 앞자리를 VM 값과 비교한다(값 자체는 출력하지 않는다).
  - 소유자 역할과 migrate 역할을 일치시키고, 재이관은 빈 DB에만 한다.

## DA-009 (medium, failure) Cloud Run 종료 유예와 `GRACEFUL_SHUTDOWN_TIMEOUT`

- **발생 조건:** Cloud Run 컨테이너 계약은 SIGTERM을 보내고 10초 뒤 SIGKILL을 보낸다고 명시한다. §8.1의 `TODO(D1)`는 이 값으로 정리할 수 있다(재확인 권장). LiteLLM의 drain 기본값은 30초다.
- **영향:**
  - 기본값을 그대로 두면 drain 도중 SIGKILL이 와서 종료 flush가 실행되지 않고, 큐에 남은 spend가 유실된다.
  - 8초처럼 "조금만 짧게" 잡으면 flush에 2초밖에 남지 않는다. 15분 유휴 뒤 축소되는 인스턴스는 Neon이 이미 정지된 상태라, 재개·재연결·재시도 백오프에 남은 시간이 모자랄 수 있다.
- **보완안:**
  - drain은 3초 이하, flush 시간 예산은 5초 이하로 설계한다.
  - 2-5(b)에 "Neon 정지 상태에서 SIGTERM"과 "스트리밍 진행 중 리비전 교체" 시나리오를 추가한다.
  - 판정 기준은 spend 내구성을 종료 훅이 아니라 주기 배치에 맡기는 쪽으로 둔다.

## DA-010 (high, failure) maintenance Job의 무음 실패와 백업 전멸

- **발생 조건:**
  - Scheduler는 Job 실행이 시작되기만 하면(API 2xx) 성공으로 기록한다. 실행 자체의 실패는 Job 실행 기록에만 남는다.
  - `pg_dump | gzip | 업로드` 파이프라인에 pipefail이 없으면, pg_dump가 실패해도(버전 불일치, 풀러, Neon 정지) 빈 gz가 업로드되고 exit 0으로 끝난다.
  - 플랜에는 실패 알림이 없고, GCS 수명주기는 나이(14일) 기준으로 지운다.
  - 덤프·TTL 정리·예산 보정이 한 Job에 묶여 있다.
  - 예산 보정을 LiteLLM 관리 API로 하려면 Job이 internal ingress에 닿아야 한다. Cloud Run Job은 internal이 허용하는 출처가 아니므로 Direct VPC all-traffic이 필요한데, 그러면 Cloud NAT 없이는 Neon(인터넷)에 나갈 수 없다.
- **영향:**
  - 무음 실패가 14일 이어지면 정상 백업이 수명주기에 모두 삭제된다. Neon Free PITR은 6시간뿐이라 그 이후의 사고는 복구할 수 없다.
  - 덤프가 실패하면 예산 보정과 TTL 정리도 함께 멈춘다. 월초 예산이 초기화되지 않으면 앱 키가 차단될 수 있다.
  - 예산 보정은 API 가용성(`TODO(D1)`) 문제가 아니라 네트워크 구조상 그대로는 불가능하다.
- **보완안:**
  - `set -euo pipefail`, custom 포맷 덤프 + `pg_restore --list` + 최소 크기·행 수 매니페스트를 쓴다.
  - Cloud Monitoring으로 Job 실행 실패 알림을 걸고, 최신 백업이 26시간보다 오래되면 알리는 신선도 검사를 둔다(메일 또는 기존 텔레그램).
  - 버킷 버전 관리와 `numNewerVersions` 기반 삭제로 마지막 정상본은 남긴다.
  - Job을 백업·TTL·예산 보정으로 나눈다. 예산 보정은 DB 직접 SQL(키 캐시 60초 감안)이나 별도 VPC Job으로 한다.

## DA-011 (medium, dependency) discovery→JEV 전환 순서와 5초 제한

- **발생 조건:** 2-6 이후 VM discovery의 JEV 호출은 공개 `/llm`을 거쳐 Cloud Run LiteLLM으로 간다. JEV 클라이언트 timeout은 `services/topic-discovery/jev-bridge.mjs` L6의 `timeoutMs:5000`, 서브프로세스 제한은 `service.py` L247의 12초다. 그런데 2-5(a)는 Hanmadi 12초(`video-provider.ts` L352)와 Festa 3초만 기준으로 삼는다.
- **영향:**
  - LiteLLM 콜드 스타트(+Neon 재개)가 5초를 넘으면 후보가 `jev_unavailable`로 held된다. `attempt()`(L122)는 호출 전에 jevCalls(요청당 최대 3)를 먼저 차감한다.
  - bridge가 모든 오류를 `jev_unavailable` 하나로 뭉갠다(L8). timeout·401·404(edge 라우팅)를 구분할 수 없어, 과거처럼 "리서치 부적합 held"로 오인하기 쉽다.
  - README L222에 따르면 discovery JEV 키는 2026-11-02에 만료된다. 일정이 열흘만 밀려도 Phase 6 관찰 기간과 겹쳐, 전환 때문에 생긴 회귀처럼 보인다.
  - Phase 3 이후에는 discovery·edge·LiteLLM 세 곳이 연달아 콜드 스타트할 수 있다.
- **보완안:**
  - 2-5(a) 기준에 discovery 5초를 추가한다.
  - bridge가 비밀이 아닌 오류 구분(status, timeout)을 stderr로 넘기도록 조금 고친다.
  - 전환 전에 키 만료일을 확인하고 연장한다.
  - `/discovery` 전환과 스모크는 LiteLLM이 웜일 때 한다.

## DA-012 (medium, edge_case) edge→Cloud Run 2단 hop 함정

- **발생 조건:**
  - 새 edge는 `https://<svc>.run.app`로 프록시한다. Caddy는 기본으로 들어온 Host 헤더를 그대로 넘기므로 `header_up Host {upstream_hostport}`가 필요하다.
  - internal ingress와 invoker IAM은 별개다. 따로 설정하지 않으면 인증이 요구된다.
  - `services/topic-discovery/server.py` L40은 `Transfer-Encoding` 헤더가 있으면 413을 반환한다.
  - VM에 남는 경로는 VM Caddy가 prefix를 자르므로, edge에서도 자르면 두 번 잘린다.
  - `tests/edge.py`는 localhost HTTP 가짜 업스트림으로 1단만 검사한다.
- **영향:**
  - 2-6 직후 `/llm`이 전부 404(Host가 edge 자신으로 라우팅됨)나 403(IAM)이 될 수 있다. §9의 대응(IAM 프록시, +1일)으로 오진할 위험이 있다.
  - 추가된 GFE hop에서 본문이 chunked로 바뀌면 discovery POST가 모두 413이 된다(확인 필요).
  - 이중 strip이 일어나면 VM 잔류 경로는 VM Caddy catch-all에서 404가 된다.
  - **egress all-traffic 전환 자체는 VM 경로를 깨지 않는다.** 방화벽 `shared-ai-private-api`(L71)의 출발지가 여전히 프록시 서브넷이고, 프록시 서브넷 PGA는 이미 켜져 있다(`main.tf` L56, 그래서 1-1의 해당 항목은 사실상 할 일이 없다). 대신 edge는 인터넷으로 나갈 수 없게 되고, 같은 /26에 Job 등을 더 붙이면 IP 블록이 모자랄 수 있다.
- **보완안:**
  - 운영과 별도의 스테이징 edge(또는 `--no-traffic` 태그 리비전 URL)로 실제 Cloud Run 경로를 경로별로 스모크한다. POST의 본문 길이 헤더도 확인한다.
  - Caddyfile에 `header_up Host`를 명시하고, 백엔드 IAM 방식을 Terraform에 명시한다.
  - `tests/edge.py`에 "edge → VM Caddy 2단" 사례를 추가한다.

## DA-013 (low, scalability) 무료 등급의 청구 계정 합산

- **발생 조건:**
  - Cloud Run(요청 기반·instance 기반 무료분), Secret Manager(6버전·1만 접근), Artifact Registry 0.5GB, GCS 5GB, Scheduler 3개는 모두 청구 계정 단위다. 같은 청구 계정의 다른 프로젝트 2개가 먼저 쓰면 그만큼 줄어든다.
  - §7 (b) 산식은 24만 vCPU-초를 전부 차감할 수 있다고 가정한다.
  - DA-001의 고정 버전 정책을 따르면 시크릿 버전이 계속 쌓인다.
- **영향:** "월 약 $1"과 게이트 비교가 실제보다 낮게 추정된다. 예산 알림이 프로젝트 단위면 원인이 보이지 않는다.
- **보완안:** 게이트 전에 청구 보고서에서 세 프로젝트의 SKU별 사용량을 확인한다. 무료분을 0으로 놓은 최악 비용을 함께 적고, 예산 알림은 청구 계정 범위로 건다.

## DA-014 (low, security) BYOK 키의 백업 잔존

- **발생 조건:** `DELETE /connections/{id}`는 `secret_ct`를 지운다. 그러나 매일 덤프(14일 보존)와 PITR에는 암호문이 남고, 복호화 키도 같은 프로젝트의 Secret Manager에 있다.
- **영향:** "키 삭제"라는 약속과 실제 보존 기간이 다르다. 프로젝트 권한자는 삭제된 사용자 키를 복원할 수 있다.
- **보완안:** accounts 덤프에서 `secret_ct`를 빼거나 보존 기간을 따로 짧게 둔다. 이 정책은 기능을 열기 전(4-4)에 문서로 남긴다.

## DA-015 (low, failure) 전환 기간 배포 경로 공백

- **발생 조건:** `ops/deploy/targets.json`의 `litellm`은 Phase 5 전까지 VM 드라이버(IAP SSH + `litellm-release.py`)다. 2-6(Day 4)부터 Phase 5(Day 6-7) 사이의 `deploy/litellm` 푸시는 서빙하지 않는 VM만 갱신하고 성공으로 기록된다. Phase 5 뒤에는 반대로 롤백 대상인 VM이 갱신되지 않는다.
- **영향:** 모델 별칭·설정 변경이 운영에 반영되지 않았는데 "배포 성공"으로 남는다. 롤백하면 구 설정으로 서빙한다.
- **보완안:** 2-6부터 Phase 5까지 `deploy/litellm`을 동결하거나 두 대상에 동시에 배포한다. 롤백 런북에 설정 동기화 확인을 넣는다.

---

## 플랜 반영 우선순위(제안)

1. **착수 전 문서 보완:** DA-001(버전 고정 규칙), DA-003(최종 이관·동결 절차), DA-010(백업 무결성·알림·수명주기), DA-007(direct/pooled 이중 등록·PG 버전) — 비용이 거의 들지 않고 데이터 손실을 막는다.
2. **PoC 2-5 항목 추가:** DA-005(보온 ping 24시간 Neon active time), DA-006(웜+정지 조합), DA-009(정지 상태 SIGTERM), DA-011(discovery 5초 기준).
3. **2-6 검증 추가:** DA-012(스테이징 edge 실경로 스모크), DA-002(기동 로그 검증), DA-004(경로별 롤백 리비전 사전 렌더).

## 부록: challenges (구조화)

```json
[
  {
    "id": "DA-001",
    "severity": "high",
    "category": "failure",
    "description": "Caddyfile·LiteLLM 설정을 Secret Manager 볼륨으로 마운트하며 `latest`를 참조하면, `latest`는 인스턴스 기동·파일 읽기 시점에 해석되므로 'edge 이전 리비전 롤백'이 새 Caddyfile을 다시 읽어 무효가 된다. 시크릿 버전 추가만으로 구 라우팅 인스턴스와 신 라우팅 인스턴스(최대 2대)가 공존해 /discovery가 VM SQLite와 Neon에 동시에 기록되는 split-brain, LiteLLM 모델 목록 불일치가 생긴다.",
    "affected_files": [
      "docs/20261009-shared-ai-serverless-migration-plan.md",
      "services/shared-ai-host/main.tf"
    ],
    "recommendation": "모든 시크릿 참조를 숫자 버전으로 고정(Terraform validation으로 latest 금지), 변경=새 버전+새 리비전, 롤백 후보가 참조하는 버전은 Phase 6 전 disable/destroy 금지, 2-6 검증에 '구 리비전으로 traffic 이동 시 실제 VM 라우팅 복귀' 포함."
  },
  {
    "id": "DA-002",
    "severity": "medium",
    "category": "failure",
    "description": "compose.yaml L6·L15의 `/app/platform-config.json` 단일 파일 바인드를 Cloud Run 시크릿 볼륨(디렉터리 마운트)으로 옮기며 `/app`에 마운트하면 LiteLLM 이미지 WORKDIR(`docker/prod_entrypoint.sh`, `schema.prisma`, 확인 필요)이 가려져 서비스·migrate Job 기동 실패. 2-1은 DISABLE_SCHEMA_UPDATE·GRACEFUL_SHUTDOWN_TIMEOUT을 설정 파일에 넣고 스냅샷으로 검증하지만 둘은 env라 무시되고 테스트는 통과한다.",
    "affected_files": [
      "services/ai-gateway/compose.yaml",
      "services/ai-gateway/gateway.py",
      "services/ai-gateway/test_gateway.py"
    ],
    "recommendation": "설정은 /etc/litellm 등 전용 경로에 마운트하고 --config 변경. 두 값은 Cloud Run env로, 검증은 기동 로그(마이그레이션 생략·drain)로."
  },
  {
    "id": "DA-003",
    "severity": "high",
    "category": "edge_case",
    "description": "2-4 이관 → 2-5 PoC(수 시간~수일) → 2-6 전환 사이 VM이 계속 spend 배치·예산 초기화·키 변경을 VM DB에만 기록하므로 전환 시 Neon이 stale(예산 과소 집계로 상한 초과 지출, spend 공백, 키 401/부활). 3-2 복사와 3-4 전환 사이 진행 중 discovery 요청(600초, claim/complete 다단계)은 Cloud Run에서 404/409로 실패하고 Codex 생성 비용이 버려진다.",
    "affected_files": [
      "docs/20261009-shared-ai-serverless-migration-plan.md",
      "services/topic-discovery/service.py",
      "services/topic-discovery/client.mjs"
    ],
    "recommendation": "2-4·3-2는 리허설로 규정하고 전환 직전 동결 이관: /llm 503 유지보수 리비전 → VM gateway flush(≥15초) 후 정지 → 빈 DB로 dump/restore·검증 → 전환. discovery는 POST /discover만 503, active 비움(최대 600초) 후 복사·전환. 동결 시간·소비자 영향을 승인 요청에 명시."
  },
  {
    "id": "DA-004",
    "severity": "medium",
    "category": "failure",
    "description": "리비전 롤백은 누적이라 /discovery 전환 후 /llm 문제로 '이전 리비전'을 고르면 /discovery까지 VM으로 돌아간다. edge가 Terraform 관리라 gcloud traffic 롤백은 다음 apply에서 최신 리비전으로 재전환된다. 롤백 후 VM DB는 Neon 기간 spend·키 변경을 몰라 과지출·회수 키 부활, discovery 이력·per_day·Idempotency-Key가 분기하고 재전환 재이관은 Neon 단독 기간 데이터를 덮어쓴다.",
    "affected_files": [
      "docs/20261009-shared-ai-serverless-migration-plan.md",
      "services/shared-ai-host/main.tf",
      "services/topic-discovery/service.py"
    ],
    "recommendation": "롤백=해당 경로만 VM으로 돌린 새 리비전(사전 렌더). Terraform traffic 정책 명시 또는 롤백 상태 즉시 커밋. 기준 DB·Neon 단독 spend CSV 보존·예산 보정 런북, discovery 역방향 이력 스크립트 또는 손실 명시."
  },
  {
    "id": "DA-005",
    "severity": "high",
    "category": "scalability",
    "description": "5분 보온 ping이 LiteLLM 인스턴스를 살려 두면 내부 스케줄러(예산 초기화 약 600초 등)가 ping CPU 창·요청 중에 DB를 조회해 Neon이 5분 유휴에 도달하지 못한다(최소 약 50% 가동 ≈ 0.25CU×365h ≈ 91 CU-h/월). Free 100 CU-h 소진 시 다음 주기까지 compute 정지 → LiteLLM 기본 차단으로 Hanmadi·Festa·discovery JEV 최대 2주 전면 중단, 같은 기간 백업도 실패. (a)최소 인스턴스·(b)instance 과금도 같으며 §7 비용표에 Neon 증가분이 없다. '70% 경보'는 구현 수단 없음.",
    "affected_files": [
      "docs/20261009-shared-ai-serverless-migration-plan.md"
    ],
    "recommendation": "2-5(e)를 보온 ping 켠 채 ≥24시간 Neon active time 측정, (a)(b)별 Neon CU를 비용표에 추가, litellm 프로젝트는 전환 시점부터 Launch, maintenance에 Neon 사용량 조회로 경보 구현, compute 정지 런북."
  },
  {
    "id": "DA-006",
    "severity": "medium",
    "category": "edge_case",
    "description": "스케줄러가 DB를 건드리지 않는 경우 보온 ping의 상시 상태는 '웜 LiteLLM + 5분 유휴로 정지된 Neon'이다. 정지 시 연결이 끊기고 키 캐시 TTL 60초 경과 후 첫 요청이 DB 조회에서 실패하면 기본 차단으로 401/500, Hanmadi는 자동 재시도하지 않는다. 2-5(a)는 '기동+재개'만 측정한다.",
    "affected_files": [
      "docs/20261009-shared-ai-serverless-migration-plan.md",
      "apps/hanmadi/lib/llm-diagnostics-types.ts"
    ],
    "recommendation": "2-5(a)(e)에 '웜 인스턴스·Neon 10분 유휴 후 첫 요청' 10회 추가, Prisma 재연결·오류율 기록. 실패율>0이면 보온 ping은 대응책에서 제외하고 게이트 재결정."
  },
  {
    "id": "DA-007",
    "severity": "medium",
    "category": "dependency",
    "description": "1-3은 풀러 문자열만 등록한다. prisma migrate deploy는 세션 advisory lock·DDL이라 트랜잭션 풀링에서 잠금 누수·다음 배포 P1002, pg_dump/restore는 비풀러 권장, Prisma는 Neon 재개가 connect_timeout 5초를 넘으면 P1001(pgbouncer=true 필요 여부 TODO(D1)). discovery pg_advisory_xact_lock은 호환되나 CI가 PG 직결이라 psycopg3 prepare_threshold·세션 SET 같은 풀러 전용 문제를 못 잡는다. Neon 기본 메이저가 VM 16과 다르면 pg_dump 버전 불일치.",
    "affected_files": [
      "docs/20261009-shared-ai-serverless-migration-plan.md",
      "services/topic-discovery/service.py"
    ],
    "recommendation": "프로젝트별 direct·pooled 두 문자열 등록(migrate·maintenance·restore=direct), Prisma connect_timeout=15, Neon PG 16 고정, 3-1 CI에 PgBouncer(transaction) 컨테이너 경유 동시성 테스트, SET LOCAL만 사용."
  },
  {
    "id": "DA-008",
    "severity": "medium",
    "category": "failure",
    "description": "virtual key는 SHA-256 해시로 조회되므로(gateway.py L153) 2-4의 /key/info 일치는 salt 일치를 증명하지 않는다. STORE_MODEL_IN_DB=False(compose.yaml L12)·TypeSafe 키 env라 salt 사용처가 거의 없어 echo 줄바꿈 등으로 변형된 salt는 감지되지 않고 나중에 복호화 실패로 드러난다. 복원 소유자와 최소 권한 migrate 역할이 다르면 다음 업그레이드에서 ALTER 권한 오류, 비어 있지 않은 DB 재이관은 중복 키 오류.",
    "affected_files": [
      "services/ai-gateway/gateway.py",
      "services/ai-gateway/compose.yaml",
      "docs/20261009-shared-ai-serverless-migration-plan.md"
    ],
    "recommendation": "암호화 값 보유 테이블 행 수를 세어 salt를 '미사용·미검증' 또는 '복호화 시험 필요'로 기록, 시크릿은 printf/파일로 넣고 길이·해시 앞자리 비교, 소유자=migrate 역할, 재이관은 빈 DB만."
  },
  {
    "id": "DA-009",
    "severity": "medium",
    "category": "failure",
    "description": "Cloud Run 컨테이너 계약상 SIGTERM 후 10초에 SIGKILL(재확인 권장). LiteLLM drain 기본 30초면 종료 flush 전에 SIGKILL로 spend 유실. 8초처럼 조금 짧게 잡으면 flush에 2초만 남고, 15분 유휴 후 축소되는 인스턴스는 Neon 정지 상태라 재개·재연결·백오프가 시간을 넘길 수 있다.",
    "affected_files": [
      "docs/20261009-shared-ai-serverless-migration-plan.md"
    ],
    "recommendation": "drain ≤3초, flush 예산 ≤5초. 2-5(b)에 'Neon 정지 상태 SIGTERM', '스트리밍 중 리비전 교체' 추가. spend 내구성은 주기 배치 기준으로 판정."
  },
  {
    "id": "DA-010",
    "severity": "high",
    "category": "failure",
    "description": "Scheduler는 Job 실행 시작만 성공으로 본다. pipefail 없는 'pg_dump|gzip|업로드'는 pg_dump 실패(버전·풀러·Neon 정지)에도 빈 gz를 올리고 exit 0. 알림이 없고 GCS는 14일 나이 기준 삭제라 무음 실패 14일이면 정상 백업 전멸, Neon Free PITR 6시간이라 이후 사고 복구 불가. 한 Job에 묶인 TTL·예산 보정도 함께 멈춘다. LiteLLM 관리 API 보정은 Job이 internal ingress 허용 출처가 아니라 VPC all-traffic이 필요하고 그러면 NAT 없이 Neon에 못 나가 구조상 불가.",
    "affected_files": [
      "docs/20261009-shared-ai-serverless-migration-plan.md"
    ],
    "recommendation": "set -euo pipefail, custom 포맷+pg_restore --list+크기·행 수 매니페스트, Job 실패 알림+최신 백업 26시간 신선도 경보, 버전 관리+numNewerVersions로 마지막 정상본 보존, Job 분리, 예산 보정은 DB 직접 SQL 또는 별도 VPC Job."
  },
  {
    "id": "DA-011",
    "severity": "medium",
    "category": "dependency",
    "description": "2-6 후 VM discovery의 JEV는 공개 /llm→Cloud Run LiteLLM인데 jev-bridge.mjs L6 timeoutMs:5000이다(2-5(a)는 Hanmadi 12초·Festa 3초만 기준). 콜드 스타트가 5초를 넘으면 후보가 jev_unavailable로 held되고 attempt()가 jevCalls(최대 3)를 선차감한다. bridge가 모든 오류를 jev_unavailable로 뭉개 timeout·401·404 구분 불가, README L222의 JEV 키 2026-11-02 만료가 관찰 기간과 겹치면 전환 회귀로 오인. Phase 3 후 3중 콜드 스타트.",
    "affected_files": [
      "services/topic-discovery/jev-bridge.mjs",
      "services/topic-discovery/service.py",
      "services/topic-discovery/README.md"
    ],
    "recommendation": "2-5(a) 기준에 discovery 5초 추가, bridge가 비밀 아닌 오류 구분을 stderr로 전달, 전환 전 키 만료 확인·연장, /discovery 전환·스모크는 LiteLLM 웜 상태에서."
  },
  {
    "id": "DA-012",
    "severity": "medium",
    "category": "edge_case",
    "description": "run.app 업스트림은 Caddy가 기본으로 원래 Host를 전달해 edge 자신으로 라우팅(404)될 수 있고 internal ingress와 invoker IAM은 별개라 403 가능 — §9 대응(IAM 프록시 +1일)으로 오진 위험. server.py L40은 Transfer-Encoding이면 413이라 추가 GFE hop의 chunked 변환 여부 확인 필요. VM 잔류 경로를 edge에서도 strip하면 이중 strip으로 404. tests/edge.py는 localhost HTTP 1단만 검사. egress all-traffic 자체는 VM 경로를 깨지 않는다(방화벽 출발지 유지, PGA는 main.tf L56에 이미 활성).",
    "affected_files": [
      "services/shared-ai-host/Caddyfile",
      "services/shared-ai-host/main.tf",
      "services/shared-ai-host/tests/edge.py",
      "services/topic-discovery/server.py"
    ],
    "recommendation": "스테이징 edge 또는 --no-traffic 태그 URL로 실제 Cloud Run 경로별 스모크(POST 본문 길이 포함), header_up Host {upstream_hostport} 명시, 백엔드 IAM 방식 Terraform 명시, edge.py에 edge→VM Caddy 2단 사례 추가."
  },
  {
    "id": "DA-013",
    "severity": "low",
    "category": "scalability",
    "description": "Cloud Run·Secret Manager·AR·GCS·Scheduler 무료분은 청구 계정 단위라 같은 청구 계정의 다른 프로젝트 2개 사용분만큼 줄어든다. §7 (b) 산식은 24만 vCPU-초 전액 차감을 가정, 고정 버전 정책으로 시크릿 버전 누적. 프로젝트 단위 예산 알림이면 원인이 안 보인다.",
    "affected_files": [
      "docs/20261009-shared-ai-serverless-migration-plan.md"
    ],
    "recommendation": "게이트 전 세 프로젝트 SKU별 사용량 확인, 무료분 0 가정 최악 비용 병기, 예산 알림은 청구 계정 범위."
  },
  {
    "id": "DA-014",
    "severity": "low",
    "category": "security",
    "description": "DELETE /connections/{id}는 secret_ct를 지우지만 매일 덤프(14일)·PITR에 암호문이 남고 복호화 키도 같은 프로젝트에 있어 삭제된 BYOK 키를 복원할 수 있다.",
    "affected_files": [
      "docs/20261009-shared-ai-serverless-migration-plan.md"
    ],
    "recommendation": "accounts 덤프에서 secret_ct 제외 또는 짧은 별도 보존, 기능 개방(4-4) 전 정책 문서화."
  },
  {
    "id": "DA-015",
    "severity": "low",
    "category": "failure",
    "description": "targets.json의 litellm은 Phase 5 전까지 VM 드라이버라 2-6~Phase 5 사이 deploy/litellm 푸시는 서빙하지 않는 VM만 갱신하고 성공으로 기록된다. Phase 5 후엔 롤백 대상 VM이 갱신되지 않는다.",
    "affected_files": [
      "ops/deploy/targets.json",
      "ops/deploy/litellm-release.py"
    ],
    "recommendation": "2-6~Phase 5 동안 deploy/litellm 동결 또는 이중 배포, 롤백 런북에 설정 동기화 확인."
  }
]
```
