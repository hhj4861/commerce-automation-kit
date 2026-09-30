# Jev 호출 연결 검증 — 2026-09-30

공통 모듈 PR #84는 사용자 승인 후 main에 머지됐다(`8e2327e18aa859a1dcfde8eaa562925c3a11af3f`).
이 변경은 추가 프록시 경로와 반복 가능한 실호출 스크립트다. 플랫폼 기능별 적용과 구분한다.

## 경로와 키

- 공용 API: `https://shared-ai-d5cy7m6i7q-uc.a.run.app/llm/typesafe/v1/systemone`.
- LiteLLM 내부: `http://127.0.0.1:4100/typesafe/v1/systemone`.
- 외부 프록시는 위 판단 경로의 **POST만** 전달한다. TypeSafe 전체 경로, 모델 조회·관리 API,
  GET/PUT/PATCH/DELETE는 외부에 열지 않는다.
- TypeSafe 공급자 키는 사용자가 지정한 로컬 비밀 파일에서 읽어 게이트웨이의 비공개 `.env`에만 주입한다.
  앱은 별도로 제한된 LiteLLM virtual key를 사용한다. 실제 값은 Git·문서·검증 출력에 기록하지 않는다.
- 기존 플랫폼 virtual key의 모델 허용 범위를 임의로 넓히지 않는다.

## 확인된 근거

| 확인 대상 | 결과 |
|---|---|
| 공통 패키지 | 로컬 테스트 32개 통과. PR #84 Shared LiteLLM client CI 통과 |
| 운영 서버 | 개인 GCP `replay-live-508202`, `shared-ai`, `us-central1-a` |
| 설치된 LiteLLM | 1.102.1. TypeSafe pass-through 구현 존재 확인 |
| TypeSafe 키 인증 | 공식 `/v1/models` HTTP 200 |
| 고정 모델 실호출 | `jev-1.13.0` 선택형 판단 HTTP 200, `delivered`, 입력 317 / 출력 33 tokens |
| 모델 목록 특이점 | 목록에는 `jev-latest`·`jev-preview`만 표시되지만 고정 버전 실호출은 성공 |
| 새 Caddy 경로 | 실제 Caddy + 합성 업스트림 검증 통과. prefix 제거·인증 보존·미인증/잘못된 키 거부·관리/기타 경로와 비POST 거부 |
| 기존 gateway 로컬 단위 검사 | 9개 통과 |
| 운영 공급자 키 | 비공개 `.env`에 반영 후 gateway만 재기동, healthy 확인. 백업 `/opt/shared-ai/backups/jev-key-1790743413/gateway.env`(0600) |
| 공통 모듈 → 운영 LiteLLM → Jev | SSH 터널 실호출 통과. `jev-1.13.0`, 703ms, 입력 413 / 출력 66 tokens |
| 한국어 복합 판단 | choice=`delivered`(confidence 1), noul=0.98, score=1(0~1 기준), 계약 검증 통과 |
| 권한 격리 | 잘못된 키 401, 허용하지 않은 `jev-preview` 403, 기존 Festa 키의 Jev 호출 403 |
| 임시 키 정리 | 검증 후 회수하고 재사용 401 확인. SSH 터널도 종료 |

실측한 검증 키는 `models: ["jev-1.13.0"]`,
`allowed_routes: ["/typesafe/v1/systemone"]`, 1시간 만료, 분당 10회, 하루 $0.05 예산이었다.
이 버전의 권한 검사는 요청의 **접두사 없는 모델명**을 사용한다. 청구 로그의
`typesafe/jev-1.13.0` 식별자와 혼동하지 않는다. 기존 앱 키는 변경하지 않았다.
이는 임시 검증 키 설정이고, 향후 앱 운영 키 발급·예산 승인을 대신하지 않는다.

공개 edge 경로는 [PR #87](https://github.com/hhj4861/commerce-automation-kit/pull/87)의
사용자 승인·머지·운영 반영을 기다리고 있다. 위 성공은 운영 LiteLLM의 SSH 경유 실호출이며
공개 HTTPS 전체 경로 성공으로 간주하지 않는다.

Caddy 검증은 운영 포트와 다른 24xxx 포트 및 임시 컨테이너에서 수행했고 모두 종료했다.
운영 이미지 업그레이드, 기존 앱 권한 확대, DB/Dify 변경은 이 경로 추가에 필요하지 않다.

## 운영 연결 절차

1. 비공개 설정 백업과 기존 릴리스/계정 관리 잠금을 확보한다. `.env`에 `TYPESAFE_API_KEY`만
   반영하고 기존 이미지로 gateway만 재기동한다. readiness 실패 시 원래 설정과 gateway를 복구한다.
2. 한정된 모델·예산·분당 요청수·만료시간을 가진 검증용 virtual key를 생성한다.
   공통 모듈의 choice/noul/score와 잘못된 키·권한 없는 모델·기존 앱 권한 격리를 확인한다.
   검증용 키는 종료 후 회수하고 재사용이 거부되는지 확인한다.
3. **경로 추가 PR의 승인·머지 후** 검증된 Caddyfile을 기존 edge에 반영한다.
   edge는 `deploy/litellm`의 gateway 릴리스 범위에 포함되지 않으므로 별도 반영이 필요하다.
   Caddy validate → edge 재생성 → 공개 HTTPS 실호출 순서로 확인하고 실패 시 기존 설정으로 복구한다.
4. 실제 소비 앱 연결은 각 앱에 전용 virtual key·예산·기능 플래그·rubric을 설정하는 별도 작업이다.

## 재실행

운영자의 안전한 환경변수 주입 수단으로 다음 값을 제공한다. 키를 명령 문자열이나 채팅에 넣지 않는다.

- `LITELLM_BASE_URL`: 공용 API origin + `/llm` (SSH 검증은 명시적 localhost).
- `LITELLM_API_KEY`: 검증 대상 앱의 제한된 virtual key.
- `JEV_MODEL`: 생략 시 `jev-1.13.0`.
- `JEV_ALLOW_LOCALHOST=true`: SSH 터널 또는 localhost 테스트에서만 사용.

```sh
node packages/litellm-client/scripts/jev-smoke.mjs
```

이 스크립트는 고정된 비민감 한국어 예문 한 건을 보내며 실제 API 사용량이 발생한다.
응답 모델·유형별 결과·토큰·지연을 출력하고 전송/계약 실패 또는 예상 선택지 불일치 시 실패로 종료한다.
예문 한 건의 성공은 업무별 한국어 정확도·비용 절감률·운영 부하 검증이 아니다.

계약 근거: [TypeSafe API](https://docs.typesafe.ai/api),
[LiteLLM TypeSafe pass-through](https://docs.litellm.ai/docs/pass_through/typesafe).
