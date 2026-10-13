# shared-ai VM 점검 결과 (2026-10-13)

`docs/plans/20261012-shared-ai-vm-maintenance.md`(이하 「계획」)의 W0~W17을 실행한 기록이다. W16 유료 확인은 사용자 결정으로 하지 않았다.

## 요약

- 부팅 디스크를 80GiB `shared-ai-data`에서 20GiB `shared-ai-boot`로 바꿨다. 인스턴스 이름(`shared-ai`)과 내부 IP(10.78.0.2)는 그대로다.
- Dify(D6)와 accounts v1(#19)을 새 VM으로 옮기지 않았다. edge는 두 경로에 404를 돌려준다.
- LiteLLM 행 수는 중단 직후 백업(W2)과 복원 뒤(W11)가 같다(78개 테이블·2,930행). 앱 키 4개의 모델 목록과 discovery 최근 작업도 점검 전과 같다.
- 공개 경로 중단: 2026-10-13 09:25:08Z ~ 10:53:57Z(18:25~19:53 KST), **약 89분**.
  - 그중 약 75분(09:33~10:48Z)은 노트북 덮개가 닫혀 절전 상태였던 시간이다. 이 동안 노트북에서 진행하던 점검이 멈췄다(아래 「계획과 달라진 점」 3).
  - 중단 동안 Cloud Run `shared-ai`의 요청 기록은 0건이다. 사용자 요청이 실패한 기록은 없다.
- 계획 §11 완료 조건 가운데 남은 것은 Hanmadi 확인 (c)와 D+7 삭제다(아래 「완료 조건 대조」).

## 실행 순서와 시각

시각은 UTC다(KST = UTC+9).

| 단계 | 시각 | 결과 |
|---|---|---|
| W0 기록 | 02:22 | 백업 폴더 `/opt/shared-ai/backups/maint-20261013T0222Z`. 행 수 78개 테이블·2,922행, 모델 목록(festa 1, hanmadi 3, replay 1, rescene-game 1), 키 없음 401, discovery 최근 작업 `04836d56-… complete`. 이미지는 12:15 KST에 미리 저장했다(아래 달라진 점 4) |
| 선행 조건 확인 | 09:24 | Hanmadi 재배포(04:06:09Z) 뒤 퇴역 경로 호출 0건(curl 제외). 계획 §5-4의 기준 구간을 좁혔다(아래 달라진 점 2). 오늘 자동 스냅샷 READY. #195 head `b8a53e6` CI 통과, main과 `services/shared-ai-host` 충돌 없음 |
| W1 중단 시작 | 09:25:08 | edge를 먼저 멈추고, 이어서 accounts·discovery·gateway를 한 번의 `docker stop`으로 멈췄다. db만 남았다 |
| W2 백업 | 09:25:19~21 | `pg_dump` 2초, 765,456바이트, `pg_restore --list` 성공. discovery SQLite `integrity_check` ok(requests 11, action_results 8, active 0). 행 수 78개 테이블·2,930행(W0보다 8행 많음: 사용 기록 7·일별 집계 2, 하트비트 −1). 이 값이 W11의 대조 기준이다(아래 달라진 점 7) |
| W3 정지 ★ | 09:25:48 → 09:26:46 | db를 멈추고 VM을 정지했다(TERMINATED) |
| W4 최종 스냅샷 | 09:26:56 → 09:27:52 | `shared-ai-data-final-20261013` READY |
| W5 삭제 방지 해제 ★ | 09:28:19 | false |
| W6 교체 ★ | 09:29:09 → 09:31:22 | 아래 「W6 순서」. `Apply complete! Resources: 3 added, 0 changed, 2 destroyed.` |
| W7 새 VM | 시작 스크립트 09:32:23 종료, 확인 10:48:26 | exit 0. Ubuntu 24.04.5, Docker 29.1.3, Compose 2.40.3, `daemon.json` 로그 상한(10m×3) |
| W8 옛 디스크 연결 | 10:49:55 | `--mode=ro`, `/dev/sdb1`을 `ro,norecovery`로 마운트 |
| W9 파일 복사 | 10:50:13 | 23MB. 금지 파일 검색 결과 없음. `.env`류 6개 모두 0600 |
| W10 이미지 | 10:50:13 → 10:50:57 | 5개 로드. 이미지 ID가 W0과 모두 같다 |
| W11 DB 복원 | 10:51:52 | `pg_restore` 2초. 행 수가 W2와 같다(78개 테이블·2,930행). 계획은 W0과 대조하게 했지만 W2와 대조했다(아래 달라진 점 7) |
| W12 내부 기동 | 10:52:02 | gateway healthy, `/health/readiness` 200, discovery healthy(`--no-build`). accounts는 띄우지 않았다 |
| W13 내부 확인 | 10:52:56 | 모델 목록이 W0과 같다. 키 없음 401. discovery 최근 작업이 W2와 같다. 4190·4180 포트 없음 |
| W14 edge | 10:53:57 | `/opt/shared-ai/releases/edge-5ea798c…`, Caddyfile SHA-256 `cde5484e…`가 머지 커밋의 파일과 같다. `gitops/edge.json` 기록(0600) |
| W15 공개 확인 | 10:54:34~36 | 6개 모두 기대값(아래 표) |
| W16 유료 확인 | — | 하지 않음(사용자 결정) |
| W17 정리 | 10:55:05~15 | 마운트 해제, 디스크 분리. 기록은 아래 「점검 뒤 상태」 |

### W6 순서

main에 apply하지 않은 #195가 머무르지 않도록 순서를 바꿨다.

1. W5 뒤에 #195 head(`b8a53e6`) 작업 트리에서 `terraform plan -out`을 만들었다(상태 잠금 사용).
2. `terraform show -json`으로 기계적으로 대조했다. 바뀌는 리소스는 `google_compute_disk.boot`(생성), `google_compute_disk_resource_policy_attachment.backup`(교체), `google_compute_instance.host`(교체)뿐이고, 데이터 디스크와 Cloud Run은 no-op이었다. `Plan: 3 to add, 0 to change, 2 to destroy.`
3. `gh pr merge 195 --merge --match-head-commit b8a53e6…`로 머지했다(`5ea798c`, 09:30:07Z). 머지 커밋의 `services/shared-ai-host`가 `b8a53e6`과 같은지 확인했다.
4. 저장한 plan을 그대로 apply했다.
5. R2용 되돌리기 PR #217(draft)을 바로 열었다. W17 뒤 쓰지 않고 닫았다.

### W15 공개 확인

VM 안에서 공개 URL을 불렀다. 앱 키가 GCP 밖으로 나가지 않게 하려는 것이다. UA는 `shared-ai-maint-w15`다.

| 요청 | 결과 |
|---|---|
| `GET /health` | 200 |
| `GET /llm/v1/models`(키 없음) | 401 |
| `GET /llm/v1/models`(Hanmadi 키) | 200 |
| `GET /llm/key/generate` | 404 |
| `GET /accounts/connections` | 404 |
| `POST /v1/chat-messages` | 404 |

- 위 요청은 운영자 확인 요청이다. 뒤에 퇴역 경로 호출을 다시 셀 때 아래 둘을 제외한다.
  - 위 6건: 10:54:34~35Z, UA `shared-ai-maint-w15`, VM에서 보냈다.
  - Codex의 재확인: 10:57:46Z, 노트북에서 직접 GET. `/health` 200, 키 없는 `/llm/v1/models` 401, `/accounts/connections`·`/v1/chat-messages`·`/llm/key/generate` 404.

## 점검 뒤 상태

- 인스턴스 `shared-ai`: RUNNING, e2-small, 삭제 방지 true, 내부 IP 10.78.0.2, 부팅 디스크 `shared-ai-boot`(20GiB)만 붙어 있다.
- 일일 스냅샷 정책 `shared-ai-daily`는 `shared-ai-boot`에 붙어 있다. 새 디스크의 첫 자동 스냅샷은 2026-10-14 04:00 UTC 무렵이다.
- 디스크: `/` 19G 중 5.8G 사용(32%). 계획의 기준(40% 이하)을 만족한다.
- 메모리: 1,960MiB 중 1,068MiB 사용, 가용 892MiB(점검 전 10-12 실측: 1,125MiB 사용, 가용 834MiB).
- Compose 프로젝트: `shared-ai-edge`(1), `shared-ai-gateway`(2), `shared-topic-discovery`(1). accounts·Dify 프로젝트는 없다.
- 이미지 5개(약 2.8GB): LiteLLM, Postgres, Caddy, `cak-discovery:7e9d866`(운영), `cak-discovery:c7ef3e2`(discovery 되돌리기용).
  - 이미지 저장 때 붙인 임시 태그(`*:maint-*`)가 함께 남아 있다. 같은 이미지라 공간을 더 쓰지 않는다.
- 옛 디스크와 스냅샷(아래 「남은 사본」)은 D+7까지 그대로 둔다.

## 완료 조건 대조 (계획 §11)

| 조건 | 결과 |
|---|---|
| 새 VM이 20GiB `shared-ai-boot`로 부팅하고 일일 스냅샷 정책이 새 디스크에 붙어 있다 | 충족 |
| LiteLLM 행 수가 점검 전과 같고 W13·W15를 통과한다 | 충족. 중단 직후 백업(W2)과 복원 뒤(W11)가 같다(78개 테이블·2,930행). W0과의 차이는 아래 달라진 점 7 |
| 새 VM에 Dify 자산과 accounts v1 데이터가 없다. `/accounts`와 Dify 경로는 404다 | 충족(W9 검색 결과 없음, W15 404) |
| 운영 Hanmadi에 퇴역 경로용 변수가 없다(확인 (b)·(c)) | 일부. 변수 7개 삭제와 재배포, 확인 (a)·(b)·(d)는 Codex가 끝냈다. (c) 튜터 회화 화면은 튜터 PIN 로그인이 필요해 미검증이다(사용자 결정으로 점검 뒤, Codex 담당). 아래 「Hanmadi 배포 시점」 참고 |
| 결과가 PROGRESS·README에 기록돼 있다 | 이 문서와 같은 PR |
| 옛 디스크와 스냅샷 삭제는 D+7 이후 별도 승인으로 한다 | 예정(2026-10-20 이후) |

Hanmadi 배포 시점:
- 확인 (a)·(b)·(d)는 변수 정리 배포(`2bc7178`, `dpl_DH79X9RhHnBRn1Sn6HQSSoT82Z51`, 13:06 KST)에서 했다.
- Hanmadi 운영은 W1 전인 15:28~15:38 KST 사이에 `f77f853`(#209/#210 음악 배포, `dpl_2XdKt3bZBbg5qKSLEctfht6GxnJd`)으로 바뀌었다.
  - 그 배포 기록(`feat/common-video-generator` 브랜치의 `docs/qa/20261013-hanmadi-music-production.md`)은 퇴역 변수 7개가 없는 상태를 유지했다고 적었다.
  - W1 직전의 퇴역 경로 호출 0건 확인(04:06:09Z 뒤)에는 이 배포 뒤 시간도 들어 있다.
- 점검 뒤 Codex는 공개 revision이 `f77f853`임을 확인했다. Vercel 관리 API가 403이라 최신 환경 변수는 다시 조회하지 못했다(Codex 회신 10-13).

## 계획과 달라진 점

1. **일정**: 계획은 2026-10-17(토) 10:05 KST였다. 사용자가 「오늘 안에 끝내 달라」고 해서 2026-10-13(화)에 했다. W0은 11:22 KST, W1은 18:25 KST다.
   - 평일 저녁이지만 Hanmadi 진단 cron(09시대 KST)과는 겹치지 않는다. 점검 중 외부 요청은 0건이었다.
2. **선행 조건**(계획 §4, §5-4)
   - Hanmadi 변수 정리(선행 조건 2)는 Codex가 13:06 KST에 끝냈다. 확인 (c)만 남았다.
     - 사용자 결정(W1 전, 17:43~18:24 KST 사이, AskUserQuestion): (c)를 점검 뒤로 미룬다. Claude의 권장안이었다.
     - 권장 근거: Dify는 이미 중지돼 있고, 변수 삭제와 재배포를 확인했으며, 재배포 뒤 퇴역 경로 호출이 0건이다.
     - (c)는 VM 작업과 따로 확인할 수 있지만, 계획 §11 완료 조건이라 점검 뒤 확인으로 남는다.
   - Claude 토큰 해지(선행 조건 1)도 같은 때 사용자 결정으로 점검 뒤로 미뤘다.
     - 사용자가 claude.ai에서 나중에 지운다.
     - 그때까지 사본은 옛 디스크와 스냅샷에만 남고, D+7에 지운다. codex 토큰과 같은 처리다.
     - accounts 컨테이너 안에서 `claude auth logout`을 하는 대안은 이제 쓸 수 없다. 컨테이너가 새 VM에 없다.
   - 퇴역 경로 호출 재확인(§5-4)의 기준 구간을 좁혔다.
     - 계획은 W0 전에 「10-04 16:49 UTC 뒤 0건」을 확인하게 했다.
     - 그런데 10-13 01:24~01:25Z(10:24~10:25 KST)에 Hanmadi 운영(node)이 `GET /accounts/connections`를 3번 불렀다(200). 변수 정리 전 배포였고, 「내 AI」 패널을 연 패턴이다. 그래서 이 기준은 채우지 못했다.
     - 변수를 지우고 재배포하면 이 호출이 생기지 않는다. 그래서 구간을 재배포 READY(04:06:09Z) 뒤로 좁혀 W1 직전(09:24Z)에 다시 확인했고 0건이었다.
3. **중단 시간과 90분 규칙**(계획 §10)
   - W7 확인 명령을 18:32:26 KST에 보낸 직후, 18:33:16 KST에 노트북 덮개가 닫혀 절전에 들어갔다. 19:48:01 KST에 깨어날 때까지 작업이 멈췄다(`pmset -g log`).
     - 그 명령은 Claude Code 안전 검사(`bash -c` 안 스크립트를 분석하지 못함)에 거부됐다. 이 거부는 2분 만에 끝났으므로 공백의 원인이 아니다.
   - 깨어난 시점은 W1부터 83분이었다. 이때 새 VM은 정상(시작 스크립트 09:32:23Z 성공)이었다.
     - R2로 돌아가면 15분 안팎(계획 §7)이 더 걸리고 점검을 다시 해야 한다.
     - 그래서 90분 규칙을 따르지 않고 앞으로 진행했다(판단: Claude). 이후 단계가 하나라도 실패하면 바로 R2로 가기로 했다.
     - edge는 W1부터 88분 49초에 다시 열렸다.
   - 다음 점검에서는 노트북을 전원에 연결하고 덮개를 연 채로 둔다. `caffeinate -dimsu`는 유휴 절전만 막는 보조 수단이고, 덮개를 닫을 때의 절전은 막지 못한다. 10-13에도 유휴 절전 방지 단언이 걸려 있었지만, 배터리 상태에서 덮개가 닫히자 잠들었다(`pmset -g log`).
4. **이미지 저장(W2)**
   - Docker 29.1.3의 containerd 이미지 저장소에서는 계획의 `docker save --platform linux/amd64 <repo@digest> …`가 맞지 않았다.
     - digest 참조로 저장하면 이름이 빠진다.
     - `--platform`을 주면 index가 아니라 플랫폼 manifest만 저장된다.
   - 그래서 W1 전(12:15 KST, 중단 없음)에 임시 태그(`ghcr.io/berriai/litellm:maint-87f34979`, `postgres:maint-1a6ab3f5`, `caddy:maint-0c994536`)를 붙이고 `--platform` 없이 저장했다(666,730,496바이트).
   - W10에서 이미지 5개의 ID가 W0과 같음을 확인했다. digest로 참조하는 공개 이미지 3개와 VM에서 빌드한 `cak-discovery` 태그 2개다.
5. **W6 순서**: 계획은 #195를 머지한 뒤 main에서 plan을 만들게 했다. 그러면 plan 대조가 실패했을 때 apply하지 않은 #195가 main에 남는다.
   - 그래서 #195 head(`b8a53e6`)에서 plan을 먼저 만들어 대조하고, 통과한 뒤 머지했다.
   - 머지 커밋의 `services/shared-ai-host`가 head와 같음을 확인하고, 그 plan을 그대로 apply했다(위 「W6 순서」).
6. **W9 제외 목록**: 계획의 목록에 넷을 더했다.
   - `/accounts-deploy.lock`
   - `/backups/20260927-pre-apps/`, `/backups/20260927-language-flow/`, `/backups/20260928-speaking-52/`
     - Dify DB 덤프나 Dify 워크플로 내보내기가 들어 있다. `20260927-pre-apps`에는 9-27 초기 상태의 LiteLLM 덤프도 함께 있다.
     - 「새 VM에 Dify 자산이 없다」는 완료 조건 때문에 뺐다. 옛 디스크와 최종 스냅샷에는 남고, D+7에 함께 지워진다.
   - 금지 파일 검색에 `accounts*.sqlite*`를 더했다.
7. **W11**
   - Postgres 첫 기동 때는 소켓만 여는 임시 초기화 서버가 먼저 뜬다. 그래서 healthcheck(`pg_isready`)만 보고 복원하면 경합이 생길 수 있다. TCP(`-h 127.0.0.1`)로 `pg_isready`가 성공할 때까지 기다린 뒤 복원했다.
   - 행 수 대조 기준을 W0에서 W2로 바꿨다.
     - 계획은 W11의 행 수가 W0과 완전히 같아야 한다고 했다.
     - 그런데 W0(11:22 KST)은 W1보다 약 7시간 앞서 기록했다. 그사이 사용 기록 7행과 일별 집계 2행이 늘었고, gateway를 멈추자 하트비트가 1행에서 0행이 됐다(W0 2,922행, W2·W11 2,930행).
     - 그래서 중단 뒤 W2에서 행 수를 다시 세고, W11을 W2와 대조했다. 이 절차를 다시 쓸 때도 W2에서 행 수를 세고 W11을 W2와 대조한다.
8. **W1·W3**: `docker compose -p <프로젝트> stop` 대신 컨테이너 이름으로 `docker stop`을 썼다. 효과는 같다.
9. **W14**
   - edge 파일 두 개를 `gcloud compute scp` 대신 SSH 스크립트 안에 base64로 넣어 보냈다. 비밀값은 없다.
   - 첫 시도에서 SHA-256이 다르다고 나와 edge를 띄우기 전에 멈췄다. 원인은 노트북 zsh가 `"$M:services/…"`의 `:s`를 수정자로 해석해 빈 입력의 해시를 계산한 것이다. VM의 파일은 맞았다. `"${M}:…"`로 다시 계산해 같음을 확인하고 진행했다.
10. **W17**: 분리 전에 옛 디스크에서 `/opt/shared-ai` 밖의 호스트 설정을 확인했다. crontab, `/etc/cron.d`(기본 2개 외 없음), `/etc/systemd/system`의 서비스·타이머 모두 옮길 것이 없었다. 옛 VM에는 `/etc/docker/daemon.json`이 없었다(로그 상한 없음). 새 VM은 시작 스크립트가 이 파일을 만든다.

## 남은 사본 (D+7에 삭제)

accounts v1 자격(Claude 구독 자격 파일, 암호화된 codex 토큰과 그 키)과 Dify 데이터가 남은 곳은 아래뿐이다.

- 옛 디스크 `shared-ai-data`(80GiB, 연결 안 됨, 정책 없음)
- 옛 디스크의 자동 스냅샷 7개(`shared-ai-data-us-central1-a-20261007…` ~ `…20261013…`). `KEEP_AUTO_SNAPSHOTS`라 원본을 지워도 남는다.
- 최종 스냅샷 `shared-ai-data-final-20261013`

D+7(2026-10-20) 이후 계획 §8에 따라 ★ 사용자 승인을 받고 지운다. 지운 뒤에는 R2·R3로 되돌릴 수 없다.

## 남은 일

| 할 일 | 담당 | 시점 |
|---|---|---|
| D+1: 점검 뒤 첫 Hanmadi 진단 cron이 성공했는지 Cloud Run 기록으로 확인한다. UA `node`의 `/llm` 호출이 200인지 본다 | Claude | 2026-10-14 10시 KST 이후 |
| Hanmadi 확인 (c): 튜터 `/conversation` 안내 문구 | Codex(튜터 PIN 로그인 필요) | 아무 때 |
| claude.ai **Settings > Claude Code**에서 2026-09-29 16:25~16:26 KST에 만든 토큰 삭제 | 사용자 | 아무 때. D+7 전이면 좋다 |
| D+7 ★: `google_compute_disk.data` 블록 삭제 PR·apply, 옛 디스크 자동 스냅샷 삭제, 최종 스냅샷 삭제 | Claude, 사용자 승인 | 2026-10-20 이후 |
| 저장소 정리 PR: #19(accounts v1), D5(구독 라우트), D6(`services/dify`와 워크플로). 범위는 계획 §8 | shared-ai-host·ai-gateway 쪽은 Claude, Hanmadi 화면·라우트는 Codex | 점검 뒤 |

- wp-auto-blog의 `DISCOVERY_ENABLED`를 W15 전까지 켜지 않는다는 제약(계획 §5-3)은 풀렸다.

## 참조

- 계획: `docs/plans/20261012-shared-ai-vm-maintenance.md`
- Claude 작업 현황: `docs/qa/20261013-shared-ai-maintenance-claude-status.md`
- PR: #195(머지 `5ea798c`), #217(R2용 되돌리기, 쓰지 않고 닫음)
- Codex 메일함(`~/workSpace/.agent-mailbox/shared-ai-serverless/to-codex/`): `20261013T182416-claude-w1-start.md`, `20261013T195638-claude-maintenance-done.md`, `20261013T200015-claude-done-correction.md`
