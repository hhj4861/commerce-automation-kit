# 스튜디오 LLM 계정 연결

## 변경 범위

`LLM 추천`은 먼저 현재 로그인 사용자의 연결 상태를 조회한다. 미연결이면 Codex/Claude 안내 모달을 열고, Codex를 선택하면 공식 ChatGPT 기기 인증 URL과 코드를 표시한다. 인증 완료 후 기존 기획 입력으로 추천을 이어가며, 결과를 적용하기 전에는 입력을 바꾸지 않는다. `AI 계정 연결 관리`에서 연결 해제·재연결할 수 있다.

Codex는 공식 `codex app-server`의 `account/login/start` (`chatgptDeviceCode`), `account/login/completed`, `account/read`를 사용한다. 실제 추천은 같은 격리된 계정으로 공식 `codex exec`를 실행한다. 최근 검색 수행 여부와 출처를 검증하는 기존 추천 규칙을 유지한다. 대본·이미지 생성이나 발행의 기존 사람 검수 게이트는 변경하지 않는다.

Claude 구독 OAuth 토큰 수집·저장은 구현하지 않았다. 공식 문서는 타사 앱의 Claude.ai 로그인 제공 및 구독 토큰 중개를 제한한다. 원본 Claude Code를 호스팅하는 허용 경로와 이 앱의 토큰 중개 방식은 구분한다. Claude 카드는 제한과 공식 문서 링크를 표시하며 연결된 것처럼 보이지 않는다. 공식 API 키 연결은 후속 선택지이며 현재 구현 범위에 포함하지 않는다.

- [Codex app-server 공식 문서](https://learn.chatgpt.com/docs/app-server)
- [Anthropic 인증·자격증명 정책](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use)

## 저장·실행 경계

- Pages 및 로컬 서버는 검증된 Google `sub`를 해시해 사용자 키를 만든다. 기존 관리자 토큰 로그인은 별도의 `legacy-operator` 계정이다. 요청 본문으로 계정 소유자를 선택할 수 없다. 기존 운영자의 전역 Codex 인증을 새 사용자에게 복사하지 않는다.
- `credential_vault`의 `llm/account/<hash>`에 OAuth 자격증명, 연결 작업, 기획 입력과 결과를 AES-GCM으로 암호화해 저장한다. 암호화 키는 기존 Cloudflare Secrets Store `VAULT_KEY` 바인딩을 사용한다. 새 비밀키나 DB 테이블은 필요 없다.
- Pages는 내부 `CREDENTIALS.llmAccount` RPC만 호출한다. 로컬 서버·실행기는 기존 Ed25519 runner JWT로 `/runner/account-action`, `/runner/accounts`를 호출한다. 브라우저에는 allowlist로 선택한 연결 상태·계정 표시·기기 인증 코드·추천 결과만 반환한다. OAuth access/refresh token, 실행기 키는 반환하지 않는다.
- 실행기는 최대 4개 작업을 동시에 처리한다. D1 revision CAS로 작업을 한 번만 점유하고 10초마다 60초 임대를 갱신한다. 취소·연결 해제는 이전 작업의 후속 저장을 무효화한다. 만료·중단된 작업은 자동 재실행하지 않고 실패로 표시한다. 연결 제한 10분, 추천 제한 4분이며 실제 생성 실행 제한은 3분이다.
- 실행 중 임시 HOME/CODEX_HOME만 사용하며 운영자 홈의 인증·MCP 설정을 상속하지 않는다. 개인 계정 파일은 제한된 임시 디렉터리에 생성하고 종료 후 삭제한다. 공식 CLI가 갱신한 자격증명은 성공·생성 실패 시 모두 중앙 저장소에 반영한다.
- 중앙 저장 실패로 갱신된 인증정보를 잃을 수 있는 경우 비공개 임시 캐시를 보존하고 경로만 서버 로그에 남긴다. 자동 재사용·덮어쓰기는 하지 않는다. 운영자는 중앙 저장 복구 후 사용자의 재연결 여부와 해당 작업 소유권을 확인하고 캐시를 안전하게 정리해야 한다. 명시적인 취소/연결 해제로 무효화된 캐시는 삭제한다.

## 실행과 배포

변경된 broker와 Pages를 함께 배포하고, 변경된 제작 워커를 실행해야 한다. 정적 Pages만으로 공식 CLI를 실행할 수는 없다. 실행기는 Mac뿐 아니라 공식 Codex CLI를 설치한 서버에서 사용할 수 있으며, 기존 Cloudflare runner 서명키 접근이 필요하다. 실행기에는 사용자 개인 홈 로그인을 준비할 필요가 없다.

기존 `npm run worker -w @cak/app-shopshorts`는 LLM 작업도 처리한다. LLM 작업만 별도 프로세스로 처리하려면:

```sh
CAK_RUNNER_KEY_FILE=/secure/path/credential-runner.jwk \
  npm run llm:worker -w @cak/app-shopshorts
```

사용자 로그인은 운영 도메인의 Google 세션을 사용하고, Codex 승인은 모달의 공식 ChatGPT 링크에서 사용자가 직접 완료한다. 개인 기기 인증이 계정 정책상 비활성화된 경우 제공사 설정을 확인해야 한다. 토큰을 채팅이나 입력창에 붙여넣지 않는다.

이 문서와 구현은 작업 브랜치 산출물이다. 검증 과정은 로컬 격리 서버와 dry-run 빌드를 사용했으며, 이 기능의 운영 배포나 PR 머지가 완료됐다는 뜻이 아니다.

## 검증

2026-09-20:

- 앱 및 credential-broker 테스트 127개 통과. 사용자 격리·암호화·CSRF·본문 크기 제한·CAS 취소 경합·복수 실행기 점유·갱신 보존을 포함한다.
- Chrome의 실제 로컬 HTTP → API → 암호화 SQLite → 실행기 → 화면 흐름 검증. OAuth 공급자 응답과 생성 결과만 fixture이며 실제 사용자 구독 승인/LLM 생성 성공으로 간주하지 않는다.
- 공식 설치 CLI의 빈 계정 `account/read`, 실제 기기 인증 URL/코드 발급 확인 후 취소. 사용자 access/refresh token 발급까지는 검증하지 않았다.
- Cloudflare Pages Functions 빌드 및 credential-broker Workers dry-run 빌드 통과.

재현:

```sh
node --test apps/shopshorts/test/*.test.mjs apps/credential-broker/test/*.test.mjs
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  node apps/shopshorts/test/llm-account-browser.mjs
```
