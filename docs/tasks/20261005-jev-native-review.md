# 저신뢰 JEV의 선택 계정 언어모델 재검토

- 소유/범위: 기존 JEV 세션, PR #148의 9c824bc 이후. 별도 새 계정/키/운영 배포/머지 없음.
- 목표: 정상 제안 보류를 줄이되 JEV 확정 거절·확신 있는 근거 부족·오류를 우회하지 않는다.
- 계약: research-v2 요청에 reviewMode=native-llm-v1을 명시한 경우만 v2.4로 고정. 기본 v2.2 유지. 저신뢰 보류만 세 번째 review action, 선택된 동일 runtime 사용, 배치당 최대 1회. 원문·관측 출처·원 JEV checks 보존.
- 채택: JEV의 저신뢰 pass/not_applicable에 한해 LLM 전 항목 검토+유효 인용 후 통과 가능. JEV uncertain/reject는 원칙적으로 통과 불가. 예외는 콘텐츠 expectedAnswer의 저신뢰 reject를 전체 비사실적 예상(not_applicable/nonfactual, 빈 인용)으로 확인한 경우뿐이며 사업 대안·내포된 사실·고신뢰 거절은 제외한다. 근거 없는 수익 보장·확정 모순은 거절. 오류는 보류. 사람 승인 유지.
- 검증: 적대적 파서/상태/중복/만료/계정 철회, 실제 JS·Python HTTP 경로, 고정 자료의 구독 모델 검토 및 최종 서버 판정. 모델 실행/과금·구독 비용 미확인을 구분.
- 현재: 구현/84개 로컬 검증/실제 JEV 8회+구독 검수 12회 완료. 고정 8건 중 기대 일치 6건, 새 차단 대조군 2건 통과. 품질 완료 기준은 미통과이며 운영 미적용. 증거: docs/qa/20261005-jev-native-review.md 및 JSON.
- 다음: JEV expectedAnswer 역할 구분과 entity 보류를 새 고정 세트로 검증. Draft PR 유지, 머지·배포 없음.
