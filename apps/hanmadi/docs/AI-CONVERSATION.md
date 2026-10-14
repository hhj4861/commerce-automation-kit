# Hanmadi 회화 연결 — LiteLLM

`/learn` → `/conversation` → `/api/conversation` → 공용 LiteLLM의 Hanmadi 모델 별칭.
`/study`의 영어·일본어·태국어·스페인어 역할극도 LiteLLM을 사용한다.
음성은 `/api/conversation/transcribe`·`speech` → LiteLLM 경로를 유지한다.

## 서버 설정

서버 전용 `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL`이 필요하다.
음성에는 `LITELLM_STT_MODEL`, `LITELLM_TTS_MODEL`, `LITELLM_TTS_VOICE`를 추가한다.
실제 값은 비공개 `.env.local` 또는 배포 환경변수에 두고 `NEXT_PUBLIC_`를 붙이지 않는다.

Dify와 accounts v1은 퇴역했다. `CONVERSATION_PROVIDER=litellm` 또는 공급자 설정이 없는 환경을 사용한다.
`CONVERSATION_PROVIDER=dify`/알 수 없는 값은 503이다. 공급자 미지정 상태에서 `DIFY_*`가 남아 있어도
503으로 거부하므로 배포 시 옛 설정을 제거한다. 암묵적으로 다른 공급자로 전환하지 않는다.
`AI_ACCOUNTS_*`는 더 이상 앱이 읽지 않는다. accounts v2/BYOK를 활성화하는 변경이 아니다.

## 인증·대화·기록

- 교실 회화는 기존 튜터 로그인 또는 유효한 비공개 학생 링크가 필요하다. 학습자 스터디 로그인은 별도다.
- 서버가 언어·수업·학습 프로필의 난이도를 확인하고 시스템 지시와 현재 대화 이력을 LiteLLM으로 전달한다.
  튜터 이름·학생 링크·학습 revision을 모델 요청의 식별자로 전달하지 않는다.
- 대화와 입력은 같은 탭의 sessionStorage에서 최대 24시간 이어 볼 수 있다. 새 대화는 탭의 대화만 비우고 학습 진도는 유지한다.
  앱은 전체 대화 본문을 서버 저장소에 보관하지 않는다. 공급자 측 기록 정책과는 별개다.
- 옛 Dify `conversationId`를 가진 요청은 409이며 해당 ID가 있는 임시 대화는 재사용하지 않는다.
  기존 LiteLLM 대화 이력과 미전송 입력은 새로고침 뒤에도 유지된다.
- 기본 Gemini만 선택할 수 있다. 옛 개인 모델 선택값은 409로 거부하며 기본 모델로 몰래 전환하지 않는다.
- 캐시된 화면의 `/api/model-connections` 요청은 410이다. 연결·승인·해제 요청의 키/코드를 읽거나 외부로 전달하지 않는다.
  변경 요청의 same-origin 검사는 유지한다.
- 음성 입문 연습은 매 시도 하나의 전사와 서버 지시만 전송한다. 옛 저장 동의 체크박스는 제거했다.
- 대화는 AI 제공업체로 전송됨을 안내한다. 실패는 명시적으로 반환하며 다른 공급자로 재시도하지 않는다.

## 검증

```sh
cd apps/hanmadi
npm ci --workspaces=false
npm test
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit
npm run test:language-flow
npm run test:v2
```

`test:language-flow`는 실제 브라우저 → Next API → 모의 LiteLLM을 검사한다.
한국어·일본어·태국어 교실, 튜터/학생 접근, 난이도·대화 이력·전사·음성 응답·학습 기록을 포함한다.
`test:v2`는 스터디 4언어와 퇴역 API의 무호출 차단, 기본 AI 설정 화면을 확인한다.
실제 `.env`, `.data`, `.litellm`을 복사하지 않으며 외부 모델의 교수 품질이나 운영 PIN 로그인 검증을 대신하지 않는다.
Dify·accounts v1의 별도 스모크와 워크플로는 퇴역했다.

현재 정리의 검증·반영 상태: [2026-10-14 QA](../../../docs/qa/20261014-hanmadi-retired-integrations.md).
