# 플랫폼별 GitOps — 담당 세션 공유 메모리

사용자 지시: 2026-09-29. 작업 시작·재개·문맥 압축 후 이 메모를 읽고 현재 원격 상태를 확인한다.
사용자가 각 프로젝트 AGENTS.md/메모리에 기록해 담당 Codex 세션이 이어서 작업하도록 요청했다.

## 담당과 배포 브랜치

| 담당 세션 | 저장소/앱 | 운영 배포 브랜치 | 대상 |
|---|---|---|---|
| 현재 Shorts 세션 + `short-studio-refact` | commerce-automation-kit / apps/shopshorts | `deploy/shopshorts` | Pages `shopshorts-dash` |
| `Lite-LLM` | commerce-automation-kit / apps/hanmadi | `deploy/hanmadi` | Vercel `hanmadi` |
| `Lite-LLM` | commerce-automation-kit / services/ai-gateway | `deploy/litellm` | 개인 GCP shared-ai의 LiteLLM |
| `Replay` | hhj4861/replay-live | `deploy/replay` | Vercel `replay-live-poc` 웹 + `replay-live-api` |
| `festa` | hhj4861/venture-studio / ventures/market/party-festival-guide/app | `deploy/festa` | Pages `festacheck` |
| FIRSTFRAME 담당 | commerce-automation-kit / apps/firstframe | `deploy/firstframe` | Pages `firstframe-showcase` |

## 확정된 상태와 이어 할 작업

- 공용 PR #60은 main에 머지됐다: https://github.com/hhj4861/commerce-automation-kit/pull/60
- 머지 커밋: `44bcfc263e95015f67f9a823bf9e3136d3957475`.
- 머지 확인 당시 배포 브랜치/운영 인증 연결은 아직 없었다. **코드 머지와 운영 GitOps 활성화를 구분한다.** 이후 다른 담당자가 진행했을 수 있으므로 원격 설정·배포 이력을 먼저 재조회한다.
- 담당자는 **지정 배포 브랜치에 PR 머지 → 자동 빌드/검증 → 해당 웹·서버 배포 → 실제 사용자 흐름 확인**까지 GitOps를 완성한다.
- 먼저 main의 `ops/deploy/targets.json`, `docs/deployment/platform-gitops.md`, `docs/deployment/codex-gitops-handoff.md`를 읽는다. 현 checkout에 없다면 main의 원문을 조회한다. 다른 세션 checkout을 강제 전환/reset하지 않는다.
- 배포 브랜치 생성·PR 필수 보호·배포 자격·production branch·중복 native Git 배포 전환을 연결한다. 첫 브랜치 생성은 운영 배포를 실행하지 않는다.
- 웹 CI 키는 Cloudflare 중앙 비밀관리에서 필요한 키만 OIDC로 전달한다. GitHub에 장기 비밀을 중복 저장하지 않는다. LiteLLM은 GCP WIF/IAP를 쓴다. 다른 저장소에 동일 키/신뢰를 무조건 개방하지 않는다.
- 첫 실제 배포의 workflow URL, commit SHA, 운영 URL/health, 인증·핵심 API 흐름과 실패/복구 결과를 남긴다. CI 통과만으로 운영 배포 완료라고 하지 않는다.
- Shorts Pages와 제작 워커, Hanmadi 웹과 Dify/LiteLLM, gateway와 독립 accounts/edge의 배포 경계를 구분한다.
- Replay는 `feat/* → develop → main → deploy/replay`를 따른다. Festa의 현재 기준 `feature/agent-test`에서 검토된 소스를 `deploy/festa`로 승격한다. 외부 앱 소스는 이 저장소에서 수정하지 않는다.

## 작업·승인 경계

문서·메모리는 현재 checkout에서 본인 변경만 검증·커밋·upstream push한다. 구현은 별도 worktree에서 수행한다.
다른 세션의 staged/미완료 파일을 포함하거나 force push하지 않는다. 각 PR 실제 머지는 사용자 승인을 받는다.
이번 메모 기록은 새 PR에 대한 머지 승인이나 인프라 적용 완료가 아니다.
세션이 이 메모를 실제 읽고 계획에 반영한 경우 수신 사실을 사용자에게 알린다.
파일 저장·원격 push를 이미 열려 있는 모든 세션의 즉시 수신·실행 증거로 보고하지 않는다.
