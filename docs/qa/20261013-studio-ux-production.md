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
