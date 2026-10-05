# Hanmadi 학습 앱 GitOps 활성화 기록

## 작업 카드

- 목표·담당: 현재 Hanmadi 세션. 학습 앱의 보호된 `deploy/hanmadi`와 전용 중앙 배포 자격을 연결하고 첫 운영 배포를 검증한다.
- 범위: Vercel `hanmadi`, GitHub `deploy/hanmadi`, Cloudflare credential broker의 학습 앱 자격. 관리자 앱과 공용 AI 서버 배포는 제외한다.
- 승인된 코드: PR #149·#150, main 머지 `facd92cf75205df577076951183da801b57fa796`.
- 완료 조건: 전용 토큰 등록 → 검토된 broker 반영 → 보호된 브랜치에서 Actions 배포 → 운영 SHA·인증 준비·사용자 흐름 검증.
- 현재 결과: 배포 브랜치 생성·보호 적용 완료. 토큰 발급·중앙 등록·broker 반영·첫 운영 배포는 미완료.
- 다음 행동: 준비된 Hanmadi 단일 프로젝트·90일 토큰의 명시적 생성 승인을 받은 뒤, 중앙 등록과 기존 운영 설정을 보존한 broker 반영 및 첫 배포를 진행한다.

## 적용한 설정

- [PR #149](https://github.com/hhj4861/commerce-automation-kit/pull/149)와 [PR #150](https://github.com/hhj4861/commerce-automation-kit/pull/150)은 사용자 승인 후 main에 머지됐다. 구현 검증은 배포·broker 테스트 117개 및 두 필수 CI 통과.
- `deploy/hanmadi`를 승인된 `facd92cf75205df577076951183da801b57fa796`에서 최초 생성했다. 기준 이후 main의 별도 topic-discovery 변경은 포함하지 않았다. 현재 운영 revision과 이 기준 사이에 Hanmadi 앱 소스 변경은 없다.
- 사용자 승인 후 키링의 저장소 소유자 `hhj4861` 인증을 메모리에서만 사용해 브랜치 보호를 적용하고 GET으로 재확인했다. 전역 활성 계정 전환, 토큰 출력·파일 저장은 하지 않았다.
- 보호 규칙: PR 필수, `Platform GitOps verification` 필수(GitHub Actions app 15368), 최신 기준 브랜치 검사, 오래된 리뷰 해제, 대화 해결 필수, 관리자 포함 적용, force push·삭제 금지. 기존 관리자 배포 브랜치와 같은 규칙이다.
- 저장소의 중앙 인증 URL 변수와 immutable OIDC subject가 구성돼 있음을 읽기 전용으로 확인했다.
- [최초 브랜치 생성 실행](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37291015909)은 `plan: success`, `deploy: skipped`다. **이 성공은 실제 운영 배포 성공이 아니다.**

## 기존 운영 상태 확인

- 운영 URL: https://hanmadi-lake.vercel.app
- 확인 revision: `cc7f079a6715e417482df610fbb35f538bfe89e2`. 이번 작업에서 새로 배포한 revision이 아니다.
- 공개 GET probe 통과: `/study` 학습 화면, `/privacy` 정책 본문, Google 로그인 준비 API의 공개 client ID 일치, 비로그인 관리자 API 403.
- 이번 점검에서는 실제 Google 재로그인이나 유료 AI 호출을 수행하지 않았다. 이전 실제 Google 로그인 검증은 [별도 기록](20261005-hanmadi-google-oauth-production.md)을 참고한다.

## Vercel 준비 상태와 남은 작업

- 사용자에게서 이전 브라우저 보류 해제와 개인 Chrome 작업 재개 승인을 받았다.
- 브라우저 확장 연결 목록은 비어 있었지만, 허용된 native Chrome UI로 기존 토큰 화면에 접근했다.
- 프로젝트 선택 준비 승인을 받은 뒤 토큰 이름 `cak-hanmadi-learner-gitops-20261005`, 범위 `hanmadi`, 만료 `90 Days`(화면 표시 2027-01-03)를 설정했다. 계정·팀 전체 범위가 아닌 단일 프로젝트임을 화면으로 확인했다.
- 생성 직전 질문에 사용자가 “계속”이라고 답했으나, 자동 승인 검토가 정확한 권한·유효기간의 명시적 승인이 부족하다고 판단해 Create 실행을 차단했다. 새 토큰은 아직 생성되지 않았다. 토큰 생성·지정 중앙 저장소 등록·첫 운영 배포를 정확히 명시한 승인 선택지를 다시 요청했다.
- 후속 읽기 전용 점검에서 `deploy/hanmadi`는 승인된 revision과 보호 상태를 유지했다. 운영 Secret Store에 `CAK_DEPLOY_VERCEL_TOKEN`이 없고, broker의 learner binding도 아직 없는 것을 확인했다.
- 공식 Wrangler `whoami`로 기존 OAuth 인증을 동일 권한으로 갱신했다. 추가 OAuth 범위는 요청하지 않았다.
- 운영 broker의 `GITHUB_BLOG_DISCOVERY_ENABLED`는 현재 `true`이며 검토된 로컬 설정의 `false`와 다르다. 반영 시 이 기존 운영값을 보존해야 한다. 나머지 설정 비교에서 변경점은 learner 허용 ref 추가와 learner binding 추가뿐이었다. main 후속 PR의 파일 목록에도 broker 소스 변경은 없다.
- 전용 토큰 등록 전 broker의 새 learner binding을 운영에 배포하지 않는다. 기존 관리자·Replay 설정을 보존한다.
- 첫 배포는 승인된 초기 브랜치의 명시적 실행으로 확인할 수 있으며, 이후 코드 승격 PR 머지는 각 PR별 사용자 승인 후 수행한다. 보호된 브랜치를 직접 갱신하거나 보호 규칙을 해제하지 않는다.

이 문서의 저장·커밋은 Vercel 토큰 발급, broker 재배포 또는 운영 자동 배포 완료를 뜻하지 않는다.
