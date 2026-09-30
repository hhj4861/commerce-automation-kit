# @cak/litellm-client

플랫폼의 기존 로그인은 유지하면서 LiteLLM 연결·모델 선택·호출을 재사용하는 **서버용** 모듈.
Node 20+ / Next.js 서버 / Cloudflare Workers의 표준 Fetch API를 사용한다. 외부 런타임 의존성 없음.

```ts
import { createLiteLLMClient } from '@cak/litellm-client';
const ai = createLiteLLMClient({
  baseUrl: env.LITELLM_BASE_URL,
  apiKey: env.LITELLM_API_KEY, // 앱 virtual key. 브라우저에 전달하지 않는다.
  model: env.LITELLM_MODEL,   // festa-travel 등 게이트웨이 별칭
});
const text = await ai.completeText({ messages, maxTokens: 700 });
const proposal = await ai.generateJSON({ messages, name: 'trip', schema });
```

- `normalizeConfig`: HTTPS, URL 자격/쿼리 차단, `/v1` 경로 정규화. localhost HTTP는 명시적 `allowLocalhost: true`일 때만.
- `completeText`, `generateJSON`, `listModels`, `transcribe`, `speech`: 같은 전송/오류 처리.
- 요청별 자격 격리. 리다이렉트·재시도·공급자 자동 대체 없음.
- `LiteLLMError.code/status`: 제공자 응답 본문을 노출하지 않는 고정 오류. 플랫폼이 사용자용 문구로 변환한다.
- JSON 객체 형식까지만 검사한다. 일정·학습 규칙과 JSON Schema 의미 검증은 호출 플랫폼 책임이다.
- `speech`는 Response 스트림을 반환한다. SDK timeout은 헤더까지, 이후 스트림 수명은 호출자 책임이다.

## 개인 연결의 공통 프로세스

```ts
import { createModelSession } from '@cak/litellm-client';
const ai = createModelSession({
  scope: { platformId: 'festa', subject: authenticatedUser.id },
  defaultRoute: { baseUrl, apiKey: applicationKey, model: 'festa-travel' },
  adapter: privateConnectionAdapter,
});
const choices = await ai.list();
await ai.connect('codex', 'subscription_oauth');
// adapter가 공식 인증 화면/device code를 전달하고 완료 상태를 저장한다.
await ai.refresh(connectionId);
await ai.client(connectionId).completeText({ messages });
await ai.disconnect(connectionId);
```

`ConnectionAdapter`는 기존 플랫폼의 검증된 서버 세션을 private storage와 제공자 인증 실행기에
연결하는 확장점이다. 모든 메서드는 `platformId + subject`를 받는다. 세부 계약은 `index.d.ts` 참조.
연결 상태·선택·만료/한도 오류·호출 전 재검사는 공통 모듈에서 수행한다.
서로 다른 플랫폼에서 사용자 ID가 같아도 연결을 공유하지 않는다. 브라우저에서 받은 사용자 ID를 신뢰하지 않는다.

**실제 OAuth/API 키 보관 어댑터와 연결 UI는 이 패키지에 포함되지 않는다.**
어댑터가 없으면 연결 실패로 응답한다. 실제 적용 시 계정/세션 검사, challenge 전달,
CSRF/state/PKCE, 암호화 저장·토큰 갱신·해제·사용량 검증을 서버 어댑터에서 연결해야 한다.
`resolve`는 소유자/상태를 원자적으로 재검사하고 해당 연결의 secret route를 반환한다.
이미 진행 중인 요청의 취소는 서버 실행기 책임이다.

지원 방법 계약: Codex `subscription_oauth`, Claude/OpenAI `api_key`.
이는 실제 계정 인증/모델 사용 가능성의 보증이 아니다. Claude 구독 토큰 중계는 지원하지 않는다.
API 키는 개인 구독과 별도 과금이다.
[Claude 공식 정책](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use),
[LiteLLM 공식 API](https://docs.litellm.ai/docs/proxy/user_keys).

## 배포와 다른 저장소에서 사용

전체 저장소를 빌드하는 앱: `file:../../packages/litellm-client` 의존성.
Hanmadi처럼 앱 폴더만 배포하거나 다른 저장소에 있는 앱: 패키지 tarball을 사용한다.
다른 저장소: 이 패키지에서 `npm pack`한 버전 고정 tarball 설치. 앱에서 소스를 복사해 수정하지 않는다.
현재 npm registry에는 게시하지 않았다. Festa의 `vendor/`에는 테스트한 패키지 tarball만 포함한다.

공급자·모델 매핑·키·예산 변경은 **공통 LiteLLM 서버만 변경**하면 된다.
SDK 전송/인터페이스 수정은 **패키지 버전 갱신 후 앱 재빌드/배포**가 필요하다.
이미 배포된 앱 코드가 서버 수정만으로 자동 갱신된다고 가정하지 않는다.

```sh
npm test --prefix packages/litellm-client --workspaces=false
npm pack ./packages/litellm-client --pack-destination /tmp
```

### Personal account HTTP adapter (0.2)

```js
const accounts = createAccountClient({ baseUrl, apiKey: platformKey, subject: serverDerivedSubject });
await accounts.connect('codex'); // poll list() for the short-lived official device challenge
await accounts.connect('claude', { apiKey: userProvidedAnthropicApiKey });
const connections = await accounts.list();
await accounts.client(`${connections[0].id}:${connections[0].models[0]}`).generateJSON({ messages, name, schema });
await accounts.disconnect(connections[0].id);
```

Use one private platform key per application; derive the 64-hex subject on the server from that application's identity. The browser never chooses a subject, destination or platform key. `allowLocalhost: true` is explicit for local tests only. `ttlSeconds` (60–2592000) is available for browser-bound connections that must expire. A disconnected/unavailable personal model never falls back to default credits. Application authentication, CSRF checks and UI consent remain in the application; lifecycle validation and transport are shared. The private backend lives in `services/ai-gateway` (`ACCOUNTS.md`).

## Jev 판단 API (0.4)

`@cak/litellm-client/jev`는 앱 서버에서 사용하는 독립 진입점이다. 별도 Jev 서버를
추가하지 않고 **앱 서버 → 이 모듈 → 기존 LiteLLM TypeSafe pass-through → Jev**로 호출한다.
기존 생성 API와 개인 계정 연결은 그대로 사용할 수 있다.

```ts
import { createJevClient, JevError } from '@cak/litellm-client/jev';

const jev = createJevClient({
  baseUrl: env.LITELLM_BASE_URL, // https://ai.example/llm 또는 /llm/v1
  apiKey: env.LITELLM_API_KEY,   // 이 앱의 LiteLLM virtual key
  model: 'jev-1.13.0',          // 기본값도 이 버전; 최신 별칭은 명시적으로 선택
  timeoutMs: 5000,
});

const result = await jev.evaluate({
  state: { candidate: candidateTitle, previous: publishedTitles },
  questions: {
    duplicate: {
      type: 'choice',
      instructions: '제공된 기존 제목과 후보가 같은 주제를 반복하는지 비교하세요.',
      criteria: { duplicate: '같은 주제를 반복', fresh: '별개의 주제' },
    },
  },
  signal: request.signal, // 선택 사항
});
// choice는 TypeScript에서 'duplicate' | 'fresh'로 추론된다.
const { choice, probabilities, confidence } = result.answers.duplicate;
// 사용량 원장에는 result.model, result.usage와 앱의 rubric 버전을 기록한다.
// confidence 기준·보류·기존 로직 복귀는 앱의 검증된 정책으로 결정한다.
```

- `choice`: 주어진 선택지 중 판단, 확률 분포와 confidence 반환. 선택지 최대 255개.
- `score`: 순서가 있는 2~10개 기준에 대한 가중 점수, legend·확률 분포·confidence 반환.
- `noul`: yes 확률 `noul`(0~1)을 반환. confidence 필드나 자동 boolean 변환은 없다.
- 공통 반환: 실제 응답 `model`, 질문 ID별 `answers`, `usage.input_tokens/output_tokens`.
- `state`·`instructions`는 문자열/JSON 객체/배열. 함수·순환 참조 등 JSON이 아닌 값은 전송 전에 거부한다.
- 응답의 질문 ID, 타입, 선택지, 확률 범위·합, 점수 범위, 사용량을 검사한다. 잘못된 응답은 성공으로 취급하지 않는다.
- 기본 5초 제한은 응답 본문 수신까지 포함한다. 요청/응답 기본 1 MiB, JSON 깊이 64는 로컬 제한이며 제공자의 토큰 한도가 아니다.
- 재시도·캐시·대체 모델·자동 승인·자동 비용 추정은 없다. 실패는 `JevError`로 전달한다.
  호출 앱이 오류 코드를 기록하고 기존 처리로 돌아가거나 검토 대기로 전환한다. 실패를 `fresh` 같은 판단으로 바꾸지 않는다.
- 키/요청 원문/제공자 오류 본문을 오류 메시지에 포함하지 않는다. `apiKey`나 목적 URL은 사용자 입력으로 받지 않는다.

| `JevError.code` | 의미 / 처리 주체 |
|---|---|
| `invalid_config`, `server_only` | 서버 설정·호출 위치 수정 |
| `invalid_input`, `request_too_large` | 앱의 입력·문맥 크기 수정 |
| `authentication_failed`, `rate_limited`, `overloaded`, `upstream_error` | 게이트웨이/공급자 오류. 앱이 재시도·복귀 정책 결정 |
| `timeout`, `cancelled`, `network_error` | 제한시간·호출 취소·전송 실패 |
| `redirect_rejected`, `invalid_response`, `response_too_large` | 목적지/응답 계약 확인 |

**패키지 설치만으로 운영 연결이 켜지지 않는다.** LiteLLM의 `TYPESAFE_API_KEY`, 크레딧,
앱별 권한·예산, 역방향 프록시의 `/llm/typesafe/v1/systemone` 허용이 먼저 필요하다.
SDK는 prefix를 보존하여 `/typesafe/v1/systemone`에 POST한다. TypeSafe 직접 URL용 클라이언트가 아니다.
개인 Codex/Claude 구독으로 Jev 사용권이 생기는 것은 아니다.

LiteLLM **내부 모델 라우터**에서 Jev를 쓰는 기능은 서버의 native Jev 설정으로 별도 구성한다.
이 JavaScript 모듈을 LiteLLM Python 서버에 설치하는 구조가 아니다.
배포 준비·검증 범위: [공통 모듈 인수 문서](../../docs/20260930-jev-common-client.md).
계약 근거: [TypeSafe API](https://docs.typesafe.ai/api),
[모델](https://docs.typesafe.ai/models),
[LiteLLM TypeSafe pass-through](https://docs.litellm.ai/docs/pass_through/typesafe).
