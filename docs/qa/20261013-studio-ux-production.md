# Studio UI 운영 반영 — 2026-10-13

- 목표/담당: Codex 단독, 승인된 #201/#202/#204 및 추가 승인 #205 운영 반영. worker/Claude OFF.
- #201(main): 78b1a038e6f4760c812262bda33d6534dc8bbfc8, #202(deploy/shopshorts): 44ddf15a64caa9c47d4382c31266a16600697972.
- #204(main): 3d302c99e083f0d7a19a3b9acee91fe5e69cd91f. #205(deploy/shopshorts): 4e263663a8d8cc4b04b45a8fd6808b1ada0a58a2.
- UI 원본 72dc4ec을 운영 브랜치에 단독 cherry-pick한 81afa3b를 #205로 명시 승인·머지. 다른 main 문서 변경 제외.
- 운영 checkout `/Users/admin/workSpace/shopshorts-production`을 깨끗한 상태에서 승인 #205 merge commit으로 갱신.
- 운영 의존성 기준 계정·Codex·시나리오·콘텐츠·UI 96개 테스트 통과. UI 승격 43개 통과, 두 PR 필수 GitOps CI 통과.
- GitHub 자동 배포 run 38332143733(#202), 38332726602(#205)는 Cloudflare credential request 403으로 실패. CI 비밀관리 정책이나 권한을 완화하지 않았다.
- 기존 Wrangler 로그인으로 exact #205 revision을 Pages `shopshorts-dash`, production branch `deploy/shopshorts`에 배포. 첫 Node20 실행은 Wrangler의 Node22 요구로 exit1, 설치된 Node22.23.3으로 재실행 exit0.
- 실제 운영 브라우저 `/contents`: 24개 콘텐츠, 완성본 ‘완성 영상 · 검수 대기 / 영상 검수하기’, 실패 ‘확인하고 이어하기’ 확인.
- `/performance`: 전체 24개, 제작·검수 22 / 완성 영상 9 / 확인 필요 7 / 업로드 완료 2. 실제 시청 성과 수치가 아닌 제작 현황임을 표시.
- `/settings`: Codex 연결됨, 제작 워커 연결 대기 표시. 거짓 정상 상태 없음.
- `/metadata`: 공통 sidebar, 모바일390×844 메뉴10개와 가로 넘침 없음. viewport override 복구.

## 재시작 후 확인

- Pages deployment `4a025c8b-d4e8-49c5-81ac-a9da3c6ebac8`, source `4e26366`, URL https://shopshorts-dash.pages.dev .
- 사용자가 운영 계정 작업 건수 조회와 안전한 재시작을 승인한 뒤 poll: 0건, 다음 페이지 없음. 계정 워커 재시작 완료(PID 9404, running).
- 별도 미디어 워커 재시작 질문에 사용자가 ‘계속’으로 승인. 정상 SIGTERM 후 KeepAlive로 재기동(PID 15337, running, 이전 종료 0). 강제 종료하지 않았다.
- 운영 config 조회: cloud-worker, workerAt 2026-10-13T01:59:54.634Z, 확인 당시 age 5초. image/video/voice/shortsUpload/motion/animation/webtoon/hybrid/metadata capability 확인. 프로세스 존재만이 아니라 서버 heartbeat 복구 확인.
- 시나리오 재검증은 자료 확인 뒤 `codex scenario UNKNOWN`으로 실패. 이전 CODEX_TIMEOUT과 다르다. 원래 오류의 상세 필드가 남지 않아 원인을 단정할 수 없다.
- 생성 데이터의 길이/장면 형식 검증 오류가 UNKNOWN으로 축약되는 코드 경로를 확인해 `fix/shopshorts-scenario-validation`에서 안전한 오류 분류와 공유 1회 보완 한도를 구현했다. 80개 로컬 검사 통과, 선택 실행 검사 1개 미실행. 실제 렌더 검사도 통과했다.
- 사용자 추가 승인 후 #207(main) merge `3f38a86f89c6e4b1170c1abb355c7e9469a24a06`, #208(deploy/shopshorts) merge `7c2011ee7e089633574ce04df1fcecaec9185319` 반영. 두 PR 필수 CI 통과, 배포 브랜치와 실제 운영 checkout 각각 계정/시나리오 통합 26개 통과.
- 최신 운영 Pages deployment `add8d16f-dc2f-4832-a648-0d9d85fde85a`, Production / deploy/shopshorts / source 7c2011e 확인. https://add8d16f.shopshorts-dash.pages.dev . 사용자 주소 https://shopshorts-dash.pages.dev 에 적용됐다.
- activeCount 0, hasNext false 확인 후 계정 워커를 최신 소스로 재시작. PID 14854 running / 이전 exit 0. 미디어 워커 PID 15337 running 유지.
- #208 GitHub 자동 배포 run 38336633193도 Cloudflare credential request failed (403). 기존 Wrangler 로그인으로 수동 운영 배포 exit 0. 자동배포 자격 문제는 해결되지 않았다.

## 남은 경계

- 전체 자동 실생성 E2E는 아직 미완료다. 대본 실패를 해결하고 최종 렌더까지 다시 확인해야 한다.
- GitHub 자동 배포의 Cloudflare credential request 403은 남아 있다. 이번 Pages 수동 배포 성공과 GitOps 복구는 다르다.
- 재검증 시 CUA 브라우저 목록이 비었고 Chrome native 제어도 `Sky Computer Use native pipe startup failed`. 사용자 요청에 따라 제어 커널 초기화 후 getState를 재실행했지만 apps/browsers 모두 비었고 같은 오류였다. #208 배포 후 UI를 통한 새 대본 생성 요청은 아직 시작하지 못했다. 기존 화면 검증 증거와 API heartbeat 확인은 앞 절과 같다.
- 신규 유료 미디어 생성/발행 없음. 기존 승인 차단은 사용자 추가 승인으로 해소됐다.

## 브라우저 복구 후 실검증 재개

- 2026-10-13 13시대 CUA native/Chrome 연결 복구 확인. 기존 로그인 유지, 제작 워커 온라인. 브라우저 장애가 계속된다는 이전 상태는 해소됐다.
- QA 프로젝트 `7e88650a-54f0-6eb6-3dac-c4744f24afa4`는 재개 시 SCENARIO_FORMAT_INVALID 상태였다. 이전 실제 출력이 보존되지 않아 실패한 세부 필드는 확정하지 못했다.
- 13:08 KST 운영 UI에서 대본 재생성을 한 차례 요청했다. 자료 확인 → 대본 작성 → 설명·결말 검토 → 자동 보완 단계까지 실제 진행 확인. 이번 생성은 첫 장면 형식 검사를 통과했다.
- 검증 탭이 사라진 뒤 새 탭에서 같은 프로젝트를 열어 서버 작업이 계속 진행되는 것을 확인했다. 원인 미상의 탭 종료를 Shopshorts 서버 실패로 처리하지 않았다.
- 제작 기획은 45초/건축학/자동 혼합, Higgsfield 상한 54크레딧. 미디어 워커의 SHOPSHORTS_MOTION_NODE는 설치된 Node 22.23.3을 가리킨다. 아직 이 요청의 유료 미디어 생성은 시작하지 않았다.
- 수정 대본은 형식 검사를 통과해 다시 내용 검토로 진행했지만 최종 SCENARIO_DEPTH_INVALID로 중단됐다. 신규 영상/음성 생성·렌더·발행 없음.
- 코드 확인 결과 검토 JSON의 형식/인용 오류도 같은 DEPTH 오류로 표시되고 있어 이번 최종 실패의 세부 원인을 소급 확정할 수 없다. 첫 검토 후 보완 단계 진입은 실제 불합격 항목이 존재했다는 증거다.
- 별도 worktree에서 검토 응답 형식 오류의 1회 보완과 별도 분류, 실제 내용 불합격의 고정 항목 안내를 구현했다. 원본 cc0ca99, 운영 승격 dfe4650. 원본 관련 77검사·승격 17검사 통과, 각 작업 upstream push 완료.
- PR #211(main): https://github.com/hhj4861/commerce-automation-kit/pull/211 / #212(운영 승격): https://github.com/hhj4861/commerce-automation-kit/pull/212 . 사용자 명시 머지 승인 요청 상태이며 아직 운영 적용하지 않았다.
- 전체 실생성 E2E는 계속 미완료다. 새 변경의 승인·배포 후 실제 실패 항목 확인과 대본/미디어/최종 렌더 검증이 남는다. 자세한 변경·제한은 구현 PR의 `docs/qa/20261013-scenario-review-feedback.md`에 기록했다.

## #211·#212 승인 후 운영 반영

- 사용자 명시 승인 후 #211 main merge `e9af8016f03f875106c8a29da09e4a57383f3448`, #212 deploy/shopshorts merge `ffba7b4d2482e155e73433b1fb8aa5bc8ac94543` 완료.
- 깨끗한 운영 checkout을 exact #212 merge로 갱신. 머지본 explanation-depth / scenario-review-feedback / studio-scenario-repair 통합 17개 통과. 최초 검사 명령의 파일명 오타는 실행 전에 실패했고 정확한 파일명으로 바로잡았다.
- 계정 작업 aggregate poll activeCount 0 / hasNext false 확인 후 승인된 안전 재시작 실행. launchctl PID 9838, LastExitStatus 0 확인. 미디어 워커는 불필요하게 재시작하지 않았다.
- Pages 수동 배포 exit 0. 실제 Production / deploy/shopshorts / source ffba7b4, deployment `29f6610c-cc0f-43bf-a76a-00c18a357e95` 확인. https://29f6610c.shopshorts-dash.pages.dev 및 운영 도메인 적용.
- GitHub 배포 run 38357074620은 기존 Cloudflare credential request failed (403)로 실패. 자동배포 자격 문제는 여전히 미해결이며 이번 운영 반영은 Wrangler 수동 배포이다.
- 15:38 KST 같은 QA 프로젝트에서 운영 UI의 ‘대본 생성 다시 시도’를 1회 실행. UI의 생성 중 1건 / 자료 확인 중으로 실제 요청 접수를 확인했다.

## #212 운영 실검증 결과와 후속 범위

- 15:38 KST 재시도에서 research → scenario → review → revision까지 확인한 뒤 CODEX_TIMEOUT으로 종료됐다. 검토 형식 오류나 대본 최종 불합격으로 보고하지 않는다. 실행 중 aggregate 조회에서도 running 1 / queued 0 / live lease 1을 확인해 화면만 남은 작업과 구분했다.
- 개별 Codex 시나리오 호출 제한은 360초, 전체 작업은 900초다. 새 음성·미디어·렌더·발행은 시작하지 않았다. 전체 자동 실생성 E2E는 미완료다.
- 작성·보완·검토 단계까지 웹 검색이 활성화돼 있던 것을 코드로 확인했다. 이번 시간 초과의 직접 원인인지는 실제 CLI 출력이 보존되지 않아 확정하지 못했다. 고정된 조사 근거로 작성·검토하도록 draftOnly 경계를 적용한 후속 변경을 별도 브랜치로 준비했다. 모델·추론·시간 제한·검토 기준·예산은 변경하지 않았다.
- 후속 원본 a484253, 운영 승격 914a066, 각각 작업 upstream 정상 push. 원본 관련 45개 검사와 승격 통합 18개 통과.
- PR #213: https://github.com/hhj4861/commerce-automation-kit/pull/213 / PR #214: https://github.com/hhj4861/commerce-automation-kit/pull/214 . 이 두 PR은 새 승인 대상이며 아직 머지·운영 적용하지 않았다.
- 다음 확인은 승인 후 후속 배포에서 같은 기획의 실제 생성 결과를 확인하는 것이다. CI의 Cloudflare credential 403도 별도 미해결이다.

## #213·#214 승인 후 운영 반영

- 사용자 ‘응 진행해줘’로 두 후속 PR 머지·배포 승인. #213 main merge `e154e577cd944b87cebf67e9dbc4dd524e355fbb`, #214 deploy merge `b14a0009475562b8b17a307658ae799da879da00`.
- 운영 checkout clean 확인 후 exact merge로 전환. 검사 18개가 통과했던 승격 커밋 914a066과 머지본의 전체 tree diff가 0임을 확인해 일치하는 통합 검사 증거를 재사용했다.
- aggregate account poll 0건/다음 페이지 없음 확인 후 계정 워커 재시작. PID 12306, LastExitStatus 0. Pages 배포 exit 0; Production / deploy/shopshorts / source b14a000, deployment c053edb0-6133-4398-981d-7af47b13aa54 확인. https://c053edb0.shopshorts-dash.pages.dev 및 운영 도메인에 반영.
- GitHub 자동 배포 run 38367288557은 failure. 이번 반영은 인증된 Wrangler 수동 배포다.
- 동일 QA 프로젝트에서 ‘대본 생성 다시 시도’를 1회 요청한 뒤 ‘선택한 주제의 자료 확인 중’을 운영 UI에서 확인했다. 결과는 다음 항목에 기록한다.


## #214 실생성 결과·자동배포 진단

- 1회 요청은 자료 확인 → 대본 작성 → 보완 후 SCENARIO_FORMAT_INVALID로 종료. 이번 요청은 CODEX_TIMEOUT이 아니다. 첫 실패가 형식/내용 중 무엇인지 UI에서 직접 확인하지 못했다. 원본 출력은 보존되지 않아 당시 실패 필드를 소급 단정하지 않는다. 새 미디어·음성 생성·렌더·발행은 시작하지 않았다.
- 보완 요청에는 오류 코드만 있고 실패한 필드가 누락된 것을 확인했다. 웹툰 레이어/장면과 길이 제약을 안전한 힌트로 전달하고 공개 오류에도 고정 항목명을 남기는 수정 a76251a를 준비했다. 관련 64개 검사와 별도 웹툰 3개 검사 통과. PR #215: https://github.com/hhj4861/commerce-automation-kit/pull/215 — 아직 운영 미반영.
- 실제 broker 버전 319343f0-b890-4ebf-8959-5d7ee70028af의 GITHUB_DEPLOY_ALLOWED_REFS에는 refs/heads/deploy/hanmadi-admin만 있었다. deploy/shopshorts는 GitHub에서 protected=true임을 확인했다.
- Cloudflare 공식 Workers settings PATCH로 기존 허용을 보존하며 refs/heads/deploy/shopshorts 하나를 추가했다. 기존 35개 바인딩 중 다른 바인딩은 모두 동일함을 조회로 검증. 코드/시크릿 값은 수정하지 않았다. 공식 API: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/script_and_version_settings/methods/edit/
- GitHub run 38367288557 재실행은 403 대신 503으로 종료. 실제 SS_DEPLOY_CLOUDFLARE_API_TOKEN 바인딩 없음, Secrets Store CAK_DEPLOY_CLOUDFLARE_API_TOKEN도 없음(전체 1페이지 목록에서 이름만 비교). 토큰을 사용자에게 채팅으로 요구하지 않았고 CI용 토큰의 안전한 로컬 파일 경로 전달을 안내했다. Wrangler OAuth를 장기 CI 토큰으로 복제하지 않았다.
- 사용자의 ‘이미 자동배포 중 아닌가’ 질문에 Pages API를 직접 재조회했다. shopshorts-dash source=null, production_branch=deploy/shopshorts. 최근 5개 배포 모두 trigger=ad_hoc/success이며 최신 c053edb0/source b14a000이다. GitHub workflow 존재와 자동배포 성공을 혼동하지 않는다. 현 상태는 수동 운영 배포 성공 / 머지 기반 자동배포 미완료.
- 남은 작업: 새 대본 수정 PR/운영 승격 승인 후 동일 기획 실생성 검증, CI 전용 토큰 등록 후 GitOps 실행 검증. 이 문서는 보류나 단위 검사 통과를 실생성 완료로 보고하지 않는다.


## #215·#216 승인 후 운영 반영

- 사용자 ‘머지해줘’ 승인 후 원본 #215 main merge 9bc265bd0bc1e436c04f6c3d70d7789636b21422, 운영 #216 merge 8b762f69b9a53c77e38e37f186eb5fbb6e06c6b5 완료. 두 PR 필수 CI 통과 확인.
- 깨끗한 운영 checkout을 #216 exact merge로 갱신. 승격 검사 21개가 통과한 a16e1e1과 전체 tree diff가 0이므로 검사 증거를 재사용했다.
- 승인된 aggregate account poll 0건/hasNext=false 확인 후 SIGTERM 정상 재시작. 계정 워커 PID 49967 / running / 이전 exit 0. 미디어 워커는 변경하지 않았다.
- Pages 수동 배포 exit 0. API에서 Production / deploy/shopshorts / exact 8b762f6 / success 확인. deployment 40eeb8f5-8dc5-4888-9c2f-0a7a97d16270, https://40eeb8f5.shopshorts-dash.pages.dev 및 운영 https://shopshorts-dash.pages.dev 반영.
- 같은 QA 프로젝트에서 대본 생성 다시 시도를 정확히 1회 눌렀다. 최종 결과와 후속 제작 검증은 아래에 이어 기록한다.

- #216 배포 후 첫 요청은 자료 확인 단계에서 ‘연결 시간이 지났거나 실행기가 중단됐습니다’로 종료했고 UI에 일시적 Failed to fetch가 함께 표시됐다. 대본 검증 실패로 분류하지 않는다. 활성 계정 작업 0건과 워커 PID 유지 확인. 로그의 연결 실패 메시지는 당시보다 776초 전 기록이어서 직접 원인으로 사용하지 않았다.
- 같은 워커 Node20/환경으로 broker poll 성공, 웹/health 200, 서버와 로컬 시계 차이 0~1초 확인. 페이지 새로고침으로 통신 오류가 해소된 뒤 중복 실행 없이 1회 재시도했다.
- 복구 후 요청은 aggregate running 1건, deadline 잔여 852초/lease 잔여 116초로 실제 실행 확인. UI 자료 확인 → 확인한 자료로 대본 작성 중으로 전환 확인. 최종 결과 대기.


## #216 운영 실검증 최종 결과

- 연결 복구 후 요청은 research → scenario → revision → review로 실제 진행. 중간 집계 running 1건 / deadline 잔여 392초 / lease 잔여 117초를 확인했다. 보완 후 review 단계 진입은 장면 형식 검사를 통과했다는 근거다.
- 최종 SCENARIO_DEPTH_INVALID. UI에 고정 항목 ‘질문과 답의 일치, 필요한 이유, 작동 과정, 구체적 예시, 완결된 답, 설명 호흡, 대사와 화면의 연결’이 모두 표시됐다. 이는 모델 검토의 불합격 판정이며 원문 대본을 직접 검토해 동일한 결론을 확정한 것은 아니다. 실패한 원문/상세 검토 사유는 현재 실패 전송 경로에 보존되지 않는다.
- 새 유료 미디어·음성·렌더·업로드는 실행되지 않았다. 품질 검토를 우회하거나 재시도 한도를 늘리지 않았다. 머지/수동 운영 배포는 완료, 전체 실생성 E2E는 대본 내용 검토에서 여전히 미완료다.
- GitHub 자동 배포 run 38376191100은 failure이며 CI 전용 토큰 부재 경계가 남아 있다. 수동 Pages 배포 성공과 구분한다.
- 다음 개선 필요: 거부된 대본과 상세 검토 근거를 계정 소유자에게만 보존·표시하여 실제 부족한 부분을 확인하고 보완하는 흐름. 해당 기능을 이 기록만으로 구현·운영 완료라고 하지 않는다.


## #219·#220 승인 후 운영 반영

- 사용자 ‘응 진행해줘’ 승인 후 #219 main merge `096232aad7c24bc997c8421d69c25d66c555e7e2`, #220 deploy/shopshorts merge `d0b128d12b230238c44da77ef6b45c0af81e9420` 완료. 두 PR CI 성공 및 승인된 head 일치 확인.
- 운영 checkout clean 확인 후 exact #220 merge로 갱신. 67개 검사가 통과한 승격 커밋 ee5413a와 머지본의 tree diff 0 확인.
- Pages 수동 배포 exit 0. API에서 production / deploy/shopshorts / exact d0b128d / success 확인. deployment `f5f3ae5d-aec6-48a4-bff4-02c5de007261`, https://f5f3ae5d.shopshorts-dash.pages.dev 및 운영 도메인 반영. 비인증 /api/health는 403이므로 인증된 UI와 구분했다.
- 계정 aggregate activeCount 0 / hasNext false 확인 후 SIGTERM 정상 재시작. 새 PID 61759, running / 이전 exit 0 확인.
- 공용 credential-broker는 운영 소스와 이전 커밋을 동일 esbuild 옵션으로 인메모리 비교해 일치 확인. 승인된 llm-accounts 변경 외의 소스 변경 없음. 공식 Worker API 배포 시 기존 바인딩 35개 모두 inherit했고 사후 전체 바인딩 값 동일·배포 코드 일치 확인. GITHUB_DEPLOY_ALLOWED_REFS의 Shopshorts/기존 플랫폼 허용도 보존.
- broker deployment `8b64e8ed-4db0-44fa-b61d-a0d0bf744099`, version `bdd47446-e19d-4a0f-b79e-286ef390a0b1` 100% 반영. 로그인 토큰은 정상 Wrangler 갱신만 사용했으며 출력/복제하지 않았다.
- 승인된 개인 Google 계정으로 로그인 후 동일 QA 프로젝트에서 재생성 1회 요청. 22:05 KST 자료 확인 → 22:06 대본 작성 단계 확인. 제작 워커는 화면 초기 로딩 시 오프라인/이후 온라인이 번갈아 표시됐지만 온라인 상태를 확인했고, 미디어 워커 재시작은 하지 않았다. 최종 생성 결과는 아래 추가 기록한다.
- 현 단계에서 새 유료 미디어/TTS/렌더/업로드 없음. 전체 E2E 완료가 아니라 운영 반영 완료와 대본 실검증 진행 상태다.

## #220 실제 검증 결과 및 후속 조치

- 22:15 KST 최종 SCENARIO_DEPTH_INVALID로 종료. 생성 중 0건으로 돌아왔으며 이번 요청은 시간 초과/형식 오류가 아니다.
- 새 ‘대본과 보완 이유 보기’에서 7개 항목의 실제 판정 이유와 대사/화면 인용 확인. ‘검토받은 대본 전체 · 6장면’을 펼쳐 원문 확인. 페이지 새로고침 후 다시 같은 검토 자료를 조회해 서버 보존/ACK 이후 조회까지 검증했다. CUA 화면 캡처로 읽을 수 있는 패널 확인(별도 캡처 파일은 저장하지 않음).
- 실제 내용: “왜 성벽 밖으로 나와 있을까요?”라는 질문 뒤 “방어 공간 자체를 성벽 바깥에 둔 겁니다”로 형태를 반복했다. 출처에 확인된 화포 사용 기능을 구체적 행위로 풀지 않고 연도와 설명하지 않는 구멍 종류를 나열했다. 같은 건축물/장면을 유지한 장점과 별개로 원인→작동→결과가 부족하다는 지적을 원문에서 확인했다.
- 신규 유료 미디어/TTS/렌더/업로드 없음. 전체 자동 실생성 E2E는 미완료이며 실패 대본의 강제 승인이나 품질 검토 완화는 하지 않았다.
- 후속으로 조사 단계의 질문 중심 인과 검색과 작성 단계의 구체적 행동/결과 지침을 보강했다. 원본 4ade2cb, 운영 승격 1e46b90, 각 upstream push 완료. 각 브랜치에서 기존 67검사 + 조사/옵션 2검사 통과(비관련 렌더 등 5개는 필터 제외). 프롬프트 개선의 의미 품질은 아직 실 LLM으로 검증하지 않았다.
- PR #223(main): https://github.com/hhj4861/commerce-automation-kit/pull/223 / PR #224(deploy/shopshorts): https://github.com/hhj4861/commerce-automation-kit/pull/224 . 두 새 PR은 아직 사용자 머지 승인 전이며 운영 미반영.
- GitHub 자동배포 run 38400297168은 Cloudflare credential request failed (503). 기존 CI 전용 토큰 미등록 문제가 남아 있으며 수동 운영 배포 성공과 구분한다.

## 2026-10-14 #223·#224 승인·머지·Pages 반영과 인수인계

- 사용자 ‘응 진행해주고…새로운세션에 인수인계가능하도록…문서로 저장’ 승인에 따라 #223 main merge `1d9c69ed8ba3f8e2400f06beb2778fa5fbbcc1a5`, #224 deploy merge `1cec2cef08ade129569af771ee7592eb928ce22c` 완료. 승인된 head/CI 성공을 다시 확인했다.
- 운영 checkout clean 확인, 검증된 승격 head1e46b90과 운영 merge 전체 tree diff0 확인 후 detached exact merge로 전환했다.
- Wrangler Pages 배포 exit0. 공식 API에서 deployment `e6f4d2ea-9703-4189-a1b7-a945f815c4c6`, production/deploy/shopshorts/exact1cec2ce/success/ad_hoc 확인. 완료 08:19:40 KST, https://e6f4d2ea.shopshorts-dash.pages.dev 및 운영 도메인 반영.
- 정상 서명/환경의 계정 runner 집계 poll은 HTTP429 HTML을 반환했다. 응답 제목은 Cloudflare의 ‘This website has been temporarily rate limited’. retry-after 없음. 일일 쿼터/WAF 등 구체적 원인은 미확정이며 애플리케이션의 중복 요청 방지 JSON과 구분한다.
- 활성0건 확인 불가로 계정 워커 재시작하지 않았다. 소스 checkout 갱신과 실행 중 프로세스 적용을 구분한다. 공용 broker/미디어 워커 배포·재시작 없음.
- 새 Chrome 탭에서 운영 UI 로그인 상태 확인 실패, 작업 목록의 HTML→JSON 파싱 실패 확인. 새 대본 생성은 요청하지 않았고 신규 유료 미디어/TTS/렌더/업로드 없음. 전체 E2E는 여전히 미완료다.
- 최신 GitOps run38483105758 실패 원인은 credential429. 이전503(CI 토큰 미등록)은 별도 미해결이며 최신 실패 원인을 과거503으로 단정하지 않는다.
- 새 세션 인수인계: [20261014-shopshorts-production.md](../handoffs/20261014-shopshorts-production.md). 실제 반영 상태·승인·경로·검증·재개 순서·잔여 장애를 정리했다. 문서 저장을 다른 열린 세션 수신이나 전체 작업 완료라고 보고하지 않는다.

## 2026-10-14 통신 복구·워커 적용·#224 재검증

- 사용자 재확인 요청: 11:26:15 KST 정상 서명 runner poll HTTP200/application-json, active0/hasNext=false. 브라우저에서도 Codex 연결·제작 워커 온라인·작업 목록 정상 확인. 기존 서북공심돈 실패 기록은 이전 대본 검토 결과이며 새 통신 장애와 구분했다.
- 원인 조사: 전일 UTC GraphQL 집계 broker90030, 기타 Worker19, Pages Functions32903. 일일 총집계 약122952건과 오전9시 전후 장애/복구는 무료 일일 한도 소진 가능성을 뒷받침하나, 당시 오류번호/계정 구독 플랜은 확보하지 못했다. 진단용 Wrangler OAuth 정상 갱신 외 권한/요금제/코드 변경은 없다.
- 후속 ‘계속해줘’ 승인 범위에서 운영 checkout clean/exact1cec2ce, 활성0건을 다시 확인했다. SIGTERM 후 계정 워커 PID61759→66989, running/이전 exit0 검증. 미디어 워커·공용 broker 재배포 없음.
- 같은 QA 프로젝트의 ‘대본 생성 다시 시도’를 정확히1회 요청. 자료 확인→확인한 자료로 대본 작성 중으로 실제 전환 확인. 기획·예산·음성·스타일은 유지했다.
- 11:45 KST 집계 running1, 전체 deadline잔여665초/lease잔여110초로 실제 실행 확인. 최종 결과는 다음 항목에 기록한다. 현재 신규 미디어/TTS/렌더/업로드 없음.

### #224 대본 최종 결과와 #226·#227 준비

- 이번 요청은 보완 단계 후 SCENARIO_FORMAT_INVALID로 종료. 구체 필드가 표시되지 않았고, ‘대본과 보완 이유 보기’는 검토 자료 없음 응답. 원본이 보존되지 않아 정확한 필드 및 첫 시도의 실패 종류는 미확정이다. 이전 #220 거부 대본을 이번 결과로 취급하지 않았다.
- 기본 장면/hybrid/건축 부품 검증에 안전한 필드·허용 규칙을 붙여 기존 1회 보완에 전달하고, 오류 표시에서 해당 장면·항목을 알려주도록 수정. 실제 검증된 검토 자료가 있을 때만 버튼을 표시한다. 기존 실패는 정상 상태 조회 때 1회 갱신하며 통신 오류를 ‘자료 없음’으로 저장하지 않는다.
- main PR #226/source8690e34, 운영 승격 PR #227/releasea54e8a8. 둘 다 작업 upstream push 완료, 명시적 새 머지 승인 전. 공용 broker 변경/배포 없음.
- 각 브랜치 관련97검사 통과·2개 opt-in E2E 미실행. 실제 본문 렌더 회귀 검사는 유료 공급자 시험 응답을 사용했다. 로컬 브라우저에서 형식 실패의 버튼 미노출과 검토 실패의 보완 이유/원문 조회를 확인했다. 시험 서버 exit0, 링크 제거. 긴 iCloud Unix socket 경로 오류는 같은 iCloud 폴더를 가리키는 짧은 링크로 해결했다.
- 운영 새 미디어/TTS/렌더/업로드 없음. #224의 대본 형식 실패와 신규 수정의 실 LLM 효과는 운영 반영 후 재검증해야 하므로 전체 E2E 미완료다.


## 2026-10-14 #226·#227 승인 머지·운영 반영 및 실검증

- 사용자 ‘머지해줘’ 승인 후 정확한 검증 head로 머지: #226 main `62758a88fb3586d4daa07c770de36a95642e3286`, #227 deploy/shopshorts `eb32c9a4956a04251838302cfb05b2d785929447`. 양쪽 PR CI 2개씩 성공을 재확인했다. 기존 테스트 근거 각 97pass/2skip/0fail; 이번 코드 추가 수정 없음.
- 운영 checkout clean detached eb32c9a, 승격 head a54e8a8과 전체 tree diff0. Pages Wrangler 배포 exit0, `1f5e8e1c-9a4a-422b-a093-4ee86d6323af`, https://1f5e8e1c.shopshorts-dash.pages.dev . 공식 목록에서 Production/deploy/shopshorts/source eb32c9a 확인.
- 활성 계정0건·미디어0건을 각각 집계 후 워커 정상 재시작. 계정 PID66989→1403, 제작15337→63277; running, 이전 exit0. 공용 broker 재배포 없음.
- 운영 기존 실패에 증거가 없을 때 조회 버튼이 숨겨짐 확인. 같은 수원 QA에 재시도1회. research→scenario→revision→review 진행, 14:13 KST 최종 내용 검토 실패. 형식 통과는 확인했지만 정확히 어떤 필드가 보완됐는지 UI 증거는 없으므로 추정하지 않는다.
- 최신 실패의 조회 버튼으로 ‘대본과 보완 이유 보기’와 ‘검토받은 대본 전체 · 6장면’을 열어 실제 원문 확인. 첫 대사는 “이 탑은 왜 성벽 밖으로 나와 있을까요?”다. 핵심 연결은 “돌출된 자리가 군사들이 주변을 살피고 공격할 공간을 받칩니다.”에 머무르고, 결말도 “주변을 살피고 대응하기 위한 자리”로 용도를 반복한다. 돌출 위치 때문에 무엇이 달라지는지 설명하지 않는다. 군사의 층간 이동·포혈 사용은 설명하지만 중심 질문에 대한 인과를 대신하지 못한다.
- AI 검토는 질문/필요/작동/예시/결말/호흡을 보완 대상으로 표시했다. 검토 의견만 재인용한 것이 아니라 실제 대본으로 핵심 간극을 확인했다. 선택한 질문을 임의로 좁히거나 검증되지 않은 사격 효과를 만들어 승인하지 않았다.
- 새 미디어/TTS/렌더/공개 업로드 없음. 54크레딧 예산 유지. 전체 실생성은 미완료. 다음 개선은 조사 자료의 핵심 질문 답변 가능성 확인과 대본에 근거를 연결하는 처리다.
- 최신 GitOps 배포 run38514210534는 `Cloudflare credential request failed (503)`로 실패. 수동 Pages 성공과 자동배포 미완료를 구분한다.
