# Hanmadi 관리자 UI/UX 운영 배포 — 2026-10-15

## 결과

사용자의 “머지하고 배포해줘” 승인으로 UI/UX 구현 PR #278과 관리자 운영 승격 PR #279를 머지하고, 보호된 GitOps 경로로 관리자 운영 배포를 완료했다. 로그인된 운영 화면에서 새 업무 탐색과 기존 도구 접근을 확인했다.

- 구현 PR: https://github.com/hhj4861/commerce-automation-kit/pull/278
- 검증한 구현 커밋: `5d1299ea8898e17b0462fca1278da0423e894e19`
- main 머지: `661197042cf9f62dc29a09ae40fb4136630af3f2` (12:39:56 UTC)
- 운영 승격 PR: https://github.com/hhj4861/commerce-automation-kit/pull/279
- 운영 커밋: `00e7ee9bfea882ca7aa9402b321913a3958816e2` (12:50:03 UTC)
- 대상: `dean-10` / `hanmadi-admin` / `admin` 모드
- 운영: https://hanmadi-admin.vercel.app/study/admin
- 배포 URL: https://hanmadi-admin-jngfxxqsl-dean-10.vercel.app
- 배포 실행: https://github.com/hhj4861/commerce-automation-kit/actions/runs/38737684984
- 배포 job: 12:50:26~12:52:05 UTC, success. workflow 완료 12:52:06 UTC.

## 반영 내용

여덟 개의 평면 메뉴를 콘텐츠 준비 / 검수·반영 / 학습 운영 세 업무로 묶었다. AI 진단은 상단 보조 도구다. 기존 기능은 해당 업무의 세부 메뉴에서 접근한다. 화면별 작업 안내, 실제 조회한 초안·게시·번역 대기 현황, 원문 목록/상세 배치, 모바일 선택 목록, 접는 원문 입력 폼, 공통 폼·상태·포커스 스타일을 정리했다.

## 배포 전 검증

구현 PR의 study·GitOps·Shopshorts 검사가 통과했다. 승격 PR에서도 실제 실행된 검사 모두 통과 후 CLEAN 상태에서 머지했다. 웹/iOS/Android 빌드, study 브라우저 회귀, GitOps, Shopshorts, 카드뉴스 테스트가 포함되며 비관련 digest는 skipped다.

로컬 검증은 단위 289개, 전체 타입 검사, 변경 lint, production build 및 실제 Next UI/API/파일 저장 E2E를 포함한다. 3개 업무/8개 도구, 1440·390·320px, 키보드와 대표 화면 200% 배치를 확인했다. 외부 AI 공급자는 fixture이며 실제 유료 학습 품질 검증은 아니다. 구현 커밋과 main의 `apps/hanmadi`, `ops/deploy`, 배포 workflow 및 credential-broker 코드 일치를 확인했다. 상세는 구현 QA `docs/qa/20261015-hanmadi-admin-workspace.md`를 따른다.

## 운영 확인

| 확인 대상 | 결과 |
|---|---|
| `/api/deployment` | 200, application=hanmadi-admin, revision=운영 커밋과 일치 |
| `/admin-login` | 200 |
| 비로그인 `/api/study/admin/media` | 403 |
| 관리자 호스트 `/api/study` | 404 |
| 로그인된 탐색 | 3개 업무 영역, 상단 AI 진단 표시 |
| 콘텐츠 준비 | 영상 찾기 화면 표시, 원문·작업 조회 완료, 원문 없음 상태·기존 음악 수집함 연결 표시 |
| 검수·반영 | 자료 만들기·번역 후보·앱 반영 확인 화면 접근 및 표시 |
| 학습 운영 | 학습 관리·음악 관리 조회 완료, 기존 Pretender 수집 정보 표시 |
| 영역 재진입 | 콘텐츠 준비를 다시 선택했을 때 마지막 원문·작업 화면 복원 |
| 현황 | 조회 완료 후 초안 2·게시 0·번역 대기 0 표시 |
| AI 진단 | 기존 언어별 기록 조회. 새 진단 실행 없음 |

AI 진단의 2026-10-15 09:36 KST 자동 실행 기록에는 태국어 내 말 변환 첫 응답 재생성에 따른 ‘주의 필요’가 있었다. 이는 이번 UI 배포 이전 기록이며, 새 유료 진단이나 품질 문제 수정을 수행했다고 보고하지 않는다.

이번 실행은 관리자만 배포했다. 운영 자료 생성·수정·삭제, 게시, 학습 활성화, 유료 모델 호출은 실행하지 않았다. 운영 읽기 검증과 로컬/CI의 쓰기 E2E를 구분한다.

학습 앱은 검사 전 `2f27da918b1fd04b869b835065551879c0af6eb7`에서 검사 시 `16f5045a75dacf4e539257460e27342f45adb4a0`으로 바뀌었다. 별도의 학습 앱 배포 실행 https://github.com/hhj4861/commerce-automation-kit/actions/runs/38736273702 (12:39:08 UTC 시작, success)과 revision이 일치한다. 이번 관리자 실행의 대상은 plan과 deploy(hanmadi-admin)뿐이므로 학습 앱 변경을 이번 실행의 결과나 ‘변경 없음’으로 기록하지 않는다.

## 증거 범위와 제한

운영 HTTP 검사·배포 URL은 지정 iCloud 작업 폴더 `commerce-automation-kit/20261015-admin-workspace/production-checks.json`에 저장했다. 로그인된 화면의 배치와 조회 완료를 브라우저에서 확인했다. 앞서 이 브라우저 도구의 iCloud 스크린샷 파일 저장이 EPERM으로 막혀 운영 캡처 파일 저장 완료는 주장하지 않는다. 로컬 반응형 캡처는 같은 작업 폴더의 `browser-reviewed/`에 있다.

Vercel MCP의 dean-10 조회는 기존 403 제약이 있고, 런타임 전체 오류 로그/드레인은 조회하지 않았다. 기존 프로젝트 전용 CI 자격을 이용하는 GitOps의 성공, 정확한 운영 revision, 접근 경계 및 로그인된 화면이 이번 운영 검증 범위다. 인증·권한을 변경하지 않았다.

공통 원문을 실제 수업/음악 자료 생성·검수·게시본에 연결하는 후속 기능은 별도다. 이번 배포를 자동 가사 확보·모델 학습 완료로 표현하지 않는다.
