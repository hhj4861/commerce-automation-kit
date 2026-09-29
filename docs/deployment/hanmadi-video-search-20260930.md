# Hanmadi 영상 검색 운영 배포 — 2026-09-30

사용자가 PR #78 머지를 승인한 뒤 운영 배포를 요청했다. **운영 배포와 실제 브라우저 검증을 완료했다.**

## 배포 결과

| 항목 | 확인값 |
|---|---|
| 관리자 | https://hanmadi-lake.vercel.app/study/admin |
| 학습 앱 | https://hanmadi-lake.vercel.app/study |
| Target / Status | production / READY |
| 소스 | main `159ed386167768d748942cfd469e34b888326a19` |
| Vercel deployment | `dpl_EPHVwkUV6PDnRZbFV2gc8VsG5JwE` |
| 고유 배포 URL | https://hanmadi-gr1gcai0d-dean-10.vercel.app |
| 생성 시각 | 2026-09-30 07:23:13 KST |
| 프레임워크 | Next.js 16.3.6 |
| 빌드 시간 | 20초, post-build 21초 (`vercel inspect`) |

[Vercel 배포 상세](https://vercel.com/dean-10/hanmadi/EPHVwkUV6PDnRZbFV2gc8VsG5JwE)

`hanmadi-lake.vercel.app`와 `hanmadi-dean-10.vercel.app` 두 운영 별칭이 위 deployment를 가리키는 것을 확인했다. 직전 운영 deployment는 `dpl_7PjUqt9DdZfGDN3YezVMvMHoK2h5` (`hanmadi-qr4c67jjb-dean-10.vercel.app`)였다.

## 반영 범위와 배포 방법

- [PR #78](https://github.com/hhj4861/commerce-automation-kit/pull/78): 영상 검색 결과 5개씩 페이지 이동, 페이지 전체 선택, 페이지 간 선택 유지, 영상별 자료 준비 목록, 반응형 관리자 화면.
- 배포한 main에는 이미 머지된 [PR #79](https://github.com/hhj4861/commerce-automation-kit/pull/79)의 AI 대화 연속성 수정도 포함된다.
- 배포 전 각 PR의 CI 5개 성공을 확인했다. PR #78의 단위 테스트 72개, lint, 운영 빌드와 전체 브라우저 E2E도 통과한 상태였다.
- 깨끗한 별도 배포 worktree에서 위 main 커밋을 Vercel CLI 60.1.3으로 직접 배포했다. `sourceCommit` 메타데이터에 같은 SHA를 지정했다.
- production 설정을 조회한 뒤 Vercel 서버에서 원격 빌드했다. 민감한 환경변수 20개는 로컬 pull에서 실제 값 대신 `[SENSITIVE]`로 제공되므로, 이 자리표시자로 로컬 운영 빌드를 만들지 않았다. Vercel의 기존 production Secret을 사용했고 새 인증정보를 발급·복사하지 않았다.
- 운영 데이터 마이그레이션이나 LiteLLM 서버 배포는 수행하지 않았다. 기존 방화벽 설정은 유지하고, `/api/study`가 허용된 운영 별칭에서 검증했다. 고유 deployment URL의 study API는 허용 목록에 추가하지 않았다.

## 실제 운영 검증

모의 검색 응답 없이 Chrome/Playwright로 운영 주소에서 확인했다.

1. 미인증 관리자 검색은 HTTP 403, 기존 소유자 로그인과 관리자 데이터 조회는 HTTP 200.
2. 공식 YouTube 검색 첫 페이지 5개, 다음 페이지 5개를 받았다. 두 번째 요청에는 첫 응답의 페이지 토큰을 사용했다.
3. 각 페이지 전체 선택으로 준비 목록에 영상 10개가 모이고, 이전/다음 페이지로 돌아가도 선택을 유지했다. 이미 읽은 페이지로 이동할 때는 추가 검색 요청이 없었다(전체 공식 검색 요청 2회).
4. 준비 목록에서 자료 만들기를 누르면 영상 제목과 URL이 편집기로 전달됐다. 원문과 사용권 근거는 비어 있고, 원문 없이 AI 초안을 생성하는 버튼은 비활성 상태였다. 검증 중 콘텐츠 생성·저장·게시를 하지 않았다.
5. 화면 너비 320 / 390 / 768 / 1440px에서 가로 넘침이 없었다. 모바일 준비 목록 바로가기와 데스크톱·모바일 스크린샷을 확인했다.
6. 브라우저 런타임 오류와 실패한 네트워크 요청은 각각 0건이었다.

스크린샷은 로컬 검증용 `/private/tmp/hanmadi-production-20260930/video-search-1440.png`, `video-search-390.png`에 있다. 임시 파일이며 공개 산출물이나 Git 저장 파일은 아니다.

## 배포 후 관측 및 남은 별도 작업

- 새 deployment의 직전 15분 오류 레벨 로그 조회: **0건**. 이 결과는 검증 시점에 한정한다.
- 지속 모니터링과 외부 log drain 설정 여부는 이번 배포에서 확인하지 않았다.
- `deploy/hanmadi` 원격 브랜치는 아직 없고 GitOps 자동 배포 자격 연결도 활성화되지 않았다. 이번 성공은 **기존 Vercel 경로를 통한 직접 운영 배포**다. 자동 배포 완료로 해석하지 않는다.
- 자동 배포 인계와 자격 연결 조건은 [이전 운영 기록](./hanmadi-knowledge-20260929.md) 및 [공용 GitOps 가이드](https://github.com/hhj4861/commerce-automation-kit/blob/main/docs/deployment/platform-gitops.md)를 따른다.
