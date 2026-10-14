# Hanmadi 자체 음악 학습 운영 반영 — 2026-10-14

## 범위와 현재 상태

Musixmatch 없이 관리자 원문 등록 → AI 학습 자료 생성 → JEV 평가 → 사람 검수·게시 → 학습자의 단어·회화·개인 저장으로 연결하는 PR #225를 운영에 반영한다. 이번 기록은 음악 담당 세션의 직접 확인과 배포 담당 세션의 보고를 구분한다.

**학습자 앱과 어드민 모두 운영 배포 완료.** 공개 배포 버전과 접근 제어, 로그인 준비 설정, 기본 음원 파일 응답을 직접 확인했다.

- 구현 PR #225: <https://github.com/hhj4861/commerce-automation-kit/pull/225>, main merge `af1fd27bd1b0911425c2eaab3815449a43952574`.
- 배포 소스: 후속 퇴역 연동 정리 PR #228까지 통합한 `e5848e714514a16088958f9b84d901f4cc5d8bbf`. [전체 사용자 흐름 CI](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38515533205) 통과. 실제 음악·자체 음악 E2E가 포함되며 AI/JEV 응답은 HTTP fixture다.
- 단일 배포 실행 담당: `hanmadi-llm` 세션 `01a0dc15-0f03-7ca2-92e1-54f2ec0820c0`. 음악 담당 세션은 공개 API와 배포 결과를 독립 조회한다. 사용자 진도·자료 게시·유료 모델 호출은 하지 않았다.
- 학습 앱 승격 PR #233 / merge `fdc272b317b1306d3731e000f0174dc7c9f1957e`.
- 어드민 승격 PR #235 / merge `9f2b77a8f7ac98913c1a1d24ebc3e5405c555e2d`.
- 동일 소스의 중복 PR #232·#234는 위 머지 뒤 GitHub에서 같은 merge SHA의 MERGED 상태가 됐다. #232 닫기 시도는 이미 머지됐다는 응답으로 거절됐으며 추가 배포를 실행하지 않았다.
- 검증 소스와 두 배포 merge의 Git tree는 모두 `b0bfa8082f6638a60a615192fd0d2ede2de5de1c`로 일치한다.

## 직접 확인한 운영 결과

| 대상 | 상태 | 확인 내용 |
|---|---|---|
| 어드민 | 배포 완료 | [자동 배포 실행](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38526404296) SUCCESS |
| 어드민 identity | 통과 | `https://hanmadi-admin.vercel.app/api/deployment`가 `hanmadi-admin` 및 `9f2b77a8f7ac98913c1a1d24ebc3e5405c555e2d` 반환 |
| 어드민 접근 격리 | 통과 | 기존 `verifyAdminRelease` 실행 성공: 로그인 페이지 200, 비로그인 관리자 API 403, 학습 API 404 |
| 신규 음악 API | 통과 | 어드민 호스트의 `/api/study/admin/music` 403, `/api/study/practice-music` 404 |
| 학습 앱 | 배포 완료 | [자동 배포 실행](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38526398064), attempt 2 SUCCESS, 2026-10-14 07:49:57 UTC 완료 |
| 학습 앱 identity·진입점 | 통과 | `verifyLearnerRelease` 실행 성공: `hanmadi` 및 `fdc272b317b1306d3731e000f0174dc7c9f1957e` 일치, `/study`·`/privacy` 200 및 본문 확인 |
| 학습 앱 로그인 준비·격리 | 통과 | Google 로그인 available=true 및 설정된 공개 client ID 일치, 비로그인 `/api/study/admin` 403 |
| 학습 앱 음악 API | 통과 | 비로그인 `/api/study/practice-music` 401, `/api/study/admin/music` 403 |
| 기본 음원 4개 | 통과 | `/study/music/hanmadi-{en,ja,th,es}-morning.mp3` 각각 Range `bytes=0-1023` 요청에 206, `audio/mpeg`, 1,024바이트 반환 |

학습 앱의 첫 실행은 중앙 자격 요청 403으로 빌드 전에 실패했다. 사용자 승인 범위에서 배포 담당 세션이 학습 앱 전용 90일 CI 토큰을 중앙 보관소에 등록하고 배포 경로에 연결했다. 재실행에서는 자격 조회와 실제 배포가 모두 성공했으며, 이후 공개 identity도 새 배포 SHA로 바뀐 것을 직접 확인했다. 토큰 값은 조회·기록하지 않았다.

운영 주소: [학습자 앱](https://hanmadi-lake.vercel.app/study), [Hanmadi Admin](https://hanmadi-admin.vercel.app).

## 검증 한계

- 실제 Pretender 가사·사용권은 이번에 확보하거나 게시하지 않았다. 관리자 원문 등록과 게시가 끝난 곡이 학습자 카탈로그에 나타나는 구조다.
- 자체 원문 생성·JEV 판정·저장·회수의 전체 E2E는 로컬/CI fixture 검증이며, 이번 공개 운영 조회만으로 실제 모델 품질이나 인증된 사용자 데이터 쓰기까지 검증했다고 주장하지 않는다.
- 이 문서의 토큰·브라우저 등록 진행 상황은 배포 담당 세션 보고이며, 비밀 값을 조회·기록하지 않는다.
- Google 로그인 설정 검증은 실제 계정의 로그인 완료와 구분한다. 공개 음원 응답 검증은 브라우저 청음이나 공식 YouTube 영상 재생 완료와 구분한다.
