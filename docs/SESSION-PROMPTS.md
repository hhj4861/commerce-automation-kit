# 새 Claude 세션 킥오프 프롬프트 모음

이 저장소에서 새 Claude Code 세션을 열 때, 작업 종류에 맞는 아래 프롬프트를 **복사해서 붙여넣는다.**
`CLAUDE.md` 는 세션이 자동 로드하므로 금지선·구조는 이미 인지된 상태다. 아래 프롬프트는 그 위에서 "무엇을 할지"를 준다.

> 사용법: 원하는 블록의 회색 코드 안 텍스트를 그대로 붙여넣기. `〈 〉` 부분만 상황에 맞게 바꾼다.

---

## 0. 오리엔테이션 (프로젝트를 처음 이어받을 때 / 맥락 복구)

```
이 저장소는 commerce-automation-kit 모노레포야. 먼저 CLAUDE.md 와 docs/ARCHITECTURE.md,
그리고 각 packages/*/README.md 를 읽고 현재 상태를 요약해줘.
특히 (1) 4개 원자 중 무엇이 어디까지 됐는지, (2) 지금 당장 해야 할 다음 작업 하나,
(3) 내가 실수로 넘지 말아야 할 금지선을 짚어줘. 아직 코드는 건드리지 마.
```

---

## 1. keyword-intel — [D1] 스펙·약관 실측 (구현 착수 첫 작업)

```
packages/keyword-intel 를 구현하려고 해. 먼저 docs/IMPLEMENTATION.md 의 [D1] 체크리스트대로
네이버 공식 문서(developers.naver.com)를 열어서 아래를 실측하고 코드 상수를 확정해줘:
- 쇼핑 검색 API 엔드포인트/파라미터(display·start 최대)/응답 필드/일일 호출한도
- 데이터랩 검색어트렌드 API 바디/keywordGroups 최대/일일 한도
- 데이터랩 쇼핑인사이트 엔드포인트/카테고리 코드
- ★약관: 데이터 저장·캐싱 허용기간, 재판매·제3자제공 금지, 상업적 이용 범위 (D1-5)
확정 결과로 src/adapters/naver-client.ts 의 TODO(D1) 를 없애고,
계약의 compliance(resaleRestricted·cacheTtlHours)와 LEGAL-BOUNDARY.md 를 실제 약관으로 갱신해줘.
약관을 못 열면 지어내지 말고 미확인으로 남기고 나한테 링크를 줘.
```

> ⚠️ D1-5(약관)가 이 모듈을 나중에 SaaS로 팔 수 있는지를 결정한다. 확정 전 재판매/모니터링 기능 금지.

> 💡 **전용 서브에이전트 있음**: `.claude/agents/d1-researcher.md` — 공식 문서 원문 실측 →
> 확정/미확인 판정(2패스 검증), 접근 기법(네이버 문서 curl 우회·약관 페이지 차단)과
> D1 현황표가 내장돼 있다. "D1-n 실측해줘" 로 부르면 된다. 대기 항목: D1-5·7·8·9·10.

---

## 2. keyword-intel — Phase 1~2 구현 (D1 통과 후)

```
packages/keyword-intel 의 docs/IMPLEMENTATION.md Phase 1(Walking Skeleton)부터 구현해줘.
- .env 에 네이버 키가 있다고 가정하고 collectSignals() 를 실제 동작하게 완성
- 어댑터 응답을 zod 로 검증하고 KeywordSignal 계약대로 채워
- store(SQLite)와 budget(일일 호출예산 영속 카운터), 관측성(로깅·재시도·DLQ)까지 Phase 2 범위로
통과 기준(게이트 G1/G2)을 만족하는지 vitest 로 검증하고, 한도를 실제로 넘기지 않게 해줘.
금지선(CLAUDE.md) 준수: 공식 API만, silent drop 금지, 스코어를 자동 트리거로 쓰지 말 것.
```

---

## 3. 새 원자 착수 (slide-renderer / coupang-connector / manychat-reply)

```
packages/〈원자이름〉 를 착수하려고 해. 먼저 그 패키지의 README.md 의 유지조건·금지선을 읽고,
blueprint-review 재설계 문서(LEGAL-MINIMAL-ARCHITECTURE.md)의 해당 keep-modified 조건도 확인해줘.
그 다음:
1. 이 원자의 입력/출력 계약을 @cak/contracts 에 append-only 로 추가 (예: RenderJob)
2. keyword-intel 와 같은 구조(adapters/core/cli + test)로 스캐폴드
3. 이 원자의 README/ARCHITECTURE/IMPLEMENTATION/LEGAL-BOUNDARY 문서 작성
절대 원칙: 〈원자별 금지선 — 예: slide-renderer는 스크래핑 입력 금지, 라이선스/자체촬영 소스만〉.
다른 원자를 직접 import 하지 말고 계약으로만 연결해.
```

---

## 4. 조합 (integration — 원자 2개 이상이 준비된 뒤)

```
〈원자A〉 와 〈원자B〉 를 조합하려고 해. 두 원자는 서로를 직접 import 하지 않고
@cak/contracts 계약으로만 연결돼야 해. 아래를 해줘:
1. 두 원자 사이에 필요한 사람 게이트(ARCHITECTURE.md §사람 게이트)를 코드 흐름에 명시 — 우회 금지
2. 조합 지점을 별도 orchestration 코드(또는 새 패키지)로 만들되, 각 원자 내부는 건드리지 마
3. 계약 불일치가 있으면 계약을 append-only 로 확장
완전 무인 연결을 만들지 말고, 게이트마다 사람이 확인하는 지점을 남겨.
```

---

## 5. 안전장치 — 위법 요청이 들어왔을 때 Claude가 해야 할 것

```
내가 혹시 CLAUDE.md 금지선에 걸리는 걸 요청하면(스크래핑·API우회·무검수 대량광고·대량DM·낙수트리거·데이터재판매 등),
코드로 만들지 말고 (1) 어떤 금지선·법조문에 걸리는지, (2) 왜 위험한지, (3) 합법 대안을 먼저 알려줘.
내가 "그래도 해"라고 해도, 되돌리기 어려운 위법(형사/계정밴)은 만들지 말고 근거와 함께 거절해줘.
```

---

## 6. meta-paid-reach — 실계정 검증 (PoC 코드 완료 후, 사람 자산 준비 뒤)

```
packages/meta-paid-reach 의 Meta 1,000회 유료 노출 PoC를 실계정으로 검증하려고 해.
README 「검증 순서」를 그대로 따르되, 아래 순서를 지켜줘:
1. 무과금 dry-run(plan) → preflight(읽기 전용)로 계정 통화·시간대·Page 연결을 확인하고 결과를 나에게 보여줘
2. 설정 파일의 예산 단위(lifetimeBudgetMinorUnits / pauseAtSpendAccountCurrency)를 preflight 통화 기준으로 내가 확인할 때까지 create 를 실행하지 마
3. create 는 --execute --confirm CREATE_PAUSED 까지만. 활성화(run --execute --confirm LIVE_SPEND)는 내가 Ads Manager 에서 검수한 뒤 별도로 지시할 때만
4. 상태 파일·impressions/spend 결과는 그대로 보고하고, 지출 상한 도달·조회 실패·PAUSE 실패는 숨기지 말고 투명하게 알려줘
토큰·앱 시크릿은 출력하지 말고, .env 는 셸 export 로만 주입해.
```

---

## 참고 자료 위치 (별도 저장소 venture-studio)

- 감사 결론: `venture-studio/ventures/market/coupang-supplement-brand/blueprint-review/BLUEPRINT-REVIEW.md`
- 재설계(원자 도출): `.../blueprint-review/LEGAL-MINIMAL-ARCHITECTURE.md`
- 원안 사업 검증(낙수 반증): `.../coupang-supplement-brand/README.md`, `.../research/data/*.csv`
