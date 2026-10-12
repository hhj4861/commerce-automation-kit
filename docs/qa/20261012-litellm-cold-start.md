# LiteLLM 스테이징 콜드 스타트 진단 — 2026-10-12

## 범위와 현재 결론

운영 VM과 기존 플랫폼 연결을 유지하면서 서버리스 스테이징의 46초 응답 지연을 조사했다. 실제 사용자 OpenAI·Claude API 키 연결과 앱 화면 검증은 시험 키가 확인되지 않아 여전히 남아 있다. 이번 확인에서도 해당 공급자 이름의 Secret Manager 키 후보는 없었으며, 비밀값을 조회하거나 운영 사용자 자격을 복사하지 않았다.

대상은 `litellm-stg`, 이미지 `litellm-platform-staging@sha256:bcc7ae9f8c05262b381bd4929be4eaa52e9d8f4d2ce76f08e17ea67faa01da6a`다. 기동 CPU 증폭은 이미 켜져 있고, CPU 1 / 메모리 1GiB / 최소 인스턴스 0이다. 진단에 모델 생성 요청을 사용하지 않는다.

## 기존 실패 구간 분리

2026-10-12 `/v1/models` 200 요청의 Cloud Logging 기록:

| UTC 시각 | 사건 |
|---|---|
| 00:59:12.934342 | 요청 시작, 백엔드 요청 latency 45.603초 |
| 00:59:12.996946 | AUTOSCALING으로 인스턴스 시작 |
| 00:59:52.835204 | Uvicorn 서버 프로세스 시작 — 약 39.84초 경과 |
| 00:59:52.835334 | application startup 시작 |
| 00:59:56.254344 | application startup 완료 — 약 3.42초 |
| 00:59:58.494467 | 10번째 startup HTTP probe 성공 |

앞선 클라이언트 측 46.343초와 백엔드 기록의 측정 경계는 다르다. 로그상 가장 큰 구간은 서버 프로세스 시작 전이다. 이 사실만으로 그 전부를 Python import, 이미지 로딩, 또는 DB 대기로 단정하지 않는다. 앱의 기존 30초 제한과 JEV의 5초 제한은 아직 충족하지 못했다.

배포 이미지의 OCI 설정을 읽어 시작 명령이 `docker/prod_entrypoint.sh`임을 확인했다. OCI 소스 revision은 `d09bbae1c6df463e425558f60d460437193635da`다. 해당 [시작 스크립트](https://github.com/BerriAI/litellm/blob/d09bbae1c6df463e425558f60d460437193635da/docker/prod_entrypoint.sh)는 LiteLLM CLI를 실행한다. 시작 스크립트 자체에서 매번 Prisma 코드를 생성하는 구조라는 가설은 이 소스와 맞지 않는다.

## 진단 실행

- 같은 이미지에 `PYTHONPROFILEIMPORTTIME=1`만 임시 추가한 `litellm-stg-importdiag20261012`를 0% 트래픽으로 만들었다.
- 처음에는 요청이 없어 컨테이너 기동 로그가 없었다. 이를 import 시간 0 또는 정상 기동의 증거로 해석하지 않는다.
- 전체 Terraform plan에서 LiteLLM 스테이징 한 곳의 갱신만 확인해 임시 환경 설정을 복구했다(추가 0, 변경 1, 삭제 0). 운영 자원과 이미지·최소 인스턴스 수는 유지했다.
- `importdiag` 태그를 붙이자 배포 health check가 진단 리비전을 실제로 기동했다. 별도 VM curl이나 모델 요청은 실행할 필요가 없었다. 일반 서비스 트래픽은 계속 기존 `litellm-stg-00006-h2c` 100%였다.

## 모듈 로딩 측정 결과

Cloud Logging에서 해당 기동의 기록 3,970개를 끝 페이지까지 조회했다. 그중 import 시간 행은 3,940개였다. 인스턴스 시작 02:05:04.470772 UTC → 서버 프로세스 시작 02:05:58.691710 → application startup 완료 02:06:03.574925 → HTTP probe 성공 02:06:05.054200이었다.

| 모듈 | self 시간 | 하위 import를 포함한 누적 시간 |
|---|---:|---:|
| `litellm.types.tool_management` | 7.499초 | 7.499초 |
| `prisma.types` | 3.116초 | 4.286초 |
| `litellm.proxy.proxy_server` | 2.816초 | 20.400초 |
| `litellm.proxy.db.tool_registry_writer` | 2.201초 | 9.700초 |
| `litellm` | 0.340초 | 21.636초 |

누적 시간에는 포함 관계가 있으므로 합산하지 않는다. import 프로파일링의 로그 비용과 실행 조건 차이가 있어 이 60초를 평상시 요청 지연과 직접 비교하지 않는다. 다만 **모듈 로딩 자체가 큰 병목이며 DB 대기만의 문제가 아님**을 확인했다. 모듈별 지연 안에서도 파일 읽기·코드 컴파일·타입 초기화 등의 정확한 비중까지 분리한 결과는 아니다. 이 진단으로 응답 지연을 해결하거나 5초/30초 제한을 통과한 것은 아니다.

비밀값 없는 집계와 모듈별 시간 원본: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261012-litellm-cold-start/import-profile.json`.

## 소비 앱 호환성 추가 확인

서버 코드 머지 `97a5c6c1f7072688048290e770eb3b54a1cb1e8c`의 Hanmadi 소스를 확인했다. 이 소스 확인은 현재 운영 앱의 배포 SHA를 조회한 결과가 아니다.

- `apps/hanmadi/vendor/cak-litellm-client-0.4.0.tgz`의 `publicAccountConnections`는 공급자를 `codex|claude`로 제한한다. PR #183의 공통 소스는 `openai`도 허용하지만 앱의 tgz에는 아직 없다.
- 두 실제 모듈에 같은 합성 공개 OpenAI 계정 레코드를 넣어 비교했다. 기존 tgz는 `invalid_connections`, 새 소스는 정상 반환이었다. Node VM 모듈로 원래 의존 모듈까지 로딩했고 네트워크 호출은 0회였다. 첫 data-URL 로더 시도는 상대 모듈 경로 처리 문제로 실패했으며, 그 시도를 계약 검증 성공으로 세지 않았다.
- `app/api/model-connections/route.ts` 역시 연결 공급자를 `codex|claude`로 제한한다. `components/v2-app.tsx`는 Codex·Claude Code 구독 로그인과 Claude API 키 화면을 제공하며 OpenAI API 키 흐름은 없다.
- 따라서 서버 URL만 바꾸거나 시험 키만 준비하는 것으로 Hanmadi의 accounts v2 전환이 완료되지 않는다. 운영 구독 로그인은 그대로 유지하고, 별도 검증 설정에서 패키지·API·화면을 함께 보완해야 한다. 실제 사용자 키와 실제 앱 화면 E2E는 아직 수행하지 않았다.

## 최종 정리와 다음 작업

진단 태그와 이번 세션에서 만든 `litellm-stg-importdiag20261012` 리비전을 삭제했다. 02:10:53 UTC 최종 조회에서 `litellm-stg-00006-h2c` 100%, 같은 이미지, 프로파일링 환경값 없음, 최소 인스턴스 0을 확인했다. 전체 Terraform 재계획은 exit 0 / 변경 0개였다. 운영 VM은 RUNNING/e2-small이고 시작 시각 `2026-10-08T22:22:13.788-07:00`을 유지했다. 보온 Scheduler는 PAUSED다.

같은 증거 폴더의 `final-state.json`에 최종 상태를 저장했다. `import-profile.json` SHA-256: `4fe07b939aea687db8f44ba5a455987a09ac9ec09cf86020464e5b4e2aa8b746`. 모델 추론 0회, 운영 변경 0건이며 전체 인프라 비용을 측정한 것은 아니다.

남은 순서는 소비 앱의 accounts v2 선택 경로 보완 → 안전하게 제공된 시험 API 키로 연결·응답·화면 검증이다. LiteLLM은 별도로 기동 지연을 줄이거나 검증된 상시 대기 구성을 택해야 하며, 현재 min=0 구성으로 기존 앱 제한을 만족한다고 보고하지 않는다. 비용 시험은 재개하지 않았다.
