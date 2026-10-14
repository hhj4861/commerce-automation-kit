# Hanmadi 운영 배포 — 2026-10-14

## 결과 (07:20 UTC 확인)

사용자의 “머지해줘”, “운영배포도 해줘”, “계속” 요청으로 승인된 소스를 운영 승격했다. **관리자 배포는 완료, 학습자 배포는 CI 전용 토큰 발급 승인 대기**다. 학습자 운영은 이전 버전을 정상 제공하며, 양쪽 모두 새 버전이라고 보고하지 않는다.

| 대상 | 승격 PR / merge SHA | Actions | 실제 운영 |
|---|---|---|---|
| 학습자 | [#233](https://github.com/hhj4861/commerce-automation-kit/pull/233) / `fdc272b317b1306d3731e000f0174dc7c9f1957e` | [38526398064](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38526398064), 자격 조회 403으로 실패 | [학습 앱](https://hanmadi-lake.vercel.app/study), 기존 `f77f853119f99cd20c3f6c3d9204c8663d09900b` |
| 관리자 | [#235](https://github.com/hhj4861/commerce-automation-kit/pull/235) / `9f2b77a8f7ac98913c1a1d24ebc3e5405c555e2d` | [38526404296](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38526404296), 성공 | [관리자](https://hanmadi-admin.vercel.app/admin-login), 새 SHA 일치 |

관리자 배포 URL: https://hanmadi-admin-70fw1zm4w-dean-10.vercel.app . 운영 별칭 반영 07:10:27 UTC, 자동 운영 확인 완료 07:10:28 UTC.

## 승격한 범위와 검증

- 검증 소스는 PR #228이 main에 머지된 `e5848e714514a16088958f9b84d901f4cc5d8bbf`. 퇴역한 Dify·개인 AI 연결 제거와 이미 머지된 자체 음악 학습 기능을 포함한다.
- 승격 브랜치 `release/hanmadi-20261014`를 정확한 소스에 고정했다. #233/#235는 각 보호된 운영 브랜치에 merge commit으로 머지했다. 두 PR 모두 검사 33개 성공을 확인했다.
- 두 승격 merge의 소스 tree는 검증 소스와 같은 `b0bfa8082f6638a60a615192fd0d2ede2de5de1c`다. 관련 없는 최신 main 변경을 섞지 않았다.
- 소스 검증: 단위 260개, 타입·lint·build, language-flow 및 음악 E2E 통과. 이 기록은 운영에서 유료 공급자 호출과 전체 학습 진도를 다시 검증했다는 뜻이 아니다.
- 기존 다른 세션의 중복 PR #232/#234는 같은 head가 target에 포함되면서 GitHub가 MERGED로 표시했다. 별도 운영 배포를 중복 실행하지 않았다.

## 운영에서 직접 확인한 결과

| 점검 | 학습자 (이전 버전) | 관리자 (새 버전) |
|---|---|---|
| `/api/deployment` | 200, `f77f853…` | 200, `9f2b77a…` |
| 진입 화면 | `/study` 200 | `/admin-login` 200, 실제 브라우저에서 Hanmadi Admin / 관리자 PIN 화면 확인 |
| `/privacy` | 200 | 해당 없음 |
| Google 준비 API | 200, `available=true` | 해당 없음 |
| 비로그인 `/api/study/admin` | 403 | 403 |
| 관리자 배포의 `/api/study` | 해당 없음 | 404 |
| `/api/study/admin/music` | 새 버전 반영 전 | 403 |
| `/api/study/practice-music` | 새 버전 반영 전 | 404 |

개인 학습 기록·음악 자료를 만들거나 변경하지 않았고, 새 유료 AI 호출도 하지 않았다. 튜터 PIN 로그인 뒤 화면 확인 (c)는 아직 미검증이다.

## 학습자 실패 원인과 남은 작업

07:08:39 UTC 학습자 Actions가 Cloudflare `/github/secrets`에서 403으로 종료됐다. 앱 업로드·빌드 전 실패다. 이후 공식 API로 비밀값 없이 운영 설정과 Secrets Store 메타데이터를 확인했다.

1. `GITHUB_DEPLOY_ALLOWED_REFS`에는 admin·Shopshorts만 있고 `refs/heads/deploy/hanmadi`가 없다.
2. `SS_DEPLOY_VERCEL_TOKEN` 바인딩이 없다.
3. Secrets Store 전체 27개 메타데이터에 `CAK_DEPLOY_VERCEL_TOKEN`이 없다. 관리자·Replay 전용 배포 자격은 존재한다.
4. 운영 Worker 코드는 learner ref 및 보호된 브랜치 검증을 지원한다. 저장소 `e5848e7:apps/credential-broker/wrangler.json`에는 필요한 learner ref·binding이 이미 정의돼 있다. 설정을 실제로 복구하지는 않았다.

기존 Wrangler 세션은 처음 메타데이터 조회 시 401이었고, 공식 `whoami`로 같은 계정의 토큰을 정상 갱신한 뒤 조회했다. 새 로그인·권한 확대는 하지 않았다.

Vercel 생성 화면에 `cak-hanmadi-learner-gitops`, 범위 `hanmadi` 프로젝트만, 유효기간 90일(화면상 2027-01-12)을 준비했다. **Create는 누르지 않았다.** 브라우저 도구의 새 접근 자격 발급 직전 확인 정책에 따라 사용자에게 발급·기존 Cloudflare Secrets Store 보관·보호된 GitHub Actions 연결을 묶어 질문했다. 답변 전 토큰 생성·시크릿 등록·broker 설정 변경은 하지 않는다.

승인 후 순서: 전용 자격 발급·안전한 중앙 보관 → 현재 운영의 다른 binding을 보존하며 누락된 learner 설정만 반영 → 동일 SHA의 실패한 Actions 재실행 → 운영 SHA·퇴역 경로·음악 화면 검증.

기존 관리자 전용 토큰이나 대화형 계정 토큰을 학습자 CI 자격으로 대체하지 않는다. 인증·브랜치 보호 조건을 완화하지 않는다. VM·서버리스 구성은 이번 배포 범위에서 변경하지 않았다.
