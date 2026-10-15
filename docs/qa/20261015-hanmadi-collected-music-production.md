# 수집 음악의 앱 학습 연결 운영 배포 — 2026-10-15

사용자의 PR #256 머지 및 학습 앱·관리자 운영 배포 승인으로 두 운영 앱에 배포를 완료했다.

- 구현 #256: `2785cc27f54074c184251eb635cf38a9cde89e33`; main merge `57da80519d5428f82634f83dadb00412204178df`.
- 구현 검증: 단위 275개·전체 타입/린트/빌드·영어 수집→원문→생성→검수→게시→학습/복습/진도 복원 및 일본어·태국어·스페인어 수집 자료 학습 완료. 기존 음악·단어·로그인 회귀를 포함한 전체 study CI `38664115370`와 GitOps `38664115447` 성공.
- 외부 YouTube·플레이어·LLM/JEV 응답은 자체 제작 자료의 fixture다. 운영 상용곡 자막 확보나 가사 게시를 의미하지 않는다.
- 승격 `cc17c81cf8fe6cb78a68cbb3230d01adfddd0776`: 기존 두 배포 브랜치의 이력만 통합. 전체 Git tree가 승인된 main과 같고 앱 tree가 구현 검증 커밋과 같다. 배포 도구 회귀 39개 PASS. 필수 GitOps 검사 2개 PASS 후 동일 앱 소스의 구현 CI 증거를 재사용해 승격한다. 동일 승격 소스의 전체 study CI `38666059217`과 `38666056151`도 모두 성공했다.
- 학습자 승격 #258: `566480da47b19f76a812fecc6ea3291c5567b719`, 01:32:21Z 머지. [배포 38666198721](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38666198721) SUCCESS, 01:34:24Z 완료.
- 관리자 승격 #259: `7ef60980a643d9d2ffba3601f6647c729116a29c`, 학습자 확인 뒤 01:35:41Z 머지. [배포 38666503138](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38666503138) SUCCESS, 01:37:52Z 완료.

## 사용 흐름

관리자 https://hanmadi-admin.vercel.app/study/admin → 음악 관리 → 수집 영상에 원문 연결 → AI 자료/JEV → 사람 검수·게시 → **앱에서 이 곡 학습**. 학습 앱 https://hanmadi-lake.vercel.app/study → 음악 → 학습할 곡 → 등록된 음악. 곡별 링크는 `/study/music/<언어>/<곡 ID>`다.

## 경계

운영 설정·키·수집 콘텐츠 게시·개인 학습 진도는 변경하지 않는다. 이번 운영 확인은 공개 버전·로그인 준비·접근 제어·곡별 진입 경로이며 운영 로그인 후 자료 게시·학습 완료 시험은 별도다.

## 실제 운영 확인

2026-10-15T01:38:41.248Z에 시작한 읽기 전용 검사 PASS.

| 대상 | 운영 주소 | 상태 | 운영 revision | 배포 job 시간 |
|---|---|---|---|---|
| 학습 앱 | https://hanmadi-lake.vercel.app/study | production READY | `566480da47b19f76a812fecc6ea3291c5567b719` | 1분 44초 |
| 관리자 | https://hanmadi-admin.vercel.app/study/admin | production READY | `7ef60980a643d9d2ffba3601f6647c729116a29c` | 1분 49초 |

- 두 `/api/deployment`가 표의 정확한 revision·앱 이름을 반환했다. 두 운영 브랜치 전체 tree가 승인된 승격 tree와 일치한다.
- 학습 앱: `/study`, `/privacy`, Google 준비 API와 로그인 설정 일치 검사 PASS. `/study/music/<en|ja|th|es>/hanmadi-<언어>-morning` 네 주소 200 및 음악 페이지 본문. 지원하지 않는 언어는 404.
- 학습자 카탈로그 비로그인 401, 두 앱 음악 관리자 API 비로그인 403. 관리자 앱은 학습자 곡 화면·카탈로그 API 모두 404.
- 배포별 앱 단위 검사·원격 production 빌드·공개 release verifier가 성공했다. 기존 실제 계정으로 로그인하거나 관리자 자료 게시, 사용자의 진도 변경은 수행하지 않았다.
- 관찰 범위: Actions 오류·공개 GET 응답 확인. Vercel 전체 런타임 오류 로그·Drains·상시 Monitoring 설정은 이번 검증에서 조회하지 않았다.
- 세부 증적: 지정 iCloud `commerce-automation-kit/20261015-collected-music-study/production-check.json`. 구현/회귀 증적은 같은 작업 폴더의 `e2e-verified`, `owned-regression`, `music-regression`, `unit.log`다.
