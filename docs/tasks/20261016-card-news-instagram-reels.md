# 카드뉴스 Instagram Reels 자동 발행

- 목표: 검증된 일일 카드뉴스 산출물 → 9:16 MP4 → 선택한 Instagram 계정에 자동 게시.
- 담당: 현재 Codex 세션 단독, 브랜치 `feat/card-news-instagram-reels`.
- 기준: main `02349c719a0b3f5c0708987ea2de130fe194396d`.
- 범위: 기존 슬라이드 재사용, shorts-publish CLI 재사용, 별도 워크플로/원장, 중앙 OIDC 인증. 텔레그램 코드 변경 없음.
- 완료 기준: 렌더 스모크·관련 단위/보안 테스트·타입 검사·브랜치 push·PR. 운영 머지는 해당 PR 명시 승인 후.
- 계정: 사용자 답변 대기. 과거 `commerce_account` → `@ttangkong_pom` 기록은 현재 연결 검증이 아님.
- 현재: 별도 workflow·원장·계정 ID 고정·공개 URL 확인·알림 구현 완료. 로컬 MP4 검증 완료. 운영 미적용.
- 검증: Python 3.12/해시 고정 의존성 카드뉴스+릴스 63개 통과; shorts-publish 44개/타입 검사 통과; broker 전체 81개 통과; workflow YAML/신뢰 경계 구조 및 diff 검사 통과.
- 실제 산출물: 텔레그램 main 성공 실행 `38844598258`을 읽어 7슬라이드·132.333초·1080×1920 H.264/AAC(48kHz stereo)·1,645,538 bytes MP4 생성. 본문 프레임 육안 확인(잘림 없음).
- 산출물 위치: 전역 iCloud `gpt 작업/commerce-automation-kit/card-news-instagram-reels-20261016/preview/reel.mp4`(운영 공개 게시물 아님)。
- 재작업: 시스템 Python 3.14에는 feedparser가 없어 통합 검사 실패 → 시스템을 수정하지 않고 iCloud 안의 독립 Python 3.12 + 해시 고정 의존성으로 재검증해 63개 통과.
- 미확인: 현재 Upload-Post 연결/잔여 업로드 할당량, 게시 대상 계정 선택, 운영 broker 배포 및 실제 Instagram 게시. 브라우저 연결이 없어 연결 화면은 조회하지 못함.
- 다음: 작업 브랜치 commit/push·PR 후 사용자 계정 선택/PR 머지 승인. 승인 후 broker 정책 배포 → render 모드 첫 원격 검증 → 계정 ID 고정 → 첫 공개 게시와 자동화 활성화.
