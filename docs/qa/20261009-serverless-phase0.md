# 서버리스 전환 Phase 0 실행 기록 (2026-10-09)

대상: `docs/20261009-shared-ai-serverless-migration-plan.md`의 Phase 0(결정·확인·즉시 절감). 비밀값은 보거나 기록하지 않았다. 출력한 값은 이름·크기·행 수·비밀이 아닌 URL뿐이다.

## 결정

- D0~D7은 권장안을 그대로 채택했다. 근거는 권장안과 실행 방식을 제시한 직후의 사용자 지시 "계속해줘"(2026-10-09)다.
- 실행 방식은 네이티브(이 세션에서 직접 실행)다.

## D0 — VM 축소 재기동

- 14:22 KST에 `shared-ai`를 e2-standard-2에서 e2-small로 바꾸고(`gcloud compute instances set-machine-type`) 시작했다.
- 기동 약 40초 뒤 공개 경로가 응답했다: edge `/health` 200, `/llm/v1/models` 401(키 없음), `POST /discovery/v1/discover` 401(키 없음).
- e2-small(1,960MB)에서 메모리 사용 1,067MB, 가용 892MB다. 컨테이너별로는 LiteLLM 644MiB, Postgres 48MiB, accounts 68MiB, discovery 16MiB, Caddy 10MiB다.
- **Terraform 코드와 차이가 생겼다.** `machine_type` 기본값은 e2-standard-2이고 허용값은 e2-standard-2·4뿐이다. Phase 1-1에서 e2-small을 허용하고 값으로 정하기 전에는 이 모듈을 apply하지 않는다. 그 전에 apply하면 VM이 다시 e2-standard-2로 바뀐다.

## Terraform state

| 모듈 | 결과 |
|---|---|
| `services/shared-ai-host` | **찾음.** 저장소를 옮기기 전 위치인 iCloud `IdeaProjects/97.개인/workSpace/commerce-automation-kit/data/shared-ai/terraform.tfstate`에 있다. 형식 4, Terraform 1.5.7, serial 16, 2026-09-27 작성. 리소스 13종(인스턴스 16): Cloud Run proxy·공개 IAM, 디스크·스냅샷 정책·연결, 방화벽 2, VM, 네트워크·서브넷 2, API 4, SA |
| `ops/deploy/gcp-identity`(WIF) | **찾지 못함.** 로컬 디스크, iCloud(Spotlight), 이 프로젝트의 GCS 버킷(없음)을 확인했다. **후속 확인(Phase 1):** 모듈이 적용된 적이 없었다. WIF pool·배포 SA(`cak-litellm-deploy`)·STS API·저장소 변수가 모두 없다. import할 대상이 없으므로 Phase 1에서 새로 만든다 |

**읽기 전용 `terraform plan`으로 검증했다.** `origin/main` 코드와 이 state로 plan을 실행한 결과는 `0 to add, 1 to change, 0 to destroy`이고, 바뀌는 속성은 `google_compute_instance.host`의 `machine_type`("e2-small" → "e2-standard-2") 하나다. D0에서 생긴 알려진 차이뿐이므로 state가 실제 인프라와 일치한다.

- 이력도 맞다. 모듈의 마지막 코드 변경은 9/27 15:21(`563a72c`)이고 state는 같은 날 18:17에 쓰였다.
- iCloud가 파일을 비운(dataless) 상태에서는 Terraform이 직접 읽지 못했다(`operation timed out`). 로컬 디스크 여유가 약 11GB(98% 사용)이고 iCloud 데몬이 한동안 I/O 대기에 묶여 있었다. 파일을 읽는 즉시 로컬(0600)에 쓰는 방식으로 사본을 만들어 plan에 썼다. 이 사본은 Phase 1-1의 GCS 이전에 쓰고 지운다.
- GCS backend 이전에는 버킷이 필요하므로 Phase 1-1 Terraform 변경과 함께 한다. 그때까지 원본은 원래 위치에 둔다.

## VM 확인값

| 항목 | 값 | 계획 반영 |
|---|---|---|
| discovery `JEV_BASE_URL` | 공개 edge `/llm` | 4-3의 값 확정 |
| discovery 운영 버전 | 이미지 `7e9d866`(PR #156 머지), 코드 `VERSION = "discovery-v1.2"`. README의 "운영 v1.1(`3857765`)"은 오래된 기록이다 | D7·Phase 4 선행 조건 수정 |
| discovery DB | requests 11, active 0, action_results 8. `DISCOVERY_REQUESTS_PER_DAY=30` | 4-2 이관 규모 |
| LiteLLM DB | PostgreSQL 16.15, 20MB. SpendLogs 1,739행, 가상 키 7, 팀 4 | D2 저장 용량 |
| salt 사용처 | 암호화 값을 담는 테이블이 비어 있다(ProxyModel·Credentials·MCPServer 0행). Config 1행은 `auto_router_tuning_baseline_v2`로 자격 정보가 아니다 | salt는 현재 실제로 쓰이지 않는다. 이관 때 값은 그대로 옮기고 길이·해시만 비교한다(3-1) |
| accounts v1 | 실사용자 없음. 9/29 QA 15행: festa claude connected 1·disconnected 5, festa codex connected 1·disconnected 4, hanmadi codex disconnected 3·error 1 | Phase 6 단계 1에 QA 연결 해제와 제공사 쪽 폐기 확인 추가 |
| Dify | nginx 접근 로그에 9/27~28 구축·QA 호출(chat-messages 48건)만 있고, 9/28 이후 정지까지 API 호출 0건 | D6 |

## Hanmadi 운영 변수

- Vercel CLI가 설치돼 있지 않고 프로젝트 링크도 없어 변수 이름을 직접 확인하지 못했다.
- 대신 Dify 로그로 판단했다. Hanmadi는 일일 진단 cron이 있어서 Dify를 썼다면 호출이 남는다. 9/28 이후 0건이므로 Dify를 쓰지 않는다.
- 남은 확인(사용자): Phase 5의 D6 정리 전에 Vercel에서 `CONVERSATION_PROVIDER`·`DIFY_*`·`AI_ACCOUNTS_*`가 없는지 본다.

## discovery JEV 키

운영 키는 2026-11-02 06:00 UTC에 만료된다. D7 릴리스(Phase 4 선행)와 함께 갱신한다.

## 사용자 몫

| 항목 | 필요 시점 |
|---|---|
| Neon 가입과 Launch 결제 수단 등록 | Phase 1-4(스테이징은 Free) 전, 운영은 Phase 3 전 |
| 청구 계정 범위 예산 알림(콘솔) | 가능한 빨리 |
| 청구 보고서에서 같은 청구 계정의 다른 프로젝트 2개가 쓰는 무료 등급 사용량 확인 | Phase 2 게이트 전 |
| 새 `deploy/*` 브랜치 보호 규칙 | Phase 5 전 |
| Vercel 변수 확인(위) | Phase 5 전 |
| accounts QA 연결의 제공사 쪽 세션·키 폐기 | Phase 6 전 |

## 완료 기준 대조

| 기준 | 결과 |
|---|---|
| 결정 기록 | 완료 |
| state 확보 | shared-ai-host는 확보·검증 완료(plan 차이는 D0의 machine_type뿐). WIF는 적용된 적 없음(Phase 1에서 새로 만듦) |
| VM 정상 기동과 공개 `/llm`·`/discovery` 응답 | 완료 |
| 확인값 기록 | 완료(Hanmadi 변수는 간접 확인) |
