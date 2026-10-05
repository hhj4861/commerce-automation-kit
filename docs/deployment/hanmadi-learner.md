# Hanmadi 학습 앱 자동 배포

## 작업 카드 — 2026-10-05

- 목표: 보호된 `deploy/hanmadi`에 승인된 PR을 머지하면 학습 앱만 자동 배포하고 운영 로그인 준비 상태까지 확인한다.
- 담당·범위: 현재 Hanmadi 세션. 배포 도구, 학습 앱 대상 설정, broker 보호 조건, 관련 검증·문서. 학습 앱 기능·계정 데이터·관리자 자격은 변경하지 않는다.
- 기준 revision: main `cc7f079a6715e417482df610fbb35f538bfe89e2`.
- 완료 조건: 코드·CI 통과 → 해당 PR 승인·머지 → 전용 CI 자격과 보호 브랜치 연결 → 첫 Actions 배포 성공 및 실제 운영 확인.
- 현재 결과: [PR #149](https://github.com/hhj4861/commerce-automation-kit/pull/149)는 사용자 승인 후 main `3c3675218c4c1f6101824b97f78bcc24a60fedb9`에 머지됐다. 중앙 인증의 learner binding/ref 설정은 별도 후속 PR로 준비하며, 운영 자동 배포는 아직 활성화하지 않았다.
- 다음 행동: 후속 설정 PR을 검증·승인받고, 사용자가 브라우저 연결을 재개하면 전용 토큰 발급·중앙 등록과 브랜치 보호·첫 배포를 진행한다.

## 배포 대상과 흐름

| 항목 | 값 |
|---|---|
| 운영 브랜치 | `deploy/hanmadi` |
| 소스 | `apps/hanmadi` |
| Vercel 프로젝트 | `hanmadi` / `prj_xJ5tTXyMYNV6qL1fVnWxFBuIRoRf` |
| 운영 주소 | https://hanmadi-lake.vercel.app |
| 실행 모드 | `HANMADI_DEPLOYMENT=learner` |
| 중앙 CI 자격 | `CAK_DEPLOY_VERCEL_TOKEN`, 이 프로젝트만 허용하는 전용 토큰 |
| GitHub에 전달되는 키 | `DEPLOY_VERCEL_TOKEN` |

`main` 승인·머지 → `main`에서 `deploy/hanmadi`로 승격 PR → 승인·머지 → Platform deployment → GitHub OIDC로 중앙 자격 수신 → production 설정 이름 검사 → 앱 npm ci/test → Vercel production 원격 빌드 → 운영 검증 순서다.

학습 앱도 관리자와 동일한 원격 빌드 방식을 사용한다. 프로젝트 전용 토큰으로 팀 메타데이터를 읽는 `pull`을 호출하지 않으며 토큰 권한을 팀 전체로 넓히지 않는다. 프로젝트 ID를 명시하고 배포 모드와 release SHA를 빌드·런타임에 같이 전달한다. 운영 환경변수는 대상 Vercel 프로젝트의 production 설정을 사용한다. 토큰을 명령 인수·로그에 출력하지 않는다.

첫 브랜치 생성 자체는 배포를 실행하지 않는다. 브랜치는 PR 필수·`Platform GitOps verification` 필수·관리자 포함 보호·force push와 삭제 금지로 구성한다. broker도 정확한 learner ref의 `ref_protected=true`를 요구한다. 다른 저장소·ref·workflow·self-hosted runner에 학습 앱 키를 제공하지 않는다.

## 배포 전·후 검증

- 업로드 전에 production `AUTH_SECRET`, `TUTOR_PINS`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `HANMADI_GOOGLE_CLIENT_ID` 존재 여부만 확인한다. 값을 다운로드하거나 문서화하지 않는다. 기존 AI 공급자 설정은 그대로 사용한다.
- 배포 후 `/api/deployment`의 앱 이름 `hanmadi`와 triggering SHA가 일치해야 한다.
- 비로그인 `/study` 및 공개 `/privacy` 페이지가 실제 본문과 함께 HTTP 200이어야 한다.
- Google 준비 API가 `available=true`와 대상에 기록한 공개 클라이언트 ID를 반환해야 한다.
- 비로그인 관리자 API는 HTTP 403이어야 한다.
- 운영 확인 실패는 workflow 실패로 남긴다. 자동 롤백이나 실제 Google 계정 자동 로그인은 수행하지 않는다. 첫 전환 때는 실제 계정 로그인을 별도로 검증한다.
- probe는 공개 GET만 수행한다. 계정·단어장·학습 기록 생성 및 유료 AI 호출은 없다.

## 확인한 미완료 설정

2026-10-05 조회에서 원격 `deploy/hanmadi`는 404였고 관련 열린 PR은 없었다. 기존 broker 저장소 설정은 관리자 ref와 관리자 키만 등록돼 있었다. 현재 GitHub 인증은 push=true, admin=false다.

1. 학습 앱 전용 Vercel CI 토큰을 발급하고 기존 중앙 Secrets Store에 `CAK_DEPLOY_VERCEL_TOKEN`으로 등록한다. 다른 앱이나 대화형 CLI 토큰을 재사용하지 않는다. 토큰 값은 Git·채팅·로그·iCloud에 남기지 않는다.
2. 검토된 broker 설정에 `SS_DEPLOY_VERCEL_TOKEN` binding과 정확한 `refs/heads/deploy/hanmadi`만 추가한다. 기존 admin·Replay 설정과 다른 binding을 보존하고 broker를 별도로 배포한다.
3. 승인된 기준에서 배포 브랜치를 만들고 저장소 관리 권한으로 보호한다. 기존 `CAK_SECRETS_URL` 변수와 OIDC subject 설정을 확인한다.
4. 승인된 승격 PR을 머지해 첫 Actions 실행 URL·SHA·운영 URL·로그인 확인 증거를 남긴다.

이 문서·코드의 커밋은 토큰 발급, broker 배포, 브랜치 보호, PR 머지 또는 첫 자동 배포 성공을 뜻하지 않는다. 현재 운영 Google 로그인 완료 기록은 [2026-10-05 QA](https://github.com/hhj4861/commerce-automation-kit/blob/f2e7118e71f4d5d11f1776bd3923f772bf92b496/docs/qa/20261005-hanmadi-google-oauth-production.md)에 있다(독립 QA 문서는 프로젝트 작업 브랜치에 보관).

공식 근거: [프로젝트 범위 토큰](https://vercel.com/docs/rest-api/authentication/create-an-auth-token), [Vercel deploy](https://vercel.com/docs/cli/deploy). 프로젝트 전용 토큰의 pull 제한은 기존 관리자 검증과 [공식 CLI 이슈](https://github.com/vercel/vercel/issues/17506)를 참고한다.

## 검증 결과

- 첫 전체 회귀는 116개 중 115개 통과. 기존 broker HTTP 테스트의 learner fixture에 보호 브랜치 claim이 없어 403이 반환됐다. 새 보호 정책과 일치하도록 `ref_protected=true` fixture를 추가하고, false일 때 실제 broker 응답 403과 키 미노출을 검사한다.
- 공개 GET 운영 probe는 현재 운영 `cc7f079a6715e417482df610fbb35f538bfe89e2`에서 통과했다. 이 revision은 다른 승인 배포로 반영된 기존 운영 상태이며 이번 자동 배포 코드를 배포한 결과가 아니다.
- 환경변수 이름 사전 점검의 첫 조회는 만료된 대화형 토큰으로 HTTP 403이었다. 만료 메타데이터를 확인하고 공식 CLI `whoami`로 같은 계정의 토큰을 정상 갱신한 뒤 사전 점검이 통과했다. CI 전용 토큰 검증과는 구분한다. 운영 변수와 기존 인증 계정은 변경하지 않았다.
- 최종 배포·broker 테스트 116개 및 Python 서버 배포 회귀 8개 통과. `git diff --check` 통과. 앱 소스·의존성 변경이 없어 전체 앱 빌드는 다시 실행하지 않았다. 실제 자동 배포는 첫 Actions 실행으로 검증해야 한다.
- 로컬 로그·캐시: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/hanmadi/learner-gitops-20261005/`. 새 비밀 파일은 만들지 않았다.

## 2026-10-05 활성화 준비 체크포인트

- PR #149: 2026-10-05 09:15:48 UTC main 머지 완료. CI `Platform GitOps verification`, `contract` 모두 통과.
- 후속 구성은 기존 관리자·Replay 설정과 binding을 유지하면서 `refs/heads/deploy/hanmadi`와 `SS_DEPLOY_VERCEL_TOKEN`만 추가한다. 설정 파일에는 키 이름과 저장소 식별자만 있으며 실제 비밀 값은 없다.
- Vercel 토큰 화면까지 열었지만 입력 전에 Chrome 연결이 끊겼다. 사용자가 **브라우저 연결은 나중에**라고 답했다. 새 토큰은 발급하지 않았다.
- 활성 GitHub 계정 `socar-hyunz`는 저장소 Administration 권한이 없어 기존 배포 브랜치 보호 조회가 404다. 로그인돼 있는 소유자 계정 `hhj4861`의 별도 사용이나 활성 계정 전환은 이 단계에서 수행하지 않았다.
- Cloudflare 기존 인증으로 실제 worker binding/Secret Store 메타데이터를 읽는 첫 시도는 401이었다. 저장소 설정만으로 실제 운영 등록 여부를 단정하지 않는다.
- 배포 브랜치 생성, 보호 설정 변경, 새 CI 키 등록, broker 운영 배포, 첫 Actions 배포는 아직 수행하지 않았다. 사용자가 브라우저 연결을 재개하기 전까지 이 단계를 완료로 표시하지 않는다.
