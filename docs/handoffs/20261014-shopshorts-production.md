# Shopshorts 운영 제작 파이프라인 인수인계 — 2026-10-14

## 새 세션에서 먼저 볼 결론

**PR #223·#224는 머지됐고 운영 Pages 배포도 성공했다. 전체 실생성 E2E는 아직 미완료다.** 현재 Cloudflare credential-broker가 HTML 요청 제한 페이지(HTTP 429)를 반환한다. 운영 UI도 로그인 상태와 작업 목록을 읽지 못한다. 계정 작업의 활성 건수를 확인하지 못했으므로 계정 워커는 이번 커밋으로 재시작하지 않았다. 소스 checkout 갱신과 실행 중 프로세스 적용을 혼동하지 않는다.

다음 순서: **Cloudflare 요청 제한 원인/해제 확인 → 활성 작업 0건 확인 → 계정 워커 안전 재시작 → 기존 QA 프로젝트에서 대본 1회 재생성 → 실제 대본 검토 → 승인된 예산 안에서 미디어·TTS·렌더 검증.** 아래의 승인 범위는 유지된다. 제한을 우회하거나 동일 생성 요청을 반복하지 않는다.

이 문서는 실제 작업 상태의 인수인계다. 전체 영상 완성, 자동배포 완성, 다른 실행 중 세션의 수신을 의미하지 않는다. 확인 시점 이후 상태는 재조회한다.

## 사용자 목표와 현재 승인

- 터미널에서 제작하던 품질/순서를 Shopshorts 웹 제작실에서도 동일하게 제공하고, 전체 메뉴 UI/UX와 실제 생성 결과까지 검증한다.
- 작업 범위는 Shopshorts·영상 제작이다. 과거 잘못 붙여넣은 DBQ 작업은 제외한다. Hanmadi/Festa/Replay/JEV의 타 세션 파일을 임의 수정하지 않는다.
- 최신 요청: “응 진행해주고, 현재까지 정리한 컨텍스트를 새로운세션에 인수인계가능하도록 정리해서 문서로 저장해줘”. 직전 구체적 승인 요청의 **#223·#224 머지·운영 반영·재검증 승인**이다. 같은 PR을 다시 승인받지 않는다.
- 기존 QA 실생성, 개인 Google 계정 로그인, 운영 계정 작업의 **집계 건수 조회와 안전한 워커 재시작**은 승인됐다. 토큰/계정 목록/개별 작업 ID를 일반 로그에 출력하지 않는다.
- QA 예산: Higgsfield 최대 **54크레딧**. 추가 유료 생성·구독 변경·공개 YouTube 업로드는 자동 승인으로 확대하지 않는다. 플랫폼의 대본/발행 사람 검수는 보존한다.
- 새 구현 PR이 생기면 준비·검증·push 후 **그 PR에 대한 명시적 머지 승인**이 필요하다. 이번 인수인계처럼 독립 문서는 현재 프로젝트 브랜치에 본인 파일만 commit/push한다.

## 운영 반영 현황

| 항목 | 실제 상태/근거 |
|---|---|
| 저장소 | https://github.com/hhj4861/commerce-automation-kit |
| 운영 웹 | https://shopshorts-dash.pages.dev |
| main PR #223 | https://github.com/hhj4861/commerce-automation-kit/pull/223 — MERGED, `1d9c69ed8ba3f8e2400f06beb2778fa5fbbcc1a5` |
| 운영 PR #224 | https://github.com/hhj4861/commerce-automation-kit/pull/224 — MERGED, `1cec2cef08ade129569af771ee7592eb928ce22c` |
| Pages 배포 | `e6f4d2ea-9703-4189-a1b7-a945f815c4c6`, https://e6f4d2ea.shopshorts-dash.pages.dev |
| 배포 확인 | 공식 API: production / deploy/shopshorts / exact `1cec2ce` / success / **ad_hoc**. 완료 2026-10-14 08:19:40 KST. Wrangler exit 0 |
| 운영 checkout | `/Users/admin/workSpace/shopshorts-production`, clean detached `1cec2ce`; 검증된 승격 head `1e46b90`과 전체 tree diff 0 |
| 계정 워커 | 이번 재시작 미수행. 이전 #220 적용 때 PID 61759였으나 현재 PID로 재사용하지 말 것. 프로세스에는 새 프롬프트 적용 미확인 |
| 미디어 워커 | 이번 변경/재시작 없음 |
| 공용 broker | 이번 배포 없음. 마지막 확인된 #220 version `bdd47446-e19d-4a0f-b79e-286ef390a0b1`, deployment `8b64e8ed-4db0-44fa-b61d-a0d0bf744099` |

## 최신 변경과 검증 범위

#223/#224는 3파일·21줄 추가다. 모델/시간제한/예산/음성/스타일/스키마/합격 기준/1회 보완 제한은 바꾸지 않았다.

1. `apps/shopshorts/lib/explainer-production.js`의 `researchTopic`: 선택한 왜/어떻게 질문에 대해 기존 문제 → 구체적 설계/행동 → 결과의 출처를 조사한다. 외형/연도/치수만 조사하고 끝내지 않는다. 일반 원리를 특정 시설의 입증된 사실처럼 쓰지 않는다.
2. `apps/shopshorts/lib/studio-scenario.js`: 조사된 행동을 주체/대상 → 어디서 무엇을 함 → 달라지는 결과로 설명한다. 연도/명칭 나열보다 작동 과정과 완결된 답을 우선한다. 시각 효과는 실제 작동에 대응해야 한다. 빈 근거를 상상으로 메우거나 사용자 질문을 몰래 바꾸지 않는다.
3. `docs/qa/20261013-causal-research.md`: 범위·실패 근거·검사 기록.

원본 head `4ade2cbbf07129fa48bf50956bd62f1266b9f5b2`, 승격 head `1e46b90424a81aa200a7ca632adf85b09a56681c`. 두 브랜치 각각 **67개 통합/검토 검사 + 조사·옵션 2개 검사 통과**, 관련 없는 렌더 5개는 명시적으로 필터 제외했다. 74개 통과라고 쓰지 않는다. GitOps CI 두 PR 성공, diff check 통과. 동일 tree 증거를 재사용했으며 프롬프트의 실제 의미 품질은 아직 실 LLM으로 검증하지 못했다.

```sh
# 운영과 같은 Node 20.19.3 및 의존성에서 실시한 검사
node --test apps/shopshorts/test/scenario-rejection.test.mjs \
  apps/shopshorts/test/studio-scenario-repair.test.mjs \
  apps/shopshorts/test/scenario-review-feedback.test.mjs \
  apps/shopshorts/test/explanation-depth.test.mjs \
  apps/shopshorts/test/studio-scenario-account.test.mjs
node --test --test-name-pattern='selected topic|production choices' \
  apps/shopshorts/test/explainer-production.test.mjs
```

## 기존 QA와 직전 실생성 결과

QA URL: https://shopshorts-dash.pages.dev/studio/automatic?project=7e88650a-54f0-6eb6-3dac-c4744f24afa4

- 주제: **수원 서북공심돈은 왜 성벽 밖으로 튀어나오고 벽에는 작은 구멍이 뚫려 있을까?**
- 설정: 건축학 / 9:16 숏폼 / 45초 / hybrid / Higgsfield 최대54 / Kyle 1.1 / modern-v1 자막. 기존 기획을 유지하고 중복 프로젝트를 만들지 않는다.
- #220에서 10월13일 22:05~22:15 KST 실제 research → scenario → revision → review 진행, 최종 `SCENARIO_DEPTH_INVALID`.
- “왜 성벽 밖으로 나왔을까요?”를 묻고 “방어 공간 자체를 성벽 바깥에 둔 겁니다”라고 형태를 반복했다. 감시/공격 목적만 말하고 구체적 행동과 결과를 설명하지 않았다. 연도·구멍 종류 나열로 45초를 사용했다.
- 새 ‘대본과 보완 이유 보기’와 ‘검토받은 대본 전체 · 6장면’을 열어 실제 내용 확인. 새로고침 이후에도 같은 거부 자료를 조회했다. #219/#220의 실패 증거 보존·owner 조회는 **실운영 검증됨**.
- 모델의 7항목 부정 판정을 그대로 객관적 사실이라고 취급하지 않았고, 원문에서 인과 설명 부족을 직접 확인했다.
- 해당 실패 이후 신규 미디어/TTS/렌더/업로드는 시작되지 않았다. #224 재생성은 현재 통신 제한 때문에 아직 요청하지 않았다.
- 검토를 우회해 실패 대본을 승인하거나, 원문을 읽지 않고 같은 조건으로 반복 생성하지 않는다. 보완 후에도 실패하면 저장된 실제 대사·근거부터 읽는다.

## 지금 막힌 두 가지

### A. Cloudflare의 일시적 요청 제한 — 새로 확인된 장애

- 운영 계정 워커와 같은 Node/환경/서명 경로로 `/runner/accounts`의 집계 poll을 요청했으나 HTTP **429**, `content-type: text/html`, `retry-after` 없음.
- 응답 제목: **This website has been temporarily rate limited | cak-credential-broker.guswhd1085.workers.dev | Cloudflare**.
- 이것은 기존 앱의 5초 연결 중복 방지 JSON 오류와 다르다. 계정 토큰 만료, Workers 일일 쿼터 초과, 특정 WAF 규칙 중 어느 것이 근본 원인인지는 아직 확정하지 못했다. Cloudflare 대시보드/공식 진단으로 확인해야 한다.
- 새 Chrome 탭은 정상 열림. 운영 제작실은 `Unexpected token '<', "<!doctype "... is not valid JSON`, 로그인 상태 확인 실패, 작업 목록 확인 필요를 표시했다. 이전 탭의 CDP focus 시간 초과와 구분한다.
- Python urllib의 비인증 `/health` 조회는 403/1010이므로 서비스 장애의 독립 증거로 사용하지 않는다. 위 정상 서명 워커 요청의 429와 실제 UI 실패가 근거다.
- 작업 0건을 확인하기 전 워커 재시작하지 않았다. 네트워크·인증서 검증·Cloudflare 보안을 끄거나 프록시로 우회하지 않는다.

### B. GitOps CI 전용 배포 자격 부재 — 기존 미해결

- Pages에 Git source 연결이 없고 최근 운영 반영은 Wrangler 로그인으로 **수동 배포**했다. workflow가 존재한다고 자동배포가 완성된 것은 아니다.
- 이전 run `38400297168`은 CI 토큰 부재로 503. 최신 #224 run **38483105758**은 `Cloudflare credential request failed (429)`로 실패했다. 최신 실패를 503이라고 잘못 기록하지 않는다.
- 마지막 확인: broker의 `SS_DEPLOY_CLOUDFLARE_API_TOKEN` 바인딩과 Secrets Store `CAK_DEPLOY_CLOUDFLARE_API_TOKEN`이 없었다. 현재 요청 제한 복구 후 다시 확인한다.
- 기존 403 문제는 허용 refs에 `refs/heads/deploy/shopshorts`를 추가해 해결했다. 기존 `refs/heads/deploy/hanmadi-admin`을 보존한다.
- CI용 Cloudflare Pages 편집 토큰을 안전하게 등록해야 한다. 실제 값은 채팅/문서/Git/로그에 기록하지 않는다. 개인 Wrangler OAuth를 CI 장기 토큰으로 복제하지 않는다. 권한 확대·추가 요금제 변경은 별도 동의 없이 수행하지 않는다.

## 안전한 재개 절차

1. AGENTS.md와 `~/.codex/SESSION_MEMORY.md`, engine-exchange/efficiency 상태를 새로 읽는다. 확인 시점 worker OFF / Claude crosscheck OFF, efficiency ON이었다. 과거 Claude 협업을 근거로 새 자동 요청을 보내지 않는다.
2. 제한 원인을 확인한다. 정상 runner aggregate poll에서 activeCount/hasNext만 출력한다. 제한 해제 후 `activeCount=0, hasNext=false`일 때 승인된 SIGTERM 재시작을 수행하고 새 PID/running 상태를 확인한다. 실행 중이면 완료를 기다린다.
3. 계정 워커 launchagent: `com.cak.llm-accounts`; plist `~/Library/LaunchAgents/com.cak.llm-accounts.plist`; cwd는 운영 checkout. `launchctl kill SIGTERM "gui/$(id -u)/com.cak.llm-accounts"` 후 KeepAlive 정상 재기동 확인. plist 환경/키는 출력하지 않는다.
4. 위 QA URL에 로그인된 개인 계정으로 들어가 대본 생성 다시 시도를 **1회** 누른다. research/scenario/revision/review의 실제 진행과 종료를 확인한다. 화면만 진행 중이면 실제 lease/deadline 집계로 구분한다. 검토 후 실패 시 owner 전용 거부 자료를 읽는다.
5. 통과했다면 내용의 질문·인과·예시·결말을 직접 검토하고 기존 승인 범위 안에서 미디어/TTS/렌더까지 검증한다. 실제 소리, 자막 위치, 끝 문장/마지막 프레임, 재생 가능 파일을 확인한다. 최종 발행 게이트/공개 업로드는 별도 경계다.
6. CI 자격 문제가 해결된 뒤 운영 브랜치 workflow의 실제 success와 Pages source SHA를 비교한다. 수동 배포 성공을 GitOps 검증으로 대체하지 않는다.
7. 새 수정은 별도 구현 worktree, 경로 track, 의미 있는 관련 검사, 본인 변경 commit/upstream push, 새 PR 머지 승인 순서로 진행한다. 실패/미완료는 그 상태로 기록한다.

## 경로·도구와 함정

| 용도 | 경로/설명 |
|---|---|
| 사용자 프로젝트 / 독립 문서 | `/Users/admin/workSpace/commerce-automation-kit` — 현재 `feat/common-video-generator`, upstream `origin/feat/common-video-generator`. 이 checkout은 운영 소스보다 오래돼 일부 파일이 없을 수 있다 |
| 구현 worktree | `/Users/admin/workSpace/commerce-automation-kit-worktrees/scenario-review-feedback` — `fix/shopshorts-causal-research`, head4ade2cb |
| 승격 worktree | `/Users/admin/workSpace/commerce-automation-kit-worktrees/studio-workspace-release` — `release/studio-causal-research`, head1e46b90 |
| 운영 소스/의존성 | `/Users/admin/workSpace/shopshorts-production` — Node20 의존성/SQLite ABI 보존; 함부로 npm 재설치하지 않는다 |
| 계정 워커 로그 | `~/Library/Logs/Shopshorts/llm-account-worker.log` |
| 제작 워커 | `com.cak.studio-production`, 로그 `~/Library/Logs/Shopshorts/studio-production.log` |
| 최종 영상 | `/Users/admin/Downloads/vedio/` |
| 중간 산출물/로그 | `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/<task>/` — 비밀·런타임 DB는 새 클라우드 동기화 금지 |
| Chrome 검증 | CUA browser1 사용. 새 탭1694573541에서 오류 확인했지만 tabID는 재검증. 고장난 이전 탭 ID를 반복 사용하지 않는다 |

- UI 조작은 `mcp__cua_repl`. 계정 선택은 기존 승인 유지. 브라우저 DOM에서 쿠키/토큰을 추출해 API 호출에 옮기지 않는다.
- 계정 워커 Node: `/Users/admin/.nvm/versions/node/v20.19.3/bin/node`. Pages Wrangler: Node22 `/Users/admin/.nvm/versions/node/v22.23.3/bin/node`, 기존 캐시 `/Users/admin/.npm/_npx/fcecf7954caf6a82/node_modules/wrangler/bin/wrangler.js`.
- Pages 명령은 운영 `apps/shopshorts`에서 `pages deploy public --project-name shopshorts-dash --branch deploy/shopshorts --commit-hash <승인된 정확한 커밋> --commit-dirty=false`.
- 공용 broker의 저장소 wrangler 설정은 실제 운영 바인딩보다 뒤처져 있다. 무조건 wrangler deploy하면 다른 플랫폼 설정을 지울 수 있다. #220 때 공식 API로 기존35개 바인딩 전체를 inherit하고 전후 동일을 검증했다. 이번 #224에서는 broker 재배포하지 않았다.
- 과거 ‘제작 워커 offline/online’ 표시는 clock 경계 가능성을 의심했지만 원인 미확정이다. 초기 UI 문구만으로 장애 단정하지 않는다.
- shell 파일 수정 전에 `python3 ~/.codex/hooks/task-finish/gate.py track --path <본인파일>`; 필요 시 정상 sandbox 승인. read-only DB 오류를 성공으로 취급하지 않는다. 다른 세션 파일을 blanket stage/exclude하지 않는다. gate reconcile은 몇 분 걸릴 수 있어 실제 exit를 기다린다. 상태를 조작해 성공으로 만들지 않는다.

## 유지할 영상 제작 기준

- 현재 요청/저장 brief가 우선. 일반 기본은 웹툰 기반, 건축 구조는 검증된 Blender/3D 표현과 조합한다. 정지 그림 확대·문자 나열만으로 원리 설명을 대체하지 않는다.
- 도입 Higgsfield6~8초 원칙. 과거 개별 편의 ‘전체 Blender’ 승인을 모든 영상으로 확대하지 않는다. 생성 전 예산 확인, 기존 자산 재사용, 크레딧 부족 때 임의 대체 금지.
- Kyle `RU7aSi6lT4uQBXMLgDxK`. 선택 brief 속도 유지(이번 QA1.1, 차분한 롱폼1.0 선호). 드라마의 캐릭터별 음성은 별도 설정이며 덮어쓰지 않는다.
- modern-v1: Pretendard SemiBold 흰 본문, 외곽선 없이 반투명 차콜 배경, 세로 약74% 높이, 두 줄 의미 단위. 도입 좌측 흰색/민트 헤더. 상세는 `docs/videos/PRODUCTION-STYLE.md`, `public/video-typography.js`.
- 숏폼은 한 질문/한 원리/한 사례/완결된 답. 45초는 기본 실험값이지 문장을 자르는 강제 한도가 아니다. 배속/설명 누락으로 길이 맞추지 않는다. TTS/유료 미디어 전 설명 검토, 한 번 보완 후 재검토. 실패 이유를 숨기지 않는다.
- 건축 주제는 실제 시설의 신기한 현상에서 출발, 공식 근거 확인, 기존 제작 대상+원리+답의 중복 제외. 조회수1200 상한이나70%/80% 확산 보장을 주장하지 않는다.

## 더 자세한 근거

- [운영 QA 누적 기록](../qa/20261013-studio-ux-production.md): #201 이후 배포·실패·수정 경과. 시간순 과거 미완료 문구를 최신 상태로 오해하지 않는다.
- `docs/qa/20261013-causal-research.md`: #223 조사/작성 보강의 범위와 테스트(현재 root에 없으면 운영/구현 checkout에서 읽기).
- `docs/qa/20261013-scenario-rejection.md`: #219/#220 거부 대본 보존/표시 설계.
- 관련 코드: `lib/scenario-rejection.js`, `lib/studio-scenario.js`, `lib/explainer-production.js`, `studio-account-worker.mjs`, `apps/credential-broker/llm-accounts.mjs`, `lib/llm-account-api.js`, `public/scenario-rejection.js`, 자동 제작 UI.
- 소유자 전용 실패 증거 API: `/api/studio/llm/scenario-review?id=<task>&projectId=<project>`; owner는 인증 세션으로 결정, no-store. 로그/문서에 실제 인증정보를 붙이지 않는다.

새 세션 전달 문장: **“docs/handoffs/20261014-shopshorts-production.md를 읽고 이어서 진행해줘. #223·#224 머지와 Pages 배포는 완료됐고, Cloudflare429 복구·계정 워커 적용·실생성 E2E가 남아 있어. 같은 승인은 다시 묻지 말고 실제 상태를 확인해서 이어가.”**
