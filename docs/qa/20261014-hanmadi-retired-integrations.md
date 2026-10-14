# Hanmadi 퇴역 연동 정리 — 2026-10-14

- 목표: 폐기된 accounts v1·Dify UI와 실행 경로를 제거하고 Gemini/LiteLLM 학습을 유지한다.
- 담당/범위: Codex, apps/hanmadi와 관련 문서. 서버·공통 계약·배포 설정은 제외한다.
- 기준: origin/main 1d9c69e, fix/hanmadi-retired-integrations.
- 완료 기준: 개인 모델·옛 대화 ID 거부, 기본 대화/언어/음악 흐름 회귀 검증, 커밋·push·PR.
- 검증: 단위 252개, typegen/tsc, lint/build, 교실·스터디·음악 E2E 통과. 아래 표 참조.
- 현재: 구현 및 로컬 검증 완료. 작업 브랜치 PR로 제출하며 운영 배포·머지는 미실행. 실제 운영 튜터 화면 (c)는 PIN 로그인 미확인으로 별도 잔여 항목이다.
- 다음: PR CI 확인과 사용자 머지 승인. 운영 배포는 별도 절차를 따른다.

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

## 동작과 범위

- accounts v1의 로그인·키 입력·승인·연결 조회/해제 UI와 중계 구현을 제거했다. 구형 클라이언트의 `/api/model-connections`는 410이며 body의 자격정보를 읽거나 전달하지 않는다. POST/DELETE의 origin 검사는 403으로 유지한다.
- 두 회화 API는 옛 개인 모델 선택값을 409로 거부한다. 스터디는 사용량 예약·자료 검색보다 먼저 확인한다. 기본 Gemini로 자동 전환하지 않는다.
- Dify 설정은 실패로 알리고, 옛 저장 대화 ID를 새 공급자에 옮기지 않는다. 같은 탭의 기존 LiteLLM 대화와 입력은 유지한다. 대화 저장 동의 UI는 제거하고 공급자 전송 안내는 유지한다.
- 서버·accounts v2·공통 LiteLLM 계약·워크플로·운영 환경변수·운영 데이터는 변경하지 않았다.
- 모든 AI·상용 가사 공급자 응답은 fixture다. 라이브 모델 품질·실제 마이크 발음 채점·운영 튜터 PIN 로그인 (c)을 검증한 것이 아니다.
