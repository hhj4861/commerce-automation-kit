# Replay 전용 배포 인증

Replay 운영 배포는 `hhj4861/replay-live`의 보호된 `deploy/replay`에서만 허용한다.
정책 PR #62는 main에 머지됐다. 후속 설정은 Replay 전용 binding과 활성화 값을 준비한다.
소스 설정 변경만으로 실행 중인 Worker가 바뀌지는 않는다. 비밀 등록과 이 구성의 검증·승인 후
Worker를 별도로 배포해야 적용된다.

## 준비 확인 — 2026-09-29

- 사용자 제공 `replay-deploy` 토큰은 team 범위이며 Replay 웹/API 프로젝트 읽기 권한을 확인했다.
- 실제 키를 Git이나 추가 로컬 파일로 복사하지 않는다. Cloudflare 전송은 명시적 승인 후 메모리에서 처리한다.
- `wrangler.json`은 `SS_REPLAY_DEPLOY_VERCEL_TOKEN` binding과 `GITHUB_REPLAY_DEPLOY_ENABLED=true`를 포함한다.
- 운영 브로커의 기존 변수와 binding 이름을 비교했으며 기존 서비스 변수의 차이는 없었다.
- 이 기록은 비밀 등록·Worker 배포·실제 GitHub OIDC 인증 성공 증거가 아니다. 각 실행 결과로 확인한다.

## 신뢰와 격리

- 저장소 ID `1365111099`, 소유자 ID `71001056`.
- ref `refs/heads/deploy/replay`, GitHub `ref_protected=true`.
- workflow `hhj4861/replay-live/.github/workflows/deploy-production.yml@refs/heads/deploy/replay`.
- 환경 `production`, subject `repo:hhj4861@71001056/replay-live@1365111099:environment:production`.
- GitHub-hosted runner의 `push` / `workflow_dispatch`만 허용.
- 응답은 `REPLAY_DEPLOY_VERCEL_TOKEN` 한 개다. Hanmadi의 `DEPLOY_VERCEL_TOKEN`을 재사용하지 않는다.
- 기존 수집·제작·Pages·OAuth import 경로에는 Replay 배포 키가 포함되지 않는다.

저장소의 immutable subject 설정은 GitHub OIDC customization API로 확인했다.
환경을 사용하는 job은 ref 형태 대신 환경 형태의 subject를 검증하고, ref와 workflow를 별도로 제한한다.
공식 근거: [GitHub OIDC reference](https://docs.github.com/en/actions/reference/security/oidc).

## 적용 순서

1. 이 PR 검증 후 사용자 승인으로 main에 머지한다.
2. Replay Vercel 팀의 CI 전용 배포 토큰을 발급하고 범위·만료를 확인한다. 로컬 CLI 로그인 토큰이나 다른 서비스 키를 복사하지 않는다.
3. 중앙 Secrets Store `cak-secrets`에 `CAK_REPLAY_DEPLOY_VERCEL_TOKEN`을 등록한다.
   Worker binding은 `SS_REPLAY_DEPLOY_VERCEL_TOKEN`이며 store ID는 `de2c8d7c3e9c4067acc22212522c0fc4`다.
   기존 `admin.mjs register-deploy`는 해당 이름을 허용하며, 토큰은 Git·로그·채팅에 기록하지 않는다.
   binding에는 비밀의 이름과 저장소 식별자만 포함된다. 실제 키가 등록되기 전에는 이 구성을 배포하지 않는다.
4. 검토된 구성에서 `GITHUB_REPLAY_DEPLOY_ENABLED=true`를 명시적으로 적용해 broker를 배포한다.
   다른 플랫폼의 vars/bindings와 기존 런타임 키는 보존한다.
5. Replay의 운영 DB 백업·012/013 마이그레이션 및 환경변수를 준비하고, 별도 승인된 Replay 승격 PR로 배포한다.
6. 실제 GitHub OIDC 인증과 웹/API 배포·복구 검증을 확인한다. 단위 테스트는 실제 자격 교환 성공을 뜻하지 않는다.

철회 시 `GITHUB_REPLAY_DEPLOY_ENABLED=false`로 broker를 재배포하고 해당 CI 토큰을 회수한다.
기존 runtime 키·암호화 키·다른 프로젝트 정책은 변경하지 않는다.
