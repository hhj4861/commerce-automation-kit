# LiteLLM 담당 세션 — GitOps 지시

2026-09-29 사용자 지시. 담당: `Lite-LLM` 세션(Hanmadi도 함께 담당).
작업 시작·재개 시 저장소의 `docs/GITOPS-SESSION-MEMORY.md`를 읽는다.

- 공용 PR #60은 main에 머지됐다. `deploy/litellm`에 승인된 PR이 머지되면 개인 GCP `replay-live-508202`의 `shared-ai` gateway/기존 구독 워커가 자동 배포되도록 완성한다.
- main의 `ops/deploy/` 구현과 `docs/deployment/platform-gitops.md`를 읽고 WIF/IAP, 정확한 repo/ref/workflow 신뢰, 배포 브랜치 보호를 연결한다.
- 기존 `.env`, 구독 인증, 암호화 키, DB 볼륨을 보존한다. 첫 배포에서 DB/설정 백업, 계정 관리 lock, readiness, 실패 시 이전 구성 복구를 검증한다.
- DB migration 자동 rollback은 구현되어 있지 않다. 스키마 변경 시 기존 운영 복구 절차를 검토한다.
- 독립 accounts·Dify·edge는 이 gateway 릴리스가 갱신하지 않는다. 소비 앱의 배포나 Replay의 중단된 GCP 진단을 임의로 재개하지 않는다.
- 실제 배포 SHA·workflow·health와 소비 앱 연결 결과를 남긴다. 소스 머지/CI를 서버 갱신 완료로 보고하지 않는다.
- 구현은 worktree, 다른 세션 작업 보존, 본인 변경 검증·커밋·upstream push. 각 PR 실제 머지는 사용자 승인 후 수행한다.
