# 플랜 검증 리포트

> 개정 전 초안을 대상으로 한 리뷰다. 반영 결과는 `docs/20261009-shared-ai-serverless-migration-plan.md` 부록 B에 있다.

> 검증 대상: `docs/20261009-shared-ai-serverless-migration-plan.md` (worktree, origin/main `7c257fe` 기준)
> 검증 시각: 2026-10-09T04:02:44Z
> 전체 등급: **WARNING** (CRITICAL 0 · WARNING 9 · INFO 11)
> 범위: 마스터 플랜(전략부)으로 검토했다. Phase별 TDD 코드 단계가 없는 것은 결함으로 보지 않았다. `.claude/flow.config.json`이 없어 기본 체크만 적용했다. 네트워크·유료 호출은 하지 않았다. §8의 외부 단가·약관과 운영 실측값은 검증하지 않았다.

## 검증 결과 요약

| ID | 등급 | 위치 | 문제 | 권고 |
|----|------|------|------|------|
| CHK-001 | WARNING | Goal·§4 ↔ Phase 3·4 | "계약 유지 + 인프라 전환" 목표가 Phase 4의 `codex` 의미 변경, Phase 3의 미배포 앱 버전 상승과 충돌한다 | W1, W9 |
| CHK-002 | WARNING | Phase 1-2·4·5 | 플랜이 언급하지 않은 LIVE 소비자가 있다: `platform-deploy.yml`, `hanmadi-model-connections.yml`, `ai-gateway.yml`, `accounts.mjs`, Terraform edge 자원 | W1, W4, W8 |
| CHK-003 | PASS | 전체 | 모호 표현 없음. "(필요 시)"는 PoC 결과에 따른 조건부 작업이다 | - |
| CHK-004 | WARNING | §5·§9·2-5 | 콜드 스타트 판정 기준이 실제 클라이언트 제한과 맞지 않고, 측정 시나리오 하나가 빠져 있다 | W6 |
| CHK-005 | WARNING | Phase 4 스키마 | 금지 경로(dist/·node_modules/)는 수정하지 않는다. 다만 프로젝트 규칙 "계약 append-only·의미 변경 금지"(CLAUDE.md, 플랜 §4)를 어길 소지가 있다 | W1 |
| CHK-006 | PASS | Phase 3·5 | 기존 Cloud Run 배포 드라이버나 Postgres 저장소가 없어 중복이 아니다(`apps/hanmadi/DEPLOY.md`는 수동 배포 가이드) | - |
| 추가 표준 | INFO | 요구·분석 산출 | REQ 상세 스펙과 허들 카드 형식이 없다. 방향은 사용자 결정으로 이미 확정됐다 | I11 |

## CRITICAL 항목 (즉시 수정 필요)

없음.

## WARNING 항목 (권고 수정)

### W1. accounts v2가 클라이언트 계약과 모순된다 (CHK-001·002·005)
- 플랜의 주장: §4(86행) "litellm-client accounts 계약 불변", Phase 4(150행) "현재 API 계약 그대로", 165행 `codex = OpenAI API 키`, 180행 "OpenAI·Anthropic API 키 경로만 남긴다".
- 코드 실제: v1에는 OpenAI API 키 경로가 없다.
  - 서버는 codex+apiKey를 `use_official_device_login`으로, codex+authMethod를 `invalid_auth_method`로 거부한다(`services/ai-gateway/account_service.py:308,314-315`).
  - 클라이언트도 같은 입력을 전송 전에 거부한다(`packages/litellm-client/accounts.mjs:75,77`).
  - v1의 구독 로그인 요청은 `{provider:'codex'}`(authMethod 없음)이다. 154행의 `authMethod:'device'`는 v1에 없는 값이라 서술이 부정확하다.
- 422 `unsupported_auth_method`는 클라이언트가 그대로 전달하는 상태 코드 목록 [400,401,403,404,409,429] 밖이다. 그래서 502 `connection_backend_error`로 바뀌어 보인다(`accounts.mjs:60-61`). "명시적 오류 코드로 거부"라는 목표를 달성하지 못한다.
- 기존 `codex` 값을 구독 로그인에서 API 키로 바꾸는 것은 append-only 규칙의 "의미 변경 금지"와 충돌한다.
- 4-4(182행) 사실 보정이 필요하다.
  - Claude API 키 입력 UI는 이미 있다(`apps/hanmadi/components/v2-app.tsx:648,746`).
  - Codex 버튼은 ChatGPT 기기 로그인이다(`v2-app.tsx:622,630`). v2에서 함께 막거나 교체해야 한다.
- 권고(둘 중 하나):
  - 새 provider 값(예: `openai`)을 서버와 클라이언트에 append한다(`accounts.mjs:13,72`, `accounts.d.mts:3`). Phase 4 파일 목록에 `packages/litellm-client`를 넣는다. `codex`는 구독 전용 값으로 남기고, 기존 매핑 안의 400과 명시 코드로 거부한다.
  - v2 범위를 Claude API 키로 줄인다.

### W2. accounts v1 상태 의미와 불변식이 v2 설계에서 빠졌다
- 만료 처리:
  - v1은 만료 시 `state='expired'`로 행을 남기고 비밀만 지운다. 이후 chat은 409다(`account_service.py:59-62`, `tests/test_accounts.py:117-127`, `ACCOUNTS.md:49,65`).
  - 157행 "TTL 만료 연결 삭제"가 행 삭제를 뜻하면 응답이 404 `connection_not_found`로 바뀐다.
- "provider당 활성 연결 1개" 불변식:
  - v1은 이를 409 `disconnect_before_reconnecting`으로 지킨다(`account_service.py:110-113`).
  - 플랜 스키마(160-175행)에는 이 불변식을 강제하는 제약이 없다. 인스턴스가 2개 이상이면 경합이 생긴다.
  - `UNIQUE (platform, subject, provider) WHERE state <> 'disconnected'` 같은 부분 유일 인덱스가 필요하다.
- 응답 코드와 시간 제한:
  - v1의 POST 응답은 202이고 테스트도 202를 기대한다(`account_service.py:326`, `test_accounts.py:38`). v2에서 유지할지 명시해야 한다.
  - 동기 검증으로 바꾸면 클라이언트 10초 제한(`accounts.mjs:59`)과 콜드 스타트를 함께 고려해야 한다.

### W3. 컷오버 때 정방향 데이터 공백을 다루지 않는다 (원칙 5)
- LiteLLM:
  - 순서는 2-4 덤프(129행) → 2-5 PoC(130행) → 2-6 전환(131행)이다. 그 사이 VM에 쌓이는 spend 기록, 예산 초기화, 키 변경은 새 DB로 오지 않는다.
  - 롤백 문단(135행)은 반대 방향(새 DB → VM)만 다룬다.
  - PoC의 시험 호출과 `budget_reset_at` 조작이 운영에 쓸 DB에 섞인다.
- discovery: 3-2 이관(142행)부터 3-4 전환(144행)까지 생긴 history와 active 행도 같은 공백이 생긴다.
- 권고:
  - 전환 직전 쓰기 동결과 최종 재이관(또는 차이 측정·보고)을 Phase별 완료 기준에 넣는다.
  - PoC는 Neon 브랜치처럼 분리된 DB에서 한다.

### W4. Cloud Run 자원 소유권과 설정 버전 고정이 정해지지 않아 롤백·재적용이 위험하다
- edge는 Terraform이 관리하고, 컨테이너 인자에 VM IP가 고정돼 있다(`services/shared-ai-host/main.tf:137-170`, `:160`).
- 1-1은 같은 루트 모듈에 자원을 추가한다(117행). 2-6과 Phase 5는 edge를 수동 또는 파이프라인으로 바꾼다(131, 188-189행).
- 그 뒤 실행하는 `terraform apply`가 edge를 VM 패스스루로 되돌릴 수 있다. 그러면 `/llm`이 조용히 VM의 옛 DB로 돌아간다.
- 원칙 2 "edge 리비전 교체로 롤백"(63행)이 성립하려면 조건이 있다. Caddyfile과 LiteLLM 설정을 Secret Manager 볼륨으로 둔다면(56, 126행) 리비전마다 시크릿 버전을 고정해야 한다. `latest`를 참조하면 리비전을 되돌려도 설정은 그대로다.
- 파이프라인이 설정 버전을 올리려면 배포 SA에 시크릿 단위 `secretmanager.secretVersionAdder`가 필요하다. 1-2(118행)의 역할 목록에 없다.
- `gateway.py render`는 비공개 `.env`를 읽는다(`gateway.py:50`). 설정을 어디서 렌더할지도 정해지지 않았다.
- 권고:
  - 서비스별로 Terraform과 파이프라인 중 누가 무엇을 관리할지, `lifecycle.ignore_changes` 범위를 어디까지 둘지 정한다.
  - 리비전별 시크릿 버전 고정과 edge용 커밋별 이미지(caddy+Caddyfile) 빌드 중 하나를 고른다.

### W5. VM을 폐기한 뒤 LiteLLM을 관리할 경로가 없다
- 지금은 IAP SSH로 들어가 루프백 주소에서 관리한다(`ai-gateway/compose.yaml:14`, `gateway.py:106-109,183`, `ops/deploy/gcp-identity/main.tf:52-67`).
- 전환 후의 제약:
  - LiteLLM은 internal ingress다.
  - edge는 관리 경로를 404로 막는다.
  - Phase 6에서 VM과 IAP 권한을 회수한다(198-199행).
- 다음 작업을 실행할 위치가 플랜에 없다: 2-4 `/key/info` 검증(129행), 2-5(c) 시험 키, 예산 초기화 보정(130행), 이후 앱 키 발급(`gateway.py provision`).
- 권고: VPC egress `all-traffic`를 쓰는 관리용 Cloud Run Job 같은 접근 경로와 권한을 Phase 1 또는 5 산출물로 정한다.

### W6. 콜드 스타트 게이트 기준이 실제 클라이언트 제한과 맞지 않는다 (CHK-004)
- §5 #2(95행)는 Festa 3초와 Hanmadi 12초를 들지만, §9 신호는 "p95 > 10초"다(293행).
- 운영 중인 discovery의 JEV 호출 제한 5초가 빠져 있다(`services/topic-discovery/jev-bridge.mjs:6`). 이를 넘기면 후보가 `held`/`jev_unavailable`로 끝난다(`service.py:761-768`). Shopshorts와 블로그 경로의 LIVE 기능이 떨어진다.
- 권장 구성은 보온 ping과 Neon Free다. Free는 5분 유휴 후 자동 중지되고 해제할 수 없다(256행). 그래서 가장 흔한 상태는 "LiteLLM은 따뜻하고 Neon은 중지돼 Prisma 연결이 끊긴" 상태다. 이 상태의 첫 요청 지연과 오류가 2-5 측정 항목 (a)(e)에 없다.
- 권고: 판정 기준을 소비자별 최소 제한(3초/5초/12초)으로 두고, 위 시나리오를 2-5에 추가한다.

### W7. Neon 연결 문자열을 풀러용만 등록한다 (누락 비밀값)
- 1-3은 풀러 연결 문자열만 등록한다(119행).
- 다음 작업은 PgBouncer 트랜잭션 모드에서 실패하거나 불안정하다고 알려져 있어 직접(비풀러) 연결이 필요하다. 오프라인이라 공식 문서 재확인은 `TODO(D1)`이다.
  - `litellm-migrate`의 `prisma migrate deploy`(127행)
  - `pg_dump`/`pg_restore`(120, 129행)
- 권고:
  - DB마다 pooled와 direct 문자열 2종을 비밀 목록에 넣고 용도를 고정한다.
  - LiteLLM(Prisma) 런타임이 풀러와 함께 동작하는 데 필요한 파라미터도 `TODO(D1)`로 확인한다.

### W8. LIVE CI·배포 소비자가 빠졌다 (CHK-002)
- `.github/workflows/platform-deploy.yml`:
  - 브랜치 목록과 dispatch 선택지(4, 11행)에 새 대상이 없다.
  - `matrix.driver == 'gcp'` 조건(56, 61, 69, 74행) 때문에 새 드라이버는 Cloudflare 자격 단계를 실행하고 GCP 인증은 건너뛴다.
  - 새 deploy 브랜치는 보호 설정이 필요하다(`ops/deploy/deploy.mjs:118`).
- WIF:
  - 조건이 ref와 workflow_ref 하나로 고정돼 있다(`gcp-identity/main.tf:34`).
  - repository_id principalSet으로 SA 하나를 쓴다(`:37-46`). 브랜치를 4개로 넓히면 어느 브랜치든 모든 서비스를 배포할 수 있게 된다.
  - `attribute.ref` 매핑과 대상별 SA를 쓰기를 권한다.
- `.github/workflows/hanmadi-model-connections.yml`:
  - 실제 `account_service.create_app`과 codex 기기 로그인 흐름으로 스모크를 돌린다(23, 31행; `apps/hanmadi/scripts/model-connections-smoke.mjs:29-33,105`).
  - `Dockerfile.accounts` 이미지에서 `claude --version`과 `test_claude_code.py`를 실행한다(38-47행).
  - 둘 다 4-2·4-3(180-181행)을 적용하면 깨진다.
- `.github/workflows/ai-gateway.yml:38-69`의 구독 워커 통합 단계는 D5 폐기와 함께 정리해야 한다.

### W9. Phase 3가 미배포 앱 버전 상승을 인프라 전환과 묶는다 (CHK-001)
- 운영 discovery는 v1.1 릴리스 `3857765`다(`services/topic-discovery/README.md:3,191`). 해당 커밋의 `service.py`에는 `VERSION = "discovery-v1.1"`이 있다.
- main에는 v1.2, v2.x, native review가 들어 있고, README는 이를 "미배포, 클라이언트와 공동 배포 필요"라고 적는다(README:3,17). `3857765` 이후 `services/topic-discovery` 변경은 2,386줄 추가다.
- Phase 3-1은 main+#161 위에서 작업하고, 3-3에서 그대로 배포한다.
- 그러면 3-4 스모크에서 인프라 회귀와 루브릭 변화를 구분할 수 없다. "API 계약 유지" 목표와도 어긋난다.
- 권고(둘 중 하나):
  - 운영 릴리스에 `PostgresStore`만 얹어 인프라만 전환한다.
  - 버전 상승을 별도 승인 릴리스로 명시하고, 수용 기준과 클라이언트 공동 배포 순서(README:17,200)를 Phase 3에 넣는다.

## INFO 항목

- **I1.** 1-1의 "프록시 서브넷 Private Google Access" 추가는 필요 없다. 이미 켜져 있다(`main.tf:56`). edge SA `shared-ai-proxy`도 이미 있으니(`main.tf:132-136`) 재사용할지 명시한다.
- **I2.** 과도기 edge 설정:
  - 방화벽은 VM:8080만 허용하고(`main.tf:68-77`) VM Caddy가 접두사를 뗀다(`Caddyfile:8`). 그래서 VM으로 보내는 경로는 접두사를 유지한 채 보내야 한다.
  - Cloud Run 업스트림은 https와 `header_up Host {upstream_hostport}`가 필요하다.
  - `tests/edge.py`는 로컬 HTTP 가짜 업스트림을 써서(`edge.py:51-56`) 이런 문제를 잡지 못한다. 트래픽을 받지 않는 태그 리비전으로 먼저 검증한다.
  - 다이어그램의 `/llm/v1/*`(45행)를 와일드카드로 바꾸지 말고 현행 6개 허용목록(`Caddyfile:6`)을 유지한다.
- **I3.** internal 백엔드의 invoker 방식(allUsers 또는 `invoker_iam_disabled`)이 명시돼 있지 않다. Caddy는 ID 토큰을 붙일 수 없다. 지금은 루프백에서만 열리는 LiteLLM 관리 엔드포인트(`compose.yaml:14`)가 VPC 안에서 닿게 되므로 master key에 의존한다는 점을 명시한다.
- **I4.** LiteLLM 최대 인스턴스가 2다. Redis가 없으면 키 RPM 30(`gateway.py:139,163`)이 인스턴스마다 따로 집계된다. 최대 1을 검토하거나 의미 변화를 기록한다.
- **I5.** Phase 6:
  - VM의 `deletion_protection = true`(`main.tf:110`)도 해제해야 한다.
  - `KEEP_AUTO_SNAPSHOTS`(`main.tf:98`) 설정으로 디스크를 지운 뒤에도 자동 스냅샷이 남는다. 이를 지우지 않으면 완료 기준(201행)을 못 맞춘다.
- **I6.** D5·D6 코드 정리를 맡은 태스크가 없다.
  - 정리 대상: `gateway.py:82-83`(routes import), `litellm-release.py:15`, `subscriptions*.py`, `account_worker.py`, `claude_code.py`, `services/dify`, `dify.yml`, `hanmadi-dify.yml`.
  - Hanmadi는 DIFY_* 변수가 있으면 Dify를 자동으로 고른다(`apps/hanmadi/lib/conversation-provider.ts:18-19`). Dify 경로를 404로 바꾸기 전에 운영 변수를 확인해야 한다(검증 필요).
- **I7.** discovery Postgres 전환:
  - `PostgresStore`는 DB 드라이버가 필요한데, 이미지는 pip 없이 표준 라이브러리만 쓴다(`topic-discovery/Dockerfile:1-2`, `service.py:8`). 이미지와 CI import 검사(`topic-discovery.yml:28-29`)를 고쳐야 한다.
  - 테스트가 SQLite Store를 직접 만든다(`test_service.py:26,121,531,697`).
  - SQLite `BEGIN IMMEDIATE`는 DB 전체를 직렬화한다. 그래서 "scope는 다르고 플랫폼이 같은 요청의 예산 경계" 동시성 테스트를 추가한다(`service.py:143,158`).
- **I8.** 순서:
  - 2-2는 배포 파이프라인이 migrate Job을 실행한다고 가정하지만(127행) 파이프라인은 Phase 5(188행)에 만든다. Phase 2~4 배포가 수동이라는 점을 명시한다.
  - 1-4 복원 리허설은 빈 DB로 하게 되어 의미가 작다. 2-4 뒤에 다시 한다.
- **I9.** 빠진 기준과 목록:
  - Phase 2 게이트에 수치 기준이 없다(133행).
  - Neon 70% 경보(294행)를 설정할 태스크가 없다.
  - 비밀값 목록이 없다. `TYPESAFE_API_KEY`(`.env.example:19`)와 `STORE_MODEL_IN_DB`·`LITELLM_TELEMETRY`(`compose.yaml:12-13`)의 이월을 포함해야 한다.
- **I10.** 비용 계산에 중복 활성 시간이 빠졌다. 한 요청이 edge·LiteLLM·discovery를 함께 점유하고, discovery는 JEV 호출을 공개 edge로 다시 보낸다. 트래픽 상한에서는 요청 기반 무료 등급을 몇 달러 넘을 수 있다. 결론은 바뀌지 않는다.
- **I11.** 요구·분석 산출 표준(REQ 상세 스펙, 허들 카드)에 맞는 별도 문서가 없다. 방향은 사용자 결정으로 확정된 실행 마스터 플랜이므로 CRITICAL로 보지 않았다.

## 사실 대조 결과

플랜의 다음 주장은 코드와 일치한다.
- edge 라우팅과 404(`services/shared-ai-host/Caddyfile:6-62`)
- Cloud Run edge의 VM:8080 패스스루(`main.tf:137-178`)
- machine_type 허용값(`main.tf:15-22`)
- 고정 이미지의 LiteLLM 버전 1.102.1(`services/ai-gateway/README.md:104`)
- 앱 키 정책(`gateway.py:138-139,161-163`)
- discovery 트랜잭션, `UNIQUE(scope,idem)`, 600초 만료, 플랫폼 일일 예산(`service.py:75-82,143-165`)
- discovery Python 테스트 77개(17+6+54)
- Hanmadi JEV 제한 12초(`apps/hanmadi/lib/video-provider.ts:352`)
- accounts v1의 SQLite·Fernet·fcntl·서브프로세스·920초·60초 루프(`account_service.py:17,136-145,181-194,219-223`)
- 현행 배포 경로(`deploy.mjs:44-52`, `litellm-release.py:76-79`)
- Hanmadi의 `claude-code` 전송(`v2-app.tsx:502`)
- 계정 상태 6종(`accounts.mjs:4`)

다음은 오프라인이라 검증하지 않았다: 운영 실측값(CPU·메모리·사용 기록), Festa 3초 제한, 블로그 워크플로(다른 저장소), §8 외부 단가와 약관.

## 종합 의견

목표, Phase 구성, 측정 게이트, 경로별 롤백 원칙은 서로 맞고, 코드에 관한 사실 주장도 대부분 정확하다. 다만 세 가지가 남아 있다.
- accounts v2가 플랜 스스로 정한 클라이언트 계약 불변 원칙과 모순된다.
- discovery 전환이 미배포 앱 버전 상승을 함께 가져온다.
- 컷오버 데이터 공백, Terraform 소유권, 관리 경로 같은 운영 절차가 비어 있다.

Phase 2 착수 전에 W3~W7을, Phase 3·4 상세 계획을 쓰기 전에 W1·W2·W8·W9를 반영하기를 권한다.
