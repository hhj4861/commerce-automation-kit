# 조사 근거 보류 안내

- 목표/소유: JEV 세션. 실계정 E2E의 근거 미확인 보류를 일반 서비스 오류와 구분해 안내한다.
- 기준: 승인·머지된 #151 aeeec757, fix/shopshorts-discovery-hold-reason.
- 근거: 2026-10-06 운영 요청 2e7acbc1-58e0-4cbd-8f85-c4cd88cce72e. discovery-v2.6, held/unsubstantiated_research_entity, 생성 claim 1·검색 1·JEV 0. 화면에는 일반 공통 검증 실패 안내가 표시됨.
- 범위: adapter 사유 매핑, 고정 사용자 메시지, HTTP 200 held 응답 회귀. 판단 기준·생성 프롬프트·모델·권한·자동 재시도는 변경하지 않는다.
- 완료 기준: Codex/Claude 동일 안내, 추가 생성/재시도 없음, 기존 오류 분류 유지, 관련 테스트, 본인 변경 commit/push/PR. 머지는 별도 사용자 승인.
- 현재: 관련 회귀 29개 통과(HTTP 서버 실제, 모델 대역), diff 검사 통과. 실제 UI 안내 변경은 운영 미반영이며 PR 승인 후 worker 갱신이 필요하다.
- 운영 E2E: 후속 에펠탑 요청 bb3f94c4-c982-452e-a805-e84c23a826bc도 no_grounded_candidates로 보류. 생성 claim 2·검색 2·JEV 0. 두 사례로 JEV 의미 품질이나 정상 추천 성공을 입증하지 못했으며 검색 근거 범위 개선이 후속 과제다.
