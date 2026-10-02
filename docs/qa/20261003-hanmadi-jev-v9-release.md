# Hanmadi Admin JEV v9 운영 배포 검증

2026-10-03 KST. 사용자 승인 후 PR #128 머지, GitOps 운영 배포 및 관리자 로그인 검증을 완료했다.

## 변경과 대상

한 후보의 잘못된 응답 형식 때문에 정상 후보까지 함께 보류되던 문제를 수정한 [PR #127](https://github.com/hhj4861/commerce-automation-kit/pull/127)을 운영에 승격한다. 전체 후보 번호를 먼저 검증한 뒤 오류가 있는 후보만 보류한다. 추가 필드·잘못된 판정·중복 참조를 허용하거나 자동 수정하지 않으며, 기존 품질 차단 기준과 게시 전 사람 검수는 유지한다.

- 구현: `d3309cb4014526d74d7b29a19a4bfaffd2c6dc51`, `fix/jev-review-row-isolation`.
- main 머지: `5ae2e9d8cb1ee633165940c1f9c4aa0edc202eb3`. JEV 담당 세션이 해당 PR의 사용자 명시 승인 후 수행했다.
- 배포 전 운영: `3f4720bbb1a4c3e0aae9705d564f7cb10e12d7ce`, rubric `hanmadi-video-jev-v8`.
- 현재 운영: `40e46ae0d5b845d30c55e3ceee75da97a4e7d270`, rubric `hanmadi-video-jev-v9`.
- 승격 대상: `deploy/hanmadi-admin` → Vercel `hanmadi-admin`, https://hanmadi-admin.vercel.app/study/admin.
- 배포 전 운영과 승격 main의 차이는 PR #127의 5파일뿐이었다. 영상 처리 결과 UX와 기존 운영 수정은 유지한다. 새 rubric v9로 이전 캐시와 구분하며 기존 자료를 자동 재평가하지 않는다.

## 검증

- PR #127의 CI 5개 SUCCESS와 MERGEABLE/CLEAN을 직접 확인했다.
- 담당 구현 QA의 앱 테스트 208개, 타입 검사, 수정 파일 lint 통과. 기존 실응답 25건을 동일 요청으로 오프라인 재생한 48개 후보 결과: 채택 14→15, 보류 3→2, 제외 31 유지. 고정 라벨 기준 오채택·오제외 0. 새로운 독립 모델 정확도 검증이 아니다.
- 실제 diff 검토: 후보 번호의 완전성·유일성 선검사, 모호한 배치 전체 거부, 오류 행 내용 미보존, 정상 형제 후보 유지와 기존 품질 차단 기준 유지 확인.
- 이번 세션은 코드를 추가 수정하거나 유료 모델을 호출하지 않았다. 기존 GitOps 배포 성공, 정확한 운영 revision, 관리자 로그인·권한 경계·기본 화면을 확인했다. 자료 게시·파인튜닝·독립 유료 품질 평가는 포함하지 않는다.

## 승격 준비 결과

- 운영 승격 [PR #128](https://github.com/hhj4861/commerce-automation-kit/pull/128), head `5ae2e9d8cb1ee633165940c1f9c4aa0edc202eb3`, MERGEABLE.
- 필수 [Platform GitOps verification](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37073963599) 통과.
- 검증된 구현 `d3309cb`와 승격 main의 전체 트리 diff가 없다. PR #128의 diff는 위 5파일과 일치한다.
- main/승격 PR에서 재실행한 사용자 흐름·Dify·모델 연결·native runtime·GitOps CI가 모두 SUCCESS인 것을 머지 전에 확인했다. PR head는 승인된 `5ae2e9d` 그대로이며 CLEAN이었다.
- 사용자가 PR #128 머지·운영 배포에 “응 진행해줘”로 명시 승인했다. `--match-head-commit 5ae2e9d8cb1ee633165940c1f9c4aa0edc202eb3`를 사용해 정상 머지했다. 보호 규칙·훅을 우회하거나 force push하지 않았다.

## 운영 배포 및 확인

- PR #128 머지: 2026-10-02 22:50:52 UTC / 2026-10-03 07:50:52 KST.
- [GitOps 배포 실행](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37074644185) SUCCESS. 관리자 Vercel 대상만 배포했다.
- 배포 커밋 `40e46ae0d5b845d30c55e3ceee75da97a4e7d270`의 전체 소스 트리는 승인된 main `5ae2e9d`와 diff가 없다. `VIDEO_RUBRIC=hanmadi-video-jev-v9` 포함을 확인했다.
- 실제 `https://hanmadi-admin.vercel.app/api/deployment`가 application `hanmadi-admin`과 위 배포 revision을 반환했다.
- 새 브라우저 컨텍스트에서 관리자 로그인 200, 관리자 화면·영상 찾기/학습 관리/AI 진단 메뉴, 로그인 후 관리자 API 200, 로그아웃 200을 확인했다. PIN·쿠키는 메모리에서만 사용했다.
- 비로그인 관리자 API 403, 학습 API 404, 로그인 페이지 200. 브라우저 런타임 오류 0.
- 배포 시작 이후 Vercel production 오류 수준 로그 조회 성공, 반환 기록 0개. 조회 기간의 관측 결과이며 영구적인 무오류 보장은 아니다.
- 이 운영 확인에서 유료 JEV/LLM 추론, 자료 생성·게시, 파인튜닝은 실행하지 않았다. v9 판정 회귀는 CI와 기존 실응답 재생으로, 운영 반영은 동일 소스와 실제 revision으로 각각 확인했다. 별도 신규 품질평가 PR #129는 이번 배포에 포함하지 않았다.

## 증적 저장 위치

- 프로젝트 기록: `/Users/admin/workSpace/commerce-automation-kit/docs/qa/20261003-hanmadi-jev-v9-release.md`
- 운영 검증 스크립트와 정제된 JSON: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/hanmadi-admin/jev-v9-release-20261003/`
- 파일: `verify-production.mjs`, `production-verification.json`, `runtime-error-scan.json`.
