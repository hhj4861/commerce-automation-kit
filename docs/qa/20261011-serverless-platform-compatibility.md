# VM 이용 플랫폼의 서버리스 스테이징 호환성 확인 — 2026-10-11

## 판정

**운영 VM 연결을 유지한 채 스테이징 보완본을 배포하고 실제 기능을 검증했다. 전체 기능 동등성은 아직 미달이다.** Hanmadi·Festa·Replay JSON, 스트리밍, Responses, JEV, 영상 입력, TTS→STT와 discovery의 검색·JEV·저장·재시도·격리는 통과했다. accounts는 서버리스에 없고, 기존 콜드 기동 지연의 해결 및 실앱 화면 E2E는 미검증이다. API 통과를 플랫폼 전체 성공으로 바꾸어 보고하지 않는다.

사용자 선택에 따라 g2 비용 관측은 중단했다. 기능 시험에는 LiteLLM min=1을 임시 사용했으며 종료 시 min=0 복구를 완료했다. 모델용 임시 키 2개는 폐기 후 401을 확인했다. 스테이징 discovery의 JEV 설정은 폐기된 시험 키를 참조하므로, 새 실호출 전 제한 키 재주입이 필요하다. 아래는 시점별 누적 기록이며 최종 배포·시험 결과는 마지막 절을 기준으로 한다.

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


## VM 기능 전체 대조와 기능 검증 우선 전환 — 2026-10-11

- 최신 사용자 범위: **운영 VM과 기존 플랫폼 연결을 유지하며, VM 제공 기능이 서버리스에도 있는지 검증한다.** 운영 트래픽 전환·VM 종료는 하지 않는다.
- 담당/기준: 현재 세션, 보완 코드 main `1925eb5`. 완료 기준은 항목별 실제 기능 증거이며, 배포·단위 테스트·API 200을 앱 전체 성공으로 대체하지 않는다.
- IAP SSH 읽기 전용으로 실제 VM을 확인했다. LiteLLM(`87f34979b9f8`), discovery(`7e9d866`), accounts(`claude-2.1.284`), Caddy, Postgres 16이 실행 중이다. Dify 실행 컨테이너는 없다.
- VM Caddy 원문에는 `/llm` 기본 6개 경로, native Gemini, JEV, discovery start/get/claim/complete, accounts connections/chat 경로가 있다. 무인증 로컬 조회 결과 health=200, models/accounts/discovery=401이다. 이는 라우팅·인증 응답 증거이며 정상 사용자 업무 성공이 아니다.
- VM의 실제 마운트 설정에서 모델 alias 5개와 공급자 모델명을 추출했다. 준비된 `platform-staging.json`과 동일하다. 현재 배포된 기본 staging 설정에는 Festa·Replay alias가 없다. 비밀값은 출력하지 않았다.
- Cloud Run 제어면에서 기존 `shared-ai`, `litellm-stg`, `shared-ai-stg`, probe만 확인됐다. discovery/accounts 서비스는 없다. 스테이징 edge는 여전히 `00003-qrp`, 이전 `edge-staging` digest `66463bf4…`다.

| 기능 | 현재 확인 결과 | 서버리스 동등성 판정 |
|---|---|---|
| Hanmadi chat JSON/스트리밍 | 기존 실공급자 200, stream DONE/33 events 확인 | API 기능 스모크 통과, 앱 표시 미검증 |
| STT/TTS | 기존 실공급자 200, 무음 1초/텍스트 3글자 | API 기능 스모크 통과, 의미 있는 전사·재생 미검증 |
| Gemini native / JEV | 기존 실공급자 각 200 | endpoint 통과, 실제 영상 입력 및 플랫폼별 결과 처리 미검증 |
| Festa / Replay 모델 계약 | 준비 이미지에는 VM과 같은 alias·공급자 모델, 현재 배포에는 없음 | 미배포, 실호출 미검증 |
| discovery 검색·생성 콜백·JEV·영구 상태 | VM 실행 중, 서버리스는 코드·이미지만 준비 | 서비스 미배포, 전체 흐름 미검증 |
| accounts 연결·인증·chat | VM 실행·401 인증 응답, 서버리스 서비스/라우트 없음 | 기능 미제공. 기존 D4 제외 결정을 전체 동등성 통과로 처리하지 않음 |
| 키 발급·폐기·사용 기록·예산 초기화 | 기존 키 폐기 후 401, 사용 기록 20/20, 예산 초기화 2회 통과 | 시험한 부분 통과, 전체 관리 기능·종료 조건 미검증 |
| 기존 앱 제한시간 | 콜드 표본 20/20이 30초 초과 | 현 min=0 구성 미달, timeout 상향으로 숨기지 않음 |

기존 실호출 증거를 새 호출로 재집계하지 않는다. `features-1791589216.jsonl` SHA-256 `f009c5b5a362876fd9fa7e6adc51e7214e491b6afdfcec3b94e57e499ac998c9`: 기능 6건 200, 폐기 401. `bc-1791589343.jsonl`: spend-result passed=true. `cfe-1791593141.jsonl`: budget-result 2회 true, 종료 시험은 condition_met=false라 미검증(유실 관측 0만으로 통과 아님), keys_unconfirmed=0.

### 비용 시험 중단

사용자가 **“기능 검증 우선: 비용 시험 중단 후 스테이징 배포”**를 선택했다. 기존 24시간 완료 대기 순서보다 이 최신 지시를 우선한다.

- 시작 시각과 실행 파일을 확인한 g2 PID 46726에 SIGINT를 전달했다. 관측 원본을 수정하지 않았다.
- 원본에는 `g2-scheduler-paused` confirmed=true와 `g2-stopped` scheduler_pause_confirmed=true/provider_calls=0이 기록됐다. 별도 제어면 조회도 PAUSED이며 관측·caffeinate PID가 종료됐다.
- 24시간 창을 채우지 못한 **사용자 요청 중단**이다. 비용 시험 성공/실패 지표로 임의 변경하지 않는다. SIGINT traceback 8줄이 원본 JSONL 끝에 있으므로 집계 시 비JSON 종료 기록을 구분하고 원본을 보존한다.
- 다음: 빈 discovery DB·전용 시험 설정 → 검토된 스테이징 보완본 배포/마이그레이션 → 기능별 실호출·실앱 검증. 운영 VM/플랫폼 설정은 유지한다.

## 기능 보완본 스테이징 배포와 실제 검증 — 2026-10-11 후속

### 적용 범위

- 승인 범위: 비용 관측 중단 후 스테이징 기능 검증 우선. 운영 VM·공개 edge·플랫폼 URL·DNS는 변경하지 않았다.
- Neon `shared-ai-stg` 프로젝트에 별도 `discovery_stg` DB와 `discovery_stg_owner`를 생성했다. 기존 운영 데이터와 연결 계정은 복사하지 않았다.
- 스테이징 전용 platform key 3개를 만들고, discovery DB/검색/JEV 및 Festa·Replay 설정 7개를 Secret Manager의 숫자 버전 1로 고정했다. 공급자 값은 VM에서 읽어 비밀 저장소로 전달한 뒤 메모리에서 일치 확인했으며 파일·대화에 원문을 기록하지 않았다.
- 준비 plan `77df2ed737a6db2aa61a791376e8b7aa8e68c682df5d0b69e18af18ad9cb1a0b`: **10 추가, 2 수정, 삭제 0**. discovery SA·권한·migration Job 및 스테이징 LiteLLM 설정만 변경했다.
- Job `discovery-stg-migrate-k8p7f` 성공. 별도 SQL 조회로 `discovery.requests`, `discovery.active`, `discovery.action_results` 3개 테이블을 확인했다.
- 서비스 plan `e0470ffa29ce72b48543cf49fd484c55f365958a1eae2dad3691a52ba5a6f17d`: **1 추가, 1 수정, 삭제 0**. discovery 서비스와 스테이징 edge upstream만 변경했다.
- 배포 이미지는 위 PR #176의 digest 3개 그대로다. 실제 기능 시험 리비전은 LiteLLM `litellm-stg-00005-crm`, edge `shared-ai-stg-00005-wn8`, discovery `discovery-stg-00001-sql`이었다. 각 Ready 및 traffic 100%를 확인했다.
- 운영 edge는 `shared-ai-00001-f8t`로 유지됐다. Scheduler는 기존 내부 LiteLLM 경로를 보존(`warm_ping_via_edge=false`)하고 PAUSED 상태를 유지한다.

### 실제 공급자 API 시험

모든 요청은 IAM 비공개 스테이징 edge를 거쳤다. LiteLLM 최소 인스턴스 **1인 기능 시험 조건**이며, 30초 요청 제한을 사용했다. 응답 모킹은 없었다.

| 항목 | 결과 | 실제 관찰 |
|---|---|---|
| Hanmadi JSON | 통과 | 200, 2,457ms, `{"ok":true}` 파싱 일치 |
| Festa JSON | 통과 | `festa-travel` 200, 1,140ms, JSON 일치 |
| Replay JSON | 통과 | `replay-video-planner` 200, 1,022ms, JSON 일치 |
| 스트리밍 | 통과 | 200, SSE 8개, 첫 event 813ms / 마지막 1,200ms, DONE 수신 |
| JEV 직접 호출 | 통과 | 200, 643ms, `jev-1.13.0` answers/usage 반환 |
| Gemini native 실제 영상 입력 | 통과 | 직접 만든 1초 빨간색 MP4 2,273바이트 입력, 200/1,017ms, `Red` 응답. 타인 영상·실사용자 영상 미사용 |
| TTS→STT | 통과 | 한국어 문장 TTS 200/48,527바이트 → 같은 음원 STT 200. `안녕하세요. 오늘은 하늘이 맑습니다.` 원문과 정규화 일치. 청음 품질 평가는 아님 |
| Responses | 통과 | 200/1,185ms, completed/`OK` |
| IAM·서비스 키 | 차단 확인 | Google ID 토큰 누락 401, 잘못된 서비스 키 401, 비허용 관리 경로 404 |
| accounts | **미제공** | 스테이징 `/accounts/connections` 404. VM에는 실행 서비스와 인증 라우트가 존재 |
| embeddings | **기능 성공 미검증** | VM/시험 이미지 모두 embedding 모델 설정 없음. 허용되지 않은 모델 요청 403만 확인했으며 embedding 생성 성공으로 집계하지 않음 |

### discovery 실제 서비스와 공용 클라이언트

main `1925eb5`의 `services/topic-discovery/client.mjs`를 수정 없이 실행하고 Google ID 토큰만 시험 fetch에 추가했다. 플랫폼은 스테이징 전용 `shopshorts`, `wp-auto-blog` 키, 사용자는 합성 식별자다. **generate/assertConnection은 명시적인 시험 콜백**이다. 실제 Codex 로그인·생성, 앱 서버, 브라우저 UI를 실행했다고 주장하지 않는다.

1. 실제 네이버 검색 → awaiting_generation → claim → 합성 후보 제출 → 서비스 계정의 metadata ID 토큰으로 실제 JEV 호출 → PostgreSQL 저장 → GET을 확인했다. 요청 `08aa7f2e-d0c2-400b-ac55-1ef92d5d07d8`, searchCalls=2/generationClaims=1/jevCalls=1이다.
2. 요청 상태는 complete이나 후보는 held다. 이유는 `support_uncertain`, `value_uncertain`; JEV relevance confidence 0.92, support 0.46, value 0.61이다. 오류로 JEV가 생략된 것은 아니며, 후보 채택·추천 품질 성공도 아니다. 실제 검색 결과에는 무관하거나 비공식인 자료가 섞여 있었다.
3. GET 결과가 완료 응답과 동일했다. 시작 재요청·완료 재요청 모두 같은 결과와 usage를 반환했고 추가 생성 0, 추가 검색/JEV 0이었다.
4. 다른 사용자 및 `wp-auto-blog` 키로 같은 요청 조회 시 각각 404로 격리됐다.
5. 같은 이미지를 새 리비전 `discovery-stg-parity-20261011`으로 배포하고 traffic 100% 전환 후 기존 결과 전체가 동일하게 조회됐다. 로컬 파일·프로세스 메모리만으로 보존된 결과가 아니다.
6. `wp-auto-blog` 전용 키의 별도 요청은 실제 검색 뒤 합성 생성 오류를 보냈다. `generation_failed`로 held 저장됐고 재요청해도 generationClaims=1/jevCalls=0을 유지했다. 자동 재생성·숨은 유료 재호출은 없었다.

### 비용·정리와 증거

- 직접 시험 키: 1시간, $0.10, 10RPM. discovery 전용 JEV 키: 4시간, $0.05, 10RPM. 둘 다 폐기 후 models=401을 확인했다.
- 초기 key/info 비용은 쓰기 지연 전 $0.003533002였으므로 최종 비용으로 사용하지 않는다. 별도 **스테이징 SpendLogs 집계**는 직접 호출 success 9건 **$0.003717558**, discovery JEV success 1건 **$0.00013503**, 합계 **$0.003852588**이었다. 직접 시험의 허용되지 않은 embedding 요청은 failure 1건/$0로 별도 남았다. 인프라 비용과 모델 공급자 원장 대조까지 완료한 값은 아니다.
- 보온 원복 plan `3aa70806be47a18715dc479ba328f9bf03232c94c8b65d31057b2a34fcb9f4a2`은 LiteLLM min=1→0과 discovery 시험 revision 이름의 Terraform 정규화만 포함했다. **0 추가, 2 수정, 삭제 0으로 적용 완료.** 최종 LiteLLM `00006-h2c`, discovery `00003-gdp`, edge `00005-wn8`은 Ready 및 min=0이다. Scheduler PAUSED, 운영 VM RUNNING, 운영 edge `00001-f8t` 유지도 별도 조회로 확인했다.
- 원본 폴더: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261009-serverless-p2/`.
- 이번 원본: `platform-features-20261011.jsonl`, `platform-discovery-start-20261011.json`, `platform-discovery-complete-20261011.jsonl`, `platform-discovery-persistence-20261011.jsonl`, `platform-cleanup-20261011.jsonl`.
- `platform-final-state-20261011.json`에 최종 제어면 상태·원본 SHA-256·비용 관찰값을 저장했다. 직접 기능 원본 SHA-256 `19a9c14f7fa6bee01f06bd375c456dbd6347017e658e0371d2615eef6dcb7d26`, discovery 완료 원본 `7f1f76cbdd27b334e34d5dad7a944e0b278e029fd0279ab84edf47587b9cfaad`. 비밀값 패턴 검사는 일치 0건이다. 적용한 본인 plan 3개와 본인 초기화 캐시만 삭제하고 기존 관측 worktree는 보존했다.

### 전체 동등성에 남은 항목

- **accounts:** 기존 D4는 v1을 이전하지 않고 API 키 전용 v2로 재설계하는 결정이다. 현재 v2가 없으므로 “VM 전체 기능 제공” 기준은 충족하지 못한다. 기존 구독 로그인 경로를 그대로 복사하여 임시 통과시키지 않는다.
- **실플랫폼 흐름:** Hanmadi 음성 화면, Festa 인터뷰, Shopshorts/블로그의 실제 생성 어댑터와 최종 결과는 별도 검증이 필요하다. 이번의 합성 콜백·서버 API 성공은 이 항목의 대체 증거가 아니다.
- **min=0 응답시간:** 이전 콜드 표본 20개 모두 30초 초과였다. 이번은 min=1 기능 시험이므로 콜드 문제 해결·비용 최적화가 입증되지 않았다. 새 이미지의 콜드 성능 개선도 확인하지 않았다.
- 운영 데이터 이관·백업 복원·종료 중 기록 유실 시험은 이번 범위의 성공 항목이 아니다. 기존 종료 시험은 조건 미충족이며, Dify는 VM에서 실행 중이 아니므로 정상 제공 중인 기능으로 집계하지 않았다.
- 다음 순서는 accounts v2의 제공 범위를 확정하고 구현한 뒤, 격리한 실제 플랫폼 흐름과 min=0 제한시간을 확인하는 것이다. **운영 VM 유지 및 운영 전환 보류는 계속한다.**
