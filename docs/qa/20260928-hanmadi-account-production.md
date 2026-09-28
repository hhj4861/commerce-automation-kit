# Hanmadi 개인 모델 연결 — 운영 적용 기록

검증일: 2026-09-28. 사용자가 PR #55·#56 머지와 운영 배포를 승인했다.

## 적용 완료

- PR #55 MERGED: `d21d2729fdbf7e25598c664cf26c969d85e5b249`.
- PR #56 MERGED: `e978ba317361d90f9f84e96f32534d022ce00ecb`.
- PR #56 구현 최종 커밋 `baff7aa2710819a8ae7cfd5c6124a37826b3f48e`의 CI 5개 모두 성공. main의 Hanmadi/계정 서버/edge 소스가 검증한 PR 소스와 같은지 확인했다.
- 개인 GCP `replay-live-508202`, `shared-ai`, `us-central1-a`에 신규 계정 서비스 배포.
- 릴리스: `/opt/shared-ai/releases/accounts-e978ba3`. 머지한 Git archive의 계정 서비스·워커·Compose·subscription runtime·Caddyfile 5개만 전송했다.
- Compose 프로젝트 `shared-ai-accounts`, 컨테이너 `shared-ai-accounts-accounts-1`, persistent volume `shared-ai-accounts_accounts-data`. loopback 4190만 게시한다. 실행 상태 running, 재시작 횟수 0을 확인했다.
- 고정 이미지의 LiteLLM 1.102.1 및 FastAPI/cryptography import 검증 완료.
- 비공개 설정은 `/opt/shared-ai/accounts/.env.accounts`, 사용자 구분용 비밀은 `/opt/shared-ai/accounts/hanmadi-subject-secret`. 0700 디렉터리/0600 파일이며 기존 파일이 있으면 회전하지 않는다. 개인 OAuth 토큰을 개발 PC에서 복사하지 않았다.
- 기존 edge Caddy 설정 백업: `/opt/shared-ai/backups/20260928-accounts-56/Caddyfile.pre`. 새 Caddy 설정 validate 성공 후 edge만 재생성했다. 기존 Dify·LiteLLM 컨테이너와 공급자 설정은 변경하지 않았다.

공개 계정 API: `https://shared-ai-d5cy7m6i7q-uc.a.run.app/accounts`.

## 실제 서버 검증

- 내부·공개 HTTPS에서 인증된 계정 목록 GET 200, 미인증 GET 401.
- 테스트 전용 사용자 식별자로 실제 Codex 기기 인증 시작 202 → 공식 로그인 challenge 수신. 코드는 로그나 문서에 기록하지 않았으며 계정 소유자의 로그인 승인은 수행하지 않았다.
- 다른 사용자 목록에 연결이 나타나지 않고, 다른 사용자 연결 삭제는 404.
- 테스트 연결 취소 DELETE 200, 이후 목록이 빈 배열인 것을 확인했다. 대기 로그인 작업 종료 및 자격 삭제 경로를 사용했다.
- SSH/검증 명령은 모두 최종 exit 0까지 확인했다.

운영 모델 allowlist: Codex `gpt-5.5`, `gpt-6-astra`; Claude `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`. Codex 목록은 로컬 Codex 모델 카탈로그, Claude ID는 공식 [모델 문서](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions)로 확인했다. 실제 계정 entitlement·각 모델 실응답은 아직 검증하지 않았다. 연결 완료는 사용자의 새 로그인 및 probe 성공이 필요하다.

## Hanmadi Vercel Production 적용 완료

운영 사이트: https://hanmadi-lake.vercel.app . 기존 `dpl_FxE9Dp3Rbz3p7m4Adsp6oCbXMNwT`에서 새 `dpl_8kQ9PBZQZ8UzWGyz9n8aynirSYK6`으로 배포했다. 고정 주소는 https://hanmadi-cxs7wyg0q-dean-10.vercel.app 이다. 배포 명령 exit 0, Next.js 빌드·타입 검사 성공, production alias 적용 및 별도 inspect의 READY를 확인했다.

- 소스: main 머지 커밋 `e978ba317361d90f9f84e96f32534d022ce00ecb`의 Git archive `/private/tmp/hanmadi-release-e978ba3/apps/hanmadi`. 다른 작업의 변경이나 로컬 `.env`를 배포 소스에 넣지 않았다.
- 목적지: `dean-10/hanmadi`, project `prj_xJ5tTXyMYNV6qL1fVnWxFBuIRoRf`, Production 한정.
- 등록: `AI_ACCOUNTS_URL`, 한마디 전용 `AI_ACCOUNTS_KEY`, `AI_ACCOUNTS_SUBJECT_SECRET`. 세 항목 모두 Production Hidden Secret으로 등록된 것을 별도 `vercel env ls`로 확인했다.
- 처음에는 자동 승인 검토가 구체적 승인을 요구했다. 사용자가 세 항목의 Vercel Production 등록을 명시적으로 승인한 뒤 실행했다.
- SSH stdout을 프로그램 메모리에서 받아 Vercel CLI stdin으로 전달했다. 비밀값을 로그·Git·로컬 비밀 파일에 기록하지 않았다. 계정 DB의 암호화 키 `ACCOUNT_ENCRYPTION_KEY`와 개인 OAuth 토큰은 전송하지 않았다.
- 등록 명령 도중 사용자가 턴을 중단했으므로 최초 등록 프로세스의 원래 종료 코드는 수집하지 못했다. 대신 재개 후 독립 조회에서 세 변수 등록을 확인했고, 아래 운영 API 실호출로 값의 연결도 검증했다. 배포 명령의 종료 코드는 실제로 확인했다.

Vercel은 기존 Hanmadi의 Next.js 웹·API 배포 위치를 유지하기 위해 사용했다. 공용 LiteLLM·Dify·계정 서비스는 GCP에 독립적으로 있으며, 다른 플랫폼에서도 API로 사용할 수 있다.

## 실제 운영 브라우저 검증

실제 Production URL과 정상 PIN 로그인으로 수행했다. 테스트 전용 학습자만 생성했으며, 각 실행의 finally에서 모두 삭제(200, ok true)하고 로그아웃(200)했다. 실제 계정의 기존 연결은 수정하지 않았다.

| 경로 | 확인 결과 |
|---|---|
| 로그인 → 계정 목록 | 로그인 성공, `/api/model-connections` GET 200, 기존 연결 없음 |
| 일본어·태국어 언어 선택 → 처음 말하기 | 프로필 저장 200, 쓰기 입력 없이 듣기로 시작, 기본 AI `default` Gemini |
| 일본어 표현 듣기 | speech POST 200; 브라우저 audio blob 12,582 bytes, 0.72초, 재생 오류 없음 |
| 태국어 표현 듣기 | speech POST 200; 브라우저 audio blob 13,836 bytes, 0.8초, 재생 오류 없음 |
| 일본어 자유 회화 | conversation POST 200; 일본어 답변·한국어 발음·한국어 설명, Dify conversation ID 수신 |
| 태국어 자유 회화 | conversation POST 200; 태국어 답변·한국어 발음·한국어 설명, Dify conversation ID 수신 |
| Codex 연결 UI | 동의 → POST 202 → 실제 공식 기기 인증 링크/코드 표시. 인증 URL은 `https://auth.openai.com/codex/device`. 대기 중 Gemini 유지 |
| Codex 취소 UI | DELETE 200 → 로그인 링크 사라짐 → 별도 로그인 세션에서도 계정 목록이 빈 배열인 것을 확인 |
| Claude 입력 | API 키 입력은 password 타입. 구독 로그인이 아닌 API 키 연결임을 안내 |
| 화면·상태 | 390/1280px에서 가로 넘침 없음, 계정 오류 표시 없음, 새로고침 후 기본 Gemini 유지, 마지막 통합 실행에서 브라우저 예외 없음 |

검증 중 테스트 코드의 두 가정은 수정했다. 첫 실행은 Playwright response.body()가 0 bytes를 반환해 실패했지만 실제 브라우저의 audio blob과 재생 길이는 정상이었다. 브라우저 재생 데이터로 재검증했다. 두 번째 실행은 모든 `role=alert` 요소를 오류로 간주해 실패했지만 해당 요소는 빈 Next.js 접근성 route announcer였다. 실제 계정 영역의 오류 표시로 범위를 좁혀 재검증했다. 이 두 실패 때문에 제품 코드를 변경하지 않았으며, 마지막 검증 프로세스는 exit 0이었다.

## 남은 사용자 인증 및 검증 범위

- Codex 기기 인증 시작·취소까지만 검증했다. 사용자 본인의 공식 로그인 승인과 연결 probe가 끝나야 개인 모델 선택 및 실제 회화가 가능하다. 로그인 코드·OAuth 토큰은 문서에 저장하지 않았다.
- Claude는 API 키 연결이다. Claude 구독 OAuth 연결은 제공하지 않으며, 실제 Claude 키를 입력하지 않았으므로 Claude 실응답은 미검증이다.
- 운영 모델 allowlist의 모든 모델 권한·실응답을 확인한 것은 아니다. 기본 Gemini의 일본어·태국어 실응답과 음성 재생은 확인했다.
