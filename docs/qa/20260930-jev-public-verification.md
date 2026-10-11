# Jev 공개 호출 연결 — 운영 반영 및 검증

2026-09-30. **공통 모듈과 공개 LiteLLM 호출 경로의 운영 반영·실호출 검증 완료.**
플랫폼별 업무 기능 활성화와 앱 전용 키 발급은 다음 적용 단계다.

## 반영한 변경

- 공통 모듈: [PR #84](https://github.com/hhj4861/commerce-automation-kit/pull/84),
  `@cak/litellm-client/jev`, main 머지 `8e2327e18aa859a1dcfde8eaa562925c3a11af3f`.
- 공개 경로: [PR #87](https://github.com/hhj4861/commerce-automation-kit/pull/87),
  CI 8개 통과 후 사용자 승인으로 main 머지 `2503a98a21104d753440005b8af23c0b71267a6b`.
- 개인 GCP `replay-live-508202` / `shared-ai` / `us-central1-a`의 edge에 위 머지 SHA의
  Caddyfile·Compose를 배포했다. 운영 설정이 머지 전 기준과 일치하는지 확인한 뒤 백업,
  Caddy validate, edge만 재생성, health·경로 검증 순서로 수행했다.
- LiteLLM 1.102.1의 기존 TypeSafe pass-through를 사용한다. 공급자 키는 앞선 연결 작업에서
  사용자 지정 비밀 파일로부터 게이트웨이의 비공개 `.env`에 주입했다. 키 값은 문서·Git·로그에 없다.

```text
앱 서버의 @cak/litellm-client/jev
 → 공개 HTTPS /llm/typesafe/v1/systemone (POST)
 → edge의 /llm prefix 제거
 → 운영 LiteLLM /typesafe/v1/systemone
 → TypeSafe jev-1.13.0
```

API origin: `https://shared-ai-d5cy7m6i7q-uc.a.run.app`

호출 주소: `POST https://shared-ai-d5cy7m6i7q-uc.a.run.app/llm/typesafe/v1/systemone`.
브라우저에서 GET으로 열면 의도대로 404다. 앱 서버에는 공급자 키 대신 앱별 LiteLLM virtual key를 사용한다.

## 공개 HTTPS 실측

SSH 터널 없이 로컬 공통 모듈의 `scripts/jev-smoke.mjs`에서 공개 URL로 호출했다.
고정된 비민감 한국어 배송 예문 한 건을 사용했으며, 실제 Jev 응답을 공통 모듈이 검증했다.

| 항목 | 결과 |
|---|---|
| 모델 | `jev-1.13.0` |
| 실호출 | 성공, 785ms |
| choice | `delivered`, 확률 1, confidence 1 |
| noul | 0.98 |
| score | 1 (0~1 기준), confidence 1 |
| 사용량 | 입력 413 / 출력 66 tokens |
| 잘못된 키 | 401 |
| 허용하지 않은 `jev-preview` | 403 |
| 기존 Festa 키로 Jev 접근 | 403 |
| 미인증 Jev POST | 401 |
| Jev GET·PUT | 404 |
| TypeSafe 모델 조회·추가 하위 경로 | 404 |
| `/llm/key/generate` | 404 |
| 기존 `/health` | 200 |
| 미인증 `/llm/v1/models` | 401 |
| 기존 Festa 키의 모델 조회 | 성공, `festa-travel` 존재 |
| 검증 키 회수 후 공개 경로 재사용 | 401 |

검증 키의 범위는 모델 `jev-1.13.0`, 경로 `/typesafe/v1/systemone`, 1시간 만료,
분당 10회, 하루 $0.05 예산으로 제한했다. 키는 메모리에서만 사용하고 검증 종료 후 회수했다.
기존 플랫폼 키의 모델 권한과 예산은 바꾸지 않았다.

785ms는 예문 한 건의 왕복 실측이며 서비스 지연 보장이나 업무별 품질·절감률 평가가 아니다.
이전 SSH 경유 검증의 703ms와 공개 HTTPS 검증의 785ms를 구분한다.

## 운영 기록과 복구 위치

| 항목 | 서버 경로 / 값 |
|---|---|
| 배포 소스 | `/opt/shared-ai/releases/jev-edge-2503a98a21104d753440005b8af23c0b71267a6b` |
| 이전 edge 소스 | `/opt/shared-ai/repo/services/shared-ai-host` |
| edge 설정 백업 | `/opt/shared-ai/backups/jev-edge-1790744423` |
| 배포 메타데이터 | `/opt/shared-ai/gitops/jev-edge.json` |
| Caddyfile SHA-256 | `807ded43e5adb20df0bf5ede25586add84364c7ea9b9251657c7daff9d08535d` |
| 공급자 키 반영 전 비공개 설정 백업 | `/opt/shared-ai/backups/jev-key-1790743413/gateway.env` (0600) |

실행 중인 edge의 Compose 작업 디렉터리는 위 배포 소스다. 후속 배포에서 이전 repo 디렉터리를
무조건 재기동해 설정을 되돌리지 말고, 배포 메타데이터와 실제 컨테이너의 작업 디렉터리를 먼저 확인한다.
gateway·DB·Dify·accounts는 이번 edge 배포에서 재시작하지 않았다.
`deploy/litellm` 배포 브랜치는 당시 없었으며, 이번 edge 반영은 사용자 승인에 따른 별도 운영 배포다.
이 결과를 전체 플랫폼 GitOps 자동 배포 활성화 완료로 해석하지 않는다.

## 다음 앱 연결

우선 적용 후보는 Festa 인터뷰의 다음 주제 판단이다. 앱별 제한 키·예산을 정하고,
서버에서 `baseUrl = API origin + /llm`으로 공통 모듈을 호출한다. 업무별 rubric,
실패 시 기존 처리로 복귀, 기능 플래그, 한국어 평가셋 비교는 각 앱 적용 시 구성한다.
기존 앱 키는 Jev 권한이 없으므로 패키지 import만 추가해서 호출 가능하다고 가정하지 않는다.

구현·연결 인수 문서:
[공통 모듈](https://github.com/hhj4861/commerce-automation-kit/blob/2503a98a21104d753440005b8af23c0b71267a6b/docs/20260930-jev-common-client.md),
[연결 및 SSH 검증](https://github.com/hhj4861/commerce-automation-kit/blob/2503a98a21104d753440005b8af23c0b71267a6b/docs/20260930-jev-connection-verification.md).
위 문서의 공개 경로 승인 대기 상태는 이 운영 검증 기록으로 갱신된다.
