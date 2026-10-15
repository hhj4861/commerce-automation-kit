# Hanmadi 공통 원문·작업 관리

- 목표: 관리자 화면→원문 버전 저장→정규화 작업→상태/실패/재개까지 실제 앱에 연결.
- 범위/담당: 현재 Codex 단독. C01/C03/C05/C06의 첫 기반. 새 수업 생성·외부 공급자 호출·원곡 추출·음정 채점은 포함하지 않음.
- 기준: origin/main e0ffc6b, feat/hanmadi-media-foundation, 격리 worktree hanmadi-media-foundation. workers/Claude OFF.
- 완료 기준: owner/origin 검사, 원문 이용 확인·보관/삭제, CAS·버전·요청 재전송·lease/중단 복구, 관리자 UI/실제 API/저장 E2E, 기존 회귀·lint·typecheck·build, 본인 파일 commit/push·PR.
- 구현: 기존 Redis v2Driver 재사용, 단일 원자적 aggregate(50원본/8버전/1MB), 유료 호출 없는 원문 정규화 작업. 원문은 자동 게시/학습에 넣지 않음.
- 현재: 관리자 메뉴·API·저장소 연결, 단위 289개 및 관리자 모드 네 언어 UI/API/저장 E2E 통과. 운영 API 경계·선택기 접근 이름·체크박스 배치를 보완함.
- 결과: 최종 네 언어 UI/API/저장 E2E·전체 타입·변경 lint·production build exit 0. 단위 289개 통과.
- 전달: 본인 변경 commit·명시 브랜치 push·PR. main 머지·운영 배포는 별도 승인.
- 증거: docs/qa/20261015-hanmadi-media-foundation.md, 지정 iCloud 20261015-media-foundation/. 외부 모델 호출 0, 실제 곡/학습/채점 E2E는 아님.
