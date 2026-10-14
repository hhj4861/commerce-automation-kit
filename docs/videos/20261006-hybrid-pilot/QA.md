# 자동 혼합 검증 — 2026-10-06

## 결과와 한계
- 기반 main: 7e9d866. feat/adaptive-hybrid-video에서 검증. 운영 서버 변경 없음.
- 신규 검증 9개: 장면 라우팅, 안전한 데이터/HTML, 시간에 따른 그림 변화, CLI·웹 계획 일치, 수정 시 자산/검토 무효화, 실견적/예산/재사용, 비동기 런타임 선검사, CLI 중단 체크포인트, 실제 워커 API 견적 저장, 실제 렌더 통합을 테스트 묶음으로 검증.
- 관련 회귀 묶음 46개 중 44 pass, 1 opt-in skip, 1 Node 런타임 설정 실패. 실패한 기존 HyperFrames 단일 검사를 Node22로 재실행하여 pass. 별도 opt-in 혼합 실제 렌더 pass. 이후 추가 API 검사 포함 신규 묶음 8 pass + 실렌더 1 별도 pass. 최종 고유 검사 47개 통과.
- 첫 회귀 실행의 native sqlite ABI 불일치는 Node20 앱으로 바로잡음. 두 번째 회귀의 기존 모션 테스트는 Node22 실행으로 해결. 앱 sqlite는 Node20, HyperFrames는 Node22라는 실행 환경 차이를 숨기지 않는다.
- 유료 제공자/음성은 모의 응답과 sine 음원으로 통합 검증했다. 이번 작업에서 새 Higgsfield/TTS 과금 호출 없음. 실제 렌더러/ffmpeg/자막/음원 혼합/최종 MP4 디코드와 재시도 자산 재사용을 실행했다. 새 실주제 생성의 편집 품질·실제 구독 호출 품질까지 입증한 테스트는 아니다.

## 명령
`TMPDIR=/private/tmp/cak-hybrid-1006`은 iCloud 작업 폴더 tmp를 가리키는 테스트 한정 짧은 IPC 경로다. 실제 산출물은 iCloud에 저장했다.

- Node20 `--test apps/shopshorts/test/{studio,studio-automatic,cinematic-production,visual-direction,webtoon-hybrid,adaptive-hybrid}.test.mjs`
- Node22 `--test --test-name-pattern='automatic summary renders real landscape' apps/shopshorts/test/visual-direction.test.mjs`
- Node20 `--test apps/shopshorts/test/adaptive-hybrid.test.mjs`, `HYBRID_RENDER_E2E=1`, `SHOPSHORTS_MOTION_NODE=/Users/admin/.nvm/versions/node/v22.23.3/bin/node`로 실제 혼합 MP4 렌더
- 최종 신규 단위/API·CLI 재실행: 8 pass, opt-in 1 skip (위 실렌더 증거 유지)
- `git diff --check`, 변경 JS/MJS 구문 검사

## 브라우저
격리 로컬 포트 5488 / test/hybrid-browser.mjs. 실제 public UI+studioApi에 메모리 저장소/로컬 인증 fixture를 연결했다. 실계정·운영 스토리지는 사용하지 않았다.
- 수동 신규 제작에서 자동 혼합 선택 → 프로젝트 생성 → API의 brief.productionStyle=hybrid, workflow=explainer-v1, Kyle/max54 저장 확인.
- 3단계에서 Higgsfield6초/웹툰4초/3D4초/모션4초, 추가 영상1/원화최대2/상한60 표시 확인.
- 자동 제작에서 기본 웹툰 선택 유지, 자동 혼합 라디오 선택 가능, 대본 검수 화면에도 동일 계획/예산 표시 확인.
- 유료 생성 버튼은 누르지 않았다. 워커 전체 흐름은 위 opt-in 통합 검사로 검증.
- 브라우저 캡처의 iCloud 저장은 CUA 파일 권한으로 실패했다. 화면 AX 결과는 확인했으나 저장된 UI 스크린샷이 있다고 주장하지 않는다.

## 영상 파일
- 완성 연출 비교본: `/Users/admin/Downloads/vedio/glass-substrate-hybrid-pilot.mp4`, 1920×1080, 24fps, H264/AAC, 373.938초.
- 원본과 음성 패킷 SHA256 동일: a66d795cfe174bd06a34c3d98e27f434eaf6832a0ce382dbc0935c90be49ca46. 전체 디코드 pass.
- 작업 폴더: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261006-adaptive-hybrid/`
- `pilot-verification.json`, `hybrid-worker-e2e.mp4`, `hybrid-worker-frame.jpg`. 실제 혼합 워커 1080×1920 MP4, 오디오 스트림/한글 폰트/자막 표시 확인. fixture 구조도이므로 사용자용 완성 콘텐츠와 구분한다.

## Claude 협업
메일함 drama-series 규칙 준수. 20261006T124742-claude-ack-scope.md에서 공통 Shopshorts 파일 Codex 담당에 이견 없음 확인. Claude는 packages/drama-series, 신규 contracts, skill/doc만 구현. drama 2단계는 hybrid PR 머지 이후 사전 조율. 메시지는 머지/배포 승인이 아니다.
