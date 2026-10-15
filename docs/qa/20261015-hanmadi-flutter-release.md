# Hanmadi Flutter 운영 배포 — 2026-10-15

## 결과

- **운영 반영 완료**: https://hanmadi-lake.vercel.app/app/. 기존 `/study`는 유지한다. 앱스토어 배포와 네이티브 인증 활성화는 이번 범위가 아니다.
- 운영 revision: `2f27da918b1fd04b869b835065551879c0af6eb7`. 공개 `/api/deployment`와 GitOps triggering SHA가 일치한다.
- [자동 배포 38707155115](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38707155115) plan·deploy 모두 SUCCESS. 08:42:24 UTC 운영 alias 연결, 08:42:36 UTC 운영 probe 성공. Vercel 빌드: https://hanmadi-44nc5i9pl-dean-10.vercel.app.
- 담당: 현재 Codex 세션 단독, workers/Claude OFF. 새 키·운영 계정 생성·유료 AI 호출·기존 학습 기록 변경 없이 배포와 공개 검증을 수행했다.

## 승인·머지·보호 경계

- 사용자 “머지 및 운영배포도 해줘” 승인 후 [PR #265](https://github.com/hhj4861/commerce-automation-kit/pull/265)를 07:45:24 UTC main에 머지했다. main merge `bf2bdfdc4f6dfa74003e0b4e606ba0da1fbd1973`.
- main 직접 승격 [PR #266](https://github.com/hhj4861/commerce-automation-kit/pull/266)은 기존 배포 브랜치의 독립된 머지 이력 때문에 strict 최신화 조건을 만족하지 못했다. 보호 조건을 낮추거나 main에 배포 이력을 직접 push하지 않고 이 PR을 닫았다.
- 전용 `release/hanmadi-flutter-20261015`에서 기존 `origin/deploy/hanmadi`를 정상 머지했다. 릴리스 HEAD `7ddf6d1f516212b5b20a277d4c8ef75892e85c1e`와 승인된 main merge의 전체 Git tree가 `1125d151415a0d2ff9f1ed3eb98defeac1762441`로 동일하다. 추가 소스 변경은 없다.
- [PR #269](https://github.com/hhj4861/commerce-automation-kit/pull/269)의 사용자 명시 승인 후 CI 5개 SUCCESS를 확인하고 08:38:48 UTC deploy/hanmadi에 정상 머지했다. merge revision이 현재 운영 revision이다.
- 운영 관리자 https://hanmadi-admin.vercel.app 의 revision은 전후 모두 `7ef60980a643d9d2ffba3601f6647c729116a29c`로 유지됐다.

## 검증

- Flutter 분석·단위/위젯 11개, 실제 로컬 서버 로그인·음악 복귀·AI 대화·번역·보관함 E2E, Android debug·iOS 무서명 release, 기존 전체 사용자 흐름·GitOps 모두 통과했다. AI는 local fixture다. 승격 CI: [Flutter](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38706086627), [전체 사용자 흐름](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38706086405), [GitOps](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38706086479).
- 운영 공개 GET: revision 일치, `/study`·`/privacy` 정상 본문 200, Google 준비 `available=true` 및 지정 client ID 일치, 익명 관리자 API 403. Flutter index의 `/app/` base·bootstrap 확인, bootstrap/main.dart.js/manifest/FontManifest 모두 200과 올바른 MIME 확인.
- 실제 운영 Chrome 390×844: Flutter 로그인 화면 렌더 → 로그인 버튼 → `/study/app-login`의 아이디/비밀번호/로그인 폼 → 개인정보처리방침 이동 통과. pageerror 없음, 프로세스 정상 exit 0. 로그인 계정을 새로 만들거나 유료 AI를 호출하지 않았다.
- 산출물: 사용자 지정 iCloud `gpt 작업/commerce-automation-kit/hanmadi-flutter-client-20261015/production/`의 `flutter-login-mobile.png`, `account-login-mobile.png`, `result.json`(pass=true). 같은 작업 폴더의 `production-deploy-269.log`는 GitOps 종료 기록이다.
- Vercel 커넥터는 지정 팀 배포 조회가 403이었고 로컬 전역 CLI가 없어 runtime error 로그·drain 설정은 조회하지 못했다. 기존 GitOps 전용 자격으로 실제 배포가 성공했으며 공개 운영 probe와 실제 브라우저로 결과를 확인했다. 권한·인증 계정을 바꾸지 않았다.
- 실제 단말의 Google 계정 로그인·마이크·앱 링크 복귀·서명 배포는 별도 미검증이다. 로컬 fixture E2E와 운영 공개 진입 검증을 실계정 전체 학습 검증으로 표현하지 않는다.

다음은 운영 `/app/`에서 기존 계정으로 새 화면을 사용해 확인하는 것이다. 기본 `/study` 진입 화면 전환과 네이티브 앱 활성화·스토어 배포는 별도 범위다.
