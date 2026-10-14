# Hanmadi 퇴역 연동 정리 — 2026-10-14

- 목표: 폐기된 accounts v1·Dify UI와 실행 경로를 제거하고 Gemini/LiteLLM 학습을 유지한다.
- 담당/범위: Codex, apps/hanmadi와 관련 문서. 서버·공통 계약·배포 설정은 제외한다.
- 기준: origin/main 1d9c69e, fix/hanmadi-retired-integrations.
- 완료 기준: 개인 모델·옛 대화 ID 거부, 기본 대화/언어/음악 흐름 회귀 검증, 커밋·push·PR.
- 검증: 단위 252개, typegen/tsc, lint/build, 교실·스터디·음악 E2E 통과. 아래 표 참조.
- 현재: 사용자에게 PR #228 머지 승인을 받았고, 먼저 머지된 음악 PR #225를 통합해 검증했다. 갱신된 CI 통과 후 main에 머지한다. 운영 배포는 미실행. 실제 운영 튜터 화면 (c)는 PIN 로그인 미확인으로 별도 잔여 항목이다.
- 제출: [PR #228](https://github.com/hhj4861/commerce-automation-kit/pull/228). 첫 구현 커밋 b50f0f5는 CI 2종(study/GitOps) 통과. 마지막 개인정보 문구 보완 커밋의 CI는 PR에서 확인한다.
- 다음: 최종 통합 PR CI 확인 후 승인된 #228 머지. 운영 배포는 별도 절차를 따른다.

## 검증 경과

- 첫 단위 실행: Hanmadi 252개 중 251개 통과. 새 요청 계약 테스트가 normalizeConfig의 `/v1` 추가를 빠뜨려 실패했고 기대 URL을 보정했다. 런타임 실패를 성공으로 취급하지 않았다.
- 재검증: 단위 252/252, typegen/tsc, build 통과. lint 오류 0, 기존 경고 4개.
- 첫 language-flow 실행은 Chromium 파일 미설치로 화면 시험 전 실패했다. 로컬 설치된 Chrome 실행 파일을 명시해 재실행한다. 제품 회귀 결과로 집계하지 않는다.
- 코드 검토에서 스터디의 모델 거부가 quota/search 뒤에 있었음을 확인해 API에서 먼저 거부하도록 보강했다. E2E는 모든 upstream 요청 수를 비교한다.
- Chrome 사용 E2E는 기능 assertion을 모두 통과했지만 browser.close의 임시 디렉터리 정리에서 대기했다. Chrome 자식 프로세스는 없고 Next 시험 서버만 남았음을 확인했다. 해당 시험 2개를 중단(완료 exit 0 아님)하고, 앱 복사본은 HANMADI_E2E_WORK_DIR로 iCloud에 지정하면서 브라우저 내부 임시 프로필은 macOS 기본 경로로 재검증한다.

## 최종 검증

| 검사 | 결과 | 확인 범위 |
|---|---|---|
| `npm test` | 252/252 통과 | 기본/퇴역 모델, 언어 프롬프트·이력, 오류, 기존 학습 규칙 |
| `next typegen` + `tsc --noEmit` | exit 0 | 라우트·테스트 파일 포함 |
| `npm run lint` | exit 0, 기존 경고 4개 | 새 오류 없음 |
| `npm run build` | exit 0 | 마지막 API 진입점 보강 포함 |
| `test:language-flow` | exit 0 | 한국어·일본어·태국어 교실, 레벨·진도·음성, 캐시 복원과 옛 ID/모델 409 |
| `test:v2` | exit 0 | 영어·일본어·태국어·스페인어 수업·번역·대화·저장·관리자, 기본 AI 설정, 퇴역 요청의 upstream 호출 0건 |
| `test:music` | exit 0 | 4개 자체 제작 곡의 실제 오디오 재생, 뜻·따라 하기·복습·오답·저장·재접속·계정 격리. 포함 HTTP 인수 시험도 4언어 통과 |

두 언어 E2E는 임시 프로필 위치를 바꾼 재실행에서 정상 종료했다. 스터디·음악은 서버 종료와 합성 계정 데이터 제거 로그도 확인했다. 최초 정리 대기 실행의 exit 137을 통과 증거로 사용하지 않는다.
음악 E2E `result.json`은 `passed: true`, 브라우저 예외 `[]`이다. 320~1440px 설정 화면과 네 언어 음악 화면을 저장했고 기본 AI 설정 화면도 직접 확인했다.

산출물 위치: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-retired-integrations-20261014/`.
최종 로그: `unit.log`, `typecheck-final.log`, `lint-final.log`, `build-final.log`, `language-flow-final.log`, `v2-final.log`, `music.log`; 화면: `language-flow/`, `v2/`, `music/`.

개인정보 안내의 마지막 문구 보완 후 해당 페이지 ESLint, 앱 빌드, 격리된 Next 서버의 실제 `/privacy` HTTP 200과 렌더 본문을 확인했다. 옛 연결·앱 내 해제 안내는 없고 현재 동작 설명이 표시된다. 처음에는 루트에서 ESLint 설정을 찾지 못했고 정적 HTML 경로도 존재하지 않아, 앱 디렉터리에서 검사하고 동적 HTTP 응답으로 확인했다. 기록: `build-privacy.log`, `privacy-http.log`.

## 동작과 범위

- accounts v1의 로그인·키 입력·승인·연결 조회/해제 UI와 중계 구현을 제거했다. 구형 클라이언트의 `/api/model-connections`는 410이며 body의 자격정보를 읽거나 전달하지 않는다. POST/DELETE의 origin 검사는 403으로 유지한다.
- 두 회화 API는 옛 개인 모델 선택값을 409로 거부한다. 스터디는 사용량 예약·자료 검색보다 먼저 확인한다. 기본 Gemini로 자동 전환하지 않는다.
- Dify 설정은 실패로 알리고, 옛 저장 대화 ID를 새 공급자에 옮기지 않는다. 같은 탭의 기존 LiteLLM 대화와 입력은 유지한다. 대화 저장 동의 UI는 제거하고 공급자 전송 안내는 유지한다.
- 개인정보 안내에서도 종료된 연결·대화 보관 기능과 앱 내 해제 안내를 정정했다. 현재 탭 임시 보관과 이전 자료의 운영자 문의 경로를 설명하며, 과거 자료가 삭제됐다고 주장하지 않는다.
- 서버·accounts v2·공통 LiteLLM 계약·워크플로·운영 환경변수·운영 데이터는 변경하지 않았다.
- 모든 AI·상용 가사 공급자 응답은 fixture다. 라이브 모델 품질·실제 마이크 발음 채점·운영 튜터 PIN 로그인 (c)을 검증한 것이 아니다.

## 지연된 협업 확인 반영

- Claude의 12:11 관찰 이후 최신 커밋을 재확인했다. upstream은 `origin/fix/hanmadi-retired-integrations`이며 main으로 push하지 않았다. Next가 생성한 미추적 AGENTS.md/CLAUDE.md도 PR에 포함되지 않는다.
- v2-e2e의 옛 Codex 화면 단언은 이미 기본 AI 설정·퇴역 경로 무호출 확인으로 교체됐다. 태국어 단위 테스트의 모의 성공 입력에 남아 있던 `codex-personal`은 `default`로 보정하고, 실제 completion의 옛 선택값 409·네트워크 0건 검증에 명시적으로 추가했다. 런타임 변경은 없다.
- 음악·단어장 E2E의 빈 AI_ACCOUNTS_URL/DIFY_* 값은 외부 환경을 시험 프로세스에서 비우는 격리 설정이므로 유지한다. 운영 연결 사용을 뜻하지 않는다.
- 당시 음악 PR #225도 OPEN이었으며 package.json test 줄을 수정한다. #228의 인접 test:dify 삭제와 충돌할 수 있어 나중에 통합되는 브랜치에서 음악 테스트 등록과 퇴역 스크립트 삭제를 모두 보존해야 한다. 다른 작업 브랜치는 수정하지 않았다.
- 보정 후 단위 252/252, 변경 테스트 ESLint, 전체 TypeScript 검사 통과. `unit-peer-followup.log`에 결과를 보존했다. 기존 브라우저 E2E·빌드 증거는 런타임 소스가 동일하며, 새 커밋의 CI 결과는 PR #228에서 확인한다.

## 승인 후 main 통합 검증

- PR #228의 `cab994e` CI 2종 통과 후 음악 PR #225가 먼저 머지됐다. `origin/main`의 `62758a8`을 정상 merge해 package.json 한 곳의 충돌을 해결했다. `lib/owned-music.test.ts`와 `test:owned-music`은 유지하고 `test:dify`만 제거했다. 이미 main에 반영된 다른 세션의 변경은 그대로 보존했다.
- 통합 상태에서 단위 260/260, Next route typegen, 전체 TypeScript 검사, lint, build가 모두 exit 0이다. 기록: `merge-unit.log`, `merge-lint.log`, `merge-build.log`.
- 새 소유 음악의 관리자 등록·권리 확인·AI 생성·JEV 재검수·게시·학습·숨김 흐름도 로컬 브라우저 E2E exit 0, `passed: true`다. AI 생성 1회·검수 2회는 모의 응답이며 공급자 유료 호출은 없다. 기록: `merge-owned-music.log`, `merge-owned-music/`.
- Next가 이번 시험에서 만든 AGENTS.md/CLAUDE.md는 배포된 Next 생성 코드와 같은 내용임을 확인해 정리했다. 사용자 지침 파일이나 다른 세션 산출물은 변경하지 않았다. 최신 CI·실제 main 머지 여부는 PR #228 상태에서 확인한다.
