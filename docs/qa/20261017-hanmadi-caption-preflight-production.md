# Hanmadi 자막 사전 확인 관리자 운영 배포 — 2026-10-17

## 범위와 상태

사용자의 자막 확보 흐름 보완 요청과 PR #289 머지 후 “계속” 요청에 따라 기존 GitOps 경로로 관리자 운영 배포를 완료했다. 정확한 운영 리비전·접근 경계와 로그인된 실제 화면에서 사전 안내·가져오기 차단·파일 입력 이동을 확인했다.

- 기능 PR: https://github.com/hhj4861/commerce-automation-kit/pull/289
- 검증 기능 SHA: `7b91a3e047e9b475120b9b21f7f10f1e17cfbd36`
- main: `08922ab08901e0640d1218ac490a75937b59479b` (PR #289, 2026-10-16 11:33:45 UTC)
- 관리자 승격: https://github.com/hhj4861/commerce-automation-kit/pull/291
- 대상: `deploy/hanmadi-admin` → `dean-10` / `hanmadi-admin` / `admin`
- 운영: https://hanmadi-admin.vercel.app/study/admin

## 사전 검증

기능 PR CI 6종 통과, 로컬 단위 290개·변경 lint·production build·전체 타입 검사 및 실제 Next 원문/음악 전체 E2E 통과. 원문 E2E는 미연결 자막 POST 0건·파일 등록·자동 저장 방지를 확인했다. 외부 공급자 응답은 fixture이며 유료 실호출은 없다. 상세는 `docs/qa/20261016-hanmadi-caption-preflight.md`.

운영 승격 대상과 기능 SHA 사이의 관리자 런타임·배포·credential-broker 코드는 일치했다. 추가 차이는 Flutter E2E 스크립트이며 학습 앱 배포를 실행하지 않는다.

## 배포 전 운영

- 관리자: `ab32d88cc9634559f5ac9e9a448604f3376414bb`, 200.
- 학습 앱: `a47ba0fbb57f51732bc5c46a1b1b43c1a74fa3f7`, 200.
- 기존 로그인 세션으로 관리자 영상 찾기 화면 접근 가능.

## 배포 후 확인

- 승격 PR #291: 모든 실행된 CI가 통과하고 CLEAN·MERGEABLE 상태에서 정상 머지. study E2E 9분 5초, 웹/iOS/Android·GitOps·렌더·카드뉴스 회귀 통과. 비관련 digest·reels는 skipped. main study도 9분 2초로 통과했다.
- 운영 승격 SHA: `bf35d7cdccad994498e097008c526d8edde32210`, 2026-10-16 23:08:55 UTC (10-17 08:08:55 KST).
- 배포: https://github.com/hhj4861/commerce-automation-kit/actions/runs/38979839695 , success.
- 배포 job: 23:09:21~23:10:56 UTC. workflow 완료 23:10:57 UTC (10-17 08:10:57 KST).
- Vercel 배포 URL: https://hanmadi-admin-3nezyxwis-dean-10.vercel.app
- 실제 운영 승격 코드와 기능 SHA 차이도 재확인했다. 관리자 런타임·배포·broker는 동일하며 추가 차이는 Flutter E2E 스크립트뿐이다.

### HTTP (23:11:33 UTC)

| 대상 | 결과 |
|---|---|
| 관리자 `/api/deployment` | 200, application=hanmadi-admin, revision=bf35d7cdccad994498e097008c526d8edde32210 |
| `/admin-login` | 200 |
| 비로그인 `/api/study/admin/media` | 403 |
| 관리자 `/api/study` | 404 |
| 학습 앱 `/api/deployment` | 200, application=hanmadi, 배포 전후 모두 a47ba0fbb57f51732bc5c46a1b1b43c1a74fa3f7 |

### 로그인된 운영 화면

- 새로고침 후 초기 ‘자막 연결 상태 확인 중’에서 조회 완료 뒤 ‘현재는 자막 파일로 준비할 수 있어요’로 바뀌었다. 채널 미연결, 필요한 파일 형식, 수집만으로 자막을 확보하지 않음이 검색 전에 표시됐다.
- 원문·작업에서 사용자가 이미 등록한 일본어 음악 원본 1건을 조회했다. 원문 버전 0, 음악 용도, 원문 필요 상태였다.
- 상세에서 ‘YouTube 직접 가져오기 사용 불가’와 파일 등록 안내가 먼저 표시됐다.
- ‘YouTube 자막 가져오기’를 펼쳤을 때 ‘YouTube 자막 확인’ 버튼이 **disabled**로 표시됐다. 실패하는 자막 POST를 실행하지 않았다.
- ‘원문 파일 등록 위치로 이동’을 눌렀을 때 실제 파일 입력에 초점이 이동했다. 파일 선택·업로드·저장은 하지 않았다.
- 현황 초안 2·게시 0·번역 대기 0. 원문 버전은 0으로 유지됐고 생성·평가·게시·삭제·진단·학습을 실행하지 않았다. 운영 검색 호출도 새로 하지 않았다.
- 관리자 탭은 원문 상세에 열어 두었다.

## 증거 범위와 제한

HTTP 결과는 사용자 지정 iCloud 작업 루트 `commerce-automation-kit/20261017-caption-preflight-rollout/production-checks.json`에 저장했다. 로그인된 UI·비활성 버튼·파일 초점 이동은 브라우저에서 직접 확인했다. 운영 캡처 파일 저장을 완료했다고 주장하지 않는다. 기존 Vercel MCP 팀 접근 제약 때문에 런타임 전체 로그/드레인은 조회하지 않았다.

이 배포는 자막 확보 조건을 사전에 안내하고 불가능한 요청을 차단하는 보완이다. 자동 다운로드 가능한 영상만 검색하는 필터·새 채널 인증·임의 공개 자막 확보를 구현한 것은 아니다. 실제 채널 자격과 영상 수정 권한이 없는 상황에서는 권한 있는 원문 파일을 준비해야 한다. 운영 데이터·인증·공급자 설정은 변경하지 않았다.
