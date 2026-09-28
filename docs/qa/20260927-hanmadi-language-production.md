# Hanmadi 언어 선택·발음·회화 운영 검증

검증일: 2026-09-27. PR #46에 대한 머지·Hanmadi 배포·기존 Dify 회화 지침 게시 요청에 사용자가 “계속해줘”로 진행을 승인한 뒤 적용했다.

## 적용 상태

- 운영: https://hanmadi-lake.vercel.app
- PR: https://github.com/hhj4861/commerce-automation-kit/pull/46 — merged, `e70ced2c044a171cfc101ce71556c558f2daa6bd`.
- 구현 브랜치: `feat/hanmadi-language-flow`, `60c29c3295332f06895a1958f937735a53e1676b`, 원격 push 완료. 배포 전 해당 커밋과 merged main의 `apps/hanmadi`, `services/dify` 차이가 없음을 확인했다.
- Vercel 운영 배포: `dpl_2E2jDYD216rL1muDSBZeYuiHGgUD`, Ready 및 운영 별칭 적용, deploy 명령 exit 0.
- 고정 배포 URL: https://hanmadi-mbuaf2mnw-dean-10.vercel.app
- Dify 기존 Hanmadi 앱 `2bd6d391-b119-40c4-b001-4be6bee368a9`의 system prompt만 갱신했다. 모델·앱·키·Vercel 환경변수는 기존 설정을 유지했다.
- Dify 게시 workflow: `483a3344-24fd-4370-bc28-d5f3e008804f`, 표시명 `language-flow-46`. 공식 console API draft 저장 및 publish 모두 200. 게시된 prompt가 Git DSL과 동일함을 조회 검증했다.
- 서버 `/opt/shared-ai/repo/services/dify/apps/hanmadi-tutor.yml`도 동일 DSL로 갱신했다. 서버 저장소 전체 업데이트나 컨테이너 재배포는 하지 않았다.

## 변경 동작

로그인 직후 한국어·태국어·일본어를 선택한다. 선택한 언어는 학습 페이지와 AI 회화에 전달되며 새로고침과 쿼리 없는 진입에서도 유지된다. 상단 언어 변경으로 다른 언어를 선택하면 새 회화방으로 시작한다. 로그아웃 후 새 로그인에서는 다시 언어를 선택한다.

태국어·일본어 학습 문장과 퀴즈에 한글 발음을 추가했다. AI는 선택 언어로 먼저 말하고 한글 발음·한국어 뜻을 함께 제공하도록 지시했다.

## 실제 운영 검증

모바일 크기 Chromium(390×844)에서 정상 PIN 로그인으로 검증했다. 인증 쿠키 위조나 운영 응답 mocking은 사용하지 않았다. 비밀 값과 실제 학습자 데이터는 보고서에 포함하지 않는다.

| 항목 | 결과 |
|---|---|
| 로그인 → 언어 선택 → 태국어 학습 → 상단 AI 회화 | 통과, 학습 화면에 `한글 발음 · 싸왓디이` 확인 |
| 태국어 실제 회화 | HTTP 200, 태국어 원문·한글 발음·한국어 뜻 반환 |
| 태국어 후속 회화 | HTTP 200, 동일 conversation ID 유지 |
| 쿼리 없는 `/conversation` | 저장된 태국어 유지 |
| 일본어로 변경 | 일본어 URL 및 빈 새 회화방 확인 |
| 일본어 실제 회화 | HTTP 200, 일본어 원문·한글 발음·한국어 뜻 반환 |
| 일본어 학습 | 저장된 일본어 유지, `한글 발음 · 곤니치와` 확인 |
| 일본어 답변 다시 듣기 | speech HTTP 200, 브라우저 blob 428,452 bytes, 26.72초, readyState 4, 재생 진행 및 오류 없음 |
| 한국어로 변경 후 실제 회화 | HTTP 200, 한국어 응답 |
| 로그아웃·재로그인 | 로그아웃 200, 언어 선택 화면으로 진입 |
| 모바일 가로 넘침·브라우저 예외 | 가로 넘침 없음, pageerror 없음 |

일본어 응답 예: `こんにちは！はじめまして。` / `곤니치와! 하지메마시테.` / `안녕하세요! 처음 뵙겠습니다.`

태국어 응답은 `สวัสดีครับ ยินดีที่ได้รู้จักนะครับ`으로 시작했다. 한글 발음 줄에 `루우จัก`처럼 원문 글자가 일부 섞이는 사례가 관찰됐다. AI 발음 표기는 생성 결과이므로 정확성을 보장하지 않으며, 한글만으로 태국어 성조·일본어 음운을 완전히 표현할 수 없다. 정적 학습 문장의 표기와 AI 생성 표기를 구분한다.

실제 마이크 녹음·사용자 청음 평가는 이번 배포 검증에 포함하지 않았다. 음성 합성 응답과 브라우저 디코딩·재생을 확인했으며, STT는 기존 연결을 변경하지 않았다.

## 자동 검증

머지 전 단위 테스트 19개, 타입 검사, 대상 ESLint, production build, 3개 언어 브라우저 회귀, 기존 Dify/회화 smoke가 통과했다. 상세: 구현 커밋의 `docs/qa/20260927-hanmadi-language-flow.md`.

머지 커밋에서 실행된 CI도 통과:

- [Hanmadi Dify connection](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36316608989)
- [Dify shared AI platform](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36316608956)

## 복구 자료·정리

- 이전 웹 배포: `dpl_9nxPoa1TmXiBFSADzQYDYSLuvnZt`.
- Dify 이전 게시 workflow: `9f787de6-580b-4009-967f-f1336d75a64f`.
- 서버 비공개 백업: `/opt/shared-ai/backups/20260927-language-flow/`의 `before-workflow.json`, `before-hanmadi-tutor.yml`, `after-workflow.json`. 디렉터리/파일 생성 umask 077. 비밀 키를 로컬 파일로 복사하지 않았다.
- 검증용 브라우저 종료 exit 0. IAP 터널은 검증 종료 후 Ctrl-C로 닫았으며 SSH 종료 코드 255를 확인했다. 운영 서비스 종료를 의미하지 않는다.
- task-finish 공식 reconcile에는 이전 도구 실행의 미결 기록이 남아 있다. 이 기록을 임의로 수정하거나 검증 성공으로 바꾸지 않았다. 실제 배포·API·테스트 결과와 로컬 완료 훅 상태는 별개다.

## 2026-09-28 완료 훅 재조사

운영 변경 없이 원본 호스트 기록과 공식 `gate.py reconcile`을 대조했다. 남아 있는 과거 호출은 `exec-10a08749-6b1e-4fb1-ae70-275bbcf72649`다.

- 외부 호출 `call_xG8iaS2fdLQgidCHOWJ02ENE`은 2026-09-27 09:31:08.492 UTC에 브라우저 프로세스 `49206`에 입력을 보낸 뒤 서버 적용 명령을 요청했다.
- 서버 적용 명령은 09:31:25.854 UTC에 `CreateProcess Rejected`로 실행 전에 거부됐다. 당시 PR #45 미머지 상태의 운영 적용 승인이 부족하다는 판단이었다. 이후 별도 사용자 승인으로 수행한 적용과 이 거부 기록은 구분된다.
- 브라우저 프로세스 `49206`은 09:53:39.634 UTC에 종료됐다. 원본 `item_completed` 기록: `exec-ce53b4a2-1aa4-4437-94ee-9946606ddcbb`, status `failed`, exit code `1`. 성공 종료로 바꾸어 해석하지 않는다.
- 현재 복구 파서는 입력 없는 `write_stdin` 조회를 지원하지만, 해당 호출은 비어 있지 않은 브라우저 조작 입력을 포함한다. 이 복합 호출을 기존 복구 경로로 확정하지 못한다. `interrupted-readonly-plan`도 단일 `gh pr checks --watch`의 중단 복구용이므로 이 사례에 적용할 수 없다.
- 공식 reconcile을 다시 실행했지만 이 과거 기록은 미결로 남았다. 훅 코드·DB·원본 기록을 수정하거나 승인 거부를 우회하지 않았다. 다음 조치는 완료 훅 유지보수에서 이 호출 형태의 종료 증거를 검증하는 복구 경로를 지원하는 것이다. Hanmadi 코드 재배포나 AI 설정 변경은 필요하지 않다.
