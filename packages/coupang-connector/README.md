# @cak/coupang-connector — 원자 #3 (미착수)

**역할:** 쿠팡 Open API로 상품 등록·주문·정산을 자동화.

**상태:** 스캐폴드만. 착수 전.

## 유지 조건 (blueprint-review 재설계 문서 keep-modified)
- 🔧 **WING 승인 셀러 전제** (오픈API는 self-serve 아님: WING 승인 → Access/Secret Key → IP Allowlist)
- 🔧 건기식은 2026.4~ **품목제조신고서 이중 서류검증** 게이트 인정
- 🔧 **아이템위너**로 노출·판매가 통제권이 이전될 수 있음을 인정 (유니크 OEM SKU면 약화)
- 🔧 "즉각·무마찰 자동등록" 서사 삭제

## 절대 금지선
- ❌ 파트너스(제휴) 모드와 자체 OEM(셀러) 모드를 한 파이프라인에 혼용 (자기상품 수수료 불가로 양립 불가)
- ❌ 다이내믹 랜딩/DM에서 전자상거래법 §12/13/17 고지 누락 (§21 기만적 유인)

## 조합
- 계약: `@cak/contracts` 에 `CoupangListing` / `OrderRecord` 추가 예정
- 3PL 발주는 PIPA §26 처리위탁 + 건기식 이상사례 보고(위임 불가)라 **사람 게이트** 필요
