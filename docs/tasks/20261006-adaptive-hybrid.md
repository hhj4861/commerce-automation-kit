# 자동 혼합 제작
- 목표: 장면 목적에 따라 Higgsfield 도입, 웹툰 사례, 3D 구조도, 맞춤 모션을 선택하고 CLI/웹 동일 계획으로 제작.
- 담당: Codex (feat/adaptive-hybrid-video / base 7e9d866). Claude 53241의 드라마 통합과 공용 메시지함으로 파일 소유 합의 대기. Claude hello-scope(20261006T123115) 수신: 1단계는 packages/drama-series 전용, apps/shopshorts 변경 없음. Codex가 아래 공통 변경 담당, 드라마 2단계는 별도 승인 이후 그 위에 통합.
- 완료 조건: 장면 계획·예산 상한·검토 무효화·재사용/실패 이어하기 검사, 실제 혼합 MP4와 브라우저 흐름 검증, 자체 커밋/push/PR. 운영 머지는 별도 승인.
- 설계: 기존 webtoon 데이터 동작을 재사용하되 비교/흐름은 전체 캔버스/초점 확대, 단면은 명시적 깊이와 3D 투영. 모델 제공 HTML/JS는 실행하지 않는다. 실사 시뮬레이션으로 주장하지 않는다.
- 다음: 독립 모듈 → 공통 파일 담당 합의 → 연결 → 무과금 재사용 파일 검증 → PR.

## Claude 53241 협업 계약
- 승인된 메일함: /Users/admin/workSpace/.agent-mailbox/drama-series/README.md. 원자적 쓰기, 수신 후 archive, 비밀값 금지. 기존 .git/peer-mailbox 모니터는 종료함.
- Codex productionStyle=hybrid는 기존 workflow=explainer-v1에 속함. Claude drama-series-v1과 합치지 않음.
- validateBrief는 기존 productionOptions 유지하며 hybrid 허용 확장. executeStudioTask는 기존 webtoon 준비 경로에 장면별 렌더 선택을 추가하고 capabilities.hybrid를 추가할 계획. 인증/LLM 실행 계약/드라마 화자/립싱크는 수정하지 않음.
- 겹치는 파일: lib/studio.js, studio-runner.mjs. 현재 Codex 담당. 공통 변경 범위/커밋을 메일로 공유하고 드라마 2단계 재개 전 통합 기준을 재확인. PR 생성 목표이며 머지 시점은 사용자 승인 이후, 임의 자동 머지 없음.

## 검증 결과
- Claude ACK 수신/보관: 20261006T124742-claude-ack-scope.md. studio-api.js 추가 범위까지 이견 없음. 드라마 2단계는 hybrid 머지 이후 사전 통지 합의.
- 자동/수동 UI 선택 및 API 저장, CLI 계획/승인/중단 체크포인트, 실제 워커 네 가지 장면 선택→TTS fixture→자막→MP4 검증 완료. 비용·재시도·검토 무효화 및 기존 제작 회귀 포함 고유 47검사 통과. 상세 docs/videos/20261006-hybrid-pilot/QA.md.
- 재사용 유리기판 영상 6분14초: Downloads/vedio/glass-substrate-hybrid-pilot.mp4. 실제 신규 데이터 렌더러와 별개의 기존 자산 조합 비교본임을 명시.
- 현재 로컬 구현·검증 완료, 다음 단계 본인 변경 커밋·push·PR. 실제 머지/운영 배포는 아직 승인되지 않음.
