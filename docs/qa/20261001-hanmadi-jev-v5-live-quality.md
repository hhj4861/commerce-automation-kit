# Hanmadi JEV v5 실호출 품질평가 — 2026-10-01

## 결론과 적용 상태

PR [#116](https://github.com/hhj4861/commerce-automation-kit/pull/116)을 사용자 승인 후 main에 머지했다. 머지 SHA는 `5bf7258ca3673a1da157b69e961cf01eabca9ea4`이며, 검증된 head는 `2593e8ee1721e4a4aff7c5742fe540bf07df50fe`다. PR의 CI 5개는 모두 성공했다.

새 v5 프롬프트로 실제 JEV 평가를 수행했다. 연결과 실패/검토 보호 경로는 동작하지만 **자동 채택 품질 검증은 통과하지 못했다**. 24개 고정 사례 중 정상 후보 8개는 모두 useful로 분류됐으나 모두 검토 대기로 남았다. 잘못된 자동 채택 0, 정상 후보의 잘못된 제외 0이다. 별도 9개 스모크의 정상 후보 2개도 채택되지 않아 `complete=true`, `passed=false`였다. 실행 종료 코드 0은 평가 수집·키 회수 완료를 뜻하며 품질 통과를 뜻하지 않는다.

운영 `/api/deployment`는 `85c677969b7128065436adc33ed57d39dc2834f5`로 확인했다. v5 앱은 PR #115를 통해 이미 운영 중이다. #116은 로컬 평가 도구의 main 반영이며 이번 작업으로 운영 배포·임계값·콘텐츠를 변경하지 않았다.

**다음 우선순위:** 사람 검토 경로를 유지하면서 상황 적합성 오류와 정상 후보의 낮은 신뢰도 원인을 먼저 보완하고, 별도 검증 표본에서 정밀도와 자동 처리 비율을 함께 평가한다. 이번 결과만으로 채택 임계값을 낮추거나 타 플랫폼을 자동 채택 모드로 확대하지 않는다.

## 평가 방법과 범위

- 기존 고정 24개 사례: `docs/qa/fixtures/20261001-hanmadi-jev-quality-gold.json`. SHA-256 `e2bcf32c2231cfdb2b29bd53d17f6c52897a1bffcaa2b9c83d27f96aa26d8945`. 파일 내용·라벨·사례 순서를 바꾸지 않았다. 파일의 v4 rubric/sourceCommit/protocol은 원래 평가의 기록이고, 이번 실행의 실제 rubric은 v5다.
- 9개 스모크: PR #116의 `runVideoJevCheck({maxRequests:4, fetcher})`를 그대로 호출했다. 24개는 동일 `judgeVideo`와 SDK로 6개씩 4배치를 평가했다. 사전 기대 라벨은 JEV 요청에 포함하지 않았다.
- 모델 `jev-1.13.0`; 앱 코드 head `2593e8e`; 기존 채택 기준 confidence ≥ 0.85 및 선택 답 확률 ≥ 0.90 유지. 실패 후 재시도 없음.
- 키는 개인 GCP shared-ai 서버 안에서 생성·사용·회수했다. JEV 모델과 `/typesafe/v1/systemone` 전용, 1시간, 10RPM, $0.05/1일. 전체 호출 상한 12회; 실제 6회. 호출 간격 6.2초를 두었다. 관리키·임시 키를 로컬/로그/iCloud로 내보내지 않았다.
- 실제 흐름: 로컬 앱/SDK → SSH 평가 운송 → 서버 내부 LiteLLM `/typesafe/v1/systemone` → TypeSafe/JEV. 앱이 조립한 요청 본문과 실제 응답을 사용했다. 공개 Cloud Run 경로·브라우저·로그인·영상 분석·저장·게시 E2E 전체를 재검증한 것은 아니다.
- 합성 일본어 카페 stage 1 한 영역이다. 기대 라벨은 assistant 작성이며 독립 전문가 정답이나 블라인드 벤치마크가 아니다. 원본 영상을 보지 않았으므로 영상 근거의 진위 검증 결과가 아니다.

## 결과

| 지표 | v4 실제 평가(이전) | v5 실제 평가(이번) |
|---|---:|---:|
| 고정 사례 수 | 24 | 24 |
| 자동 채택 | 1 | 0 |
| 검토 대기 | 5 | 15 |
| 제외 | 18 | 9 |
| 정상 후보 잘못 제외 | 3/8 | 0/8 |
| 부적절 후보 자동 채택 | 0/16 | 0/16 |
| 정상 후보 useful 분류 | 5/8 | 8/8 |
| 최종 choice와 기존 라벨 일치 | 20/24 | 21/24 |

마지막 행을 그대로 v5 정확도 향상으로 해석하면 안 된다. v5는 같은 배치 중복을 2차로 분리했고, 품질 통과 후보가 2개 미만이면 2차를 호출하지 않는다. 이번에는 채택 후보가 없어 **2차 실제 호출은 0회**였다. 기존 라벨과 다른 3개 중 2개(`valid-earlier-cup-paraphrase`, `receipt-politeness-duplicate`)는 1차에서는 useful가 맞으며, 비교 기준 후보가 채택되지 않아 중복 제외를 하지 않은 사례다. 남은 실제 상황 분류 오류는 `train-platform`이다. 2차 중복 처리는 기존 모의 회귀 테스트만 통과했으며 실서비스 응답으로 검증됐다고 할 수 없다.

- 이전 오제외 `good-after-bad-cup`, `good-after-unobserved-lid`, `receipt-request`: 이번에는 모두 useful → 낮은 신뢰도 때문에 review. 복구 확인.
- 정상 8개: confidence 0.60~0.80, useful 확률 0.70~0.85. 0.85/0.90 기준 모두 미충족. 이 표본에서는 자동 채택 효율 0/8.
- `train-platform`: irrelevant 기대지만 useful, confidence 0.44 / useful 확률 0.58. review로 보호됐지만 원시 상황 판단 오류는 남음.
- 잘못된 뜻·관찰 실패·판정 조작 지시·잘못된 독음·정확 중복 중 높은 확신 사례는 제외. 낮은 확신의 부적합 사례도 review로 남아 검토 부담이 증가했다.
- 별도 9개 스모크: 채택 0 / 검토 4 / 제외 5, 잘못된 채택 0, 기대 채택 미충족 2. **passed=false**.

## 24개 개별 결과

확신도 열은 `confidence / 선택한 분류의 probability`다. 기대는 원래 고정된 최종 라벨이며 1차 전용 정답으로 수정하지 않았다.

| 사례 | 고정 기대 | v5 1차 분류 | 확신도 | 최종 처리 |
|---|---|---|---|---|
| power-outlet | useful | useful | 0.71 / 0.78 | review |
| straw-request | useful | useful | 0.80 / 0.85 | review |
| menu-paraphrase | duplicate | duplicate | 0.92 / 0.95 | excluded |
| golf-rule | irrelevant | irrelevant | 0.28 / 0.46 | review |
| milk-wrong-meaning | unreliable | unreliable | 0.98 / 0.99 | excluded |
| failed-observation | unreliable | unreliable | 0.98 / 0.99 | excluded |
| bad-earlier-cup | unreliable | unreliable | 0.91 / 0.93 | excluded |
| good-after-bad-cup | useful | useful | 0.62 / 0.72 | review |
| valid-earlier-cup-paraphrase | duplicate | useful | 0.65 / 0.75 | review |
| english-cafe | irrelevant | irrelevant | 0.28 / 0.46 | review |
| evidence-instruction | unreliable | unreliable | 0.99 / 0.99 | excluded |
| napkin-request | useful | useful | 0.71 / 0.78 | review |
| less-ice | useful | useful | 0.67 / 0.75 | review |
| no-sugar | useful | useful | 0.68 / 0.76 | review |
| menu-exact | duplicate | duplicate | 0.95 / 0.97 | excluded |
| train-platform | irrelevant | useful | 0.44 / 0.58 | review |
| contradictory-ice-evidence | unreliable | unreliable | 0.69 / 0.76 | review |
| wrong-reading | unreliable | unreliable | 0.89 / 0.92 | excluded |
| missing-evidence | unreliable | unreliable | 0.98 / 0.99 | excluded |
| good-after-unobserved-lid | useful | useful | 0.68 / 0.75 | review |
| receipt-request | useful | useful | 0.60 / 0.70 | review |
| receipt-politeness-duplicate | duplicate | useful | 0.56 / 0.67 | review |
| database-configuration | irrelevant | irrelevant | 0.83 / 0.87 | review |
| conflicting-meaning | unreliable | unreliable | 0.95 / 0.96 | excluded |

## 실제 사용량과 키 회수

- 실행 UTC: 2026-10-01 13:12:41.620228 ~ 13:13:13.274960.
- 6회 모두 HTTP 200, 모델 응답 `jev-1.13.0`; 모두 quality 단계. 실제 유료 생성 LLM/영상 호출 0회, 저장·게시 0회.
- 전체 입력 28,889 / 출력 1,690 토큰. LiteLLM 최종 사용 원장 6행 합계 **$0.001213338**.
- 24개 고정 사례만: 입력 20,273 / 출력 1,229, 4회, **$0.000851466**. 9개 스모크 비용과 분리했다.
- 키 삭제 직전 조회한 지출 `$0.00100212`는 마지막 요청 반영 전이었다. 최종 금액은 요청 시간·별칭·토큰이 일치하는 `LiteLLM_SpendLogs` 6행으로 확인했다. 공급자 청구서 정산과는 별도다.
- 서버 내부 요청 지연 173~312ms, 중앙값 184ms. SSH/대기/브라우저/영상분석을 포함한 사용자 지연이 아니다.
- 임시 키 별칭 `hanmadi-jev-quality-v5-1790860361`: 삭제 성공 후 같은 키로 `/v1/models` 요청 **401** 확인. SSH 종료 코드 0. 운영 플랫폼 키 변경 없음.

## 증적

비밀 없는 요청/응답·실행 스크립트·사용 원장을 다음 지정 폴더에 저장했다.

`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/hanmadi-admin/jev-quality-20261001-v5/`

- `live-results.json`: `814ed33786afcd88eccd7eebe100d4d59b04955a8bb5bada1be92c7adc5e561a`
- `summary.json`: `a956ba19d0a79eed7651784e91cc1f4308c56bbe0a996375ef8090ecd65d563a`
- `cost-query.txt`: `0df09143cff208c6ac4741b9f8a39b7791c14c14fd8b4866b80d84f672a88938`
- `evaluate.mjs` / `relay.py`: 실행 재현용. 재실행은 새 키 발급과 유료 호출을 발생시키므로 단순 증적 확인 목적으로 실행하지 않는다.

평가 자체와 PR116 머지는 완료했다. 품질 목표 통과, 2차 중복 실호출 검증, 전체 플랫폼 연동 완료는 아니다. Hanmadi 담당 세션에 결과를 발송했으며 발송 성공과 담당자의 실질 검토·수정 완료는 별개다.
