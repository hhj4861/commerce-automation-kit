# 알림함과 Cloudflare Queues

로컬 Node 서버의 `/notifications`에서 쇼츠 기획·검수·실패·발행 기록과 영상 제작실 작업 완료·실패를 확인한다. 전체/안 읽음 필터, 읽음/안 읽음 전환, 모두 읽음, 이전 알림 더 보기, 원본 작업 이동을 제공한다. 알림은 업무를 대신 승인하거나 생성·업로드를 재실행하지 않는다.

## 저장과 실행

- `SHOPSHORTS_DATA_DIR/notifications.db` (기본 `apps/shopshorts/data/notifications.db`): SQLite WAL/FULL 영속 저장. 앱이 `better-sqlite3`에 직접 의존한다.
- Cloudflare 모드: 작업 저장 → 상태 관측과 outbox 삽입을 하나의 SQLite 트랜잭션으로 기록 → Cloudflare Queues 발행 → HTTP pull → SQLite 알림함 저장 → 원격 ack 순서다. 3초마다 최대 20개를 발행/수신한다. 브라우저는 보이는 동안 5초마다 조회한다.
- 원격 접수 후에도 outbox는 `published` 상태로 보관한다. 알림함 저장을 확인한 뒤에만 삭제한다. 12시간 안에 완료되지 않으면 같은 ID로 재발행하므로 서버가 원격 보관 기간보다 오래 꺼져 있어도 로컬 복구 사본이 남는다.
- 상태가 변하지 않은 재조회는 중복 알림을 만들지 않는다. 같은 상태로 돌아오는 새 전이는 새 알림이다. 처리 중단 후 재전달은 이벤트 ID의 UNIQUE 제약으로 중복 저장하지 않는다.
- SQLite `BEGIN IMMEDIATE`로 여러 연결의 메시지 선점을 보호한다. 30초 처리 임대와 receipt 검증으로 만료된 소비자의 ack/retry를 거부한다.
- 발행 실패는 로컬에서 지수형 대기(1초부터 최대 60초), 최대 5회 뒤 dead 상태로 보관한다. 원격 수신은 60초 임대, 실패 시 30초 뒤 재시도, 최대 재시도 5회 뒤 전용 DLQ로 이동한다. DLQ는 1분마다 확인하고 로컬 dead 보관에 성공한 뒤 ack한다. 알림함의 ‘다시 시도’는 실패한 **알림 전달만** 재처리한다. 유료 생성·광고·발행은 호출하지 않는다.
- 최초 도입은 현재 작업 상태를 알림으로 가져온다. 과거에 관측하지 못한 전이 이력을 만들어내지는 않는다.
- 읽음 상태와 숫자 표시 설정은 Google 사용자 sub의 해시로 분리한다. 기존 토큰 사용자는 `legacy-operator`라는 공용 운영자 상태를 사용한다. 기존 앱처럼 작업과 알림 내용 자체는 공유 워크스페이스다.
- 설정의 ‘새 알림 숫자 표시’를 끄면 메뉴/종 버튼의 숫자만 숨긴다. 생성·보관은 계속하며 알림함에서 조회할 수 있다. 오래된 브라우저의 `shopshorts:notifications` 값은 더 이상 사용하지 않는다.
- 모두 읽음은 조회 당시의 마지막 seq까지만 적용하므로 이후 도착한 알림을 실수로 읽음 처리하지 않는다. 목록은 seq 기준 50개씩 조회한다.
- 인증은 기존 Google/운영 토큰 정책을 사용하며 POST에는 same-origin 검사를 적용한다. 이벤트 원본 오류 메시지나 자격정보는 알림에 저장하지 않는다.

큐는 **Cloudflare**, 소비자와 알림 이력·읽음 상태·복구 outbox는 **Node 서버 + SQLite**다. Node 서버를 다른 호스트에 올릴 때 데이터 디렉터리를 영구 볼륨에 보관한다. 여러 호스트가 같은 큐를 서로 다른 SQLite DB로 소비하면 알림 이력이 분산되므로 이 구성은 하나의 논리적 저장소/서버에 사용한다. Pages/D1 함수 연결과 웹사이트 배포는 별도다.

## 설정과 적용

```sh
# 기본은 계획만 출력. --apply를 붙이면 큐 2개와 HTTP pull 소비자를 생성하고 설정 저장.
node apps/shopshorts/notification-queue.mjs \
  --account <account-id> --token-file /secure/cloudflare-token \
  --data-dir /persistent/shopshorts --queue shopshorts-notifications --apply
```

같은 이름은 재사용하며 기존 Worker 소비자 등 설정이 충돌하면 변경하지 않고 중단한다. 유료 플랜 변경은 수행하지 않는다. 설정은 데이터 디렉터리의 `notification-queue.json`에 저장하며 토큰 본문 대신 파일 경로만 기록한다. 실행 후 Node 서버를 재시작한다. `GET /api/notifications`의 `transport: "cloudflare"`와 `warning: null`로 적용·연결 상태를 확인한다. 첫 연결 오류도 알림함 경고로 표시하고 로컬 큐로 조용히 우회하지 않는다.

파일 대신 다음 환경변수로 배포할 수 있다. 토큰은 서버 Secret으로 주입하며 로그/Git에 저장하지 않는다.

| 변수 | 값 |
|---|---|
| `SHOPSHORTS_NOTIFICATION_QUEUE` | `cloudflare` 또는 명시적인 로컬 개발용 `local` |
| `CLOUDFLARE_ACCOUNT_ID` | 계정 ID |
| `SHOPSHORTS_CF_QUEUE_ID` | 기본 큐 ID |
| `SHOPSHORTS_CF_DLQ_ID` | 실패 큐 ID |
| `CLOUDFLARE_API_TOKEN` | Queues 읽기/쓰기 권한 토큰 |
| `SHOPSHORTS_CF_TOKEN_FILE` | 토큰 환경변수 대신 읽을 파일 |

환경변수가 저장된 설정보다 우선한다. 아무 설정도 없는 개발/테스트 인스턴스는 local이다. Cloudflare를 선택했는데 필수 설정이 없으면 시작을 거부한다. 기존 알림과 읽음 상태는 DB를 유지하여 보존하고 미처리 로컬 메시지는 원격 큐로 발행한다.

2026-09-19 현재 5198 인스턴스에는 `shopshorts-notifications` / `shopshorts-notifications-dlq`를 생성하고 서버 재시작으로 적용했다. 인증 API의 `transport=cloudflare`, `warning=null`, 큐 대기/실패 0과 페이지/정적 파일 HTTP 200을 확인했다. 설정/DB 경로는 `/private/tmp/shopshorts-studio-ui`이며 영구 배포 경로가 아니다. 다른 서버에 배포하기 전에 이 데이터를 영구 경로로 이전해야 한다.

공식 사양: [HTTP pull](https://developers.cloudflare.com/queues/configuration/pull-consumers/), [HTTP publish](https://developers.cloudflare.com/api/resources/queues/subresources/messages/methods/push/), [요금·보관](https://developers.cloudflare.com/queues/platform/pricing/). Free는 하루 10,000 operations/24시간 보관이다. 정상 메시지는 보통 쓰기·읽기·삭제 3회이며 재전달/DLQ는 추가 연산이다. HTTP JSON 발행의 실제 pull 응답에서 평문 JSON을 확인했으므로 문서상 base64 JSON과 둘 다 지원한다.

## API

| 경로 | 동작 |
|---|---|
| `GET /api/notifications?filter=unread&before=<seq>` | 목록, 안 읽음 수, 설정, 큐 대기/실패 수 |
| `POST /api/notifications/:id/read` `{read: boolean}` | 현재 사용자 읽음 상태 |
| `POST /api/notifications/read-all` `{throughSeq: number}` | 지정 시점까지 모두 읽음 |
| `POST /api/notifications/preferences` `{enabled: boolean}` | 현재 사용자 숫자 표시 설정 |
| `POST /api/notifications/retry` `{}` | 실패한 알림 전달 재시도 |

## 이후 큐 공급자 이관 경계

`notification-events.mjs`는 공급자와 무관한 v1 이벤트를 만들고, `notification-transport.mjs`가 로컬 outbox와 원격 전달을 연결한다. `notifications-cloudflare.mjs`의 `publish/pull/ack/retry`만 공급자 API에 의존한다. `id/version/source/sourceId/title/name/kind/occurredAt`을 유지하고 알림 저장소와 계정별 읽음 상태는 메시지 큐와 별도로 이관한다. `drainNotifications`는 로컬 개발용 소비자로 남는다.

SQS는 receive/visibility timeout/delete, GCP Pub/Sub는 pull/ack deadline/ack에 대응시킬 수 있다. Pub/Sub는 pull과 여러 구독자를 지원한다. 특정 HTTP 처리기를 예약 호출하고 속도를 제한하려면 GCP Cloud Tasks가 맞지만 pull 계약 대신 push 처리 진입점이 필요하다. 공식 비교: https://docs.cloud.google.com/pubsub/docs/choosing-pubsub-or-cloud-tasks

이관 순서:

1. 로컬 outbox와 이벤트 ID를 유지한 채 공급자 어댑터를 교체한다. 알림함 저장 확인 후에만 outbox를 완료 처리한다.
2. 동일 이벤트 ID를 사용하는 소비자와 영구 알림 저장소를 연결한다. 중복 전달·임대 만료·재시작·재시도/DLQ를 검증한다.
3. 기존 원격 큐와 DLQ를 배출하고 큐/소비자를 전환한다. 읽음/설정 저장소를 옮길 경우 데이터도 별도로 이전한다. 실제 인증·권한·리전·보관 기간·한도는 이관 시 공식 문서로 확인한다.

현재 jobs/studio JSON 저장과 SQLite outbox는 서로 다른 저장소라 하나의 원자적 커밋은 아니다. 저장 직후 관측하고 주기적으로 재대조해 최신 상태를 복구한다. 두 저장 사이 장애 중에 발생했다가 사라진 중간 전이를 전부 보장하지는 않는다. 이관 시 업무 저장소와 outbox를 동일 트랜잭션으로 옮기는 것이 완전한 이벤트 이력 보장의 선행 조건이다. DB와 WAL의 일관된 백업은 SQLite backup API 또는 서버 정지 후 함께 복사한다. 알림 이력은 자동 삭제하지 않으므로 규모가 커지면 별도 보관 정책이 필요하다.

## 검증

`node --test test/notifications*.test.mjs`: 재전달 멱등성, 여러 연결의 선점, 만료 receipt, 발행 장애/ack 유실/DLQ/장기 중단 복구, 원격 인코딩, 비밀 비노출, 계정 격리, 페이지네이션, 읽음 시점 경합, UI 오류/이동, 실제 HTTP 인증/원본 변경/재시작을 검증한다. 자동 테스트는 격리된 임시 디렉터리와 포트 및 가짜 Cloudflare HTTP 응답을 사용하며 유료 생성·외부 발행을 실행하지 않는다. 실제 Cloudflare 왕복 검증은 합성 메시지의 고정 표식과 ID를 확인해 별도 임시 알림함에 저장한 후 해당 메시지만 ack한다.
