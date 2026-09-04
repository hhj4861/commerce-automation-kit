# meta-paid-reach

Meta 공식 Marketing API만 사용해 테스트 광고를 만들고, `impressions`, `spend`,
`status`를 확인해 **1,000 impressions 이상 또는 지출 상한 도달 시 자동 PAUSE**하는
관리자용 PoC다.

이 패키지는 "1,000회 노출을 이미 보장한다"는 완성 상품이 아니다. 실제 계정에서
타깃·소재·심사·CPM을 검증하고, 설정한 예산 안에서 1,000회가 안정적으로 도달하는지를
측정하는 단계다. 지출 상한이 먼저 오면 즉시 중지하고 미달을 투명하게 보고한다.

## 구현 범위

```text
영상 입력(local file | HTTPS URL | 기존 Meta video ID)
  → Campaign 생성(PAUSED)
  → Ad Set 생성(PAUSED, lifetime budget, end time)
  → 새 영상이면 업로드 + 처리 완료 대기
  → Ad Creative 생성
  → Ad 생성(PAUSED)
  → 사람의 Ads Manager 재검수
  → 명시적 LIVE_SPEND 승인
  → Ad → Ad Set → Campaign 순으로 ACTIVE
  → status + impressions + spend 폴링
  → 1,000 impressions 또는 지출 상한
  → Campaign → Ad Set → Ad 순으로 PAUSED
```

Meta의 공식 자료가 설명하는 Campaign → Ad Set → Creative → Ad 모델과
Ads Insights 경로를 그대로 사용한다.

- [Meta 공식 Marketing API Postman 워크스페이스](https://www.postman.com/meta/facebook-marketing-api/overview)
- [Meta 공식 Marketing API 컬렉션 요구사항/권한](https://www.postman.com/meta/facebook-marketing-api/collection/0zr4mes/facebook-marketing-api-mapi)
- [Marketing API 인증](https://developers.facebook.com/docs/marketing-apis/overview/authentication)
- [Graph API 버전 변경 내역](https://developers.facebook.com/docs/graph-api/changelog/versions)
- [공식 Node Business SDK 릴리스](https://github.com/facebook/facebook-nodejs-business-sdk/releases)

기본 버전은 2026-09-04 기준 `v26.0`이다. 버전은 URL에 고정하며,
`META_GRAPH_API_VERSION`으로 교체할 수 있다.

## 안전장치

1. `plan`과 기본 `create`는 네트워크를 호출하지 않는 dry-run이다.
2. 실제 `create`도 Campaign, Ad Set, Ad를 전부 `PAUSED`로 생성한다.
3. PAUSED 생성에도 소재 사용권 확인, 사람 표현 검수, `CREATE_PAUSED` 확인 문구가 필요하다.
4. 실제 집행은 아래 조건을 모두 만족해야 한다.
   - `--execute --confirm LIVE_SPEND`
   - `META_POC_ALLOW_LIVE_SPEND=I_UNDERSTAND`
   - `META_POC_HARD_SPEND_CAP_MINOR`가 설정 예산 이상
   - 아직 지나지 않은 `budget.endTime`
5. Ad Set에는 `lifetime_budget`과 `end_time`을 함께 둔다. 모니터 프로세스 장애 때의
   마지막 방어선이다.
6. 활성화는 자식부터 하고 Campaign을 마지막에 켠다. 중지는 Campaign부터 한다.
7. 활성화 직전에 Meta의 실제 Ad Set이 PAUSED인지, 예산/종료 시각이 승인 범위인지 다시 확인한다.
8. 조회가 연속 3회 실패하거나 최대 확인 횟수가 끝나면 중지한다.
9. `SIGINT`/`SIGTERM`을 받으면 중지를 시도한다.
10. 상태 파일은 단계마다 원자적으로 저장한다. 토큰은 저장하지 않는다.
11. 이미 중지 완료된 상태 파일로 `run`을 다시 실행하는 것을 거부한다.

Insights는 실시간 계수기가 아니므로 1,000에서 정확히 멈추지 않고 초과할 수 있다.
또한 PAUSE 요청 전후의 지연도 있을 수 있다. 그래서 비즈니스 상품의 약속은
"정확히 1,000회"가 아니라 "공식 광고를 통한 최소 1,000회"여야 하며, 가격 설계에는
초과 노출과 보고 지연을 포함한 여유 예산이 필요하다.

## Meta 쪽 사전 준비

### 필수

- Meta Developer 계정과 Meta 앱
- 앱에 Marketing API 제품/사용 사례 추가
- 결제수단과 계정 지출 한도가 설정된 광고 계정
- 광고 계정에 대한 advertiser 이상 권한
- 광고 소재의 발신 주체가 될 Facebook Page와 그 자산 권한
- 랜딩 페이지 HTTPS URL
- `ads_management`, `ads_read` 권한이 들어 있는 User 또는 System User access token

자기 소유 광고 계정만 관리하는 PoC는 공식 컬렉션 기준 낮은 접근 티어와 위 권한으로
시작할 수 있다. 다른 판매자의 광고 계정을 서비스로 관리하려면 App Review,
Business Verification, 권한의 상위 접근 수준이 필요하다. 2026년에는 기존
"Ads Management Standard Access" 명칭이 "Marketing API Access Tier"로 바뀌고
티어 표시도 Limited/Full Access로 변경됐다.

- [Marketing API Access Tier 변경 공지](https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/)
- [Access Token Debugger](https://developers.facebook.com/tools/debug/accesstoken/)

### Instagram도 노출할 때

- Professional(비즈니스/크리에이터) Instagram 계정
- 해당 Instagram 계정과 연결된 Facebook Page
- Business Portfolio에서 광고 계정, Page, Instagram 자산에 대한 사용자/System User 권한
- 설정의 `creative.instagramActorId`
- 설정의 `targeting.publisherPlatforms`에 `"instagram"`

Facebook만 시험할 때는 Instagram 계정이 필수가 아니다. 이때 예제처럼
`publisherPlatforms: ["facebook"]`으로 제한한다.

`business_management`는 이 코드의 직접 호출에는 필요하지 않다. Business Manager API로
고객 자산을 검색·할당하는 기능까지 추가할 때 별도로 검토한다.

## 환경변수

실값은 저장소의 gitignored `.env` 등에 둔다. 이 CLI는 `.env`를 자동 로드하지 않으므로
실행 셸에서 export하거나 기존 운영 방식으로 주입한다.

| 이름 | 필요 시점 | 의미 |
|---|---|---|
| `META_ACCESS_TOKEN` | 모든 Meta 네트워크 호출 | `ads_management`, `ads_read` 토큰 |
| `META_AD_ACCOUNT_ID` | plan/preflight/create | 숫자 또는 `act_숫자` |
| `META_GRAPH_API_VERSION` | 선택 | 기본 `v26.0`; 명시적으로 고정 권장 |
| `META_APP_SECRET` | 선택 | 있으면 Access Token으로 App Secret Proof를 계산해 첨부 |
| `META_POC_ALLOW_LIVE_SPEND` | 라이브 run | 정확히 `I_UNDERSTAND` |
| `META_POC_HARD_SPEND_CAP_MINOR` | 라이브 run | 설정의 lifetime budget 이상인 양의 정수 |

`META_ACCESS_TOKEN`과 `META_APP_SECRET`은 출력·상태 파일에 기록하지 않는다.

## 설정 파일

[`example.config.json`](./example.config.json)을 복사해 사용한다.

영상 입력은 세 방식 중 하나다.

```json
{ "kind": "local-file", "value": "../../output/my-ad.mp4" }
```

```json
{ "kind": "hosted-url", "value": "https://cdn.example.com/my-ad.mp4" }
```

```json
{ "kind": "meta-video-id", "value": "123456789012345" }
```

- `local-file`: 파일을 `act_{account}/advideos`에 multipart 업로드한다.
- `hosted-url`: Meta가 접근 가능한 HTTPS URL을 `file_url`로 전달한다.
- `meta-video-id`: 이미 광고 계정에 업로드되어 처리 완료된 영상 ID를 재사용한다.

예산 단위는 특히 주의한다.

- `lifetimeBudgetMinorUnits`: Meta 생성 API에 전달하는 최소 화폐 단위 정수다.
- `pauseAtSpendAccountCurrency`: Insights의 `spend`가 반환하는 광고 계정 통화 단위다.

KRW/USD 등 계정 통화별 단위를 추정하지 말고 `preflight` 결과와 Ads Manager에서
확인한다. 실제 집행 전에 두 값을 사람이 다시 검수해야 한다.

`specialAdCategories`도 자동 추론하지 않는다. 주거·고용·신용·사회 이슈 등 특별 광고에
해당하는지는 사람이 판정하고 현재 고정 API 버전의 허용값을 입력한다.

## 검증 순서

저장소 루트에서 실행한다.

### 1. 무과금 dry-run

```bash
npm run cli -w @cak/meta-paid-reach -- \
  plan \
  --config packages/meta-paid-reach/example.config.json \
  --account-id act_123456789012345
```

또는 `create`에서 `--execute`를 생략해도 같은 dry-run 계획을 반환한다.

### 2. 계정/자산 읽기 전용 점검

```bash
npm run cli -w @cak/meta-paid-reach -- preflight
```

통화, 시간대, 계정 상태, Page/Instagram 연결 상태를 확인한다. 토큰 권한이 부족하면
이 단계에서 실패한다.

### 3. PAUSED 구조만 실제 생성

설정에서 아래를 실제 검수 내용으로 채운다.

```json
{
  "creativeRightsConfirmed": true,
  "humanApproved": true,
  "approvedBy": "검수자 이름",
  "approvedAt": "2026-09-04T16:00:00+09:00"
}
```

그다음:

```bash
npm run cli -w @cak/meta-paid-reach -- \
  create \
  --config path/to/poc.config.json \
  --state run-001.paid-reach-state.json \
  --execute \
  --confirm CREATE_PAUSED
```

모든 ID는 상태 파일에 즉시 기록된다. 중간 실패 시에도 만들어진 객체 ID가 남고,
집행 객체는 PAUSED 상태다. 같은 상태 파일을 덮어쓰는 재실행은 거부한다.

### 4. Ads Manager 사람 재검수

- Campaign, Ad Set, Ad가 모두 PAUSED인지
- 광고 문안·영상·썸네일·랜딩 페이지가 맞는지
- 타깃 국가/연령/placement가 맞는지
- lifetime budget, 시작/종료 시각, 광고 계정 통화가 맞는지
- 광고 심사 상태와 `issues_info`가 정상인지

CLI 읽기 전용 확인:

```bash
npm run cli -w @cak/meta-paid-reach -- \
  status --state run-001.paid-reach-state.json
```

### 5. 라이브 실행 전 마지막 dry-run

```bash
npm run cli -w @cak/meta-paid-reach -- \
  run --state run-001.paid-reach-state.json
```

이 명령은 활성화하지 않고 목표·지출 상한·확인 주기만 보여준다.

### 6. 제한된 라이브 PoC

```bash
export META_POC_ALLOW_LIVE_SPEND=I_UNDERSTAND
export META_POC_HARD_SPEND_CAP_MINOR=15000

npm run cli -w @cak/meta-paid-reach -- \
  run \
  --state run-001.paid-reach-state.json \
  --interval-seconds 60 \
  --max-checks 1440 \
  --execute \
  --confirm LIVE_SPEND
```

`run` 프로세스를 실제 집행 동안 유지한다. 목표 또는 지출 상한에 닿으면 자동 중지한다.
프로세스가 비정상 종료돼도 lifetime budget과 end time은 Meta 측에 남지만,
운영 환경에서는 별도 프로세스 관리자/헬스체크가 필요하다.

### 7. 독립 1회 확인 또는 긴급 중지

목표 도달 시에만 자동 PAUSE하는 1회 체크:

```bash
npm run cli -w @cak/meta-paid-reach -- \
  check \
  --state run-001.paid-reach-state.json \
  --execute \
  --confirm PAUSE_AT_LIMIT
```

조건과 무관한 즉시 중지:

```bash
npm run cli -w @cak/meta-paid-reach -- \
  pause \
  --state run-001.paid-reach-state.json \
  --execute \
  --confirm PAUSE_NOW
```

## API 경로

| 목적 | 메서드/경로 |
|---|---|
| 계정/자산 preflight | `GET /act_{account}` |
| Campaign 생성 | `POST /act_{account}/campaigns` |
| Ad Set 생성 | `POST /act_{account}/adsets` |
| 영상 업로드 | `POST /act_{account}/advideos` |
| 영상 처리 상태 | `GET /{video_id}?fields=id,status` |
| Ad Creative 생성 | `POST /act_{account}/adcreatives` |
| Ad 생성 | `POST /act_{account}/ads` |
| 상태 조회 | `GET /{ad_id}?fields=...status,effective_status...` |
| 활성화 전 안전 재검증 | `GET /{adset_id}?fields=...lifetime_budget,end_time` |
| 성과 조회 | `GET /{ad_id}/insights?fields=impressions,spend,...` |
| 활성화/중지 | `POST /{object_id}` with `status=ACTIVE|PAUSED` |

POST는 중첩 객체를 JSON 문자열로 넣은 form-urlencoded 요청이며, 로컬 영상만 multipart다.
토큰은 URL이 아니라 `Authorization: Bearer` 헤더로 보낸다.

## 로컬 검증

```bash
npm run typecheck -w @cak/meta-paid-reach
npm run test -w @cak/meta-paid-reach
```

테스트는 실제 Meta 네트워크나 광고 계정을 호출하지 않는다.

## PoC 이후 통과 조건

- 실제 광고 계정에서 PAUSED 생성 경로 성공
- Ads Manager에서 Campaign/Ad Set/Creative/Ad 연결 확인
- 광고 심사 통과
- 1,000 impressions 도달 후 자동 PAUSE 확인
- 최종 `impressions`, `spend`, `status`, `effective_status` 저장 확인
- 지출 상한 도달/조회 실패/프로세스 신호 중지의 안전 경로 확인
- 서로 다른 상품·타깃에서 1,000회 도달 비용 분포 수집

이 조건을 통과하기 전에는 "최소 1,000회 포함"을 판매 문구로 확정하지 않는다.
