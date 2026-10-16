# Hanmadi 학습 카드 디자인 운영 승격 — 2026-10-16

## 결과: main 머지·운영 배포 및 접속 검증 완료

사용자의 “머지하고 배포 해주” 요청으로 [PR #287](https://github.com/hhj4861/commerce-automation-kit/pull/287)을 main에 머지했다. 새 배포 PR에 대한 별도 명시 승인(“PR #288 머지·운영 배포 승인”)을 받은 후 모든 CI 통과를 확인하고 [PR #288](https://github.com/hhj4861/commerce-automation-kit/pull/288)을 deploy/hanmadi에 정상 머지했다. **[자동 배포](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38894098003)가 성공했고 [운영 앱](https://hanmadi-lake.vercel.app/app)에서 새 디자인을 확인했다.**

- 원본 구현: `f19b13c92dfa7ee9d150f87d77afc24710184557`.
- main merge: `55bd8936c38aeffd3b7fb67c109db355b25efe75`, 2026-10-16 11:17:23 UTC.
- 승격 기준: 직전 운영 `69db975d14ebf9f6855f352fb88b6b0432a4a731`.
- 출시 브랜치: `release/hanmadi-study-refinement-20261016`, 커밋 `5ee1e98a6725800eb67365574ab67622ebea2075`. 원본 구현 한 건만 cherry-pick했으며 Flutter 전체 소스와 변경 E2E 스크립트·구현 문서는 원본과 diff가 없다.
- deploy merge/운영 revision: `a47ba0fbb57f51732bc5c46a1b1b43c1a74fa3f7`, 11:29:17 UTC.
- GitOps 실행 `38894098003`: plan 및 Hanmadi 배포 job 모두 success, watch 종료 코드 0. 기존 OIDC·중앙 broker·전용 Vercel 프로젝트 경로를 사용했다.

## 운영 검증

2026-10-16 11:35:17 UTC 공개 검증이 통과했다. `/api/deployment`는 위 운영 revision과 일치했다. `/study`, 공개 개인정보처리방침, Google 로그인 준비 상태와 공개 클라이언트 ID를 확인했다. 비로그인 관리자 API는 403이었다. 정규 앱 주소 `/app`, Flutter JS, 새 커피 PNG 자산 모두 200이며 앱 base href도 `/app/`였다.

추가 검증의 첫 시도는 `/app/`의 308 리디렉션을 엄격하게 거부해 종료됐다. Location이 동일 출처 `/app`임을 별도로 확인한 뒤 정규 주소를 검사해 통과했다. 기본 샌드박스의 별도 조회에서는 DNS 제한이 발생했고, 정상 네트워크 권한의 공개 조회로 확인했다. 배포 실패나 소스 수정은 아니며 보안 검사를 끄지 않았다.

실제 운영 Chrome의 390×844 화면에서 다음을 확인했다.

- 장식성 인사·중복 설명 제거, 하늘색 회화 카드, 원문·발음·뜻의 위계, 일반·느린 듣기 버튼과 연습 버튼 표시.
- 상황 선택창은 236×280으로 화면 일부에만 표시되며 바깥 클릭으로 닫힌다.
- 단어 탭과 단어 미리보기, 예문·뜻 표시 정상.
- 음악 연습 진입과 “스터디로” 복귀 정상. 검증 후 회화 화면 및 viewport를 원복했다.

운영 계정 설정·표현 저장·학습 완료 처리·유료 AI 호출은 수행하지 않았다. 관리자 배포를 실행하지 않았으며, 별도 관리자 공개 revision은 확인 시점에 `ab32d88cc9634559f5ac9e9a448604f3376414bb`였다. 이 작업이 관리자까지 갱신했다고 보고하지 않는다.

## 변경 및 이전 검증

하늘색 팔레트와 공통 글꼴을 유지하면서 회화·단어·음악 탭을 간결하게 통일했다. 장식성 인사·설명을 제거하고 회화 원문·발음·뜻의 위계를 정리했다. 상황·단어팩 선택 UI를 작게 만들고 회화의 일반·느린 듣기, 단어 미리보기, 음악에서 돌아오기를 유지했다. 커피 이미지는 자체 생성 자산이며 관련 상황에서만 사용한다.

- 원본 #287: 정적 분석, 22개 Flutter 테스트, 웹 release 빌드, 실제 서버·합성 계정·Chrome E2E 통과. 웹·Android·iOS·사용자 흐름·GitOps 등 6개 CI 통과.
- 출시 브랜치: 원본 소스 일치, `git diff --check`, 배포 테스트 39개 통과.
- #288의 모든 CI 통과: 사용자 흐름 8분 2초, 웹 2분 25초, Android 4분 52초, iOS 4분 4초, GitOps 15초. 웹 CI의 실제 서버·브라우저 E2E도 통과했다. Android·iOS는 빌드 검증이며 실제 단말·앱스토어 배포가 아니다.

## 증거 위치

`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-study-refinement-20261016/`

- `production-deploy-288.log`: 자동 배포 단계와 실제 종료 증거.
- `production-release.json`: 목표·실제 revision, 공개 경로 상태, 정규 경로 재검증 근거.
- `analyze-final.log`, `tests-final.log`, `web-build-final.log`, `e2e-final.log`, `e2e-final/result.json`, `e2e-final/mobile-cafe.png`, `e2e-final/mobile-words.png`, `ci-287.log`, `release-pr-body.md`: 원본 구현 검증·로컬 캡처. 로컬 캡처는 운영 화면 증거와 구분한다. 운영 화면은 이번 CUA 검증에서 직접 관찰했다.
