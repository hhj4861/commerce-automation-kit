# VM 이용 플랫폼의 서버리스 스테이징 호환성 확인 — 2026-10-11

## 판정

**플랫폼 전체 이관 검증은 미완료이며, 현재 스테이징으로 운영 연결을 전환하면 안 된다.** Phase 2의 공통 API 스모크 통과는 앱 화면 → 앱 API → 스테이징 → 화면의 성공을 뜻하지 않는다. 이번 검증은 고정 소스·배포 이미지 대조와 실제 클라이언트의 오프라인 요청 캡처까지다. 실앱 화면 E2E는 실행하지 않았다.

목표 사용자 흐름은 Hanmadi 대화/음성, Festa 인터뷰, Shopshorts·블로그의 주제 추천이 각각 앱 서버를 거쳐 스테이징에 도달하고 결과를 사용자에게 반환하는 것이다. Replay는 현재 VM 이용 여부부터 추가 확인이 필요하다.

## 확인한 연결 차이

| 대상 | 확인한 사실 | 아직 확인하지 못한 것 / 전환 전 필요한 조건 |
|---|---|---|
| 모든 앱 | 공통 클라이언트는 서비스 키 Authorization을 전송한다. 스테이징 edge는 별도 Google ID 토큰 인증이 필요한 IAM 비공개 서비스다. | URL만 바꾸는 테스트로는 통과할 수 없다. 격리된 시험 환경에 IAM 인증 전달 경로가 필요하다. 이는 의도된 스테이징 보호이며 운영 결함으로 분류하지 않는다. |
| Hanmadi 기본 대화 | 배포 브랜치의 vendor 0.4.0 클라이언트와 공통 소스가 동일하다. 앱은 timeout을 재정의하지 않아 기본 30초다. 기존 실제 콜드 표본 20건은 모두 30초 초과였다. | 현재 min=0 구성이 앱 제한 시간과 맞지 않는다. 실제 앱에서 timeout을 재현한 것은 아니며, 60초 하네스 성공을 앱 성공으로 간주할 수 없다. 음성 UI 및 결과 표시도 미검증이다. |
| Festa | 확인한 앱 기준 브랜치의 실제 인터뷰 검증 스크립트는 festa-travel을 사용한다. 스테이징 이미지의 model_list에는 이 alias가 없다. | 같은 모델 계약으로 인터뷰를 검증하려면 해당 스테이징 모델 구성이 필요하다. hanmadi-chat으로 임의 대체해 통과 처리하지 않았다. 현재 운영 환경값은 새로 조회하지 않았다. |
| Shopshorts | 추천 어댑터는 discovery 클라이언트를 호출하며 계정 연결·생성 콜백을 요구한다. 요청 경로는 /discovery/v1/discover다. 스테이징 Caddy에는 discovery 전달 경로가 없다. | 추천 버튼부터 결과까지 검증하려면 격리된 discovery 경로가 필요하다. 계정 확인·생성은 기존 클라이언트 콜백이며 공용 accounts 서비스가 필수라는 뜻은 아니다. LiteLLM/JEV 직접 호출로 대체할 수 없다. |
| wp-auto-blog | shared_discovery.py는 DISCOVERY_ENABLED=1일 때 discovery 서비스와 Codex 생성기를 조합한다. | discovery 경로가 없는 현재 스테이징에서 해당 기능의 전체 검증은 불가하다. 운영 활성화 여부·실제 게시 흐름은 확인하지 않았다. |
| Replay | 공통 production.json에는 replay-video-planner alias가 있지만 staging.json에는 없다. 로컬 origin/deploy/replay 검색에서는 LITELLM/shared-ai/replay-video-planner 사용을 찾지 못했다. | alias 존재만으로 실제 VM 이용을 단정하지 않는다. 현재 배포 환경과 실제 AI 호출 경로를 먼저 식별해야 한다. |

## 이번 실행 증거

- 고정 공통 소스: `f84182f238f5e70b3eeac057fa1a1960c6bca1e4`.
- 로컬 배포 추적 ref: Hanmadi `facd92cf75205df577076951183da801b57fa796`, Shopshorts `cf73676a46f29fd539e45af57767b49c64c5c0fa`.
- Festa 확인 ref: venture-studio `origin/feature/agent-test`, `61d6bc49381e0e6cc208b339ce94dde5f2bf26c6`.
- Replay 확인 ref: `origin/deploy/replay`, `b6479e99a24aed9786977797c6e7dcb4cff27f70`.
- 위 ref는 이번에 읽은 로컬 Git 객체다. 각각의 현재 운영 배포와 동일함을 모두 증명한 것은 아니다.
- Cloud Run 제어면 조회에서 edge `shared-ai-stg-00003-qrp`, LiteLLM `litellm-stg-00003-rbn` Ready 및 이미지 digest를 대조했다. edge digest는 `sha256:66463bf407b88a7122d9d71f4f2eb588da5965303e5a04b59ba0906b4f5eef01`, LiteLLM은 `sha256:2c3f70cdbc08cac6bbc639905b1840740b26288425b095e43c0075c95fc39fb6`다.
- Node vm.SourceTextModule로 Git 객체의 공통 index.mjs/accounts.mjs 및 discovery client.mjs를 메모리에서 원문 그대로 연결·실행했다. fetch만 요청 캡처 후 예외를 반환하도록 주입했다. 외부 응답은 만들지 않았고 네트워크 호출은 0건이다.
- 캡처: POST `/llm/v1/chat/completions`의 model `hanmadi-chat`, 같은 경로의 model `festa-travel`, POST `/discovery/v1/discover`. 세 요청 모두 X-Serverless-Authorization이 없었다. 경로·모델·헤더 assertions가 통과했다.
- Hanmadi vendor tar의 package/index.mjs를 메모리로 읽어 공통 소스와 바이트 일치를 확인했다. SHA-256 `fad2ee89e290bf069dcc8eb1fa1c16d1afb5eb2a8743ebfcfc4711403a4ca2b8`, 기본 timeout 30000ms. 앱 conversation.ts의 호출에는 timeout 재정의가 없다.
- 이 실행은 **요청 계약 확인**이다. 브라우저·앱 API 실행, 인증된 스테이징 응답, 응답의 화면 표시를 검증한 결과가 아니다.

주요 근거 경로: `packages/litellm-client/index.mjs`, `apps/hanmadi/lib/conversation.ts`, `apps/hanmadi/lib/model-connections.ts`, `apps/shopshorts/lib/topic-discovery.js`, `services/topic-discovery/client.mjs`, `services/ai-gateway/cloudrun/{staging,production}.json`, `services/shared-ai-host/edge/Caddyfile.staging`. Festa는 `ventures/market/party-festival-guide/app/scripts/verify-jev-browser.mjs`, 블로그는 `src/shared_discovery.py`를 확인했다.

## 관측 보존과 다음 순서

- 13:28 KST 로그 조회 시 g1은 24시간 종료 전, g2는 g1 종료 대기 상태였다. 기존 관측에 앱 HTTP·SQL 요청을 섞지 않았고, 새 키 발급·유료 호출·운영 변경도 하지 않았다.
- 먼저 현재 비용 관측을 마치고, 콜드 응답 시간 문제와 앱 시험에 필요한 인증·모델·서비스 구성을 해결한다. 이후 격리된 앱 시험 환경에서 Hanmadi 대화/음성, Festa 인터뷰, Shopshorts 추천을 각각 실제 화면까지 확인한다. 관측 완료가 앱 E2E 완료를 자동으로 뜻하지 않는다.
- 운영 VM과 기존 플랫폼 연결은 유지한다. 이번 문서 저장·작업 브랜치 push는 운영 전환이 아니다.

기존 공통 API·콜드 측정 증거는 [Phase 2 기록](20261009-serverless-phase2-handoff.md)에 있으며 이번 실앱 검증 결과로 중복 집계하지 않는다.

## 후속 보완 — PR #176

[스테이징 보완 PR #176](https://github.com/hhj4861/commerce-automation-kit/pull/176)에 별도 플랫폼 모델 설정, PostgreSQL discovery 저장소·스테이징 서비스, 앱 시험용 IAM 프록시, 선택적 보온 구성을 준비했다. 운영이나 현재 스테이징에 적용된 것은 아니다.

공용 accounts v1은 마스터 플랜 D4에 따라 이전하지 않고 Phase 7의 API 키 전용 재설계 대상으로 유지한다. 앞선 보고에서 Shopshorts·블로그에 discovery와 공용 accounts가 모두 필요하다고 묶은 설명은 정정한다. discovery 자체의 저장·라우팅 보완과 실제 선택 런타임의 연결 확인이 필요하다.

## PR 머지와 배포 이미지 준비 — 2026-10-11

사용자의 “응 머지하고 이어서 해줘” 승인으로 PR #176을 머지했다. 최신 PR 커밋 `004a282`의 CI 9개가 전부 성공한 것을 확인한 뒤 해당 head를 고정해 머지했고, main merge commit은 `1925eb553d99950af93d44f6710e7f173aee1dfe`다.

같은 main 커밋에서 이미지 3개를 빌드해 레지스트리 업로드까지 확인했다. 아래 digest는 `us-central1-docker.pkg.dev/replay-live-508202/shared-ai/<image>@<digest>`로 사용한다.

| 이미지 | digest | GitHub Actions |
|---|---|---|
| litellm-platform-staging | `sha256:bcc7ae9f8c05262b381bd4929be4eaa52e9d8f4d2ce76f08e17ea67faa01da6a` | [38117504847](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38117504847) |
| edge-platforms | `sha256:cfa543e4a2a493f98ea4059ea75bc4e4fea14c97a2be19007fb32b58e4dd44bc` | [38117506594](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38117506594) |
| discovery-staging | `sha256:6c94a624ab05293c6142ef42c4ab00ccae70359587db6e51c1b627cb30dc7d24` | [38117508122](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38117508122) |

### 현재 배포 보류 이유와 재개 조건

- g1 원본 `ag1-1791607659.jsonl`은 10월 11일 13:49 KST에 종료됐다. g2 선행조건 검사에서 관찰 기간 86,422.635초, poll error 0, unknown gap 0, 미회수 키 0을 확인했다.
- g2 원본 `g2-1791688316.jsonl`은 Scheduler 성공 확인 후 10월 11일 13:56:09 KST부터 24시간 관측을 진행 중이다. 정상 종료 예정은 **10월 12일 13:56경 KST**다. 시각 도달만으로 완료를 선언하지 않고 종료 로그·공백/오류·Scheduler pause를 확인해야 한다.
- 이번에는 비용 관측에 영향을 주지 않는 Git 머지, 이미지 빌드, Secret Manager 메타데이터 조회만 했다. Cloud Run 리비전·트래픽·DB·Scheduler를 변경하지 않았고 앱/공급자 호출은 하지 않았다. 새 이미지가 실제 서비스에 배포된 상태가 아니다.
- 메타데이터 확인: discovery 스테이징 시크릿 5개는 컨테이너가 없고, `festa-chat-api-key`/`replay-chat-api-key`는 버전이 없다. 값은 읽지 않았다.
- 다음은 g2 종료 확인 → 별도 빈 discovery 스테이징 DB·시크릿 준비 → Terraform plan 확인·스테이징 적용/마이그레이션 → 제한된 실제 앱 검증 순서다. 절차는 main의 `docs/plans/20261011-staging-platform-parity.md`를 따른다. 새 유료 앱 호출의 건수·상한은 실행 전에 확정한다.
- 이 시점에도 운영 VM과 기존 앱 연결은 유지한다. 앱 E2E와 운영 이관은 미완료다.

## 관측 중 가능한 사전 준비 — 2026-10-11 후속

사용자의 추가 “계속해줘” 요청으로, g2 관측 조건에 영향을 주지 않는 빈 Secret Manager 컨테이너 준비만 별도로 진행했다. DB 생성·접속, 시크릿 값 복사, 런타임 자격 발급, 앱 호출, 리비전 변경은 수행하지 않았다.

- 적용 코드: 승인·머지된 main `1925eb553d99950af93d44f6710e7f173aee1dfe`.
- 기존 GCS backend `replay-live-508202-tfstate/shared-ai-host`, 개인 계정의 단기 토큰을 메모리로 사용했다. 로컬 state나 토큰 파일은 만들지 않았다.
- `prepare_platform_staging=true`, target `google_secret_manager_secret.discovery_stg`의 저장 계획을 생성하고 실제 변경 주소와 create 동작을 검사했다. 계획 SHA-256: `8de261bb2cbdc07872ebee546c16851508fd47260d4eba3ef2e9b0cdd4f1f441`.
- 같은 저장 계획 적용 결과: **5 added, 0 changed, 0 destroyed**. 대상은 `discovery-stg-database-url`, `discovery-stg-platform-keys`, `discovery-stg-naver-id`, `discovery-stg-naver-secret`, `discovery-stg-jev-key`다.
- 적용 후 공식 제어면 조회로 다섯 컨테이너 모두 존재하며 값 버전은 각각 0개임을 확인했다. IAM·Cloud Run·Scheduler·운영 VM의 변경은 계획에 없었다.
- 현재 g2는 계속 관측 중이며 종료 이벤트가 없다. 이번 target apply는 전체 스택 drift 없음이나 앱 검증 완료를 뜻하지 않는다.
- **후속 전체 plan에서도 `prepare_platform_staging=true`를 유지한다.** `platform_staging` 객체를 설정하기 전에 기본 false로 되돌리면 이번 빈 컨테이너의 삭제가 계획되므로 적용하지 않는다. 서비스 배포 전에는 원래 절차대로 전체 plan과 기존 PoC 변수를 다시 확인한다.
- 이번 로컬 plan과 초기화 캐시는 검증 후 삭제했다. 기존 관측 worktree의 제공자 파일은 보존했다.

남은 작업은 관측 종료·Scheduler pause 확인, 별도 빈 discovery DB와 7개 시크릿 값 준비, 스테이징 배포/마이그레이션, 한도가 정해진 실제 앱 E2E다. 현 단계는 빈 컨테이너만 실제 적용됐으며 새 스테이징 서비스나 운영 이관이 완료된 것이 아니다.

## 앱 검증 실행 경로와 HTTPS 사전 점검 — 2026-10-11 후속

17:32 KST 확인 시 g2 기록은 48줄이며 최신 관측은 4분 이내였다. 오류 이벤트와 종료 이벤트는 없고 관측은 진행 중이다. 여기서 전체 24시간 오류 0을 확정하지 않는다.

### 기존 스크립트를 그대로 사용하면 안 되는 이유

- Hanmadi 배포 ref의 `scripts/conversation-smoke.mjs`는 자체 모의 공급자를 띄우고 모델·음성·응답을 합성한다. 이 스크립트 통과를 실제 스테이징 성공으로 집계하지 않는다. 실호출은 별도 깨끗한 앱 checkout을 명시적 스테이징 프록시 URL/시험 키로 실행하고 `/api/auth`, `/api/conversation`, `/api/conversation/transcribe`, `/api/conversation/speech` 및 실제 화면을 확인한다. 기존 파일은 수정하지 않았다.
- Festa `origin/feature/agent-test` `61d6bc49381e0e6cc208b339ce94dde5f2bf26c6`의 `scripts/verify-jev-browser.mjs`는 upstream을 **운영 edge URL로 고정**한다. 또한 Next 하위 프로세스 환경을 새로 구성하므로 상위의 `NODE_EXTRA_CA_CERTS`를 자동 전달하지 않는다. 이 스크립트를 스테이징 시험으로 실행하지 않는다. 격리 앱을 직접 실행해 `LITELLM_BASE_URL`, `JEV_BASE_URL`, 두 시험 키, `NODE_EXTRA_CA_CERTS`를 명시하고 브라우저에서 합성 인터뷰를 진행한다. 또는 별도 Festa 저장소에서 스크립트 변경을 검증·머지한 뒤 사용한다.
- 블로그 `9e36acffcd189143ab5673534036f844ac5f8392`의 `src/shared_discovery.py`는 `DISCOVERY_ALLOW_LOCALHOST=1`을 지원한다. 따라서 loopback HTTP 경로를 해당 시험 프로세스에만 허용할 수 있다. 직접 `shared_discovery.discover()`만 호출하고 게시 오케스트레이션은 실행하지 않는다. 기존 Codex 연결 확인·생성 콜백, `DISCOVERY_REQUEST_ID`, `BLOG_CODEX_HOME` 등은 그대로 필요하다. 이 조회는 실행 성공이나 로그인 확인이 아니다.

### 실행한 로컬 TLS 시험

main `1925eb5`의 공통 LiteLLM 클라이언트와 `app_proxy.make_server`를 그대로 로드했다. 임시 자체서명 인증서를 OS 비동기화 임시 폴더에 만들고 실제 loopback TLS 서버에 Node 기본 fetch로 연결했다. 프록시의 외부 전송은 캡처 후 오류로 종료하는 시험 transport로 대체했다.

1. CA를 지정하지 않은 클라이언트: `network_error`로 거부되고 upstream 시도 0개.
2. 시험 Node 프로세스에만 `NODE_EXTRA_CA_CERTS` 지정: HTTPS 검증 통과, 요청 1개 캡처. `festa-travel`, `/llm/v1/chat/completions`, 서비스 Authorization과 Google용 X-Serverless-Authorization이 모두 보존됨. 캡처 transport가 의도적으로 중단하므로 최종 응답은 `upstream_error`이며 모델 성공 응답을 만들지 않았다.

외부 요청 0개, 실제 토큰/키 사용 0개, 숨은 재시도 0개. 시험 종료 후 로컬 인증서·개인키를 삭제했다. 이는 **TLS/요청 전달 검증**이며 Festa 앱 자체, Cloud Run, 실제 JEV/LLM, 화면 표시 성공 검증이 아니다. 운영 및 관측 중인 스테이징은 변경하지 않았다.
