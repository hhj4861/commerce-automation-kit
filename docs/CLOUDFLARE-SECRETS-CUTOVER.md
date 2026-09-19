# Cloudflare 인증정보 운영 전환 — 2026-09-19

## 실제 적용

- 운영 URL: https://shopshorts-dash.pages.dev — 사용자 승인 후 현재 스튜디오 브랜치 배포.
- Pages는 `CREDENTIALS` 서비스 바인딩으로 중앙 시크릿을 조회한다. Pages의
  `SHOPSHORTS_TOKEN`, `WP_AUTO_BLOG_GITHUB_TOKEN` 중복 값은 삭제했다.
- Secrets Store `cak-secrets`: 애플리케이션 값 19개와 별도 암호화 키 1개.
  블로그 토큰과 알림 큐 토큰도 원본과 일치하는지 메모리에서 비교했다.
- Codex 인증, YouTube 토큰, YouTube 클라이언트 JSON은 D1에 암호화 저장한다.
  임시 `migration/pages` 레코드를 삭제했고 이전 허용 설정도 제거했다.
- D1 `0005_studio.sql` 적용. 기존 운영 잡 6개를 유지했다.
- 로컬 5198 서버와 운영 큐 워커는 하나의 중앙 시크릿 실행기에서 가동한다.
  로컬 프로젝트 4개, 기존 알림 DB·큐 설정을 그대로 유지했다.
- 운영 검증 중 `/login`이 자신으로 308을 반복하는 현상을 확인했다.
  Pages의 기본 HTML 정규화와 중복된 `/login`, `/studio` rewrite를 제거했다.
  근거: [Cloudflare 경로 처리](https://developers.cloudflare.com/pages/configuration/serving-pages/).

## 검증과 한계

- 중앙 키 조회 19개, 이전된 블로그 토큰의 GitHub workflow 읽기 HTTP 200.
- 운영 스튜디오 설정·프로젝트·잡·블로그 요청 조회 HTTP 200.
- 로컬 실행기와 운영 스튜디오 워커의 heartbeat 확인. 이는 공급자 생성 성공을 뜻하지 않는다.
- 비로그인 방문은 로그인 화면으로 이동하고, 관리자 인증 후 대시보드에 스튜디오 진입 링크가 표시된다.
- 실제 표시된 링크로 `/studio`에 진입하는 브라우저 검증 통과, 페이지 스크립트 오류 0개.
- 브로커·쇼츠 앱 회귀 테스트 119개 통과. 최초 샌드박스 실행의 소켓 EPERM은
  로컬 포트 권한을 부여한 재실행으로 해소했다.
- 유료 미디어 생성, 새 영상 업로드, 텔레그램 발송을 검증용으로 실행하지 않았다.
- 기존 로컬 `.env`와 원본 OAuth/큐 토큰 파일은 삭제하지 않았다. 중앙 실행 중에는
  관리 대상 키와 큐 토큰을 이 파일에서 대체 조회하지 않는다.
- 현재 실행기는 이 Mac의 프로세스다. 호스트 재부팅 자동 기동이나 별도 서버 이전은 미적용이다.

## 남은 운영 전환 조건

1. [PR #10](https://github.com/hhj4861/commerce-automation-kit/pull/10) 머지는 명시적 승인 대기.
   main의 예약 작업이 아직 이전 GitHub Secrets를 사용하므로 원본 10개를 유지한다.
   승인 후 main에서 키워드 `secrets_mode=verify, send_telegram=false`, TTS·음악
   `verify_secrets_only=true`를 검증하고 이전된 이름만 삭제한다.
2. 운영 Google 로그인 허용 이메일이 필요하다. `GOOGLE_AUTH_MODE=gis`와 운영 origin은
   적용했지만 공용 프로젝트에 임의 Google 계정을 허용하지 않는다. 이메일 설정 후
   Google OAuth 승인 origin 등록과 실제 계정 로그인을 검증해야 한다.
3. Pages의 LLM 추천은 아직 원격 Codex 실행기에 연결되지 않았다. 로컬 5198에서는 Codex를 사용한다.
   시나리오·이미지·영상의 기존 Gemini 키는 등록 사실과 공급자 인증 성공을 구분한다.
4. Claude 구독 인증은 통합하지 않았다. 지원되는 인증 방식이 필요한 별도 연동이다.

## 실행기 재시작

실행 중 작업이 없는지 먼저 확인하고 현재 wrapper를 정상 종료한다. OAuth lease가 하나이므로
서버와 워커를 별도 wrapper로 중복 실행하지 않는다. 저장소 루트에서:

```sh
SHOPSHORTS_PORT=5198 SHOPSHORTS_DATA_DIR=/private/tmp/shopshorts-studio-ui \
node apps/credential-broker/runner-bootstrap.mjs --input-type=module -e \
"await import('./apps/shopshorts/server.mjs'); await import('./apps/shopshorts/worker.mjs');"
```

로그 위치: `/private/tmp/shopshorts-studio-ui/server.log`.
알림 큐 신규 등록은 `node apps/credential-broker/admin.mjs register-queue <notification-queue.json>`.
원본 토큰 파일 내용은 출력하거나 Git에 넣지 않는다.

## 배포 기록

- 중앙 브로커: `b34316c4-0342-459a-890d-68958f9d5bbc` (이전 모드 종료, 큐 토큰 바인딩 포함).
- 운영 Pages: https://bbeff74e.shopshorts-dash.pages.dev (주소 루프 수정 포함).
- 전환 전 Pages: `db330cc3-32a7-4f79-89a5-40c4b023598a`.
  이전 배포는 중앙 연결 전 구성이므로 단순 롤백만으로 현재 시크릿 구성이 복구된다고 가정하지 않는다.
