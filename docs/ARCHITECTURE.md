# ARCHITECTURE — commerce-automation-kit (전체)

**작성일:** 2026-07-23

> 개별 원자의 내부 아키텍처는 각 패키지의 문서에 있다 (예: `packages/keyword-intel/docs/ARCHITECTURE.md`).
> 이 문서는 **모노레포 전체**의 조합 원리·경계·규칙만 다룬다.

---

## 1. 왜 모노레포인가

- 원자들이 **같은 계약**(`@cak/contracts`)을 공유해야 조합된다 → 한 저장소에서 계약을 단일 진실로 관리.
- 각 원자는 독립 빌드·테스트·배포 가능(workspace) → "독립 구축 후 조합" 전략을 구조가 강제.
- 원자 하나가 위법/불가로 판명돼도 나머지에 영향 없이 제거 가능(느슨한 결합).

**과잉설계 회피:** 각 원자 내부는 4레이어 MSA가 아니라 모놀리식(+큐/크론). 모노레포는 코드 조직일 뿐,
런타임 분산이 아니다. (blueprint-review 감사: 1인 규모에 MSA는 과잉설계)

---

## 2. 의존 규칙 (강제)

```
packages/contracts        → 아무 것도 의존하지 않음 (순수 타입)
packages/<원자>           → @cak/contracts 만 의존
packages/<원자A>          ↛ packages/<원자B>   (원자끼리 직접 의존 금지)
```

- 원자 간 데이터는 **계약 객체**로만 흐른다. A가 B의 내부를 import 하면 조합 독립성이 깨진다.
- 계약은 **append-only**. 필드 삭제/의미 변경은 breaking change → 새 필드로 진화.

---

## 3. 사람 게이트 (자동화 불가 — 규제상 강제)

원자들을 완전 무인으로 잇는 것은 blueprint-review 감사에서 불가로 확인됐다.
원자 사이에는 아래 게이트가 반드시 사람 손을 거친다.

| 위치 | 게이트 | 근거 |
|---|---|---|
| keyword-intel → 이후 | 상품 기획 판단 (낙수 트리거 아님, 참고 지표) | 낙수 반증 |
| slide-renderer 전 | 입력 소스가 자체촬영/라이선스인지 확인 | 저작권법 §136 |
| 게시 전 | 건기식 표현 검수 + 광고 자율심의(제10조) | 식품표시광고법 §8·10 |
| manychat-reply | opt-in 확인 | 정보통신망법 §50 |
| coupang-connector → 3PL | PIPA §26 위탁 + 이상사례 보고(위임 불가) | PIPA, 건기식법 |

> 설계 원칙: '무인화'가 아니라 **'저관여 + 사람 감시'**. 게이트를 우회하는 코드는 작성하지 않는다.

---

## 4. 절대 금지선 (모든 원자 공통)

blueprint-review DO-NOT-BUILD의 원인들. 어느 원자에도 재유입 금지:

1. ❌ 스크래핑/크롤링으로 타인 콘텐츠 다운로드·재사용 (저작권법 §136 비친고죄)
2. ❌ 플랫폼 API 우회 / 에뮬레이터 / 비공식 클라이언트 (ToS 위반, 계정 밴)
3. ❌ 무검수 광고 대량 생성 (식품표시광고법 §8)
4. ❌ 브랜드A 콘텐츠로 내 제품B 판매하는 bait-and-switch (부정경쟁방지법)
5. ❌ 홈쇼핑 낙수를 자동 제조/매수 트리거로 사용 (자체 데이터로 반증)
6. ❌ 데이터 원본 재판매 (약관 확인 전까지 보수적 금지)

각 원자 README와 `LEGAL-BOUNDARY` 에 원자별 금지선이 구체화되어 있다.

---

## 5. 기술 스택 (공통)

| 요소 | 선택 |
|---|---|
| 언어/런타임 | TypeScript + Node 20 |
| 모노레포 | npm workspaces (`packages/*`) |
| 공통 tsconfig | `tsconfig.base.json` (각 패키지가 extends) |
| 계약 참조 | `@cak/contracts` (exports가 src를 직접 가리켜 빌드 없이 tsx/vitest 동작) |
| 테스트 | vitest (원자별) |

---

## 6. 계약 진화 로드맵

| 계약 타입 | 소유 관계 | 상태 |
|---|---|---|
| `KeywordSignal`, `IntelBatch` | keyword-intel 출력 | 🟢 존재 |
| `RenderJob` | slide-renderer 입력 | ⚪ 원자 #2 착수 시 |
| `CoupangListing`, `OrderRecord` | coupang-connector | ⚪ 원자 #3 착수 시 |
| `ReplyEvent`, `OptInRecord` | manychat-reply | ⚪ 원자 #4 착수 시 |
| `AdConcept`, `AdVideoJob` | ad-video-gen 입출력 (생성 호출은 외부 오케스트레이터=MCP) | 🟢 존재 (2026-07-24) |
| `ShowcaseEntry`, `ShowcaseSiteConfig`, `ShowcaseDeployReport` | showcase-site ↔ 사이트 앱(apps/firstframe) | 🟢 존재 (2026-07-24) |
