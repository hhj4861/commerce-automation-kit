# Hanmadi E2E 사용성 개선 — 머지·운영 승격 기록

최초 확인: 2026-10-17. 운영 배포 확인: 2026-10-18. 담당: 현재 Hanmadi 세션.

## 실제 반영 상태

- 구현 [PR #293](https://github.com/hhj4861/commerce-automation-kit/pull/293)은 사용자 승인 후 main에 머지됨. 머지: `c0364cc3987cb71d5389547694f7ace6cfa244c7`.
- 검증된 구현: `082bda5fd62ba23787740e6c65abd26244ac4469`.
- 운영 전용 [PR #297](https://github.com/hhj4861/commerce-automation-kit/pull/297)은 2026-10-18 사용자 명시적 승인 후 머지됨. 머지 리비전: `b2dec66de8e6b5aa97e13f3de7add24b18aa0a81`.
- 배포 후보: `9ba91780d9f481cdeec859f82c6a745fba861795`, `release/hanmadi-e2e-usability-20261017` → `deploy/hanmadi`.
- 운영 주소: https://hanmadi-lake.vercel.app/app . GitOps 자동 배포 성공 후 공개 `/api/deployment`가 새 리비전 `b2dec66de8e6b5aa97e13f3de7add24b18aa0a81`과 정확히 일치함. 개선 사항의 실제 운영 UI 확인 완료.

## 변경 범위와 소스 일치

단어장 바로가기의 단어 필터 진입, 음악 연습의 음악 목록 복귀, 학습 원문의 접근성 텍스트 노출, 작은 화면에서 대화 시작 동작을 가리는 장식성 제목 제거.

운영 이력에서 승인된 구현 커밋 1개만 cherry-pick했다. 전체 `apps/hanmadi-flutter` 트리·변경된 브라우저 E2E 스크립트·작업 문서는 구현 커밋과 diff 없음. 11개 파일만 변경하며 API·인증·배포 설정·운영 데이터·관리자 앱은 변경하지 않는다.

## 확인된 검증

- 구현의 Flutter 분석 오류 없음, widget 테스트 25개, 웹 release 빌드, 실제 Next API·합성 계정·Chrome E2E 20개 통과.
- 구현 PR CI 6개 모두 성공: study, Flutter web/Android/iOS, Platform GitOps, Shopshorts render.
- 배포 후보 `git diff --check` 통과.
- 배포 후보 Node 배포 테스트 39개, Python 배포 테스트 17개 통과.
- 배포 후보 작업 트리 clean, HEAD와 설정된 upstream 동일.
- 운영 `/api/deployment` 공개 응답으로 기존 리비전 확인.
- 자격 브로커 공개 `/health`: curl HTTP 200, `{"ok":true}`. 앞선 Python 요청은 HTTP 403이었으며 curl의 정상 응답으로 경로가 가용함을 구분했다. 키·권한·설정 변경 없음.
- 배포 PR 필수 CI 5개 모두 성공: Platform GitOps 16초, Flutter web 3분 24초, Android 5분 20초, iOS 4분, study 8분 7초. `gh pr checks --watch`가 종료 코드 0으로 완료됨.
- 사용자 흐름 CI: https://github.com/hhj4861/commerce-automation-kit/actions/runs/39019206250
- Flutter CI: https://github.com/hhj4861/commerce-automation-kit/actions/runs/39019206254
- GitOps CI: https://github.com/hhj4861/commerce-automation-kit/actions/runs/39019206288
- PR #297의 승인·머지·운영 배포와 후속 공개/UI 확인까지 완료했다.

## 운영 배포와 실제 화면 확인 — 2026-10-18

- 자동 배포 workflow: https://github.com/hhj4861/commerce-automation-kit/actions/runs/39080988366 . `plan` 및 `deploy (hanmadi, vercel, deploy/hanmadi)` 모두 success. watcher 종료 코드 0 확인.
- 지정된 Flutter SDK 웹 빌드 → Cloudflare OIDC 자격 전달 → Vercel learner 운영 배포 경로를 그대로 사용했다. 관리자 배포·별도 키 발급·보호 설정 변경 없음.
- 공개 GET 검사 8개 통과: 새 배포 리비전, `/study`와 `/privacy`, Google 로그인 사용 가능 및 지정 client ID 일치, 익명 관리자 API 403, `/app/`의 의도된 308→`/app`, `/app`의 base href `/app/`, JavaScript 자산 HTTP 200.
- 기존 로그인된 Chrome에서 390×844 화면 확인: 회화 원문 `韓国から旅行に来ました。`가 실제 접근성 text로 표시됨. 단어의 원문·예문도 실제 text로 표시됨.
- `내 단어장` 클릭 → `/library?tab=words` 및 단어 빈 목록 확인. 이후 `나의 표현` 클릭 → `/library` 및 표현 빈 목록 확인. 이전 필터가 바로가기 의도를 덮어쓰지 않음.
- 음악 연습 진입 → `음악 목록으로` 버튼 클릭 → `/study`의 음악 목록·곡 카드 복귀 확인. 연습 단계 진행·음성 재생·녹음은 수행하지 않음.
- 320×568에서 AI 대화의 두 시작 제안과 입력창·음성 입력·전송 버튼·하단 메뉴가 함께 표시됨을 실제 screenshot으로 확인. 번역·보관함의 장식성 Heading 제거도 확인.
- 검증 후 회화·스몰토크 화면으로 돌아가 임시 viewport를 reset했다. 언어·레벨·개인 저장 자료는 변경하지 않았다.
- 브라우저 console 검사에서 Hanmadi 출처 오류는 발견되지 않았다. Chrome 확장 프로그램의 listener/stream 경고만 관찰됨. Vercel 서버 전체 로그·drain 설정을 조회한 검증은 아니다.
- 공개 검사 결과: 기존 산출물 폴더 `production-297-public.json`. 자동 배포 상태: `production-297.log`. 운영 CUA screenshot은 도구에서 직접 검토했으며 별도 로컬 캡처 파일 저장을 주장하지 않는다.

main 머지·운영 배포·운영 UI 확인을 각각 검증했다. 유료 AI·음성 실호출, 실제 사용자 저장 데이터 변경, 학습·게시·파인튜닝은 포함하지 않는다. Android/iOS CI는 빌드 검증이며 실제 기기·앱스토어 출시 증거가 아니다. Google 로그인은 공개 설정과 기존 세션 접속을 확인했으며 새 계정 OAuth 재인증은 이번 배포 검사에서 수행하지 않았다.

## 작업 당시 위치와 보존된 증거

- 구현 worktree: `/Users/admin/workSpace/commerce-automation-kit-worktrees/hanmadi-e2e-usability-20261017`.
- 운영 승격 당시 worktree(현재 경로 없음; Git 커밋·PR·배포 기록으로 검증): `/Users/admin/workSpace/commerce-automation-kit-worktrees/hanmadi-e2e-usability-release-20261017`.
- 로컬 E2E·빌드·CI 증거: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-e2e-usability-20261017/`.
