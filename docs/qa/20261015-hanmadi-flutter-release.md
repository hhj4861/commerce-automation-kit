# Hanmadi Flutter 운영 승격 — 2026-10-15

- 목표: 검증한 Flutter 웹·앱 클라이언트를 main에 머지하고 deploy/hanmadi GitOps로 웹 운영 반영한다. 담당은 현재 Codex 세션이며 workers/Claude OFF다.
- 사용자 승인: “머지 및 운영배포도 해줘”로 PR #265 머지·배포 진행 승인. 전역의 PR별 명시 승인 규칙에 따라 새 운영 승격 PR #266의 승인은 별도 요청 중이다.
- 구현 검증: 실행 HEAD 6835f65의 Flutter 분석·11개 테스트, 실제 로컬 서버 브라우저 E2E, Android debug·iOS 무서명 release, 기존 전체 사용자 흐름·GitOps CI 모두 성공. 운영 모델 실호출과 실제 단말 검증은 아니다.
- [PR #265](https://github.com/hhj4861/commerce-automation-kit/pull/265): 2026-10-15 07:45:24 UTC main 머지 완료. merge revision `bf2bdfdc4f6dfa74003e0b4e606ba0da1fbd1973`.
- [PR #266](https://github.com/hhj4861/commerce-automation-kit/pull/266): main → deploy/hanmadi 승격 준비, GitOps 검사 성공, Flutter/전체 사용자 흐름 CI 진행 중. 아직 미머지·운영 미반영.
- 대상: Vercel hanmadi, https://hanmadi-lake.vercel.app/app/. 기존 /study 유지. 관리자 배포·앱스토어 배포·네이티브 인증 플래그 활성화·새 키 발급·유료 AI 호출은 이번 운영 승격에 포함하지 않는다.
- 배포 전 읽기 전용 확인: /api/deployment는 application=hanmadi, revision=566480da47b19f76a812fecc6ea3291c5567b719. /app/은 /login?from=%2Fapp으로 이동하므로 Flutter 운영 반영 완료로 보지 않는다.
- 다음: #266 명시 승인과 CI 통과 → 검증한 HEAD로 정상 머지 → Platform deployment 종료 확인 → 운영 revision, /app/ 정적 자산/화면, Google 준비 상태, 기존 /study·개인정보처리방침·관리자 API 차단 확인.
- 현재 결과: main 머지는 완료, 운영 배포는 승인 대기다. 실제 단말의 Google 로그인·마이크·앱 링크 복귀·서명 배포는 별도 미검증이다.
