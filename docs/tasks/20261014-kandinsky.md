# Kandinsky 영상 생성 메뉴

## 작업 카드
- 목표: Shopshorts의 독립 메뉴에서 공식 Kandinsky 무료 데모로 텍스트/이미지→5초 영상+소리를 생성하고 다운로드.
- 담당: 이 Codex 세션 단독. worker/Claude flags 모두 OFF.
- 기준: origin/main 62758a8, feat/shopshorts-kandinsky. 기존 local-cinema PR229와 독립.
- 완료 조건: 데스크톱/모바일 메뉴, 입력 검증, 공식 API 전송/결과 표시/MP4 다운로드, 무료 한도 오류와 불확실한 접수 복구, 관련 회귀, 커밋·push·PR. 운영 배포/머지는 제외.
- 현재: 구현·로컬 검증 완료. 실제 외부 생성은 인증서 오류로 미검증. 커밋·push 후 PR 준비.

## 공식 계약과 범위
- Space: https://huggingface.co/spaces/kandinskylab/Kandinsky-6.0-Pro-distill-5s
- 공개 소스 SHA f000588e4b8494559f228d879aad5840a0a6834c 의 app.py 및 k6_ui.py 확인(2026-10-14).
- Gradio /generate: prompt, use_beautifier, seed, image → video, expanded prompt, stats HTML, timings. HTML/timings는 표시하지 않음.
- 텍스트: 864×480, 121 frames@24fps. 이미지: 입력 비율에 따라 크기 결정. FullHD 업스케일 별도 Space이므로 이번 메뉴에서 약속하지 않음.
- https://huggingface.co/docs/hub/spaces-api-endpoints 의 공식 POST call / GET SSE, upload FileData 계약 사용. 전송 직전 /info 입력 이름과 출력 개수 확인.
- https://huggingface.co/docs/hub/spaces-zerogpu: 무료 계정 GPU 5분/일, 익명 2분. 영상 길이가 아니며 GPU 크기에 따라 차감량 상이. 이 Space 기본 GPU duration=200이라 익명 120초 한도로는 생성이 거부될 수 있음.
- HF 공식 SDK who-am-i.ts의 type/isPro/canPay/orgs를 검사. 무료 여부를 확인할 수 없거나 결제 가능한 계정은 차단. 유료 fallback 없음. 무료 한도 보장을 위해 PRO 토큰을 지원하지 않음.

## 동작과 저장
- 정적 페이지 /kandinsky, 공식 HF 서버로 브라우저가 직접 통신. 별도 모델/로컬 워커/API 키 서버 설정 불필요. 기존 Shopshorts 페이지 접근 인증 유지.
- 사용자 읽기 토큰은 password input과 요청 객체 메모리만 사용. 서버·sessionStorage·로그에 저장하지 않음. 기존 HF 환경변수나 다른 계정 키도 읽지 않음.
- 이 탭의 sessionStorage에는 접수 상태/번호/결과 URL/결과 설명만 저장. 토큰·입력 이미지 저장 없음. 브라우저 탭 종료 후 기록 유지/다른 기기 동기화는 제공하지 않음.
- 전송 전 uncertain receipt 저장. 접수 응답 유실 시 재전송하지 않음. 접수 번호 있으면 GET 결과 확인만 수동 재개. 대기 중단은 원격 작업 취소가 아님.
- 결과 URL은 해당 Space의 /gradio_api/file= 만 허용. HTML 출력은 버림, 텍스트는 textContent. 다운로드 최대60MB, MP4 signature 검사.
- 생성은 사용자 버튼으로만 실행. 자동 광고 게시·기존 제작 승인 게이트 변경 없음.

## 디자인
기존 Shopshorts canvas #f7f7f4 / white #ffffff / ink #242622 / mint #277e64 / line #e5e6df를 재사용한다. DM Sans/Noto Sans KR, 제목 26~36px, 본문14px. 좌측 좁은 입력, 우측 넓은 실제 영상 프레임. 빈 상태에는 장식 이미지 대신 영상 프레임 도형과 구체적인 입력 안내를 쓴다. 기존 앱과 다른 테마보다 작업 도구의 일관성을 선택. 모바일은 입력→결과 순으로 쌓고 전체 메뉴와 키보드 포커스를 유지.

## 검증과 한계
- 공식 HF 공개 소스 조회 성공. 실행 도메인 hf.space는 현재 환경에서 TLS 인증서 issuer 검증 오류. 별도 실제 Chrome 읽기 조회에서도 net::ERR_CERT_AUTHORITY_INVALID 확인. 검증 비활성화/프록시 우회 없이 실제 생성은 미검증으로 남김.
- Node 회귀: Kandinsky 9건 + 기존 탐색 3건 + 계정 UI 7건 + 실제 인증/알림 HTTP 1건 = 20/20 통과. 생략 0건.
- 실제 로컬 Shopshorts server.mjs + 별도 Chrome headless: 인증 없이 접근 차단, 메뉴/현재 페이지 표시, 첫 프레임 첨부, 무료 계정 확인, 생성/실제 MP4 재생/다운로드, 토큰 비저장, 새로고침, POST 없이 GET 결과 복구, quota 오류, 불확실한 접수의 재전송 차단, 390px 모바일 overflow 검사 통과. 외부 HF 응답만 테스트 대역이며 실제 AI 생성 시험이 아님.
- 브라우저 통합 시험에서 네이티브 fetch의 잘못된 this 결속을 발견해 수정. Node 대역 시험만으로 발견하지 못한 결함을 실제 브라우저에서 확인함.
- 데스크톱/모바일 스크린샷을 직접 검토. 모바일 흰 메뉴의 텍스트 대비를 보완.
- 산출물: 전역 iCloud 작업 루트의 shopshorts/kandinsky-20261014/{tests.log,browser.log,desktop.png,mobile.png,fixture.mp4,download.mp4}. fixture/download는 FFmpeg 합성 테스트 영상, Kandinsky 결과가 아님.
- Pages는 기존 HTML extensionless 배포 경로와 인증 middleware 사용. 로컬 서버에는 /kandinsky 및 /kandinsky.html 등록. 운영 배포와 HF CORS/TLS 실서비스 왕복은 미검증.
- 재현: 일반 단위 시험 node --test apps/shopshorts/test/kandinsky.test.mjs. 브라우저 시험은 PLAYWRIGHT_ENTRY(Playwright 모듈 절대경로), KANDINSKY_TEST_DIR(격리 산출물 폴더), TMPDIR(동 폴더 하위)를 지정해 node apps/shopshorts/test/kandinsky-browser.mjs. 기본 Chrome 경로는 macOS 설치 위치이며 CHROME_PATH로 지정 가능.
