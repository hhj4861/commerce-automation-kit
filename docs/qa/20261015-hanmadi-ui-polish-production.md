# Hanmadi UI 다듬기 운영 배포 — 2026-10-15

## 결과

**운영 반영 완료:** https://hanmadi-lake.vercel.app/app/. 작은 선택창과 Jua 제목·Gowun Dodum UI 본문, 공통 자간·행간·여백·카드·버튼 스타일이 적용됐다. 기존 Next `/study`를 기본 Flutter 진입으로 바꾸거나 앱스토어에 배포하는 작업은 포함하지 않았다.

- 운영 revision: `16f5045a75dacf4e539257460e27342f45adb4a0`.
- [GitOps 배포 38736273702](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38736273702): plan·deploy SUCCESS, 12:39:08–12:42:31 UTC. 운영 probe 성공 기록 12:42:26 UTC.
- Vercel 배포: https://hanmadi-gn05s40sx-dean-10.vercel.app.

## 승인과 범위

사용자 “머지하고 배포해줘” 승인 후 [PR #276](https://github.com/hhj4861/commerce-automation-kit/pull/276)을 main에 머지했다(merge `4db45c743f7794f8e0a6d43c86c22baccd105128`). main에 다른 작업이 추가돼 있어, 현재 운영 `2f27da9` 위에 검증된 UI 커밋 `518f0be`만 정상 cherry-pick한 릴리스 `3b1203c666cfb0f7dfd1be33627c6591f01dc15f`를 만들었다. 변경은 해당 UI의 16개 파일이다. `git diff --quiet 518f0be HEAD -- apps/hanmadi apps/hanmadi-flutter` 통과로 앱 소스 전체 동일성을 확인했다.

새 [PR #277](https://github.com/hhj4861/commerce-automation-kit/pull/277)의 사용자 명시 승인과 CI 5개 SUCCESS 확인 후, 12:39:05 UTC `deploy/hanmadi`에 정상 머지했다. 보호 규칙·인증·다른 배포 브랜치는 변경하지 않았다. 관리자 revision은 검증 전후 `b3792c86323b6bb06642eb941cd93fb6bc8d0c1a`로 유지됐다.

## 검증

- 승격 PR CI: Flutter web·Android debug·iOS unsigned compile, 기존 전체 학습 사용자 흐름, GitOps 모두 통과. Flutter 분석·16개 테스트·실제 로컬 Next+Chrome E2E는 원본 UI QA와 CI로 확인했다. 실제 단말 설치 검증은 아니다.
- 운영 공개 probe: `/api/deployment`의 revision이 triggering SHA와 일치. `/study`·`/privacy` 정상, Google 로그인 준비 설정 일치, 익명 관리자 API 403. Flutter index `/app/` base·bootstrap·main.dart.js·manifest·FontManifest 정상 200 및 MIME 확인.
- 운영 Jua/Gowun Dodum TTF의 SHA-256이 릴리스 소스 파일과 각각 일치했다. 공개 probe 결과는 아래 `production/public-probes.json`에 저장했다.
- 실제 로그인된 Chrome을 390×844로 확인: 회화·단어 스터디에 새 제목/본문 스타일 적용. 상황 선택창 320×280px, 언어 선택창 236×220px, 설정의 레벨 선택창 320×220px. 상황·레벨 메뉴 바깥 클릭 닫기와 언어 메뉴의 포커스된 Esc 닫기를 실제 확인했다. 스크린샷도 직접 확인했다.
- 기존 로그인 세션만 사용했다. 계정 생성·설정값 변경·표현 저장·유료 AI·마이크 요청 없이 UI를 검증했다. 단어 탭 확인 후 회화 탭으로 돌아갔고 임시 모바일 viewport override를 해제했다. 운영 화면 탭은 사용자 확인용으로 남겼다.
- Vercel runtime error 로그·drain 설정은 이번에 조회하지 않았다. 실제 배포 로그·공개 probe·로그인된 UI 확인을 근거로 하며 전체 실계정 학습/음성 검증으로 확대하지 않는다.

## 산출물

`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-flutter-ui-polish-20261015/`

- `production-deploy-277.log`: GitOps 종료 증거.
- `release-ci-watch.log`: 승격 CI 통과 기록.
- `production/public-probes.json`: 운영 revision·자산·폰트 일치와 관리자 revision(공개 정보만 저장).
- 원본 구현 QA: UI worktree의 `docs/qa/20261015-hanmadi-flutter-ui-polish.md`. 실제 운영 화면 확인은 이 문서를 따른다. 사용자 인증 상태·토큰은 산출물로 내보내지 않았다.
