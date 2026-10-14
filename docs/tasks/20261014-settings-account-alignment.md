# 설정 계정 행 통일 및 Kandinsky 팝업

- 요청: AI/Google/Kandinsky 크기·버튼·글자 간격·위치 정렬 통일. 추가 요청대로 Kandinsky 연결 관리는 팝업.
- 범위: Codex 단독, 계정 설정 표시와 기존 토큰 관리 UI만. 인증/저장 API 변경 없음.
- 기준: main 8665b0c. fix/settings-account-alignment 별도 worktree.
- 디자인: 기존 서체·색 유지. 세 행은 제목 14px/22px, 설명 13px/22px, 최소 높이 96px. 관리 버튼은 모두 104×42px, 글자 13px/20px·600·자간 0, 오른쪽 같은 열.
- Kandinsky 기본 화면: 제목+저장 상태+계정 안내 한 줄+연결 관리 버튼. 토큰 관리·상세 저장 상태·삭제·안내는 native dialog로 이동. 닫기/Escape 시 입력값 제거, 저장 중 닫기 차단, 닫은 뒤 관리 버튼으로 포커스 복귀.
- 완료 기준: 기존 저장 관리 브라우저 흐름과 팝업 키보드 동작, 데스크톱/모바일 버튼 치수·정렬 검증, 커밋·push·PR 준비. 운영 미반영.

## 검증 결과
- Node 관련 회귀 39/39 통과.
- 실제 Chrome 격리 브라우저: 저장/중복 제출/교체/취소/삭제/조회 실패/불확실한 응답/자동 새로고침 입력 보존 통과. 운영 토큰·설정 변경 없음.
- 1440px/390px에서 세 관리 버튼 모두 104×42px, 같은 오른쪽 좌표, 13px·20px·600·자간0, 행 상하18px 실측 통과. 화면/팝업 캡처 시각 확인.
- native dialog close 이벤트는 비동기라 최초 시험의 즉시 입력값 검사가 너무 빨랐음. close 처리 완료를 기다린 뒤 입력값 제거·관리 버튼 포커스 복귀 확인. 첫/마지막 행의 기존 padding CSS와 충돌은 우선순위를 바로잡아 해결.
- 산출물: iCloud 공용 작업 루트 shopshorts/settings-alignment-20261014. 실제 계정 자료가 아닌 합성 시험 데이터만 포함.
- 현재: 검증 완료, 작업 브랜치 commit/push 및 PR 준비. 머지·운영 배포는 사용자 승인 후.

## 승인 후 운영 배포 — 2026-10-15 KST
- 사용자 명시 승인으로 소스 PR253과 배포 PR255 머지 완료. 배포 커밋 `04ee2c140c4ae667730b0188482b333df76f7ee3`의 tree는 검증한 release commit `cc86e86`과 동일.
- 자동 배포 run38647463798은 credential broker HTTP429로 실패. 기존 Wrangler 로그인으로 같은 커밋을 직접 Pages production에 배포.
- Cloudflare 공식 API에서 canonical production deployment `224b54de-a60f-4bf7-943a-781d6e27a4e2`, success 및 위 commit 일치 확인. URL https://shopshorts-dash.pages.dev/settings (고정 배포 https://224b54de.shopshorts-dash.pages.dev).
- 실제 운영 브라우저에서 동일 크기 계정 행과 Kandinsky 연결 관리 팝업 열기 확인. 실제 토큰 변경 없음.
- 운영 계정 조회는 미검증: 로그인/계정 API가 JSON 대신 HTML을 반환. 직전 정상 UI 배포 fb93e7ce에서도 같은 응답. credential broker는 HTTP429 / error1027을 반환하며 공식 문서상 Workers 무료 일일 요청 한도 초과다. UI 배포 성공과 서버 계정 조회 정상화는 구분한다.
- 공식 근거: https://developers.cloudflare.com/workers/observability/errors/ 및 https://developers.cloudflare.com/workers/platform/limits/ (일일 한도 UTC 00:00, KST 09:00 초기화).
