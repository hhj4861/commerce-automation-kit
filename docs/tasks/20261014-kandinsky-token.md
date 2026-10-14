# Kandinsky 저장 계정과 서버 연결

- 목표: 설정에서 HF 읽기 토큰 저장·삭제·상태 조회, 재입력 없는 생성과 연결 오류 진단. 후속 요청으로 Kandinsky UI/UX 개선 포함.
- 담당: Codex 단독, worker/Claude OFF. 기준 main 48d1dfe. 구현 worktree kandinsky-saved-token.
- 현재: 사용자 승인으로 PR238 main 머지, PR239 운영 브랜치 머지, credential-broker 및 Pages 운영 배포 완료. 실제 HF 생성은 사용자 토큰으로 확인 필요.

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

## 2026-10-14 승인 후 적용
- PR238은 사용자 승인 후 main `221cbce58495678f0d522fdccbbf6e51e2fb857d`로 머지. 승인 HEAD `7bde33a8a61515116ca470f33db1932a82e44bfa`의 GitHub 필수 검사 2개 성공 확인.
- 기존 운영 `74d66ac`(PR237)을 보존하고 승인 변경만 cherry-pick한 `release/kandinsky-saved-token` 준비. [운영 승격 PR239](https://github.com/hhj4861/commerce-automation-kit/pull/239)는 OPEN, 머지 승인 대기. Shopshorts/broker 소스는 main 221cbce와 동일.
- 운영 브랜치 위 Node20 관련 시험 140/140 통과, 실패·생략 0 (`release-tests.log`). PR239 최초 HEAD 13eeb7d의 Platform GitOps verification과 contract 성공.
- broker 먼저 배포 완료: `4bc3e711-668d-4879-ad57-91cb6c825ad4`, 2026-10-14 08:06:33 UTC. 배포 모듈 SHA256 `ccba53c3ab1760b30e4fcd3e5e02e312284e715b3f3717f407331a3036f0625e`.
- 로컬 wrangler 설정에 운영에 없는 `SS_DEPLOY_CLOUDFLARE_API_TOKEN` 참조가 있어 CLI 업로드는 Cloudflare 10182로 실패했다. 키를 새로 만들거나 정책을 바꾸지 않았다. 공식 [Worker 모듈 업로드 API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/update/)에 실제 운영 bindings를 메모리로 전달해 배포했고, 전후 36개 binding이 동일함을 확인했다. 따라서 Cloudflare CI 배포 키 부재는 여전히 해결되지 않았다.
- 운영 설정을 iCloud 파일로 저장하려던 요청은 자동 승인 검사에서 거부돼 실행하지 않았다. 이후 설정/키를 파일로 쓰지 않고 메모리에서만 처리했다. 빌드 코드·시험 로그와 운영 설정을 구분했다.
- 운영 broker 실측: 무인증 `/runner/huggingface` 요청 401, 기존 서명 키로 합성 owner의 읽기 전용 status 조회 성공, configured=false/job 없음/token 필드 없음. HF 토큰 저장·생성·기존 사용자 데이터 수정 없음.
- Pages는 아직 기존 `9eec2068-8793-4b20-ba3f-93cbe9190b66`, 소스 74d66ac. PR239 머지와 Pages 실배포 확인이 남았다. 로컬 제작 워커 및 사용자 토큰으로 실제 HF 생성은 이번 단계에서 변경/검증하지 않았다.

## 2026-10-14 PR239 머지와 Pages 운영 반영
- 사용자의 추가 명시 승인 후 PR239를 `1d2faf06f8d41b4387b78ae3cc922b1371788309`로 머지했다. 승인 HEAD 692cd5b의 필수 검사 2개 성공 확인. 머지 후 앱/broker 코드가 검증된 HEAD와 동일함을 확인했다.
- 자동 배포 [38535911560](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38535911560)은 credential 조회 503으로 실패했다. 기존 CI 전용 Cloudflare 키 부재는 미해결이며 자동 배포 성공으로 기록하지 않는다.
- 기존 Wrangler 인증을 사용해 동일 머지 커밋을 공식 Pages CLI로 수동 배포했다. production 배포 ID `e5182bc4-fbea-4f98-a346-9819c9d0e2c6`, 2026-10-14 08:34:56 UTC 성공. Cloudflare canonical deployment의 source SHA가 1d2faf0와 일치한다.
- 운영 URL: https://shopshorts-dash.pages.dev/kandinsky / 설정: https://shopshorts-dash.pages.dev/settings . Pages Functions 컴파일 성공.
- 운영 HTTP 검증: 비인증 화면 302→login, 비인증 계정 API 401. 인증 후 Kandinsky HTML/JS/CSS와 설정 모듈 HTTP200 및 승인 소스와 내용 일치. 설정 화면에 HF 저장 UI 포함. 계정 API HTTP200, private/no-store, token 필드 없음. 운영자 계정은 configured=false, job 없음.
- 검증 코드에서 없는 `/auth/session`을 조회해 HTML JSON 파싱 오류가 있었고 실제 구현 경로 `/auth/status`로 바로잡았다. 사용자 토큰 입력·영상 생성은 하지 않았다. 로컬 제작 워커와 58043의 시험 서버는 이 Pages 배포가 갱신하지 않는다.
- 수정한 인증 조회 `/auth/status`는 HTTP200/authenticated=true, `/api/studio/config`도 HTTP200. 기존 cloud-worker heartbeat `2026-10-14T08:36:35.289Z` 확인. capability 표시는 개별 제공자의 실제 생성 성공 증거로 세지 않는다.
