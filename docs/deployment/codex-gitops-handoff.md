# 플랫폼 담당 Codex 세션에 전달할 GitOps 작업

사용자 요청(2026-09-29): Replay를 포함하고 Replay·Festa·Hanmadi·Shorts 등 각 담당 Codex 세션에
배포 구조 변경을 공유한다. 앞으로 해당 배포 브랜치에 PR을 머지하면 서버 자동 배포까지 되도록 GitOps를 완성한다.

## 현재 상태와 공통 계약

- 공용 구현 PR: https://github.com/hhj4861/commerce-automation-kit/pull/60
- 구성 원본: `ops/deploy/targets.json`, 상세 절차: [플랫폼 배포 가이드](platform-gitops.md)
- **현재 상태는 구현 PR 준비/검증이며 운영 전환 완료가 아니다.** PR #60은 아직 머지 승인 전이다.
- `main`/기능 브랜치 push로 운영 배포하지 않고, 보호된 각 `deploy/*` 브랜치의 승인된 PR 머지가 배포를 실행한다.
- 각 PR 실제 머지는 사용자 명시 승인을 받는다. 이번 전달 요청을 임의의 PR 머지 승인으로 해석하지 않는다.
- 본인 변경만 검증·커밋·upstream push한다. 구현은 별도 worktree, 다른 세션 파일·staging 보존.
- 배포 비밀은 Cloudflare 중앙 비밀관리, GitHub는 짧은 수명 OIDC를 사용한다. 저장소마다 정확한 repo ID/소유자 ID/ref/workflow를 제한한다.
- 브랜치 생성/보호, CI 자격, 플랫폼 production branch, 중복 native Git 배포 제거와 첫 운영 배포까지 확인해야 완료다.
- 최초 branch 생성은 배포하지 않는다. 수동 dispatch도 선택한 target/ref가 일치해야 한다.
- 실패를 완료로 표시하지 말고 직전 정상 버전 복구, 배포 SHA와 사이트/서버 readiness를 기록한다.
- 변경 없는 웹만 확인하지 말고 API·인증·worker 등 실제 사용자 요청의 전체 흐름을 검증한다.
- 담당자는 수신 확인 → 실제 저장소/브랜치/대상 확인 → 구현 PR → 승인 후 활성화 → 실제 배포 증거 순서로 회신한다.

## 담당별 요청

### Replay

`hhj4861/replay-live`에서 `deploy/replay` PR 머지 시 Vercel 웹 `replay-live-poc`와 API
`replay-live-api`가 함께 호환되는 revision으로 자동 배포되도록 완성해 주세요.
로컬은 `/Users/admin/workSpace/replay-live-poc`, 웹은 `web/`, API는 루트입니다.
기존 `feat/* → develop → main` 규칙 뒤에 `main → deploy/replay` 승격을 붙여 주세요.
worker snapshot/queue, DB 마이그레이션, 방송 중인 작업의 drain/복구를 기존 운영 절차와 맞춰 주세요.
공용 LiteLLM 서버와 별개이며, 중단된 GCP 진단을 다시 실행하거나 GCP로 이전하는 요청이 아닙니다.
기존 verification CI 통과에 더해 실제 배포와 웹→API health/인증 흐름 증거를 남겨 주세요.

### Festa

`hhj4861/venture-studio`의 `ventures/market/party-festival-guide/app`에서 `deploy/festa` PR 머지 시
Cloudflare Pages `festacheck`가 자동 배포되도록 완성해 주세요.
현재 기준은 `feature/agent-test`이고 수동 배포입니다. 검토된 소스를 승격하고 실제 앱 빌드 명령을 확인해 주세요.
Pages production branch와 workflow branch를 `deploy/festa`로 맞춰 주세요.
이 앱은 commerce-automation-kit에 없으므로 다른 저장소의 웹 코드를 수정하지 마세요.
venture-studio 전용 Cloudflare OIDC 신뢰·배포 자격을 공용 담당과 조정하고 첫 배포 URL/SHA를 확인해 주세요.

### Hanmadi (사용자 표기 namadi)

`hhj4861/commerce-automation-kit`의 `apps/hanmadi`를 `deploy/hanmadi` PR 머지로 Vercel `hanmadi`에
자동 배포하도록 PR #60의 구성을 이어서 활성화해 주세요.
Vercel CI 토큰은 Cloudflare에 등록하고 기존 native Git 배포와 중복되지 않게 전환해 주세요.
개인 계정 연결·언어 선택·웹→Dify/LiteLLM 회귀 검증과 실제 production revision을 확인해 주세요.
공유 gateway/Dify 서버까지 웹 배포가 갱신했다고 보고하지 마세요. 서버 변경은 별도 소유자와 조정하세요.

### Shorts

`hhj4861/commerce-automation-kit`의 `apps/shopshorts`를 `deploy/shopshorts` PR 머지로 Pages
`shopshorts-dash`에 자동 배포하도록 PR #60을 이어서 활성화합니다.
Cloudflare CI 토큰/정확한 broker policy/production branch/브랜치 보호를 연결합니다.
페이지뿐 아니라 로그인·studio API·기존 제작 워커 연결을 확인합니다.
Pages 배포는 로컬 제작 워커 업데이트가 아니므로 worker 변경이 있으면 별도 배포 경로를 확인합니다.

### LiteLLM 및 FIRSTFRAME

공용 LiteLLM은 `deploy/litellm` → 개인 GCP `shared-ai`의 gateway/구독 워커,
FIRSTFRAME은 `deploy/firstframe` → Pages `firstframe-showcase`입니다.
PR #60에 구현이 있으며 WIF/IAP 또는 중앙 배포 키와 브랜치 보호를 연결한 뒤 운영 검증해야 합니다.
LiteLLM은 기존 인증·DB 볼륨을 보존하고 backup/readiness/rollback을 확인합니다.
독립 accounts·Dify·edge는 이 배포가 갱신하지 않습니다.

## 세션 식별 및 전달 상태

2026-09-29 로컬 Codex session index에서 이름과 ID를 확인했다. 인덱스는 생존/수신 확인 증거가 아니다.

| 대상 | 확인한 세션 이름 / ID | 전달 상태 |
|---|---|---|
| Replay | Replay / `01a0b6bc-9c26-7050-80fd-172f16182ebd` | 직접 전송 미완료, 수신 미확인 |
| Festa | festa / `01a0c6b9-5bf3-7b81-ad74-cdb0d5dc1649` | 직접 전송 미완료, 수신 미확인 |
| Hanmadi | 한마디에 다국어 AI 회화 추가 / `01a0dc15-0f03-7ca2-92e1-54f2ec0820c0` | 직접 전송 미완료, 수신 미확인 |
| Shorts / 공용 구성 | 개선해 쇼츠 영상 생성기 / `01a0b3ac-df1b-7293-a99c-74f3c6e650d0` | 현재 세션에서 사용자 요청 수신 |
| 별도 LiteLLM / FIRSTFRAME | 별도 세션 ID 미확인 | 공용 구성 담당에 기록, 별도 전달 미확인 |

현재 협업 도구에는 root 세션만 보이고 기존 담당 세션으로 전송하는 도구가 노출되어 있지 않다.
Codex 앱 UI로 전달을 시도했지만 `Sky Computer Use native pipe startup failed`로 연결되지 않았다.
engine-exchange는 OFF이고 새 워커를 만들거나 설정을 임의로 켜지 않았다.
따라서 이 문서의 저장·push를 메시지 직접 전송/수신/실행 완료로 보고하지 않는다.
각 담당 세션에 이 문서의 GitHub 링크를 전달하면 동일한 계약으로 바로 이어갈 수 있다.
