# commerce-automation-kit

> 합법 커머스 자동화 **원자(독립 모듈)들의 모노레포**.
> 각 원자는 `packages/` 아래에서 독립적으로 빌드·테스트·배포되고,
> 오직 공유 계약 `@cak/contracts` 로만 조합된다.

**생성:** 2026-07-23 · **구조:** npm workspaces 모노레포 · **현황 상세:** [`docs/PROGRESS.md`](./docs/PROGRESS.md)

---

## 0. 이 저장소는 무엇인가

`venture-studio/ventures/market/coupang-supplement-brand/blueprint-review/` 감사에서
**DO-NOT-BUILD** 판정된 「커머스 마케팅 자동화 파이프라인」 설계서를 해체한 뒤,
위법·반증 요소를 전부 걷어내고 남은 **합법 유틸리티 원자들**을 독립 모듈로 구축·조합하는 프로젝트다.

**핵심 전략:** 각 원자를 독립적으로 완성해두고, 검증된 것만 계약으로 조합한다.
"저작권 등은 나중에"가 아니라 **각 원자의 합법 경계를 코드에 먼저 박아두고**, 근거가 확인된 만큼만 연다.

---

## 1. 원자 목록과 상태

| 패키지 | 원자 | 역할 | 상태 |
|---|---|---|---|
| [`packages/contracts`](./packages/contracts) | 공유 계약 | 모든 모듈 간 인터페이스 (`KeywordSignal` 등) | 🟢 keyword-signal 계약 존재 |
| [`packages/keyword-intel`](./packages/keyword-intel) | #1 | 네이버 공식 API 키워드·트렌드·경쟁 인텔 | 🟢 **Phase 1·2 완료, G1·G2 실호출 통과. 매일 자동수집+텔레그램 리포트 가동 중** (다음: Phase 3) |
| [`packages/slide-renderer`](./packages/slide-renderer) | #2 | 초경량 슬라이드 숏폼 렌더러 (라이선스 입력만) | ⚪ 미착수 |
| [`packages/coupang-connector`](./packages/coupang-connector) | #3 | 쿠팡 Open API 상품·주문·정산 (WING 승인 전제) | ⚪ 미착수 |
| [`packages/manychat-reply`](./packages/manychat-reply) | #4 | Manychat 공식 단일 Private Reply (opt-in) | ⚪ 미착수 |

---

## 2. 조합 원리 — 원자는 서로를 모른다

```
                     ┌─────────────────────┐
                     │   @cak/contracts     │  ← 모든 조합의 유일한 접점
                     │  (KeywordSignal …)   │
                     └──────────┬──────────┘
        ┌───────────────┬───────┴───────┬───────────────┐
   keyword-intel   slide-renderer   coupang-connector   manychat-reply
     (원자#1)         (원자#2)          (원자#3)           (원자#4)
        │                                                     │
        └── 각 원자는 다른 원자를 직접 import 하지 않는다 ──────┘
            (계약 타입으로만 대화 → 독립 구축 후 조합 가능)
```

- 각 원자 사이에는 **사람 게이트**(상품 기획, 표현 검수, 광고 심의, opt-in)가 규제상 강제된다.
  완전 무인 연결은 blueprint-review 감사에서 불가로 확인됨 → `docs/ARCHITECTURE.md` §사람 게이트.

---

## 3. 개발

```bash
npm install                       # 워크스페이스 전체 설치 + @cak/* 로컬 링크
npm run typecheck                 # 전 패키지 타입체크
npm run test                      # 전 패키지 테스트

# 개별 원자 작업
npm run test    -w @cak/keyword-intel
npm run collect -w @cak/keyword-intel -- "루테인,밀크씨슬"
```

---

## 4. 문서

| 문서 | 내용 |
|---|---|
| [`docs/PROGRESS.md`](./docs/PROGRESS.md) | **진행 현황·운영 중인 자동화·다음 작업·다른 세션 결정(ADR)·함정 — 새 세션은 이걸 먼저** |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | 전체 아키텍처, 원자 경계, 계약 진화 규칙, 사람 게이트 |
| [`docs/SESSION-PROMPTS.md`](./docs/SESSION-PROMPTS.md) | 새 Claude 세션 시작 시 붙여넣을 프롬프트 모음 |
| [`docs/BACKLOG.md`](./docs/BACKLOG.md) | 착수 전 통합 후보 |
| [`CLAUDE.md`](./CLAUDE.md) | 새 세션이 자동 로드하는 프로젝트 규칙·금지선 |
| `packages/*/README.md` | 각 원자의 역할·유지조건·금지선 |
| `packages/keyword-intel/docs/` | 원자 #1 상세 (ARCHITECTURE/IMPLEMENTATION/LEGAL-BOUNDARY/QUESTION-MINING) |

## 5. 다음 액션

1. **Phase 3 (G3)** — 매일 쌓이는 리포트로 상위 키워드 사람 눈검증 + 쿠팡 실판매 대조 → 스코어 캘리브레이션
2. 확장(블로그·지식iN 축)은 **BudgetLedger 쿼터 그룹** 구현 후 (공유 쿼터 합산 clamp)
3. 다음 원자(#2~4) 착수는 keyword-intel이 G3 통과 후

> 상세·우선순위·함정은 [`docs/PROGRESS.md`](./docs/PROGRESS.md) 참조.
