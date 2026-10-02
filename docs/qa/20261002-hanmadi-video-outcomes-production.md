# Hanmadi Admin 영상 처리 결과 UX · JEV v8 운영 배포

2026-10-02 KST. 운영 반영과 실제 사용자 흐름 검증을 완료했다.

## 운영 반영

- 운영 화면: https://hanmadi-admin.vercel.app/study/admin
- 구현 PR [#125](https://github.com/hhj4861/commerce-automation-kit/pull/125): 사용자 승인 후 main 머지, `918133b5ad9c9770407fbf671d27c46f31b56561`.
- 운영 승격 PR [#126](https://github.com/hhj4861/commerce-automation-kit/pull/126): 승인된 운영 배포 범위로 `main` → `deploy/hanmadi-admin` 머지.
- 배포 SHA: `3f4720bbb1a4c3e0aae9705d564f7cb10e12d7ce`.
- [GitOps 운영 배포](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37021712502) 성공. `/api/deployment`의 application `hanmadi-admin`, revision이 배포 SHA와 일치했다.
- 배포 전 운영 `cd6a174`의 일시 오류 복구를 유지하고, 승인된 PR #124의 `hanmadi-video-jev-v8` 문맥 검토와 PR #125의 진행·결과 UX를 함께 반영했다. 배포 커밋의 `apps/hanmadi`는 검증된 main과 diff가 없다.
- 학습 앱, 공유 게이트웨이, 인증 설정은 이번 배포에서 변경하지 않았다. 자료 게시·파인튜닝·새 유료 모델 검증은 실행하지 않았다.

## 검증 근거

- 구현 작업 브랜치의 단위 테스트 205개, 타입 검사, lint(오류 0·기존 경고 4), 전체 브라우저 사용자 흐름 통과. [구현 QA](https://github.com/hhj4861/commerce-automation-kit/blob/918133b5ad9c9770407fbf671d27c46f31b56561/docs/qa/20261002-hanmadi-video-outcomes.md).
- PR #125의 CI 5개 통과. main 머지 후 같은 소스의 [사용자 흐름](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37020537936), [Dify 연결](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37020538179), [모델 연결·native runtime](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37020537839)도 통과했다.
- 승격 PR의 필수 [GitOps 검사](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37020696314) 통과 후 정상 머지했다. 보호 규칙 우회나 force push를 사용하지 않았다.
- 승격 PR에서 중복 실행된 Dify 검사 `37020695084`는 ffmpeg 설치가 지연되어 머지 시 진행 중이었다. 동일 SHA의 main Dify 검사가 성공한 상태에서 배포했다. 최종 결과는 해당 실행 링크로 확인한다.

## 실제 운영 사용자 흐름

새 브라우저 컨텍스트에서 기존 승인된 소유자 PIN을 메모리로만 읽어 검증했다. 비밀 값과 로그인 쿠키는 기록하지 않았다.

1. 비로그인 `/admin-login` 200, 관리자 API 403, 학습 API 404.
2. 관리자 로그인 200, 관리자 화면과 영상 찾기·학습 관리·AI 진단 메뉴 표시, 로그인 후 관리자 API 200.
3. 운영 검색에서 ‘처음 본 일본인과 스몰토크 잘 하는 법’을 검색하고 신고 영상 `71gMyqGhDCk` 선택. 일본어·스몰토크·레벨 1로 자료 만들기 실행.
4. 실제 서버 응답 HTTP 200, `state=blocked`, `stage=checking`, `issue=too_long`, `retryable=false`.
5. 공식 API 실측 안내: **영상 길이 28분 39초, 최대 15분**. 이전 조사에서 YouTube 플레이어는 28분 38초로 표시됐다. 초기 운영 검증은 이 1초 차이로 기대값 단언이 실패했으며, 앱의 제한 판정은 정상 작동했다. API 실측값으로 검증 기대값을 정정한 뒤 최종 검증이 통과했다. 최초 실패 증적도 보존했다.
6. 화면에서 ‘저장된 초안이 없어요’, ‘내용 분석 미실행 · JEV 평가 미실행 · 초안 저장 안 됨’, ‘분석 불가 영상 빼기 (1개)’ 표시 확인. 해당 영상의 초안 수가 증가하지 않았다.
7. 1280px 데스크톱과 390px 모바일 캡처 육안 검토. 모바일 가로 넘침 없음, 브라우저 런타임 오류 0, 로그아웃 200.
8. 배포 시작 이후 Vercel production 오류 수준 로그 조회 성공, 조회 시점 반환 기록 0개. 이는 조회 기간의 관측 결과이며 영구적인 무오류 보장은 아니다.

실제 운영에서는 길이 초과 사전 검사와 화면만 확인했다. AI 내용 분석·JEV 유료 추론·새 초안 저장을 재실행한 검증은 아니다. JEV v8 운영 반영은 배포 소스와 운영 revision으로 확인했다.

## 저장 위치

- 이 문서: `/Users/admin/workSpace/commerce-automation-kit/docs/qa/20261002-hanmadi-video-outcomes-production.md`
- 구현 worktree: `/Users/admin/workSpace/commerce-automation-kit-worktrees/hanmadi-video-outcomes`
- 운영 검증 스크립트·정제 JSON·캡처·오류 건수: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/hanmadi-admin/video-outcomes-20261002/`
- 최종 증적: `production-verification.json`, `production-desktop.png`, `production-mobile.png`, `runtime-error-scan.json`.
