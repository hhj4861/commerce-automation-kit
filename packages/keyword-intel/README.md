# commerce-keyword-intel

> 네이버 **공식 API** 기반 커머스 키워드·트렌드·경쟁 인텔리전스 모듈
> — 「합법 유틸리티 원자 #1」. 스크래핑·에뮬레이터·자동배포 없음.

**생성일:** 2026-07-23 · **상태:** **Phase 1+2 완료, G1·G2 실호출 통과**(D1 실측·zod 검증·store/budget/obs·analyze CLI, 테스트 64개, 시드 182개 커버리지 100%) — 잔여: Phase 3 유용성 검증(G3) · 약관(D1-5) 사람 확인

---

## 0. 이 프로젝트는 무엇이고, 왜 이것부터 만드는가

이 저장소는 `ventures/market/coupang-supplement-brand/blueprint-review/` 감사에서
**DO-NOT-BUILD** 판정을 받은 「커머스 마케팅 자동화 파이프라인」 설계서를 해체한 뒤,
그 안에서 **위법·반증 요소를 전부 걷어내고 남은 4개의 합법 유틸리티 원자** 중 첫 번째다.

> 원안 설계서 판정: 변호사 6점 · 투자자 7점 · 아키텍트 REDESIGN 14점 → **DO-NOT-BUILD**
> 상세(별도 저장소): `venture-studio/ventures/market/coupang-supplement-brand/blueprint-review/BLUEPRINT-REVIEW.md`
> — 이 프로젝트는 그 감사에서 분리된 독립 저장소다.

**왜 4원자 중 이걸 먼저?**

| 기준 | 이 모듈(네이버 API 인텔) | 다른 3원자 |
|---|---|---|
| 파이프라인 위치 | **최상류** — 다른 모든 모듈의 입력 | 하류(렌더·커머스·DM) |
| 합법성 | 공식 API만 사용, 가장 깨끗 | 조건부(WING 승인/라이선스 입력 필요) |
| 독립 가치 | 그 자체로 셀러용 키워드·경쟁 데이터 | 앞단 없이는 무의미 |
| 선행 게이트 | 없음(개발자센터 앱 등록 5분) | 있음 |

**"모듈 독립 구축 후 조합" 전략이 정확히 옳게 적용되는 지점이다.**
단, 원안이 이 데이터를 쓰려던 방식(**홈쇼핑 낙수 트리거**)은 자체 1차 데이터에서 이미 반증됐다
(쇼핑클릭 리프트 중앙값 +4.3%, 익일 상관 ≈0). 그래서 이 모듈은 트리거가 아니라
**"일반 수요·경쟁 참고 지표"** 만 산출한다. 이 선을 넘지 않는 것이 설계의 핵심 제약이다.

---

## 1. 무엇을 하는가 (Scope)

**IN — 이 모듈이 하는 것**
- 네이버 **쇼핑 검색 API**로 키워드별 경쟁 밀도·가격 분포·판매자 집중도 수집
- 네이버 **데이터랩 검색어트렌드 API**로 상대 수요 추이·모멘텀 수집
- 위를 합쳐 `KeywordSignal` 계약 객체로 정규화 → 저장·조회
- opportunity/confidence 파생 스코어 산출 (참고 지표)

**OUT — 이 모듈이 하지 않는 것 (계약상 금지)**
- ❌ 웹/앱 스크래핑, 홈쇼핑 편성표 크롤링 (→ 저작권·약관 리스크)
- ❌ "이 키워드를 만들어라"는 자동 제조/매수 트리거 (→ 낙수는 반증됨)
- ❌ 수집 데이터의 원본 재판매 (→ 네이버 약관, [LEGAL-BOUNDARY](./docs/LEGAL-BOUNDARY.md))
- ❌ 콘텐츠 생성·배포·DM (→ 별도 원자 모듈의 몫)

---

## 2. 조합(Composition) 관점 — 이 모듈이 나중에 어떻게 끼워지는가

다른 모듈은 이 모듈의 내부를 몰라도 된다. 오직 **출력 계약** 하나만 import 한다.

```
[commerce-keyword-intel]  --KeywordSignal[]-->  (사람: 상품 기획 판단)
                                                      |
                          (렌더러 원자)  <-- 자체촬영/라이선스 입력으로만
                          (쿠팡 원자)    <-- WING 승인 셀러 전제
                          (Manychat 원자)<-- opt-in 문의응대만
```

- 계약 파일: [`packages/contracts/src/keyword-signal.ts`](../contracts/src/keyword-signal.ts) (`@cak/contracts`) — **소비 모듈은 이 파일만 본다**
- 계약은 append-only 진화. 낙수 같은 반증 개념은 계약에 넣지 않는다.

---

## 3. 빠른 시작

```bash
cp .env.example .env      # NAVER_CLIENT_ID / SECRET 채우기 (developers.naver.com 앱 등록)
npm install
npm test                  # 51개 테스트 (실키 불필요 — 전부 목킹/in-memory)
npm run collect -- "루테인,밀크씨슬,콜라겐"   # 수집 → IntelBatch JSON + SQLite 영속화
npm run analyze -- --top 20                    # 저장 신호 opportunity 순 상위 N (참고 지표)
npm run dlq                                    # 반복실패 격리 현황 / `-- clear` 로 즉시 해제
npm run report -- --dry-run                    # 일일 다이제스트 미리보기 (--setup: chat_id 탐색)
```

**매일 자동 수집·리포트 (launchd, 09:30 KST):**
```bash
# 설치돼 있음: ~/Library/LaunchAgents/com.cak.keyword-intel-daily.plist
#   → scripts/daily-collect.sh (collect seeds/g2-seeds.txt → report 텔레그램 전송)
# 로그: data/daily.log · 끄기: launchctl unload ~/Library/LaunchAgents/com.cak.keyword-intel-daily.plist
# 텔레그램: .env 의 TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID (미설정 시 전송만 생략, 수집은 계속)
# ⚠️ 머신이 꺼져 있으면 그날 실행은 건너뜀(잠자기는 깨어날 때 실행됨)
```

> ✅ **[D1 실측 완료 2026-07-23]** 엔드포인트·파라미터·한도는 공식 문서 원문으로 확정됐다 —
> 단일 소스는 `src/adapters/naver-client.ts` 의 `NAVER_LIMITS`, 근거는
> [`docs/IMPLEMENTATION.md`](./docs/IMPLEMENTATION.md) §0.
> 단 **약관(D1-5)은 미확정**(자동 접근 차단) — 사람이 로그인 브라우저로 원문 확인 필요.
> 확정 전까지 `compliance` 는 보수적 기본값(재판매 금지·짧은 TTL)을 유지한다.

---

## 4. 문서

| 문서 | 언제 읽나 |
|---|---|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 내부 구조·데이터흐름·인터페이스 계약·스코어 정의·기술 선택 근거 |
| [`docs/IMPLEMENTATION.md`](./docs/IMPLEMENTATION.md) | 구현 순서·마일스톤·통과 기준·자금/시간·의사결정 게이트 |
| [`docs/LEGAL-BOUNDARY.md`](./docs/LEGAL-BOUNDARY.md) | 이 모듈이 왜 합법인지 + **넘으면 안 되는 선**(재판매/캐싱/스크래핑 대체) |
| [`docs/QUESTION-MINING.md`](./docs/QUESTION-MINING.md) | 질문 마이닝(실수요 질문 신호) 설계 + **채널별 검색 분리 vs 통합 결정 기록(ADR)** — 설계만, 착수 조건 있음 |

## 5. 다음 액션 3개

1. `developers.naver.com`에서 애플리케이션 등록 → 검색 API + 데이터랩 API 사용 설정, Client ID/Secret 발급
2. ~~[D1] 어댑터 상수 확정~~ ✅ 완료(2026-07-23, `IMPLEMENTATION.md` §0) — 남은 것: **D1-5 약관 원문 사람 확인**
3. `npm run collect` 로 실제 키워드 10개 수집해 `KeywordSignal` 출력이 계약대로 나오는지 확인(게이트 **G1**)
