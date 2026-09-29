# Replay 전용 배포 인증

Replay 운영 배포는 `hhj4861/replay-live`의 보호된 `deploy/replay`에서만 허용한다.
이 정책 PR은 실제 Worker 배포나 비밀 등록을 수행하지 않으며 기본값은 비활성이다.

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
   실제 binding 메타데이터는 키를 등록한 뒤 검토·커밋한다. 이 PR에는 존재하지 않는 비밀 binding을 추가하지 않는다.
4. 검토된 구성에서 `GITHUB_REPLAY_DEPLOY_ENABLED=true`를 명시적으로 적용해 broker를 배포한다.
   다른 플랫폼의 vars/bindings와 기존 런타임 키는 보존한다.
5. Replay의 운영 DB 백업·012/013 마이그레이션 및 환경변수를 준비하고, 별도 승인된 Replay 승격 PR로 배포한다.
6. 실제 GitHub OIDC 인증과 웹/API 배포·복구 검증을 확인한다. 단위 테스트는 실제 자격 교환 성공을 뜻하지 않는다.

철회 시 `GITHUB_REPLAY_DEPLOY_ENABLED=false`로 broker를 재배포하고 해당 CI 토큰을 회수한다.
기존 runtime 키·암호화 키·다른 프로젝트 정책은 변경하지 않는다.
