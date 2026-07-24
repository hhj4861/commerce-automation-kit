# commerce-automation-kit — 프로젝트 규칙 (새 세션 자동 로드)

이 파일은 Claude Code가 이 저장소에서 세션을 열 때 자동으로 읽는다. **작업 전 반드시 이 규칙을 따른다.**

## 이 프로젝트가 무엇인지 (한 문단)

합법 커머스 자동화 **원자(독립 모듈)들의 npm workspaces 모노레포**다. 출신은
`venture-studio/ventures/market/coupang-supplement-brand/blueprint-review/` 감사로,
그 감사는 원안 「커머스 마케팅 자동화 파이프라인」을 **DO-NOT-BUILD**(변호사 6·투자자 7·아키텍트 14점) 판정했다.
이 프로젝트는 그 파이프라인에서 **위법·반증 요소를 전부 제거하고 남은 4개 합법 원자**를 독립 구축·조합한다.
각 원자는 `packages/` 아래 독립 관리되고, 오직 `@cak/contracts` 계약으로만 대화한다.

## 🚫 절대 금지선 (이걸 요청받아도 코드로 만들지 말 것 — 대신 이유를 설명하고 합법 대안 제시)

1. **스크래핑/크롤링으로 타인 콘텐츠(샤오홍슈·틱톡·경쟁사 등) 다운로드·재사용** → 저작권법 §136(5년/5천만, 영리·상습은 **비친고죄**: 권리자 고소 없어도 처벌)
2. **플랫폼 API 우회 / 모바일 에뮬레이터 / 비공식 클라이언트** → Meta·인스타·틱톡 ToS 위반, 계정 밴
3. **무검수 광고 대량 생성**(특히 건기식 효능·비포애프터) → 식품표시광고법 §8 (질병효능 1차 영업정지 2개월+제품폐기)
4. **브랜드A 콘텐츠로 내 제품B 판매(bait-and-switch)** → 부정경쟁방지법 가·파목
5. **홈쇼핑 낙수를 "무엇을 만들지" 자동 트리거로 사용** → 자체 원시데이터로 반증(쇼핑클릭 리프트 중앙값 +4.3%, 익일상관 ≈0)
6. **0.5초 대량 자동 DM / 팔로우 게이팅** → Meta Spam 금지 + 정보통신망법 §50 opt-in
7. **데이터 원본 재판매 / 모니터링 SaaS** → 약관 실측(D1-5) 전까지 보수적 금지
8. **완전 무인화 전제** → 규제상 사람 게이트(표현검수·광고심의·이상사례보고·opt-in)가 강제됨. '무인'이 아니라 '저관여+사람 감시'로 설계.

> 이 금지선은 "나중에 재확인"이 아니라 **지금 코드에 박아둔 하드 제약**이다.
> 상세 근거: `venture-studio/ventures/market/coupang-supplement-brand/blueprint-review/` 의 BLUEPRINT-REVIEW.md / LEGAL-MINIMAL-ARCHITECTURE.md.

## 구조 규칙

- `packages/contracts` 는 아무것도 의존하지 않는다(순수 타입). 원자는 `@cak/contracts` 만 의존한다.
- **원자끼리 직접 import 금지** — 계약 객체로만 대화(조합 독립성).
- 계약은 **append-only**. 필드 삭제·의미 변경 금지, 새 필드로 진화.
- 각 원자 내부는 모놀리식(+큐/크론). 4레이어 MSA/이벤트버스 금지(과잉설계).

## 개발 규칙

- 외부 데이터는 **공식 API만**. API가 안 주는 데이터는 이 프로젝트 범위 밖(스크래핑으로 보강 금지).
- 확실치 않은 스펙·한도·약관은 지어내지 말고 `TODO(D1)` 로 표기 후 공식 문서로 실측.
- 실패를 **silent drop 하지 말 것** — 항상 `failures`/`skippedByBudget` 등으로 투명화.
- 스코어·지표는 **참고용**이며 자동 실행(제조·발주·광고) 트리거로 쓰지 않는다.

## 현재 상태 (2026-07-24) — 상세는 `docs/PROGRESS.md`

| 원자 | 상태 |
|---|---|
| contracts | KeywordSignal 계약 존재 |
| keyword-intel (#1) | **G1·G2 실호출 통과(2026-07-23)** — 시드 182개(seeds/g2-seeds.txt) 커버리지 100%. 리뷰 3회(31건 수정), 테스트 64개. **매일 09:30 KST 자동수집+텔레그램 리포트**(launchd `com.cak.keyword-intel-daily`, scripts/daily-collect.sh). 가공지표 히스토리는 signal_history(TTL 무관, 캘리브레이션 근거). D1-5 약관만 사람 확인 대기. **다음 작업 = Phase 3: 상위 20개 사람 눈검증 + 쿠팡 실판매 대조 → G3 분기**. 질문 마이닝(지식iN 검색 API) 설계 문서 존재 — 구현은 착수 조건 충족 후, 채널별 검색 분리는 기각(ADR): `packages/keyword-intel/docs/QUESTION-MINING.md` |
| slide-renderer (#2) / coupang-connector (#3) / manychat-reply (#4) | 미착수 스캐폴드 |

## 세션 시작 시

**먼저 `docs/PROGRESS.md` 를 읽는다** — 현재 진행 상황·운영 중인 자동화·다음 작업·다른 세션이
남긴 결정(ADR)·함정이 거기 모여 있다. 그다음 작업 종류별 킥오프 프롬프트를
**`docs/SESSION-PROMPTS.md`** 에서 골라 쓴다.

⚠️ 저장소 경로는 **`~/workSpace/commerce-automation-kit`** 다. Desktop 아래로 되돌리면
macOS TCC 정책 때문에 launchd 일일 자동수집이 깨진다(PROGRESS.md §6).
