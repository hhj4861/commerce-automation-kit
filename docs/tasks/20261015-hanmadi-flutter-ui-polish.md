# Hanmadi Flutter UI 다듬기

- 목표: 화면을 덮는 선택 메뉴 수정, 이전의 친근함을 살린 아기자기한 UI와 모든 메뉴의 글꼴·자간·행간·굵기·간격 통일.
- 소유: 현재 Codex 단독. workers/Claude OFF. base origin/main e0ffc6b, feat/hanmadi-flutter-ui-polish 별도 worktree.
- 디자인: lilac #6355b5, ink #343047, muted #716c83, paper #faf9fd, soft #efeafa, mint #e5f3ed. UI 본문 Gowun Dodum, 둥근 제목 Jua, 학습 원문은 기존 Noto 계열로 읽기 유지. 모든 자간 0, 본문 행간 1.55, 제목 1.3, 버튼 1.3. 상단 선택은 필드 옆 작은 팝업, 최대 280px/화면 38%, 스크롤과 Esc/바깥 닫기.
- 의도: 언어 연습 노트처럼 가볍게. 공통 말풍선 로고·둥근 제목만 개성을 주고, 불필요한 배경 장식·과한 애니메이션은 덜어낸다. 공통 카드·버튼·탭·선택 메뉴로 차이를 줄인다.
- 범위: Flutter 클라이언트·공통 테마·선택 메뉴·관련 테스트/E2E/QA. 서버 계약·인증·배포 설정 변경 없음.
- 완료: 320/390/1440px, 큰 글자·긴 선택지·언어/상황/번역/설정 메뉴와 닫기/선택, 기존 전체 E2E, 실제 캡처 확인 후 본인 커밋·push·PR. 새 PR 머지/운영 배포는 별도 승인.
- 현재: 공통 테마·폰트·작은 선택 메뉴 구현 완료. analyze, 16개 테스트, 웹 release 빌드, 실제 Next+Flutter 브라우저 E2E 통과. 검증 기록은 docs/qa/20261015-hanmadi-flutter-ui-polish.md. 작업 브랜치 커밋·push·PR 준비. main/운영 미반영, 새 PR 승인 후 머지 가능.
