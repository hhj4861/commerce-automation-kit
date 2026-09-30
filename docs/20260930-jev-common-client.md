# Jev 공통 모듈 — 구현과 연결 범위

2026-09-30. `@cak/litellm-client@0.4.0`의 서버용 진입점 `@cak/litellm-client/jev`.
공통 클라이언트 구현이며 플랫폼 기능 활성화·운영 배포와 구분한다.

## 구성

```text
Festa / Shopshorts / Hanmadi / Replay 등의 앱 서버
  └─ @cak/litellm-client/jev (앱 배포물에 포함)
       └─ 기존 LiteLLM /typesafe/v1/systemone
            └─ TypeSafe Jev
```

별도 Jev 전용 서버는 추가하지 않는다. 판단용 입력·질문·기준과 confidence 임계값은 각 앱이
관리한다. 공통 모듈은 전송·취소·제한시간·입출력 검증·안전한 오류를 담당한다.
`choice`, `score`, `noul`을 한 요청에 함께 보낼 수 있다. 생성형 LLM 호출을 자동 대체하지 않는다.
`noul`은 yes 확률이며 별도 confidence는 없다. confidence를 실제 정답률 보증으로 해석하지 않는다.

LiteLLM 자체의 **생성 모델 선택**은 다른 경로다. LiteLLM의 native Jev auto-router 설정을
사용하며 이 JS SDK를 Python 서버가 import하지 않는다. 현재 작업에는 auto-router 설정을 포함하지 않는다.
서버 버전·지원 설정과 라이선스 조건을 확인한 뒤 별도 검증한다.

## 구현한 계약

| 항목 | 값 / 동작 |
|---|---|
| import | `createJevClient`, `JevError` from `@cak/litellm-client/jev` |
| 호출 | `evaluate({ state, questions, signal? })` |
| 인증 | 앱별 LiteLLM virtual key. TypeSafe 키는 게이트웨이에만 보관 |
| URL | `https://host/llm/v1` → `https://host/llm/typesafe/v1/systemone` |
| 모델 | 기본 `jev-1.13.0` 고정. 명시적 model 옵션 가능 |
| 결과 | `model`, 질문별 `answers`, `usage.input_tokens/output_tokens` |
| 제한 | 기본 전체 응답 5초, 요청/응답 각 1 MiB, JSON 깊이 64 |
| 보안 | HTTPS, localhost HTTP 명시 허용, URL 자격/쿼리/fragment 차단, redirect 차단 |
| 실패 | 고정 오류 코드 반환. 원문·키·공급자 오류 본문 비노출 |
| 자동 정책 | 재시도·캐시·대체 모델·업무 승인·임계값 없음 |

TypeScript는 choice 기준의 key를 결과 선택지 타입으로 추론한다. JSON 런타임 검증은 타입이 없는
JavaScript 호출에도 적용된다. 로컬 바이트 제한은 제공자의 토큰 한도를 대체하지 않는다.
키/URL/모델 선택은 서버 설정에서 주입하고 브라우저 입력을 그대로 사용하지 않는다.

## 배포 인수 순서

1. **공통 패키지**: PR 검토·명시적 머지 승인 후 앱이 0.4.0을 사용하도록 의존성을 갱신한다.
   같은 모노레포 전체를 빌드하는 앱은 file dependency, 앱 폴더만 배포하거나 별도 저장소인 앱은
   버전을 고정한 `npm pack` tarball을 사용한다. npm registry에는 게시하지 않는다.
2. **공용 LiteLLM 담당(`Lite-LLM`)**: 운영 이미지의 TypeSafe pass-through 지원 여부를 확인한다.
   TypeSafe 크레딧·키를 준비하고 서버 secret `TYPESAFE_API_KEY`를 주입한다.
   해당 버전 문서/실측에 맞춰 앱별 virtual key의 Jev 모델 사용 권한과 예산을 제한한다.
   `services/shared-ai-host` 외부 `/llm/typesafe/v1/systemone` 경로와 gateway 프록시 allowlist를
   최소 POST 경로로 연결하고 인증 없는 호출이 거부되는지 검증한다. 현재 저장소 설정에는 이 경로가 없다.
3. **첫 앱 담당**: 기능 플래그를 끈 상태로 의존성·rubric을 연결하고 익명화한 한국어 고정 평가셋으로
   기존 결과와 비교한다. 요청 ID, rubric 버전, 모델, 지연, 토큰, 오류, 복귀 여부를 기록한다.
   원문 개인정보와 키는 로그에 남기지 않는다. 검증 후 제한된 트래픽부터 활성화한다.

게이트웨이는 보통 `typesafe/jev-1.13.0` 같은 공급자 모델 식별자를 정책에 사용하지만,
실제 virtual key 허용 방식은 설치된 LiteLLM 버전에서 확인해야 한다(`TODO(D1)`).
앱 오류 처리에서는 `JevError.code`를 기록하고 **기존 판단 경로 또는 사람 검토**로 복귀한다.
실패를 '중복 아님'·'승인'으로 취급하거나 필수 표현검수·발행 사람 게이트를 대체하지 않는다.

Festa 인터뷰의 다음 주제 판단이 우선 적용 후보이며, 소규모 비교 실험에는 블로그 중복 판정이 적합하다.
Replay처럼 현재 판단용 LLM 호출이 없는 영역에는 이 패키지를 설치하는 것만으로 개선 효과가 생기지 않는다.
Python 등 다른 언어의 앱은 JS 모듈을 직접 import할 수 없으므로, 실제 연결 시 같은 HTTP 계약의
언어별 어댑터가 필요하다. 이번 배포 대상은 JS/TS 서버다.

## 검증과 현재 미적용 범위

- 패키지 테스트: 기존 15 + Jev 17 = 32개. 정상 복합 판단, 잘못된 입력/응답, 키 오류·429·529,
  timeout·cancel, 느린 본문, 응답 크기 제한, 리다이렉트 및 실제 로컬 HTTP 왕복을 포함한다.
- TypeScript strict + NodeNext: subpath export와 결과 타입 추론/오용 차단 확인.
- 배포물: tarball에 런타임·선언 파일을 포함하고 설치 후 package subpath import를 확인한다.
- **미수행**: 유료 Jev 실호출, 실제 LiteLLM 서버 왕복, 운영 프록시/키 설정, 각 앱 연결·배포,
  한국어 정확도·비용·지연 개선 실측. 앞선 계정의 크레딧 부족이 해소됐는지도 미확인이다.

재현 명령:

```sh
npm test --prefix packages/litellm-client --workspaces=false
npx tsc --noEmit --strict --module NodeNext --moduleResolution NodeNext \
  --target ES2022 --lib ES2022,DOM packages/litellm-client/test/jev.types.mts
npm pack ./packages/litellm-client --pack-destination /tmp
```

## 공식 계약 근거

- [TypeSafe API](https://docs.typesafe.ai/api): 요청·응답, choice/score/noul, 오류 계약.
- [TypeSafe 모델](https://docs.typesafe.ai/models): 기본 모델 버전, 제공자 문맥 한도.
- [Confidence](https://docs.typesafe.ai/confidence): confidence의 해석과 한계.
- [LiteLLM pass-through](https://docs.litellm.ai/docs/pass_through/typesafe): 프록시 경로와 서버 키 설정.
- [LiteLLM auto-router](https://docs.litellm.ai/docs/auto_router/setup): 판단 API와 별개의 내부 모델 라우팅 설정.

2026-09-30 공식 문서 확인 기준. 모델 성능·청구액·운영 서버 호환성을 실측한 기록은 아니다.
