# JEV 역할 구분과 저신뢰 재판정 — 2026-10-05

**기존 오판 2건 해소, 구현·기록 응답 재검증 완료. 최종 전체 실호출 검증은 저장 공간 오류로 미완료. 운영 미적용.** 동일 Draft PR [#148](https://github.com/hhj4861/commerce-automation-kit/pull/148), base `3b7ca5b`의 후속이다.

## 최종 동작

새 `reviewMode=native-llm-v1` 요청은 `discovery-v2.6`에 고정된다. 기본 research-v2는 v2.2 그대로다. 저장된 v2.4는 기존 질문/채택 규칙을, v2.5는 역할 질문과 기존 채택 규칙을 유지한다.

- 콘텐츠 expectedAnswer는 반전 전 가상의 시청자 예측이다. 예측이 틀린 것 자체는 모순이 아니지만, 문장에 내포된 측정값·장소·과거 사건 등은 검증한다.
- entity는 이름과 그 필드가 실제 주장하는 속성만 검증한다. 다른 필드의 높이 충돌이 관측된 대상 이름까지 부정하지 않는다.
- 사업 expectedAnswer는 실제 기존 대안이다. `not_applicable` 선택지를 제거해 상상·제안·미지정 대안이 사실 검증을 면제받지 못한다.
- v2.6에서는 **저신뢰 uncertain**과 **저신뢰 value reject**를 원문/모든 사실/출처 인용을 검증한 언어모델의 완전한 통과 판정으로 해소할 수 있다. 이전 규칙은 언어모델의 근거 검토를 통과해도 이런 선택을 일괄 보류해 재검토 목적을 막았다.
- 신뢰도 .8·확률 .8·margin .2 기준은 유지한다. 고신뢰 거절·고신뢰 불확실성·잘못된 응답은 검수 대상이 아니다. 저신뢰 사실 거절도 기존 예외(순수 콘텐츠 예상 답) 외에는 유지한다. 언어모델의 불확실·거절·위조 인용·오류는 통과시키지 않는다. 사람 승인 유지.

## 사전에 고정한 결과

| 사례 | 작성자 기대 | v2.5 실호출 | v2.6 기록 응답 재검토 |
|---|---|---|---|
| eiffel-1 | accepted | accepted | accepted |
| eiffel-2 | rejected | rejected | 재검토 대상 아님 |
| eiffel-3 | held | held | 재검토 대상 아님 |
| business-1 | accepted | accepted | accepted |
| business-2 | rejected | rejected | rejected |
| conflict-1 | held | held | held |
| conflict-2 | accepted | accepted | accepted |
| anyang-1 | accepted | accepted | accepted |
| haesol-1 | accepted | held | accepted |
| haesol-2 | rejected | rejected | 재검토 대상 아님 |
| haesol-3 | not_accepted | held | 재검토 대상 아님 |
| baram-1 | accepted | accepted | accepted |
| baram-2 | not_accepted | rejected | 재검토 대상 아님 |
| baram-3 | rejected | rejected | rejected |

첫 고정 실호출은 기존 8건 **8/8**, 새 합성 대조군 6건 **5/6**이 기대와 일치했다. 안양의 예상 답 오판과 출처별 높이를 밝힌 후보의 entity 보류는 해소됐다. 신규 해솔 정상 후보는 JEV value reject 신뢰도 0.33 때문에 보류됐고, 실제 언어모델은 전 항목을 통과시켰다. 이 결과를 바꾸기 위해 프롬프트를 반복 호출하지 않고, 위의 저신뢰 채택 정책을 분리해 v2.6으로 고정했다.

사업의 비사실 면제 제거 후 정상 한빛 후보는 명시된 위치를 JEV가 낮은 신뢰도로 uncertain으로 분류했다. 언어모델의 근거 검토는 통과했다. v2.6으로 **이미 받은 실제 검수 응답 10건**을 HTTP claim/complete/재개에 제출해 모두 기대 판정과 일치함을 확인했다. 여기에는 정상 해솔/한빛의 보류 해소, 근거 없는 수익 보장 거절, 출처 충돌 보류가 포함된다. 신규 모델 호출은 0회이며 원 JEV 점수/원문을 보존했다.

이 기록 응답 검증은 새 정책의 동작 검증이지 새 모델 품질 실측이나 독립적인 정확도 수치가 아니다. 특히 콘텐츠 9개 payload는 사업 전용 수정 전후 동일함을 비교했지만, 최종 사업 질문의 전체 검증은 아래 사유로 남아 있다.

## 저장 오류와 미완료 범위

사업 후속 6건 중 1건은 완료했고, 2번째 `business-2`는 JEV 서버에서 호출 성공·과금이 기록됐으나 로컬 저장이 `ENOSPC`로 실패했다. 요청 DB는 `reviewing` 상태이며 응답과 검수 결과는 없다. SQLite 무결성은 `ok`. 이를 서비스 판정 실패나 안전 통과로 계산하지 않았다. 해당 호출은 재시도하지 않았다.

남은 `baram-1`~`baram-4`는 시작하지 않았다. 작은 쓰기 시험은 성공했으나 여유 공간이 약 875MB→156MB→924MB로 변해, 후속 서버도 클라이언트 시작 전에 종료했다. 다른 세션의 파일·캐시는 삭제하지 않았다. 공유 npm 다운로드 캐시 정리 여부는 사용자 확인을 요청한 상태다. 실제 공간 안정화와 남은 4건 및 중단 1건의 별도 새 고정 검증, v2.6 전체 외부 호출 검증을 완료하기 전 운영 활성화하지 않는다.

## 실행·비용·검증

- 초기 14요청: JEV 13회(근거 없는 대상 1건은 생성/근거 단계에서 차단), 구독 검수 9회, 모든 완료 응답의 동일 요청 재개가 동일함을 확인. 클라이언트 exit 0, 서버 명시 종료 exit 130.
- 사업 후속: JEV 2회(두 번째 결과 저장 실패), 구독 검수 1회. 클라이언트 exit 1(ENOSPC). 서버 및 미시작 후속 서버 명시 종료 exit 130.
- 이번 턴 합계 JEV **15회**, ledger 47→62, **$0.003532830**. 기존 `discovery-production-20261003` 키의 모델/예산/권한을 바꾸지 않았다. 전후 bridge/SDK/image 해시와 healthy 상태 동일. 추가 모델 호출 중단 이후 재호출 없음.
- 구독 검수 **10회**, ChatGPT 로그인·기존 모델 설정 gpt-6-astra/high, Codex CLI 0.160.0. 실제 응답에 모델 ID는 없으므로 설정값과 관측값을 구분한다. API 키 미전달. input 212,938, cached input 88,320, output 11,395, reasoning output 838(output에 중복 가산하지 않음). 구독 달러 비용은 미확인이다.
- 최종 로컬 Python 71개 + JS 17개 = **88개**. v2.4 재개, v2.4/v2.5 채택 규칙 고정, 고신뢰 보존, 근거 없는 대안의 비사실 면제 거부, 검수 미해결/거절/위조 인용, 계정 철회·만료·중복 요청을 검증한다.
- 실제 검색/대본 생성/운영 브라우저는 이번 검증에 포함되지 않는다. 검색·research·draft는 고정 입력이다. 공식 출처 발췌와 합성 자료를 구분했으며 전체 후보 기대 라벨은 작성자 기준이다.

전체 입력, 계획, JEV wire payload/점수, 구독 응답, 중단 기록과 HTTP 재검증은 [JSON 증거](20261005-jev-role-review.json), 고정 사례는 [평가 fixture](../../services/topic-discovery/fixtures/role-review-eval.json)에 있다. 실행 원본은 `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/jev-role-review-20261005`에 보관했다. 실패한 호출의 로컬 응답을 재구성하거나 존재하는 것처럼 채우지 않았다.
