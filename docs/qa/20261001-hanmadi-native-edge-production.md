# Hanmadi native video edge 운영 적용 — 2026-10-01

## 결과와 범위

사용자가 승인한 PR [#107](https://github.com/hhj4861/commerce-automation-kit/pull/107)의 머지 커밋 `bc8a870958c0071952968b8cf0e7a1eabda9150b`에서 독립 edge 설정을 운영에 적용했다. 2026-10-01 08:17 UTC 공개 경로 검사 12/12 통과. 영상 분석·Jev·초안 E2E는 Admin 담당 세션의 앱 재배포 후 별도 검증한다. 이 경로 검사 자체는 유효한 키나 유료 모델을 호출하지 않았다.

- 대상: 개인 GCP `replay-live-508202` / `us-central1-a` / `shared-ai`.
- 공개 주소: https://shared-ai-d5cy7m6i7q-uc.a.run.app
- 변경: `POST /llm/v1beta/models/hanmadi-chat:generateContent`만 LiteLLM으로 연결. 다른 모델·메서드·관리 경로는 개방하지 않았다.
- 배포: 머지 소스의 `services/shared-ai-host/{Caddyfile,compose.yaml}`을 새 불변 릴리스에 배치하고, 같은 고정 이미지로 `caddy validate` 통과 후 Compose `shared-ai-edge`의 `edge`만 재생성했다.
- LiteLLM·DB·accounts의 컨테이너 ID와 재시작 횟수(0)는 전후 동일했다. 키·예산·DB·모델 설정은 변경하지 않았다. 운영 `hanmadi-admin-jev` 키는 보존한다.
- 첫 SSH 조회는 70초 시간 초과로 종료됐으며, 변경 없이 제한된 SSH 연결로 재조회한 뒤 적용했다.

## 배포 증적

| 항목 | 실제 값 |
|---|---|
| 릴리스 | `/opt/shared-ai/releases/hanmadi-native-edge-bc8a870958c0071952968b8cf0e7a1eabda9150b` |
| Caddy SHA-256 | `d120ec2d73f1ca2f00db3015c4364744b484a46c9b9491e89609c8b15774817e` |
| 이미지 | `caddy:2@sha256:0c994536bddb66445885237f1a5dcc1916bccea922661c76b4e9fc24061f9b52` |
| 교체 후 edge ID | `d0a537d8d4af8fd088541a6b7b8fb711d8d8c04a1eb38a24c1832841be3b7d72` |
| 이전 Caddy SHA-256 | `807ded43e5adb20df0bf5ede25586add84364c7ea9b9251657c7daff9d08535d` |
| 이전 Compose SHA-256 | `dcafb15e38b8478532c1fc5d50958528a63cf2d3b3ac473fd80d1a5c154acc74` |

배포 직전에 이전 edge ID·이미지·설정 해시를 다시 검사해 동시 변경이 없음을 확인했다. Compose 파일은 전후 바이트가 동일하다. Caddy `admin off` 설정 때문에 관리 API reload 대신 edge 단독 재생성을 사용했다. `deploy/litellm`의 gateway 배포로 독립 edge까지 갱신됐다고 간주하지 않았다.

## 공개 경로 검증

모든 요청은 인증 없음 또는 고의로 잘못된 테스트 문자열만 사용했다. 응답 본문·인증 비밀은 기록하지 않았다.

| 요청 | 기대 / 실제 |
|---|---|
| GET `/health` | 200 / 200 |
| POST native exact 경로, 인증 없음 | 401 / 401 |
| POST native exact 경로, 잘못된 키 | 401 / 401 |
| GET native exact 경로 | 404 / 404 |
| PUT native exact 경로 | 404 / 404 |
| POST native 경로 + 후행 `/` | 404 / 404 |
| POST native `other-model` | 404 / 404 |
| POST native `streamGenerateContent` | 404 / 404 |
| GET `/llm/key/list` | 404 / 404 |
| GET `/llm/v1/models` | 401 / 401 |
| POST `/llm/v1/chat/completions` | 401 / 401 |
| POST `/llm/typesafe/v1/systemone` | 401 / 401 |

401은 요청이 인증 경계에 도달했음을 뜻하며, 영상 모델 실행이나 Jev 판단 성공의 증거는 아니다. 실제 영상 1건 검증은 Admin 세션이 기존 운영키로 수행한다. 새 키 발급, 반복 품질 평가, 콘텐츠 게시, 파인튜닝은 이번 범위에 없다.

## 복구와 인계

이전 릴리스는 그대로 보존했다. 필요하면 서버에서 아래 명령으로 edge만 복구한 후 health와 기존 LLM/Jev 인증 경로를 재검증한다. 이번 배포는 성공했으므로 복구를 실행하지 않았다.

```sh
docker compose -p shared-ai-edge \
  -f /opt/shared-ai/releases/jev-edge-2503a98a21104d753440005b8af23c0b71267a6b/compose.yaml \
  up -d --no-deps --force-recreate edge
```

Admin 담당 세션 `01a0ed48-a0ae-7b00-8fe5-fec7b0a5b3de`에 실제 적용 및 12개 검증 결과를 전달했다. 담당 세션은 승인된 영상 변경만 포함하는 배포 승격 PR #109와 Admin 재배포·실영상 1건을 담당한다. 다른 기능이 섞인 승격 PR #108은 배포 없이 닫았다는 담당자 회신을 받았다.

## 후속 앱 검증 — HTTP 연결 성공, 전체 기능 미완료

Admin 담당 세션 회신: 배포 승격 PR #109는 `b6c079ad1be14c7f801829c8b46b895b34a4c840`으로 머지됐고, GitOps 실행 `36836273654`가 성공했다. 동일 영상 `OA6gpD9mP0A`를 2026-10-01 08:29:00.453–08:29:22.968 UTC에 1회 실행했지만 앱에서 “AI 답변 형식을 확인하지 못했어요”로 실패했다. 초안·게시 자료는 각각 0→0이었다. 재호출하지 않았다.

JEV 담당이 독립적으로 해당 시간대(08:28:55–08:29:30 UTC) gateway 로그와 키 정책을 읽어 확인했다.

- native POST `/v1beta/models/hanmadi-chat%3AgenerateContent` HTTP **200** 1건. 기존의 HTTP 400 연결 오류와 구분한다.
- 해당 로그에 `BadRequestError`, `GeminiException`, `INVALID_ARGUMENT`, `typesafe`, `systemone` 기록 없음. 응답 본문·finishReason은 로그에 없으므로 내용 형식은 확인하지 못했다.
- `hanmadi-admin-jev`: 누적 spend **0.0**, 모델 `jev-1.13.0`, 경로 `/typesafe/v1/systemone`, $0.50/30d, 10 RPM, 만료 없음으로 유지.
- `hanmadi-server`: 조회 시 누적 spend **$0.3895447**, 기존 3개 모델·$5/30d·30 RPM 유지. 누적값은 이번 영상 1건 비용이 아니다.
- 서버 HTTP 연결은 성공했지만 앱의 응답 해석 단계에서 멈춰 영상→Jev→초안 전체 검증은 여전히 미완료다. 현재 후속 작업은 native JSON 응답 설정 전달과 앱 파서의 호환 확인이다. 원문·키 출력이나 추가 유료 요청 없이 진단한다.

운영 중인 LiteLLM 1.102.1 소스를 직접 확인했다. `google_genai/main.py`는 `generationConfig`를 `config`로 전달하며, `llms/gemini/google_genai/transformation.py`는 camelCase/snake_case를 변환해 `generationConfig`와 `systemInstruction`을 요청 객체에 포함한다. 따라서 설정 누락을 원인으로 단정하지 않는다. 날짜를 지정한 `/spend/logs` 응답에는 해당 08:29 시작 행이 없었고, 기존 증적으로 응답 JSON의 최상위 유형·길이·finishReason을 복원하지 못했다. 본문을 저장하지 않는 진단 메타데이터와 회귀 테스트를 통한 원인 구분이 다음 후보이며, 이번 작업에서 앱 수정이나 추가 모델 호출은 하지 않았다.
