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
