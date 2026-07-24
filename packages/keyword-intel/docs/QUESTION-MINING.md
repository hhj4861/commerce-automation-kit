# QUESTION-MINING — 질문 마이닝 (실수요 질문 신호) 설계

**작성일:** 2026-07-23 · 상태: **설계만 — 구현은 착수 조건(§9) 충족 후**

> 출처: `wp-auto-blog/architecture/modules/03-question-mining-search.md` 의 설계를
> **이 repo 규칙(공식 API만, 스크래핑 절대 금지)으로 포팅**한 것.
> 원본의 주력 수집 경로(지식인 `kin.naver.com` HTML 파싱)는 금지선 #1 위반이라 **기각**하고,
> 공식 **지식iN 검색 API**(`/v1/search/kin.json`, 2026-07-23 공식 문서 실측 확인)로 대체했다.

## 0. 한 줄 요약

"내가 추측한 키워드"가 아니라 "사람들이 지금 실제로 묻는 질문"을 **공식 API로만, 읽기 전용으로**
수집해 기존 KeywordSignal 파이프라인 옆에 질문 신호(`MinedQuestion`)를 흘리는 keyword-intel 내부 확장.
채널(광고/블로그/쇼츠)별 검색 모듈을 만들지 않는다 — **수집·예산·저장·컴플라이언스는 통합,
채널 분화는 소비 프로파일과 사람 게이트 뒤에서만** (§2 결정 기록).
마켓(국내/해외)도 같은 원리다 — 모듈이 아니라 **소스 어댑터의 축(§4-1)이자 프로파일의 축(§7)**.
지식iN 은 국내 전용 소스이고, 해외는 별도 공식 API 소스(YouTube·Keyword Planner 등)가 담당한다.

---

## 1. 원본 설계 대비 무엇이 바뀌었나

| 항목 | wp-auto-blog 원본 설계 | 이 repo 포팅 | 이유 |
|---|---|---|---|
| 지식인 수집 | `kin.naver.com` 4개 메뉴 HTML 파싱 (BeautifulSoup, UA 위장) | **기각** → 공식 지식iN 검색 API `GET /v1/search/kin.json` | 금지선 #1(스크래핑), LEGAL-BOUNDARY 경계 1 |
| 발견 모델 | 메뉴 브라우징(많이 본 Q&A 등) | **쿼리 기반**: 시드 키워드 → kin 검색 → 실질문 제목 | 공식 API는 query 필수. 시드 주도 파이프라인(g2-seeds)과 오히려 정합 |
| 판정 게이트 | `keyword_gate.evaluate()` (검색광고 API 월간검색량 + DDG SERP) | 기존 KeywordSignal 지표(competition/trend/opportunity)로 대체. 검색광고 API는 D1-8(§4) 실측 후 검토 | DDG SERP 파싱도 스크래핑 → 이식 불가. 절대 검색량은 이 repo 미보유 |
| Google PAA | SerpAPI 유료, 후순위 설계 | **금지 확정** | scraper-as-a-service = 스크래핑 외주화. 금지선 #1의 정신 + "공식 API만" 문언 위반 |
| Reddit | praw 재사용, 의문문 필터 | 보류 — Data API 약관(상업 사용 조건) D1-7 실측 전 착수 금지 | CLAUDE.md "약관은 지어내지 않는다" |
| FAQ 주입 | `content_generator` FAQ 프롬프트에 실질문 주입 | 소비처별 활용(§8): wp-auto-blog 브릿지 export + 미래 콘텐츠 원자 기획 입력 | 이 repo에 콘텐츠 생성 원자 없음(범위 밖) |
| 큐 append | `topic_queue_general.json`에 필드 2개 추가 | SQLite v4 마이그레이션(questions/question_history) + 계약 append(§5) | 이 repo의 저장·계약 체계 |
| YMYL 필터 | 의료 질문(진단·치료·약물) 제외 | 유지 + **강화**: 질병효능 암시 질문은 식품표시광고법 §8 플래그 (시드 ⚠️ 규약 확장) | 건기식 도메인 특수성 |

**유지된 원칙 (원본에서 그대로 계승):** 읽기 전용(쓰기 코드 자체가 없음) ·
게이트 없이 소비 금지 · 질문 "제목"만 신호로 사용(답변 본문 저장·복사 금지) ·
일일 유입 상한 · 소스 차단/실패 시 파이프라인 비차단.

---

## 2. 결정 기록(ADR): 광고용/블로그용/쇼츠용 검색 — 분리인가 통합인가

**결정: (b) 통합** — 수집·예산·저장·컴플라이언스는 keyword-intel 원자 1개.
채널 차이는 **소비 프로파일(읽기 전용 뷰) + 채널별 사람 게이트**로만 표현한다.
수집기는 채널을 모른다(channel-agnostic). 채널 필드를 계약·DB·수집 코드에 넣지 않는다.

3개 독립 렌즈(API 비용·쿼터 / 계약·구조 / 운영·거버넌스) 교차 검증 결과 만장일치.
분리를 지지한 렌즈는 0개였고, "하이브리드" 의견도 경계선을 채널이 아니라
**repo·법체계 경계**(wp-auto-blog Python repo, §8)에 그은 것으로 통합안과 동일 결론.

### 통합의 근거 (요약)

1. **물리 쿼터가 이미 통합이다.** 검색 API 25,000회/일은 채널이 아니라 client ID에 귀속된다 —
   쇼핑·블로그·뉴스 공유는 D1-2 실측(`IMPLEMENTATION.md` §0)이고, **지식iN이 같은 통합
   쿼터임은 kin 공식 문서 원문으로 별도 실측**("지식iN 검색은 검색 API를 사용하며, 검색 API의
   하루 호출 한도는 25,000회입니다" — §4 ①, 2026-07-23).
   원자 간 직접 import 금지 규약상 `BudgetLedger`(SQLite 원자적 카운터)는 원자 간 공유가
   불가능하다 → **같은 쿼터 풀을 쓰는 소스는 반드시 같은 원자 안에 있어야 한다.**
   동적 공유 원장 없이 남는 유일한 합법 구성은 모듈별 **정적 쿼터 분할**(고정 sub-clamp,
   합산 ≤ 25,000)뿐인데, 미사용 쿼터 사장·동일 키워드 3중 호출·재배분 경직성으로 근거 2~6에
   의해 기각된다. 정적 분할 없이 원장을 각자 두면 어느 원장도 합산 초과를 못 보고(silent 429),
   client ID 추가 발급으로 푸는 경로는 경계 4(다중 계정 한도 우회)의 보수적 해석상 금지
   (한 계정 다중 앱의 허용 여부는 D1-5 미검증 — 확인 전 시도하지 않는다).
2. **DataLab 1,000회/일에서 3중 수집은 확장 여지를 소멸시킨다.** 단일 수집이 이미 237/800
   소비(G2 실측). 같은 키워드("루테인 부작용"은 광고 소재·블로그 FAQ·쇼츠 주제 전부의 입력)를
   채널별로 3중 호출하면 현 시드만으로 711/1,000 — 시드 확장·쇼핑인사이트 편입 여지가
   사실상 사라진다. 통합 수집 1회 + 소비 N회가 유일한 확장 경로.
3. **채널 차이는 수집의 차이가 아니라 해석의 차이다.** 광고=경쟁·표현규제, 블로그=롱테일·질문원문,
   쇼츠=모멘텀·신선도 — 전부 같은 KeywordSignal/MinedQuestion 위의 **정렬·필터·게이트 차이**다.
   repo 전체에 채널 개념이 0건인 것(grep 실측)은 결핍이 아니라 올바른 관심사 분리의 증거.
4. **컴플라이언스 집행 지점은 하나여야 한다.** TTL 물리삭제·resaleRestricted 전파·YMYL 필터·
   DLQ·silent drop 금지를 3벌로 복제하면 D1-5 약관 확정 시 3곳 동기 갱신에 의존하게 되고,
   한 곳 누락이 곧 위반 운영이다. 원본 설계가 지식인 HTML 파싱을 "주력"으로 제안했다는 사실
   자체가, 검색을 채널별로 만들면 각 채널이 편의상 금지선을 넘는 경로가 실제로 열린다는 증거.
5. **운영 표면.** launchd·daily-collect·텔레그램 다이제스트·DLQ·백오프·마이그레이션·문서 4종을
   1인 운영에서 3벌 유지는 과잉설계(MSA 금지와 동일 논리). G2에서 발견한 ECONNRESET 재시도
   결함이 실증 — 통합이라 1곳 수정으로 끝났다.
6. **G3 캘리브레이션.** `signal_history` 가 3개 DB로 파편화되면 opportunity 대 실판매 상관
   검증(현재 대기 중인 유일한 게이트)의 표본 자체가 쪼개진다.

### 기각한 대안

| 대안 | 기각 이유 |
|---|---|
| (a) 채널별 검색 모듈 3개 | 근거 1·2에 의해 구조적 불성립. 소비 원자도 실존하지 않음(전부 `export {}` 스캐폴드, 다음 원자 착수는 G3 통과 후 게이트). AdSignal/BlogSignal/ShortsSignal 3벌 계약이 append-only 규약 아래 영구 부채화 |
| (c-1) 질문 마이닝만 별도 원자 | kin 호출이 쇼핑검색과 같은 25,000 풀을 잠식하는데 원자 간 원장 공유 불가 → invisible spend 재현. 원장 서비스화는 MSA 금지 위반 |
| (c-2) 계약에 channel/channel_fit 필드 | 미캘리브레이션 스코어(G3 미통과, confidence 0.7 상한 중)가 append-only로 영구 잔존. 채널 추가·개명이 전부 계약 진화 이벤트가 됨. "스코어→자동실행 금지"(경계 5) 우회 유혹 표면 확대 |
| (b-강) wp-auto-blog까지 코드 통합 | 블로그 게이트의 핵심 입력(월간검색량 절대치·SERP gov_ratio)을 이 repo가 합법 산출 불가(검색광고 API 미실측, SERP는 스크래핑). fail-open(블로그) vs silent-drop 금지(여기) 철학 상충. Python↔TS 계약 공유 수단 부재. §8 브릿지로만 연결 |

### 부칙: 마켓 축(국내/해외)도 모듈 경계가 아니다 (2026-07-23 추가)

타게팅 확정 사항: **광고는 해외/국내 모두, 블로그는 해외용·국내용 별도 운영.**
같은 분리/통합 질문이 마켓 축에서 반복되는데, 답도 같다 — **마켓은 소스 어댑터의
축(§4-1)이자 소비 프로파일의 축(§7)이며, 모듈 경계가 아니다.** 채널×마켓으로 모듈을
나누면 3×2=6벌 — 과잉설계의 자기증명이다. wp-auto-blog 원본 설계도 이미 같은 축을
소스 선택으로 풀었다(trendpulse 국내=지식인, bytepulse 영문=Reddit — 원본 §3-2).

정직한 한정: 해외 소스(Reddit·YouTube 등)는 네이버 25,000 풀과 무관한 **독립 쿼터**라
근거 1(쿼터 통합 강제)은 국내 소스에만 적용된다. 해외까지 한 원자로 묶는 근거는
근거 3~6(해석 차이·컴플라이언스 단일 집행·운영 표면·캘리브레이션) + 저장·계약·시드 공유이며,
쿼터 그룹 설계(§6)가 독립 쿼터를 소스별 그룹으로 자연 수용한다.

**재검토 트리거:** 채널 소비 원자가 2개 이상 실존하고 각자의 쿼리 수요가 소스 단위로
분화될 때(예: 광고 원자가 검색광고 API 전용 수집을 요구), 이 ADR을 재평가한다.
그 전까지 채널 분리 요청은 이 문서를 근거로 기각한다.

---

## 3. 데이터 흐름

```
[시드/질문쿼리]                       (seeds/*.txt — 채널 무관 단일 코퍼스)
      │
[BudgetLedger]                       쿼터 그룹 게이트 (§6): search 그룹 합산 ≤ 25,000
      │                              + kin 전용 sub-budget (마이닝이 shop을 굶기지 않게)
      ├── adapters.searchShop ──┐    (기존)
      ├── adapters.searchTrend ─┤    (기존, 선택적 소스)
      └── adapters.searchKin ───┤    (신규: GET /v1/search/kin.json — 읽기 전용)
                                │
[core]                          │    순수함수 (I/O 없음 — 기존 core 규약)
      summarizeCompetition/Trend│    (기존)
      normalizeQuestions ───────┘    (신규: <b> 스트립, 의문문 필터, YMYL/§8 사전 필터)
      │
[계약]  KeywordSignal (무변경)  +  MinedQuestion/QuestionBatch (신규 append, §5)
      │
[store] signals (기존, TTL 24h)  +  questions (v4, TTL 24h 물리삭제)
        signal_history (기존)    +  question_history (v4, 가공지표만 TTL 면제)
      │
[소비]  ── 사람 게이트 ──  채널 프로파일 (§7: 광고/블로그/쇼츠 — 정렬·필터 뷰)
                           wp-auto-blog 브릿지 (§8: 단방향 JSON export)
```

핵심 규약 계승: 질문 소스 실패는 키워드 수집을 죽이지 않는다(datalab "선택적 소스" 패턴).
실패는 전량 `failures`/`coverage`/`skippedByBudget` 으로 투명화(silent drop 금지).

---

## 4. 소스 판정표 (공식 API 경계 — 2026-07-23 실측)

| 소스 | 공식 API | 이 repo 판정 | 근거·조건 |
|---|---|---|---|
| ① 네이버 지식iN 검색 | ✅ `GET openapi.naver.com/v1/search/kin.json` | **허용** (읽기 전용 신호 수집 한정) | 공식 문서 실측(2026-07-23, `docs/serviceapi/search/kin/kin.md`): query 필수 · display 기본10/최대100 · start 최대1000 · sort `sim\|date\|point` · 응답 item = **title(질문 제목)·link·description(요약 패시지)** · 오류 SE01~06/SE99. **질문 전문·답변 본문 필드는 없음** — 단 description 패시지에 답변 발췌 조각이 섞일 수 있음(공식 예시 실측) → 계약은 **title만 저장, description 미저장**. **link 를 따라가 파싱하는 순간 금지선 #1** (경계 1: API가 안 주면 범위 밖). 쿼터는 검색 API 통합 25,000/일 합산("지식iN 검색은 검색 API를 사용하며, 검색 API의 하루 호출 한도는 25,000회입니다" — kin 문서 원문) |
| ② 네이버 데이터랩 | ✅ (이미 통합, D1-3) | **허용** (기존) | 질문형 키워드의 상대 수요 추이. 1,000/일 — 질문 검증에 아껴 쓸 것 |
| ③ 네이버 검색광고 API | ✅ (별도 체계: 광고주 계정 + HMAC) | **D1-8 실측 필요** | 월간검색량 **절대치**·연관키워드. 이 repo 미통합(grep 0건). 인증·쿼터·약관 실측 전 착수 금지. 착수 시 `IMPLEMENTATION.md` §0에 D1-8로 편입 |
| ④ Reddit Data API | ✅ (OAuth) | **D1-7 실측 필요** | 공식 API라 금지선 #1 비위반. 무료 100 QPM(공식 wiki). 단 **상업적 이용은 사전 승인 필수** — "내부 수요 리서치"도 상업 해석 소지 → 승인 문의가 실측 항목. 상세 §4-1 |
| ⑤ Google PAA | ❌ 없음 (Custom Search JSON API는 PAA 미반환) | **금지** | SerpAPI 등은 스크래핑 외주화 — 금지선 #1 정신 + "공식 API만" 문언 위반. 재론 불가 |

> ①의 스펙 수치는 착수 시점에 `NAVER_LIMITS`(naver-client.ts) 상수로 확정하며
> `IMPLEMENTATION.md` §0 표(D1-1~5)에 **D1-6(지식iN 검색, 사전 실측 완료)** 행으로 정식 편입한다.

### 4-1. 마켓 축: 해외(영어권) 소스 지형 (2026-07-23 실측)

①~③은 **국내 전용**이다(네이버 = 한국 시장). 해외 타겟(광고 해외분·해외 블로그)의
질문·수요 신호는 아래 소스가 담당한다 — 전부 네이버 25,000 풀과 무관한 독립 쿼터.

| 소스 | 공식 API | 판정 | 근거·조건 |
|---|---|---|---|
| YouTube Data API v3 | ✅ | **D1-9 실측 필요 (유력)** | 기본 10,000유닛/일(공식 문서 직접 확인) · search.list=100유닛/호출, commentThreads.list=1유닛. 질문형 영상 제목·댓글 수집 가능. ⚠️ **Authorized Data 30일 내 삭제·갱신 의무**(현행 TTL 24h 기본값이 이미 충족 — 소스별 TTL 지원 필요) · 파생지표 표시 제한 · 댓글의 LLM 주입은 AI학습 옵트인 조항 그레이존 → 재표현·사람 게이트 필수 |
| Google Ads API Keyword Planner | ✅ | **D1-10 실측 필요 (유력)** | 해외판 "검색광고 API" 아날로그 — 근사 월간 검색량(구간값)·과거 4년·지역 타게팅(공식 문서 확인). 개발자 토큰 심사 필요. 국내 D1-8과 같은 성격의 정량 수요 신호 |
| Reddit Data API | ✅ | D1-7 (조건부) | §4 ④ 참조 — 영어권 실질문 최상급 소스이나 상업 이용 사전 승인이 게이트 |
| Google Trends API | ⚠️ 알파 | 신청만, 의존 금지 | 2025-07 공개 allowlist 신청제·GA 미정(무응답 사례 다수) — 신청은 걸어두되 파이프라인 의존 불가 |
| Pinterest API v5 Trends | ✅ | 후순위 후보 | 지역별 트렌딩 키워드+예측 시계열 — K-Beauty 비주얼에 적합. 비즈니스 계정+앱 심사, 티어·지역 커버리지 미확인 |
| HN `/v0/askstories` · Stack Exchange | ✅ | 후순위 (tech 한정) | 공식·무료(SE 키 기반 10,000/일 직접 확인). AI/tech 버티컬만. SE 콘텐츠는 CC BY-SA — 저작자표시 의무 |
| Quora · TikTok Research · Bing · Amazon PA-API · X | ❌/불가 | **배제** | Quora 공식 API 없음 · TikTok Research 학술/비영리 한정(상업 명시 배제) · Bing 검색 API 2025-08 종료 · **Amazon PA-API 2026-05 종료**(원래도 검색량 미제공) · X 는 pay-per-use 비용 구조상 실익 없음 |

⚠️ **정직한 공백 기록**: 해외 커머스의 **경쟁·가격 신호**(국내의 쇼핑검색 API
competition 블록 등가물)는 현재 합법 소스가 없다(PA-API 종료). 해외 마켓 신호는
당분간 "질문·수요"까지만이며, `KeywordSignal.competition` 은 **국내 전용 지표**임을
소비 프로파일이 인지해야 한다(§7).

---

## 5. 계약 진화 (append-only)

**KeywordSignal 은 건드리지 않는다.** 질문은 grain 이 다르다
(키워드×시점 스냅샷 vs 쿼리→다건 질문 목록) — 별도 계약 파일로 append 한다.
`contracts/src/index.ts` 에 예고된 "새 계약 파일 + export 1줄" 공식 진화 경로 그대로.

```ts
// packages/contracts/src/question-signal.ts (신규)
export interface MinedQuestion {
  question: string;        // 지식iN title만 (<b> 스트립). 답변 본문은 계약상 존재하지 않는다
  source: IntelSource;     // 'naver_search_kin' (유니온 append)
  sourceUrl: string;       // link — 추적용. 이 URL 을 fetch 하는 코드는 금지선 #1
  matchedKeyword: string | null;  // 정규화 후 매칭된 시드 키워드
  market: 'kr' | 'global'; // 마켓 축 (§4-1). 소스가 결정: naver_search_kin→'kr', reddit/youtube→'global'
  capturedAt: string;      // ISO8601 UTC
  compliance: { resaleRestricted: boolean; cacheTtlHours: number };  // KeywordSignal 과 동일 전파
}
export interface QuestionBatch {
  runId: string;
  query: string;
  questions: MinedQuestion[];
  failures: Array<{ query: string; reason: string }>;   // silent drop 금지
  callsSpent: Record<IntelSource, number>;
  startedAt: string; finishedAt: string;
}
```

- `IntelSource` 유니온에 `'naver_search_kin'` append — **읽기 소비자·저장 데이터 기준
  non-breaking.** 단 `Record<IntelSource, ·>` 구성 지점(collect.ts 의 callsSpent 초기화,
  ledger.ts 의 defaultBudgets/생성자)은 컴파일 에러로 강제 갱신된다 — 신규 소스의
  예산·계상 누락을 타입이 막아주는 **의도된 경로**다. `coverage.sources/ok/skippedByBudget`·
  `IntelBatch.callsSpent` 가 IntelSource 키라 소스 추가만으로 투명화 인프라를 자동 상속한다.
- 유니온 주석 "전부 네이버 공식 API"는 유지된다(지식iN도 네이버 공식 API).
  ④ Reddit 편입 시에만 "전부 공식 API"로 문구 완화 필요 (D1-7 통과가 전제).
- **채널 필드는 계약에 넣지 않는다** (§2 기각 대안 c-2).

---

## 6. 예산·원장 (착수 시 필수 선행 보강)

지식iN 호출은 쇼핑검색과 **같은 25,000/일 물리 쿼터를 잠식**한다
(client ID 합산은 D1-2, 지식iN의 통합 쿼터 포함은 kin 공식 문서 원문 실측 — §4 ①).
현재 `BudgetLedger` 는 소스별 clamp 만 있어, kin 을 소스로만 추가하면
shop 25,000 + kin 25,000 = 물리 한도 2배 설정이 가능한 사고 경로가 생긴다. 따라서:

1. **쿼터 그룹 도입**: source→group 매핑
   `{ naver_search_shop→'search', naver_search_kin→'search', naver_datalab_search→'datalab', naver_datalab_shopping→'datalab_shopping' }`.
   해외 소스는 각자 독립 그룹으로 자연 확장(`reddit`, `youtube`, `google_ads` … — 네이버
   풀과 경합 없음, 그룹 설계가 마켓 축을 추가 개념 없이 수용).
   `tryReserve` 는 (a) 소스별 sub-budget, (b) **그룹 합산 ≤ 공식 한도** 를 이중 체크.
   `call_ledger` 행은 (day, source) 그대로 — 스키마 무변경, 소스별 관찰성 보존.
   ⚠️ 그룹 합산 체크는 여러 (day, source) 행의 SUM 을 봐야 하므로 현행 "조건부 UPDATE
   한 문장" 원자성이 깨진다 — **명시적 트랜잭션(BEGIN IMMEDIATE) 또는 합산 조건부 단일
   SQL** 로 기존 원자성 불변식을 유지해야 한다(launchd 자동수집 × 수동 CLI 동시 실행 시나리오).
2. **kin 전용 호출 sub-budget** (예: `DAILY_CALL_BUDGET_KIN=500`, env 기본값): 질문 마이닝이
   시드 수집(shop) 예산을 굶기지 않게. (호출 예산 보강 — 유입 건수 상한은 3이 담당.)
3. **일일 유입 건수 상한** (예: `MAX_MINED_QUESTIONS_PER_DAY`, 보수적 기본값): 원본 설계의
   "소스당 일일 유입 상한(예: 5건)" 가드레일의 **직접 이식** — 상한 단위는 호출이 아니라
   **저장 건수**다(호출 상한만으로는 kin 500회 × display 100 = 이론상 일 5만 건 유입 가능).
   `normalizeQuestions` 이후 store 유입 시점에 clamp 하고 초과분은 `failures`/`coverage` 로
   투명화한다(silent drop 금지).
4. 재시도 1회 = 계상 1회, KST 자정 리셋 가정, 이중 clamp 등 기존 원장 규약 전부 상속.

---

## 7. 채널별 소비 프로파일 (통합 수집 위의 분화 지점)

채널이 갈리는 곳은 여기 **하나뿐**이다. 전부 저장된 신호의 읽기 전용 뷰(정렬·필터)이며,
TTL 24h 내 신호 재사용 — **채널당 추가 API 호출 0회.**

| | 광고용 | 블로그용(wp-auto-blog) | 쇼츠용(slide-renderer) |
|---|---|---|---|
| 정렬·필터 | 경쟁 지표·(D1-8 후) 절대 검색량 | 질문 매칭·롱테일 | `momentumPct`·`trend.latest` 신선도 |
| 질문 활용 | 소재 기획 참고 (자동 광고 생성 금지 — 금지선 #3) | FAQ 실질문 주입 — 단 게시 텍스트는 **재표현 게이트(§8) 통과분만** | 훅 가능한 질문 선별 — 게시 텍스트 재표현 규칙(§8) 동일 적용 |
| 사람 게이트 | 식품표시광고법 §8 표현검수 + 광고 자율심의 | YMYL 제외 + 게이트 재통과(§8) | 기획 게이트 + 소재 라이선스 확인 |
| 전달 형태 | 기획 문서 (자동 집행 없음) | JSON export (§8) | (G3 후) 사람 게이트 뒤 RenderJob |
| ⚠️ 시드 플래그 해석 | **차단성** (광고리스크) | 표현 주의 | 소재 적합성 판단 |
| 마켓 분화 (§4-1) | 국내=쇼핑검색·(D1-8) / 해외=(D1-10) Keyword Planner — **해외 경쟁·가격 신호는 공백 유의** | 국내(trendpulse)←지식iN / 해외(bytepulse)←Reddit·YouTube | 국내=DataLab 모멘텀 / 해외=(신청 후) Trends·Pinterest |

프로파일 식별자는 **채널-마켓 2축**이다: `ads-kr` `ads-global` `blog-kr` `blog-global` … —
여전히 전부 읽기 전용 뷰이며, 마켓이 늘어도 수집 파이프라인·원장·저장은 그대로다.

구현 형태: `analyze --profile <ads|blog|shorts>` CLI 뷰 또는 (조합 단계에서) 별도
orchestration 패키지의 순수함수. 프로파일 로직을 수집기 내부에 하드코딩하지 않는다 —
수집기가 채널을 알게 되는 순간 채널 정책 변경마다 수집기 배포가 필요해지고,
"프로파일→자동 발행" 미끄럼길(경계 5)이 열린다.

---

## 8. wp-auto-blog 브릿지 (repo 경계 — 채널 경계가 아니라 법체계 경계)

wp-auto-blog(Python)는 fail-open 철학 + DDG 스크래핑 의존으로 이 repo와 컴플라이언스
체제가 다르다. **코드·저장·게이트 통합 금지.** 연결은 단방향 데이터 계약만:

```
keyword-intel ──(analyze --profile blog-kr|blog-global --json: schemaVersion 포함 export)──▶
wp-auto-blog 스크립트가 pull → topic_queue_general.json 에
source="cak_keyword_intel" / source_questions=[실질문…] 로 append
→ 단, 블로그측 keyword_gate.evaluate() 재통과 필수 (그쪽 불변식 유지)
```

- 이 브릿지는 wp-auto-blog 원본 설계의 유일한 신규 스크래핑(지식인 HTML 파싱)을
  **공식 API 산출물 소비로 대체·폐기**시킨다. 엄격한 쪽에서 생산 → 느슨한 쪽으로 흘리는
  단방향이 거버넌스상 유일하게 안전한 방향이다.
- **개통 전 확인 2건**: (1) 블로그측 착수 트리거(GSC 색인 20건+ / 큐 잔량 3주 미만 —
  원본 문서 §7) 충족, (2) D1-5 사람 게이트에서 export 가 "제3자 재제공"이 아니라
  "본인 소유 파이프라인 내 이동"임을 약관 원문으로 확인.
- **원문 게시 통제 (재표현 게이트):** 질문 title 은 타인 저작물이자 네이버 검색결과다.
  D1-5 확정 전에는 어떤 채널에서도 **title 원문을 그대로 공개 게시하지 않는다** —
  블로그 FAQ·쇼츠 훅에 쓰이는 질문 텍스트는 사람/LLM **재표현(paraphrase) 게이트** 통과분만
  허용하고, §10 가드레일 테스트로 강제한다. 트레이드오프(정직한 기록): 원본 설계 §5의
  "실제 쿼리 exact-match → PAA 리치리절트" 가치는 재표현만큼 약화된다. verbatim 게시를
  원하면 D1-5 사람 게이트 확인 항목에 **"검색결과 title 의 공개 재게시 허용 여부(검색특약
  2.1 독립노출 조항 포함)"** 를 추가해 약관 원문으로 확인한 뒤에만 연다.
- **export 계약 강화 (TTL 은 파일이 아니라 수신측 저장소에 건다):** export 파일 자체의
  TTL 은 pull 순간 무력화된다(블로그 큐 체류 ≈ 10주, 블로그측엔 compliance 집행 장치 없음).
  따라서 (1) export JSON 에 `compliance(resaleRestricted, cacheTtlHours)` 필수 포함 —
  "소비 모듈은 이 필드를 무시할 수 없다"(LEGAL-BOUNDARY §3) 원칙의 repo 경계 연장,
  (2) 블로그측 pull 스크립트에 **TTL 경과 시 `source_questions` 필드 purge**(topic 등
  가공물은 유지) 의무를 **개통 조건**으로 명문화, (3) D1-5 확정 전에는 질문 원문 대신
  재표현·제목화된 topic 만 export 하는 **보수 모드가 기본**.
- 블로그의 keyword_gate(검색광고 API + DDG SERP)는 블로그 repo 에 존속한다.
  검색광고 API가 이 repo 에 필요해지면 Python 코드 재사용이 아니라 D1-8 실측 후 독립 어댑터로.

---

## 9. 착수 조건 (지금 구현하지 않는 이유)

**지금 병목은 소재가 아니라 검증이다.** G3(스코어 유용성)가 대기 중이고, 소비 원자는
전부 미착수 스캐폴드다. 질문 신호를 쌓아도 소비할 곳과 검증할 근거가 아직 없다.
(원본 문서의 "색인 병목" 논리와 동형 — 병목이 아닌 곳을 파지 않는다.)

**착수 트리거** (아래 중 하나 충족 시):

- **G3 통과** → 다음 원자/조합 단계에서 질문 신호의 소비처가 실존하게 됨
- **G3 미달-재설계 분기**에서 "질문형 수요 신호가 스코어 개선에 필요"로 판정
- **wp-auto-blog 측 착수 트리거 충족** + 사람이 브릿지(§8) 개통을 결정
  → 이 경우 §8 export 경로만 우선 구현 가능
  (최소: **§6 쿼터 그룹(선행 필수)** → searchKin + normalizeQuestions + 재표현 게이트 + export)

**해외 마켓 착수의 추가 선행 게이트**: 해외분(광고 해외·해외 블로그)은 위 트리거와 별개로
D1-9(YouTube)·D1-10(Keyword Planner) 약관·쿼터 실측 + Reddit 상업 승인 회신(D1-7)이
선행돼야 한다. 국내(지식iN)가 먼저 열리고 해외가 뒤따르는 순서가 자연스럽다 —
같은 원자 안에서 소스 어댑터만 늘어나므로 해외 착수가 국내 구현을 기다릴 필요는 없되,
§6 쿼터 그룹은 공통 선행이다.

착수 시 이 문서 §4~6 을 `IMPLEMENTATION.md` 에 Phase 항목으로 편입하고 게이트를 단다.

## 10. 구현 체크리스트 (착수 시)

- [ ] `BudgetLedger` 쿼터 그룹 + 그룹 합산 clamp (§6 — **다른 무엇보다 먼저**)
- [ ] `adapters/naver-client.ts` `searchKin()` (searchShop 패턴 복제, GET-only) + `NAVER_LIMITS` 에 kin 스펙 확정
- [ ] `adapters/schemas.ts` kinSearchResultSchema (title/link/description, `.passthrough()`)
- [ ] `contracts` question-signal.ts (**market 필드 포함**) + IntelSource `'naver_search_kin'` append
- [ ] compliance 의 소스별 TTL 지원 (YouTube 30일 보존규정 등 소스마다 상한이 다름 — 기본 24h 유지)
- [ ] (해외 착수 시) D1-9 YouTube·D1-10 Keyword Planner 실측 + Reddit 상업 승인 문의(D1-7) + 해외 소스 어댑터·독립 쿼터 그룹
- [ ] `core/question-miner.ts` normalizeQuestions (순수함수: `<b>` 스트립, 의문문 필터, YMYL·질병효능(식품표시광고법 §8) 사전 필터 정규식)
- [ ] store v4 마이그레이션: questions(TTL 24h 물리삭제) + question_history(가공지표만, TTL 면제)
- [ ] collect `--with-questions` (선택적 소스 패턴 — 실패 시 신호 비차단) + report 질문 섹션
- [ ] `analyze --profile` 채널 뷰 (§7)
- [ ] (브릿지 개통 시) `--json` export + schemaVersion + **compliance 필드 필수 포함** + wp-auto-blog 측 pull 스크립트(TTL 경과 시 source_questions purge 의무 — §8)
- [ ] 가드레일 유닛 테스트: 답변 본문·description 미저장(title만), sourceUrl 미fetch, YMYL 필터, kin sub-budget, 그룹 합산 clamp, **일일 유입 건수 상한**, **그룹 합산의 다중 프로세스 동시성**(launchd × CLI), **게시 텍스트 재표현 게이트**(원문 verbatim 차단)
- [ ] 문서 갱신: `IMPLEMENTATION.md` §0 에 **D1-6(지식iN 검색, 사전 실측 완료)** 편입, `LEGAL-BOUNDARY.md` 에 지식iN 항목(title만 저장·description 미저장·집계만·원문 재게시는 재표현 게이트 필수) 추가
