# Hanmadi PR #51 운영 배포·검증 — 2026-09-28

사용자가 PR #51 머지 및 운영 배포 질문에 “응”으로 승인했다. 해당 PR만 머지했고 새로운 기능 변경은 추가하지 않았다.

## 실제 적용

- 운영 URL: https://hanmadi-lake.vercel.app
- 고정 배포 URL: https://hanmadi-gdaw0j2jo-dean-10.vercel.app
- 배포: `dpl_3YeHKRiJwmhZN9CHZHYmLRMNXLNq`, production / READY.
- PR: https://github.com/hhj4861/commerce-automation-kit/pull/51
- 머지 커밋: `dd934beaed9a76c3ed74732db9d3937056d604cf`.
- 검증·배포 소스: `8ea2a9b24ff43889975f0f9ac29b03d8642d2db0`. 배포 전후 앱 전체를 `origin/main`과 diff해 동일함을 확인했다.
- 고정 Vercel CLI 60.1.3 배포 exit 0, 별도 inspect exit 0. 원격 빌드 26초, READY와 운영 별칭 확인.
- 직전 운영 배포: `dpl_BXTRnLnVjBbkCaB5axp7WpcktQtf`.
- 최초 offline CLI 호출은 캐시 부재(ENOTCACHED)로 exit 1. 같은 고정 버전을 공식 npm에서 받아 승인된 배포를 수행했다.
- 운영 E2E 후 해당 배포의 최근 15분 error 로그 조회 exit 0, 반환 오류 항목 0건.
- main 병합 후 CI: https://github.com/hhj4861/commerce-automation-kit/actions/runs/36379592943 — 성공, 6분 28초. 브라우저 회귀, 실제 Dify·LiteLLM 컨테이너 연동 포함.

## 실제 운영 E2E

Chromium 390×844, Asia/Seoul 시간대. 정상 PIN 로그인 후 일반 학생 API로 생성한 독립 synthetic 학생 2개만 사용했다. 실제 튜터·학생의 진단이나 진도는 변경하지 않았다. 운영 API나 AI 응답을 모킹하지 않았다.

| 흐름 | 결과 |
| --- | --- |
| 로그인 → 언어 선택 | 통과, 새 로그인 UI 및 PIN 접근성 라벨 확인 |
| 태국어 6문제 → 입문 → 회화 2턴 → 피드백 → 계획 | 통과, 실제 태국어 원문 포함, 동일 conversation ID 유지 |
| 일본어 6문제 → 중급 연습 → 회화 2턴 → 피드백 → 계획 | 통과, 실제 일본어 원문 포함, 동일 conversation ID 유지 |
| 한국어 6문제 → 기초 → 회화 2턴 → 피드백 → 계획 | 통과, 실제 한국어 응답, 동일 conversation ID 유지 |
| 진단 중/진단 완료 후 새로고침 | 답 복구 및 저장된 결과에서 회화 재개 |
| 입력 중/회화 후 새로고침 | 입력·대화·자동 듣기 선택 복구 |
| 3개 언어 학습 시간 변경 | 하루 10분·주 3회로 저장, 기존 assessment ID·레벨·확정 상태 유지, 새로고침 후 확인 |
| 태국어 카페 주제 이동 → 새로고침 → 회화 → 수업 복귀 | 주제와 학생 범위 유지 |
| 한국어 확인 문제 | API 200, saved=true |
| 모바일·데스크톱 | 모바일 모든 언어 및 1280px 다크 모드에서 가로 넘침 없음 |
| 브라우저 오류 | 완료한 재검증의 pageerror 0건 |
| synthetic 학생 정리 | 두 학생 모두 삭제 API 200 / removed=true, 로그아웃·브라우저 종료 확인 |

첫 검사에서 태국어 전체 흐름은 통과했지만 일본어 음성의 Playwright `Response.body()`가 0바이트로 표시되어 검사를 중단했다(exit 1). 검증용 학생을 정리한 후 음성 경계를 분리해서 재검증했다.

- 짧은 일본어 문장을 실제 음성 API로 직접 요청: HTTP 200, `audio/mpeg`, MP3 ID3 헤더, **59,812 bytes**, 약 2.4초.
- 실제 AI 답변을 새로고침 후 “마지막 답변 다시 듣기”로 요청: 도구의 response body는 다시 0바이트로 표시됐지만, **UI가 만든 실제 audio Blob은 616,951 bytes**, 브라우저 디코딩 **38.48초 / readyState 4 / error null**이었다.
- 따라서 이 검사의 실패는 실제 오디오 유실을 입증하지 않았다. 브라우저의 실제 Blob과 디코딩을 기준으로 일본어 음성 재생을 확인했고, 일본어·한국어 나머지 흐름은 exit 0으로 완료했다. 앱·서버 음성 코드는 추가 변경하지 않았다.

운영 원문과 한글 발음 안내의 언어학적 정확성, 물리 휴대폰의 마이크/스피커 청음은 이 결과와 구분한다. 이번에는 실제 브라우저의 MP3 디코딩까지 검증했지만 사람이 들은 음질·발음 평가를 수행한 것은 아니다.

## 화면과 보관

- [운영 모바일 레벨 체크](assets/20260928-ux-production-assessment.png)
- [운영 모바일 학습 계획](assets/20260928-ux-production-plan.png)

두 이미지를 직접 열어 레벨 체크와 계획의 실제 운영 렌더링을 확인했다. 일반 학생 삭제는 학생과 퍼즐 진행을 정리하며 언어 학습 이벤트·Dify 대화를 전부 삭제하는 기능은 아니다. 테스트의 비개인 synthetic 이벤트·대화는 기존 서버 보관 정책을 따르며 삭제된 학생 링크는 사용할 수 없다.

Dify 모델·운영 인증정보·배포 환경변수는 변경하지 않았다. 지속 모니터링·drain 설정도 이번 작업에서 변경하거나 검증하지 않았다.
