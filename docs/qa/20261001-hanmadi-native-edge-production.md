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
