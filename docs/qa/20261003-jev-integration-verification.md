# JEV 실제 연동 검증 — 2026-10-03

결론: **연결·요청 흐름·보수적 차단은 정상이다. 실제 추천 품질은 미통과이며 운영 클라이언트 전환은 아직 하지 않는다.**

사용자의 “jev 연동했으니 jev연동 검증을 해야지” 요청에 따라 수행했다. 이번 작업은 검증과 기록이며 SDK, 판정 정책, 운영 플래그를 수정하지 않았다. 기존 Codex JEV 담당 세션과 기준 및 결과를 직접 조율했다.

## 실행 범위

- 검사 코드: 승인 후 머지된 commerce #135 `99d6dbaf751e455c449a094101a2eb3fa1586664`의 Git archive. CLI/테스트 관련 worktree 소스도 이 리비전과 동일함을 diff로 확인했다.
- 별도 QA 컨테이너, 별도 SQLite, 서버 loopback 4196과 인증된 SSH 터널을 사용했다. 모델은 실제 응답의 `jev-1.13.0`, workflow는 `research-v2`, rubric은 `discovery-v2`였다.
- 운영 discovery는 `3857765d2028c03ad1d345cb50cc95d01cedd313`(v1.1) 그대로 유지했다. 운영 웹 E2E 또는 v2 운영 배포 성공으로 해석하면 안 된다.
- 사전 상한: 고정 사례 3회 JEV, 신규 검색 요청 1건(최대 JEV 3회·검색 4회·구독 생성 2회). 실제 JEV 호출은 총 4회였다. 통과를 위한 반복 호출이나 임계값 완화는 없었다.

## 고정 근거 비교

[사전 고정 입력](20261003-jev-integration-controls.json), [실제 응답·원장·정리 기록](20261003-jev-integration-results.json).

기존 검색에서 저장한 정부·운영기관 발췌를 사용했다. 사실이 아닌 두 비교 문장은 의도적인 검증 입력으로 작성했으며 제작·발행할 콘텐츠가 아니다. 기준 라벨은 통합 Codex의 임시 평가이며, 독립적인 사람 정답이나 블라인드 성능 평가가 아니다. JEV 담당 Codex가 같은 저장 근거를 따로 읽고 아래 해석을 확인했다.

| 고정 사례 | 사전 근거 판정 | 실제 JEV support | 실제 서버 결과 |
|---|---|---|---|
| 안양파빌리온은 공공예술도서관이며 책을 읽을 수 있다 | 지원됨 | pass, confidence .21; pass/reject/uncertain .48/.40/.12 | held: support_uncertain |
| 반구형 지붕이 속삭임을 반대 좌석으로 전달하도록 설계됐다 | 근거 부족, 모순은 입증 안 됨 | reject, confidence .66; .08/.77/.15 | held: support_uncertain |
| 도서관이 아니며 책 읽는 공간도 없다 | 정부 발췌와 명시적으로 모순 | reject, confidence .99; 0/1/0 | held: support_rejected + relevance/value_uncertain |

확인된 문제:

1. **지원되는 정상 후보도 보류됨.** 첫 사례는 근거에 도서관과 독서가 명시되고 relevance/value도 통과했으나 support의 낮은 확신 때문에 통과하지 못했다. 현 통합 판정의 과도한 보류 사례이며, 이것만으로 전체 모델 정확도를 산출할 수는 없다.
2. **근거 부족과 모순의 구분이 불안정함.** 둘째 사례는 모순 자료가 없는데 reject가 우세했다. 낮은 신뢰도를 보류하는 정책 덕분에 잘못된 확정 탈락/수락은 피했다.
3. **확정 모순보다 다른 항목의 불확실성이 최종 상태에서 우선함.** 셋째는 support_rejected가 기록되었으나 현재 reducer가 uncertain을 먼저 처리해 held로 표시한다. 모두 추천에서 차단되므로 오발행 증거는 없지만 탈락 사유 전달은 개선 대상이다. 확정 reject 우선 정책은 별도 버전·혼합 판정 회귀 검증과 승인된 변경이 필요하다.

고정 원본은 두 근거다. 실제 서버 흐름에서는 첫 자료가 후속 검색 fixture로 다시 들어가 **3행 / URL·본문 기준 2개 고유 자료**가 JEV에 전달됐다. 중복 없는 두 자료만 전달했다고 주장하지 않는다. 동일 조건의 비교이며 중복 통합과 evidence ID alias 보존은 후속 개선 대상이다. 고정 사례의 검색·후보 생성은 fixture이고 JEV 호출과 서버 판정은 실제다.

각 사례의 completion을 다시 제출했을 때 저장된 동일 결과가 반환되었고 JEV 추가 호출은 없었다. 각 `generationClaims=2`는 fixture 결과 제출을 위한 claim이며 실제 구독 생성 두 번을 뜻하지 않는다.

## 신규 검색부터의 실제 E2E

요청 `57c8c919-bf6d-4bff-85bf-c552bfc66260`, **42.6초**.

- 입력: 포항 스페이스워크의 롤러코스터 같은 외형과 실제 이용 방식에 대한 국내 건축 쇼츠 주제.
- 공식 Naver 검색 2회 → 기존 Codex 구독으로 research/draft 2회 → 실제 JEV 1회 → CLI 결과 반환.
- 서버 `action_results`에 research 완료 후 확장된 20개 근거가 draft 프롬프트에 들어갔고, 두 번째 완료가 저장된 것을 확인했다.
- 생성 후보: “롤러코스터처럼 생겼는데 걸어 올라간다고? 포항 스페이스워크”. 답은 달리는 놀이기구가 아니라 사람이 직접 계단을 걷는 조형물이라는 내용이다.
- relevance .99, value .99; support는 pass지만 confidence .68 / pass 확률 .79 / margin .63이었다. 정책의 .8 기준을 충족하지 못해 **held**, CLI exit 2. 검색/인증 장애나 빈 후보는 아니었다.
- 이 새 사례의 검색·자료가 고정 사례와 다르므로 프롬프트 변화나 모델 개선의 인과 효과로 비교하지 않는다. 모든 사실을 독립적으로 확인한 콘텐츠 인증 결과도 아니다.

## 클라이언트·격리 검증

- JS와 Python의 실제 HTTP 클라이언트로 동일 idempotency key를 재요청했다. 같은 requestId와 search 2 / generation 2 / JEV 1을 유지했고 새 생성은 0회였다. 기존 Codex 로그인 상태를 재확인했다.
- 잘못된 키 401, 다른 subject 404, 브라우저 Origin 403을 실제 QA HTTP 경로에서 확인했다.
- 실제 응답 4종을 Shopshorts의 현행 `discoverRecommendations` 어댑터에 replay했다. 모두 `DISCOVERY_NO_ACCEPTED_CANDIDATES`로 걸러졌다. 이는 캡처 결과 기반 어댑터 검증이며 로그인된 운영 브라우저 E2E는 아니다.
- 같은 소스의 회귀 테스트 **Python 36 + JS 25 = 61개 통과**. 이 테스트의 검색·모델 fixture는 실제 품질 검증과 구분한다.
- Claude 실제 계정 생성, 운영 Shopshorts 로그인 경로, 이번 리비전의 블로그 Actions/venture 실제 실행은 이번 검사에 포함하지 않았다. 하나의 CLI 검사를 모든 플랫폼의 운영 성공으로 보고하지 않는다.

## 비용·종료 상태

- 기존 discovery 전용 모델·경로 제한 키 사용. USD 1/30일, 10 RPM, 만료 2026-11-02 06:00:33 UTC 설정을 변경하지 않았다. 운영용 키이므로 유지한다.
- scoped gateway 원장: 8행/USD .00110628 → 12행/USD .001526952, 차액 **USD .000420672**. 이것은 JEV 원장 값이며 검색·구독 전체 비용은 아니다. `costUsd:null`을 무료로 해석하지 않는다.
- 이번 QA 컨테이너·네트워크·이미지 태그를 제거했고 SSH 터널 실제 exit 0을 수집했다. audit SQLite는 승인된 비공개 서버 경로 `/opt/shared-ai/discovery/verify-99d6dba`에 보존했다. 비밀정보를 iCloud나 Git으로 새로 복사하지 않았다.
- 운영 discovery는 기존 이미지와 healthy 상태를 유지했다. 클라이언트 활성화, 게시, 신규 운영 배포는 하지 않았다.

다음 수정 대상은 근거 판단을 작은 주장별로 평가하는 방식과 확정 탈락/보류의 집계 정책이다. 임계값을 낮추어 강제로 통과시키기보다 이 고정 회귀 사례로 정상 후보 수락과 불충분·모순 후보 차단을 함께 확인해야 한다.

## 사용자 지정 협업 — 통신 복구 확인

사용자는 이 Codex를 리드, 기존 Claude PID 35652를 팀원으로 지정했다. 리드 스레드는 `01a0b3ac-df1b-7293-a99c-74f3c6e650d0`, Claude 세션은 `0169c5a6-7305-44fd-a610-72b142184d2b`다. 기존 Codex JEV 세션의 core 소유권은 유지한다.

초기에는 UI timeout/ORCH_DISABLED로 전달이 막혔다. 이후 지정 `.git/peer-mailbox/`에 답신을 저장하자 기존 Claude Monitor가 실제 수신했고 002 ACK와 003 진행 보고를 반환했다. Codex도 새 보고를 감지해 현재 스레드에 자동 알림을 넣는 왕복 경로를 실제 확인했다. 상세 범위·30분 감시 한계는 `20261003-codex-claude-coordination.md`를 참조한다.

Claude의 요청 보고는 HyperFrames P0였으므로 해당 과제를 JEV와 분리해 범위를 승인했다. JEV 검증 자료 경로와 품질 NO-GO 상태는 전달했으나, Claude의 JEV 실질 검토 완료는 아직 없다. 통신 연결이나 HyperFrames 진행을 JEV 품질 해결·운영 활성화로 보고하지 않는다.
