# Hanmadi 원문 확보 계획 — 머지·관리자 운영 배포

확인일: 2026-10-20. 사용자 요청: “머지하고 배포 해줘”. 범위: PR #299의 원문 확보 계획 저장·복원. **main 머지·관리자 운영 배포·공개 및 로그인 화면 확인 완료**.

## 구현 머지와 배포 범위

- [PR #299](https://github.com/hhj4861/commerce-automation-kit/pull/299) main 머지 완료: `b3e751030c42e57594211aa9a2fb757d5a36b698`, 2026-10-20T02:27:06Z. 검증한 구현 head: `beffb2fdf158f4f5fabd59ebf974d43bf4a002d8`.
- 구현 CI6개 모두 통과. 단위 294개, production build, 네 언어 원문 E2E 및 기존 음악 흐름 fixture 회귀 통과. 실제 외부 곡 가사 공급·실가창 검증과는 구분한다.
- 현재 관리자 운영 이력 `3492bb6b7133d1e306490a36f228fb279153fe89`에 구현 커밋 1개만 cherry-pick했다. 릴리스 브랜치 `release/hanmadi-acquisition-plan-20261020`, 후보 `441afbe`. 관리자 API/컴포넌트/lib·package/lockfile·litellm-client·ops/deploy·배포 workflow는 검증한 구현과 diff 없음. 관리자에 기존 Flutter용 E2E 스크립트는 보존했다.
- 관리자 대상: Vercel `prj_nAbFTwdgyPZkwhJOcyZ73hWiEoKE`, 팀 `team_RUHKd04LgBmYVYUwwRTJlW8b`, `deploy/hanmadi-admin` → https://hanmadi-admin.vercel.app . 기존 보호 브랜치·OIDC 자격 전달·GitOps workflow를 사용한다.
- 학습앱 배포·환경변수·자격·권한·브랜치 보호 변경은 수행하지 않는다. 운영 콘텐츠의 생성·원문 저장·검수·게시·삭제 및 유료 호출도 수행하지 않는다.

## 배포 전 읽기 확인

2026-10-20T02:27:38Z 두 공개 `/api/deployment` 모두 HTTP200.

- 관리자: `3492bb6b7133d1e306490a36f228fb279153fe89`.
- 학습앱: `b2dec66de8e6b5aa97e13f3de7add24b18aa0a81`.

기존 Chrome 개인 프로필에서 관리자 로그인 세션으로 접근했다. 인증정보는 추출·저장하지 않는다. 운영 화면 검증은 배포 완료 후 읽기·메뉴 탐색으로 진행한다. 실제 계획 저장·재방문 영속성은 격리 저장소의 E2E와 CI 증거를 사용하며 운영 자료를 변경해 재시험하지 않는다.

## 증거 위치와 완료 기준

- 구현 기록: `docs/tasks/20261018-hanmadi-acquisition-plan.md` (PR #299/main).
- 이번 공개 상태·배포 로그 요약: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261020-acquisition-plan-rollout/`.
- 완료 기준: 승격 CI 통과→배포 workflow success→공개 관리자 revision 정확히 일치→익명/앱 경계 검사→로그인된 운영에서 확보 방법 표시·편집 폼·기존 상태 보존 확인. 실제 곡 가사 확보·학습 게시가 완료된 것으로 확대하지 않는다.

## 승격 PR과 사전 화면 관찰

- [운영 승격 PR #300](https://github.com/hhj4861/commerce-automation-kit/pull/300): head `441afbe0f38f44676d5515e3f017a3dfb1928a84`, `release/hanmadi-acquisition-plan-20261020` → `deploy/hanmadi-admin`. 구현 관련 10개 파일만 포함함을 GitHub files로 확인했다. CI6개 모두 SUCCESS: study8분18초, web3분22초, Android5분49초, iOS3분40초, GitOps18초, render1분30초. 2026-10-20T02:38:35Z 머지 완료, 운영 merge SHA `b04ddb8ac9f75ea7cdf024b852c7cc849e171c73`.
- 운영 브랜치 `protected=true`, 필수 검사 `Platform GitOps verification` 유지 확인. 보호·인증 설정을 변경하지 않았다.
- 배포 전 로그인된 관리자: 준비 완료0·확보/정리 대기1, 기존 일본어 음악 원본1개·원문 버전0, 초안2·게시0·번역 검토 대기0. 기존 원문·게시물을 변경하지 않았다.
- 최초 native 브라우저 탭의 제어 연결이 소실됐고, 같은 Chrome 프로필의 지원되는 direct API로 복구했다. 일시적 DNS 실패 뒤 같은 주소 reload에서 관리자 화면이 정상 표시됐다. 별도 curl의 식별 API도 정상 응답했다. 도구/연결 오류를 제품 회귀로 기록하지 않는다.

## 자동 배포 실행

[Platform deployment #39360021021](https://github.com/hhj4861/commerce-automation-kit/actions/runs/39360021021), triggering SHA `b04ddb8ac9f75ea7cdf024b852c7cc849e171c73`. 승인한 실행 소스와 운영 merge commit의 관리자 app/components/lib·package/lockfile·litellm-client·ops/deploy·workflow가 diff 없음(exit0).

## 실제 운영 결과

- 자동 배포 workflow success, deploy job 2026-10-20T02:38:57Z~**02:40:24Z**(1분27초). 기존 GitOps의 배포 후 자체 검증도 성공했다.
- 운영 관리자: https://hanmadi-admin.vercel.app/study/admin
- 고유 배포: https://hanmadi-admin-dp4mixzhe-dean-10.vercel.app
- 2026-10-20T02:41:05Z 공개 `/api/deployment`: HTTP200, application `hanmadi-admin`, revision `b04ddb8ac9f75ea7cdf024b852c7cc849e171c73` 정확히 일치.
- `/admin-login` HTTP200·관리자 제목 확인, 익명 `/api/study/admin` HTTP403, 관리자에서 학습용 `/api/study` HTTP404.
- 학습앱 `/api/deployment` HTTP200, revision은 배포 전후 모두 `b2dec66de8e6b5aa97e13f3de7add24b18aa0a81`. 이 작업에서 학습앱 배포를 실행하지 않았다.
- 로그인된 관리자 새로고침 후 콘텐츠 준비→원문·작업→기존 일본어 원본 선택. 목록의 `0개 버전 · 확보 방법 미정`, 상세의 `저장한 방법: 확보 방법 미정`, 확보 방법 선택지(file/channel) 및 저장 폼 표시 확인. 기존 자료를 임의로 새 계획으로 이관하지 않는다.
- 준비 완료0·확보/정리 대기1, 원문 버전0·처리 작업 없음, 초안2·게시0·번역 검토 대기0 유지. 미확보 음악의 자료 생성과 근거/확인 없는 원문 저장은 비활성화 상태 유지. 실제 저장·수집·생성·검수·게시·삭제는 실행하지 않았다.
- 현재 관리자 탭에서 캡처된 error 로그 중 관리자 origin의 오류는 0개였다. 전체 서버 런타임 로그나 log drain 상태를 감사한 것은 아니다.
- 운영 화면은 screenshot으로 직접 관찰했으며 별도 캡처 파일 저장 증거는 없다. 관리자 결과 탭은 사용자 확인을 위해 열어 두었다.

## 검증 범위

확보 계획 저장→재방문 복원·편집 충돌·미저장 원문 보존은 실제 UI/API/격리 저장소의 구현 E2E 및 이번 승격 CI에서 검증했다. 운영에서는 배포 식별·접근 경계와 새 폼 표시·기존 자료 보존을 확인했다. 계획의 영속성을 재확인하려고 운영 원본의 계획을 변경하지 않았다. 실제 외부 자막/곡 가사 확보·게시·음악 학습 전체 성공은 이번 배포 검증에 포함하지 않는다.

안전한 산출물: `before.json`, `post.json`, `deployment.json`, `deployment-summary.log`. 자격·토큰·쿠키·원문은 저장하지 않았다.
