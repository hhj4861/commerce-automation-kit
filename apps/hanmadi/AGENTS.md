# Hanmadi 담당 세션 — GitOps 지시

2026-09-29 사용자 지시. 담당: `Lite-LLM` 세션(Hanmadi와 공용 LiteLLM 담당).
작업 시작·재개 시 저장소의 `docs/GITOPS-SESSION-MEMORY.md`를 읽는다.

- 공용 PR #60은 main에 머지됐다. 운영 활성화 여부는 원격 설정/배포 이력으로 재확인한다.
- `deploy/hanmadi`에 승인된 PR이 머지되면 Vercel `hanmadi`가 자동 배포되도록 완성한다.
- Cloudflare 중앙 Vercel CI 자격, 정확한 repo/ref/workflow OIDC 신뢰, 브랜치 보호, native Git 중복 배포 전환을 확인한다.
- 첫 배포의 SHA·URL, 개인 계정 연결·언어 선택·웹→Dify/LiteLLM 흐름을 검증한다.
- 웹 배포와 공용 서버 배포는 별개다. 서버 변경은 `services/ai-gateway/AGENTS.md`를 함께 따른다.
- 구현은 worktree, 다른 세션 작업 보존, 본인 변경 검증·커밋·upstream push. 각 PR 실제 머지는 사용자 승인 후 수행한다.
- 저장·push와 세션의 실제 수신/실행을 구분한다.
