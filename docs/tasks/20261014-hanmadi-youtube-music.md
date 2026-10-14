# Hanmadi 음악 영상 수집 — 2026-10-14

- 목표: 관리자에서 YouTube 영상 검색/주소 등록 → 수집함 → 공식 자막 또는 제공받은 파일 → 기존 음악 학습 검수/게시.
- 담당: 현재 Codex, feat/hanmadi-youtube-music-collection. 별도 구현 worktree 사용.
- 범위: apps/hanmadi 음악 관리자·공식 YouTube 어댑터·수집 저장소·테스트·사용 문서.
- 기준: cb28f2e8326df102f4ce444c6d8779c31d9a6a89
- 완료 기준: 영상만 수집 가능, 중복 방지, 권한 없는 자막 실패 보존, 원문 검증, 기존 게시 게이트 유지, 단위/타입/린트/빌드/브라우저 검증 및 작업 브랜치 push.
- 제약: 공개 YouTube 자막의 임의 다운로드/API 우회/MP3 추출 없음. 공식 captions API는 영상 수정 권한 OAuth 필요.
- 상태: 구현·로컬 검증 완료. 작업 브랜치 커밋/푸시·PR 준비. 운영 변경·새 PR 머지 승인 없음.
- 구현: 음악 전용 공식 검색/페이지, 주소 수집, 서버 메타데이터 확인, 영상+언어 중복 방지, 수집함 영속화, 공식 플레이어, 채널 OAuth 자막 목록/가져오기, 파일 보관, 기존 학습 원문 등록으로 연결. 게시된 자료 자동 변경 없음.
- 검증: 전체 단위 275/275, 전체 타입/린트, Next 배포 빌드 통과. 신규 브라우저 E2E는 검색/주소/원곡 플레이어/권한 403/자막 보존/파일 수정/원문 등록/삭제 격리 및 320·390·1024px 통과(pageerror 0). 기존 owned-music E2E도 통과(생성 1, 평가 2; JEV 실패 재시도 및 게시/학습/저장/복습).
- 검증 한계: YouTube HTTP·신규 플레이어는 fixture. 실제 영상 수정 권한 OAuth로 자막 다운로드한 증거 없음. 기존 음악 E2E의 원곡 오디오는 로컬 실제 파일, AI/JEV는 HTTP fixture. 운영 자격·환경·데이터·배포 변경 없음.
- 실패/재작업: 전용 Chromium 부재 → 설치된 Chrome 사용. E2E textarea의 exact label 선택자 실패 → 기존 테스트와 동일한 안정적인 label 선택 방식 사용. 수집 목록의 미연결 자막 입력란은 접어 긴 빈 폼 반복을 줄임.
- 산출물: iCloud gpt 작업/commerce-automation-kit/20261014-youtube-music-collection/{checks,e2e-final,owned-regression}/. 초기 실패 e2e-1/2도 보존.
- 자동 생성 apps/hanmadi/AGENTS.md·CLAUDE.md는 이 작업의 Next 실행 전에는 없었고, 사용자 지침에 따라 Git 변경에 넣지 않음.
- 다음: PR CI 확인. 머지·운영 배포는 해당 PR에 대한 명시 승인 후. 자막 자동 가져오기는 전용 OAuth 채널 설정 후 실제 권한 영상으로 확인.
