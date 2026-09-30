# 그림 중심 자동제작 운영 반영 — 2026-09-30

사용자의 “운영반영해줘” 승인에 따라 PR #83을 머지하고 운영 Pages와 기존 계정·제작 워커를 함께 갱신했다.

## 적용된 버전

- PR: https://github.com/hhj4861/commerce-automation-kit/pull/83
- 머지 SHA: `f90e061a26d0db46d9e60f5f94c65fba12cbf498`
- 운영: https://shopshorts-dash.pages.dev/studio/dashboard?mode=auto
- Pages 배포: https://6958da02.shopshorts-dash.pages.dev
- 배포 ID: `6958da02-15bd-4717-bbf3-aafac300a758`
- Cloudflare 공식 API: `environment=production`, `latest_stage.status=success`, `branch=main`, commit SHA 일치. 완료 시각 `2026-09-30T04:26:32.716502Z`.
- 영구 워커 checkout: `/Users/admin/workSpace/shopshorts-production`, 같은 SHA의 detached checkout. 기존 `.plist`와 중앙 인증 유지.
- 서비스 `com.cak.llm-accounts` PID 37839, `com.cak.studio-production` PID 37842의 `running` 상태 확인. PID는 확인 시점 값이다.

## 검증

재시작 전 계정·제작 큐가 모두 비어 있음을 확인했다. 서비스를 정상 중지하고 Git checkout, `npm ci --no-audit --no-fund`로 의존성 설치 후 운영 checkout에서 `npm test -w @cak/app-shopshorts`를 실행해 **305 통과, 0 실패**를 확인했다. 서비스 설정·키·시크릿은 변경하지 않았다. DB 스키마 변경도 없었다.

Wrangler 4.143.0은 Node 22 이상을 요구하므로 npm의 임시 Node 22 실행 환경에서 기존 로그인으로 배포했다. 운영 워커 Node 20 설정은 유지했다. 필요한 Pages 쓰기 권한은 이미 있었다. 새로운 OAuth 권한 승인은 요청하지 않았다.

운영 자동제작 JS와 CSS는 기존 인증을 사용한 HTTP 200 응답 바이트가 배포 checkout의 파일과 정확히 일치했다. 비인증 요청은 로그인 HTML로 리다이렉트되므로 자산 배포 실패로 판정하지 않았다.

운영 `/api/studio/config`: HTTP 200, `workerAt=2026-09-30T04:27:55.602Z`, 확인 시 10.088초 전. 계정 실행기는 `available=true`, `scenarioAvailable=true`. 서비스용 인증의 connected 값과 실제 로그인 사용자의 연결 값은 서로 다른 소유자이므로 혼동하지 않는다.

로그인된 Chrome에서 운영 주소를 열어 다음 항목을 확인했다.

- 주제 하나로, 완성 영상까지 / 카테고리 → 주제 추천 → 자료 확인 → 대본 → 영상·음성 → 완성
- 설명 애니메이션: 캐릭터와 사물의 움직임으로 쉽게
- 시네마틱 영상: Higgsfield로 만드는 실사·일러스트
- Yooni, 숏폼 1.15배속, 가운데 자막 기본값
- 기존 사용자 프로젝트 목록 보존, Codex 연결 표시

새 운영 유료 생성·사용자 프로젝트 변경·업로드는 실행하지 않았다. 실제 MP4 합성·재생 E2E는 PR #83의 로컬 제공자 fixture 검증이며 운영 실생성으로 표현하지 않는다.

## 남은 사항

좌측 공통 “워커 오프라인 / 작업은 워커 연결까지 대기합니다” 표시는 `public/index.html`의 `/api/jobs` 결과를 사용한다. 이 API는 `meta.worker_heartbeat`(구형 쇼핑 작업 워커)를 읽는다. 새 제작 워커는 `meta.studio_worker`에 heartbeat를 쓰고 `/api/studio/config`가 이를 읽는다. 따라서 현재 공통 배지가 새 제작 워커의 실제 연결 상태를 대표하지 못하는 기존 표시 문제가 남아 있다. 이를 숨기려고 구형 워커를 임의 실행하거나 heartbeat 값을 조작하지 않았다.

이번에는 기존 Direct Upload 운영 브랜치 `main`으로 명시 배포했다. `deploy/shopshorts` 기반 자동 배포 활성화 완료를 의미하지 않는다. 다른 플랫폼과 credential broker는 배포하지 않았다.

기존 task-finish의 과거 실행 종료 기록 누락은 이 운영 배포의 성공 여부와 별개이며, 과거 성공으로 복구하지 않았다.
