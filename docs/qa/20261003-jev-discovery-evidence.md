# JEV 추천 판정 보완 — 2026-10-03

고정 실호출 사례에서 확정 support reject가 다른 항목의 uncertain 때문에 최종 held가 되는 문제가 있었다. 새 요청은 확정 reject를 우선하며, opt-in 연구 흐름에서는 후보 전체를 한꺼번에 판단하던 support를 9개 필드로 나눈다. 실제 모델 품질 개선 여부는 아직 미검증이다.

## 변경 범위와 적용 상태

- 전용 worktree: `/Users/admin/workSpace/commerce-automation-kit-worktrees/jev-discovery-evidence`, 브랜치 `fix/jev-discovery-evidence`.
- 새 단일 단계는 `discovery-v1.2`, 기존 `workflow: research-v2` 요청은 `discovery-v2.1`. 입력 계약·생성 단계·클라이언트 opt-in 설정은 유지한다. core/SDK와 다른 플랫폼 소스는 수정하지 않았다.
- 완전하고 유효한 응답에서 확정 탈락이 하나라도 있으면 rejected, 그 외 불확실 항목은 held, 모두 통과하면 accepted. 응답 누락·형식 오류·통신 장애는 계속 held다. confidence .8 / 선택 확률 .8 / margin .2는 유지한다.
- v2.1의 support는 title/question/entity/location/answer/whyItMatters/openingVisual/direction/expectedAnswer 전체 필드를 빠짐없이 검사한다. 생성 모델이 제출한 일부 주장 목록만 신뢰하지 않는다. 필드 내부의 복합 문장까지 자동으로 원자 주장으로 분리한 구현은 아니다.
- 실제 관찰과 가정·연출을 구분하되 질문/연출에 담긴 사실 전제도 검사한다. 근거 부재는 uncertain, 명시적인 모순만 reject다. 기술·역사 메커니즘과 숫자는 1차 근거 요구를 유지한다.
- 후보당 JEV 요청은 여전히 1회이며 11개 질문(중복 비교 시 12개)을 한 번에 보낸다. 질문 토큰 증가에 따른 비용·지연·품질은 새 실호출로 평가해야 한다. 호출 횟수 유지가 동일 비용이라는 뜻은 아니다.
- 중복 근거는 JEV 입력에서만 합친다. URL host/default port를 정규화하되 path/query/title/excerpt가 다른 자료는 보존한다. 모든 기존 ID→대표 ID alias를 입력·판정 결과에 기록하고 원본 저장 자료·인용·조회 시점은 그대로 둔다. 다른 lead의 근거를 끌어오지 않는다.
- 저장된 v1.1/v2 진행 중 요청은 구버전 질문·집계·근거 구조를 유지한다. 다음 단계 프롬프트도 저장된 rubric을 사용한다. 완료된 결과와 멱등 재요청을 다시 판단하지 않는다.

## 직접 실행한 검증

- Python **43/43**, JS·HTTP·Shopshorts 어댑터·SDK **42/42**, 합계 **85개 통과**. 로컬 실제 HTTP와 실제 SDK 전송을 포함하지만 검색·모델 답변은 fixture다.
- 4기준의 pass/rejected/uncertain 조합 81가지에서 새/구버전 집계 우선순위를 비교했다.
- 필드 하나의 불확실성, 모순과 불확실성 혼합, 확정 reject 뒤 누락/형식 오류, 근거 ID alias와 상충 본문 보존, 구버전 research→draft 재개·멱등 결과 보존을 확인했다.
- 이전 실제 support 확률(.48/.40/.12, .08/.77/.15, 0/1/0)을 재생한 집계 테스트는 정상 과보류·불충분 보류를 그대로 유지하고 확정 모순만 held→rejected로 바꾼다. 이를 새 필드 프롬프트의 실제 품질 개선 증거로 계산하지 않는다.
- 최초 JS 실행에서 이전 rubric 문자열을 기대한 3개 테스트가 실패했다. 새 버전 문자열로 갱신 후 42개 전부 통과했다. 실패 로그도 보존했다.
- 신규 유료 호출 0회, 운영 쓰기·배포·클라이언트 활성화 0건. PR 머지와 실제 모델 품질 재검증은 별도 후속 단계다.

산출물: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/jev-discovery-evidence-20261003/`. 최종 로그 `python-final.log`, `js-final.log`; 최초 결과 `results.json`, `js.log`도 보존했다.

## 운영 전 남은 조건

1. 고정 supported/insufficient/contradicted 입력으로 새 질문별 실제 응답·오차단·누락·토큰·지연을 측정한다. 새 평가에서도 실제 운영 활성화는 품질 통과 후 결정한다.
2. 정상 근거 후보를 수락하면서 근거 부족은 보류, 모순은 탈락하는지 확인한다. 높은 정확도나 비용 절감은 아직 주장할 수 없다.
3. 해당 PR에 대한 사용자 머지 승인 후 담당 세션의 배포 절차를 따른다. 과거 평가용 키·호출 승인을 재사용하지 않는다.

설계 참고: [TypeSafe 공식 질문 분리·필드 경로·배치 지침](https://docs.typesafe.ai/primitives). 원본 품질 증적은 현재 프로젝트의 `docs/qa/20261003-jev-integration-controls.json`, `20261003-jev-integration-results.json`, `20261003-jev-final-verification.md`에 있다.
