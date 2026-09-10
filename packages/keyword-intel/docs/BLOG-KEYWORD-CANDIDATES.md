# 블로그용 측정 키워드 후보 export

`keyword-intel-sync.yml`은 기존 opportunity/Top 10 리포트와 별도로
`blog-keyword-candidates.json`을 만든다. 소비자는 wp-auto-blog의 건강 카테고리 시장 탐색이다.
스코어는 조사 우선순위 자료이며 발행 결정은 소비자의 공식 본문·카테고리·중복 검증을 거친다.
기존 `BlogExport`와 opportunity 산식은 바꾸지 않는다.

## 수집 품질

- DataLab 제공 `timeUnit/startDate/endDate`를 원본 신호의 trend에 보존한다.
  일별 단위가 확인된 최신 미만료 g2 시드만 사용한다. 과거 신호의 누락 단위는 추정하지 않는다.
- 실제 전일 값과 직전 7일 중 최소 5일 관측을 요구한다. 관측일 평균을 사용하며
  빠진 날을 0으로 채우지 않는다. 실제 0은 포함하고, 0을 기준으로 한 상승률/hot은 null이다.
- hot은 평균 대비 상승 55점, 전일 대비 30점, 최신 상대지수 15점의 합이다.
  상승률 환산은 0~300%로 제한한다. 월검색량·검색 순위·SEO 난이도와 다른 보조 지표다.
- hot 상위 최대 80개에 네이버 검색광고를 조회한다. 공백 제거 정확 일치만 결합한다.
  양 기기의 비음수 정수 측정이 모두 있어야 월합계를 제공한다. `< 10`은 masked,
  결측은 missing, 음수·소수·잘못된 문자열은 invalid로 구분한다. 불완전 합계는 null이다.
- 미조회·정확 일치 없음·조회 실패·마스킹 항목도 상태로 export에 남긴다.
  에러는 고정 분류만 기록하며 응답 원문이나 인증정보를 내보내지 않는다.

## JSON 경계

타입: `@cak/contracts`의 `BlogKeywordCandidates`(추가 계약).

봉투에는 `schemaVersion:1`, `kind:cak_keyword_candidates`, `profile:blog-kr`,
`generatedAt`, `expiresAt`, `compliance`, `scope`, `exclusionCounts`, `items`를 둔다.
`scope`는 요청 시드·저장 신호·적격 일별 신호·출력·상한 초과 수를 구분한다.
제외 사유는 expired/unknownTimeUnit/nonDaily/invalidSeries/missingPreviousDay/insufficientBaseline이다.

각 항목에는 원본 `capturedAt/expiresAt`, 일별 추이의 날짜·관측 수·비율·상승률·hot,
검색광고 요청/측정시각·기기별 값/상태·합계·정확 일치 키워드·광고 경쟁도를 포함한다.
성장률의 `dayPct/baselinePct`는 퍼센트 단위다. 기준이 0이면 상태는 zero_baseline이다.
계산 버전은 `daily_observed_v2`, 시간 단위 출처는 `provider_response`다.

출력 시각을 갱신해 원본 데이터 수명을 연장하지 않는다. 최대 TTL은 24시간이며,
봉투 만료는 출력 항목의 가장 빠른 만료다(빈 목록은 생성시각+TTL).
소비자는 원본·월량 측정 시각과 일별 관측일 지연도 재검증한다.

## 워크플로와 점검

기존 하루 두 번 수집은 유지한다. 후보 JSON은 이름 `blog-keyword-candidates`의 Actions artifact로
1일 보관한다. `export_only=true` 수동 실행은 수집 → hot → 월량 → artifact만 수행한다.
이 모드에서는 send_telegram 값과 관계없이 Telegram/D1 게시와 그 자격 증명 필수 검사를 건너뛴다.
원래 모드의 보고·D1 동작은 유지한다. 유효 후보 0개도 명시적인 빈 export로 전달한다.

원본 JSON은 전송 후 소비자의 runner 임시파일로 사용한다. 소비자는 고정 저장소 main의
성공한 예약/수동 실행만 읽고, 수집 실행 번호·commit SHA·artifact ID를 근거에 기록한다.
CAK의 광고 경쟁도를 소비자의 SEO 난이도로 치환하지 않는다.

```bash
npm test -w @cak/keyword-intel
npm run typecheck -w @cak/contracts
npm run typecheck -w @cak/keyword-intel
```

일반 로컬 운영 DB에서 검증 수집을 추가 실행하지 않는다. 테스트는 격리된 fixture를 사용한다.
실제 연결 확인은 필요할 때 export_only 워크플로 1회와 그 artifact를 재사용한다.
