# Shopshorts 운영 제작 파이프라인 인수인계 — 2026-10-14

## 최신 상태 — #236·#237 운영 반영 완료, 실생성은 구독 한도로 중단

- 사용자 ‘응 진행해줘’ 승인 후 #236 main `809b8fa8cbb46abe52fc92fccb32108e7778b49f`, #237 deploy/shopshorts `74d66ac94fb732b6820294002d42fa2a964b8d75` 머지 완료. 승인된 source34a5187/releasee4afa16과 최신 CI SUCCESS를 재확인했다. 검증된 release tree와 운영 merge tree 차이0.
- 운영 checkout clean detached74d66ac. 기존 배포 브랜치의 Kandinsky 변경을 보존했다. Wrangler Pages 배포 exit0, 공식 목록 Production/deploy/shopshorts/source74d66ac 확인. deployment `9eec2068-8793-4b20-ba3f-93cbe9190b66`, https://9eec2068.shopshorts-dash.pages.dev . 공용 broker 재배포 없음.
- 계정 activeCount0/hasNext=false, 미디어 active0 조회 후 SIGTERM 정상 재시작. 계정 PID11138→65268, 제작11115→65271. 둘 다 running/이전 exit0 확인. 인증정보/작업 식별자 출력 없음.
- 같은 수원 QA 브라우저에서 16:43 KST 대본 재시도1회 접수 후 자료 확인 단계에서 **“Codex 구독 사용 한도에 도달했습니다. 한도가 회복된 뒤 다시 시도해 주세요.”**로 종료됐다. 내용 불충분 판정/검색 실패/429 장애로 혼동하지 않는다. 상세 형식은 운영 UI에 표시되지 않아 어느 내부 호출에서 한도가 걸렸는지 단정하지 않는다. 기존 기획·54크레딧 상한·Kyle1.1·스타일 유지. 신규 TTS·미디어·렌더 없음. 한도 회복 후 같은 QA를 재검증해야 하므로 전체 실생성 E2E는 미완료다. 추가 계정/토큰 우회·요금제 변경·반복 재시도는 하지 않았다.
- GitOps run38529140123은 Cloudflare credential request failed(503). 이번 수동 배포 성공과 CI 자격 미등록 문제를 구분한다. #236·#237 재승인/재머지하지 않는다.

## #236·#237 구현 검증 기록 (이후 운영 반영 완료, 최신 기록은 상단)

- 사용자 ‘진행해줘/계속’으로 공통 조사→대본 경로를 보완했다. [#236 main](https://github.com/hhj4861/commerce-automation-kit/pull/236), source `34a5187`; [#237 deploy/shopshorts](https://github.com/hhj4861/commerce-automation-kit/pull/237), release `e4afa16`. 각각 전용 upstream push 완료. **두 새 PR의 명시적 머지 승인은 아직 없으며, 이번 수정의 Pages·워커 배포도 하지 않았다.**
- 조사 자료가 선택 질문에 답하는지 독립 검토하고, 부족한 항목만 한 번 추가 조사한다. 통과한 답을 대사·최종 검토에 연결한다. 끝내 부족하면 대본 작성 전 중단하며 부족 항목과 검토 형식 오류를 구분한다. 기존 대본 품질 검토·기획·음성·예산·제한 시간은 유지한다.
- source/release 각각 통합98검사 통과(0fail/0skip). 유료 공급자 시험 응답을 사용한 실제 렌더·CLI 공통 경로·워커/브로커 오류 전달 포함. 긴 테스트 소켓 경로로 앞선 3검사가 실패했지만 동일 iCloud 폴더의 짧은 링크로 재실행해 모두 통과했다. 임시 의존성/출력 링크는 제거했다.
- 같은 수원 질문으로 공식 로컬 Codex 실호출: 초기 조사→독립 거부→보충 조사까지 완료(호출당360초, 총404초). 마지막 호출은 CODEX_REQUEST_FAILED. 저장한 공개 보충 자료에 대한 마지막 검토만 한 번 재실행해 정상 종료/5항목 불충분 판정을 받았다. 돌출의 측면 공격 원리는 찾았으나 ‘작은 구멍 선택 이유’는 보충 후에도 미확인이었다. **거부 경로를 확인한 것이며 전체 실생성 성공이 아니다.** 운영 격리 계정 대신 로컬 운영자 로그인으로 검증했으므로 환경 동일성도 주장하지 않는다.
- 실제 자료/로그: iCloud `commerce-automation-kit/research-answer-gate/`의 `live-v2-call-{1,2,3}.json`, `live-v2-final-review.json`, `final-shortpath-tests.log`, `release-tests.log`. 생성된 조사 요약은 원문 전체를 독립 검증한 자료와 구분한다. 토큰/인증정보는 기록하지 않았다.
- 이 절 작성 당시 다음 단계는 새 PR 승인·운영 반영이었다. 이후 완료됐으므로 상단 최신 상태를 따른다. 동일 질문 실생성은 여전히 미완료이며 근거를 추가 확보하거나 사용자가 질문을 좁히도록 승인해야 할 수 있다. 다른 질문으로 몰래 전환하거나 검토를 완화하지 않는다. CI 전용 배포 자격의 기존503 문제도 별개로 남아 있다.
- 구현 worktree는 `scenario-review-feedback`, branch `fix/shopshorts-research-answer-gate`; 승격은 `studio-workspace-release`, branch `release/studio-research-answer-gate`. 아래 과거 경로 표의 branch/head는 #227 시점 기록이다. source base48d1dfe, release based87324e에 있던 타 세션 Hanmadi/Kandinsky 변경은 보존했다. 운영 현재 head는 반영 전 새로 확인한다.

## #227 시점 운영 검증 결론

**PR #226·#227 머지와 운영 Pages·두 워커 반영은 완료됐다. 전체 실생성 E2E는 대본 내용 검토 실패로 미완료다.** 사용자 ‘머지해줘’로 승인받아 main `62758a88fb3586d4daa07c770de36a95642e3286`, deploy/shopshorts `eb32c9a4956a04251838302cfb05b2d785929447`에 머지했다. Pages `1f5e8e1c-9a4a-422b-a093-4ee86d6323af` 수동 배포 exit0, 공식 목록의 Production/deploy/shopshorts/source eb32c9a를 확인했다. 검증된 승격 head a54e8a8과 운영 merge의 전체 tree diff는 0이다.

계정·미디어 작업 각각 활성0건을 확인하고 SIGTERM으로 안전하게 갱신했다. 계정 PID66989→1403, 제작 PID15337→63277이며 둘 다 running/이전 exit0이다. 같은 QA 재시도를 정확히 1회 요청해 자료 확인 → 작성 → 보완 → 설명과 결말 검토까지 진행했다. **14:13 KST 최종 대본 내용 검토 실패**로 종료됐고, 이번 6장면 원문과 6개 보완 의견을 운영 UI에서 실제 조회했다. 형식 검증은 통과했지만 ‘왜 성벽 밖으로 나왔나’에 대한 인과 설명이 부족했다. 신규 유료 미디어·TTS·렌더·업로드는 시작하지 않았다.

다음은 **조사 단계에서 선택한 질문에 답할 근거를 확보했는지 확인하고, 그 근거를 대사에 연결하는 처리의 보완**이다. 같은 조건의 재시도를 반복하거나 질문을 몰래 바꾸거나 검토를 우회하지 않는다. #226·#227을 다시 승인받거나 머지하지 않는다. 최신 CI run38514210534는 인증 요청503으로 실패했으므로 수동 배포를 GitOps 성공으로 보고하지 않는다.

이 문서는 실제 작업 상태의 인수인계다. 전체 영상 완성, 자동배포 완성, 다른 실행 중 세션의 수신을 의미하지 않는다. 확인 시점 이후 상태는 재조회한다.

## #224에서 발견한 문제와 #226·#227 검증 기록 (배포 전 경과)

- #224 계정 워커 재기동 후 한 번 요청한 대본이 자료 검색 → 작성 → 보완 → 형식 실패로 종료됐다. 실제 오류 문구는 “대본의 장면 형식 또는 목표 길이를 맞추지 못했어요. 다시 생성해 주세요.”였다.
- ‘대본과 보완 이유 보기’를 눌렀으나 검토 자료가 없다고 표시됐다. 이번 원본의 잘못된 필드는 보존되지 않아 확정할 수 없다. revision 단계만으로 첫 실패가 형식인지 설명 검토인지 구분할 수 없으며, 과거 #220의 검토 결과를 이번 결과로 사용하지 않는다.
- 확인한 코드 결함: 기본 대사/화면 설명과 hybrid·건축 부품 제약 일부가 안전한 validationIssue를 전달하지 않아 1회 보완 요청도 구체적인 필드를 받지 못했다. UI는 실제 증거 유무와 무관하게 모든 scenario 실패에 검토 버튼을 표시했다.
- 수정 PR: [#226 main](https://github.com/hhj4861/commerce-automation-kit/pull/226), source `8690e34`; [#227 deploy/shopshorts](https://github.com/hhj4861/commerce-automation-kit/pull/227), release `a54e8a8`. 이후 사용자 승인으로 머지·배포 완료(문서 상단 참조). 앱·브로커·packages 코드 차이는 없고 기존 package-lock 차이는 보존했다. 각 브랜치를 같은 운영 의존성과 Node20에서 별도로 검증했다.
- 각 브랜치 97검사 통과, 2개 opt-in 실 Blender/전체 hybrid 검사는 미실행. 실제 본문 렌더 회귀 검사에서는 유료 공급자를 시험 응답으로 대체하므로 실제 ElevenLabs/Higgsfield 성공 증거가 아니다. 로컬 Chrome에서 자료 없는 형식 실패에는 보기 버튼이 없고, 검토 증거가 있는 실패에는 대본과 이유 조회가 작동함을 확인했다.
- 변경은 고정된 필드·허용 규칙과 안전한 표시명 전달, 검증된 증거 존재 여부의 project flag, 기존 실패의 1회 상태 확인이다. 원본 오류·토큰·CLI 출력은 공개하지 않는다. 모델·시간·품질 판정·보완 횟수·유료 생성 예산은 유지한다. 공용 broker 배포 변경은 필요 없다.
- 신규 유료 미디어/TTS/운영 렌더/업로드 없음. 전체 실생성 E2E 미완료. 위 PR이 이번 미보존 응답의 정확한 원인을 해결했다고 단정하지 않는다.
- 로컬 시험 서버 종료(exit0), 임시 node_modules 링크와 짧은 테스트 경로 링크 제거. 로그는 지정 iCloud `commerce-automation-kit/scenario-field-diagnostics/`의 `final-tests.log`와 `release-tests.log`에 있다. 상세 구현 카드: 구현/승격 worktree의 `docs/tasks/20261014-scenario-field-diagnostics.md`.

## 사용자 목표와 현재 승인

- 터미널에서 제작하던 품질/순서를 Shopshorts 웹 제작실에서도 동일하게 제공하고, 전체 메뉴 UI/UX와 실제 생성 결과까지 검증한다.
- 작업 범위는 Shopshorts·영상 제작이다. 과거 잘못 붙여넣은 DBQ 작업은 제외한다. Hanmadi/Festa/Replay/JEV의 타 세션 파일을 임의 수정하지 않는다.
- 최신 요청 “머지해줘”는 #226·#227 머지·운영 반영·같은 QA 재검증 승인이다. 기존 #223·#224 승인도 유지하며 완료한 PR을 다시 승인받지 않는다.
- 기존 QA 실생성, 개인 Google 계정 로그인, 운영 계정 작업의 **집계 건수 조회와 안전한 워커 재시작**은 승인됐다. 토큰/계정 목록/개별 작업 ID를 일반 로그에 출력하지 않는다.
- QA 예산: Higgsfield 최대 **54크레딧**. 추가 유료 생성·구독 변경·공개 YouTube 업로드는 자동 승인으로 확대하지 않는다. 플랫폼의 대본/발행 사람 검수는 보존한다.
- 새 구현 PR이 생기면 준비·검증·push 후 **그 PR에 대한 명시적 머지 승인**이 필요하다. 이번 인수인계처럼 독립 문서는 현재 프로젝트 브랜치에 본인 파일만 commit/push한다.

## 운영 반영 현황 — 아래 표는 #224 시점 기록, 최신 #227은 문서 상단 참고

| 항목 | 실제 상태/근거 |
|---|---|
| 저장소 | https://github.com/hhj4861/commerce-automation-kit |
| 운영 웹 | https://shopshorts-dash.pages.dev |
| main PR #223 | https://github.com/hhj4861/commerce-automation-kit/pull/223 — MERGED, `1d9c69ed8ba3f8e2400f06beb2778fa5fbbcc1a5` |
| 운영 PR #224 | https://github.com/hhj4861/commerce-automation-kit/pull/224 — MERGED, `1cec2cef08ade129569af771ee7592eb928ce22c` |
| Pages 배포 | `e6f4d2ea-9703-4189-a1b7-a945f815c4c6`, https://e6f4d2ea.shopshorts-dash.pages.dev |
| 배포 확인 | 공식 API: production / deploy/shopshorts / exact `1cec2ce` / success / **ad_hoc**. 완료 2026-10-14 08:19:40 KST. Wrangler exit 0 |
| 운영 checkout | `/Users/admin/workSpace/shopshorts-production`, clean detached `1cec2ce`; 검증된 승격 head `1e46b90`과 전체 tree diff 0 |
| 계정 워커 | 복구 후 활성0건 확인·SIGTERM 재시작 완료. PID61759→66989, running/이전 exit0. #224의 조사·대본 지침 적용 |
| 미디어 워커 | 이번 변경/재시작 없음 |
| 공용 broker | 이번 배포 없음. 마지막 확인된 #220 version `bdd47446-e19d-4a0f-b79e-286ef390a0b1`, deployment `8b64e8ed-4db0-44fa-b61d-a0d0bf744099` |

## 최신 변경과 검증 범위

#223/#224는 3파일·21줄 추가다. 모델/시간제한/예산/음성/스타일/스키마/합격 기준/1회 보완 제한은 바꾸지 않았다.

1. `apps/shopshorts/lib/explainer-production.js`의 `researchTopic`: 선택한 왜/어떻게 질문에 대해 기존 문제 → 구체적 설계/행동 → 결과의 출처를 조사한다. 외형/연도/치수만 조사하고 끝내지 않는다. 일반 원리를 특정 시설의 입증된 사실처럼 쓰지 않는다.
2. `apps/shopshorts/lib/studio-scenario.js`: 조사된 행동을 주체/대상 → 어디서 무엇을 함 → 달라지는 결과로 설명한다. 연도/명칭 나열보다 작동 과정과 완결된 답을 우선한다. 시각 효과는 실제 작동에 대응해야 한다. 빈 근거를 상상으로 메우거나 사용자 질문을 몰래 바꾸지 않는다.
3. `docs/qa/20261013-causal-research.md`: 범위·실패 근거·검사 기록.

원본 head `4ade2cbbf07129fa48bf50956bd62f1266b9f5b2`, 승격 head `1e46b90424a81aa200a7ca632adf85b09a56681c`. 두 브랜치 각각 **67개 통합/검토 검사 + 조사·옵션 2개 검사 통과**, 관련 없는 렌더 5개는 명시적으로 필터 제외했다. 74개 통과라고 쓰지 않는다. GitOps CI 두 PR 성공, diff check 통과. 당시 동일 tree 증거를 재사용했다. 이후 #224 실 LLM 요청은 형식 검증에서 실패했으므로 의미 품질 통과나 영상 완성을 입증하지 못했다.

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
- 해당 실패 이후 신규 미디어/TTS/렌더/업로드는 시작되지 않았다. #224 재생성은 통신 복구·계정 워커 갱신 후 정확히 1회 요청했으며 자료 확인 단계 진입을 확인했다. 최종 형식 오류와 후속 PR은 문서 상단의 최신 항목을 확인한다.
- 검토를 우회해 실패 대본을 승인하거나, 원문을 읽지 않고 같은 조건으로 반복 생성하지 않는다. 보완 후에도 실패하면 저장된 실제 대사·근거부터 읽는다.

## 인프라 이슈 두 가지 — 대본 형식 실패는 상단 최신 항목 참고

### A. Cloudflare의 일시적 요청 제한 — 복구 확인, 원인/재발 방지 미완료

- 운영 계정 워커와 같은 Node/환경/서명 경로로 `/runner/accounts`의 집계 poll을 요청했으나 HTTP **429**, `content-type: text/html`, `retry-after` 없음.
- 응답 제목: **This website has been temporarily rate limited | cak-credential-broker.guswhd1085.workers.dev | Cloudflare**.
- 이것은 기존 앱의 5초 연결 중복 방지 JSON 오류와 다르다. 계정 토큰 만료, Workers 일일 쿼터 초과, 특정 WAF 규칙 중 어느 것이 근본 원인인지는 아직 확정하지 못했다. Cloudflare 대시보드/공식 진단으로 확인해야 한다.
- 새 Chrome 탭은 정상 열림. 운영 제작실은 `Unexpected token '<', "<!doctype "... is not valid JSON`, 로그인 상태 확인 실패, 작업 목록 확인 필요를 표시했다. 이전 탭의 CDP focus 시간 초과와 구분한다.
- Python urllib의 비인증 `/health` 조회는 403/1010이므로 서비스 장애의 독립 증거로 사용하지 않는다. 위 정상 서명 워커 요청의 429와 실제 UI 실패가 근거다.
- 작업 0건을 확인하기 전 워커 재시작하지 않았다. 네트워크·인증서 검증·Cloudflare 보안을 끄거나 프록시로 우회하지 않는다.
- 후속 재확인에서 정상 서명 요청 HTTP200/active0, 운영 UI 정상 조회를 확인했다. 어제 UTC 일자 GraphQL 집계는 broker90030 + 기타 Worker19 + Pages Functions32903 = 약122952요청. 무료플랜의 계정 공용 일일10만 제한과 오전9시 초기화는 공식 문서로 확인했으나 당시 오류번호/실제 구독 플랜 조회는 확보하지 못해 ‘일일 한도 소진 가능성이 높음’으로 보고했다. 집계는 과금 원장/정밀 요청 로그와 동일하다고 가정하지 않는다. 계정 워커의 5초 poll은 코드에서 확인한 기여 요인이지 모든 요청의 원인을 규명한 것은 아니다.
- 근거: https://developers.cloudflare.com/workers/platform/limits/#daily-requests , https://developers.cloudflare.com/pages/functions/pricing/ . 조회 간격·중복 요청·실패 backoff 개선이나 요금제 변경은 이번 확인만으로 구현/적용하지 않았다.

### B. GitOps CI 전용 배포 자격 부재 — 기존 미해결

- Pages에 Git source 연결이 없고 최근 운영 반영은 Wrangler 로그인으로 **수동 배포**했다. workflow가 존재한다고 자동배포가 완성된 것은 아니다.
- 이전 run `38400297168`은 CI 토큰 부재로 503. 이전 #224 run **38483105758**은 429였다. #227의 최신 run **38514210534**는 `Cloudflare credential request failed (503)`로 실패했다. 서로 다른 시점의 실패를 혼동하지 않는다.
- 마지막 확인: broker의 `SS_DEPLOY_CLOUDFLARE_API_TOKEN` 바인딩과 Secrets Store `CAK_DEPLOY_CLOUDFLARE_API_TOKEN`이 없었다. 현재 요청 제한 복구 후 다시 확인한다.
- 기존 403 문제는 허용 refs에 `refs/heads/deploy/shopshorts`를 추가해 해결했다. 기존 `refs/heads/deploy/hanmadi-admin`을 보존한다.
- CI용 Cloudflare Pages 편집 토큰을 안전하게 등록해야 한다. 실제 값은 채팅/문서/Git/로그에 기록하지 않는다. 개인 Wrangler OAuth를 CI 장기 토큰으로 복제하지 않는다. 권한 확대·추가 요금제 변경은 별도 동의 없이 수행하지 않는다.

## 안전한 재개 절차

1. AGENTS.md와 `~/.codex/SESSION_MEMORY.md`, engine-exchange/efficiency 상태를 새로 읽는다. 확인 시점 worker OFF / Claude crosscheck OFF, efficiency ON이었다. 과거 Claude 협업을 근거로 새 자동 요청을 보내지 않는다.
2. #226·#227은 승인·머지·Pages 배포 완료다. 현재 검증 요청과 실제 운영 상태부터 재조회한다. 이미 완료한 PR의 승인을 다시 요청하지 않는다. 새 운영 반영 시에는 정상 runner aggregate poll에서 activeCount/hasNext만 확인하고 활성0건일 때 안전한 재시작을 한다.
3. 계정 워커 launchagent: `com.cak.llm-accounts`; plist `~/Library/LaunchAgents/com.cak.llm-accounts.plist`; cwd는 운영 checkout. `launchctl kill SIGTERM "gui/$(id -u)/com.cak.llm-accounts"` 후 KeepAlive 정상 재기동 확인. plist 환경/키는 출력하지 않는다.
4. #227 배포 후 QA 재시도 1회는 이미 완료됐다. 최신 6장면과 보완 의견을 먼저 읽고 원인을 보완한 뒤 새 검증을 한다. research/scenario/revision/review의 실제 진행과 종료를 확인한다. 화면만 진행 중이면 실제 lease/deadline 집계로 구분한다. 검토 후 실패 시 owner 전용 거부 자료를 읽는다.
5. 통과했다면 내용의 질문·인과·예시·결말을 직접 검토하고 기존 승인 범위 안에서 미디어/TTS/렌더까지 검증한다. 실제 소리, 자막 위치, 끝 문장/마지막 프레임, 재생 가능 파일을 확인한다. 최종 발행 게이트/공개 업로드는 별도 경계다.
6. CI 자격 문제가 해결된 뒤 운영 브랜치 workflow의 실제 success와 Pages source SHA를 비교한다. 수동 배포 성공을 GitOps 검증으로 대체하지 않는다.
7. 새 수정은 별도 구현 worktree, 경로 track, 의미 있는 관련 검사, 본인 변경 commit/upstream push, 새 PR 머지 승인 순서로 진행한다. 실패/미완료는 그 상태로 기록한다.

## 경로·도구와 함정

| 용도 | 경로/설명 |
|---|---|
| 사용자 프로젝트 / 독립 문서 | `/Users/admin/workSpace/commerce-automation-kit` — 현재 `feat/common-video-generator`, upstream `origin/feat/common-video-generator`. 이 checkout은 운영 소스보다 오래돼 일부 파일이 없을 수 있다 |
| 구현 worktree | `/Users/admin/workSpace/commerce-automation-kit-worktrees/scenario-review-feedback` — `fix/shopshorts-scenario-field-diagnostics`, head8690e34 / PR #226 |
| 승격 worktree | `/Users/admin/workSpace/commerce-automation-kit-worktrees/studio-workspace-release` — `release/studio-scenario-field-diagnostics`, heada54e8a8 / PR #227 |
| 운영 소스/의존성 | `/Users/admin/workSpace/shopshorts-production` — Node20 의존성/SQLite ABI 보존; 함부로 npm 재설치하지 않는다 |
| 계정 워커 로그 | `~/Library/Logs/Shopshorts/llm-account-worker.log` |
| 제작 워커 | `com.cak.studio-production`, 로그 `~/Library/Logs/Shopshorts/studio-production.log` |
| 최종 영상 | `/Users/admin/Downloads/vedio/` |
| 중간 산출물/로그 | `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/<task>/` — 비밀·런타임 DB는 새 클라우드 동기화 금지 |
| Chrome 검증 | CUA browser1 사용. 운영 탭1694573626을 handoff 표시했지만 tabID는 재검증. 고장난 이전 탭 ID를 반복 사용하지 않는다 |

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

새 세션 전달 문장: **“docs/handoffs/20261014-shopshorts-production.md를 읽고 이어서 진행해줘. #226·#227은 승인·머지·운영 Pages 배포됐어. 같은 QA는 형식을 통과했지만 질문에 대한 인과 설명 부족으로 내용 검토에서 실패했어. 최신 6장면과 보완 의견을 읽고 조사→대본의 근거 연결을 보완해야 영상 생성 E2E까지 이어갈 수 있어. 자동배포는 CI 인증503으로 별도 미완료야.”**
