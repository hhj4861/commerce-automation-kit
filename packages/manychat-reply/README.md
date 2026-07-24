# @cak/manychat-reply — 원자 #4 (미착수)

**역할:** 댓글 특정 키워드 감지 시 Manychat 공식 Private Reply로 정보(제휴/판매 링크)를 opt-in 응대.

**상태:** 스캐폴드만. 착수 전.

## 유지 조건 (blueprint-review 재설계 문서 keep-modified)
- ✅ 공식 comment→Private Reply 자체는 승인된 패턴
- 🔧 **댓글당 1회/7일 준수**, 24h 메시징 윈도우 준수
- 🔧 **opt-in 확보 수신자 문의응대로 한정**
- 🔧 DM 접점에도 **뒷광고 표시 + 전자상거래법 §13/17 고지** 삽입

## 절대 금지선 (원안이 위법이던 지점)
- ❌ 0.5초 이내 대량 자동 DM (Private Reply 한도·스팸 표준 위반)
- ❌ 팔로우 자동검증 게이팅 (Meta Spam 명시 금지, 'follows' 포함)
- ❌ opt-in 없는 광고성 DM (정보통신망법 §50, 과태료 3천만)

## 조합
- 계약: `@cak/contracts` 에 `ReplyEvent` / `OptInRecord` 추가 예정
- 링크 대상은 `@cak/coupang-connector` 가 만든 정품 링크만 (bait-and-switch 금지)
