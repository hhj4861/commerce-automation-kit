# Shopshorts native review 연결

- 목표/소유: JEV 세션, 추천 adapter의 backend opt-in을 research-v2/native-llm-v1에 연결. 기본 비활성, 계정/모델/원판정/사람 승인 유지.
- 기준: main c7ef3e2 (승인된 PR #148 머지). 기존 JEV 전용 clean worktree 재사용, feat/shopshorts-native-review.
- 범위: adapter, 통합 검증, 설정 예시/README. 서버 배포와 worker 배포는 별도이며 Pages 배포만으로 worker가 갱신되지 않음.
- 완료 기준: Codex/Claude 실제 HTTP 3단계와 동일 요청 재생, 검수 직전 계정 철회 차단, 잘못된 설정 무호출, 기본값 불변, 관련 회귀 통과, 본인 변경 커밋/push/PR.
- 현재: opt-in 연결. 관련 JS/HTTP/계정 테스트 76개 통과(기존 의존성 누락 해결 후 계정 테스트 16개 별도 실행). 외부 모델 유료 호출 0. 운영 서비스/worker/클라이언트 설정 변경 없음.
- 배포 점검: 운영 v1.1 컨테이너 healthy, 기존 데이터/설정/compose 경로 확인. Docker 허용 목록의 개별 줄 누락을 의심했으나 기존 CI BuildKit 로그에서 모듈 COPY와 runtime import 통과를 확인. 디렉터리 포함 규칙이 있어 실제 누락으로 확인되지 않았으며 불필요한 Docker 변경은 하지 않음.
- 서버 준비: c7ef3e2 새 이미지 빌드·import·TLS 검사 통과. 운영 교체는 자동 승인 검토가 정확한 교체 승인 미확인을 이유로 실행 전에 거절; 백업/교체/플래그 변경 미실행.
- 다음: 이 연결 PR 검토·명시적 머지 승인과 discovery 운영 컨테이너 교체 승인을 받은 뒤 worker 연결/실계정 E2E. 근거 docs/qa/20261005-shopshorts-native-review-rollout.md.
