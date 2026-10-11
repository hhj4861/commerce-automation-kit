# JEV discovery 운영 교체 결과 — 2026-10-05

PR #151 머지와 운영 discovery 교체를 사용자에게 구체적으로 제시한 뒤 “진행해줘” 승인을 받아 실행했다. **PR #156까지 공통 서비스 운영 반영을 마쳤다. 최신 실계정 진단은 검색→초안→JEV→Codex 재검수까지 완료됐지만 필수 위치 근거 부족으로 최종 보류됐다. 정상 추천 성공은 아직 미입증이며 일반 추천의 검증용 활성화 설정은 원복했다.**

## 실제 반영

- [PR #151](https://github.com/hhj4861/commerce-automation-kit/pull/151): main에 squash merge. 머지 커밋 `aeeec75761f5afac88a25be1b42f30e3d3eb6133`. CI 2개 통과, 관련 로컬 테스트 76개 통과. 머지된 adapter/service/native review 소스가 검증한 파일과 같음을 확인했다.
- 서버: 개인 GCP `replay-live-508202`, `shared-ai`, `us-central1-a`의 discovery 서비스만 교체했다.
- 서비스 소스: 앞서 승인·머지된 PR #148의 `c7ef3e2c411785c8e852f24a54ea867016370dc4`. #151의 런타임 변경은 Shopshorts adapter이므로 이 서비스 이미지에는 추가 변경이 없다.
- 릴리스: `/opt/shared-ai/releases/discovery-c7ef3e2c411785c8e852f24a54ea867016370dc4`.
- 이미지: `sha256:ba7242caddafaa94a75106805b43f80bb6185f7c5aee1ba62b619994850f6698` (`cak-discovery:c7ef3e2`).
- 실행 모듈 버전: 단일 단계 `discovery-v1.2`, research 기본 `discovery-v2.2`, 명시적 native 검수 `discovery-v2.6`.

## 보존·검증

1. 교체 직전 진행 중 요청 0, SQLite quick_check=ok 확인. 서버 내부 백업 `/opt/shared-ai/backups/discovery-c7ef3e2c411785c8e852f24a54ea867016370dc4/discovery.sqlite` 생성 및 무결성 확인(0600).
2. 기존 `/opt/shared-ai/discovery/.env`와 data를 그대로 연결. 비밀 설정 내용 불변, 기존 요청 **7건 전체 행 일치**, 다른 실행 중 컨테이너 ID 불변 확인. 새 키·권한·예산 변경 없음.
3. 새 discovery healthy, 내부 health HTTP 200, runtime import와 v1.2/v2.2/v2.6 확인. 실패 시 이전 compose·이미지로 복귀하는 절차를 준비했으며 실제 복귀는 필요하지 않았다.
4. 공개 주소 `https://shared-ai-d5cy7m6i7q-uc.a.run.app/discovery`에서 아래 검사 통과. 운영 키는 서버 프로세스 안에서만 사용했다.

| 검사 | 응답 |
|---|---|
| private health 외부 비노출 | 404 |
| 익명 discovery 요청 | 401 |
| 유효 인증 + 존재하지 않는 요청 | 404 / request_not_found |
| 지원하지 않는 reviewMode | 400 / unsupported_review_mode |
| 브라우저 Origin 직접 요청 | 403 / backend_only |

검사 후에도 DB 요청 7건·quick_check=ok다. 이번 배포 검증의 새 LLM/JEV 호출은 **0회**이며, 의미 품질을 새로 측정한 것이 아니다. 기존 실호출 품질 근거는 main의 `docs/qa/20261005-jev-v26-final.md`에 있다.

## 남은 작업

- 검색 자료에 있는 대상명 선택과 충분한 근거 확보를 개선한 뒤 조사→초안→JEV→필요시 native 검수의 실계정 성공 경로를 확인해야 한다. 최초 2건은 보류 표시·알림 복구까지만 확인했고 최신 진단은 아래와 같이 JEV·native 재검수까지 도달했다. 계정 철회와 재생은 기존 HTTP 통합 대역 검증이며 실제 연결 계정을 해제하지 않았다.
- 계정 워커의 `DISCOVERY_ENABLED=1`, `DISCOVERY_WORKFLOW=research-v2`, `DISCOVERY_REVIEW_MODE=native-llm-v1`, 운영 `DISCOVERY_URL`은 제한 검증 중 적용했으나 종료 후 원래 설정으로 복구했다. 일반 추천은 기존 경로다.
- [PR #154](https://github.com/hhj4861/commerce-automation-kit/pull/154)는 조사 대상명 보류의 일반 오류 안내를 구체적인 사유로 바꾸는 후속 수정이다. 29개 테스트·CI 2개 통과 후 2026-10-06 사용자 승인으로 main에 머지했다(`429bde6c`). 이후 운영 checkout deec584d에 포함된 것을 확인했고 이번 계정 워커 재시작으로 적용했다. 이 수정만으로 검색 근거 부족이나 정상 추천 성공 문제가 해결되지는 않는다.
- 다른 플랫폼·블로그 활성화나 Pages 재배포는 이번 실행에 포함되지 않았다. 전체 JEV 연동 완료로 보고하지 않는다.

## 후속 운영 워커 갱신·검증

- `/Users/admin/workSpace/shopshorts-production`의 미완료 변경이 없음을 확인하고 `992c1f0`에서 승인·머지된 #151의 `aeeec75761f5afac88a25be1b42f30e3d3eb6133`으로 정상 detached checkout했다. 새 구현이나 미승인 PR 머지는 없다. 이 구간의 Shopshorts 변경은 `lib/topic-discovery.js`와 해당 테스트뿐이며 제작·렌더 실행 소스는 불변이다.
- 계정 큐 전체 페이지에서 진행 중 작업 0, studio 12개 프로젝트에서 queued/running 작업 0을 확인했다. 인증 응답은 메모리에서 상태·개수만 추출했고 키·계정 자격·프로젝트 본문은 출력하지 않았다.
- 실제 운영 checkout의 설치 의존성으로 `topic-discovery.test.mjs`, `test-client.mjs`, `test-runtime-config.mjs`, `studio-service.test.mjs`를 실행해 **27개 통과, 실패 0**을 확인했다. Codex/Claude 3단계·재생·검수 직전 철회, 기존 기본 동작, 자격 실패, 서비스 종료 검증을 포함한다. HTTP 서버는 실제지만 검색·모델은 대역이다.
- 기존 runner 키 → broker의 Shopshorts 전용 discovery 키 → 운영 discovery 조회를 실제 모듈로 확인했다. 유효한 UUID의 없는 요청 조회가 **404 / request_not_found**로 종료됐다. 최초 검사는 UUID가 아닌 경로여서 plain-text 404 파싱에 실패했으며, 서버 경로 규칙을 확인한 뒤 UUID로 수정해 통과했다. 최초 실패를 인증 성공 근거로 사용하지 않았다.
- 계정 작업 0을 다시 확인한 뒤 `com.cak.llm-accounts`에 정상 SIGTERM을 보내 launchd 재시작을 확인했다. 이전 PID 39167 → 새 PID 32719, state=running, last exit=0. `com.cak.studio-production`은 PID 39165를 유지했다.
- LaunchAgent plist·기존 환경변수·키·예산은 수정하지 않았다. discovery 활성화 플래그는 없는 상태를 유지하므로 일반 추천은 기존 경로다. 이번 후속 확인의 새 LLM/JEV 호출은 **0회**다.

앞선 자동 승인 검토 거절은 실행 전이었다. 이번에는 정확한 운영 교체 범위에 대한 사용자 승인을 받은 후 정상 실행했다. 이전 실패/거절 기록을 삭제하지 않았다.

비밀 없는 작업 로그: 지정 iCloud 작업 루트의 `commerce-automation-kit/shopshorts-native-review-20261005/approved-rollout.py`, `approved-rollout.log`, `production-smoke.log`. DB/비밀 백업은 서버 안에만 보관했다. iCloud 동기화 완료는 확인하지 않았다.

## 2026-10-06 실제 계정 E2E — 성공 미달, 활성화 복구

사용자가 개인 계정 사용을 명시 승인했다. 기존 로그인 세션으로 홈에 진입했고 연결 계정 창에서 해당 개인 Codex 계정을 확인했다. 기존 프로젝트·대본·영상은 변경하지 않고 새 기획 화면에서 추천만 2건 요청했다.

| 검증 입력 | 서버 결과 | 생성 claim / 검색 / JEV | 실제 화면 |
|---|---|---|---|
| 로마 판테온 오쿨루스 | `2e7acbc1-58e0-4cbd-8f85-c4cd88cce72e`, v2.6, held / `unsubstantiated_research_entity` | 1 / 1 / 0 | 일반 공통 검증 실패 안내. 브라우저 재연결 후 알림에서 동일 입력·실패 결과 복구 확인 |
| 에펠탑 금속 골조, 자료에 있는 대상명을 그대로 복사하도록 요청 | `bb3f94c4-c982-452e-a805-e84c23a826bc`, v2.6, held / `no_grounded_candidates` | 2 / 2 / 0 | 근거·새로움 조건을 충족한 후보가 없다는 안내, 입력 보존 |

- 첫 요청은 인용한 제목/발췌와 대상명 문자열을 대조하는 규칙에서 중단됐다. 원 생성 대상명은 이번 기록으로 확보하지 못했으므로 구체적인 명칭이나 허위 사실을 만들어냈다고 단정하지 않는다.
- 두 번째는 `에펠탑` 연구 대상 1개가 통과했고 추가 검색 후 초안의 후보 배열이 비어 보류됐다. 실제 검색 결과는 기사·사진·여행/백과형 사이트 등이었으며 에펠탑 공식 사이트 자료는 목록에 없었다. 공식 검색 API 사용과 1차 출처 확보를 구분한다. 검색 근거 범위는 다음 개선 대상이다.
- 두 건 모두 JEV 및 native 재검수 단계에 도달하지 않았다. **JEV가 걸러낸 실례·3단계 실계정 성공·판단 정확도 검증 완료로 집계하지 않는다.** 우회 추천이나 자동 재시도는 발생하지 않았다.
- JEV 전용 원장은 전후 모두 77건 / $0.014607852로 동일했다. 이번 JEV 추가 비용 $0, Codex 생성 claim 총 3회. 구독 사용량의 별도 금액은 측정하지 않았다. 새 키·예산 증액·유료 미디어 생성 없음.
- LaunchAgent 첫 재등록은 bootstrap exit 5로 실패하여 원 설정 복구·running을 확인했다. 이후 기존 프로세스와 launchd 등록이 종료된 것을 기다린 뒤 재등록해 활성화에 성공했다. 최초 실패 원인이 종료 시점 때문인지는 확정하지 않는다.
- E2E 종료 후 활성화 설정을 복구했다. 백업 `/Users/admin/Library/Application Support/Shopshorts/backups/jev-native-review-20261006/com.cak.llm-accounts.plist`와 **바이트 일치**, 계정 PID 33672 running, 영상 워커 PID 27190 유지, 운영 소스 aeeec757 유지. 복구 직전 진행 중 계정 작업 0을 확인했다.
- 운영 plist는 Git 밖이라 gate track이 등록을 거부했다. 저장소 QA 문서는 track 후 수정했으며, 운영 설정은 별도 승인 실행·로컬 백업·복구 검증으로 기록했다. 설정 복구를 기능 활성화 완료로 표현하지 않는다.
- 브라우저 제어 중 전체 Chrome 화면 조회는 무관한 다른 서비스 내용 노출 우려로 자동 승인 검토가 거절했다. 이를 재시도하지 않고 Shopshorts 탭으로 범위를 한정해 결과 확인을 마쳤다. 이후 브라우저 연결이 바뀌었지만 알림함의 저장된 요청을 열어 복구했고 중복 요청은 보내지 않았다.


## 2026-10-06 검색 근거 개선 — PR #156 구현·검색 비교

- [PR #156](https://github.com/hhj4861/commerce-automation-kit/pull/156), 코드 `7ecbf1a`: 인용한 원문 대상명을 그대로 유지하고 선택적 `searchQuery`로 원출처 언어의 조사 검색을 수행한다. 호출자의 명시적 site: 힌트는 후속 검색에도 보존한다. 기존 lead 출력·호출 한도·근거 검증·JEV 임계값은 유지한다.
- 운영 서버 내부의 기존 NaverSearch로 공개 주제 검색 8건을 비교했다. 한국어 에펠탑 검색과 ‘공식’ 추가만으로는 공식 도메인이 없었지만, 영어 `Eiffel Tower iron structure weight official`은 상위 10개 중 공식 사이트 5개를 반환했다. 이 비교가 모든 주제의 품질 향상·무게 수치 검증을 입증하지는 않는다.
- site:를 붙여도 타 도메인 결과가 섞이는 것을 확인했다. 검색 힌트와 강제 출처 필터를 구분하며, 검색어에 포함된 명칭/도메인을 새로운 사실 근거로 사용하지 않는다.
- Python 77개·JavaScript/Shopshorts 24개 통과. 실제 HTTP 서버와 DB를 통한 검색→JEV 입력 전달·재생을 검사했지만 모델·검색 응답은 대역이다. 실제 검색 API 비교와 실계정 LLM/JEV 성공은 서로 다른 검증이다.
- 이번 새 JEV·LLM 호출은 0회. 키·예산·운영 설정 변경 없음. PR #156은 2026-10-06 사용자 승인 후 main에 머지됐다(`7e9d8660`). 아래 후속 운영 반영과 검증 상태를 따른다.


## 2026-10-06 PR #156 운영 배포 및 실계정 재검증

사용자가 머지 후 운영 배포·실계정 검증에 “진행해줘”로 승인했다.

- 공통 서비스: 승인된 main 머지 `7e9d8660fd60bfbcabd623cb66661f6dd100ae51`에서 서비스와 JEV bridge의 Git 관리 소스만 전달해 빌드했다. 릴리스 `/opt/shared-ai/releases/discovery-7e9d8660fd60bfbcabd623cb66661f6dd100ae51`, 이미지 `sha256:46ad66e81f35fb00cc6393e2d7cfa654aac36e182c9d84f0dce60532ba0d8878`.
- 진행 중 요청 0·SQLite quick_check=ok 후 DB를 서버 내부 `/opt/shared-ai/backups/discovery-7e9d8660fd60bfbcabd623cb66661f6dd100ae51`에 백업했다. 교체 후 기존 요청 9건 전체 행, 비밀 설정 바이트, 다른 컨테이너 ID 불변을 확인했다. health=healthy·HTTP 200, 컨테이너 service.py SHA-256이 해당 Git 소스와 일치한다. 복구 이미지를 준비했으며 롤백은 필요하지 않았다.
- 로컬 운영 checkout은 다른 갱신으로 이미 `deec584d`(#154 포함), 계정 PID 19882·영상 PID 19876였다. 이 작업에서는 운영 checkout을 전환하지 않았다. 계정 큐 0 재확인 후 기존 워커에 discovery 설정 4개를 적용·정상 재시작(PID 76371)했다. 원본 설정 백업은 개인 로컬 `~/Library/Application Support/Shopshorts/backups/jev-source-search-20261006/com.cak.llm-accounts.plist`다. 외부 plist는 gate 등록 범위 밖으로 거부돼 별도 승인 실행과 원본 백업으로 기록했다.
- 실계정 검증 직전 JEV 전용 원장은 77건 / $0.014607852였다. 기존 키·예산·모델을 유지하며 새 키를 발급하지 않았다.
- 기존 개인 Codex 계정 연결을 화면에서 확인했다. 이전과 동일한 에펠탑 금속 골조 입력을 먼저 검증한 뒤, 검색어와 주제를 한정한 진단 1건을 추가했다. 배포 완료를 실계정 추천 성공으로 표현하지 않는다.


### 실계정 결과와 JEV의 실제 역할

| 구분 | 서버 요청 | 생성 claim / 검색 / JEV | 결과 |
|---|---|---|---|
| 동일 입력 재검증 | `9bf35d1d-fe7b-44da-aba8-42af027380f4` | 2 / 2 / 0 | `no_grounded_candidates`로 보류. 프랑스어 검색은 전달됐지만 사전·다른 구조물 등 무관한 자료가 반환돼 후보가 비었다 |
| 출처·범위 한정 진단 | `04836d56-7650-4877-adc8-a385fa7e7a6d` | 3 / 2 / 1 | 서비스 `complete`, 후보 `held`. JEV 판정 이후 Codex native 검수까지 완료했으나 `native_support_location_uncertain`이 남음 |

- 추가 진단 입력은 `Eiffel Tower iron material site:toureiffel.paris`, 방향은 ‘재료 한 질문만, 자료에 없는 무게·높이·제조 과정·장점은 추가하지 않음’이었다. 일반 한국어 관심사 입력과 다른 통제 조건이므로 원래 입력의 성공으로 집계하지 않는다.
- 생성된 질문: **에펠탑의 금속 재료는 무엇일까?** 핵심 답은 공식 발췌의 `puddle iron(퍼들 철)`이었다. JEV는 `support_answer` pass(신뢰도 0.95, 선택 확률 0.97), entity·relevance·duplicate도 통과시켰다.
- 방향·가상 예상·위치·도입 화면·질문·제목·의미 설명 7개 항목은 기준 미달로 보류됐다. 예를 들어 방향은 pass 선택이지만 신뢰도 0.76으로 채택되지 않았고, 위치는 uncertain/0.42였다. 판정 문구만 pass라고 실제 승인하지 않는 것을 확인했다.
- Codex 재검수는 위치 외 항목을 근거 인용 또는 비사실적 제안으로 해소했지만, 후보 location이 ‘정확한 위치가 확인되지 않음’으로 작성돼 필수 실제 위치를 확인할 수 없다고 보류를 유지했다. 임계값·사람 승인·근거 규칙을 낮추거나 강제 승인하지 않았다.
- 브라우저는 두 건 모두 추천 보류 안내를 표시했고 입력을 보존했다. 영상·대본 제작이나 발행은 실행하지 않았다. **JEV가 틀린 사실을 정확히 잡았다는 품질 실험이나 정상 추천 성공 사례는 아니며, 실제 호출·보류·재검수·화면 차단 경로를 검증한 것이다.**
- 원장: 77 → 78건, $0.014607852 → $0.014996352, **이번 JEV 1회 / $0.0003885**. Codex 생성 claim은 두 진단 합계 5회이며 구독 사용의 별도 금액은 측정하지 않았다.
- 다음 보완점: 긴 다국어 검색어가 무관한 자료를 반환하는 검색 품질 문제와, 조사 자료 묶음에서 필수 위치 등 각 사실 필드의 근거를 고르는 초안 생성 문제를 분리해 다룬다. 요청 재시도나 기준 완화로 통과시키지 않는다.

- 검증 종료 후 계정 큐 0과 다른 설정 변경 없음을 확인하고 원본 plist를 바이트 단위로 복구했다. 계정 워커 PID 51969 running, 영상 워커 PID 19876 유지. discovery 플래그는 비활성 상태로 복귀했으며 공통 서비스의 #156 배포는 유지한다.
