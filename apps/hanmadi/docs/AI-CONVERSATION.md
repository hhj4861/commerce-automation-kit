# Hanmadi Study — Dify 회화 연결

`/learn` → `/conversation` → 서버 `/api/conversation` → Dify hanmadi chatflow → LiteLLM.
음성은 기존 `/api/conversation/transcribe`·`speech` → LiteLLM 경로를 그대로 사용한다.
이 연결 구현은 기존 다국어·음성 회화 PR #31에 포함된다. 운영 사이트 적용과 PR 병합은 별도다.

## 서버 설정

먼저 [공용 Dify 구성](../../../services/dify/README.md)의 한마디 DSL을 가져오고 게시한다.
아래의 앱 키는 Dify의 **hanmadi 앱 → API Access**에서 발급한다.
LiteLLM 가상 키나 관리자 키를 `DIFY_API_KEY`로 쓰지 않는다.

```dotenv
CONVERSATION_PROVIDER=dify
DIFY_BASE_URL=https://your-dify-host.example/v1
DIFY_API_KEY=app-your-hanmadi-app-key
DIFY_USER_SECRET=your-independent-random-secret-at-least-32-characters
```

실제 값은 앱의 비공개 `.env.local` 또는 배포 플랫폼의 서버 환경변수에 설정한다.
`NEXT_PUBLIC_` 접두사를 붙이지 않는다. 로컬 Dify는 `http://localhost:4180/v1`을 쓸 수 있다.
외부 주소는 HTTPS만 허용한다. `DIFY_USER_SECRET`은 예를 들어 `openssl rand -hex 32`로 생성하고
비밀관리 시스템에 보관한다. 이 값을 바꾸면 기존 대화의 사용자 식별자가 바뀌므로 기존 대화 연결이 끊긴다.
주소·앱 키 일부만 설정되면 오류를 표시하며 다른 모델로 조용히 우회하지 않는다.

`CONVERSATION_PROVIDER=litellm`은 기존 직접 회화 경로다.
공급자 미지정 시 Dify 주소/키가 하나라도 있으면 Dify, 둘 다 없으면 기존 LiteLLM을 사용한다.
음성에는 여전히 `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_STT_MODEL`,
`LITELLM_TTS_MODEL`, `LITELLM_TTS_VOICE`가 필요하다. 텍스트를 Dify로 설정한 경우
`LITELLM_MODEL`은 필요 없다. 음성 모델 설정이 없으면 텍스트만 사용할 수 있다.

## 인증·대화·기록

- 기존 튜터 로그인 또는 유효한 비공개 학생 링크가 있어야 회화 API를 호출할 수 있다.
- 서버가 인증된 사용자와 선택한 언어·수업·수준으로 불투명한 Dify `user` 값을 만든다.
  클라이언트가 보낸 `user` 값, 튜터 이름, 학생 링크 자체를 Dify 사용자로 전달하지 않는다.
- 첫 응답의 `conversation_id`로 다음 대화를 이어간다. 다른 사용자·다른 수업의 ID는 사용할 수 없다.
  새 대화 버튼은 연결 ID도 초기화한다. 대화 ID와 메시지는 브라우저 영구 저장소에 보관하지 않는다.
- Dify에는 현재 입력만 보내고, 이전 문맥은 Dify가 관리한다. 자동 제목 생성은 꺼 추가 모델 호출을 줄인다.
- Dify는 **대화와 실행 기록을 저장**한다. 화면에 저장 사실을 안내하고 동의를 받아야 첫 메시지를 보낼 수 있다.
  API도 동의 필드를 확인한다. 체크박스는 법적 동의 적합성의 보증이나 감사용 동의 원장은 아니다.
- 화면 새로고침/새 대화는 Dify 기록 삭제가 아니다. 운영자는 Dify 기록·DB·백업의 보관 기간과 삭제 절차를
  정하고 튜터를 통한 삭제 요청을 처리해야 한다. 이 구현은 장기 기억·자동 학습이나 자동 삭제 기능을 켜지 않는다.
- 서버 타임아웃은 30초다. 실패를 자동 재전송하지 않고 사용자가 재시도 여부를 정한다.
  타임아웃 전에 Dify가 처리했을 수 있으므로 실패가 항상 미저장을 의미하지 않는다.

## 검증

```sh
cd apps/hanmadi
npm ci --prefix . --workspaces=false
npm test
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit
npm run test:dify
```

`test:dify`는 임시 디렉터리에 한마디를 복사해 실행한다. 실제 `.env`, `.data`, `.litellm`은 복사하지 않는다.
기본은 로컬 모의 Dify/음성 공급자이며 테스트 완료 후 임시 서버와 데이터는 제거한다.
브라우저 확인을 위해 유지하려면 `npm run test:dify -- --serve`를 쓰고 종료 시 Ctrl+C를 누른다.
ffmpeg와 비어 있는 3188/4197/4198 포트가 필요하다.

CI `Hanmadi Dify connection`은 실제 Dify/LiteLLM/PostgreSQL과 한마디 Next.js 서버를 사용한다.
최종 LLM 응답과 STT/TTS는 합성 테스트 공급자다. 세 언어, 대화 이어가기/새 대화,
사용자·수업 경계, 저장 동의, 튜터/학생 접근, 음성 전사 → 회화 → 음성 응답을 검사한다.
CI 앱 키는 비공개 임시 JSON 파일로만 전달하며 로그나 artifact에 올리지 않는다.
실제 모델의 교수 품질·실제 마이크/스피커·운영 서버 연결은 별도 검증 대상이다.

2026-09-27 검증: 단위 테스트 15개, 타입 검사, 프로덕션 빌드와
[실제 Dify/LiteLLM 통합 CI](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36282994191)가 통과했다.
로컬 Chrome에서 합성 데이터로 저장 동의 전 전송 차단, 일본어 예문 전송,
응답·음성 플레이어 표시 및 새 대화 초기화를 확인했다. 운영 Dify 서버와 실제 모델 연결은 아직 미설정이다.

공식 근거: [Chatflow API](https://docs.dify.ai/en/api-reference/guides/chatflow),
[사용자 식별](https://docs.dify.ai/en/api-reference/guides/end-user-identity),
[회화 요청](https://docs.dify.ai/en/api-reference/chat-messages/send-chat-message).
