# 공용 AI(shared-ai) 서버리스 전환 계획

> **실행 방식:** 이 문서는 마스터 플랜(전략부)이다. 각 Phase를 착수할 때 `docs/plans/<YYYYMMDD>-serverless-p<N>-<이름>.md`로 TDD 태스크 단위의 상세 계획을 따로 작성한 뒤 실행한다. 서브시스템이 서로 독립적이므로 한 문서에 모든 코드 단계를 담지 않는다.

**작성:** 2026-10-09. 사용자 결정 「accounts를 서버리스에 맞게 재설계하고 전부 서버리스로 전환」에 따른 계획이다. 같은 날 리뷰 패널 3종(정합성·실패 시나리오·일정 현실성)의 지적을 반영해 개정했다. 반영 내역은 부록 B에, 리뷰 원문은 `docs/qa/20261009-serverless-plan-review.md`·`docs/qa/20261009-serverless-plan-debate.md`에 있다.
**근거:** `origin/main` `7c257fe` 코드·문서 조사, 운영 VM 실측(10/09), 공식 문서 확인(§8).

**Goal:** GCE VM `shared-ai`를 없앤다. 공개 URL과 API 계약을 유지하면서 LiteLLM·discovery·accounts를 유휴 시 0대로 줄어드는(scale-to-zero) 서버리스로 옮긴다. 인프라 비용과 VM 운영 부담(OS·디스크·SSH 배포)을 함께 줄인다. 서버리스를 계속할지는 Phase 2 스테이징 측정으로 VM 축소안과 비교해 확정한다.

**Architecture:** GCP Cloud Run을 쓴다. 공개 엣지(`shared-ai` Caddy 서비스)는 유지하되 Caddyfile을 넣은 이미지로 바꾸고, 업스트림을 VM에서 내부 전용 Cloud Run 서비스로 경로별로 옮긴다. 상태는 관리형 Postgres(Neon Launch, LiteLLM DB는 측정에 따라 Cloud SQL)로 옮긴다. 비밀값은 Secret Manager에 숫자 버전으로 고정한다. 비밀이 없는 설정은 이미지에 넣어 리비전과 함께 되돌린다. accounts는 API 키 전용 무상태 서비스로 재설계하되 VM 폐기와 분리한다.

**Tech Stack:** Cloud Run(서비스·Job), Cloud Scheduler, Cloud Monitoring, Secret Manager, Artifact Registry, GCS, GitHub Actions(WIF), Neon Postgres 16(대안 Cloud SQL), Caddy, LiteLLM proxy(현행 1.102.1 digest 고정), Python(discovery·accounts).

## 1. 현재 상태 (2026-10-09 실측·조사)

| 구성요소 | 위치 | 상태·실측 |
|---|---|---|
| VM `shared-ai` | GCE e2-standard-2, pd-balanced 80GB, us-central1-a | **10/09 06:13 사용자 계정으로 정지.** 지난 14일 CPU 평균 12%·최대 27% |
| edge | Cloud Run `shared-ai`(공개 caddy 이미지, `reverse-proxy --to <VM IP>:8080` 인자, Terraform 관리, `allUsers`) → Direct VPC(egress `PRIVATE_RANGES_ONLY`, 프록시 서브넷 /26, Private Google Access 켜짐) → VM Caddy | VM Caddy가 접두사를 떼고 `/llm/*`(허용목록 6개), `/discovery/*`, `/accounts/*`, Dify 경로, `/health`를 라우팅한다. 그 외 404 |
| LiteLLM + Postgres 16 | VM(:4100, 루프백) | 메모리 638MiB(+DB 53MiB). 앱별 가상 키(팀·모델 허용목록·30일 예산·RPM 30), JEV(TypeSafe) 패스스루, Gemini native `generateContent`, ElevenLabs STT/TTS. `STORE_MODEL_IN_DB=False`. 관리 작업은 IAP SSH 뒤 루프백에서 `gateway.py`로 한다 |
| topic-discovery | VM(:4195), SQLite | 70MiB. **운영 이미지는 `7e9d866`(PR #156 머지, 코드 `discovery-v1.2`)**이다. README의 "v1.1(`3857765`)"은 오래된 기록이다(Phase 0 확인). main의 v2.x·native review는 미배포다(클라이언트와 공동 배포 필요). DB 행 수는 requests 11, active 0, action_results 8. `BEGIN IMMEDIATE`, scope 잠금, 멱등성, 일일 예산. JEV는 node bridge로 호출한다(클라이언트 제한 5초, 서브프로세스 12초). 운영 JEV 키 만료 **2026-11-02 06:00 UTC**. 자동 백업 없음, 수동 배포 |
| accounts v1 | VM(:4190), SQLite + Fernet | 68MiB. **실사용자 없음**(Hanmadi 변수 미주입). 행은 9/29 QA 연결 15건뿐이다: festa claude(connected 1·disconnected 5), festa codex(connected 1·disconnected 4), hanmadi codex(disconnected 3·error 1). `codex`는 ChatGPT 기기 로그인 전용이다(API 키는 400). `claude`는 API 키 또는 `claude-code` 로그인이다. POST는 202를 돌려주고 비동기로 검증한다. provider당 미해제 연결은 1개(409)이고, 만료되면 행을 남긴 채 `expired`로 바꾼다. fcntl 잠금, 서브프로세스, 최대 15분 로그인, 60초 정리 루프 |
| Dify | VM(:4180) | **10/09 중지**(재시작 정책 `no`, 데이터 보존). 운영 미사용: nginx 접근 로그에 9/27~28 구축·QA 호출만 있고 그 뒤 API 호출 0건 |
| 배포 | (설계만) `deploy/litellm` → WIF(단일 SA) → IAP SSH → `litellm-release.py`(pg_dump·롤백) | **WIF는 적용된 적이 없어(Phase 1 확인) `deploy/litellm` 자동 배포는 동작한 적이 없다.** 실제 배포는 모두 수동이다. Terraform은 수동으로 apply한다. **shared-ai-host state는 저장소를 옮기기 전 위치(iCloud `IdeaProjects/97.개인/workSpace/commerce-automation-kit/data/shared-ai/`)에 있다**(serial 16, 2026-09-27). WIF 모듈(`ops/deploy/gcp-identity`)은 state가 없는데, 적용된 적이 없기 때문이다 |
| 비밀값 | VM `.env`(0600), Cloudflare `cak-credential-broker`(discovery 클라이언트 키·JEV 키) | Secret Manager 미사용 |
| 백업 | 디스크 스냅샷 매일 7일, LiteLLM은 배포 때 pg_dump | discovery·accounts 논리 백업 없음 |

소비자(공개 URL `https://shared-ai-d5cy7m6i7q-uc.a.run.app`):

| 소비자 | 사용 기능 | 지연 제한 |
|---|---|---|
| Hanmadi (Vercel) | chat, STT/TTS, 영상 분석(Gemini native), JEV, 일일 진단 cron. `AI_ACCOUNTS_*` 미주입 | JEV 12초. 중복을 막으려고 자동 재시도하지 않음 |
| Festa (Cloudflare Pages) | `AI_PROVIDER=litellm`일 때 chat, JEV shadow | JEV shadow 3초. venture-studio#69가 머지되면 응답 뒤(`waitUntil`) 실행 |
| topic-discovery | 공개 `/llm`으로 JEV 호출(`JEV_BASE_URL`은 Phase 0에서 확인) | bridge 5초. 넘으면 후보가 `held`(`jev_unavailable`)로 끝남 |
| Shopshorts 워커·블로그 Actions | `/discovery`만 사용(블로그 워크플로 2곳에 URL 하드코딩) | — |
| Replay, Dify | 실사용 없음 | — |

## 2. 목표 구조

```text
Hanmadi · Festa · Shopshorts 워커 · 블로그 Actions
        │  https://shared-ai-d5cy7m6i7q-uc.a.run.app   (변경 없음)
        ▼
Cloud Run `shared-ai` (edge: caddy digest + Caddyfile 내장 이미지, 현행 허용목록, 관리 경로 404)
        │  egress all-traffic(기존 프록시 서브넷) → 백엔드 internal ingress, invoker IAM 해제(명시)
        ├─ /llm/ 현행 허용목록 6개               → Cloud Run `litellm`    (LiteLLM digest + 설정 내장, 최대 1)
        ├─ /discovery/v1/discover[...]          → Cloud Run `discovery`  (최대 2)
        ├─ /accounts/*                          → 404 (v1 폐기) → Phase 7 뒤 Cloud Run `accounts`
        ├─ Dify 경로                             → 404 (폐기)
        └─ /health                              → edge
Cloud Run Job `litellm-migrate` — 배포 때만 `prisma migrate deploy`. 서비스는 시작 시 마이그레이션 생략
Cloud Run Job `litellm-admin`   — VPC all-traffic. 키 발급·조회, (필요 시) 예산 보정. VM 폐기 뒤 유일한 관리 경로
Cloud Run Job `maintenance`     — 매일. 단계별로 독립 실행: DB별 백업·검증 → GCS, (Phase 7) accounts 만료 정리
Cloud Scheduler                 — maintenance(매일), litellm 보온 ping(게이트 결과에 따라)
Cloud Monitoring                — Job 실패, 백업 신선도(26시간) 알림 → 메일
Postgres 16                     — Neon Launch: discovery·accounts·litellm(활성 시간이 길면 litellm만 Cloud SQL db-f1-micro). 모든 연결 direct
Secret Manager                  — 비밀값만. 숫자 버전으로만 참조(`latest` 금지)
Artifact Registry               — 이미지 edge·litellm·discovery·maintenance(+accounts). 이미지별 최근 5개 보관
GitHub Actions(WIF)             — 이미지 빌드·푸시(로컬 Docker 없음). Phase 5부터 배포 자동화
```

설계 원칙:

1. **공개 URL·경로·인증 계약 유지.** 소비 앱은 환경변수를 바꾸지 않는다. LiteLLM DB를 같은 master·salt 키로 이관해 기존 앱 키와 JEV 키를 그대로 쓴다.
2. **경로 단위로 전환하고, 롤백도 정방향 배포로 한다.** 리비전을 되돌리면 그 뒤에 한 다른 경로의 전환까지 함께 되돌아간다. 그래서 전환마다 "해당 경로만 VM으로 돌린" edge 이미지를 미리 빌드해 두고, 롤백할 때 그 이미지를 배포한다.
3. **설정은 리비전에 고정한다.** 비밀이 없는 설정(Caddyfile, LiteLLM config)은 이미지에 넣는다. 비밀값은 숫자 버전으로 참조한다. 리비전을 되돌리면 설정도 함께 되돌아간다.
4. **자원 소유권을 나눈다.** Terraform은 서비스 골격(SA, ingress, 스케일, env 이름, 시크릿 버전)을 맡는다. 파이프라인은 이미지 digest와 트래픽을 맡는다(`lifecycle.ignore_changes`). 그래서 `terraform apply`가 라우팅을 되돌리지 않는다.
5. **상태는 컨테이너 밖에 둔다.** 로컬 SQLite·파일 잠금·메모리 상태를 DB 트랜잭션으로 바꾼다.
6. **응답 뒤 백그라운드 작업에 기대지 않는다.** CPU는 요청 처리 중과 종료 유예 10초에만 할당된다. 주기 작업은 Scheduler와 Job으로 옮긴다.
7. **실패를 숨기지 않는다.** 이관·전환·사용 기록·백업 누락은 측정하고 보고한다.

검토했으나 채택하지 않은 안:

- **LiteLLM을 관리형 AI Gateway(Cloudflare·Vercel)로 교체.** JEV 패스스루, YouTube URI를 그대로 넘기는 Gemini native 호출, OpenAI 형태의 ElevenLabs 음성, 팀·키 예산을 다시 만들어야 한다. 소비 앱 코드도 바꿔야 한다.
- **GCE 무료 등급 e2-micro로 VM 유지.** 메모리 1GB에 현재 상주 약 0.8GB와 OS를 담을 수 없다.
- **Neon 풀러(PgBouncer).** 서비스 인스턴스가 적어 연결이 수십 개 이하다(0.25 CU 한도 97개). 그래서 풀러의 이점이 없다. 반면 pg_dump·Prisma 마이그레이션·세션 설정과는 맞지 않는다(§8.1).

비밀값과 환경변수(이름만):

| 서비스 | Secret Manager | 일반 env |
|---|---|---|
| litellm | `LITELLM_MASTER_KEY`, `LITELLM_SALT_KEY`, `DATABASE_URL`(direct, `connect_timeout=15`), `HANMADI_CHAT_API_KEY`, `REPLAY_CHAT_API_KEY`, `FESTA_CHAT_API_KEY`, `ELEVENLABS_API_KEY`, `TYPESAFE_API_KEY` | `STORE_MODEL_IN_DB=False`, `LITELLM_TELEMETRY=False`, `DISABLE_SCHEMA_UPDATE=true`, `GRACEFUL_SHUTDOWN_TIMEOUT=3` |
| discovery | `DISCOVERY_DATABASE_URL`(신규), `DISCOVERY_PLATFORM_KEYS`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `JEV_API_KEY` | `JEV_BASE_URL`, `DISCOVERY_REQUESTS_PER_DAY` |
| litellm-admin | `LITELLM_MASTER_KEY` | 내부 litellm URL |
| maintenance | DB별 direct URL | 버킷 이름 |

`POSTGRES_PASSWORD`와 `GATEWAY_DOMAIN`은 VM 전용이라 폐기한다. 모델 이름·API base처럼 비밀이 아닌 값은 저장소의 설정 파일로 옮겨 이미지 렌더에 쓴다.

## 3. 결정 사항 (착수 전 사용자 확인)

| ID | 결정 | 권장 | 근거 |
|---|---|---|---|
| D0 | 전환 기간 VM 운영 | **e2-small로 줄여 다시 켬** | 지금 Hanmadi·Festa의 AI 기능이 멈춰 있다. 데이터 이관과 롤백 대상으로도 VM이 필요하다. 축소만으로 월 약 $60이 $16~24(추정)로 준다 |
| D1 | 플랫폼 | **GCP Cloud Run** | 컨테이너를 다시 쓸 필요가 없다. 기존 프로젝트·VPC·edge·WIF를 재사용하고 무료 등급이 있다. Cloudflare Containers는 기본료 월 $5와 휘발성 디스크라 이점이 없다 |
| D2 | Postgres | **운영은 Neon Launch, PG 16, direct 연결.** litellm DB는 Phase 2에서 잰 활성 시간이 하루 약 12시간 이상이면 Cloud SQL db-f1-micro(Cloud Run 기본 소켓 연결). Neon Free는 스테이징 PoC에만 쓴다 | Free는 월 100 CU-시간을 다 쓰면 다음 주기까지 compute가 정지돼 게이트웨이 전체가 멈춘다. 상업적 사용 허용 여부도 미확인이다. Launch는 기본료 없는 사용량 과금이다. 하루 12시간이면 0.25 CU × 365시간 × $0.106 ≈ $9.7로 Cloud SQL($9.4)과 비슷하다 |
| D3 | edge | **기존 서비스를 Caddyfile 내장 이미지로 바꿔 경로별 라우터로 유지** | URL이 바뀌지 않고 관리 경로 차단도 유지된다. `tests/edge.py`를 재사용한다. 이미지 digest가 라우팅을 고정하므로 리비전을 되돌리면 설정도 되돌아간다 |
| **D4** | **accounts** | **API 키 연결 전용으로 재설계하고 VM 폐기와 분리.** 폐기 때 `/accounts`는 404로 바꾸고, v2는 크리티컬 패스 밖의 Phase 7에서 만든다. `openai` provider를 추가하고, `codex`는 구독 로그인 값으로 남겨 400으로 거부한다 | 제공사 원문(§8.2): Anthropic은 사용자 대신 구독 자격으로 요청하거나 Claude.ai 자격·세션 토큰을 수집·저장·중개하는 것을 허용하지 않는다. OpenAI가 제3자 앱에 ChatGPT 플랜 사용을 여는 것은 일부 상업 파트너 대상 제한 시험이다. 실사용자가 없다. 기존 `codex` 값의 의미를 바꾸면 append-only 규칙에 어긋난다 |
| D5 | LiteLLM `codex-<id>` 구독 워커 라우트 | **폐기** | 실행 중인 컨테이너가 없고 관리자 CLI 전용이다. D4와 같은 약관 쟁점이 있다 |
| D6 | Dify | **폐기**(최종 스냅샷 보관 후 삭제) | 운영 미사용(Phase 0에서 Hanmadi `DIFY_*` 변수 부재 확인) |
| **D7** | discovery 앱 버전 | **인프라 이전 전에 VM에서 운영 `7e9d866`(v1.2) → main(+#161) 릴리스를 먼저 한다. 인프라는 같은 앱 버전에 저장소 계층만 바꿔 옮긴다** | 앱 변화와 인프라 회귀를 한 번에 섞으면 원인을 구분할 수 없다. 대기 중인 v2.7 실검증도 이 릴리스에서 한다. 대안은 `7e9d866`에 `PostgresStore`만 백포트하는 것이다(저장소 코드를 두 번 작성) |

## 4. Global Constraints

- 금지선 #2와 제공사 정책: 사용자 구독 자격증명을 수집·저장·중개하지 않는다. accounts v1의 LiteLLM ChatGPT 로그인 몽키패치와 Claude 자격 파일 보관 경로는 v2에 가져가지 않는다.
- 금지선 #8과 실패 투명화: 이관·전환·사용 기록·백업 누락을 성공으로 보고하지 않는다. silent drop을 금지한다.
- 계약은 append-only다. `packages/litellm-client`의 LiteLLM·JEV·accounts 클라이언트 계약과 discovery HTTP 계약에서 필드를 지우거나 의미를 바꾸지 않는다. 새 값은 추가로만 넣는다. 거부는 클라이언트가 그대로 전달하는 상태 코드(400·401·403·404·409·429)와 명시적 오류 코드로 한다.
- 확실하지 않은 스펙·한도·약관은 `TODO(D1)`로 표기하고 공식 문서로 확인한다.
- 비밀값은 Secret Manager와 로컬 0600 파일에만 둔다. iCloud·저장소·로그에 남기지 않는다. Secret Manager는 숫자 버전으로만 참조한다(Terraform validation으로 `latest` 차단). 롤백 후보 리비전이 참조하는 버전은 Phase 6 전까지 비활성화하거나 삭제하지 않는다.
- 운영 DB 전환은 리허설 이관 → 쓰기 동결 → 최종 이관 → 전환 순서로 한다. 시험 데이터는 운영 DB에 넣지 않는다. 동결 시간과 소비자 영향은 승인 요청에 적는다.
- 운영 변경(배포, Terraform apply, DB 이관, VM 정지·삭제, 키 발급)은 Phase마다 묶어 사용자 승인을 받고 실행한다. Terraform state를 확보하기 전에는 apply하지 않는다.
- 유료 실호출 검증은 단계별 호출 수와 예상 비용을 먼저 제시하고 승인을 받는다.

## 5. Review Focus (테스트가 놓치기 쉬운 실패, 가능성 높은 순)

1. **유휴 뒤 첫 요청.** LiteLLM 기동과 Neon 재개가 겹치면 느려진다. LiteLLM은 살아 있고 Neon만 정지한 상태에서는 끊긴 연결로 실패할 수 있다. 기대: discovery JEV 5초·Hanmadi 12초 안, 실패 0. → Phase 2 (a)(e).
2. **scale-to-zero에서 사용 기록·예산 누락.** 요청이 없으면 CPU가 없어 10초 배치 기록과 예산 초기화(약 10분 간격)가 밀린다. 종료 유예는 10초뿐이다. 기대: 호출 N건이면 spend 기록 N건, 월초 예산 초기화 발생. → Phase 2 (b)(c)(f).
3. **edge 2단 hop 회귀.** Host 헤더, invoker IAM, chunked 변환(discovery는 `Transfer-Encoding`이 있으면 413), 접두사 이중 제거, 관리 경로 노출, 스트리밍 flush. 기대: 허용목록·404·본문이 현행과 같다. → 2-1 스테이징 스모크, 3-3 `tests/edge.py` 2단 사례.
4. **전환·롤백 사이 데이터 공백과 분기.** 동결 없이 이관하면 spend·키·discovery 이력이 빠지고, 롤백하면 저장소가 갈라진다. 기대: 동결 뒤 최종 이관 불일치 0, 롤백 때 손실 목록 보고. → 3-4·3-5·4-4.
5. **인스턴스 2대에서 discovery 동시성.** 같은 scope 동시 요청과, scope는 다르지만 플랫폼이 같은 요청의 일일 예산 경계. 기대: scope당 1건 진행, 예산 초과 0, 같은 멱등 키는 같은 결과. → 4-1.

## 6. Phase별 계획

일정은 작업일 기준 추정이다. 운영 전환은 Phase 순서대로 하고, 코드 작업은 병렬로 진행할 수 있다. Phase 2~4의 배포는 Phase 1의 빌드 워크플로로 이미지를 만든 뒤 승인받은 `gcloud` 명령으로 한다. 자동 배포는 Phase 5에서 붙인다.

### Phase 0 — 결정·확인·즉시 절감 (0.5일, state 유실 시 +0.5~1일)

- D0~D7 결정을 받는다.
- **(D0 승인 시)** 서비스 복구가 급하므로 정지 상태에서 gcloud로 유형을 e2-small로 바꾸고 다시 켠 뒤 헬스를 확인한다. Terraform 코드의 허용값과 값은 state를 확보한 뒤 맞춘다. Dify는 이미 중지돼 있다.
- **Terraform state 확보.** 위치를 찾으면 GCS backend로 옮긴다. 없으면 `import` 블록으로 기존 자원을 다시 등록하고, `plan`이 변경 없음을 보일 때까지 다른 apply를 하지 않는다.
- **VM에서 확인(비밀값은 보지 않음):** discovery `JEV_BASE_URL`이 공개 `/llm`인지, LiteLLM DB 크기와 암호화 값을 저장하는 테이블의 행 수(salt 실사용 여부), accounts v1 연결 행 수.
- **Hanmadi 운영 변수 이름 확인(값은 보지 않음):** `DIFY_*`·`AI_ACCOUNTS_*`가 없는지 본다. Hanmadi는 `DIFY_*`가 있으면 Dify를 자동으로 고른다.
- discovery 운영 JEV 키(만료 2026-11-02 06:00 UTC)의 갱신을 Phase 4 전으로 잡는다.
- **사용자 몫(Day-1 병렬):**
  - Neon 가입과 Launch 결제 수단 등록
  - 청구 계정 범위 예산 알림(콘솔 전용)
  - 청구 보고서에서 같은 청구 계정의 다른 프로젝트 2개가 쓰는 Cloud Run·Secret Manager·Artifact Registry 무료 등급 사용량 확인
  - 새 `deploy/*` 브랜치 보호 규칙(저장소 관리자 권한, `deploy.mjs`가 요구)
- **완료 기준:** 결정 기록, state 확보, (D0) VM 정상 기동과 공개 `/llm`·`/discovery` 응답, 확인값 기록.
- **실행 결과(2026-10-09):** `docs/qa/20261009-serverless-phase0.md`. D0~D7 권장안 채택, VM e2-small 기동, shared-ai-host state 확보·plan 검증(차이는 machine_type뿐), WIF는 적용된 적 없음(Phase 1에서 확인, import 불필요).

### Phase 1 — 기반 (2일)

| 태스크 | 산출물 | 검증 |
|---|---|---|
| 1-1 Terraform 기반 | `services/shared-ai-host/`에 다음을 추가한다. Artifact Registry(정리 정책: 이미지별 최근 5개). 런타임 SA(litellm·discovery·maintenance·admin, edge는 기존 `shared-ai-proxy` 재사용). Secret Manager 시크릿 정의(값 없음, 버전 변수는 숫자만 허용). GCS 백업 버킷(us-central1 Standard, 객체 버전 관리, 이전 버전 14개 초과분 삭제). Cloud Monitoring 알림 정책(Job 실패, 백업 신선도 26시간, 메일 채널). 각 Cloud Run 서비스·Job 골격(`ignore_changes`: image·traffic·client 필드, 백엔드는 `invoker_iam_disabled`) | `terraform fmt/validate`, `shared-ai-host.yml` CI, plan 출력을 PR에 첨부. apply는 사용자 승인 후 수동 |
| 1-2 WIF 분리 | `ops/deploy/gcp-identity/main.tf`: `attribute.ref` 매핑, 대상별 배포 SA(litellm·discovery·edge·maintenance)와 브랜치 조건. 빌드 토큰은 main과 보호된 `deploy/*`에서만 발급한다. 권한은 자원 단위로 준다(`run.developer`, 런타임 SA `serviceAccountUser`, 저장소 단위 `artifactregistry.writer`). **이 모듈은 적용된 적이 없다**(Phase 1 확인: pool·배포 SA·STS API·저장소 변수 없음). 그래서 import 없이 새로 만들고, 퇴역할 VM에 SSH·IAP 권한을 주는 배포 신원은 만들지 않는다. 대상별 배포 SA는 Phase 5로 미룬다(Phase 1 계획 R3·R6) | terraform validate, `platform-gitops-check.yml`, plan은 추가만(변경·삭제 0), 다른 브랜치에서 토큰 발급 거부 확인 |
| 1-3 빌드 경로 | `.github/workflows/shared-ai-images.yml`(WIF → AR 푸시, digest 출력). 이미지는 edge(caddy digest + Caddyfile), litellm(공식 digest + `/etc/litellm/config.yaml`, `/app`은 건드리지 않음), maintenance(postgres:16 digest + 스크립트)다. `gateway.py render --target cloudrun`은 `.env` 대신 저장소의 비밀 없는 모델 설정 파일로 렌더하고 구독 라우트(D5)를 넣지 않는다 | 렌더 테스트: 비밀값 없음, 모델 별칭이 VM과 같음, 비밀은 `os.environ/` 참조만. 빌드 1회, digest 기록 |
| 1-4 Neon 스테이징 | Free 프로젝트 1개(PoC 전용), PG 16. us-central1 Cloud Run에서 aws-us-east-1·us-east-2 왕복 지연을 재고 리전을 정한다 | psql 접속, 지연 기록 |

### Phase 2 — 스테이징 PoC와 서버리스 지속 게이트 (작업 2일 + 측정 대기 2일)

운영 데이터와 운영 가상 키를 쓰지 않는다. 시험 master·salt 키, 빈 DB, 시험 키로 한다. 제공사 키(Gemini·ElevenLabs·TypeSafe)만 운영 값을 쓴다.

| 태스크 | 산출물 | 검증 |
|---|---|---|
| 2-1 스테이징 배포 | 스테이징 edge(운영과 같은 Caddyfile 구조, `/llm`만 스테이징 litellm으로, `allUsers` 없이 사용자 ID 토큰으로만 호출) + litellm 서비스(internal, 최대 1, 동시성 20, 메모리 1~2GiB, startup CPU boost, timeout 300초, 최소 0, §2의 env) + `litellm-migrate` Job(direct URL) | 2단 hop 스모크: Cloud Run 업스트림 https와 `header_up Host`, 관리 경로 404, invoker 403 없음, 스트리밍 flush, POST 본문의 Content-Length 유지(`Transfer-Encoding`으로 바뀌지 않음). 기동 로그로 마이그레이션 생략과 종료 drain 설정을 확인 |
| 2-2 측정 | 아래 (a)~(g) | 결과를 `docs/qa/`에 기록 |
| 2-3 게이트 | 아래 기준으로 판정해 사용자에게 보고 | 사용자 결정 기록 |

측정 항목과 통과 기준:

| ID | 측정 | 통과 기준 |
|---|---|---|
| (a) | 콜드 경로: LiteLLM 0대 + Neon 정지에서 첫 요청 10회의 p50/p95 | `/llm/typesafe/v1/systemone` p95 ≤ 5초(discovery bridge), Hanmadi 경로 p95 ≤ 12초. Festa shadow 3초는 초과율만 기록 |
| (b) | 사용 기록: 호출 N건 뒤 15분 유휴·축소 | spend log N건, 키 spend 반영. 누락 0 |
| (c) | 예산 초기화: `budget_reset_at`이 지난 시험 키 | 다음 활동 뒤 초기화된다. 안 되면 admin Job으로 보정할 수 있는지 확인(관리 API `TODO(D1)`) |
| (d) | 기능: JEV·Gemini native·STT/TTS·json_schema·스트리밍 각 1건 | 모두 성공 |
| (e) | 웜 LiteLLM + 정지 Neon: 인스턴스가 살아 있는 동안 Neon을 10분 유휴시킨 뒤 첫 요청 10회 | 실패 0 |
| (f) | 종료: Neon 정지 상태에서 리비전 교체(SIGTERM), 스트리밍 진행 중 교체 포함 | spend 유실 0 |
| (g) | 비용: 보온 없음 / 보온 ping 5분 두 구성을 각각 24시간 이상 | Neon compute 활성 시간, Cloud Run 인스턴스 시간, 콜드 스타트 빈도를 기록하고, 무료 등급을 0으로 놓은 월 예상 비용을 계산 |

유료 호출은 약 15건이며 합계 $0.10 미만으로 예상한다. 착수 전에 승인을 받는다.

보온 ping은 DB를 건드리지 않는 `/health/liveliness`로 보낸다. 같은 프로젝트의 Scheduler는 internal 서비스를 직접 호출할 수 있으므로(§8.1, 2026-10-09 확정) edge 허용목록은 바꾸지 않는다. 다만 LiteLLM은 CPU가 있을 때 60초마다 DB에 하트비트를 써서, ping이 Neon을 깨울 수 있다(§8.2). 그래서 (g)에서 잰다. 상세 실행 계획은 `docs/plans/20261009-serverless-p2-staging-poc.md`에 있다.

**게이트 판단:**

- (a)(b)(d)(e)(f)가 통과하고 (g)로 계산한 월 비용이 VM 축소안(D0)보다 낮으면 Phase 3로 간다. litellm DB는 (g)의 활성 시간으로 D2 기준에 따라 고른다.
- (a)나 (e)가 보온 ping으로도 통과하지 못하면 최소 인스턴스 1(+$13~19)이 필요하다. (b)나 (f)는 배치·종료 설정을 조정하고, 그래도 안 되면 instance 기반 과금(+$2~16)이 필요하다. 이 경우 비용이 VM 축소안과 비슷해지므로 서버리스를 계속할지 사용자에게 다시 묻는다.
- (c)만 실패하면 Phase 3에서 admin Job에 월초 보정을 넣는다.
- 중단하면 스테이징 자원을 지우고 VM을 e2-small로 유지한다. 매몰 비용은 Phase 0~2의 약 4~5일이다.

### Phase 3 — LiteLLM 운영 전환 (2.5일)

| 태스크 | 산출물 | 검증 |
|---|---|---|
| 3-1 운영 DB·비밀값 | D2에 따른 운영 DB(PG 16). 복원 소유자와 migrate 역할을 같게 둔다. 비밀값은 파일로 넣고(`printf '%s'`), 길이와 해시 앞자리를 VM 값과 비교한다(값은 출력하지 않음) | 접속, 비교 결과 기록 |
| 3-2 관리·백업 Job | `litellm-admin`: VPC all-traffic, `gateway.py` 관리 명령에 내부 URL 옵션 추가. `maintenance`: DB별 독립 단계, `set -euo pipefail`, custom 포맷 덤프 + `pg_restore --list` + 크기·행 수 매니페스트, 한 단계라도 실패하면 종료 코드 1. Scheduler는 매일. Neon 사용량 경보는 Neon 자체 알림을 우선 쓰고(`TODO(D1)`), 없으면 maintenance에 API 점검 단계를 넣는다 | admin으로 시험 키 `/key/info` 조회. maintenance 수동 1회. 잘못된 URL을 넣었을 때 실패 알림 메일 수신 |
| 3-3 운영 edge 교체(동작 불변) | egress를 `PRIVATE_RANGES_ONLY`에서 `ALL_TRAFFIC`로 바꾼다. Caddyfile 내장 edge 이미지로 바꾸되 모든 경로를 지금처럼 VM으로 보낸다(접두사 유지, http :8080) | `tests/edge.py`에 edge→VM Caddy 2단 사례 추가. 운영 공개 경로 무과금 스모크(헬스, 키 없음 401) |
| 3-4 리허설 이관 | VM `pg_dump`(custom) → 빈 운영 DB 복원. 행 수·해시 비교 스크립트. maintenance 산출물로 임시 DB 복원 리허설 | 불일치 0. 소요 시간을 재서 동결 시간을 산정 |
| 3-5 동결·최종 이관·전환 | `/llm` 503 리비전 → VM LiteLLM은 15초 이상 기다린 뒤 정지(배치 flush) → 운영 DB를 비우고 다시 복원·비교 → `/llm`을 Cloud Run으로 보내는 리비전. 롤백용 이미지("`/llm`만 VM")를 미리 빌드 | 기존 앱 키로 Hanmadi·Festa·JEV 스모크(승인된 호출), spend 기록 확인 |
| 3-6 배포 동결 | 전환부터 Phase 5 드라이버 완성까지 `deploy/litellm` 푸시를 막는다. 서빙하지 않는 VM만 갱신하고 성공으로 기록되는 일을 막기 위해서다 | README에 동결 공지 |

**롤백:** VM LiteLLM을 다시 켠 뒤 롤백용 이미지를 배포한다. VM DB는 동결 시점 상태다. 전환 뒤 운영 DB에만 쌓인 spend와 키 변경은 CSV로 내보내 보존하고 롤백 보고에 적는다. 다시 전환할 때는 빈 DB에 새로 이관한다(기존 운영 DB 덮어쓰기 금지).

### Phase 4 — discovery 운영 전환 (작업 3.5일, 코드는 Phase 2부터 병렬)

**선행 조건(D7):** VM에서 운영 `7e9d866`(v1.2) → main(+#161) 릴리스를 별도 승인으로 마치고 관찰한다. 클라이언트 공동 배포 순서는 `services/topic-discovery/README.md`를 따른다. #161이 아직 머지 전이면 4-1은 그 브랜치 위에 쌓아 작업하고 머지 뒤 rebase한다. 운영 JEV 키를 갱신한다.

| 태스크 | 산출물 | 검증 |
|---|---|---|
| 4-1 Store 추상화 | `service.py`의 `Store`를 백엔드 교체형으로 나눈다(`SqliteStore` 유지 + `PostgresStore` 신규, `DISCOVERY_DATABASE_URL`이 있으면 Postgres). 드라이버는 `psycopg` 3이다(해시 고정 requirements, Dockerfile에 설치 단계 추가 — 지금은 표준 라이브러리만 씀, CI import 검사 수정). 잠금 순서는 플랫폼 잠금 → scope 잠금(`pg_advisory_xact_lock`)으로 고정한다. `UNIQUE(scope, idem)`, 만료 600초, 일일 예산을 보존한다. 테스트에서 Store를 직접 만드는 곳은 팩토리로 바꾼다 | 기존 Python 테스트 전체(#161 기준 86개)를 두 백엔드로 실행(CI `services: postgres:16`). 동시성: 같은 scope 동시 `begin` 10건이면 1건만 진행하고 나머지는 409. scope가 다르고 플랫폼이 같은 동시 요청이 일일 예산을 넘지 않음. 같은 멱등 키 → 같은 requestId |
| 4-2 이관 스크립트 | `migrate_sqlite_to_pg.py`: dry-run, 행 수·JSON 해시 비교, 빈 DB에만 쓰기 | 리허설 결과 일치 |
| 4-3 서비스 | internal, 동시성 8, timeout 300초, 메모리 512MiB, 최대 2, `JEV_BASE_URL`은 Phase 0 확인값(공개 edge `/llm`) | 키 없음 401, Origin 헤더 403, `/health` 200 |
| 4-4 동결·최종 이관·전환 | edge에서 `POST /discovery/v1/discover`만 503 → VM `active`가 빌 때까지 대기(최대 600초) → 최종 복사·비교 → `/discovery/*` 전환. LiteLLM이 따뜻할 때 한다 | Shopshorts·블로그 경로 스모크. 실제 추천 1건은 JEV·Naver·Codex 호출이 생기므로 승인 필요 |

**롤백:** 롤백용 이미지("`/discovery`만 VM")를 배포한다. Postgres에만 있는 이력은 SQLite로 되돌리지 않고 손실 목록(requestId·scope)을 보고한다. 그 기간의 accepted 이력이 VM에 없어 중복 추천이 생길 수 있다는 점도 함께 적는다.

### Phase 5 — 배포 파이프라인·정리 (2일)

- `ops/deploy`에 Cloud Run 드라이버를 추가한다.
  - 순서: 이미지 빌드 → (litellm만) `litellm-migrate` Job → `gcloud run deploy --image <digest>` → startup probe 통과 → edge 경유 공개 경로 스모크 → 실패 시 이전 리비전으로 traffic.
  - GitHub runner는 internal 서비스에 직접 닿지 않는다. 그래서 헬스는 startup probe와 edge 경유 스모크로 판단한다.
- `.github/workflows/platform-deploy.yml`의 브랜치·dispatch 목록과 `driver == 'gcp'` 조건을 새 드라이버에 맞춘다. `targets.json`에서 litellm 드라이버를 바꾸고 discovery·edge를 추가하며 dify를 뺀다. `deploy/litellm` 동결을 푼다.
- D5 정리: `gateway.py`의 구독 라우트 import, `subscriptions.py`, `litellm-release.py`의 `write_configs`, `ai-gateway.yml`의 구독 통합 단계와 관련 테스트. `subscription_runtime.py`는 accounts v1이 쓰므로 Phase 6에서 지운다.
- D6 정리: `services/dify`, `dify.yml`, `hanmadi-dify.yml`, Hanmadi의 Dify 선택 로직(Phase 0 확인 결과에 따라).
- LiteLLM spend log 보존 기간을 설정한다(지원 여부와 설정 이름 `TODO(D1)`). DB 크기는 maintenance 매니페스트로 추적한다.
- 문서: `services/shared-ai-host/README.md`, `services/ai-gateway/ACCOUNTS.md`(구독 경로 폐기 근거), `docs/deployment/platform-gitops.md`, `docs/PROGRESS.md`, `CLAUDE.md` 상태표, 런북(전환, 경로별 롤백, 예산 보정, DB 정지 대응).

### Phase 6 — 관찰·VM 폐기 (관찰 7일 + 1일)

- 7일 동안 관찰한다: 오류율, 콜드 스타트, spend 기록 일치, Neon CU-시간, 청구 계정 무료 등급 사용량, 백업 성공과 신선도 알림.
- 사용자 승인 후 폐기한다.
  1. accounts v1에 남은 QA 연결(9/29 festa claude·codex connected 각 1건)을 `DELETE`로 해제하고, 제공사 쪽 세션·키 폐기는 사용자가 확인한다. 그다음 edge에서 `/accounts/*`를 404로 바꾼 리비전을 배포한다(실사용 없음 재확인).
  2. VM 최종 스냅샷을 만든다(30일 보관 후 삭제).
  3. Terraform에서 `prevent_destroy`와 `deletion_protection`을 해제한다.
  4. VM, 디스크, 스냅샷 정책, VM용 방화벽(IAP 22·8080), Dify 자산을 삭제한다. `KEEP_AUTO_SNAPSHOTS` 때문에 남는 자동 스냅샷도 지운다(최종 스냅샷 제외).
  5. `litellm-release.py`와 IAP SSH 배포 경로를 지운다. VM 배포 WIF는 적용된 적이 없으므로 회수할 권한은 없다.
  6. accounts v1 코드와 CI를 지운다. 대상은 v1 `account_service.py`·`account_worker.py`·`claude_code.py`·`subscription_runtime.py`·`Dockerfile.accounts`와 `hanmadi-model-connections.yml`의 native-runtime·v1 스모크다. Hanmadi 연결 기능의 CI 공백은 기록하고 Phase 7에서 v2 기준으로 되살린다.
- edge의 VPC egress와 프록시 서브넷은 유지한다(internal 경로).
- **완료 기준:** 다음 청구 주기에 Compute Engine 항목이 없다(콘솔 확인). 롤백 후보가 참조하던 시크릿 버전을 정리한다.

### Phase 7 — accounts v2: API 키 연결 전용 (2.5~3.5일, 크리티컬 패스 밖)

VM 폐기와 독립이다. Phase 6 뒤와 Hanmadi가 기능을 켜기로 한 때 중 빠른 쪽에 착수한다. 서버는 무상태다. 요청마다 DB에서 암호화된 키를 꺼내 복호화하고 제공사 공식 API를 호출한다. CLI·로그인 Job·임시 디렉터리·임대가 모두 필요 없다.

계약(append-only):

```text
POST /connections {provider:'openai'|'claude', apiKey}   ─▶ 형식 검증 → 제공사 1회 검증(모델 목록, ≤5초) → 암호화 저장
                                                          → 202 + connected 또는 error 레코드 (현행 202 유지, 클라이언트 10초 제한 안)
POST /connections {provider:'codex'} 또는 {authMethod:'claude-code'}
                                                          ─▶ 400 unsupported_auth_method (구독 로그인 폐기, 부록 A)
같은 provider에 미해제 연결(만료·오류 포함)이 있을 때      ─▶ 409 disconnect_before_reconnecting (현행 유지)
POST /v1/chat/completions {model:'<id>:<model>'}         ─▶ subject·상태 확인 → 키 복호화(메모리) → 제공사 API(≤28초)
DELETE /connections/{id}                                  ─▶ 키 삭제, 행은 disconnected
만료                                                       ─▶ 행 유지, state='expired', 키 삭제 → chat 409 (현행 유지)
```

- `openai`는 서버와 `packages/litellm-client`(`accounts.mjs`의 provider 목록 2곳과 `publicAccountConnections` 검증, `accounts.d.mts`)에 함께 추가한다. 지금 클라이언트는 응답에 모르는 provider가 오면 `invalid_connections`로 실패한다.
- `codex`는 구독 로그인 값으로 남긴다. 제공사 승인 뒤 부록 A로 되살린다.

```sql
CREATE TABLE connections (
  id          text PRIMARY KEY,                 -- 현행 레코드 id 형식(hex32) 유지
  platform    text NOT NULL,
  subject     char(64) NOT NULL,                -- 플랫폼이 만든 HMAC(hex64)
  provider    text NOT NULL CHECK (provider IN ('openai','claude')),
  auth_method text NOT NULL CHECK (auth_method = 'api-key'),
  state       text NOT NULL CHECK (state IN ('authorizing','connected','expired','quota_exceeded','error','disconnected')),
  secret_ct   bytea,                            -- AES-GCM(API 키), AAD = id
  key_id      smallint NOT NULL,                -- 암호화 키 회전
  created     timestamptz NOT NULL DEFAULT now(),
  updated     timestamptz NOT NULL DEFAULT now(),
  expires     timestamptz                       -- TTL 연결(Festa 세션 등)
);
CREATE INDEX connections_owner ON connections (platform, subject);
CREATE UNIQUE INDEX connections_one_open ON connections (platform, subject, provider) WHERE state <> 'disconnected';
```

| 태스크 | 산출물 | 검증 |
|---|---|---|
| 7-1 저장 계층 | `services/ai-gateway/accounts_store.py`: Postgres, AES-GCM(키는 Secret Manager, `key_id` 회전, AAD=연결 id), `(platform, subject)` 범위 조회만 허용 | 암호화 왕복, 다른 id로 복호화 실패, 다른 subject 조회 0건, 회전 후 구 키 복호화, 동시 POST 2건 중 1건 409 |
| 7-2 API 서비스 | `account_service.py` 재작성(로컬 SQLite·fcntl·서브프로세스·메모리 작업·60초 루프 제거). 오류·로그에 키를 넣지 않는다 | 기존 `tests/test_accounts.py` 계약 테스트(지원 범위) 통과, 구독 방식 400, 만료 409, 키 노출 검사(응답·로그 스냅샷에 키 문자열 0건) |
| 7-3 클라이언트 추가 | `packages/litellm-client`에 `openai` 추가, 테스트 | 기존 소비자 테스트 통과, `openai` 레코드 파싱 |
| 7-4 배포·전환 | Dockerfile(CLI 바이너리 없음), Cloud Run 서비스(internal), edge `/accounts/*` 재개방, maintenance에 만료 정리와 백업 단계 추가. 백업은 `secret_ct`를 뺀 덤프로 해서 삭제한 키가 백업에 남지 않게 한다. PITR 보존 기간 동안 남는 암호문은 문서에 적는다(Launch 보존 기간 `TODO(D1)`) | edge 테스트, 서비스 스모크(시험 키) |
| 7-5 소비 앱 | Hanmadi `components/v2-app.tsx`: Codex 버튼(ChatGPT 기기 로그인)을 OpenAI API 키 입력으로 바꾸고 Claude `claude-code` 버튼을 지운다(Claude API 키 입력 UI는 이미 있음). `hanmadi-model-connections.yml`과 smoke를 v2 기준으로 되살린다. 기능 개방(`AI_ACCOUNTS_*` 주입)은 BYOK 약관 확인(§8.2) 뒤 별도로 결정한다 | Hanmadi CI, 개방 전 결정 기록 |

VM accounts v1 SQLite는 Phase 0에서 연결 행 수만 확인한다(토큰 내용은 보지 않음). 실사용자가 없으므로 이관하지 않고 VM과 함께 폐기한다.

## 7. 비용 비교

§8의 공식 단가로 계산했다. 사용량은 현재 트래픽(일 수십~수백 요청)을 가정했다. **최종 금액은 Phase 2 (g) 실측이 정한다.**

리뷰로 바뀐 핵심 전제: 보온 ping으로 LiteLLM을 살려 두면 내부 스케줄러(예산 초기화 약 10분 주기 등)가 DB를 계속 깨울 수 있다. 그러면 Neon이 거의 상시 가동된다(0.25 CU × 730시간 ≈ 182 CU-시간). Free 한도(100)를 넘고, Launch로는 월 약 $19다. 이때는 litellm DB를 Cloud SQL(고정 약 $9.4)로 두는 편이 싸다. 초안의 "월 약 $1"은 이 효과를 빠뜨린 값이었다.

| 항목 | 낮은 경우 | 높은 경우 | 근거 |
|---|---|---|---|
| Cloud Run 서비스·Job | $0 | 약 $2 | 요청 기반 무료 등급(월 요청 200만, vCPU 18만 초, 36만 GiB-초)과 Job 무료분은 청구 계정 합산이라 다른 프로젝트 사용분만큼 줄어든다. 한 요청이 edge·litellm(·discovery)을 함께 점유한다 |
| litellm DB | 약 $2.5 | 약 $9.4 | 낮은 경우: Neon Launch, 하루 활성 3시간(약 23 CU-시간). 높은 경우: 상시 가동이라 Cloud SQL db-f1-micro |
| discovery DB | 약 $0.5 | 약 $1.5 | Neon Launch, 하루 몇 회 실행 |
| Secret Manager | 약 $0.6 | 약 $1 | 활성 버전 약 16개 − 무료 6. 롤백용으로 남기는 버전 포함 |
| Artifact Registry | 약 $0.1 | 약 $0.3 | 이미지별 최근 5개, 무료 0.5GB 초과분 |
| Scheduler·GCS·Monitoring | $0 | 약 $0.2 | 무료 범위(Scheduler 3개, GCS 5GB) |
| **월 합계** | **약 $4** | **약 $14** | |

조건에 따른 추가 비용:

| 조건 | 추가 월 비용 | 산식 |
|---|---|---|
| (a)(e) 미달 → LiteLLM 최소 인스턴스 1 | +$13(1GiB) ~ +$19(2GiB) | 유휴 단가 CPU $0.0000025/vCPU-초 + 메모리 $0.0000025/GiB-초 × 30일. 이때 DB도 상시 가동되므로 litellm DB는 Cloud SQL |
| (b)(f) 미달 → LiteLLM instance 기반 과금 | +$2(월 가동 100시간) ~ +$16(300시간) | (가동초 − 24만) × $0.000018 + (가동초 × GiB − 45만) × $0.000002. 무료분을 0으로 보면 +$7~22 |

비교 기준:

| 안 | 월 비용 | 작업량 |
|---|---|---|
| 현재(e2-standard-2 + 80GB + 외부 IP) | 약 $60(추정, `TODO(D1)`) | — |
| VM만 e2-small로 축소(D0) | 약 $16~24(추정, `TODO(D1)`) | 0.5일 |
| 서버리스 | 약 $4~14 | 작업 약 11~13일 |
| 서버리스 최악(최소 인스턴스 + Cloud SQL) | 약 $30 | 같음 |

**판단 포인트:** 절감의 대부분(월 약 $36~44)은 D0의 VM 축소만으로 얻는다. 서버리스 전환은 여기서 월 약 $2~20을 더 줄이고 VM 운영 부담(OS 패치, 디스크, SSH 배포)을 없앤다. 최소 인스턴스가 필요해지면 추가 절감이 사라진다. 그래서 Phase 2 게이트에서 실측 비용으로 계속할지 다시 정한다.

## 8. D1 확인 결과 (2026-10-09 조회)

### 8.1 GCP·Neon 요금과 제약

| 항목 | 판정 | 값 | 출처 |
|---|---|---|---|
| Cloud Run 요청 기반 단가 | 확정 | CPU $0.000024/vCPU-초, 메모리 $0.0000025/GiB-초, 요청 $0.40/100만. 무료 월 vCPU 18만 초·36만 GiB-초·요청 200만(청구 계정 합산) | [Cloud Run pricing](https://cloud.google.com/run/pricing) |
| 최소 인스턴스 유휴 단가 | 확정 | CPU $0.0000025/vCPU-초, 메모리 $0.0000025/GiB-초. "Idle instances that are not minimum instances are not charged." | 같은 페이지 |
| Instance 기반·Jobs 과금 | 확정 | CPU $0.000018, 메모리 $0.000002. 무료 24만 vCPU-초·45만 GiB-초. Jobs는 instance 기반 단가로 인스턴스 수명 전체를 과금하고 최소 1분 | 같은 페이지 |
| 서비스 요청 timeout | 확정 | 기본 5분, 최대 60분 | [request-timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout) |
| Jobs task timeout | 확정 | 최대 168시간 | [task-timeout](https://docs.cloud.google.com/run/docs/configuring/task-timeout) |
| 응답 후 백그라운드 CPU | 확정 | 요청 기반 과금에서는 요청 처리 중에만 CPU 할당 | [general tips](https://docs.cloud.google.com/run/docs/tips/general) |
| 종료 유예 | 확정 | SIGTERM 뒤 10초에 SIGKILL. "During this period, the instance is allocated CPU and billed." | [container contract](https://docs.cloud.google.com/run/docs/container-contract) |
| startup CPU boost | 확정 | 시작 시간 동안 부스트된 CPU만큼 과금, 새 서비스 기본 활성 | [cpu](https://docs.cloud.google.com/run/docs/configuring/services/cpu) |
| internal ingress 조건 | 확정(조건부) | Direct VPC egress만으로는 internal이 아니다. 호출 측 egress `all-traffic` + 서브넷 Private Google Access 등으로 VPC를 거쳐야 한다. 프록시 서브넷 PGA는 이미 켜져 있다 | [private-networking](https://docs.cloud.google.com/run/docs/securing/private-networking), [ingress](https://docs.cloud.google.com/run/docs/securing/ingress) |
| Direct VPC egress | 확정 | 컴퓨트 요금 없음, 같은 리전 Cloud Run 간 전송 무료. Cloud NAT를 쓰면 콜드 스타트가 30초 이상 늘 수 있다 → 백엔드는 VPC egress를 쓰지 않음(admin Job만 internal 호출용으로 사용, 인터넷 불필요) | [connecting-vpc](https://docs.cloud.google.com/run/docs/configuring/connecting-vpc) |
| Scheduler → internal ingress | 확정(2026-10-09) | 같은 프로젝트의 Cloud Scheduler가 기본 run.app URL로 호출하면 internal로 인정된다. IAM 인증은 따로 적용된다 | [ingress](https://docs.cloud.google.com/run/docs/securing/ingress), [Scheduler](https://docs.cloud.google.com/scheduler/docs/creating) |
| Direct VPC egress IP 소요 | **미확인** | 프록시 서브넷 /26에 edge와 admin Job을 함께 두어도 되는지 | `TODO(D1)` |
| ghcr 이미지 직접 배포 | 해당 없음 | 문서가 상충했으나("Cloud Run cannot pull from ghcr.io" 대 공개 이미지 가능), 자체 빌드 이미지를 AR에서만 배포하므로 무관 | [AR remote](https://docs.cloud.google.com/artifact-registry/docs/repositories/remote-repo), [LiteLLM deploy](https://docs.litellm.ai/docs/proxy/deploy) |
| Neon Free | 확정 | 프로젝트당 1GB(계정 20GB), 월 100 CU-시간(소진 시 다음 주기까지 compute 정지), 5분 유휴 시 자동 중지(해제 불가), PITR 6시간 | [plans](https://neon.com/docs/introduction/plans), [pricing](https://neon.com/pricing), [scale-to-zero](https://neon.com/docs/introduction/scale-to-zero) |
| Neon 연결 방식 | 확정 | `pg_dump`는 항상 direct("Always use direct connections for `pg_dump`"). 스키마 마이그레이션도 direct("Tools may not support transaction pooling"). 풀러는 `SET`/`RESET`, SQL `PREPARE`, 세션 advisory lock을 지원하지 않는다. 0.25 CU `max_connections` 104(앱용 97) | [connection pooling](https://neon.com/docs/connect/connection-pooling) |
| Neon + Prisma | 확정 | 콜드 스타트 시간 초과에는 `connect_timeout=15` 권장, 마이그레이션은 unpooled URL. compute 기동은 Prisma 가이드가 "a few seconds", scale-to-zero 문서가 "a few hundred milliseconds"라 실측한다 | [Prisma guide](https://neon.com/docs/guides/prisma) |
| Neon 리전 | 확정 | AWS 8개 리전만 있고 GCP는 없다. us-central1 최근접은 지리상 aws-us-east-2로 추정 → 지연 실측 | [regions](https://neon.com/docs/introduction/regions) |
| Neon Launch | 확정 | 기본료 없음, $0.106/CU-시간, $0.35/GB-월 | [pricing](https://neon.com/pricing) |
| Neon Launch PITR 보존·최소 CU·사용량 알림 | **미확인** | accounts 키 잔존 기간, 비용 산식, 경보 수단 | `TODO(D1)` |
| Neon Free 상업적 사용 | 해당 없음 | 운영에 Free를 쓰지 않는다(스테이징 PoC만) | — |
| Cloud SQL 최소형 | 확정 | db-f1-micro 월 $7.665, SSD $0.17/GiB-월. 공유 코어 SLA 비대상. PostgreSQL 16+는 Enterprise를 명시해야 공유 코어 가능. 최소 스토리지는 미확인 | [Cloud SQL pricing](https://cloud.google.com/sql/pricing) |
| Secret Manager | 확정 | 활성 버전당 월 $0.06, 접근 1만 건당 $0.03, 무료 월 6버전·접근 1만 건 | [pricing](https://cloud.google.com/secret-manager/pricing) |
| Artifact Registry | 확정 | 0.5GiB-월 무료, 초과 $0.10/GiB-월 | [pricing](https://cloud.google.com/artifact-registry/pricing) |
| Cloud Scheduler | 확정 | job당 31일에 $0.10, 청구 계정당 월 3개 무료 | [pricing](https://cloud.google.com/scheduler/pricing) |
| GCS Always Free | 확정 | Standard 5GB-월(us-west1·us-central1·us-east1 합산) | [storage pricing](https://cloud.google.com/storage/pricing) |
| GCE VM·디스크 정가 | **미확인** | 이번 조사 범위 밖 | `TODO(D1)` |

### 8.2 LiteLLM 동작과 구독 약관

출처는 `BerriAI/litellm` 태그 v1.102.1 원문(GH)과 [docs.litellm.ai](https://docs.litellm.ai/docs/)(LD)다.

| 항목 | 판정 | 내용 | 계획 반영 |
|---|---|---|---|
| spend 기록 | 확정 | 메모리 큐 → 스케줄러가 `proxy_batch_write_at`(기본 10초)+0~5초마다 DB에 기록. spend log 큐는 별도 모니터가 2~30초 간격으로 기록 | Phase 2 (b) 측정 |
| 종료 시 flush | 확정(소스) | 진행 중 요청 drain(`GRACEFUL_SHUTDOWN_TIMEOUT` 기본 30초) → spend 커밋 → 큐 비우기 → DB 해제 | 유예 10초 안에 끝나도록 drain 3초, Phase 2 (f) |
| 예산 초기화 | 확정 | 597~605초 간격 작업이고 조건이 `budget_reset_at < now`라 지난 초기화를 다음 실행에서 따라잡는다. `30d`는 매월 1일 0시 UTC. 시작 후 첫 실행 시점은 미확인 | Phase 2 (c), 필요 시 admin Job 보정 |
| 키 캐시·DB 장애 | 확정 | 메모리 TTL 60초. DB 연결이 실패하면 기본은 요청 거부(`allow_requests_on_db_unavailable`는 VPC 전용 경고) | 기본값 유지(실패 시 차단), Phase 2 (e) |
| 가상 키 저장 | 확정(소스) | 키는 해시로 저장·조회한다. 그래서 `/key/info`가 일치해도 salt가 맞다는 증거는 아니다. salt는 DB에 암호화해 저장하는 값에만 쓰인다(`STORE_MODEL_IN_DB=False`라 사용처가 적음) | Phase 0 행 수 확인, 3-1 길이·해시 비교 |
| Cloud Run 권고 | 확정 | 공식 Terraform 기본 `gateway_min_instances = 1`: "keep … >= 1 if spend must keep draining while an instance is otherwise idle". 마이그레이션은 별도 Job | `litellm-migrate`, Phase 2 게이트 |
| 시작 시 마이그레이션 | 확정 | 기본으로 매 시작 `prisma migrate deploy`. `DISABLE_SCHEMA_UPDATE=true`(env)로 생략(diff 점검은 남음) | §2 env, 2-1 기동 로그 확인 |
| 필요 기능 지원 | 확정 | TypeSafe(`/typesafe/{endpoint}`), Gemini native `generateContent`, ElevenLabs speech/transcriptions 모두 1.102.1이 지원 | 버전 유지 |
| 예산 보정 관리 API | 확정(소스, 2026-10-09) | `/key/update`의 `spend`(관리자 전용), `POST /key/{key}/reset_spend`(0 이상 현재 spend 이하). 초기화 작업은 만료되지 않았고 `budget_reset_at < now`이며 `budget_duration`이 있는 키를 고른다 | Phase 2 (c) 실패 시 3-2 admin Job |
| DB 하트비트 | 확정(소스, 2026-10-09) | DB에 연결된 프록시는 60초마다 `LiteLLM_ProxyWorkerHeartbeat`에 쓴다(`PROXY_WORKER_HEARTBEAT_INTERVAL_SECONDS = 60`). 요청 기반 과금에서는 CPU가 있을 때만 돈다 | 보온 ping이 Neon을 깨울 수 있음 → Phase 2 (e)는 ping 없이, (g) g2에서 실측 |
| `mock_response` | 확정(소스, 2026-10-09) | 기본으로 요청에서 제거된다. 키나 팀 metadata의 `allow_client_mock_response`가 true일 때만 허용된다. mock 응답도 spend log에 비용과 함께 남는다 | Phase 2 시험 키 발급 |
| spend log 보존 설정, DB 연결 풀 상한 설정 이름 | **미확인** | 1.102.1 원문 확인 필요 | `TODO(D1)` |
| Anthropic 구독 자격 | 확정(원문) | "Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users. Moreover, developers may not collect, store, or intermediate Claude.ai credentials or session tokens" ([legal-and-compliance](https://code.claude.com/docs/en/legal-and-compliance)) | D4: 구독 경로 폐기 |
| Anthropic Consumer Terms | 확정(원문) | 계정 자격 공유 금지, API 키 외 자동 접근은 명시 허용 시만 ([consumer-terms](https://www.anthropic.com/legal/consumer-terms)) | D4 |
| OpenAI 제3자 앱의 ChatGPT 플랜 사용 | 확정(원문) | "currently available to selected commercial partners through a limited trial." 원격 호스팅 앱은 interest form ([SIWC](https://developers.openai.com/siwc)). 자동화에는 API 키 권장 | D4 |
| OpenAI Terms of Use 원문 | **미확인** | 자동 접근 403 → 사용자가 브라우저로 확인 | `TODO(D1)` |
| BYOK(사용자 본인 API 키)와 약관 | **미확인** | Consumer Terms의 "Anthropic API key … share … anyone else" 문구와 API 이용약관의 관계 확인 필요 | 7-5 기능 개방 전 확인 |

법률 판단은 하지 않았다. 원문 문구와 쟁점만 정리했으며, 기능 개방 전 사람이 확인한다.

## 9. 위험과 대응

| 위험 | 신호 | 대응 |
|---|---|---|
| 콜드 스타트가 클라이언트 제한 초과 | Phase 2 (a)(e) 미달 | 보온 ping → 최소 인스턴스 1(+$13~19). 이 경우 서버리스 지속 여부를 다시 결정한다. 소비 앱 timeout은 바꾸지 않는다 |
| scale-to-zero에서 spend·예산 누락 | Phase 2 (b)(c)(f) 미달 | 배치·종료 설정 조정 → instance 기반 과금(+$2~16). 예산 초기화는 admin Job으로 보정 |
| DB 상시 가동으로 비용 증가 | Phase 2 (g), Neon 사용량 | litellm DB를 Cloud SQL로(D2). Free는 운영에 쓰지 않는다 |
| edge 2단 hop 실패(Host·IAM·413·접두사) | 2-1 스모크 실패 | 스테이징에서 원인을 고친 뒤 운영에 적용. 해결되지 않을 때만 백엔드를 IAM 인증으로 두고 ID 토큰을 붙이는 소형 프록시로 교체(+1일) |
| 전환 사이 데이터 공백 | 최종 이관 비교 불일치 | 동결 유지, VM으로 되돌림, 원인 수정 후 빈 DB에 재이관 |
| 롤백 뒤 데이터 분기 | 롤백 실행 | 경로별 롤백 이미지, 운영 DB 전용 데이터 CSV 보존, 손실 목록 보고 |
| Terraform state 유실 | Phase 0에서 미발견 | `import` 블록으로 재등록, `plan` 무변경 확인 전 apply 금지 |
| 백업 무음 실패 | Job 실패·신선도 알림 | pipefail·매니페스트로 빈 덤프를 실패 처리, 버전 관리 버킷이 마지막 정상본을 보존 |
| 비밀값 변형(줄바꿈·따옴표) | 길이·해시 비교 불일치 | 파일 입력으로 다시 넣고 재비교 |
| discovery JEV 키 만료(11-02) | 만료일 접근 | Phase 4 전에 갱신. 관찰 기간과 겹쳐 전환 회귀로 오인하지 않게 한다 |
| 전환 기간 배포 공백 | `deploy/litellm` 푸시 | 3-6 동결 |
| 약관 쟁점 | §8.2 미확인 항목 | 구독 경로 폐기(D4), BYOK도 기능 개방 전 확인 |
| 운영 중단 | 전환 중 오류 | 경로별 롤백 이미지 배포. Phase 6 전까지 VM 유지 |

## 10. 일정과 크리티컬 패스

```text
Day 1       Phase 0 결정·확인·VM 축소 재기동 (state 유실 시 +0.5~1일)
Day 2-3     Phase 1 기반 (Terraform·WIF·빌드 경로·Neon 스테이징)
Day 4-5     Phase 2 스테이징 배포·측정 → 측정 대기 2일(그동안 Phase 3·4 코드) → Day 7 게이트(사용자 재결정)
Day 7-9     Phase 3 LiteLLM 운영 전환
Day 4-10    Phase 4 코드(병렬), D7 앱 릴리스(VM) → Day 10-11 discovery 전환
Day 11-12   Phase 5 파이프라인·정리
Day 13-19   Phase 6 관찰 7일 → 승인 후 VM 폐기
이후         Phase 7 accounts v2 (2.5~3.5일, 크리티컬 패스 밖)
```

작업 약 11~13일에 관찰 7일을 더해 달력으로 약 4주다.

외부 의존(대기 시간이 길다): 사용자 결정 D0~D7, Terraform state 위치, Neon 가입·결제, 예산 알림, 브랜치 보호, Secret Manager 값 입력, Phase별 운영 변경 승인(묶어서 요청), PR #161 머지와 D7 릴리스(Phase 4 선행), discovery JEV 키 갱신. 이 항목들은 모두 Day 1에 요청한다.

## 부록 A. 구독 로그인 경로 (제공사 승인 시 별도 과제)

OpenAI(SIWC 시험 참여)나 Anthropic(사전 승인)의 승인을 받으면 다음 구조로 추가한다. Shopshorts 스튜디오의 디스크 비의존 패턴(`docs/LLM-ACCOUNT-CONNECTION.md`)을 따르고, provider 값은 기존 `codex`를 되살린다.

- 로그인 1건마다 Cloud Run Job을 실행한다(최대 920초). Codex는 공식 `codex login --device-auth`(베타, 개인 계정은 ChatGPT 보안 설정에서 기기 코드 로그인 허용 필요), Claude는 수정하지 않은 `claude auth login`을 쓴다.
- 자격증명 디렉터리는 tar로 묶어 암호화하고 revision CAS로 저장한다. 실행 시에는 임시 HOME에 복원한 뒤 끝나면 삭제한다.
- 연결당 임대 1개로 토큰 갱신 경합을 막는다. Scheduler 정리 작업이 중단된 로그인을 `expired`로 처리한다.
- 예상 작업량은 3일이다. 약관 게이트를 통과하기 전에는 착수하지 않는다.

## 부록 B. 리뷰 반영 기록 (2026-10-09)

리뷰 3종의 결과다.
- 정합성(plan-reviewer): WARNING 9·INFO 11
- 실패 시나리오(devils-advocate): high 4·medium 8·low 3
- 일정 현실성(feasibility-reviewer): WARNING 8. 대화로만 보고돼 아래에 요지를 남긴다.

리뷰 원문의 행 번호는 개정 전 초안 기준이다.

| 지적 | 요지 | 판정 | 반영 위치 |
|---|---|---|---|
| FR-001·DA-012·I1·I2·I3 | 운영 전환 전에 internal 경로를 잴 방법이 없음, 2단 hop 함정, PGA는 이미 켜짐, invoker 방식 미정 | 반영 | 2-1 스테이징 실경로 스모크, 3-3 운영 edge 교체를 동작 불변 단계로 분리, 1-1 PGA 항목 삭제·`invoker_iam_disabled` 명시 |
| W3·DA-003·FR-002 | 이관과 전환 사이 쓰기 동결이 없음, PoC 데이터가 운영 DB에 섞임 | 반영 | §4, 3-4·3-5·4-4, Phase 2를 별도 DB로 |
| DA-004 | 리비전 롤백이 여러 경로를 함께 되돌림, Terraform 드리프트, 롤백 뒤 데이터 분기 | 반영 | §2 원칙 2·4, Phase 3·4 롤백 |
| W4·DA-001·DA-002·FR-003 | 시크릿 볼륨 `latest`, 소유권 미정, `/app` 마운트, env 전용 설정, 빌드 경로 없음, runner가 internal 헬스를 볼 수 없음 | 반영(대안 채택) | 설정 내장 이미지(§2 원칙 3), 숫자 버전 고정(§4), 소유권(§2 원칙 4), 1-3, Phase 5 헬스 방식 |
| DA-005·FR-002·I9·DA-013 | 보온 ping이 Neon을 상시 기동해 Free 소진, 24시간 측정 필요, 경보 수단 없음, 무료 등급 합산 | 반영 | D2(운영 Launch·Cloud SQL), Phase 2 (g), §7 재작성, 3-2 사용량 경보, Phase 0 청구 계정 확인 |
| W6·DA-006·DA-011·FR-005 | 콜드 스타트 기준이 소비자 제한과 다름, 웜 LiteLLM + 정지 Neon 조합 누락 | 반영 | Phase 2 (a)(e). FR-005의 12초는 서브프로세스 상한이고 실제 제한은 bridge 5초라 5초로 잡았다. bridge 오류 구분은 #161에 이미 있다 |
| DA-009 | 종료 유예 10초 대 drain 30초 | 반영 | §8.1 확정, §2 `GRACEFUL_SHUTDOWN_TIMEOUT=3`, Phase 2 (f) |
| W7·DA-007·FR-006 | 풀러 연결만 등록, 풀러 비호환, PG 버전, CI Postgres 신규 작업 | 반영(대안 채택) | 풀러를 쓰지 않고 전부 direct(§2), `connect_timeout=15`, PG 16, 4-1 CI. CI에 PgBouncer를 넣는 안은 풀러를 쓰지 않으므로 기각 |
| DA-008 | salt 검증 공백, 값 변형, 복원 소유권 | 반영 | Phase 0 행 수 확인, 3-1, §8.2 |
| DA-010·I8 | 백업 무음 실패, 수명주기가 정상본까지 삭제, 예산 보정은 네트워크상 불가, 빈 DB 복원 리허설 | 반영 | 1-1 버전 관리·알림, 3-2, admin Job, 3-4 리허설 |
| W5 | VM 폐기 뒤 LiteLLM 관리 경로 없음 | 반영 | `litellm-admin` Job(§2, 3-2) |
| W1·W2·DA-014·FR-004 | accounts v2가 클라이언트 계약과 모순, v1 상태 의미 누락, 백업 잔존, CI 결합과 일정 과소 | 반영 | D4, Phase 7(분리), Phase 6 단계 1·6 |
| W8·FR-007 | 배포 워크플로·WIF 단일 SA, 브랜치 보호, state 위치 | 반영 | 1-2, Phase 0, Phase 5 |
| W9·FR-005 | discovery 미배포 버전 상승이 인프라 전환과 묶임, #161 미머지 대안 | 반영 | D7, Phase 4 선행 조건 |
| I4 | 최대 인스턴스 2에서 RPM이 인스턴스별로 집계됨 | 반영 | litellm 최대 1 |
| I5 | `deletion_protection`, 자동 스냅샷 잔존 | 반영 | Phase 6 |
| I6 | D5·D6 코드 정리 담당 없음, Hanmadi Dify 자동 선택 | 반영 | Phase 0 확인, Phase 5 |
| I7 | 드라이버·이미지·테스트 수정, 플랫폼 예산 경계 동시성 | 반영 | 4-1 |
| I9 | 게이트 수치 기준, 비밀값 목록 | 반영 | Phase 2 기준표, §2 비밀값 표 |
| I10 | 다중 hop 중복 활성 시간 | 반영 | §7 Cloud Run 행 |
| I11 | REQ 상세 스펙·허들 카드 형식 없음 | 기각 | 사용자 결정으로 방향이 정해진 마스터 플랜이다. 태스크 단위 내용은 Phase별 상세 계획에서 작성한다 |
| DA-015 | 전환 기간 `deploy/litellm` 공백 | 반영 | 3-6 |
| FR-008 | 일정을 9~12일 + 관찰 7일로 재산정, 승인 묶음 | 반영 | §10(11~13일), §4 |
