# 플랫폼 스테이징 보완

- 목표: 기존 앱 계약으로 시험할 수 있도록 누락 모델·인증·discovery 영구 상태를 준비한다.
- 기준: f84182f, 소유: 이 구현 브랜치. 운영 VM/공개 URL/진행 중 g1·g2는 변경하지 않는다.
- accounts v1은 기존 마스터 플랜 D4/Phase 7에 따라 이전하지 않는다. Shopshorts·블로그의 discovery 생성은 기존 클라이언트 콜백이며 공용 accounts 필수 의존이 아니다. 이전 호환성 보고의 필수 경로 설명을 정정한다.
- 구현: (1) PostgreSQL Store와 기존 계약 회귀/경쟁 테스트 (2) opt-in 플랫폼 스테이징 모델·discovery 및 보온 선택 (3) loopback IAM 시험 프록시와 격리 검증 절차.
- 완료 조건: 관련 로컬·CI 검증, 본인 변경 commit/push, 검토 가능한 PR. 클라우드 적용과 앱 실호출 통과는 별도 증거로 기록한다.
- 범위 밖: 운영 DB 이관·삭제, accounts v2 신규 기능, 앱 timeout 상향, 자동 유료 재시도.

진행: 구현 중. 비용 관측 완료 후에만 스테이징 리비전 변경을 적용한다. 보온 min=1 옵션은 지연을 비교하기 위한 실험이며 비용 최적화 판정이 아니다.

## 변경과 검증 경계

- 기존 `staging` 모델·edge 이미지는 그대로 유지하고 `platform-staging` 모델 설정(Hanmadi/Festa/Replay alias parity)과 `edge-platforms` 이미지를 추가했다. 실제 활성 여부는 별도 배포 확인 대상이다. Replay alias 지원은 Replay 실사용 확인을 대신하지 않는다.
- `platform_staging=null`, `prepare_platform_staging=false`, `staging_min_instances=0`가 기본이다. 따라서 기본 구성에서 새 서비스나 보온을 활성화하지 않는다.
- discovery는 Postgres의 `discovery` 스키마에 상태를 영구 저장하고 트랜잭션 단위 advisory lock을 플랫폼 → scope 순서로 잡는다. 기존 Store의 멱등성·만료·사용량·최종 상태 코드를 공유한다. VM의 SQLite 경로는 유지한다. Cloud Run에서는 SQLite만 지정하면 시작을 거부한다.
- `PostgresStore.migrate()`는 빈 스테이징 DB에 명시적으로 실행하는 Job이다. 운영 SQLite 이력의 데이터 이관 도구는 이 PR에 없으며, 운영 전환에 사용하면 안 된다.
- discovery는 내부 ingress, 최대 2개·동시성 8이며 Naver HTTPS 요청을 위해 일반 인터넷 egress를 사용한다. JEV 요청에는 자신의 metadata ID 토큰을 `X-Serverless-Authorization`에 추가하고 공급자 키의 `Authorization`은 보존한다. edge의 invoker 권한만 별도로 부여한다. NAT/운영 VM 방화벽 변경은 없다.
- 앱 시험 프록시는 127.0.0.1만 수신하고 고정 스테이징 도메인·허용 API만 전달한다. 관리 경로, Origin 있는 브라우저 요청, 다른 Host·절대 URL·중복 길이 헤더는 거부한다. 키 발급·재시도·자동 보온·응답 모킹은 하지 않는다. ID 토큰은 메모리에만 캐시하며 프로세스는 최대 1시간 후 종료한다.
- 앱 timeout, JEV 판정 기준, 자동 채택 기준을 변경하지 않았다. min=1 옵션은 콜드 지연을 피하는 비교 실험 수단일 뿐이다. 해당 구성에서 실제 앱 응답이 제한 내로 돌아오는지 재측정하기 전에는 지연 문제가 해결됐다고 판정하지 않는다.

## 클라우드 적용 순서 — 아직 실행하지 않음

1. g1/g2 원본 로그의 종료·Scheduler pause를 확인한다. 새 리비전/DB 조회/앱 호출을 관측 창에 섞지 않는다. 이 PR의 머지 승인을 받은 뒤 main에서 `litellm-platform-staging`, `edge-platforms`, `discovery-staging`을 빌드하고 digest를 기록한다.
2. `prepare_platform_staging=true`로 신규 시크릿 컨테이너 5개만 생성한다. **별도 빈 스테이징 discovery DB**의 direct URL, 합성 사용자용 플랫폼 키 JSON, Naver 공급자 자격, 예산·만료를 제한한 discovery 전용 JEV 가상 키를 안전한 경로로 주입한다. 운영 SQLite/플랫폼 키·사용자 자격은 복사하지 않는다. Festa/Replay 공급자 시크릿의 존재와 숫자 버전도 확인한다.
3. `platform_staging`에 discovery digest, 기존 스테이징 edge URL, 아래 7개 숫자 버전을 지정하고 `serve=false`로 Job/권한을 준비한다. 객체를 지정하면 LiteLLM의 추가 공급자 시크릿도 참조하므로 7개 모두 먼저 준비해야 한다.
   - `discovery-stg-database-url`, `discovery-stg-platform-keys`, `discovery-stg-naver-id`, `discovery-stg-naver-secret`, `discovery-stg-jev-key`, `festa-chat-api-key`, `replay-chat-api-key`.
   - `secret_versions`에는 실제 양의 정수 문자열만 넣는다. `latest`는 거부된다. 비밀값 자체는 tfvars/state/로그에 넣지 않는다.
4. `discovery-stg-migrate` Job의 성공을 확인한다. 실패하면 serve를 켜지 않는다. 이어 `serve=true`로 내부 discovery와 edge의 업스트림 환경변수를 적용한다. 새 edge 이미지와 LiteLLM 플랫폼 이미지를 digest로 배포한다. Terraform의 기존 LiteLLM/edge image ignore 규칙 때문에 tfvars 변경만으로 이미지가 바뀌었다고 간주하지 않는다.
5. 이미지·revision·모델 목록과 무인증 거부를 확인한다. 보온 앱 시험을 선택할 때만 `staging_min_instances=1`로 바꾼다. 공급자 실호출 전 준비 상태를 확인하고, 최초/유휴 후 앱 응답 시간과 별도 비용을 기록한다. 마지막에는 min=0 복구를 실제 확인한다.
6. 격리된 앱 checkout과 합성 사용자·전용 시험 키로 아래 실제 화면 흐름을 검증한다. 운영 앱 env/DB는 수정하지 않는다. 종료 후 시험 키를 폐기하고 401을 확인한다. live 호출 건수·비용 상한은 실행 전 확정하며, 기존 48회 PoC 예산이 새 앱 테스트에 자동으로 늘어났다고 취급하지 않는다.

## 앱 시험 연결

```sh
python3 services/shared-ai-host/poc/app_proxy.py \
  --edge https://shared-ai-stg-d5cy7m6i7q-uc.a.run.app \
  --account guswhd1085@gmail.com --port 4196 --confirm-trial
```

프록시 실행 자체는 요청을 보내지 않는다. 앱 요청이 들어오면 실제 스테이징/제공사를 호출하므로 무료 모의 시험이 아니다.

- Hanmadi: 시험 프로세스의 `LITELLM_BASE_URL=http://127.0.0.1:4196/llm`, 모델별 스테이징 키를 주입한다. 대화 → 사용자 화면, 음성 업로드 → 전사, 합성 → 실제 재생을 확인한다. 앱의 30초 제한은 유지한다. native 영상/JEV는 별도 요청 사례로 검증한다.
- Festa: HTTPS 전용 URL 검증을 유지한다. 로컬 시험 인증서(127.0.0.1/localhost SAN)와 키를 승인된 로컬 비밀 보관 위치에 만들고 프록시의 `--tls-cert/--tls-key`에 전달한다. **시험 Node 프로세스만** `NODE_EXTRA_CA_CERTS`로 해당 인증서를 신뢰한다. `NODE_TLS_REJECT_UNAUTHORIZED=0`은 사용하지 않는다. `LITELLM_BASE_URL=https://127.0.0.1:4196/llm`, `festa-travel` 및 해당 JEV 설정으로 질문 생성→후속 질문→결과를 확인한다.
- Shopshorts: 시험 계정 워커에 `DISCOVERY_URL=http://127.0.0.1:4196/discovery`, `DISCOVERY_ALLOW_LOCALHOST=1`과 별도 플랫폼 키를 주입한다. 생성은 기존 사용자 선택 런타임 콜백이 담당한다. 공용 accounts v1을 복원하지 않는다. 추천 버튼→조사→생성→JEV→표시의 각 증거를 남긴다.
- 블로그: 같은 discovery 경로를 쓰는 격리된 CLI/테스트에서 현재 Python 클라이언트의 HTTPS/localhost 설정을 먼저 확인한다. localhost 비허용이면 위 TLS 프록시와 해당 시험 프로세스의 인증서 신뢰를 사용한다. 자동 게시 워크플로는 실행하지 않는다.
- Replay: 실제 사용 경로가 확인되지 않았으므로 alias parity만 기록한다. 앱 시험 통과로 집계하지 않는다.

## 근거

[PostgreSQL 트랜잭션 잠금](https://www.postgresql.org/docs/16/explicit-locking.html), [Psycopg 트랜잭션](https://www.psycopg.org/psycopg3/docs/basic/transactions.html), [Cloud Run 서비스 간 인증](https://docs.cloud.google.com/run/docs/authenticating/service-to-service), [개발자 ID 토큰](https://docs.cloud.google.com/run/docs/authenticating/developers)을 대조했다. 별도 Authorization을 보존할 때 X-Serverless-Authorization을 사용하며, 토큰 audience는 수신 서비스의 URL이다.

## 검증 결과

- 로컬 SQLite/서비스 테스트 85개 실행: 성공, PostgreSQL 전용 6개는 DB 미설치로 skip. 이를 PostgreSQL 통과로 보고하지 않는다.
- 호스트/프록시 테스트 83개, LiteLLM 설정 9개, metadata 인증 4개 통과. Terraform fmt/validate 통과.
- 실제 PostgreSQL 16에서 동일 전체 계약 + 경쟁 테스트, 실제 Caddy 플랫폼 라우팅, Docker 런타임 import는 CI 결과 확인 중이다.
- 클라우드 apply/이미지 배포·새 시크릿 값 등록·유료 앱 호출·운영 이관: 실행하지 않음.
