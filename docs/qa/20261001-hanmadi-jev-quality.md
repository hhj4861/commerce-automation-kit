# Hanmadi Jev 품질평가 — 2026-10-01

상태: 고정된 합성 24사례의 실제 Jev 평가·앱 판정 재생 완료. 기대 분류와 20/24 일치하며 오차단이 남아 전체 품질 통과로 판정하지 않는다.

사용자 요청: “품질평가 테스트 해보자.” 일본어 카페 1단계의 합성 후보 24개를 현 운영 rubric v4로 평가한다. 원본 영상·사용자 정보·Gemini 호출·초안 저장·게시·운영 기준 변경은 포함하지 않는다.

- 정답은 [고정 fixture](fixtures/20261001-hanmadi-jev-quality-gold.json)에 기록했다. useful 8, duplicate 4, irrelevant 4, unreliable 8. 독립 전문가 검수 정답이 아니라 실행 전에 작성한 기대 분류이며, 이전 오류를 참고한 회귀/경계 사례를 포함한다. 일반 정확도 추정용 무작위 표본이 아니다.
- 실제 앱 `judgeVideo`의 v4 요청을 외부 호출 없이 추출하고 같은 결과를 앱 함수에 재주입해 판정한다. 기본 표현 corpus와 최대24개/9KB 후보 제한을 유지한다. 골드 라벨은 API 입력에 포함하지 않는다.
- 6개씩 4회, 재시도 없음. 요청 12초 제한, 현 기준 useful confidence≥0.85 및 useful 확률≥0.90 유지. 필요한 평가 임시 키는 Jev 단일 모델/경로, 1시간, 10RPM, 최대 $0.05로 제한하고 종료 시 회수한다. 실제 키 생성·회수 여부는 실행 결과에 기록한다.
- 원시 분류 일치, useful 오차단/비유용 후보 useful 오판, 자동 채택의 잘못된 통과, 검토대기, API/파싱 실패를 따로 계산한다. 응답 실패를 정답으로 세지 않는다.
- 비용은 LiteLLM 실제 기록으로 보고하며 예산 상한과 구분한다. 지연은 작은 배치4개의 관측값이고 서비스 p95 보장으로 해석하지 않는다.

## 결과

2026-10-01 09:30:17.648–09:30:18.674 UTC, 모델 `jev-1.13.0`, rubric `hanmadi-video-jev-v4`, 소스 `b90532beb733b32c81d5f148f71743faf236a5a0`. 기존 기본 표현 corpus·참조 제한을 유지한 실제 `judgeVideo` 요청 4개를 사전 추출해 호출했다. 응답을 같은 앱 함수에 재주입하면서 요청 바이트의 JSON 동등성, SDK 응답 검증과 앱의 exact-duplicate/채택 로직을 확인했다. 결과 재생은 외부 호출 0회다. 고정 정답의 expectedChoice·reason은 제공자 입력에 포함하지 않았다.

| 지표 | 결과 |
|---|---|
| 요청/평가 가능 사례 | 4/4 HTTP 200, 24/24 SDK 검증·앱 재생 성공 |
| 기대 분류와 일치 | 원시 Jev 20/24, 앱 유효 분류 20/24 (83.3%) |
| 유용한 표현을 잘못 제외 | **3/8 (37.5%)** |
| 비유용 후보를 useful로 오판 | **1/16 (6.25%)**, 신뢰도 미달로 검토대기 |
| 잘못된 후보 자동 채택 | 0/16. 작은 합성 표본에서 관측되지 않았다는 뜻 |
| 정상 후보 채택 조건 통과 | 1/8 |
| 검토대기 후보 | 5/24 = 기대 useful 4 + 기대 irrelevant 1 |
| 제외 후보 | 18/24 = 올바른 제외 15 + 잘못된 제외 3 |
| API/응답 파싱/재생 실패 | 0; 모델 호출 재시도 0 |
| 배치별 gateway 왕복 시간 | 288 / 240 / 213 / 180ms, 중앙값 226.5ms |
| 실제 사용량 | 입력 27,087 / 출력 1,227 토큰 |
| LiteLLM 비용 기록 | **$0.001137654** (예산 $0.05와 구분) |

채택/검토/제외 수는 후보 단위의 오프라인 앱 판정이다. 실제 초안을 저장하거나 게시하지 않았다. 실제 저장 로직에서는 한 후보라도 저신뢰 useful이면 초안 전체를 검토대기로 표시한다. 채택 조건 통과 1개를 자료 자동 게시나 학습 반영 1건으로 해석하지 않는다.

지연은 VM 내부의 gateway 왕복 4개 배치에 대한 관측이다. 영상 분석, 앱 대기, 사용자 네트워크와 사람 검수를 포함하지 않으며 원래 영상 1건의 65초와 직접 비교하지 않는다. 적은 표본의 p95/일반 성능 보장은 하지 않는다.

## 실패·경계 사례

| 사례 | 사전 기대 → 실제 | 관측 |
|---|---|---|
| 틀린 한국어 뜻의 컵 후보 다음에 올바른 같은 문장 | useful → duplicate, confidence 0.57 | rubric은 잘못된 앞 후보를 중복 근거에서 제외하라고 하지만 정상 표현도 제외됨 |
| 관찰 근거 없는 뚜껑 후보 다음에 근거 있는 같은 문장 | useful → duplicate, confidence 0.37 | 근거 없는 이전 후보의 영향을 받는 형태가 재현됨 |
| 카페 영수증 요청 | useful → unreliable, confidence 0.41 | 문장·뜻·독음·근거가 있는 후보를 제외. Jev가 이유를 반환하지 않으므로 정확한 오판 원인은 추정하지 않음 |
| 역의 3번 승강장 위치 질문 | irrelevant → useful, confidence 0.45 | 카페 상황과 불일치하지만 useful. confidence/useful 확률 기준이 자동 채택을 막고 검토대기로 보냄 |

잘못된 뜻, 지시문을 근거로 위장한 입력, 관찰 실패, 모순 근거, 틀린 독음 등 기대 unreliable 8개는 이 표본에서 모두 unreliable로 분류됐다. 중복 4개도 모두 duplicate, 관련 없음 4개 중 3개가 irrelevant였다. 기대 useful 8개 중 useful로 남은 것은 5개이며, 이 중 1개만 채택 조건을 통과했다.

## 판단과 다음 개선

**현 v4를 모든 의미 판단의 무인 제외/채택기로 확대하기에는 이르다.** 검사 보조와 검토대기 분리는 유효하게 작동했지만 유용한 자료를 잃는 문제가 확인됐다.

1. 저신뢰 `duplicate`·`unreliable`·`irrelevant`도 바로 제외하기보다 검토대기로 보낼지 검토한다. 현재 confidence 기준은 useful의 채택에만 적용되며, 저신뢰 부정 판정은 제외된다.
2. 잘못된 앞 후보가 정상 후보의 중복 기준이 되지 않도록 입력 구성/판단 단계를 개선한다. 추가 호출이 필요하다면 지연·비용과 함께 비교한다. 프롬프트 지시만으로 해결됐다고 가정하지 않는다.
3. 수정 후에는 이번 사례를 회귀셋으로 유지하고, 독립 사람이 검수한 새 사례·실제 언어/상황별 자료로 별도 평가한다. 이번 기대값을 결과에 맞춰 고치거나 기준을 낮춰 통과율만 높이지 않는다.

이번 요청에서는 운영 rubric·임계값·키 권한·게시 흐름을 수정하지 않았다. 위 항목은 후속 개선 제안이다. 다른 언어·Festa 인터뷰·블로그 중복 판단의 품질은 이 결과로 검증되지 않는다.

## 비용·키·종료 증적

- 첫 실행 준비는 원격 셸의 `Argument list too long`으로 프로그램 시작 전 실패했다. 이때 키 발급/모델 호출은 없었다. 같은 고정 입력을 압축한 뒤 실제 평가 4회를 실행했고, 실패 사례를 재호출하지 않았다.
- 평가 전용 임시 키 **1개**: alias `hanmadi-jev-quality-v4-20261001-1790847017`, 모델 `jev-1.13.0`, 경로 `/typesafe/v1/systemone`, 1시간 만료, 10RPM, $0.05/1d. 키 원문은 서버 프로세스 메모리에서만 사용했고 출력·저장하지 않았다.
- 평가 종료 시 삭제했고, 같은 키로 모델 목록 조회 시 **401** 확인. 운영용 Hanmadi/Festa 키는 회수하지 않았다.
- 키 삭제 전 즉시 정책 조회의 spend는 0.0이었다. 후속 PostgreSQL 읽기 집계에서 09:30:15–09:30:25 UTC의 `typesafe/jev-1.13.0` **4행**, 입력27,087/출력1,227와 비용 **$0.001137654**를 확인했다. 응답 usage 합계와 일치한다. 최초 0.0을 무료로 해석하지 않는다. 이 기록은 LiteLLM 계상이며 공급자 청구서 대사는 하지 않았다.
- 실행·키 회수·오프라인 재생·비용 조회 프로세스의 실제 종료를 확인했다. 운영 서버 설정 변경, 영상 접근/Gemini 호출, 초안/DB 자료 저장, 파인튜닝은 없었다. 비용 조회는 읽기 전용이다.

## 사례별 판정

| ID | 기대 | Jev / 앱 | confidence | useful 확률 | 후보 처리 |
|---|---|---|---:|---:|---|
| power-outlet | useful | useful / useful | 0.78 | 0.84 | review |
| straw-request | useful | useful / useful | 0.87 | 0.90 | accepted |
| menu-paraphrase | duplicate | duplicate / duplicate | 0.90 | 0.05 | excluded |
| golf-rule | irrelevant | irrelevant / irrelevant | 0.34 | 0.30 | excluded |
| milk-wrong-meaning | unreliable | unreliable / unreliable | 0.98 | 0.01 | excluded |
| failed-observation | unreliable | unreliable / unreliable | 0.97 | 0.01 | excluded |
| bad-earlier-cup | unreliable | unreliable / unreliable | 0.96 | 0.03 | excluded |
| good-after-bad-cup | useful | duplicate / duplicate | 0.57 | 0.17 | excluded |
| valid-earlier-cup-paraphrase | duplicate | duplicate / duplicate | 0.64 | 0.12 | excluded |
| english-cafe | irrelevant | irrelevant / irrelevant | 0.29 | 0.32 | excluded |
| evidence-instruction | unreliable | unreliable / unreliable | 0.97 | 0.01 | excluded |
| napkin-request | useful | useful / useful | 0.65 | 0.74 | review |
| less-ice | useful | useful / useful | 0.69 | 0.76 | review |
| no-sugar | useful | useful / useful | 0.64 | 0.73 | review |
| menu-exact | duplicate | duplicate / duplicate | 0.31 | 0.44 | excluded |
| train-platform | irrelevant | useful / useful | 0.45 | 0.59 | review |
| contradictory-ice-evidence | unreliable | unreliable / unreliable | 0.59 | 0.24 | excluded |
| wrong-reading | unreliable | unreliable / unreliable | 0.88 | 0.08 | excluded |
| missing-evidence | unreliable | unreliable / unreliable | 0.99 | 0.01 | excluded |
| good-after-unobserved-lid | useful | duplicate / duplicate | 0.37 | 0.16 | excluded |
| receipt-request | useful | unreliable / unreliable | 0.41 | 0.41 | excluded |
| receipt-politeness-duplicate | duplicate | duplicate / duplicate | 0.76 | 0.04 | excluded |
| database-configuration | irrelevant | irrelevant / irrelevant | 0.77 | 0.00 | excluded |
| conflicting-meaning | unreliable | unreliable / unreliable | 0.88 | 0.08 | excluded |

## 재현 자료와 한계

- 골드 SHA-256: `e2bcf32c2231cfdb2b29bd53d17f6c52897a1bffcaa2b9c83d27f96aa26d8945`.
- 산출물: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/hanmadi-admin/jev-quality-20261001-v4/`.
- `requests.json`: 실제 앱에서 추출한 비민감 합성 요청. `live-results.json`: 원시 분류·확률·usage와 키 회수 증적. `scored-results.json`: 앱 판정 재생 결과. 세 파일의 즉시 spend=0 기록은 위 DB 후속 확인으로 보완하며 과거 관측은 덮어쓰지 않는다.
- `capture.mjs`, `replay.mjs`는 외부 호출 없는 준비/재생 도구. `run-live.py`는 임시 키를 발급하고 유료 호출하므로 명시된 범위 없이 재실행하지 않는다.
- 일본어 카페 1단계·고정 기본 corpus의 합성 사례에 한정한다. 라벨은 실행 전에 모델이 작성했고 독립 전문가 검수는 없다. 영상 원문 검증·사람 검수 품질·모든 언어의 일반 정확도·전체 운영 비용 절감을 측정하지 않았다.

| 산출물 | SHA-256 |
|---|---|
| requests.json | `1ec9396957ac9261707e64faf780a5ef6add7d6ecd0d03c9995c8c2cea1f3514` |
| live-results.json | `e5be569e1375df3b952dc9661b951046c12fe3e5fce57b148403347df79388b9` |
| scored-results.json | `116cebf14711f90b7b25ecbf86b5a912ae387c32dd2a763cf3e11630d23a985b` |
