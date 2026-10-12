# Shopshorts 배포 활성화

## 확인된 운영 상태 — 2026-10-06

- PR #157·#158은 main에 머지됐다. `deploy/shopshorts`와 운영 checkout의 검증 revision은 `7e03f5a2e15261c06d09740bab5fb12890260217`이다.
- Pages `shopshorts-dash`의 production branch는 `deploy/shopshorts`다. 운영 URL은 https://shopshorts-dash.pages.dev 이다.
- 마지막 검증 배포 `2196032c-326a-4aa5-92a6-ee544abd0e0a`는 공식 Wrangler **수동 배포**다. 자동 배포 성공 증거가 아니다.
- GitHub 브랜치 보호를 적용했다: PR 필수, `Platform GitOps verification` 필수·최신 기준 브랜치 요구, 관리자 적용, force push·삭제 금지. 저장된 기존 소유자 인증을 API 호출에만 사용했고 전역 로그인은 바꾸지 않았다.
- Cloudflare CI 전용 토큰 등록과 아래 broker 설정 배포, 첫 Actions 실배포는 아직 남아 있다.

## 남은 활성화 순서

1. Cloudflare에서 Shopshorts 계정 범위의 `Account → Cloudflare Pages → Edit` CI 전용 토큰을 발급한다. 로컬 Wrangler OAuth 토큰을 복사하지 않는다.
2. 토큰을 채팅·Git·iCloud에 넣지 않고 로컬 비공개 파일(권한 `0600`)에 `{"DEPLOY_CLOUDFLARE_API_TOKEN":"발급값"}` 형태로 보관한다. 검토된 소스에서 다음 명령을 실행한다.

   ```sh
   node apps/credential-broker/admin.mjs register-deploy '/private/path/deploy-credentials.json'
   ```

   이 명령은 Cloudflare Secrets Store와 binding 메타데이터를 갱신하므로 실행 전 `wrangler.json`을 gate track한다. `CAK_DEPLOY_CLOUDFLARE_API_TOKEN` 등록 성공을 이름만 조회해 검증한다.
3. 이 변경의 PR 승인·머지 후 검토된 broker를 배포한다. **Secret이 없는 상태에서 binding만 먼저 배포하지 않는다.** `GITHUB_DEPLOY_ALLOWED_REFS`의 기존 Hanmadi 항목을 보존하고 Shopshorts만 추가한다. FIRSTFRAME은 여전히 비활성이다.
4. `deploy/shopshorts`에서 `Platform deployment`를 `target=shopshorts`로 수동 실행한다. OIDC 자격 조회 → 테스트 → 정확한 SHA의 Pages production 배포까지 실제 성공을 확인한다. 이후 main의 검토된 소스를 배포 브랜치 PR로 승격하고 사용자 승인 후 머지한다.
5. Actions 결과·Pages deployment SHA·로그인한 제작실의 자동 혼합 선택값과 워커 상태를 함께 확인한다. 실패를 수동 배포 성공으로 대체 보고하지 않는다.

GitHub에는 기존 `CAK_SECRETS_URL` 변수만 사용하며 장기 토큰을 GitHub Secrets에 복제하지 않는다. broker는 정확한 repository/owner ID, protected ref, workflow, event, subject, GitHub-hosted runner를 검증하고 Cloudflare 배포 키만 반환한다.

## 제작 워커와 음성 연결

이 Actions 파이프라인은 Pages 배포다. 로컬 `com.cak.studio-production` 워커나 공용 broker의 자동 배포를 포함하지 않는다. 워커 업데이트는 큐 상태 확인 후 별도로 수행한다.

2026-10-06 ElevenLabs 요청은 HTTP 이전 TLS 인증서 검증에서 실패했다. 네트워크 검사 인증서의 발급자는 Fortinet `FG200ETK20904320`이며, 이 Mac에서 해당 공식 신뢰 체인을 확인하지 못했다. API 키·사용 한도 오류로 단정하지 않는다. 네트워크 관리자가 제공한 공식 CA/정책을 확인한 뒤 재검증하며 TLS 검증을 끄거나 출처 불명의 인증서를 신뢰하지 않는다.
