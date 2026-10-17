# Hanmadi E2E 사용성 개선 — 머지·운영 승격 기록

확인일: 2026-10-17. 담당: 현재 Hanmadi 세션.

## 실제 반영 상태

- 구현 [PR #293](https://github.com/hhj4861/commerce-automation-kit/pull/293)은 사용자 승인 후 main에 머지됨. 머지: `c0364cc3987cb71d5389547694f7ace6cfa244c7`.
- 검증된 구현: `082bda5fd62ba23787740e6c65abd26244ac4469`.
- 운영 전용 [PR #297](https://github.com/hhj4861/commerce-automation-kit/pull/297)을 생성·푸시함. 사용자에게 해당 PR 머지·운영 배포 승인을 요청함. 승인 전에는 머지하지 않음.
- 배포 후보: `9ba91780d9f481cdeec859f82c6a745fba861795`, `release/hanmadi-e2e-usability-20261017` → `deploy/hanmadi`.
- 현재 운영은 기존 `a47ba0fbb57f51732bc5c46a1b1b43c1a74fa3f7`. 이번 개선의 운영 배포·운영 UI 검증은 아직 미완료.

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
- PR #297 명시적 승인만 남았으며 승인 전 운영은 기존 리비전을 유지한다.

## 남은 절차

1. PR #297의 필수 CI 통과와 사용자 명시적 승인 확인.
2. 승인된 정확한 후보를 머지해 기존 GitOps 자동 운영 배포 수행.
3. 배포 workflow 종료 성공, 운영 공개 revision 일치, 로그인 공개 설정·접근 차단·앱 자산 및 실제 모바일 UI 동선 확인.

main 머지와 운영 적용을 구분한다. 유료 AI·음성 호출, 실제 사용자 데이터 변경, 학습·게시·파인튜닝은 검증 범위에 포함하지 않는다. Android/iOS CI는 빌드 검증이며 실제 기기·앱스토어 출시 증거가 아니다.

## 위치

- 구현 worktree: `/Users/admin/workSpace/commerce-automation-kit-worktrees/hanmadi-e2e-usability-20261017`.
- 운영 승격 worktree: `/Users/admin/workSpace/commerce-automation-kit-worktrees/hanmadi-e2e-usability-release-20261017`.
- 로컬 E2E·빌드·CI 증거: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-e2e-usability-20261017/`.
