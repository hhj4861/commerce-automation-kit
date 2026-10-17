# Hanmadi 콘텐츠 준비 개선 운영 배포 기록

확인일: 2026-10-17. 범위: PR #294 관리자 콘텐츠 준비 개선. 사용자 요청: “머지하고 배포해줘”.

## 현재 상태

- 구현 PR [#294](https://github.com/hhj4861/commerce-automation-kit/pull/294): main 머지 완료, `d09525aa6fa7ac274891ca514a6a476f353ddec1`, 2026-10-17T08:52:28Z.
- 검증된 구현 HEAD: `cdd910147c015dc8983ee45fcfe0214ba1993eb2`. 구현 CI 3개 성공, 로컬 단위 테스트 291개·lint·type/build 및 원문/음악 수집 E2E 통과. 외부 YouTube·AI는 fixture이므로 실제 자막 공급자 통과 증거와 구분한다.
- 관리자 운영 승격 PR [#298](https://github.com/hhj4861/commerce-automation-kit/pull/298): `release/hanmadi-content-preparation-20261017` → `deploy/hanmadi-admin`, head `d09525aa6fa7ac274891ca514a6a476f353ddec1`, 승인 구현 관련 11개 파일만 포함. CI 모두 통과 후 2026-10-17T09:04:56Z 머지 완료. 운영 승격 merge SHA: `3492bb6b7133d1e306490a36f228fb279153fe89`. 자동 운영 배포와 공개 버전·접근 경계·관리자 UI 검증 완료.
- PR #296(main → deploy/hanmadi-admin)은 다른 세션 PR #293 Flutter 학습앱 변경이 main에 합쳐진 것을 확인해 머지하지 않고 닫았다. 해당 변경과 다른 세션 PR #297은 보존한다.

## 배포 대상과 확인 기준

- 기존 GitOps `Platform deployment`를 사용한다. 관리자 프로젝트 `prj_nAbFTwdgyPZkwhJOcyZ73hWiEoKE`, 팀 `team_RUHKd04LgBmYVYUwwRTJlW8b`, 배포 모드 `admin`.
- 운영 관리자: https://hanmadi-admin.vercel.app/study/admin
- 배포 전 관리자 공개 revision: `bf35d7cdccad994498e097008c526d8edde32210`, `/api/deployment` HTTP 200.
- 배포 전 학습앱 revision: `a47ba0fbb57f51732bc5c46a1b1b43c1a74fa3f7`, `/api/deployment` HTTP 200. 본 작업은 학습앱 배포를 실행하지 않는다.
- 승격 머지 후 발생하는 새 merge SHA와 운영 `/api/deployment` revision 일치, workflow 성공, 관리자 로그인/익명 API 차단/학습앱 API 격리, 로그인된 관리자에서 상태 필터·입력 유지·잘못된 작업 방지를 확인한다.

## 운영 데이터 보호와 한계

환경변수·인증·권한·브랜치 보호를 변경하지 않는다. 기존 콘텐츠의 원문 저장·생성·검수·게시·삭제 및 유료 AI 호출은 수행하지 않는다. 실제 수집곡은 일본어 음악 원본 1개이고 원문 버전은 0개이므로, 해당 곡 자막 확보·학습 게시가 완료된 것으로 보고하지 않는다.

## 증거 위치

- 구현 기록: `docs/tasks/20261017-hanmadi-content-preparation-ux.md` (구현 브랜치/main).
- 배포 전후 공개 상태와 비밀값 없는 로그: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261017-content-preparation-rollout/`.
- 이 문서는 배포 완료 후 실제 확인 결과를 기록한다.

## 운영 승격 검증

- 배포 PR 검사: GitOps 18초, render 1분57초, 사용자 여정 study 7분54초 성공. 동일 head의 main study도 9분1초 성공.
- 배포 commit `3492bb6b7133d1e306490a36f228fb279153fe89`의 `apps/hanmadi`, `packages/litellm-client`, `ops/deploy`, `.github/workflows/platform-deploy.yml`은 구현 검증 HEAD `cdd9101`과 `git diff --exit-code` 일치.
- 자동 운영 배포: [Platform deployment #39019768079](https://github.com/hhj4861/commerce-automation-kit/actions/runs/39019768079), triggering SHA `3492bb6b7133d1e306490a36f228fb279153fe89`.

## 실제 운영 결과

- 배포 workflow 성공. 관리자 deploy job: 2026-10-17T09:05:17Z 시작, **2026-10-17T09:06:35Z 완료**.
- 고유 배포 URL: https://hanmadi-admin-1dcm662dq-dean-10.vercel.app
- 운영 alias: https://hanmadi-admin.vercel.app
- 2026-10-17T09:08:26Z 공개 확인: `/api/deployment` HTTP 200, application `hanmadi-admin`, revision `3492bb6b7133d1e306490a36f228fb279153fe89` 일치.
- `/admin-login` HTTP 200·관리자 제목 확인, 익명 `/api/study/admin` HTTP 403, 관리자에서 학습용 `/api/study` HTTP 404. 기존 GitOps 자체 운영 검증도 성공.
- 학습앱 공개 revision은 배포 전후 모두 `a47ba0fbb57f51732bc5c46a1b1b43c1a74fa3f7`. 본 세션은 관리자만 배포했다.

### 로그인된 운영 화면 확인

기존 로그인된 관리자 탭을 새로고침해 확인했다. 인증정보를 추출하거나 저장하지 않았다.

1. 영상 찾기: ‘원문 확보 방법’ 선택과 ‘이 페이지의 원문 준비 완료만’ 필터가 표시된다. 채널 미연결 안내가 나타나고 연결 채널 권한 확인 옵션은 비활성화된다. 선택 영상 0개에서 준비함 담기가 비활성화된다. 이 검증에서는 새 YouTube 검색을 실행하지 않았다.
2. 원문·작업: 준비 완료 0개·확보/정리 대기 1개, 기존 일본어 원본은 ‘원문 확보 대기’·원문 버전 0으로 표시된다. 준비 완료 필터는 빈 결과를 보여주고 전체 원본으로 되돌리면 기존 1개가 다시 보인다.
3. 기존 원본 선택: 채널 직접 가져오기 사용 불가와 파일 등록 안내가 표시된다. 권한 확인·이용 근거가 없는 상태에서 원문 저장은 비활성화되고, 정리된 원문이 없으므로 음악 자료 만들기도 비활성화된다.
4. 원문 필드에 자체 QA 문장 두 줄을 저장하지 않고 입력 → 영상 찾기 → 원문·작업 복귀 후 원본 선택과 두 줄 입력 유지 확인. 확인 후 입력을 빈 값으로 복구했다. 저장·생성·평가·게시·삭제 버튼은 실행하지 않았다. 원문 버전 0, 초안 2, 게시 0, 번역 검토 대기 0이 유지됐다.
5. 화면 레이아웃은 스크린샷으로 관찰했다. 스크린샷 파일의 영구 저장 증거는 없으며 저장했다고 보고하지 않는다.

### 검증 범위의 한계

운영에서 실제 외부 자막 가져오기·실제 곡 가사 확보·AI 자료 생성·게시·사용자 학습까지는 수행하지 않았다. 이번 변경은 원문 준비 상태와 다음 작업 안내, 편집 상태 보존 개선이다. 실제 음악 자막은 허용된 파일 또는 영상 수정 권한이 확인된 채널 경로로 확보해야 한다. 가사 시간 편집기의 숨김 시 플레이어 해제와 입력 보존은 구현 E2E 및 CI로 확인했고, 운영에서 타이밍 편집·외부 재생을 추가 수행하지 않았다. 전체 Vercel 런타임 로그·log drain 상태를 감사한 것으로 주장하지 않는다.

비밀값 없는 증거: `before.json`, `post.json`, `deployment-summary.log` (위 산출물 폴더). 배포 로그에서 URL·revision 확인 줄만 추려 보관했다. 키·토큰·쿠키·사용자 원문은 포함하지 않는다.
