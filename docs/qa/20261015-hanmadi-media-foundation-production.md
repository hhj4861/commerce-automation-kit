# Hanmadi 공통 원문·작업 관리 운영 배포 — 2026-10-15

## 결과

사용자의 “머지하고 배포해줘” 승인으로 구현 PR #273과 관리자 운영 승격 PR #275를 머지했다. 기존 보호된 GitOps 경로로 관리자만 배포했고 운영 revision과 로그인된 화면을 확인했다.

- 구현: https://github.com/hhj4861/commerce-automation-kit/pull/273
- 구현 커밋: `58f2022b4c229dc797e033945554fcb0bc0e1612`
- main 머지: `2b4dfba6eed7351b3ca76e1ab3467b642f025e6d` (2026-10-15 09:35:51 UTC)
- 운영 승격: https://github.com/hhj4861/commerce-automation-kit/pull/275
- 운영 커밋: `b3792c86323b6bb06642eb941cd93fb6bc8d0c1a` (2026-10-15 11:49:00 UTC)
- 대상: `dean-10` / `hanmadi-admin` / `admin` 모드
- 운영: https://hanmadi-admin.vercel.app/study/admin
- 배포 URL: https://hanmadi-admin-o0kbtq2e7-dean-10.vercel.app
- 자동 배포: https://github.com/hhj4861/commerce-automation-kit/actions/runs/38730032650
- 배포 job: 11:49:19~11:50:59 UTC, success. workflow 11:51:00 UTC 완료.

## 검증

구현 PR의 검사 6개가 모두 통과했다. 승격 PR에서도 단위·타입·린트·build·새 원문 관리 및 기존 학습/음악 E2E, 웹/iOS/Android 빌드, GitOps 등 실행된 검사가 모두 통과했다. 비관련 digest job은 skipped다.

배포 전 구현 커밋과 main의 `apps/hanmadi` 및 `ops/deploy`가 일치함을 확인했다. 워크플로의 추가 차이는 Shopshorts일 때만 ffmpeg를 설치하는 조건부 단계이며 관리자 경로에는 적용되지 않는다.

운영 읽기 전용 확인:

| 대상 | 확인 |
|---|---|
| 관리자 `/api/deployment` | 200, `hanmadi-admin`, 운영 커밋과 일치 |
| `/admin-login` | 200 |
| 비로그인 `/api/study/admin/media` | 403 |
| 관리자 호스트 `/api/study` | 404 |
| 기존 로그인 관리자 화면 | 새 `원문·작업` 메뉴 표시·선택, 본문과 목록 로딩 완료, 오류 표시 없음 |
| 운영 저장소 조회 | 공통 원문은 아직 없고 기존 음악 수집함 연결 항목 표시 |
| 학습 앱 `/api/deployment` | 200, `hanmadi`, `2f27da918b1fd04b869b835065551879c0af6eb7` |

이번 실행은 `deploy/hanmadi-admin`만 배포했다. 학습 앱 배포 브랜치·공용 AI 서버·운영 환경변수·기존 학습 진도를 변경하지 않았다. 운영 원문 생성·수정·삭제나 외부 유료 호출도 수행하지 않았다. 원문 저장/실패/복구/삭제는 구현 QA의 로컬 및 CI E2E 증거다. 이번 운영 확인은 로그인된 조회/화면과 접근 경계 검증이며 운영 Redis 쓰기 E2E로 표현하지 않는다.

## 실패·해결·관측 범위

- 첫 승격 머지 명령은 CI 진행 중이라는 자동 승인 검토 사유로 실행 전 차단됐다. 모든 검사 통과·CLEAN 확인과 소스 비교 후 정상 머지했다. 보호/훅 우회 없음.
- Vercel MCP의 dean-10 프로젝트 조회가 403이었다. 로컬 Vercel CLI가 설치돼 있지 않아 CLI fallback은 사용할 수 없었고, 기존 GitOps의 프로젝트 전용 CI 자격으로 배포 성공을 확인했다. 인증·권한은 변경하지 않았다.
- 브라우저에서 운영 화면을 직접 확인했다. iCloud 경로로 스크린샷 파일 저장은 EPERM으로 실패해 저장 완료로 보고하지 않는다. 화면은 도구에서 확인했으며 다른 로컬 경로로 우회 저장하지 않았다.
- Vercel 런타임 전체 오류 로그/드레인은 MCP 권한 부족으로 조회하지 않았다. 배포 workflow의 운영 검증과 공개 응답·로그인된 화면 조회가 증거 범위다.

비밀값 없는 운영 HTTP 검사와 배포 URL은 지정 iCloud 작업 폴더의 `20261015-media-foundation/production-checks.json`에 저장했다. 구현·상세 테스트는 `docs/qa/20261015-hanmadi-media-foundation.md`를 따른다.

## 남은 기능

공통 원문을 실제 수업/음악 생성과 검수·게시본에 연결하는 작업은 아직 남아 있다. 이번 배포는 원문 버전 보관·정규화·작업 이력 관리까지이며 자동 가사 확보·가창 채점·유료 모델 학습 완료가 아니다.
