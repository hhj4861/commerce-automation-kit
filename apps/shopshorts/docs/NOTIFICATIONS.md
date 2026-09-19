# 알림함과 로컬 영속 큐

로컬 Node 서버의 `/notifications`에서 쇼츠 기획·검수·실패·발행 기록과 영상 제작실 작업 완료·실패를 확인한다. 전체/안 읽음 필터, 읽음/안 읽음 전환, 모두 읽음, 이전 알림 더 보기, 원본 작업 이동을 제공한다. 알림은 업무를 대신 승인하거나 생성·업로드를 재실행하지 않는다.

## 저장과 실행

- `SHOPSHORTS_DATA_DIR/notifications.db` (기본 `apps/shopshorts/data/notifications.db`): SQLite WAL/FULL 영속 저장. 앱이 `better-sqlite3`에 직접 의존한다.
- 작업 저장 → 상태 관측과 큐 삽입을 하나의 SQLite 트랜잭션으로 기록 → 3초 주기의 소비자가 알림함에 저장 → ack 순서다. 브라우저는 보이는 동안 5초마다 조회한다. 앱 자동 새로고침 설정과 독립적이다.
- 상태가 변하지 않은 재조회는 중복 알림을 만들지 않는다. 같은 상태로 돌아오는 새 전이는 새 알림이다. 처리 중단 후 재전달은 이벤트 ID의 UNIQUE 제약으로 중복 저장하지 않는다.
- SQLite `BEGIN IMMEDIATE`로 여러 연결의 메시지 선점을 보호한다. 30초 처리 임대와 receipt 검증으로 만료된 소비자의 ack/retry를 거부한다.
- 실패는 지수형 대기(1초부터 최대 60초), 최대 5회 뒤 dead 상태로 보관한다. 알림함의 ‘다시 시도’는 실패한 **알림 전달만** 재처리한다. 유료 생성·광고·발행은 호출하지 않는다.
- 최초 도입은 현재 작업 상태를 알림으로 가져온다. 과거에 관측하지 못한 전이 이력을 만들어내지는 않는다.
- 읽음 상태와 숫자 표시 설정은 Google 사용자 sub의 해시로 분리한다. 기존 토큰 사용자는 `legacy-operator`라는 공용 운영자 상태를 사용한다. 기존 앱처럼 작업과 알림 내용 자체는 공유 워크스페이스다.
- 설정의 ‘새 알림 숫자 표시’를 끄면 메뉴/종 버튼의 숫자만 숨긴다. 생성·보관은 계속하며 알림함에서 조회할 수 있다. 오래된 브라우저의 `shopshorts:notifications` 값은 더 이상 사용하지 않는다.
- 모두 읽음은 조회 당시의 마지막 seq까지만 적용하므로 이후 도착한 알림을 실수로 읽음 처리하지 않는다. 목록은 seq 기준 50개씩 조회한다.
- 인증은 기존 Google/운영 토큰 정책을 사용하며 POST에는 same-origin 검사를 적용한다. 이벤트 원본 오류 메시지나 자격정보는 알림에 저장하지 않는다.

현재 구현은 **로컬 Node 서버용**이다. Cloudflare Pages의 D1 함수에는 큐 어댑터가 아직 연결되지 않았다. 클라우드 배포 전 해당 런타임과 저장소를 연결해야 한다. 이번 작업은 클라우드 리소스 생성·배포를 포함하지 않는다.

## API

| 경로 | 동작 |
|---|---|
| `GET /api/notifications?filter=unread&before=<seq>` | 목록, 안 읽음 수, 설정, 큐 대기/실패 수 |
| `POST /api/notifications/:id/read` `{read: boolean}` | 현재 사용자 읽음 상태 |
| `POST /api/notifications/read-all` `{throughSeq: number}` | 지정 시점까지 모두 읽음 |
| `POST /api/notifications/preferences` `{enabled: boolean}` | 현재 사용자 숫자 표시 설정 |
| `POST /api/notifications/retry` `{}` | 실패한 알림 전달 재시도 |

## SQS / GCP 이관 경계

`notification-events.mjs`는 공급자와 무관한 v1 이벤트를 만들고, `drainNotifications(queue, deliver)`는 전달을 담당한다. 큐 계약은 `enqueue(event)`, `receive() → {id, receipt, event}`, `ack(id, receipt)`, `retry(id, receipt)`이다. `id/version/source/sourceId/title/name/kind/occurredAt`을 유지하고 알림 저장소와 계정별 읽음 상태는 메시지 큐와 별도로 이관한다.

SQS는 receive/visibility timeout/delete, GCP Pub/Sub는 pull/ack deadline/ack에 대응시킬 수 있다. Pub/Sub는 pull과 여러 구독자를 지원한다. 특정 HTTP 처리기를 예약 호출하고 속도를 제한하려면 GCP Cloud Tasks가 맞지만 pull 계약 대신 push 처리 진입점이 필요하다. 공식 비교: https://docs.cloud.google.com/pubsub/docs/choosing-pubsub-or-cloud-tasks

이관 순서:

1. 로컬 outbox를 유지한 채 원격 큐 publisher를 추가한다. 원격 접수 확인 후에만 outbox를 완료 처리한다.
2. 동일 이벤트 ID를 사용하는 소비자와 영구 알림 저장소를 연결한다. 중복 전달·임대 만료·재시작·재시도/DLQ를 검증한다.
3. 미처리 로컬 메시지를 배출하고 큐/소비자를 전환한다. 사용자 읽음/설정도 함께 옮긴다. 실제 인증·권한·리전·보관 기간·한도는 이관 시 공식 문서로 확인한다.

현재 jobs/studio JSON 저장과 SQLite outbox는 서로 다른 저장소라 하나의 원자적 커밋은 아니다. 저장 직후 관측하고 주기적으로 재대조해 최신 상태를 복구한다. 두 저장 사이 장애 중에 발생했다가 사라진 중간 전이를 전부 보장하지는 않는다. 이관 시 업무 저장소와 outbox를 동일 트랜잭션으로 옮기는 것이 완전한 이벤트 이력 보장의 선행 조건이다. DB와 WAL의 일관된 백업은 SQLite backup API 또는 서버 정지 후 함께 복사한다. 알림 이력은 자동 삭제하지 않으므로 규모가 커지면 별도 보관 정책이 필요하다.

## 검증

`node --test test/notifications*.test.mjs`: 재전달 멱등성, 여러 연결의 선점, 만료 receipt, 재시도/DLQ, 계정 격리, 페이지네이션, 읽음 시점 경합, UI 오류/이동, 실제 HTTP 인증/원본 변경/재시작을 검증한다. API 테스트는 격리된 임시 디렉터리와 포트를 사용하며 유료 생성·외부 발행을 실행하지 않는다.
