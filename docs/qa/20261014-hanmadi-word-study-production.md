# Hanmadi 단어 스터디 운영 배포 — 2026-10-14

## 요청과 범위

사용자가 PR #250에 대해 “머지하고 배포해줘”라고 승인했다. 학습자 앱 `https://hanmadi-lake.vercel.app/study`에 회화·단어·음악 구분, 4개 언어의 주제별 단어 익히기·뜻 퀴즈·오답 복습·기존 단어장 연결을 반영한다. 관리자 앱·자료 게시·유료 모델 학습은 이번 배포 대상이 아니다.

## 검증 및 통합

- PR #250: https://github.com/hhj4861/commerce-automation-kit/pull/250
- 최초 코드 `d96d145`: 단위 263 + 새 단위 3, 타입·lint·운영 빌드, 단어 스터디/기존 단어장 E2E 통과. 전체 CI `38574863574` 성공.
- 머지 직전 main에 음악 수집 PR #249가 추가돼 `package.json` 테스트 명령 목록에서 충돌했다. `test:music-collection`, `test:owned-music`, `test:word-study`를 모두 유지해 `5f5e308`로 통합했다. 단위 275개 통과. 전체 CI `38576670137` 성공(8분). 회화·로그인·음악·음악 수집·자체 음악·단어 스터디 E2E를 포함한다.
- 원래 E2E 근거: 사용자 지정 iCloud `commerce-automation-kit/hanmadi-word-study-20261014/e2e-release/`.

## 최종 결과 — 운영 반영 완료

- main PR #250 머지: `553fe3d11deb144c58bff1603dce771bda0da796`.
- 운영 승격 [PR #254](https://github.com/hhj4861/commerce-automation-kit/pull/254) 머지: `56b84f4d6f471325c198038aaaa32d41620df67c`.
- 승격 브랜치 `release/hanmadi-word-study-20261014` / `30184833207f29e67557758f1b8cde0d40ad5585`는 선행 음악 수집 배포 #251을 보존한다. 운영 기준 변경은 단어 스터디 관련 9개 파일뿐이다.
- 통합 검증 소스 `5f5e308`, 승격 head `3018483`, 실제 운영 merge `56b84f4`의 tree가 모두 `7b2b6bd70d65d2c40827d789b23a0c50a5701fd8`로 일치한다.
- 승격 PR의 필수 Platform GitOps 검사 성공 후 머지했다. 같은 tree의 전체 사용자 흐름 CI를 재사용했고, 승격 PR 자체 전체 CI [38577354689](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38577354689)도 이후 성공했다.
- [자동 운영 배포 38578016847](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38578016847) 성공. 배포 job은 2026-10-14 14:11:30 UTC(23:11:30 KST)에 완료됐다. 보호된 브랜치 검사·전용 중앙 자격 조회·앱 테스트·Vercel 빌드·운영 검증 모두 통과했다.
- 실제 배포 URL: https://hanmadi-a3k9n71cf-dean-10.vercel.app . 운영 주소: https://hanmadi-lake.vercel.app/study .

## 운영 직접 검증 — 2026-10-15 KST

1. `verifyLearnerRelease`로 운영 `/api/deployment`의 application=hanmadi 및 revision=`56b84f4…` 일치, `/study`·`/privacy` 정상 응답, Google 로그인 준비 설정·정확한 client ID, 비로그인 관리자 API 403을 확인했다.
2. 로그인된 개인 Chrome에서 새로고침 후 **회화 / 단어 / 음악** 메뉴와 단어 학습의 3개 주제를 확인했다.
3. 일본어 카페 단어 5개(커피·물·메뉴·우유·설탕)를 순서대로 열고 뜻·한글 발음·예문을 확인했다. 각 단계의 1/5 → 5/5 진행 표시와 뜻 퀴즈 연결이 정상이다.
4. 실제 뜻 퀴즈에서 정답 4개와 ‘아직 모르겠어요’ 1개를 입력해 **단어 5개 연습 / 4개 정답 / 물 1개 다시 익히기** 결과를 확인했다.
5. 헷갈린 1개 다시 익히기로 물만 재학습 → 퀴즈 정답 → **단어 1개 연습 / 1개 정답** 완료를 확인하고 단어 스터디 시작 화면으로 복귀했다. 브라우저 error 로그는 빈 배열이었다.

## 범위와 제한

- 이번 운영 확인은 저장되지 않은 입문 단어의 실제 UI 흐름이다. 개인 단어 저장·복습 기록을 추가하거나 운영 학습 자료를 게시하지 않았다. 저장·실패 재시도·4개 언어·사용자 격리는 로컬 및 CI E2E로 검증했다.
- 실제 유료 TTS/AI 호출, 새 Google 로그인 인증, 실제 iOS 기기 시험, Vercel 전체 서버 오류 로그/모니터링 설정 점검은 수행하지 않았다.
- 자동 승인 검토의 작업공간 지침 로딩 실패로 읽기 전용 조회 1회가 실행되지 않았다. 사용자 재개 뒤 동일 검토 경로로 정상 조회했으며 권한·보호 조건을 바꾸지 않았다.

