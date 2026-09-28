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
