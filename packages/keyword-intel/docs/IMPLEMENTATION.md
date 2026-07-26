# IMPLEMENTATION — commerce-keyword-intel 구현 플랜

**작성일:** 2026-07-23 · 총 예상 기간: **약 3주(개발자 1인, 파트타임 기준)** · 현금 비용: **거의 0**

> 이 모듈은 blueprint-review가 남긴 4원자 중 첫 번째다. 목표는 "완성된 SaaS"가 아니라
> **조합 가능한 합법 유틸리티 1개를 실제로 동작시키고, 그 위에 무엇을 얹을지 판단할 근거를 만드는 것**이다.

---

## 0. 선행 게이트 — [D1] 스펙 실측 · **2026-07-23 실측 완료 (D1-1~4 확정 / D1-5 미확정)**

공식 문서(`developers.naver.com`) 원문을 병렬 실측하고 각 값을 소스에 재대조하는 검증 패스를
별도로 돌려 확정했다(실측→회의적 검증 2패스, 총 10에이전트). **확정 상수의 단일 소스는
`adapters/naver-client.ts` 의 `NAVER_LIMITS`** 이며, 코드의 `TODO` 는 `TODO(D1-5)`(약관) 1건만 남는다.

### D1 실측 결과

| # | 확인 항목 | 상태 | 확정값 (공식 문서 원문 검증) |
|---|---|---|---|
| D1-1 | 쇼핑 검색 스펙 | ✅ 확정 | `GET https://openapi.naver.com/v1/search/shop.json` · display 기본10/최대100 · start 기본1/최대1000 · sort `sim\|date\|asc\|dsc` · 오류 SE01~06/SE99·403 · ⚠️ lprice/hprice 는 실제 JSON 에서 문자열 |
| D1-2 | 검색 일일 한도 | ✅ 확정 | **25,000회/일** — client ID 별 합산, 검색 API 통합(쇼핑·블로그·뉴스 공유). 초과 시 **HTTP 429**. ⚠️ 초당 초과도 429 → 상태코드만으론 일일/초당 구분 불가, budget 원장으로 판별(Phase 2) |
| D1-3 | 데이터랩 트렌드 | ✅ 확정 | `POST /v1/datalab/search` (application/json) · **1,000회/일** · keywordGroups ≤5 · 그룹당 keywords ≤20 · startDate ≥2016-01-01 · timeUnit date/week/month · ages 코드 1~11 · ratio 는 구간 최대=100 상댓값 |
| D1-4 | 쇼핑인사이트 | ✅ 확정 | 엔드포인트 8종(`/v1/datalab/shopping/categories` + category/{device,gender,age} + category/keywords + category/keyword/{device,gender,age}, 전부 POST) · **별도 1,000회/일** · category=네이버쇼핑 URL 의 `cat_id`(예: 패션의류 50000000) · startDate ≥2017-08-01 · ⚠️ ages 코드 10~60(트렌드의 1~11 과 다름) |
| D1-5 | **약관** | ❌ **미확정** | 자동 접근 전면 차단(WebFetch·웹아카이브·프록시 11종·검색 무색인). 리서처가 확보했다고 보고한 조항(7.2③ 대가수취금지·7.3③ 저장/캐시·7.3④ 광고·7.3⑥ 재제공·8.1 권리귀속·8.2 제한사용권·11.5 로그·검색특약 2.1 독립노출)은 **검증자 독립 재확인 실패로 전부 미검증** → 아래 사람 게이트로 확정 |

### D1 미해결 항목 (공식 문서에 실제로 없음 — 지어내지 않는다)

- 검색/데이터랩 **초당 rate limit 수치** 미명시(429 발생 사실만 명시). 일일 한도 429 응답 body 의 errorCode 값 미명시.
- 데이터랩 조회기간 **최대 span**·keywordGroups **최소 개수** 미명시.
- 쇼핑인사이트 **전체 cat_id 목록/조회 API 없음** — 네이버쇼핑 URL 에서 수동 확인.
- **한도 리셋 시각**(KST 자정 추정) 미명시 → budget 은 보수적으로 KST 경계 사용, `TODO(D1)` 유지.

**통과 기준 현황:** D1-1~4 공식 근거 확정 + 어댑터 `TODO(D1)` 해소 ✅ / D1-5 약관 확정 ❌ (아래 절차).

### D1-5 마무리 절차 (사람 게이트 — 자동화 불가 확인됨)

1. 로그인된 브라우저로 <https://developers.naver.com/products/terms/> 열기
2. 제7조(금지행위: ② 최종사용자 대가, ③ 저장·캐시, ④ 결과화면 광고, ⑥ 제3자 재제공) ·
   제8조(결과데이터 권리 귀속) · 제11조(로그 보관) · **검색 API 특약 2.1**(독립 노출·삽입/왜곡/변조 금지) 원문 확인
3. `LEGAL-BOUNDARY.md` §2·§4 와 계약 `compliance` 기본값(resaleRestricted / cacheTtlHours)을 원문 근거로 갱신

### 신규 소스 실측 (2026-07-25) — D1-8(검색광고)·D1-11(쿠팡 파트너스)

수요 검증 축(상대 트렌드 → 절대 검색량 보정) 및 판매 검증 축(쿠팡) 편입 검토. `d1-researcher` 2패스 실측.

| # | 소스 | 상태 | 확정값 / 게이트 |
|---|---|---|---|
| **D1-8** | 네이버 **검색광고** 키워드도구 | 🟡 **조건부 GO** | `GET https://api.searchad.naver.com/keywordstool` · HMAC-SHA256(메시지 `ts.METHOD.path`, 헤더 `X-Timestamp/X-API-KEY/X-Customer/X-Signature`) · hintKeywords ≤5 · 반환 `monthlyPcQcCnt`/`monthlyMobileQcCnt`(30일 **절대 검색수**, `<10` 마스킹)·compIdx. 키발급 self-serve(단 광고주 계정 필요). **한도 수치 비공개**(계정+IP 유연제한, 키워드도구 타 API 1/5~1/6)→429 적응형 백오프. **약관: 내부이용 허용 취지 / 제3자제공·재판매 금지(검색광고 제16조8항)/ 순수 비광고목적 적법성=법해석 사람게이트**. 근거: naver.github.io/searchad-apidoc(공개), ads.naver.com/adguide/terms(로그인 불필요) |
| **D1-11** | 쿠팡 **파트너스** 오픈API | ❌ **차단(조건부)** | Search **시간당 10회**(위반 24h차단·3회 전체밴)·키발급 파트너스 **최종승인** 후만 = ✅확정. 엔드포인트·HMAC·응답필드·**★약관(데이터 내부이용 허용여부)** = 로그인/Cloudflare 뒤 미확인 → 금지선 #7 보수적 차단. 근거: partners.coupangcdn.com/partners-guide/*.pdf(자사 CDN, 인증 불필요) |

**D1-8 사람 게이트:** ① 검색광고 광고주 계정+API 라이선스 발급 ② "광고 미집행 순수 내부이용"의 약관 제7조10항④("광고집행 이외의 다른 목적") 적법성 법해석 ③ 광고운영정책(로그인 뒤) API/데이터 세부제한 확인.
**D1-11 사람 게이트:** ① 파트너스 최종승인 계정 ② 로그인 뒤 이용약관·운영정책에서 데이터 내부이용 허용여부 ③ Cloudflare 뒤 기술문서로 스펙 확정. → **대안 권장: D1-4 데이터랩 쇼핑인사이트**(이미 확정·별도 1,000/일)로 커머스 수요 프록시.

> **계약 반영 완료(2026-07-25):** `KeywordSignal.absoluteVolume?`(D1-8) 옵셔널 필드 추가(append-only, 무파손). 어댑터·`IntelSource` 배선·budget 은 위 D1-8 사람게이트 통과 후.

#### 쇼핑인사이트(D1-4) 어댑터 착수 (2026-07-25) — 커머스 수요축

D1-4는 이미 확정·기존 네이버 크레덴셜 사용이라 게이트 없이 착수. 공식 문서 스키마 재실측(adversarial 검증 통과):
- **어댑터**: `shoppingCategoryKeywords()` (`POST /v1/datalab/shopping/category/keywords`) — category(cat_id) 필수·keyword 1~5그룹·param 그룹당 1개·startDate≥2017-08-01·ages 10~60. 응답 `results[].keyword`(⚠️**단수**, 검색트렌드는 복수). zod: `shoppingInsightResultSchema`.
- **계약**: `KeywordSignal.shoppingTrend?{category,latest,momentumPct,series}` (append-only). budget source `naver_datalab_shopping`(별도 1,000/일, 이미 존재).
- **analyzer**: `summarizeShoppingTrend(insight, category)` — summarizeTrend와 동일 모멘텀.

**⚠️ collect 배선 시 필수(미이행 시 rule 위반):**
1. **store 마이그레이션 v4** — `signals` 테이블/`saveBatch`/`topOpportunities`에 `shoppingTrend`(및 `absoluteVolume`) 영속 컬럼 추가. **현재는 persist 안 돼 배선하면 저장→재로드에서 silent drop**(적대적 리뷰 지적, "silent drop 금지" 위반).
2. **cat_id 매핑** ✅ (2026-07-27) — D1-4 가 "조회 API 없음·수동 확인"이라 했으나, **네이버 데이터랩 공식 카테고리 엔드포인트** `POST https://datalab.naver.com/shoppingInsight/getCategory.naver` (`cid=<부모>`, 로그인 불필요)로 **권위 있는 카테고리 트리 확보**. 검증값: 화장품/미용=50000002, 식품=50000006 > **건강식품=50000023**(건기식·영양제), 다이어트식품=50000024. `seeds/shopping-categories.json` 에 뷰티 72→50000002·건기식 102→50000023 매핑. 실호출 확인(루테인@50000023 실데이터 반환). 음료·식품형 이너뷰티 8종(석류즙·콤부차 등)은 건강식품 아님 → 지어내지 않고 TODO. 미상 키워드는 shoppingTrend undefined + coverage 투명화.
3. **키워드당 1그룹 호출** — summarizeShoppingTrend는 results[0]만 읽음(다중그룹 배치 시 results[1..] 유실).
4. `coverage.sources`/`skippedByBudget`에 `naver_datalab_shopping` 반영 + 예산 소비 배선(현재 dead: 초기화만 되고 안 늘어남).

---

## 1. Phase 1 — 최소 동작 (Walking Skeleton) · W1 · **구현 완료(2026-07-23)**

목표: 키워드 1개 → 실제 네이버 응답 → `KeywordSignal` 1개 출력.

> **상태:** 어댑터 상수 확정(D1) + zod 응답 검증(`adapters/schemas.ts`, `as` 캐스팅 제거,
> `NaverSchemaError` 표면화) + collectSignals E2E 테스트 완료. 3렌즈 리뷰→반증 워크플로에서
> 확정된 결함 11건(callsSpent 시도계상, silent catch, 요청 가드 등) 수정 반영.
> **게이트 G1 실호출 통과(2026-07-23):** 실키로 10키워드(건기식 시드) 수집 — 10/10 신호, 실패 0,
> `callsSpent` 정확(원장 11/11), 실응답이 zod 스키마와 일치(lprice 문자열 반환 확인).
> analyze CLI 로 opportunity 표 출력, SQLite 영속화·원장 기록까지 실데이터로 검증됨.

| 작업 | 산출물 | 통과 기준 |
|---|---|---|
| 개발자센터 앱 등록, 검색+데이터랩 사용 설정 | Client ID/Secret | `.env` 채움, 401 안 남 |
| D1 실측 반영 | 상수 확정된 `naver-client.ts` | typecheck 통과 |
| `searchShop` 실호출 + zod 검증 | 원응답 파싱 | 실제 상품 40개 파싱 성공 |
| `collectSignals(["루테인"])` E2E | `KeywordSignal` 1개 | 계약대로 필드 채워짐, `coverage` 정확 |
| 코어 단위테스트 | `test/analyzer.test.ts` | summarize/score 케이스 통과 |

**게이트 G1:** 키워드 10개를 한 번에 수집해 10개 신호가 나오고, 실패는 `failures`에, 한도는 `callsSpent`에 정확히 잡힌다.

---

## 2. Phase 2 — 영속화·예산·관측성 · W2 · **구현 완료(2026-07-23)**

목표: 반복 실행 가능한 "도구"로 만든다.

| 작업 | 산출물 | 통과 기준 | 상태 |
|---|---|---|---|
| `store/` SQLite 스키마 (signals, runs, call_ledger, dlq) | `store/db.ts` user_version 마이그레이션 | 재실행 시 히스토리 축적 | ✅ 테스트 검증 |
| `budget/` 일일 호출예산 **영속 카운터** | `BudgetLedger.tryReserve` (조건부 UPDATE 원자 게이트) | 예산 초과 시 `skippedByBudget` 동작, 실제 한도 안 침 | ✅ (KST 자정 리셋 가정 — TODO(D1)) |
| `analyze` 명령: 저장 신호 opportunity 순 정렬 | `npm run analyze -- --top N` | 상위 N 키워드 표 | ✅ + DLQ 리포트 |
| 관측성(로깅·재시도·백오프·DLQ·알림) | `obs/` + `store/dlq.ts` | 429/5xx 백오프, 예산 80% 알림 | ✅ |
| `compliance` 필드를 store TTL과 연결 | `signals.expires_at` + `purgeExpired` | 약관 TTL 넘은 캐시 자동 무효 | ✅ 조회 필터+물리 삭제 양쪽 |

**핵심 규약(리뷰 2패스에서 확정·회귀 테스트로 고정):**
- 게이트는 호출 "직전" 원자적 확인, **재시도 1회 = 계상 1회**(429/5xx 도 쿼터 소비 — 과소계상 금지)
- shop 예산 소진 → `failures("skippedByBudget: …")` / trend 소진 → 신호 유지 + `coverage.skippedByBudget`
- DLQ 는 **키워드 귀속 실패(HTTP 400)만** 계상(401/429/5xx 등 전역 사건은 제외 — 오귀속 방지),
  쿨다운(기본 24h) 경과 시 자동 재시도(자가 회복), 즉시 해제는 `npm run dlq -- clear`
- 상대 `DB_PATH` 는 **패키지 루트 기준** 해석(cwd 별 원장 분열 → 한도 초과 방지)
- env/생성자 어느 경로로도 예산이 공식 한도(25,000/1,000)를 넘을 수 없음(이중 clamp)

**게이트 G2:** 100개 키워드 시드를 한도 안에서 며칠에 나눠 수집하고, 어떤 것도 조용히 누락되지 않는다(전량 `failures`/`skippedByBudget`로 설명 가능).

→ ✅ **실수집 통과(2026-07-23):** `seeds/g2-seeds.txt` 182개(5렌즈 생성→비평→사람 확정) 수집.
- 182/182 신호(커버리지 100%), 실패 0, signals∪failures 무누락, 원장 search 248/20,000 · datalab 237/800
- 실전 관측: 초당 429 스로틀 15회 → 백오프 재시도 전량 회복 / datalab **ECONNRESET 38회** →
  네트워크 오류가 비재시도이던 결함 발견·수정(`TRANSIENT_NET_CODES` 재시도) 후 재수집으로 38/38 회복
- 트렌드 커버 180/182 — 잔여 2건(비타민C 발포정·유산균 분말 스틱)은 데이터랩에 **데이터 자체가 없는**
  롱테일로, 계약대로 `latest:null + ok:true` 투명 표현(결함 아님)
- ⚠️ 플래그 시드 10개(§8 광고리스크·화장품법 표현게이트·NMN 원료적법성)는 수집만 하고
  콘텐츠·광고 제작 시 사람 게이트 필수 — `seeds/g2-seeds.txt` 주석에 표기

---

## 3. Phase 3 — 유용성 검증 · W3

목표: "이 신호가 실제로 쓸모 있는가"를 판정한다. (기능이 아니라 **가치** 게이트)

| 작업 | 통과 기준 |
|---|---|
| 시드 키워드 100~300개 수집(건기식·뷰티 등 관심 카테고리) | 커버리지 ≥ 90% |
| opportunity 상위 20개를 **사람이 직접 눈으로 검증** | 상위 중 "실제로 해볼 만하다" 비율 기록 |
| 스코어 캘리브레이션: 상위/하위 키워드의 실제 쿠팡 판매 깊이와 대조 | 상관 방향성 확인 → confidence 상한 조정 |
| 계약 안정성 리뷰 | breaking change 없이 Phase 4 소비 가능 |

**게이트 G3(핵심 의사결정):** 아래로 분기한다.
- opportunity 상위가 사람 판단과 **일치**하고 데이터가 안정적 → **원자 완성.** 다음 원자(렌더러) 또는 조합으로.
- 일치하지 않음 / 네이버 데이터가 커머스 의도와 괴리 → **스코어 로직 재설계** 또는 이 원자의 목적 축소(단순 경쟁 조회 도구로).

---

## 4. 마일스톤 / 간트 (3주)

```
      W1(Phase1)        W2(Phase2)         W3(Phase3)
D1 ■  실측
   ■■ 앱등록·어댑터
   ■■ collectSignals E2E ─ G1
         ■■■ store·budget
         ■■  관측성
         ■   compliance TTL ─ G2
                  ■■■ 시드수집·사람검증
                  ■■  캘리브레이션 ─ G3(분기)
```

---

## 5. 자금·시간 투입

| 항목 | 비용 | 비고 |
|---|---:|---|
| 네이버 검색/데이터랩 API | **0원** | 무료 (한도 내). 유료 상위 플랜 불필요 |
| 개발 시간 | 약 3주 파트타임 | 1인 |
| 인프라 | **0원** | 로컬 실행 + SQLite. 서버 불필요(Phase 4 이전) |
| 도구 | 0원 | 오픈소스 |

> 원안 설계서가 "인프라 비용 최소화"를 내세웠지만, 진짜로 비용이 0에 가까운 것은 **이 합법 원자**다.
> (스크래핑 프록시·GPU 렌더·에뮬레이터 팜이 다 빠졌기 때문)

---

## 6. 의사결정 게이트 요약

| 게이트 | 통과 조건 | 미달 시 | 상태 |
|---|---|---|---|
| **D1** | 스펙·한도·약관 5항목 공식 확정 | 착수 중단(추정값으로 개발 금지) | ✅ D1-1~4 확정 / D1-5 약관만 사람 확인 대기 |
| **G1** | 10키워드 → 10신호, 실패·한도 정확 계상 | 어댑터/계약 수정 | ✅ **실호출 통과(2026-07-23)** |
| **G2** | 100키워드 무누락 수집, 예산 게이트 작동 | 관측성·예산 로직 보강 | ✅ **실수집 통과(2026-07-23)** — 시드 182개, 커버리지 100%, 무누락, 원장 248/20,000·237/800 |
| **G3** | 스코어가 사람 판단과 일치 | 스코어 재설계 or 목적 축소 | 대기 (Phase 3) |

---

## 7. 범위 밖 (이 프로젝트에서 하지 않는 것)

- 콘텐츠 생성/배포/DM/커머스 연동 → **각각 별도 원자 프로젝트**로. 이 모듈은 계약만 노출.
- 데이터 재판매/모니터링 SaaS → D1-5 약관 확인 전까지 **금지**. LEGAL-BOUNDARY 참조.
- 홈쇼핑 낙수 트리거 → 반증됨. 계약·코어에 재유입 금지.
