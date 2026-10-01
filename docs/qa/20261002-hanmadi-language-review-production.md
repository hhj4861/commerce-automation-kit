# Hanmadi Admin 언어 교차 검토 운영 배포 검증

2026-10-02 KST. 사용자 요청에 따라 JEV 평가와 제한된 언어 교차 검토 변경을 main에 머지하고, `deploy/hanmadi-admin` 승격 후 GitOps 운영 배포 및 실제 로그인 검증을 완료했다.

## 운영 반영

| 항목 | 확인 결과 |
| --- | --- |
| 운영 주소 | https://hanmadi-admin.vercel.app/study/admin |
| 구현 PR | [#119](https://github.com/hhj4861/commerce-automation-kit/pull/119), main 머지 완료 |
| main 머지 커밋 | `a634b4e137cc9eaaf7520ac59e233f93ba1325ee` |
| 운영 승격 PR | [#121](https://github.com/hhj4861/commerce-automation-kit/pull/121), `deploy/hanmadi-admin` 머지 완료 |
| 운영 커밋 | `2bda2c7e1431f33a4b6afd779ddf29c0f9cdd605` |
| 자동 배포 | [Platform deployment 실행](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36940993833), success |
| 배포 시간 | 2026-10-02 08:28:25~08:30:08 KST, 약 1분 43초 |
| 서비스 | Vercel `hanmadi-admin`, Next.js |

`GET /api/deployment`에서 `application=hanmadi-admin`과 위 운영 커밋의 `revision`을 확인했다. Hanmadi 사용자 앱과 LiteLLM 서버는 이번 배포 대상으로 변경하지 않았다.

## 통합 및 CI 검증

배포 준비 중 main에 들어온 AI 진단 기능을 함께 보존했다. `package.json`의 테스트 목록 충돌은 언어 교차 검토 테스트와 진단 테스트를 모두 유지하여 해결했다. 통합 후 로컬 테스트 185개가 모두 통과했다.

- #119 최종 head `752403f959fdf174d739395509b98099256c6531`: 필수 체크 5개 성공. [앱 빌드·브라우저·진단 검증](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36939896010).
- #121 승격 head `1b4607a25285dcb0ae4b0a76e281dbcc4bb74732`: 필수 체크 5개 성공. [앱 빌드·브라우저·진단 검증](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36940234538), [Dify 검증](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36940234604).
- 승격 시 앱·GitHub 워크플로·배포 설정 트리가 검증된 구현 브랜치와 동일함을 확인했다. 기존 운영 진단 기능을 제거하거나 이전 버전으로 되돌리지 않았다.

## 운영 브라우저 및 API 검증

2026-10-02 08:33:07 KST, 설치된 Chrome을 Playwright의 별도 임시 컨텍스트로 실행했다. 기존에 승인된 관리자 PIN은 메모리에서만 읽어 로그인에 사용했다.

| 검사 | 결과 |
| --- | --- |
| 로그인 페이지 | `/admin-login` 200 |
| 비로그인 관리자 API | `/api/study/admin` 403 |
| 관리자 서비스의 사용자 학습 API | `/api/study` 404 |
| 실제 PIN 입력 및 로그인 버튼 | 인증 응답 200, `/study/admin` 이동 |
| 로그인된 관리자 API | `/api/study/admin` 200 |
| 관리자 메뉴 | 영상 찾기·학습 관리·AI 진단 표시 확인 |
| 브라우저 페이지 오류 | 0건 |
| 로그아웃 | 인증 DELETE 200, 컨텍스트 종료 |

초기 두 번의 로컬 브라우저 실행은 기본 Playwright 브라우저 준비 문제로 로그인 전에 중단됐다. 설치된 Chrome 채널을 지정한 최종 검증은 통과했다. 이 초기 중단을 운영 서비스 장애로 집계하지 않는다.

Vercel CLI로 2026-10-02 08:28:22 KST 이후 production error 로그를 최대 20건 조회했다. 조회 명령은 exit 0이며 반환된 오류 레코드는 0건이었다. 이는 조회 시점과 범위의 결과이며, 장기 모니터링이나 Drains 설정 검증은 아니다.

## 적용 범위와 남은 품질 한계

새 영상 분석은 `hanmadi-video-jev-v7` 기준을 사용한다. JEV의 관련성·신규성 검사를 통과했지만 언어 검사가 불확실한 후보에만 영상당 한 번의 제한된 LLM 교차 검토를 수행한다. 확실한 실패·정확히 같은 자료는 구제하지 않으며, 검토 오류나 불확실성은 검토 대기로 남긴다. 원래 JEV 결과와 별도 언어 검토 근거를 함께 보존한다.

기존 저장 초안을 자동 재평가하거나 게시하지 않는다. 사람의 검수·게시 단계와 파인튜닝 게이트도 유지된다. 이번 배포 검증에서 새 유료 모델 호출, 자료 생성·게시·학습, 키 변경은 실행하지 않았다.

앞선 품질 평가에서는 정상 표현 14개 중 2개가 채택되고 12개가 검토 대기로 남았다. 따라서 정상 표현의 자동 채택 문제가 모두 해결됐다는 의미는 아니다. 36개 고정 평가 자료의 엄격한 정답 라벨 기준 오채택 1건도 유지하여 기록한다. 해당 건은 먼저 나온 유사 후보가 검토 대기여서 채택 자료 중복으로 처리되지 않은 사례다. 자세한 평가와 해석은 구현 PR의 `docs/qa/20261002-hanmadi-language-review.md`에 있다.

## 재현 근거 저장 위치

비밀정보를 제외한 실행 증적:

`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/hanmadi-admin/jev-language-release-20261002/`

- `integration-unit.log`: 통합 테스트 185개 성공.
- `production-verification.json`: 최종 운영 검증 성공, 운영 revision 및 HTTP 상태.
- `production-verification-attempt-1.json`, `production-verification-attempt-2.json`: 초기 로컬 브라우저 실행 실패 기록.
- `runtime-error-scan.json`: 오류 로그 조회 요약.
- `verify-production.mjs`: 검증 절차. PIN 값·쿠키·원문 사용자 데이터는 기록하지 않았다.

이 문서는 프로젝트 checkout의 배포 검증 기록이다. 실행 증적의 iCloud 동기화 완료 여부는 별도로 확인하지 않았다.
