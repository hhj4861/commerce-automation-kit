# Kandinsky 저장 계정과 서버 연결

- 목표: 설정에서 HF 읽기 토큰 저장·삭제·상태 조회, 재입력 없는 생성과 연결 오류 진단. 후속 요청으로 Kandinsky UI/UX 개선 포함.
- 담당: Codex 단독, worker/Claude OFF. 기준 main 48d1dfe. 구현 worktree kandinsky-saved-token.
- 현재: 구현과 관련 시험 통과, 작업 브랜치 PR 준비. 머지·운영 배포는 별도 승인 뒤. 기존 PR230/231 배포 승인과 별개.

## 설계
- 기존 credential-broker의 AES-256-GCM + Secrets Store VAULT_KEY + D1 credential_vault를 재사용한다. 별도 키/테이블/인프라 생성 없음.
- google subject 또는 기존 legacy operator에서 얻은 서버 소유자 해시로 격리. 토큰은 authenticated binding/서명된 runner 통로로만 조회한다. 브라우저에는 연결 상태와 계정명만 반환.
- 설정 PUT은 HF whoami로 무료 계정을 확인한 뒤 저장. 교체/삭제 때 진행 기록이 있으면 먼저 생성 메뉴에서 정리하게 한다. 토큰 값은 재표시/브라우저 저장하지 않는다.
- 브라우저→동일 출처 Shopshorts→고정된 공식 HF 호스트. 외부 URL/소유자/토큰을 생성 요청에서 받지 않는다. TLS 검증과 redirect:error 유지. 유료 fallback 없음.
- 기존 브라우저 직접 접속은 이 Mac에서 curl(60) issuer 오류 재현. 변경은 서버 중계로 브라우저 CORS/로컬 TLS 경로 의존을 제거한다. 서버→HF 실제 연결 성공은 아직 확인하지 않았으며 인증서 검증 해제/우회는 하지 않는다.
- reserve/checking→uncertain(POST 전 저장)→submitted→complete. owner별 단일 미정리 작업, 원자 CAS로 중복 POST 차단. lost response 뒤 자동 POST 없음. GET SSE로만 결과 재확인.
- 입력 이미지는 중계 중 메모리에서만 보유. 최대10MB, 결과60MB 제한. 프롬프트 결과/미디어주소는 토큰과 같은 암호화 레코드 안에 보관한다. 결과 미디어는 소유자 검증 후 고정 HF 주소에서 가져온다.
- 새 영상 만들기는 접수 기록만 지우며 HF 생성 자체를 취소하지 않는다. 계정별 마지막 작업 한 개만 보관하므로 기존 결과는 다운로드 후 정리한다.

## 적용 순서
1. PR 검증·승인·머지.
2. 같은 커밋의 credential-broker를 먼저 배포(RPC huggingFaceAccount와 signed runner 경로). 기존 설정·VAULT_KEY 보존.
3. Shopshorts Pages 승격·배포. 로컬 서버 사용 시 같은 소스 업데이트 필요.
4. 사용자 직접 설정에 토큰 입력 후 실제 생성 왕복 검증. 토큰을 채팅/Git/로그에 넣지 않는다.

## 검증
- Node20: 계정 암호화·소유자 격리·CSRF·동시 접수·불확실한 POST·SSE·미디어 제한과 기존 인증/로컬/브로커 회귀, UI 상태 시험 124/124, skip 0.
- Node22 + Wrangler4.143: Pages Functions bundle, broker deploy --dry-run 성공. 운영 배포 없음.
- Chrome 실측: 가짜 토큰 저장→빈 비밀번호 필드→새로고침 후 저장 상태 유지→영상 생성에서 토큰 재입력 없이 샘플 MP4 완성→새로고침 복원. 실제 HF 대신 fixture 응답 사용.
- 후속 UI: 상단 계정 연결 상태, 설명 글자 수, 예시 3개, 첫 이미지 영역, 접힌 고급 설정, 3단계 진행, 완료/불확실/오류별 안내. 개선 화면의 데스크톱 렌더와 계정 저장을 Chrome에서 확인. 추가 모바일 실측은 브라우저 사용자 조작으로 미실시. 반응형 CSS는 포함.
- 초기 TLS 코드 분류 시험 1건 실패(UNABLE_TO_VERIFY_LEAF_SIGNATURE 누락) 후 분류 보완, 재검증 통과. TLS 검증은 유지.
- 실제 사용자 토큰/유료 API 사용 없음. 서버→HF 실제 생성은 배포 후 사용자 계정으로 추가 확인 필요. 기존 v1 브라우저 접수 기록은 서버 기록으로 자동 이전하지 않는다.
- 로그/샘플 위치: iCloud gpt 작업/shopshorts/kandinsky-token-20261014. local 58043은 실제 HF가 아닌 UI 시험 서버이며 화면에 이 구분을 표시한다.

## 화면 방향
- 기존 Shopshorts 팔레트 유지: canvas #f7f7f4, white #ffffff, ink #242622, mint #277e64, line #e5e6df, error #b54b42. Noto Sans KR/DM Sans 기존 서체.
- 상단 계정 상태 → 왼쪽 입력/예시/옵션 → 오른쪽 미리보기/진행/다운로드. 좁은 화면은 단일 열, 왼쪽 정렬. 장식보다 장면 작성과 결과 확인에 공간을 배분.
- 일반 카드 나열을 피하고, 미리보기 한 곳에 시각적 비중을 둠. 임의 진행률은 표시하지 않으며 실제 상태에 따라 안내. 입력 덮어쓰기 전 확인, 빈 입력/미연결/기존 접수 상태에서는 생성 비활성화.

## 제출 결과와 재현
- 구현 커밋: 9ab0dd28e0c563c449ffdcb43730e3e5c76e0b15. 작업 브랜치 정상 push, PR https://github.com/hhj4861/commerce-automation-kit/pull/238 (OPEN).
- GitHub Platform GitOps verification 및 Shared topic discovery/contract 성공. 운영은 미반영. 다음은 사용자 PR 머지/배포 승인 후 broker→Pages 순서 적용과 실제 HF 연결 확인.
- 이 변경부터 kandinsky-browser.mjs는 외부 브라우저 제어 스크립트가 아니라 로컬 fixture 서버다. 앞선 20261014-kandinsky.md의 PLAYWRIGHT_ENTRY/CHROME_PATH 절차는 이전 버전 기록이다.
- 브라우저 재현: KANDINSKY_TEST_DIR에 시험 MP4 fixture.mp4를 준비하고 KANDINSKY_TEST_PORT=58043 node apps/shopshorts/test/kandinsky-browser.mjs 실행. 출력 /test/login으로 진입하여 합성 토큰 hf_SyntheticFixture12345만 입력. 실제 토큰/외부 HF 호출 없음. 종료 시 메모리 상태는 사라짐.
- 최종 관련 시험 로그: tests-final.log (124 pass, 0 fail, 0 skip). Pages 빌드 pages-build.log, broker dry-run broker-build.log.
