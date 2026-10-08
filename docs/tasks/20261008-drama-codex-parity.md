# drama-series Codex 이식 — 2026-10-08

- 목표: 원본 절차를 가리키는 Codex 입구와 무과금 실행·연결 조사 결과.
- 기준: `dcddf97`, 브랜치 `feat/drama-codex-parity`, worktree `/Users/admin/workSpace/commerce-automation-kit-worktrees/drama-codex-parity`.
- 담당/범위: Codex 단독. `.agents/skills/drama-series/SKILL.md`와 이 문서만 변경. `packages/**`, `.claude/skills/**` 변경 없음.
- 완료 기준: 스킬 검증·원본 링크 확인·고정 대본 validate·릴레이 로컬 기동 확인·D1 두 항목/읽기 전용 GCP 결과 기록·본인 변경 commit/push·메일 회신.
- 재검토 선행 완료: `/Users/admin/workSpace/.agent-mailbox/drama-series/to-claude/20261008T154540-codex-full-rereview-dcddf97.md`. 요구 31항목 표, 기존 지적 확인 24항목, 추가 발견 15개. 관련 원본 6건 archive 이동. 기준 소스는 수정하지 않음.
- 현재 결과: 입구 작성·로컬 무과금 검증 완료. 원격 전달 커밋/푸시 결과는 이식 회신에 기록한다. 운영 파이프라인 구현·MCP 인증 연결·클라우드 설정 적용은 이번 변경에 포함되지 않는다.
- 다음 유용한 작업: 재검토 changes를 공통 구현에서 보완한 뒤, 실제 지원 명령으로 토큰/컷 판정 연결 검증. 연결 설정은 별도 사용자 지시 후 진행.

## 실행 결과

검증 산출물은 `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261008-drama-codex-parity/`에 저장했다. Git에는 아래 요약만 기록한다. 인증정보·비밀키는 저장하지 않았다.

| 확인 | 실제 결과 | 범위/한계 |
|---|---|---|
| 입구 스킬 검사 | `quick_validate.py` exit 0, Skill is valid | YAML/스킬 형식, 원본 2개·검증기록 링크 존재 확인 |
| `ds validate` 최초 실행 | npm/tsx exit 1, EADDRINUSE | 긴 iCloud TMPDIR의 통신 소켓 실패. 별도 socket.bind 확인: 150바이트 경로, `AF_UNIX path too long` |
| 동일 CLI Node 로더 실행 | exit 0, ok=true | 아래 명령으로 ep01-9min 46컷: schema/dialogue-lint/continuity 전부 ok, block 0. dialogue-lint review 3건은 기존 결과로 남음 |
| JEV 릴레이 문법 | `node --check` exit 0 | 구문 검증 |
| JEV 릴레이 인자 없음 | exit 2, usage 출력 | 인자 검사를 거쳐 기동 가능. GCP SSH/판정 호출 전 종료. 실제 JEV 인증/응답은 미확인 |
| review-inbox 지원 여부 | Node 로더 exit 2, 알 수 없는 명령 | dcddf97에서는 구현 예정이라는 안내와 일치. 토큰 서명/관문 통과 주장은 없음 |
| 변경 범위 | 두 문서 파일만 | packages와 .claude/skills diff 없음. 저장소 패키지 코드에 변경이 없어 전체 테스트/타입 검사 재실행은 하지 않음 |

성공한 동등 CLI 실행(루트에서, `TASK_CHECK_DIR`은 위 산출물 경로):

```bash
node --import tsx packages/drama-series/src/cli/index.ts validate \
  --series docs/videos/20261006-regression-pilot/series.json \
  --episode docs/videos/20261006-regression-pilot/ep01-9min.json \
  --gates "$TASK_CHECK_DIR/legacy-gates"
```

검증 대상 fingerprint: `ccd6d9b62ed21530`. 의존성은 main-merge의 기존 node_modules를 임시 심볼릭 링크로 재사용했으며 lockfile/패키지 manifest는 기준 커밋과 같음을 확인했다. 설치·업그레이드하지 않았고 검증 후 본인 심볼릭 링크만 제거했다.

증적: `legacy-validate-loader.stdout.txt`, `review-inbox-loader.stdout.txt`, `relay-syntax.*.txt`, `relay-usage.*.txt`, `skill-validator.*.txt`, `socket-path.txt`. 최초 실패 로그도 보존했다. 영상/이미지 생성·TTS·JEV 실제 판정·추가 결제 0회(현재 Codex 세션 사용량이 무료라는 뜻은 아님).

## TODO(D1) 조사

### Higgsfield 공식 MCP 경로

공식 접속점은 `https://mcp.higgsfield.ai/mcp`다. Higgsfield는 다른 MCP 호환 클라이언트의 서버 URL 연결을 안내한다. Codex는 Streamable HTTP와 OAuth를 지원한다. 두 공식 문서를 조합하면 **Codex 직접 연결 경로가 존재한다는 판단**은 가능하지만, 이 계정에서의 OAuth·도구 노출 성공까지 확인한 것은 아니다. 현재 세션 도구 목록에는 Higgsfield 도구가 없다. [Higgsfield 연결 안내](https://higgsfield.ai/creator-hub/help-center/integrations/how-do-i-connect-higgsfield-to-ai-agent), [OpenAI MCP 문서](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

사용자가 연결 설정을 진행할 때의 명령(이번 작업에서 실행하지 않음):

```bash
codex mcp add higgsfield --url https://mcp.higgsfield.ai/mcp
codex mcp login higgsfield
codex mcp list
```

로컬 `codex mcp add --help`와 `login --help`에서 인자 지원 확인. 브라우저 OAuth를 사용자가 완료한 뒤 해당 호스트의 `/mcp`/도구 목록으로 연결을 확인한다. 문서의 유료 구독 조건은 연결 요구사항일 뿐 결제/요금제 변경 허가가 아니다. 비공식 래퍼·설정 자동 변경 없음.

### 이미지 기반 컷 판정

Codex는 PNG/JPEG 이미지 첨부 및 로컬 이미지 확인 경로를 지원한다. CLI `codex --help`의 `--image` 옵션도 확인했다. [OpenAI 이미지 입력 문서](https://learn.chatgpt.com/docs/image-inputs)

실제 이 세션에서 `/Users/admin/Downloads/vedio/drama/20261006-regression-pilot/work/c2/grid.jpg`를 `view_image`로 열었다. 3열×2행 시트에서 창고 컨베이어·상자, 검은 모자/검은 상의와 회색 조끼를 입은 인물의 전화기/표정 변화, 마지막 표본의 회색 후드+형광 조끼 인물을 식별했다. 이는 시각 입력 경로 확인이며 컷의 시나리오 pass 판정이 아니다.

컷 판정 2~5 중 비트 표본, 인물·의상·배경 비교는 가능하다. 연결은 반드시 앞 컷 마지막 프레임과 현 컷 첫 프레임을 함께 제공해야 한다. 이번 시트만으로 전 구간 동작·말소리·음색·립싱크·얼굴 동일성을 확정하지 않는다. 실제 판정 요청/근거 프레임 manifest와 컷별 파이프라인 통합은 TODO(D1)로 남는다.

### GCP Secret Manager — 조회만

지정 프로젝트 `gen-lang-client-0881453127`. `gcloud` 설치 및 활성 계정 1개 확인. 활성 서비스 조회 exit 0에서 Secret Manager 항목 없음. `gcloud secrets list --project=gen-lang-client-0881453127 --filter=name:cak-drama-review`는 exit 1, **SERVICE_DISABLED**. 현재 자격으로 Secret 메타데이터/키 조회 가능성을 끝까지 검증할 수 없다. 키가 존재하지 않는다거나 IAM 권한이 없다고 단정하지 않는다.

비밀 payload 조회, 인증 변경, API enable, Secret/키 생성, IAM 변경은 실행하지 않았다. 기존 환경의 인증을 사용했으며 계정 주소/키는 이 기록에 남기지 않았다.
