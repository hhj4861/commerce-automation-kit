# Hanmadi 통합 콘텐츠 흐름 운영 배포 — 2026-10-16

## 현재 결과

사용자의 “머지하고 배포 해줘” 승인으로 기능 PR #284와 관리자 운영 승격 PR #286을 머지하고, 기존 보호된 GitOps 경로로 관리자 운영 배포를 완료했다. 정확한 운영 리비전과 접근 경계, 로그인된 관리자 화면의 새 공통 경로를 확인했다.

- 기능 PR: https://github.com/hhj4861/commerce-automation-kit/pull/284
- 검증한 기능 커밋: `3c34e7bc8dc1ccb3eefd0292f258d642b9b8a37b`
- main 머지: `6fda2bcf0c7d4ad1fd4a53937d57b7cfe973db17`, 2026-10-16 09:27:00 UTC
- 관리자 운영 승격 PR: https://github.com/hhj4861/commerce-automation-kit/pull/286
- 배포 대상: `deploy/hanmadi-admin` → `dean-10` / `hanmadi-admin` / `admin` 모드
- 운영 주소: https://hanmadi-admin.vercel.app/study/admin

## 반영 범위

회화와 음악 모두 `콘텐츠 준비 → 검수·반영 → 학습 운영`의 공통 경로를 사용한다. 영상 찾기에서 언어와 회화·음악 용도를 선택하고, 원문·작업에서 공통 원문과 자막을 준비한다. 회화 검수·음악 검수에서 초안을 만들고 사람이 검수·게시한다. 검색·모델 적용도 검수·반영에 있다. 학습 운영에는 게시 수업·게시 음악 관리·앱 반영 확인을 둔다.

동일 영상의 용도는 합쳐지고 기존 원문 버전과 작업 이력은 보존된다. 기존 음악 수집함은 원문·작업 내부 연결로 보존했다. 실제 자막 획득 권한이나 공급자 설정은 변경하지 않았다.

## 배포 전 검증

- 기능 PR CI 3종 통과: study(9분 7초), Platform GitOps verification, Shopshorts render verification.
- 단위 테스트 290개·전체 타입 검사·변경 lint·production build 통과.
- 원문·회화·음악 전체 흐름, 네 언어 학습자 흐름, 사람이 선택한 단위만 게시하는 검수 경로, 실패·재시도·목적 추가·언어 충돌·모바일 배치를 로컬/CI E2E로 확인했다. 외부 생성·검수는 fixture이며 실제 유료 공급자 품질 검증은 아니다.
- main과 검증한 기능 커밋의 `apps/hanmadi`, `ops/deploy`, 배포 workflow가 일치했다.
- 상세 구현 검증: `docs/qa/20261016-hanmadi-unified-content-flow.md`.

## 배포 전 운영 기준

- 관리자 `/api/deployment`: 200, `hanmadi-admin`, `00e7ee9bfea882ca7aa9402b321913a3958816e2`.
- 학습 앱 `/api/deployment`: 200, `hanmadi`, `69db975d14ebf9f6855f352fb88b6b0432a4a731`.
- 기존 관리자 로그인 세션으로 화면에 접근 가능함을 배포 전 확인했다.

## 운영 결과

- 승격 PR의 실행된 검사 모두 통과 후 CLEAN 상태에서 머지했다. GitOps·렌더·계약·카드뉴스·웹/iOS/Android 빌드와 study E2E(8분 52초)가 포함된다. 관련 없는 digest·reels 실행은 skipped다. main study도 8분 49초로 통과했다.
- 승격 머지: `ab32d88cc9634559f5ac9e9a448604f3376414bb`, 2026-10-16 09:38:10 UTC.
- 배포 실행: https://github.com/hhj4861/commerce-automation-kit/actions/runs/38881810307
- 배포 URL: https://hanmadi-admin-aez173m7g-dean-10.vercel.app
- 배포 job: 09:38:33~09:40:18 UTC, success. workflow 완료 09:40:19 UTC.
- 실제 운영 승격 커밋의 앱·배포·credential-broker 코드가 검증한 기능 커밋과 일치했다.

### 운영 HTTP 확인 (09:41:22 UTC)

| 대상 | 결과 |
|---|---|
| 관리자 `/api/deployment` | 200, `hanmadi-admin`, revision=`ab32d88cc9634559f5ac9e9a448604f3376414bb` |
| `/admin-login` | 200 |
| 비로그인 `/api/study/admin/media` | 403 |
| 관리자 `/api/study` | 404 |
| 학습 앱 `/api/deployment` | 200, `hanmadi`, 배포 전후 모두 `69db975d14ebf9f6855f352fb88b6b0432a4a731` |

### 로그인된 운영 화면 확인

- 새로고침 후 콘텐츠 준비 / 검수·반영 / 학습 운영 세 영역이 표시됐다.
- 영상 찾기: 공통 준비함, 네 언어, 회화·음악·양쪽 용도 선택 및 주소·원문 등록 연결을 확인했다. 초기 로딩 뒤 검색 입력과 선택 컨트롤이 활성화됐다.
- 원문·작업: 조회 완료 후 공통 원문 0건 안내, 원본 등록, 기존 음악 수집함 연결을 확인했다.
- 검수·반영: 회화 검수 / 음악 검수 / 검색·모델 적용 메뉴. 회화에는 기존 검토 대기 초안 2건과 콘텐츠 준비 연결, 음악에는 준비 원문을 이용한 생성·검수 안내가 표시됐다.
- 학습 운영: 게시 수업 / 음악 관리 / 앱 반영 확인 메뉴. 게시 수업 없음, 게시 음악 0곡이며 준비·검수 이동 연결이 표시됐다. 앱 반영 확인 화면도 열었다. 새 검색/임베딩 확인은 실행하지 않았다.
- 현황: 초안 2, 게시 0, 번역 검토 대기 0. 운영 자료를 추가·변경·삭제하거나 게시·내리기·생성·진단·학습을 실행하지 않았다.
- 콘텐츠 준비 재진입 시 마지막 원문·작업 화면이 복원됐고, 마지막에는 영상 찾기 화면을 열어 두었다.

## 증거 범위

비밀 없는 HTTP 결과는 사용자 지정 iCloud 작업 루트의 `commerce-automation-kit/20261016-unified-content-flow/production-checks.json`에 저장했다. 운영 브라우저 조회와 로컬/CI의 쓰기 E2E를 구분한다. 운영 캡처 파일 저장 완료나 실제 유료 공급자의 생성·검수 품질 통과를 주장하지 않는다. Vercel MCP의 기존 팀 접근 제약 때문에 런타임 전체 오류 로그/드레인은 조회하지 않았으며, 기존 프로젝트 전용 CI 자격을 통한 배포 성공·정확한 운영 커밋·접근 경계·실제 화면이 운영 검증 범위다.

이번 GitOps 실행의 대상은 관리자 하나이며 학습 앱·VM·shared-ai 설정 및 인증은 변경하지 않았다. 자동 가사 확보, 음정·리듬 평가, 새 유료 모델 학습은 이번 UI 흐름 통합 배포의 범위가 아니다.
