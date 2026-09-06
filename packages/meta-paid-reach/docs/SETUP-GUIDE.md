# Meta 자산 설정 가이드 (초보자용, 2026-09-04)

`meta-paid-reach` PoC를 실계정으로 돌리기 전에 Meta 쪽에서 만들어야 하는 것들을
**아무것도 없는 상태에서** 순서대로 따라가는 문서다. README의 「Meta 쪽 사전 준비」가
목록이라면, 이 문서는 그 목록을 클릭 단위로 푼 것이다.

> 메뉴 이름은 Meta가 자주 바꾼다. 아래 이름은 2026-09 기준 한국어 UI 기준이며, 같은
> 이름이 없으면 괄호 안 영어 이름이나 URL로 찾는다. **"공식 확인"** 표시는 이 문서를 쓸 때
> 공식 문서 원문으로 확인한 사실이고, 표시가 없는 UI 경로는 실제 화면에서 다를 수 있다.

---

## 0. 전체 그림 — 무엇을 왜 만드나

| 순서 | 만들 것 | 역할 | PoC에서 쓰는 값 |
|---|---|---|---|
| 1 | Facebook 개인 계정 + 2단계 인증 | 모든 것의 로그인 주체 | — |
| 2 | 비즈니스 포트폴리오(구 비즈니스 관리자) | 광고 계정·페이지·앱·시스템 사용자를 한곳에 묶음 | — |
| 3 | Facebook 페이지 | 광고의 "발신자". 페이지 없이는 광고를 만들 수 없음 | `creative.pageId` |
| 4 | 광고 계정 + 결제수단 | 예산·통화·과금 단위 | `META_AD_ACCOUNT_ID` |
| 5 | Meta 앱(개발자) + Marketing API 제품 | API를 호출하는 프로그램의 신분증 | `META_APP_SECRET`(선택) |
| 6 | 액세스 토큰 | "이 앱이 이 광고 계정을 이 사람 대신 조작해도 된다"는 증표 | `META_ACCESS_TOKEN` |
| 7 | (선택) Instagram 프로페셔널 계정 | 인스타 노출까지 하려면 | `creative.instagramActorId` |
| 8 | 랜딩 페이지 URL + 광고 영상 | 광고 소재 | `creative.landingPageUrl`, `creative.source` |

비용: 1~8 전부 **무료**다. 4단계에서 카드 등록만 필요하고, PoC의 `create`(PAUSED 생성)까지는
과금이 없다. 돈이 나가는 건 README 「검증 순서」 6단계(`LIVE_SPEND`)뿐이다.

소요 시간: 처음이면 1~2시간. 광고 계정·앱은 즉시 생기지만, 새 광고 계정의 첫 광고 심사는
수 시간~하루 걸릴 수 있다.

---

## 1단계. Facebook 개인 계정 보안

1. 광고에 쓸 Facebook 개인 계정으로 로그인한다. 회사 대표 계정이 따로 있으면 그걸 쓴다.
2. 설정 → 보안 및 로그인 → **2단계 인증**을 켠다. 비즈니스 포트폴리오와 개발자 도구는
   2단계 인증이 없으면 여러 기능을 막는다.
3. 계정이 만들어진 지 얼마 안 됐거나 광고 이력이 없으면 신규 광고 계정이 "위험 검토"에
   걸릴 수 있다. 정상 현상이며 결제수단 등록과 첫 소액 광고로 풀린다.

**끝난 상태:** 2단계 인증 ON.

---

## 2단계. 비즈니스 포트폴리오 만들기

URL: https://business.facebook.com/

1. 처음이면 "비즈니스 포트폴리오 만들기"(Create a business portfolio)가 뜬다. 이름·본인 이름·업무용 이메일을 넣는다.
2. 만들어지면 **비즈니스 설정**(Business settings) 화면으로 들어간다. 이 화면이 앞으로
   자산을 연결하는 허브다. 직접 URL: https://business.facebook.com/settings/
3. 왼쪽 메뉴에 "사용자 / 계정 / 데이터 소스 / 브랜드 가치 보호 …"가 보이면 정상이다.

비즈니스 인증(사업자등록증 제출)은 **본인 광고 계정만 쓰는 PoC에는 필요 없다.**
남의 광고 계정을 서비스로 관리할 때(Full Access 승격) 필요하다.

**끝난 상태:** 비즈니스 설정 화면 진입 가능.

---

## 3단계. Facebook 페이지 만들기 + 포트폴리오에 연결

페이지는 광고의 "누가 보낸 광고인지"다. 상품 브랜드 이름으로 만든다.

1. https://www.facebook.com/pages/create 에서 페이지 이름·카테고리를 넣고 만든다.
   프로필 사진·소개는 나중에 채워도 되지만, 완전히 빈 페이지는 심사에서 불리하다.
2. 비즈니스 설정 → **계정 → 페이지** → 추가 → "페이지 추가"(내 소유 페이지 연결).
3. 페이지 ID 확인: 페이지 → 소개(About) → 맨 아래 "페이지 ID". 또는 비즈니스 설정의
   페이지 목록에서 이름 아래 숫자. 숫자만 복사한다.

`creative.pageId` = 이 숫자.

**끝난 상태:** 비즈니스 설정 → 페이지 목록에 보이고, 페이지 ID 숫자를 적어 둠.

---

## 4단계. 광고 계정 만들기 + 결제수단 + 지출 한도

### 4-1. 광고 계정 생성

1. 비즈니스 설정 → **계정 → 광고 계정** → 추가 → **새 광고 계정 만들기**.
2. 이름, **시간대 = Asia/Seoul(서울)**, **통화 = KRW(대한민국 원)** 를 고른다.
   - 통화·시간대는 나중에 바꾸기 어렵다(바꾸면 사실상 새 계정이 된다). 처음에 맞게 고른다.
   - **통화가 곧 예산 단위다.** 공식 통화 표(공식 확인, 2026-09-04)에서
     KRW의 offset은 **1**, USD는 **100** 이다. 즉
     - KRW 계정: `lifetimeBudgetMinorUnits: 15000` = **15,000원**, Insights의 spend도 원 단위.
     - USD 계정: `lifetimeBudgetMinorUnits: 15000` = **$150.00**, Insights의 spend는 달러(150.00).
     KRW면 설정 파일의 두 예산 값이 같은 단위라 헷갈릴 일이 없다. 이 PoC는 KRW 계정을 전제로 예제를 만들었다.
3. "이 광고 계정을 누가 쓰나"에서 본인을 **관리자**(전체 관리)로 지정한다.
4. 광고 계정 ID 확인: 광고 계정 목록에서 이름 아래 숫자, 또는 Ads Manager를 열었을 때
   주소창 `act=1234567890` 의 숫자.

`META_AD_ACCOUNT_ID` = `act_1234567890` (앞에 `act_`를 붙여도, 숫자만 넣어도 CLI가 처리한다).

### 4-2. 결제수단 등록

1. https://business.facebook.com/settings/payment-methods (또는 Ads Manager → 결제 설정).
2. 카드를 등록한다. 결제수단이 없으면 광고가 PAUSED여도 심사가 진행되지 않거나 계정이
   "미결제" 상태로 표시된다.

### 4-3. 계정 지출 한도 (권장 안전장치)

같은 결제 설정 화면에 **계정 지출 한도**(Account spending limit)가 있다. PoC 예산의
2배 정도(예: 30,000원)로 걸어 둔다. 코드의 `lifetime_budget`·`end_time`·지출 상한 PAUSE에
더해, Meta 쪽에서 한 번 더 막는 마지막 방어선이 된다. 한도에 닿으면 모든 광고가 멈춘다.

**끝난 상태:** 광고 계정 ID 확보, 결제수단 등록, 지출 한도 설정. 비즈니스 설정에서
광고 계정 상태가 "활성"이어야 한다.

---

## 5단계. Meta 개발자 계정 + 앱 + Marketing API

URL: https://developers.facebook.com/

### 5-1. 개발자 등록

1. 오른쪽 위 "시작하기"(Get started) → 약관 동의 → 연락처 인증 → 역할 선택(개발자).
2. 끝나면 "내 앱"(My Apps) 메뉴가 생긴다.

### 5-2. 앱 만들기

1. 내 앱 → **앱 만들기**(Create app).
2. 사용 사례(use case)를 묻는 화면이 나오면 광고/Marketing API 관련 항목을 고른다.
   없으면 "기타"(Other) → 앱 유형 **비즈니스**(Business)를 고른다.
3. 앱 이름(예: `cak-meta-paid-reach-poc`), 연락 이메일, **비즈니스 포트폴리오 = 2단계에서
   만든 것**을 선택한다. 여기서 포트폴리오를 연결해야 6단계의 시스템 사용자 토큰을 만들 수 있다.

### 5-3. Marketing API 제품 추가

1. 앱 대시보드 왼쪽 "제품 추가"(Add product) → **Marketing API** → 설정.
2. 추가하면 자동으로 **Limited Access**(구 Development Access) 티어가 된다.
   공식 문서(공식 확인): *"If your app is only managing your ad account, standard access to
   the ads_read and ads_management permissions are sufficient."* — 즉 **본인 광고 계정만
   다루는 PoC는 App Review가 필요 없다.** Limited Access는 광고 계정 수 제한 없이 쓸 수
   있고, 다만 호출 속도 제한이 빡빡하다. 이 PoC는 1분에 1~2회 조회라 문제 없다.
3. 앱은 **개발 모드**(Development mode) 그대로 둔다. 라이브 모드로 바꿀 필요 없다.
   개발 모드에서는 앱에 역할(관리자/개발자/테스터)이 있는 사람만 앱을 쓸 수 있는데,
   본인이 관리자이므로 충분하다.

### 5-4. 앱 ID·앱 시크릿

앱 설정 → 기본 설정(Basic)에 **앱 ID**와 **앱 시크릿**(표시 버튼)이 있다.

- 앱 시크릿은 `META_APP_SECRET`(선택)에 쓴다. 앱 설정 → 고급 설정에서 "앱 시크릿 증명 필요"
  (Require App Secret)를 켰다면 필수다. 안 켰으면 비워도 된다.
- 앱 시크릿은 비밀번호다. 저장소·채팅·스크린샷에 넣지 않는다.

**끝난 상태:** 앱 대시보드에 Marketing API 제품이 보이고, 앱이 비즈니스 포트폴리오에 연결됨.

---

## 6단계. 액세스 토큰 만들기

토큰 종류는 두 가지다. **처음엔 A로 빨리 확인하고, 실제 PoC는 B로** 하는 것을 권한다.

| | A. 사용자 토큰(Graph API 탐색기) | B. 시스템 사용자 토큰(비즈니스 설정) |
|---|---|---|
| 만들기 | 1분 | 10분 |
| 만료 | 1~2시간(장기 교환 시 60일) | 60일 또는 만료 없음 선택 |
| 주체 | 내 개인 계정 | 비즈니스 소속 "로봇 사용자" |
| 용도 | 권한·연결 빠른 확인 | 무인 실행, 공유 PC, 재현 가능 |

### 6-A. Graph API 탐색기로 빠르게

URL: https://developers.facebook.com/tools/explorer/

1. 오른쪽 "Meta 앱" 드롭다운에서 5단계 앱을 고른다.
2. "사용자 또는 페이지" → **사용자 토큰 받기**(Get User Access Token).
3. 권한(permissions) 목록에서 **`ads_management`**, **`ads_read`** 를 체크한다.
   페이지 목록 조회까지 확인하려면 `pages_show_list`도 추가한다.
4. "Generate Access Token" → Facebook 로그인 창에서 **광고 계정·페이지 접근을 허용**한다.
   여기서 광고 계정을 빼고 허용하면 나중에 `(#200) permission` 오류가 난다.
5. 위 칸에 나온 토큰을 복사한다. 이 토큰은 1~2시간이면 만료된다.
6. (선택) 60일짜리로 바꾸기: https://developers.facebook.com/tools/debug/accesstoken/ 에
   토큰을 붙여넣고 "디버그" → 아래 **"액세스 토큰 연장"**(Extend Access Token) 버튼.
   또는 API로(공식 확인, 결과 토큰은 약 60일):
   ```bash
   curl -s "https://graph.facebook.com/v26.0/oauth/access_token?grant_type=fb_exchange_token&client_id=앱ID&client_secret=앱시크릿&fb_exchange_token=짧은토큰"
   ```

### 6-B. 시스템 사용자 토큰 (권장)

URL: https://business.facebook.com/settings/system-users

1. 비즈니스 설정 → **사용자 → 시스템 사용자** → 추가.
   이름(예: `cak-paid-reach-bot`), 역할 **관리자**(Admin)로 만든다. Limited Access 티어에서는
   시스템 사용자 1명 + 관리자 시스템 사용자 1명까지 만들 수 있다(공식 확인).
2. 만든 시스템 사용자 선택 → **자산 추가**(Add assets):
   - 광고 계정: 4단계 계정 → **광고 관리**(Manage campaigns) 이상.
   - 페이지: 3단계 페이지 → 콘텐츠 관리 이상(광고 소재가 페이지 이름으로 나가므로 필요).
   - (7단계에서 인스타를 쓰면) Instagram 계정도 추가.
3. **토큰 생성**(Generate new token):
   - 앱: 5단계 앱 선택.
   - 만료: 60일 또는 "만료 없음". PoC는 60일이면 충분하다.
   - 권한: **`ads_management`**, **`ads_read`** 체크. (`business_management`는 이 코드가
     호출하지 않으므로 불필요, `pages_show_list`는 선택.)
4. 토큰은 **이 창을 닫으면 다시 볼 수 없다.** 바로 9단계 `.env`에 넣는다.

### 6-C. 토큰 검증

https://developers.facebook.com/tools/debug/accesstoken/ 에 붙여넣으면 앱 ID·만료·권한 목록
(scopes)이 보인다. `ads_management`, `ads_read`가 scopes에 있어야 한다.

터미널로도 확인할 수 있다(토큰은 헤더로만 보낸다):

```bash
export META_ACCESS_TOKEN='여기'
curl -s -H "Authorization: Bearer $META_ACCESS_TOKEN" \
  "https://graph.facebook.com/v26.0/me/adaccounts?fields=id,name,currency,account_status"
```

4단계 광고 계정이 목록에 나오고 `currency: "KRW"`, `account_status: 1`(활성)이면 성공이다.

`META_ACCESS_TOKEN` = 이 토큰.

**끝난 상태:** 디버거에 ads_management·ads_read가 보이고, 위 curl에 광고 계정이 나옴.

---

## 7단계. (선택) Instagram 연결

Facebook만 시험하면 이 단계는 건너뛴다. 예제 설정은 `publisherPlatforms: ["facebook"]`이다.

1. Instagram 앱에서 계정을 **프로페셔널(비즈니스 또는 크리에이터)** 로 전환한다.
2. Facebook 페이지 → 설정 → **연결된 계정 → Instagram** 에서 그 계정을 연결한다.
3. 비즈니스 설정 → 계정 → **Instagram 계정** → 추가로 포트폴리오에도 넣고, 시스템 사용자(6-B)에
   자산으로 할당한다.
4. ID 확인: 10단계 `preflight` 결과의 `instagram_accounts[].id`. 이것이
   `creative.instagramActorId`다. 설정의 `targeting.publisherPlatforms`에 `"instagram"`을 추가한다.

---

## 8단계. 광고 영상과 랜딩 페이지

- **랜딩 페이지**: `https://`로 시작하는 실제 열리는 상품 페이지. `example.com`이 남아 있으면
  심사에서 거절된다. → `creative.landingPageUrl`
- **영상**: 이 저장소에서 만든 광고 영상(ad-video-gen / shorts-publish 산출물)이면 사용권 문제가
  없다. 타사 영상·스크린샷 재사용은 CLAUDE.md 금지선 #1이다. 세 가지 중 하나로 넣는다.
  - `{"kind":"local-file","value":"../../output/my-ad.mp4"}` — CLI가 업로드하고 처리 완료까지 기다린다.
  - `{"kind":"hosted-url","value":"https://…/my-ad.mp4"}` — Meta가 받아갈 수 있는 공개 HTTPS.
  - `{"kind":"meta-video-id","value":"1234…"}` — Ads Manager → 모든 도구 → **미디어 라이브러리**에
    먼저 올린 뒤 영상 ID를 복사. 처음엔 이 방법이 가장 확실하다(업로드 오류를 UI에서 볼 수 있다).
- 영상 규격(길이·해상도·용량 상한)은 Meta 광고 가이드 페이지에서 확인한다. 이 문서는 수치를 단정하지 않는다.
- **광고 문구**(`creative.message`, `headline`)는 사람이 검수한 문장만 넣는다. 건기식이면
  질병 효능·비포애프터는 CLAUDE.md 금지선 #3이다.

---

## 9단계. `.env` 작성

저장소 루트 `.env`는 이미 `.gitignore`에 있다(다른 키들이 이미 들어 있는 그 파일). 아래를 추가한다.

```bash
# --- meta-paid-reach ---
META_ACCESS_TOKEN=6단계_토큰
META_AD_ACCOUNT_ID=act_1234567890
META_GRAPH_API_VERSION=v26.0
# META_APP_SECRET=앱시크릿          # 앱 설정에서 "앱 시크릿 증명 필요"를 켰을 때만
# 아래 두 줄은 라이브 집행(LIVE_SPEND) 때만 주석 해제. 평소엔 비워 둔다.
# META_POC_ALLOW_LIVE_SPEND=I_UNDERSTAND
# META_POC_HARD_SPEND_CAP_MINOR=15000
```

**이 CLI는 `.env`를 자동으로 읽지 않는다.** 실행할 셸에서 한 번 export한다.

```bash
cd ~/workSpace/commerce-automation-kit
set -a; source .env; set +a
```

`META_GRAPH_API_VERSION`은 앱 대시보드 → 설정 → 고급에 표시된 "API 버전"과 맞춘다. 기본값
`v26.0`은 이 문서 작성 시점 값이며 앱마다 다를 수 있다(PROGRESS §7 #10).

---

## 10단계. 검증 — `preflight`

```bash
npm run cli -w @cak/meta-paid-reach -- preflight
```

네트워크를 읽기만 하고 아무것도 만들지 않는다. 결과에서 볼 것:

| 필드 | 기대값 | 아니면 |
|---|---|---|
| `account.currency` | `KRW` | 예산 단위를 4-1 표대로 다시 계산 |
| `account.timezone_name` | `Asia/Seoul` | 설정의 startTime/endTime 오프셋을 계정 시간대로 |
| `account.account_status` | `1`(활성) | `2`=비활성, `3`=미결제, `7`=위험 검토 대기, `9`=유예 기간(공식 확인) → 결제수단·계정 상태 확인 |
| `account.disable_reason` | 없음 또는 `0` | 값이 있으면 Ads Manager 상단 알림 확인 |
| `account.spend_cap` | 4-3에서 건 한도 | `0`이면 한도 없음(공식 확인) → 4-3으로 |
| `account.promote_pages` | 3단계 페이지가 포함 | 없으면 6-B 자산 할당에 페이지 추가 |
| `account.instagram_accounts` | 7단계 계정(선택) | 인스타 안 쓰면 비어 있어도 됨 |

`(#200)` 권한 오류면 토큰 scopes 또는 시스템 사용자 자산 할당, `(#190)`이면 토큰 만료,
`(#100)` 이면 계정 ID 오타를 먼저 의심한다.

---

## 11단계. 설정 파일 채우고 PAUSED 생성

1. `packages/meta-paid-reach/example.config.json`을 복사해 `poc.config.json`(gitignore 밖이면
   실제 페이지 ID·URL이 커밋되니 `output/` 아래에 둔다)을 만든다.
2. `REPLACE_WITH_*` 를 3·8단계 값으로 바꾼다. `startTime`/`endTime`은 **실행 시점 이후**로
   고친다(지난 endTime은 `run`이 거부한다).
3. 사람이 문구·영상·랜딩을 검수했으면 `compliance`를 채운다:
   ```json
   "compliance": { "creativeRightsConfirmed": true, "humanApproved": true,
                   "approvedBy": "검수자", "approvedAt": "2026-09-05T10:00:00+09:00" }
   ```
4. README 「검증 순서」 3단계(`create --execute --confirm CREATE_PAUSED`)로 넘어간다.
   여기까지 과금은 없다. 만들어진 Campaign/Ad Set/Ad는 Ads Manager에서 **모두 "꺼짐"**으로 보여야 한다.

---

## 자주 막히는 곳

- **광고 계정이 "비활성화됨"**: 신규 계정 위험 검토, 결제 실패, 정책 위반 이력. Ads Manager 상단
  알림에서 이유와 이의제기 버튼을 확인한다. 코드로 풀 수 없다.
- **토큰에 광고 계정이 안 보임**: 6-A에서 허용 창에서 계정을 뺐거나, 6-B에서 자산 할당을 안 함.
- **페이지가 광고 계정에 연결 안 됨**(`promote_pages` 비어 있음): 페이지가 비즈니스 포트폴리오에
  없거나 시스템 사용자에 할당되지 않음.
- **`(#100) Invalid parameter` on create**: 페이지 ID 오타, `example.com` 랜딩, 영상 ID가 다른
  계정 소속, 지난 `end_time`.
- **심사 대기가 김**: 새 계정·새 페이지는 첫 광고에 시간이 걸린다. `status --state …`의
  `effective_status`와 `issues_info`로 본다.
- **앱 시크릿 증명 오류**: 앱 설정 고급에서 "앱 시크릿 증명 필요"가 켜져 있음 → `META_APP_SECRET` 설정.

---

## 무과금으로 생성 경로만 시험하기 — Sandbox 광고 계정 (TODO(D1))

Meta for Developers 공식 소셜 게시물(2023) 기준, 앱 대시보드 → Marketing API → **Tools** →
"Sandbox Ad Account Management"에서 **Sandbox 광고 계정**을 만들 수 있고, 이 계정은 광고를
실제 송출하지 않은 채 Marketing API 호출을 받는다. 즉 `CREATE_PAUSED` 경로를 카드 없이
시험할 수 있을 가능성이 있다.

다만 공식 문서 페이지는 2026-09-04 자동 접근에서 404였고, 현재도 제공되는지·영상 업로드·
Insights가 동작하는지는 확인하지 못했다. 로그인한 브라우저에서 앱 대시보드의 Marketing API →
Tools 메뉴를 열어 직접 확인한 뒤 PROGRESS §7 #12를 갱신한다. Sandbox 계정으로는 impressions가
쌓이지 않으므로 1,000회 도달·자동 PAUSE 검증은 결국 실계정 소액 집행이 필요하다.

---

## 참고(공식)

- Marketing API 시작하기: https://developers.facebook.com/docs/marketing-api/get-started
- 권한·접근 티어(Limited/Full, 본인 계정은 App Review 불필요): https://developers.facebook.com/docs/marketing-api/overview/authorization/
- 통화 offset 표(KRW=1, USD=100): https://developers.facebook.com/docs/marketing-api/currencies
- 시스템 사용자: https://developers.facebook.com/docs/marketing-api/system-users/
- Access Token Debugger: https://developers.facebook.com/tools/debug/accesstoken/
- Graph API 탐색기: https://developers.facebook.com/tools/explorer/
- Access Tier 명칭 변경 공지(2026-05): https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/
