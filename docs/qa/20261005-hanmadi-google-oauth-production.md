# Hanmadi Google 로그인 운영 활성화

## 작업 카드

- 목표·담당: 현재 Hanmadi 세션이 일반 학습자 Google 로그인을 운영에 연결하고 실제 계정 가입·재로그인·설정 유지·관리자 권한 차단을 검증한다.
- 소스: 로그인 [PR #144](https://github.com/hhj4861/commerce-automation-kit/pull/144)는 main `bc861ccf8aafffd972ea8a1cd8f7c5f36280f43f`에 머지. 개인정보 안내 [PR #147](https://github.com/hhj4861/commerce-automation-kit/pull/147)의 head는 `d0eff20700f3066b868dd037a8a338707e720def`, 승인 후 main 머지·운영 반영 SHA는 `e2d39bdcf6e5c4c0ddf3aa613a803e1037b4ffa6`.
- 범위: 학습 앱 `hanmadi`. 관리자 앱과 공용 AI 서버 변경 없음.
- 완료 조건: Google 운영 설정, 공개 개인정보처리방침, 운영 SHA 일치, 실제 로그인·로그아웃/재로그인·설정 유지·관리자 차단. 모두 확인 완료(2026-10-05 KST).
- 현재 결과·다음 행동: 운영 활성화와 검증 완료. 일반 사용자는 운영 로그인 화면의 Google 버튼으로 학습자 계정을 만들 수 있다.

## 적용·검증 상태

- 시작 시 운영은 `dd6a9ebf64644b95152c9c4aaaf82758b22dcc32`, Google 로그인 API는 404.
- 개인 Google 프로젝트 `hanmadi-510621` 생성, 사용자가 정책 동의·앱 생성을 완료.
- 전용 웹 클라이언트 `Hanmadi Production Web` 생성. 승인 원본은 `https://hanmadi-lake.vercel.app` 한 곳. 리디렉션 URI 없음. 공개 ID를 Vercel `hanmadi` production의 `HANMADI_GOOGLE_CLIENT_ID`에 등록. 클라이언트 비밀키는 앱에서 사용하거나 파일에 저장하지 않음.
- 브랜딩 홈페이지·`/privacy` URL·승인 도메인 저장. 기본 openid·이메일·프로필만 구성.
- Google 대상은 외부 사용자, 게시 상태는 **프로덕션 단계**. 민감·제한 범위 없음. 로고 추가·브랜드 검증 신청 없음.
- 기존 운영 `AUTH_SECRET`·Redis·AI 환경변수 유지. 비밀 값 출력·복사 없음.
- 학습 앱의 `deploy/hanmadi`·중앙 CI 자격은 미활성 상태. 기존 Vercel CLI 배포 경로를 사용하며 관리자 앱 GitOps와 구분.
- 개인정보 안내 변경: lint 오류 0, Next 운영 빌드·타입 검사, Chrome 로그인 회귀 E2E 통과. 비로그인 `/privacy` 200, 390px 화면 가로 넘침 없음.
- 테스트는 외부 GIS·JWKS만 모의 처리. 실제 앱 nonce·서명·쿠키·저장·재로그인·계정 격리를 검증했으며 실제 Google 계정 검증과는 다름.
- 산출물: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/hanmadi/google-login-20261005/privacy/`.

## CI·운영 배포 증거

- PR #147 필수 CI 5개 통과: study(5분 8초), connection(7분 34초), connections(2분), native-runtime(59초), Platform GitOps verification(22초).
- 실행 기록: [study](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37237415462/job/111539211170), [connection](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37237415535/job/111539211436), [connections](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37237415524/job/111539211502), [native-runtime](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37237415524/job/111539211274), [GitOps](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37237415467/job/111539211065).
- PR #147 main 머지 시각: 2026-10-04 21:54:07 UTC. 배포 전 작업 디렉터리의 `apps/hanmadi`가 승인된 머지 SHA와 같음을 확인했다.
- Vercel 프로젝트 `dean-10/hanmadi`, production 배포 `dpl_6esxUrqbxEU5czqpXUbMb51FE9nC` **READY**. [배포 상세](https://vercel.com/dean-10/hanmadi/6esxUrqbxEU5czqpXUbMb51FE9nC).
- 고정 배포 URL: https://hanmadi-fybj2s3l2-dean-10.vercel.app . 운영 별칭: https://hanmadi-lake.vercel.app .
- `/api/deployment`의 revision이 `e2d39bdcf6e5c4c0ddf3aa613a803e1037b4ffa6`와 일치. Vercel 커밋 메타데이터도 일치.
- 운영 `/api/study/account/google`: HTTP 200, `available: true`. `/privacy`: HTTP 200, 정책 본문 확인. 비로그인 `/api/study/admin`: HTTP 403.
- 배포 전 파일 검사: 243개 / 2,799,451바이트. `.env`, `storage`, `.next`, 생성된 AGENTS/CLAUDE 파일 미포함.

## 실제 Google 계정 검증

연결된 개인 Chrome에서 운영 사이트의 Google 로그인 버튼을 사용했다. 모의 Google 응답이나 로컬 앱을 이용한 결과가 아니다.

1. 기존 소유자 로그인에서 로그아웃. 기존 학습 기록을 수정·삭제하지 않았다.
2. Google 계정 선택 화면에서 개인 계정을 선택. 이름·프로필 사진·이메일과 올바른 개인정보처리방침 링크를 확인하고 승인 범위 안에서 계속 진행했다.
3. 새 학습자 온보딩 진입과 설정 화면의 본인 이름·**학습 계정** 표시 확인. 콘텐츠 관리자 링크는 표시되지 않았다.
4. 학습 언어를 영어로 바꾸고 로그아웃한 뒤 같은 Google 계정으로 재로그인. 로그인 성공과 영어 설정 복원 확인.
5. 학습 언어를 원래 일본어로 복원. 마지막 상태는 개인 Google 학습자 계정 로그인 유지.
6. 같은 Google 세션에서 `/study/admin` 화면을 열어 **소유자 계정만 사용 가능** 안내와 관리자 진입 차단 확인.

### 확인 범위와 구분

- 실계정 검증에서는 언어 설정의 재로그인 후 유지를 확인했다. 새 단어장 항목이나 수업 완료 기록은 생성하지 않았으며 유료 AI 호출도 하지 않았다.
- 단어장 저장·복원, 잘못된 nonce 거부, 동일 이메일·다른 Google sub의 계정 격리, 학습자 API 관리자 접근 403, 기존 비밀번호 로그인 회귀는 외부 GIS/JWKS만 모의 처리한 자동 E2E에서 확인했다.
- 실제 Google 세션의 직접 계정 API 브라우저 열기는 브라우저에서 차단돼 응답을 수집하지 않았다. 실제 권한 확인 근거는 학습 계정 UI와 관리자 화면의 접근 차단이다.
- Google 학습자 계정과 기존 아이디·소유자 계정은 별개다. 기존 학습 기록을 자동 병합하지 않는다.
- Google 토큰·쿠키·클라이언트 비밀키·실계정 API 응답은 소스, 문서, 로그·클라우드 산출물에 저장하지 않았다. 공개 클라이언트 ID만 운영 환경에 등록했다.
- 이번 운영 반영은 기존 Vercel CLI 경로를 사용했다. 학습 앱 `deploy/hanmadi` GitOps 활성화까지 완료한 것은 아니다. `hanmadi-admin` 배포에는 변경이 없다.
