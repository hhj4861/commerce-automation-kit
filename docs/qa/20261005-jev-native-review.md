# JEV 저신뢰 판정의 선택 계정 언어모델 검수 — 2026-10-05

**구현·연결 검증 통과, 품질 완료 기준 미통과. 운영 미적용.** Draft PR [#148](https://github.com/hhj4861/commerce-automation-kit/pull/148)의 opt-in `discovery-v2.4` 실험이다. 기본 요청은 v2.2이며 v2.3 분리 검수의 실패 결과도 그대로 보존한다.

## 확인한 변화

저신뢰 보류에 한해 기존 선택 계정의 언어모델이 원문·관측 출처·12개 검사항목을 재검토한다. JEV 원 점수/원문을 보존하고 유효한 직접 인용과 서버 검증을 통과해야 후보로 채택한다. 사람 승인은 유지한다. 재검토는 배치당 최대 1회, 전체 생성 claim 최대 3회이며, 확신 있는 거절·근거 부족·오류에는 추가 모델 호출이 없다.

첫 실검증은 가상의 시청자 예상 답을 실제 사실 주장으로 오해했다. 이를 콘텐츠의 예상 답과 사업의 기존 대안으로 구분했다. 콘텐츠의 저신뢰 expectedAnswer 거절만, 전체가 비사실적 예상이며 인용이 없다는 검수 결과일 때 해소할 수 있다. 내포된 실제 수치·장소·기제·사업 대안은 면제하지 않는다. JEV의 uncertain 선택과 확신 있는 거절은 유지한다.

## 고정된 8개 사례

| 사례 | 작성자 기대 | JEV 단독 | 최초 검수 | 역할 수정 후 |
|---|---|---|---|---|
| eiffel-1 | accepted | held | rejected | accepted |
| eiffel-2 | rejected | rejected | rejected | rejected |
| eiffel-3 | held | held | held | held |
| business-1 | accepted | held | accepted | accepted |
| business-2 | rejected | held | rejected | rejected |
| conflict-1 | held | held | rejected | held |
| conflict-2 | accepted | held | rejected | held |
| anyang-1 | accepted | rejected | rejected | rejected |

최초 4/8에서 수정 후 6/8이 기대 판정과 일치했다. 독립적인 일반 정확도나 절감률이 아니다. 사용자의 6개 라벨은 개별 문장 기준이며, 전체 후보 8개의 정답을 독립 검수한 것은 아니다. 6번의 “20~30”은 실제 측정 범위로 단정하지 않고 A=20/B=30과 미확정을 밝히는 후보로 구성했다.

추가 대조군 `content-embedded-false-premise`(예상 답 안의 730톤)와 `business-invented-alternative`(근거 없는 보급된 예약 로봇)는 모두 거절됐다. 이 둘의 JEV 점수는 기존 결과에서 빌린 합성 조건이며 신규 JEV 실측으로 집계하지 않는다.

남은 실패:
- `conflict-2`: 출처별 수치와 미확정을 명시했지만 JEV entity가 저신뢰 uncertain이므로 서버가 통과를 허용하지 않음. 언어모델이 모두 통과라고 해도 보류를 유지했다.
- `anyang-1`: 시청자의 예상 답을 JEV가 신뢰도 0.82로 거절해 검수 대상이 되지 않음. 고신뢰 판정을 임의로 우회하지 않았다.

다음 작업은 JEV 질문에서 콘텐츠 예상 답의 역할을 명확히 하고, entity의 관측 출처 판정과 함께 **새 고정 평가셋**으로 검증하는 것이다. 전체 후보 독립 라벨과 운영 계정/브라우저 E2E도 남아 있다. 위 2건 때문에 품질 1순위 완료나 운영 활성화를 선언하지 않는다.

## 실제 실행 범위·비용

- 1차: 로컬 실제 JS 클라이언트→Python HTTP→기존 운영 JEV bridge **8회**→필요한 5건만 실제 구독 Codex 검수→SQLite 저장·동일 요청 재개. 검색·research·draft는 고정 입력이다. 운영 브라우저 전체 생성 E2E가 아니다.
- 2차: 기존 JEV 스냅샷 5건과 새 대조군 2건에 **구독 검수 7회**. JEV 신규 호출 0회. 실제 응답을 최종 Python HTTP claim/complete/replay 경로에 제출해 저장, 원문·JEV 점수 보존과 외부 추가 호출 0회를 확인했다.
- JEV 기존 키 `discovery-production-20261003`, `jev-1.13.0`: ledger 39→47, 추가 비용 **$0.001908480**. 8개 모두 success. 새 키 발급·권한·예산·운영 설정 변경 없음. 전후 컨테이너 healthy 및 image/bridge/SDK 해시 동일.
- Codex CLI 0.160.0, ChatGPT 로그인, API 키 미전달, 기존 설정 `gpt-6-astra`/high. 응답 이벤트의 실제 모델 ID는 미제공이므로 독립 확인했다고 주장하지 않는다. 전체 12회 exit 0, 도구·웹 미사용. 기존 미인식 설정 경고는 보존했으며 모델 실행 실패로 집계하지 않는다.
- 구독 검수 실측 총 input=254,597, cached input=82,688, output=14,046. reasoning output=1,204은 별도 관측치이며 output에 다시 더하지 않았다. 토큰을 달러나 구독 추가 요금으로 환산하지 않았다. 호출별 검수 시간은 26.3~33.2초였다.
- 최초 서버는 작업 완료 후 Ctrl-C로 종료(exit 130), 각 클라이언트는 exit 0, 후속 HTTP 서버도 shutdown/join 완료. 준비 과정의 공개 스냅샷 input 누락은 모델 호출 전 수정했고 같은 유료 요청을 재시도하지 않았다.

## 검증과 증거

Python 67개, JavaScript 17개 총 84개 통과. 계정 철회, 만료, runtime 불일치, 중복 claim, 위조/누락/다른 출처 인용, 행별 격리, 잘못된 응답, 응답 유실 후 재개, 확정 거절 유지, duplicate 방어, 콘텐츠/사업 예외 경계를 포함한다. Dockerfile에 새 Python 모듈을 추가하고 CI에서 실제 이미지 import 검증을 추가했다. 로컬 Docker CLI는 없어 이미지 검증 결과는 PR CI에서 확인한다.

재현 가능한 원문·전체 후보·JEV 점수·출처·구독 응답·usage·두 평가 계획·소스 해시는 [JSON 증거](20261005-jev-native-review.json)에 있다. 작업 원본/프롬프트/SQLite/실행 스크립트는 `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/jev-native-review-20261005`에 보관한다. source revision이 맞지 않으면 기존 테스트 결과를 새 구현의 검증으로 재사용하지 않는다.
