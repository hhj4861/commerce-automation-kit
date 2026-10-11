# 회차 문맥 기반 — F10 첫 연결 단위

- 담당: Codex. 사용자 지시: PR177 머지 후 계속. PR177은 9f9b3c0으로 feat/drama-regression-pilot에 머지됨. main 전환 아님.
- 기준: 9f9b3c0c00815564461fe8ec618ed9b602a98769, feat/drama-continuation 격리 worktree.
- 범위: opt-in 회차 연결 계약, previousCutOf 단일 접근, 연속성/판정 문맥/관문·대사 reviewContext 결합, join-check 앞 회차 파일 명시, 기존1화 golden 보존.
- 완료 기준: 앞 회차 누락·번호/시리즈/컷 오류 거부, 앞 대사·소품 변경 시 기존 판정 무효, CLI/순수함수 회귀, 기존89+runner22, 독립 Codex 리뷰·커밋·push·PR.
- 범위 한계: shot-v1/referenceMap/keyframe/출시 승인/next 아직 없음. F10 전체 완료 아님. 승인된 앞 회차 출력 바이트 결합까지 구현되기 전 연결 회차 plan/assemble은 명시 차단. 실제 제공자·Whisper·유료 호출 없음. legacy에는 새 선언을 강요하지 않음.
- 현재: 구현·통합 시험 통과, 독립 Codex 수정 재검토 PASS(두 기존 반례·정상 답변 독립 재현, 추가 S1/S2 없음). SQLite는 전 단위와 같고 상태 마이그레이션 없음.
- 검증(2026-10-11): Node 22.23.3, contracts/drama-series/runner 타입·문법 검사, drama-series 118/118(신규29), runner 22/22. runner에는 기존 1화 입력22개 SHA·validate/plan/예산 golden, SQLite 소비자 E2E 포함. drama-series에는 실제 ffmpeg 합성 클립 조립 회귀 포함. 실제 JEV/Whisper/유료 호출·사용자 승인 실행 없음; 새 응답·승인은 시험용 임시 fixture만 사용.
- 독립 리뷰: 1차 S2 두 건(내부 함수가 옛 판정을 새 문맥으로 기록, 새 요청/옛 응답 혼합)을 재현. 신규 반례2개가 수정 전 의도한 이유로 실패하는 것을 확인하고 요청 binding+문맥별 질문 ID+현재 질문 목록 검사를 추가. 수정 후 새29개와 전체140개 통과.
- 환경 복구: 전체 npm ci가 ENOSPC로 실패. 본 작업의 불완전한 node_modules만 삭제하고 contracts/drama-series/drama-runner로 설치 범위를 좁혀 복구. lockfile 변경 없음, 다른 세션 파일 정리 없음.
- 산출물: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261011-drama-continuation/`의 `drama-tests.log`, `runner-tests.log`. SQLite 시험 상태는 동기화 밖 로컬 test-runtime 사용.
- 전달: 검증된 변경을 feat/drama-continuation에 커밋·upstream push하고 feat/drama-regression-pilot 대상 PR로 전달한다. 새 PR 머지는 별도 명시 승인 필요. 후속 구현은 승인된 앞 회차 출시/프레임 결합과 shot-v1 계약 단위.
