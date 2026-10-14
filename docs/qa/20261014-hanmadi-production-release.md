# Hanmadi 운영 배포 — 2026-10-14

## 최종 결과 (2026-10-14, 07:50 UTC 이후 직접 확인)

**학습자와 관리자 모두 승인된 새 버전으로 운영 배포 완료**다. 학습자 Actions 38526398064 attempt 2는 07:49:57 UTC 성공으로 끝났고, 실제 운영 `/api/deployment`가 `fdc272b317b1306d3731e000f0174dc7c9f1957e`를 반환했다. 관리자 운영은 앞서 확인한 `9f2b77a8f7ac98913c1a1d24ebc3e5405c555e2d`다.

- 실제 공개 화면: [학습자](https://hanmadi-lake.vercel.app/study), [관리자](https://hanmadi-admin.vercel.app/admin-login).
- 학습자 `/study`, `/privacy`, Google 준비 API 200 및 정확한 client ID, 비로그인 admin API 403 확인.
- 퇴역 `/api/model-connections`는 410과 기본 Gemini 사용 안내를 반환한다.
- 영어·일본어·태국어·스페인어 연습곡 파일 모두 Range 요청에 206 / audio/mpeg / 정확한 64바이트를 반환했다.
- 실제 로그인된 학습자 브라우저에서 일본어 음악 탭의 자체 연습곡, 가사·뜻·따라 부르기·단어/회화 연습 및 복습 안내를 확인했다. MP3 재생 중 currentTime 9.907초 / duration 32.026초 / readyState 4 / error 없음 확인 후 일시정지했다. 학습 완료 표시·개인 단어 저장은 실행하지 않았다.
- 캡처: 사용자 지정 iCloud 작업 폴더 `commerce-automation-kit/hanmadi-retired-integrations-20261014/production-music-ja.jpg`. 브라우저 도구의 직접 iCloud 쓰기 제한으로 작은 전달용 파일을 만든 뒤 승인된 파일 도구로 즉시 지정 위치로 옮겼다. 전달용 사본은 남기지 않았다.
- 이번 운영 검증은 신규 유료 AI 호출, 네 언어 전체 학습 완료 E2E, 별도 튜터 PIN 화면 (c)을 재검증했다는 뜻이 아니다. 기존 로컬 E2E 증적과 이번 운영 배포·화면 검증을 구분한다.

## 초기 결과 (07:20 UTC 확인, 이후 위 결과로 해결)

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

## 최초 학습자 실패 원인과 승인 후 해결

07:08:39 UTC 학습자 Actions가 Cloudflare `/github/secrets`에서 403으로 종료됐다. 앱 업로드·빌드 전 실패다. 이후 공식 API로 비밀값 없이 운영 설정과 Secrets Store 메타데이터를 확인했다.

1. `GITHUB_DEPLOY_ALLOWED_REFS`에는 admin·Shopshorts만 있고 `refs/heads/deploy/hanmadi`가 없다.
2. `SS_DEPLOY_VERCEL_TOKEN` 바인딩이 없다.
3. Secrets Store 전체 27개 메타데이터에 `CAK_DEPLOY_VERCEL_TOKEN`이 없다. 관리자·Replay 전용 배포 자격은 존재한다.
4. 운영 Worker 코드는 learner ref 및 보호된 브랜치 검증을 지원한다. 저장소 `e5848e7:apps/credential-broker/wrangler.json`에는 필요한 learner ref·binding이 이미 정의돼 있다. 당시에는 설정을 복구하기 전이었다.

기존 Wrangler 세션은 처음 메타데이터 조회 시 401이었고, 공식 `whoami`로 같은 계정의 토큰을 정상 갱신한 뒤 조회했다. 새 로그인·권한 확대는 하지 않았다.

초기 점검에서는 Vercel 생성 화면에 `cak-hanmadi-learner-gitops`, 범위 `hanmadi` 프로젝트만, 유효기간 90일을 준비하고 발급 직전 사용자 승인을 요청했다. 이후 사용자의 **“응”** 답변으로 발급·Cloudflare 보관·보호된 GitHub Actions 연결을 승인받았다.

승인 후 학습자 전용 토큰 1개를 발급했다(만료 2027-01-12). `CAK_DEPLOY_VERCEL_TOKEN`을 Cloudflare `cak-secrets`에 등록했고 전체 28개 목록에서 해당 항목의 `active`, scope `workers`를 확인했다. 토큰은 브라우저·일회성 loopback 서버 메모리로만 처리했으며 파일·로그·Git에 저장하지 않았다. 입력창 출처 검사 실패와 브라우저 연결 오류를 해결했으며, 등록 후 검증기의 첫 페이지 조회 때문에 한 번 실패로 표시됐으나 전체 페이지 조회에서 정상 등록을 확인했다. 중복 발급·덮어쓰기는 하지 않았다.

운영 broker 설정만 PATCH해 `SS_DEPLOY_VERCEL_TOKEN` 바인딩과 `refs/heads/deploy/hanmadi`를 추가했다. 현재 설정을 읽어 나머지 35개 바인딩을 보존하고 적용 후 총 36개를 대조했다. Worker 코드·다른 플랫폼 자격은 변경하지 않았다. 보호된 학습자 배포 브랜치가 `fdc272b…`로 유지됨을 확인한 뒤 Actions 38526398064의 실패 job만 재실행했다(attempt 2). 이 재실행에서 Cloudflare 자격 조회·앱 테스트·Vercel 빌드·운영 확인 모두 성공했다. 원격 로그의 Ready 시각은 07:49:53 UTC, job 완료는 07:49:57 UTC다.

기존 관리자 전용 토큰이나 대화형 계정 토큰을 학습자 CI 자격으로 대체하지 않는다. 인증·브랜치 보호 조건을 완화하지 않는다. VM·서버리스 구성은 이번 배포 범위에서 변경하지 않았다.
