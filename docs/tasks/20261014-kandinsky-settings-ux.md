# Kandinsky 설정 UX 개선

- 목표: 저장 여부를 즉시 이해하고, 불필요한 토큰 재입력 없이 생성으로 이동한다.
- 작성자/범위: 현재 Codex 단독, HF 설정 컴포넌트와 설정 페이지 레이아웃. 서버 저장·인증 계약 변경 없음.
- 기준: main cb28f2e, 별도 fix/kandinsky-settings-ux worktree.
- 실제 운영 화면 확인: 사용자 브라우저 /settings에서 저장 계정 표시와 입력란·저장/삭제/재확인 버튼이 동시에 나타남을 확인. 사용자 토큰 조회·수정하지 않음.
- 디자인: 기존 Noto Sans KR / DM Sans 유지. 흰색 #fff, 바탕 #f7f7f4, 본문 #242622, 보조 #62685e, 저장 완료 #277e64/#e7f4ee. 왼쪽 섹션 설명과 오른쪽 컨트롤, 모바일 단일 열. 저장 완료 안내를 핵심으로, 계정 연결·화면 설정·서버 상태 분리.
- 동작: 저장됨/없음/확인 불가를 구분. 저장 완료 시 입력 숨김, 명시 교체/취소, 삭제 확인. 저장·삭제 실패 시 읽기 조회로 실제 상태 조정, 쓰기 자동 재시도 없음. 자동 새로고침은 설정 DOM을 교체하지 않음.
- 완료 기준: 상태 전이·오류·중복 제출·새로고침 입력 보존, 데스크톱/모바일 브라우저 검증, 커밋·push·PR 준비.
- 검증: Kandinsky/계정/알림 관련 Node 시험 39/39 통과. 격리 Chrome에서 등록·진행 중 중복 제출·재조회·자동 갱신 입력 보존·교체 취소/실패·조회 불가·삭제 확인·390px 모바일·콘솔 오류 검증. 실제 사용자 토큰 및 운영 설정 변경 없음.
- 시각 검토: 1440px 데스크톱과 390px 모바일 캡처 확인, 수평 넘침 없음. 산출물은 iCloud 작업 루트의 shopshorts/settings-ux-20261014.
- 시험 환경 보정: 설치 Playwright가 요구한 Chromium 1208 부재로 기존 Google Chrome을 별도 임시 프로필로 사용. Shadow DOM 호스트 innerText가 비어 있어 내부 description 요소로 검사 대상을 수정.
- 현재: 사용자 승인 후 PR247/248 머지와 운영 배포 완료.


## 승인 후 운영 반영
- PR247 main 머지: `16bbaf39807bf76341eb0b21fd404533db603545`.
- PR248 deploy/shopshorts 머지: `b876901fd757f58b9d5002be18e19afe6c0dec13`. 두 PR 필수 CI 성공, 배포용 통합 시험 39/39. 최종 public 파일은 UI 브라우저 검증본과 동일.
- 자동 배포 [38575349107](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38575349107)는 기존 Cloudflare credential request 503으로 실패. 자동 배포 자격증명 문제는 미해결이며 자동 배포 성공으로 기록하지 않는다.
- 동일 승인 SHA를 기존 Wrangler OAuth로 직접 Pages 배포. 배포 ID `fb93e7ce-d865-4284-8a3a-68320b91e27a`, [배포 URL](https://fb93e7ce.shopshorts-dash.pages.dev). 공식 Cloudflare API에서 production/success와 commit SHA 일치 확인.
- [운영 설정](https://shopshorts-dash.pages.dev/settings)을 실제 로그인 브라우저에서 새로고침해 저장 완료/기존 계정/마지막 저장 시각/입력란 숨김을 확인. 토큰 교체 패널 열기→취소 후 저장 상태 유지 확인. 실제 토큰 값 입력·조회·변경·삭제 및 영상 생성 없음.
- 임시 의존성 symlink는 배포 후 제거. 로컬 제작 워커 및 credential broker는 이번 배포에서 변경하지 않음.
