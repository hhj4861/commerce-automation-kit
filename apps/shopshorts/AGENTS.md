# Shorts 담당 세션 — GitOps 지시

2026-09-29 사용자 지시. 담당: 현재 Shorts 세션과 `short-studio-refact`.
작업 시작·재개 시 저장소의 `docs/GITOPS-SESSION-MEMORY.md`를 읽는다.

- 공용 PR #60은 main에 머지됐다. 실제 운영 연결 여부는 별도로 확인한다.
- `deploy/shopshorts`에 승인된 PR이 머지되면 Pages `shopshorts-dash`가 자동 배포되도록 끝까지 연결한다.
- main의 `ops/deploy/targets.json`과 `docs/deployment/platform-gitops.md`를 기준으로 브랜치 보호, Cloudflare 중앙 배포 키/OIDC broker, Pages production branch를 설정한다.
- 첫 배포 SHA·URL과 로그인→studio API→제작 워커 연결을 실제 확인한다. Pages 배포가 로컬 제작 워커도 업데이트했다고 보고하지 않는다.
- 다른 담당의 변경/staging을 보존한다. 구현은 worktree, 본인 변경 검증·커밋·upstream push. PR 머지는 별도 사용자 승인이 필요하다.
- 이 파일 저장은 기존 세션의 즉시 수신 증거가 아니다. 읽었을 때 수신/후속 작업 상태를 보고한다.
