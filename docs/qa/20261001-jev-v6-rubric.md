# JEV v6 판단 분리 — 구현 및 실호출 평가

상태: **검토용 구현. 운영 미적용. 자동 채택 품질 목표 미통과.** main `5bf7258` 기반 별도 `fix/jev-v6-rubric` worktree에서 작성했다. 기존 v5 운영과 PR #115 배포는 변경하지 않았다.

## 문제와 변경

v5 실호출에서 정상 후보 8개가 모두 검토 대기로 남았고 카페와 무관한 승강장 표현도 useful로 분류됐다. 하나의 네 가지 선택 질문이 번역·독음·근거·상황·중복을 모두 판단해 어느 항목이 불확실한지 알 수 없었다.

v6는 후보마다 **뜻 / 발음 도움 / 관찰 근거 / 상황 적합성 / 기존 자료 중복**의 5개 pass/fail 질문을 한 요청에 함께 보낸다. 여섯 후보면 최대 30질문이다. 장면 ID 외에 앱 커리큘럼의 제목·목적·대화 상대도 제공한다. 상황 기준은 장소에서 우연히 말할 수 있는지가 아니라 표현의 실제 목적이다.

- 각 항목 confidence ≥ 0.85, 선택 답 probability ≥ 0.90 기준 유지. 모든 항목의 확실한 pass가 있어야 채택한다. 확실한 fail이 하나 있으면 그 항목으로 제외하며, 그 외 불확실성은 검토 대기로 보낸다.
- 선택지 수가 4→2로 바뀌므로 동일 숫자가 동일 실측 정확도나 보정 수준을 보장하지 않는다. 운영 채택 기준으로 쓰기 전 별도 검증이 필요하다. 수치만 낮춰 통과율을 만들지 않았다.
- `checks`에 실제 항목별 답/신뢰도/확률을 저장한다. 네 가지 종합 확률을 임의로 만들어 `evaluation`에 넣지 않는다. `choice`는 코드가 합성한 분류이며 단일 모델 답이 아니다. 불확실한 fail도 원래 항목 답에 보존한다.
- 합성 `confidence`는 제외 근거 항목 또는 최소 항목 신뢰도를 나타낸다. 전체 정답 확률·결합 확률이 아니다.
- `decidingCheck`로 관리자 이유에 어떤 항목이 판단 근거였는지 표시한다. 기존 v4/v5 `evaluation`·저장 결과는 그대로 호환한다.
- 정확 중복 검사, 통과한 후보만 이용하는 2차 의미 중복 검사, 최대 두 요청, 실패 시 저장 거부, 사람 검토 및 게시 게이트 유지. rubric v6로 캐시 구분.
- 실호출 평가 도구도 새 질문 ID와 `checks`를 읽도록 변경했다. 기존 호출 상한·사용량·실패 계수 유지.

설계 근거: [TypeSafe atomic questions](https://docs.typesafe.ai/introduction), [1.13의 모호한 조건·복합 판단 한계](https://docs.typesafe.ai/model-jaggedness/jev-1.13), [confidence 의미](https://docs.typesafe.ai/confidence). 공식 권장 방식이 이 앱의 품질 향상을 보장하지 않으므로 아래 실제 결과와 구분한다.

## 실제 평가 결과

기존 24개 고정 사례와 첫 실호출 전에 라벨을 고정한 추가 12개, 기존 9개 스모크를 사용했다. 모두 assistant 작성 합성 일본어 카페 stage 1 사례이며 독립 전문가 정답·독립 블라인드 평가가 아니다. 추가 12개도 수정 전/후에 재사용했으므로 최종 결과를 새로운 holdout 성능으로 주장하지 않는다.

| 최종 처리 | v5 기존 24 | 최종 v6 기존 24 | 최종 v6 추가 12 |
|---|---:|---:|---:|
| 자동 채택 | 0 | 0 | 0 |
| 검토 대기 | 15 | 10 | 6 |
| 제외 | 9 | 14 | 6 |
| 정상 후보 잘못 제외 | 0/8 | 0/8 | 0/6 |
| 부적절 후보 자동 채택 | 0/16 | 0/16 | 0/6 |

- **개선:** 기존 24개 검토 건수 15→10. 승강장 표현은 상황 fail confidence 0.97 / probability 0.98로 제외. 영어·골프·데이터베이스 등 상황/언어 불일치도 제외됐다. 추가 12개의 부적합 6개 모두 제외, 정상 6개는 보존했다.
- **미해결:** 정상 14개 모두 검토 대기. 한글 발음 도움에 낮은 확신이 반복되며, 일부 정상 후보의 상황·근거 확신도도 부족하다. 뜻과 기존 자료 중복만 확실해도 전체를 자동 통과시키지 않았다. 한글 독음까지 JEV만으로 자동 승인할 수 있다는 근거가 없다.
- 9개 스모크도 최종 채택 0 / 검토 3 / 제외 6, 기대 채택 미충족 2, `passed=false`다. 연결은 완료돼도 품질 통과로 보고하지 않는다.
- 채택 후보가 없어 이번 **실제 2차 중복 호출은 0회**다. 2차의 정확성은 기존 모의 회귀로만 확인했다.

### 실패와 수정 과정을 포함한 증거

1. 첫 v6: 8회 호출. 기존 24개 중 정상 콘센트 요청을 근거 fail로 오제외했다. 36개 전체 채택 0/검토 15/제외 21. 실패 결과를 보존했다.
2. 근거 질문을 “실제 영상을 직접 검증”하는 판단이 아니라 **분석 기록에 담긴 주장과 명시적 모순/관찰 실패를 확인**하는 판단으로 좁혔다. 설명형 근거에 원문 인용을 요구하지 않는다. 원본 진위 검증은 여전히 사람에게 남는다.
3. 수정 후 호출은 5회에서 SDK timeout으로 중단됐다. 서버 원장은 해당 요청도 HTTP 200, 서버 시간 224ms로 기록했다. 로컬/SSH 운송·대기까지 포함된 평가에서 timeout이 발생했으며, 정확한 원인은 확정하지 않았다. 미평가 18개만 별도 3회 호출했다. 완료된 유료 요청은 반복하지 않았다.
4. 최종 36개 수치는 실제 저장 응답을 **동일 앱·SDK로 오프라인 재생**한 값이다. 현재 소스 해시와 각 요청 JSON 완전 일치를 확인했다. timeout이 난 배치의 이미 도착한 200 응답도 재생했다. 연결된 단일 E2E 실행이 전부 통과한 것으로 바꾸어 기록하지 않는다.

## 개별 처리

| 사례 | 사전 기대 | 최종 처리 | 결정/검토 항목 |
|---|---|---|---|
| power-outlet | useful | review | reading |
| straw-request | useful | review | reading |
| menu-paraphrase | duplicate | excluded | novelty |
| golf-rule | irrelevant | excluded | relevance |
| milk-wrong-meaning | unreliable | excluded | meaning |
| failed-observation | unreliable | excluded | evidence |
| bad-earlier-cup | unreliable | excluded | meaning |
| good-after-bad-cup | useful | review | reading |
| valid-earlier-cup-paraphrase | duplicate | review | reading |
| english-cafe | irrelevant | excluded | relevance |
| evidence-instruction | unreliable | excluded | evidence |
| napkin-request | useful | review | reading |
| less-ice | useful | review | reading |
| no-sugar | useful | review | reading |
| menu-exact | duplicate | excluded | novelty |
| train-platform | irrelevant | excluded | relevance |
| contradictory-ice-evidence | unreliable | excluded | evidence |
| wrong-reading | unreliable | excluded | reading |
| missing-evidence | unreliable | excluded | evidence |
| good-after-unobserved-lid | useful | review | reading |
| receipt-request | useful | review | reading |
| receipt-politeness-duplicate | duplicate | review | reading |
| database-configuration | irrelevant | excluded | relevance |
| conflicting-meaning | unreliable | excluded | meaning |
| seat-reserved | useful | review | reading |
| broken-handle | useful | review | reading |
| wifi-password | useful | review | reading |
| airport-gate | irrelevant | excluded | relevance |
| hot-wrong-meaning | unreliable | excluded | meaning |
| invented-subtitle | unreliable | excluded | evidence |
| decaf-change | useful | review | reading |
| forgot-umbrella | useful | review | reading |
| dirty-table | useful | review | reading |
| hotel-checkin | irrelevant | excluded | relevance |
| stirrer-wrong-reading | unreliable | excluded | reading |
| evidence-override | unreliable | excluded | evidence |

## 검증 및 비용

- 전체 회귀 **170개 통과**; 확실한 fail/불확실한 fail·pass/확률 부족/누락 답변 fail-closed, 유효 후보만 중복 비교, 2차 실패 저장 거부와 재시도, 이전 저장 결과 호환을 포함한다.
- Next.js route typegen 이후 `tsc --noEmit --incremental false`, 변경 5파일 ESLint, `git diff --check` 통과. 초기 깨끗한 worktree의 PageProps 오류는 route typegen으로 해소됐다.
- 실제 모델 `jev-1.13.0`, 총 **16회**(첫 실험 8 + 수정 실험 5 + 미평가분 3). 유료 생성 LLM·영상 분석·운영 저장/게시 호출 0.
- 임시 키 **3개** 모두 JEV 모델/route 전용, 각각 1시간·10RPM·$0.05 상한; 각 키 회수 후 401 확인. 운영 플랫폼 키는 변경하지 않았다. 각 실행의 최대 호출 상한을 별도로 적용했다.
- 최종 비용은 같은 별칭의 LiteLLM 원장 16행 합계 **$0.006719706**다. 첫 실험 $0.003283308, 수정 실험 $0.002071566, 남은 3회 $0.001364832. 입력 159,993 / 출력 14,448 토큰. 원장 결과 파일은 아래 `cost-query.txt`다. 키 삭제 직전의 지출은 지연 반영되므로 최종 비용으로 쓰지 않는다.

## 증적과 다음 단계

- 추가 12개: `docs/qa/fixtures/20261001-jev-v6-holdout.json`, SHA-256 `3089c6db6c6d947103c1b75e089be9a2397607c48faaa3e8ea76eeb47724a10b`.
- 기존 24개: 루트 프로젝트 `docs/qa/fixtures/20261001-hanmadi-jev-quality-gold.json`, SHA-256 `e2bcf32c2231cfdb2b29bd53d17f6c52897a1bffcaa2b9c83d27f96aa26d8945`. 현 구현 branch에는 원래 root 작업 브랜치의 해당 파일을 복사하지 않았다.
- 지정 산출물 루트 `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/hanmadi-admin/` 아래 `jev-quality-20261001-v6/`(첫 실험), `jev-quality-20261001-v6-r2/`(수정·남은 호출·재생·원장). 키/사용자 데이터는 포함하지 않는다.
- r2 `source-hashes.json`, `live-results.json`, `remaining-live-results.json`, `requests.json`, `scored-results.json`, `cost-query.txt`로 소스·입출력·실패·비용을 구분한다.

다음은 독음 같은 전문 검증을 사람 또는 검증된 별도 경로로 분리할지 정하고, 독립 라벨 표본으로 자동 채택 정책을 평가하는 것이다. 상황 필터와 항목별 검토 보조의 개선은 확인했지만 자동 채택 문제는 해결됐다고 보고하지 않는다. 이번 변경은 draft PR로 검토하며, 승인 없는 머지·운영 배포는 하지 않는다.
