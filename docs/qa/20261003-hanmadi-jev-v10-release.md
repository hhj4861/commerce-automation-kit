# Hanmadi Admin JEV v10 운영 배포

2026-10-03 KST. 사용자가 PR #131에 대해 “머지,운영 반영해줘”로 승인했고, main 머지·동일 수정의 운영 승격·GitOps 배포 및 관리자 검증을 완료했다. 운영 주소는 https://hanmadi-admin.vercel.app/study/admin 이다.

## 변경 범위

- 구현 [PR #131](https://github.com/hhj4861/commerce-automation-kit/pull/131): `03ca36af891876e29189af7575a2670461991b60`, rubric `hanmadi-video-jev-v10`.
- 기존 자료를 후보 번호와 분리한 `corpus` ID로 식별하고 원문·뜻·상황의 정확한 인용을 검증한다. 유효한 중복 주장에는 별도 JEV 쌍 비교를 적용한다. 불일치·불확실·장애는 사람 검토로 남기고 확정된 중복 근거처럼 표시하지 않는다.
- 추가 JEV 요청은 중복 주장이 있을 때 배치당 최대 1회·6개 비교다. 기존 판정 기준, 사람 검수·게시 단계, 기존 v9 초안은 보존한다.
- 이 변경은 이전 검증에서 관측한 표현·한글 독음의 불일치에 대한 별도 수정이 아니다. 실제 모델 품질 보장이나 기존 자료 자동 재평가로 보고하지 않는다.

## 머지와 승격

- PR #131의 5개 CI 모두 SUCCESS, MERGEABLE/CLEAN, 검토한 head 그대로임을 확인했다.
- 정상 merge와 `--match-head-commit`으로 main에 머지: `b58fffc3f576098b6e9469cf28edebd7d84a6507`, 2026-10-03 05:55:24 UTC / 14:55:24 KST.
- 운영 승격 [PR #133](https://github.com/hhj4861/commerce-automation-kit/pull/133): `fix/jev-context-reference` → `deploy/hanmadi-admin`. 승격 CI 5개 모두 SUCCESS/CLEAN과 동일 head를 확인한 뒤 정상 머지했다.
- 운영 머지: `9d6b1dbe0b9609be4c1cce26da810a334f57dc32`, 2026-10-03 06:04:16 UTC / 15:04:16 KST. [자동 GitOps 실행](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37101845251)을 확인했다.
- 최신 main에는 다른 서비스의 #130/#132 변경이 있으므로, 승인된 구현 소스 `03ca36a`를 고정해 승격한다. 기존 운영 `40e46ae`와의 차이는 Hanmadi 참조 수정 및 이미 main에 머지된 #129 평가 도구·문서·fixture의 12개 파일뿐이다. 다른 앱·서버 런타임이나 배포 설정은 포함하지 않는다.
- 운영 브랜치 보호 유지 확인. 기존 `Platform deployment`가 `hanmadi-admin` 대상과 전용 CI 자격으로 배포한다. 보호·훅 우회, 새 자격 발급, 직접 Vercel 수동 배포는 하지 않는다.

## 검증 상태

- 구현 담당 증적: 앱 219/219 테스트, TypeScript·변경 파일 lint 통과. 기록된 참조 혼동 네 사례, 변조·불확실·장애·정상 형제 후보 보존 회귀 포함.
- 이번 세션: 실제 diff 검토 및 `git diff --check` 통과. 운영 승격 CI 5개 통과. 운영 머지의 전체 소스 트리와 승인된 구현 `03ca36a`의 diff가 없고 rubric v10을 포함함을 확인했다.
- [GitOps 실행 37101845251](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37101845251)의 plan과 관리자 deploy 작업 모두 SUCCESS. 학습 앱·공용 서버를 배포하지 않았다.
- 이번 배포에서 신규 유료 품질평가, 영상 분석 재실행, 자료 게시, 파인튜닝은 실행하지 않는다.

## 운영 확인 결과

- `/api/deployment`가 application `hanmadi-admin`, revision `9d6b1dbe0b9609be4c1cce26da810a334f57dc32`를 반환했다. 소스 동일성 및 rubric v10 확인과 함께 운영 반영을 검증했다.
- 2026-10-03 15:07:04 KST에 기존 승인 PIN으로 owner 로그인 200, 인증된 관리자 API·페이지 200, 로그아웃 200을 확인했다. 비로그인 관리자 API 403, 학습 API 404, 로그인 페이지 200.
- 연결된 Chrome의 새 운영 탭에서 영상 찾기 화면과 자료 만들기 목록, 기존 카페 초안의 표현 5개, `검토 대기 / 버전 1`, 검수 전 게시 버튼 비활성화를 확인했다. 해당 탭의 브라우저 오류 로그는 0건이었다.
- 이전 검증 초안 `c60788a0-c91d-40c7-8fa6-a128ff878a7c`의 `status=draft`, rubric v9, `requiresHumanReview=true`, 표현 5개 및 `updatedAt=1790985766192`가 그대로임을 별도 API 조회로 대조했다. 기존 자료를 v10 결과로 덮어쓰지 않았다.
- Vercel production에서 06:04:16 UTC 이후 오류 수준 로그 조회 성공(exit 0), 반환 오류 기록 0건. 관측 범위의 결과이며 미래의 무오류나 모델 판정의 정확성 보장은 아니다.
- JEV 담당 세션도 읽기 전용으로 GitOps SUCCESS와 운영 revision 일치를 독립 확인했다. 구현·머지·배포의 중복 실행은 없었다.

v10의 잘못된 참조 격리·의미 비교 경로는 기록 재생과 회귀 테스트로 검증했다. 이번 배포 이후 유료 모델을 새로 호출해 개선된 의미 판정 정확도를 측정한 것은 아니다. 새로 분석하는 자료부터 v10을 사용하며, 기존 초안의 재평가와 독음 대응 문제 보완은 별도 작업이다.

## 증적 위치

- 프로젝트 기록: `/Users/admin/workSpace/commerce-automation-kit/docs/qa/20261003-hanmadi-jev-v10-release.md`.
- 비밀정보 없는 운영 결과: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/hanmadi-admin/jev-v10-release-20261003/`.
- `production-verification.json`: 정확한 운영 SHA·로그인·권한 경계·기존 초안 보존·로그아웃.
- `runtime-error-scan.json`: 오류 로그 조회 성공 여부·기간·건수. 인증정보나 원문 로그를 저장하지 않았다.
