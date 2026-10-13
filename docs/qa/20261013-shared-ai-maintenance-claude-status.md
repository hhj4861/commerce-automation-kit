# shared-ai VM 점검 — Claude 작업 현황 (2026-10-13)

사용자 요청으로 Claude 세션이 맡은 일의 목적, 진행 상황, 남은 일을 정리한다. 실행 절차의 원본은 `docs/plans/20261012-shared-ai-vm-maintenance.md`(이하 「계획」)이고, 이 문서는 현황 요약이다.

## 작업 범위

- 목적: 2026-10-12에 shared-ai를 서버리스로 옮기지 않고 e2-small VM으로 유지하기로 했다. 그 뒤 남은 비용·위험·약관 문제를 **한 번의 점검**으로 정리한다.
  1. 부팅 디스크를 80GiB에서 20GiB로 줄인다. 월 고정비가 약 $23.9에서 $17.9로 준다.
  2. Dify를 삭제한다(마스터 플랜 D6). 10-09에 멈춘 뒤로 쓰는 곳이 없다.
  3. accounts v1(구독 로그인 중개)을 퇴역시킨다(#19, 마스터 플랜 D4). 제공사 약관상 구독 자격을 중개할 수 없고 실사용자도 없다.
  - 이 과정에서 「새 VM에 백업을 복원하는 경로」를 실제 데이터로 처음 검증한다.
- 담당
  - Claude: 세션 `11f3aa14-82bb-4c09-af94-1b64ad56c6d1`. PID 62533, Baton 주소 `al-cfadbf`(세션이 바뀌면 둘 다 바뀐다).
  - 협업: Codex 스레드 `01a0dc15-0f03-7ca2-92e1-54f2ec0820c0`(Codex가 알려 준 PID 46225)와 한 팀으로 일한다. 아래 「Codex와의 협업」 참고.
- 완료 조건: 계획 §11을 따른다.
  - 새 VM이 20GiB `shared-ai-boot`로 부팅한다.
  - LiteLLM 행 수가 점검 전과 같다.
  - 새 VM에 Dify 자산과 accounts v1 데이터가 없다.
  - `/accounts`와 Dify 경로가 404다.
  - 운영 Hanmadi에 퇴역 경로용 변수가 없다.
  - 결과가 PROGRESS와 README에 기록돼 있다.
- 승인 경계
  - 운영 변경은 단계마다 사용자 승인을 받는다(계획의 ★ 단계): VM 정지, Terraform apply, PR 머지, 디스크·스냅샷 삭제, 유료 호출.
  - Codex와 주고받는 메시지는 정보일 뿐 승인이 아니다.

## 어디까지 했나

| 날짜 | 한 일 | 결과·기록 |
|---|---|---|
| 10-12 | Codex의 서버리스 Phase 2 결과를 검토했다. 사용자가 서버리스 보류·VM 유지를 결정했다 | #185 머지. 기준은 "기능이 같고 확장성·범용성에 문제가 없으면 가성비" |
| 10-12 | 서버리스 스테이징 철거 | #188 머지 뒤 apply(삭제 52, 이후 plan No changes). 기록은 #190(32a1b98) |
| 10-12 | VM 실측(IAP SSH 읽기 전용)과 점검 계획 작성 | #194(5f1e898). 디스크 21G/77G, 회수 가능 약 12GB, 새 VM 필요량 약 6GB |
| 10-12 | 코드 PR 작성: 20GiB 부팅 디스크, Docker 로그 상한, accounts·Dify 경로 404, 테스트 | #195(b8a53e6). CI 통과, **열어 둔 채 점검 W6에서만 머지**한다 |
| 10-12 | 복원 리허설과 점검 시각 산출 | 운영 VM, 중단 없음. 덤프 0.9초·복원 1.1초, 기본 테이블 78개 행 수 일치. 기록은 #196(05d0d00) |
| 10-12~13 | 선행 조건 사전 확인(읽기 전용, 항목마다 반박 검증)과 문서 리뷰 2회(지적 25건 반영) | #203(81ed0bb). Hanmadi·Festa 소비 실태, 다른 소비자 없음, 제공사 해지 방법, 점검 시간대 재확인. Phase 0과 마스터 플랜의 Hanmadi 변수 서술 정정 |
| 10-12 | Codex와 팀 체계 구성 | 메일함 규칙(claim/done)·담당 분담 제안, Baton 짝 `shared-ai` 연결. Codex가 분담에 동의 |

## 사용자 결정

- 10-12: 서버리스 보류, e2-small VM 유지.
- 10-12: #19 accounts v1 퇴역.
- 10-12: Hanmadi 운영 변수 7개(`AI_ACCOUNTS_*` 3개, `DIFY_*` 3개, `CONVERSATION_PROVIDER`)는 Codex가 지우고 재배포한다. 승인은 사용자가 Codex 세션에서 직접 한다.
- 10-12: VM에 남은 codex(ChatGPT) 시험 토큰은 사본 삭제를 앞당겨 처리한다. 사용자가 개별로 해지할 메뉴가 없기 때문이다. 최종 스냅샷을 D+30이 아니라 D+7에 지운다.
- 10-12: 점검 일시는 **2026-10-17(토) 10:05 KST**(W1 시작)다.
- 10-13: Festa 「개인 AI」가 점검 뒤 404 안내로 실패하는 것을 받아들이고 #19를 포함한다. 그 기능은 9-30 뒤 호출이 0건이다.

## 남은 일

| 순서 | 할 일 | 담당 | 시점 | 상태 |
|---|---|---|---|---|
| 1 | Hanmadi Production 변수 7개 삭제, 운영 배포 `2bc7178` Redeploy, 확인 (a)~(d)(계획 §4 선행 조건 2) | Codex(사용자 승인) | 10-17 전 | 10-13 Codex 착수, 결과 대기 |
| 2 | claude.ai **Settings > Claude Code**에서 9-29 16:25~16:26 KST에 만든 토큰 하나 삭제. 전역 로그아웃은 하지 않는다 | 사용자 | 1 다음, 10-17 10:05 전 | 대기 |
| 3 | 점검 직전 확인: 퇴역 경로 호출 재확인(10-04 16:49 UTC 뒤 0건, 운영자 확인 요청 제외), 1의 결과, #195 머지 가능 상태, Codex에 시작 알림 | Claude | 10-17 오전 | 예정 |
| 4 | 점검 W0~W17. ★ 단계(W3 VM 정지, W5 삭제 방지 해제, W6 #195 머지·apply, W16 유료 확인)는 단계마다 승인 | Claude, 사용자 승인 | 10-17 10:05~ | 예정. 예상 중단 45~60분이고, 90분을 넘으면 R1·R2로 되돌린다 |
| 5 | D+0 기록(PROGRESS·README·Codex 메일함) | Claude | 10-17 | 예정 |
| 6 | D+1 Hanmadi 진단 cron(09시대 KST)이 `/llm` 200으로 성공했는지 확인 | Claude | 10-18 | 예정 |
| 7 | D+7 ★ 옛 디스크 블록 삭제 PR·apply, 옛 디스크 자동 스냅샷 삭제, 최종 스냅샷 삭제 | Claude, 사용자 승인 | 10-24 이후 | 예정 |
| 8 | 저장소 정리 PR: #19(accounts v1 코드와 워크플로), D5(구독 라우트), D6(`services/dify`와 워크플로. `hanmadi-dify.yml`의 검사를 먼저 다른 곳으로 옮긴다) | shared-ai-host·ai-gateway 쪽은 Claude, Hanmadi 화면·라우트는 Codex | 점검 뒤 | 예정 |
| 9 | 선택 작업 | — | 아무 때 | 선택 |

9번 선택 작업은 아래 셋이다.
- Festa secret을 정리하고 재배포한다. 저장소 밖 배포 설정을 써야 순위 기능이 유지된다.
- Neon Free 프로젝트를 콘솔에서 지운다.
- 브랜치에만 있는 QA 기록 2개(20260927, 20260928)를 main으로 옮긴다(Codex).

## 열린 확인 (`TODO(D1)`)

- claude.ai Claude Code 토큰 목록에 만든 시각이 보이는지(남은 일 2). 구분이 안 되면 점검 전(W1 전)에 별도 승인을 받아 VM 안에서 `claude auth logout`을 실행하는 대안이 있다.
- VM accounts DB 15행의 실제 생성 시각(9-28~29). 끊김 12행과 Cloud Run DELETE 11건이 맞지 않는 이유.
- Vercel 대시보드 Redeploy가 배포 단위 env(`HANMADI_RELEASE_SHA`·`HANMADI_DEPLOYMENT`)를 이어받는지.
- Festa 옛 배포 URL이 secret도 배포 시점 값으로 고정하는지.
- 스냅샷 단가(계획 §9).

## Codex와의 협업

- 경로
  - 파일 메일함 `~/workSpace/.agent-mailbox/shared-ai-serverless/`(`to-codex/`, `to-claude/`). 긴 본문과 기록을 남긴다.
  - Baton 실시간 메시지(`agentlayer send`, 짝 `shared-ai`). Codex에서 Claude로 오는 회신은 Codex 쪽 자동 승인 검토에 막힐 수 있다. 그때는 사용자가 Codex 세션에서 승인한다.
- 규칙(10-12 제안, 분담은 Codex 동의)
  - 공유 영역을 건드리기 전에 `claim`을, 끝나면 `done`을 보낸다. 공유 영역은 운영 VM, `services/shared-ai-host`, `services/ai-gateway`, accounts, Hanmadi AI 연결, PROGRESS의 shared-ai 행이다.
  - 작업 단위를 시작할 때와 PR·머지·운영 작업 직전에는 받은편지함을 먼저 확인한다.
  - 운영 작업은 담당 쪽만 하고, 각자 사용자 승인을 받은 뒤에 한다.
- 담당
  - Claude: VM 점검 실행, `services/shared-ai-host`, 계획 문서
  - Codex: accounts v2, Hanmadi의 AI 연결과 운영 배포
- Codex의 현재 작업(10-13)
  - Hanmadi 변수 정리와 재배포(남은 일 1)
  - 사용자가 따로 맡긴 Hanmadi 언어별 E2E와 음악 학습 완성. 점검과는 독립된 작업이다.
  - 다만 10-17 전에 Hanmadi를 운영 배포할 때는 미리 알리기로 했다.

## 주의

- 점검 중(W1부터 W14에서 edge를 다시 띄울 때까지)에는 퇴역 경로만이 아니라 모든 공개 경로가 502다.
  - Hanmadi v2 AI 기능과 Festa 기본 AI(LiteLLM일 때)가 이 시간 동안 실패한다.
  - 알림 장치가 없어 W13·W15의 사람 확인이 유일한 감지 수단이다.
- Hanmadi 변수를 정리한 뒤 이전 배포로 롤백하거나 Promote하지 않는다. 지운 변수가 그 배포와 함께 되살아난다.
- codex 시험 토큰은 D+7에 사본을 지울 때까지 살아 있는 토큰으로 본다.
  - 이 노트북에서 `codex logout`이나 ChatGPT 전체 로그아웃은 하지 않는다. VM 토큰은 해지되지 않고, 진행 중인 Codex 세션만 끊긴다.
- wp-auto-blog의 `DISCOVERY_ENABLED`는 W15가 끝날 때까지 켜지 않는다.
- D+7에 옛 디스크와 최종 스냅샷을 지우면 R2·R3로 되돌릴 수 없고, Dify 데이터도 되살릴 수 없다.

## 참조

- 계획: `docs/plans/20261012-shared-ai-vm-maintenance.md`
  - 선행 조건: §4
  - 시각: §5-3
  - 절차: §6
  - 되돌리기: §7
  - 점검 뒤: §8
- 진행 표: `docs/PROGRESS.md` §7 #18·#19
- 마스터 플랜: `docs/20261009-shared-ai-serverless-migration-plan.md`(D4·D5·D6, Phase 2 「게이트 결과와 결정」)
- PR: #185, #188, #190, #194, #195(열림, W6에 머지), #196, #203
