# Jev 플랫폼별 기능과 적용 후보 상세 검토

2026-09-30 | 코드 기준 조사 | 구현·유료 호출·운영 변경 없음

Jev는 모든 플랫폼에 붙이는 필수 모듈이 아니다. 기존 LLM이 수행하는 제한된 판단을 대체하거나, 현재 규칙만으로 놓치는 의미 판단을 추가할 때 검토한다. 우선 비교 실험은 **Festa 인터뷰의 주제 판단과 블로그의 주제 중복 판정**이다. 생성 모델 자동 선택은 별도의 비용·품질 실험으로 분리한다.

이 문서는 아래에 고정한 코드 범위에서 **49개 기능·판단 영역**을 목록화한 확장 검토다. 모든 미래 활용 가능성이나 운영 환경 전체를 전수 검증했다는 뜻은 아니다. [한 장 요약](20260930-jev-platform-summary.md)과 [요약 PDF](20260930-jev-platform-summary.pdf)를 함께 제공한다.

## 2026-10-01 갱신: 의미 판단의 Jev 우선 적용

사용자 지시: **“판단을 요하는 부분에는 가급적 다 jev를 사용하자.”** 아래 2026-09-30 표는 최초 조사 스냅샷으로 보존하고, 현재 상태와 우선순위는 이 절 및 [최신 요약](20260930-jev-platform-summary.md)을 우선한다. 원래 P2/P3도 포기한 항목이 아니라 입력·품질·경제성을 확인해 순차 적용할 후보로 확대한다. 49개 항목 전부에 API 호출을 추가한다는 뜻은 아니다.

### 이전 항목별 잔여작업 대조

| 이전 ID | 현재 확인 범위 | 남은 작업 |
|---|---|---|
| G1 | 공통 SDK 0.4.0, LiteLLM 1.102.1 pass-through, 제한 키, 외부 POST 경로, 실제 호출 검증 완료 | 신규 앱의 의존성·앱별 키·업무 기준·운영 증적. Python 어댑터 미구현 |
| F1 | 사전 판단 v3 구현, 운영 shadow의 관찰 이벤트와 기존 LLM 질문 응답 확인 | 여러 사례의 주제 선택·조기 종료·정정·조건 누락·저신뢰 복귀를 평가하고 on 승격 결정 |
| F2 | 기존 LLM 생성 유지. Jev 채택 경로의 코드와 형식 검사는 존재 | 사전 방향이 맞아도 생성 질문이 반복·가정을 만들 수 있으므로 해당 품질 확인. 사후 Jev 검사는 비용·필요성에 따라 선택 |
| F3~F6 | 도시·코스·최종 추천 근거·자연어 탐색은 후속 후보 | 허용 후보/근거 ID 계약, 사람 평가, 적용 여부 결정. 별도의 festival-ranking-jev shadow 스크립트와 점수 데이터는 있으나 이 네 기능의 운영 완료 증거가 아님 |
| S1 | 확인한 main의 Shopshorts에 Jev 호출 미발견 | 소재·핵심 질문·기존 콘텐츠 의미 중복, 계정별 후보 범위, 유용한 변형 보호 |
| S2~S7 | 아직 업무 연결·운영 검증 증적 없음 | 카테고리 적합성, 주장-근거, 설명 구조, 대본-장면, 음성/음원 설명-분위기, 표현 과장 의심 판단. S6은 사용 가능한 자산 설명이 선행 |
| H1·H2·H4·H5 | 확인한 main에서는 Jev 호출이 관리자 영상 평가에만 있음 | 검색 후보 관련성, 회화 의도·전환, 번역 의미 보존, 재사용 표현 적합성. 언어별 검증과 데이터 사용 범위 필요 |
| H3 | 신규 의미 채점 후보 | 목표/정답 자료, 전사 오류 영향, 언어별 평가를 준비한 뒤 형성 평가로 적용 |
| A2·A3 | PR #103 영상 후보의 학습 적합성·의미 중복 판단 코드와 운영 키 연결. 소규모 합성 평가에서 오판/저신뢰 사례 확인 | 영상 분석 응답 오류를 먼저 해결해 실제 Jev→초안/검토대기 저장 검증. 일반 수업 초안·기여 표현 경로까지 확대하려면 별도 연결·평가 필요 |
| A4 | 규칙 기반 약점 분류의 후속 후보 | 교정 전후/메모의 허용 입력, 복수 분류 기준과 검수자 정답을 준비해 규칙과 비교 |
| A5·A6 | 수업 추천·공식 검색의 텍스트 관련성은 후속 후보 | 승인된 수업 팩과 입력 자료 확보. 영상 생성·검색·사용권 검증 자체를 Jev로 대체하지 않음 |
| B1 | wp-auto-blog 로컬 main `ad042b9`의 src/tests에서 Jev 호출 미발견 | Python 어댑터, 기존 중복 판정 대체, 경계 사례·오차단 평가, 불확실 시 기존 검토/보류 |
| B2·B3 | 최초 조사상의 후보, 후속 Jev 구현 미발견 | 검색 관련성과 근거 구절 ID 선택, 기획의 질문별 근거 충족. 인용문·기획 생성·최신성 검증은 유지 |
| B4 | 글 생성·규칙 관련 글 순위 유지 | 승인된 글 후보의 의미 순위 보완을 추가할 때 평가. 생성 자체는 LLM |
| G2·G5·H8 | 공통 업무 판단 연결과 별개, Auto Router 운영 활성 증적 없음 | 설치 버전 지원·허용 모델·실제 호출 경로 확인, 고정/규칙/Jev 모델 선택 비교, 사용자 선택 보존 |
| G3 | 공통 의미 검사는 기능별 적용 후보이며 전 요청에 자동 삽입되지 않음 | 분야별 판정 기준·허용 오차·제한 시간·실패 처리·관측 계약을 정한 뒤 필요한 단계에 적용 |
| R1·R4·R6 | 최초 조사에서는 실제 앱 LLM 호출 미발견. 지정된 `/Users/admin/workSpace/replay-live-poc`가 이번 확인 시 존재하지 않아 최신 소스는 재확인 못함 | 현재 저장소 위치/운영 소스 확인, 설명·전사 또는 자연어 장애 입력 확보, Dify 실제 연결 확인 후 의미 검색/분류 판단 |
| F7·S8~S10·H6·H7·A1·A7·R2·R3·R5·G4·G6·B5 | 생성·결정적 처리·권한·게시 관리 등 유지 대상 | Jev로 치환하는 잔여작업에 포함하지 않음. 관련 의미 보조 기능은 위 해당 ID에서 별도 다룸 |

### 실행 순서와 공통 계약

1. **진행 중인 연결 완료:** Hanmadi 영상 응답 계약 수정 #110의 운영 승격 #111, 승인된 동일 영상 1건의 분석→Jev→저장 검증. 2026-10-01 조회 시 #110 main 머지 완료, #111 마지막 CI 진행 중, 운영은 #109. 이전 실패는 HTTP 200 이후 JSON 해석 오류이며 Jev 호출·초안 생성 없음.
2. **즉시 비교할 의미 판단:** Festa F1 shadow 품질 평가와 채택 결정, 블로그 B1 기존 LLM 중복 판정 대체, Shopshorts S1 의미 중복 검사. 원래 계획의 P1을 우선 완료한다.
3. **인접 기능 확대:** Hanmadi H1/H2/H4/H5/A4, 블로그 B2/B3, Shorts S2/S3/S4/S5/S7, Festa F3/F4/F5. 검색 후보·생성 계획의 적합성은 가능하면 생성 전에 평가한다. 생성 후 번역·대본 의미 검사는 필요한 품질 항목에만 붙인다.
4. **입력 의존 기능:** H3/A5/A6, F6, S6, B4, Replay. 새로운 기능·자료가 필요한 곳은 판단 입력부터 마련한다.
5. **모델 자동 선택:** G2/G5/H8은 별도 비교 실험으로 수행한다. Jev를 쓴다는 이유만으로 기존 모델·개인 구독을 자동 전환하지 않는다.

공통 SDK의 전송 계약은 유지한다. 업무 계층에서 `taskId`, 입력 스키마/허용 범위, `rubricVersion`, 선택지·판단 보류, 기능 모드(off/shadow/on), 시간·비용 한도, 업무별 채택 기준, 실패 시 처리, 요청 ID와 비민감 지표를 정의하는 작업이 남아 있다. JS/TS와 Python 어댑터에 같은 계약 사례를 적용한다. 새 서버가 필요하다는 뜻은 아니다.

판단할 정보가 없는 요청·이미 결정적 코드로 답이 나오는 요청은 보내지 않는다. 동일 문맥의 여러 기준은 한 요청으로 묶는 방안을 우선하고, 캐시를 쓰는 기능은 입력·모델·rubric·기준의 변경을 반영한다. 공통 SDK가 현재 자동 캐시·재시도를 제공한다고 가정하지 않는다. 기능별 추가·대체 호출 수와 복귀 후 총비용을 측정한다.

### 공통으로 아직 끝나지 않은 검증

- 기존 방식과 같은 입력의 평가셋, 조정 자료와 별도 평가 자료 분리. P1별 100~200개는 최초 탐색 제안이며 현재 완료 수나 유료 호출 허가가 아니다.
- 정상 후보 오차단·잘못된 통과·조기 종료·반복 질문·검수자 일치도와 전체 성공률, p50/p95 지연, 복귀율, 실제 총비용. 소수 성공 예시나 confidence 수치만으로 대체를 확정하지 않는다.
- 한·일·영·태·스페인어 등 실제 사용하는 언어별 기준. 근거 불충분·정정·상충·모호함·지시 삽입·시간 초과·취소·예산/요청 한도 오류의 업무 흐름 검증.
- 앱별 제한 키, 운영 모드·모델·rubric·비용 관측, off 복구 절차. Festa/Hanmadi 키 설정 완료가 다른 앱의 연결 완료를 의미하지 않는다. 실제 동시 요청·예산 경계의 전 플랫폼 검증도 미완료다.
- 운영 채택 전 허용 오차·지연·추가 비용 기준을 합의하고, 사람 승인·권한·사용권·게시 검수를 유지한다. 확대 방향은 기존 키 권한 확대나 유료 실험 예산의 무제한 승인이 아니다.

### 증거와 문서의 유효 범위

- [공통 공개 연결](qa/20260930-jev-public-verification.md): 공통 SDK·경로·실호출 완료.
- [Festa 운영 shadow](qa/20261001-festa-jev-shadow-production.md): 실제 관찰 연결. on 채택/일반 품질 개선 증명과 구분.
- [Hanmadi 운영 검증](qa/20261001-hanmadi-video-analysis-production.md), [edge·실패 진단](qa/20261001-hanmadi-native-edge-production.md): 운영 배포와 전체 학습 흐름의 미완료를 구분.
- 확인 소스: kit main merge `bce3c0d7bbbfaab899adb9cbf69b64d834e1257b`, wp-auto-blog 로컬 `ad042b94c63a9eafbbd995a4ea367cc69fe2cbfd`, Festa의 보존된 운영 소스 `478c7e519c309fa25f77cadda133888e83349950`. 미병합 브랜치·다른 담당자의 모든 신규 작업을 전수 확인한 것은 아니다.
- 아래의 “클라이언트/외부 경로 없음·크레딧 미확인·운영 실호출 없음”은 9월 30일 최초 조사 상태다. 현재 공통 기반 상태에는 위 운영 증적이 우선한다. 기존 PDF는 갱신 전 요약이며 이번 수정은 Markdown 계획서 두 파일에 한정한다.

## 조사 범위와 증거 수준

| 대상 | 조사 기준 | 검토 범위와 한계 |
|---|---|---|
| Shopshorts, Hanmadi-app/admin, 공용 AI | commerce-automation-kit 로컬 `origin/main` `b8adaae533378b175b188f4d35a60f689b392244` | API·생성 호출·검증·검색·학습 계획·게이트웨이·Dify 템플릿. 운영 배포와의 일치 여부는 미확인 |
| Festa | venture-studio `3e5a00b` | 앱의 서버 처리기, AI 제공사 분기, 인터뷰·도시·일정·항공·정적 추천 코드 |
| Replay | replay-live 로컬 `origin/main` `4b3a2d68417f09c59d1a41156e72c56f091434b7` | 서버·웹 파일 목록, API, 예약·미디어·실패 진단·운영 지표. 로컬 develop `09fb3be`와 운영 일치 보장은 없음 |
| 블로그 POC의 실제 처리기 | wp-auto-blog `72e6d0a` | Shopshorts의 GitHub workflow 호출을 따라 중복·검색 관련성·기획 적합성·글 생성 코드를 추가 검토. 전체 블로그 저장소 감사는 아님 |

파일 목록과 API 진입점, LLM 호출 검색으로 기능을 파악하고 핵심 구현을 읽었다. Hanmadi-app/admin은 조사한 `apps/hanmadi`의 학습자·관리자 기능을 구분한 것이며 별도 코드베이스 두 개로 가정하지 않았다. 과거 회화·튜터 경로도 포함하되 운영 사용 여부는 별도다. 원격 fetch, 운영 DB·트래픽 조회, 라이브 UI 전수 테스트, Jev 실호출은 수행하지 않았다.

**표의 현재 방식은 코드 관찰이고, Jev 방식·효과는 설계 가설이다.** 지원되는 코드 경로가 있다는 사실과 운영에서 사용 중이라는 사실은 다르다. 본 조사에서 실측한 절감률·정확도는 없다.

## 분류 기준

| 표기 | 의미 | 비용 판단 |
|---|---|---|
| 대체 | 기존 LLM의 선택·분류 부분을 Jev로 대체 | 원래 호출을 실제 제거할 때 절감 가능. 자유문장 출력이 남으면 전체 대체 아님 |
| 추가 | 현재 없는 의미 검사 또는 규칙 보완 | Jev 비용과 지연 추가. 품질·검수 시간으로 정당화해야 함 |
| 라우팅 | Jev가 등급을 고르고 LiteLLM이 미리 등록한 생성 모델 호출 | 분류 비용·캐시 손실·재시도까지 포함해 비교 |
| 유지 | 규칙·생성 모델·사람 절차를 유지 | Jev로 바꿀 근거 부족 또는 직접 대체 불가 |

우선순위: **P1** 작은 비교 실험, **P2** 데이터 확보 후 검토, **P3** 신규 기능이 필요할 때, **유지** 도입하지 않음. 하나의 행에 여러 세부 동작이 있어도 하나의 기능 영역으로 센다. 49개는 추천 도입 건수가 아니다.

## Festa

| ID·기능 | 현재 방식과 코드 근거 | Jev 적용안·구분 | 기대효과·검증과 한계 | 판단 |
|---|---|---|---|---|
| F1 인터뷰 주제 상태·다음 주제 | `adaptiveInterview`가 LLM으로 resolvedTopics·focus·knownFacts를 판단 [F-A] | **대체**: 답변+주제 정의 → 주제별 알려짐/미확인/유연함/정정, 다음 주제 Choice | 불필요 질문·판단 지연 감소 가설. 자유문장 knownFacts는 Jev가 생성하지 못하므로 원문·근거 ID로 전달하거나 기존 생성 유지 | P1 |
| F2 질문·선택지 작성 | 판단 이후 별도 LLM이 맞춤 질문과 선택지 생성 [F-A] | **유지**, 선택적으로 **추가**: 생성 질문이 이미 답한 내용인지 검사 | 질문의 자연스러움·다양성은 생성 모델 담당. 사후 검사로 재생성이 늘 수 있어 반복 질문률과 총지연 비교 | P2 검사 |
| F3 도시 후보 선택 | 규칙 `rankRegions` 뒤 LLM이 city와 reason 반환 [F-B] | **대체**: 사용자 선호+허용 도시 → 도시 ID Choice | 선택 부분을 단순화할 여지. 설명문은 템플릿/기존 LLM 필요. 사람의 도시 적합성 평가와 비교 | P2 |
| F4 일자별 코스 선택 | `itinerary`·`worldItinerary`가 코스 인덱스와 이유 생성, 코드가 날짜별 허용값 검증 [F-C] | **대체 일부**: 코드가 만든 유효 코스/일정 후보 → 선호 관련성 Score 또는 Choice | 의미 적합성 판단만 맡김. 여러 날짜를 독립 선택하면 반복·이동 문제가 생기므로 일정 제약·전체 조합 검증 유지 | P2 |
| F5 최종 추천 근거·체험 제안 | adaptive 최종 LLM이 도시·코스·답변별 근거·선택 체험·미확인점 생성 [F-A] | **추가**: 답변 ID별 반영 여부, 추천과 입력의 모순 검사 | 누락·모순 표시 가능. 새로운 체험·근거 설명 생성은 유지. 실제 예약 가능성·행사 사실 검증을 대신하지 않음 | P2 |
| F6 정적 축제·숙소·경험 탐색 | 데이터와 규칙 기반 추천·검색 UI [F-D] | **추가**: 승인된 설명 후보+자유로운 요구 → 관련 후보 ID | 자연어 탐색 기능을 추가할 때만 가치. 후보 텍스트 품질과 선택률 검증. 단순 필터는 그대로 사용 | P3 |
| F7 날짜·거리·항공·연결·저장 | `validRoutes`·날짜 함수·항공 제공사·모델 연결·저장 UI [F-C][F-D] | **유지** | 금액·좌표·일정·인증·예약 가능 여부는 API/코드로 확인. Jev로 가격·날짜를 추정하지 않음 | 유지 |

## Shopshorts

| ID·기능 | 현재 방식과 코드 근거 | Jev 적용안·구분 | 기대효과·검증과 한계 | 판단 |
|---|---|---|---|---|
| S1 기획·연출 추천 중복 | LLM에 의미 중복 배제를 지시하지만 `repeats`는 정규화 문자열 비교 [S-A] | **추가**: 후보와 계정별 기존 기획 → 같은 소재·질문인지 판정 | 제목만 바꾼 반복 감소 가설. topic과 direction의 중복 기준을 분리하고 정상 변형을 오차단하는 비율 측정 | P1 |
| S2 트렌드·키워드 적합성 | 공식 지표 수집·점수, 검색 기반 추천과 피드 표시 [S-A][S-E] | **추가**: 측정된 후보의 설명 → 선택 카테고리/콘텐츠 목적과 관련성 | 관심사와 무관한 후보 감소 가능. 검색량·인기·기회 점수 계산은 유지, 단어가 비슷해도 측정치를 합치지 않음 | P2 |
| S3 조사 근거와 대본 일치 | `researchTopic`이 검색 근거·claim 생성, `validateResearch`가 출처 ID·형식 검증 [S-B] | **추가**: 허용된 근거 텍스트와 대본 주장 → 지원/모순/근거부족 | 근거 밖 단정 표시 가능. URL만으로 원문 검증 불가. 현재 요약 사실만 쓰면 요약과의 일치 검사에 한정됨 | P2 |
| S4 설명력·도입·마무리 | 편집 가이드 프롬프트와 `validateStoryArc`의 원문 위치·순서 검사 [S-B] | **추가**: 대본 → 설명·이유·예시·결론의 존재와 연결 정도 | 구조적 통과 후 의미 품질 검수 보조. 흥행·시청 지속률 보장 아님. 편집자 평가 및 수정 시간 비교 | P2 |
| S5 대본과 장면 기획 일치 | 대본·화면 프롬프트·연출은 생성 LLM이 함께 작성 [S-B] | **추가**: narration+prompt 텍스트 → 동일 대상·행동을 설명하는지 | 생성 전 불일치 발견 가능. 실제 생성 이미지·영상의 품질을 판정한 것은 아님 | P2 |
| S6 목소리·음원 추천 | 대본 LLM에 voiceRecommendation 포함, 지원 음성·음원 자산 검증 [S-B][S-C] | **대체 일부/추가**: 사용 가능한 음성·음원의 설명 → 대본 분위기에 맞는 ID | 목소리 선택만 분리하면 호출이 추가될 수 있음. 음원 설명·사용권 목록이 선행돼야 함. 청음 품질·권리는 Jev가 확인하지 않음 | P3 |
| S7 제목·설명·대본 표현 검수 | 생성 지시, 대본 lint와 발행 검수 [S-B][S-D] | **추가**: 입력 상품 사실+문구 → 과장·불일치 의심 표시 | 사람 검수 우선순위 보조. 법적 적합성 판정·승인 대체 불가. 기존 차단 규칙은 계속 적용 | P2 |
| S8 자막·편집·삭제·렌더 | `validateTimeline`이 프레임·클립·자막·음원 검사, 워커가 렌더 [S-C] | **유지** | 자막 중복 생성·레이어 중복·삭제 누락은 상태/렌더 코드 문제로 해결. Jev 도입이 해당 버그 수정은 아님 | 유지 |
| S9 자동·수동 대시보드·이어하기·작업 실행 | 프로젝트 상태·task ID·자동 제작 전이·사람 승인 [S-C][S-D] | **유지** | 작업 집계·재개·승인·업로드·재시도에 확률 판단 불필요. 표시용 요약이 필요하면 별도 제품 요구 | 유지 |
| S10 무료 음원·구독 잔량·계정 연결 | 공식 subscription 응답과 허용 자산·계정 상태 [S-C] | **유지** | 이용 가능 여부·잔량·요금·라이선스는 공식 데이터로 확인. Jev 점수로 무료·상업 이용 가능을 결정하지 않음 | 유지 |

## Hanmadi 학습자 기능

| ID·기능 | 현재 방식과 코드 근거 | Jev 적용안·구분 | 기대효과·검증과 한계 | 판단 |
| H1 회화·번역 참고 예시 검색 | `retrieveKnowledge`가 게시·언어·상황·레벨 필터 후 어휘 겹침으로 최대 4개 선택 [H-A] | **추가**: 허용 후보+현재 발화 → 의미 관련성 Score, 없으면 제외 | 단어만 겹치는 예시 감소 가능. 최종 4개만 재정렬하면 누락 후보는 회복 못하므로 앞단 후보 수집 범위도 설계 필요 | P2 |
| H2 회화 의도·맥락 유지 | `roleplayPrompt`가 역할·문맥·이미 답한 질문·자연스러운 전환을 LLM에 지시 [H-B] | **추가**: 대화 → 인사/답변/질문/도움 요청/종료/주제 전환 등 상태 | 불필요 질문 감소 가설. 이미 생성 호출에 포함된 판단이므로 비용 절감으로 간주하지 않음 | P2 |
| H3 자유 발화의 학습 목표 충족 | 회화 생성과 학습 기록은 있으나 목표별 의미 채점은 별도 구현 확인 안 됨 [H-B][H-C] | **추가 신규**: 과제+전사문 → 목표 표현·의도 충족/도움 필요 | 형성 평가 보조 가능. 한국어·일본어·태국어·영어·스페인어별 정답 자료 필요. 발음·억양 평가 불가 | P3 |
| H4 번역 품질·저장 표현의 의미 | LLM 번역·한글 독음·practice, 코드가 문자·길이·원문 부분 포함 검사 [H-B] | **추가**: 원문과 번역/표현 → 의미 보존·누락 의심 표시 | 형식 검사 밖 오류 발견 가능. 번역·독음 생성은 대체 불가. 문맥·언어별 오탐 평가 필수 | P2 |
| H5 학습 표현 저장 적합성 | 프롬프트의 일반 표현 지시와 `safePractice` 정규식, 공유 동의·철회 [H-B][H-D] | **추가**: 이미 허용된 일반 표현 후보 → 재사용성·사적 내용 의심 | 사람 검수 보조. 민감 내용을 탐지하려고 원문을 무조건 새 외부 제공사에 보내지 않음. 동의·삭제·정규식 방어는 유지 | P2 |
| H6 레벨 체크·퍼즐 정답·복습 일정 | 객관식 정답·자기평가·어절 조합·1/3일 복습 등 결정적 코드 [H-C] | **유지** | 객관식 채점·날짜·진도 계산은 Jev가 필요 없음. 자유 답변 평가를 추가할 경우에만 H3으로 별도 검토 | 유지 |
| H7 STT·TTS·실제 발음 | 음성 전사·합성 API, 텍스트 회화와 음성 별도 경로 [H-E] | **유지** | Jev는 음성 생성·청취·발음 평가 대체 불가. 전사 후 의미 검사는 H3 범위이며 전사 오류 영향도 측정 | 유지 |
| H8 과거 회화·모델 선택·번역 방향 | `conversation-provider`의 Dify/LiteLLM 분기, 개인 모델 선택, `detectDirection`의 확인 요청 [H-B][H-E] | **유지**, 선택한 자동 경로만 **라우팅** 후보 | 사용자가 명시한 모델·언어 선택은 존중. 혼합 언어의 확인 절차를 추정으로 대체하지 않음. Dify 내부 실행은 별도 확인 | P3 라우팅 |

## Hanmadi 관리자와 튜터 기능

| ID·기능 | 현재 방식과 코드 근거 | Jev 적용안·구분 | 기대효과·검증과 한계 | 판단 |
| A1 허용 원문으로 수업 초안 생성 | `study/admin`이 사용권 확인 후 LLM으로 3~8개 표현 생성 [A-A] | **유지**: 생성은 LLM, 검사는 A2·A3 | Jev는 새로운 표현·뜻·독음 생성 불가. 원문이 공개 URL이라는 이유만으로 사용권을 추정하지 않음 | 유지 |
| A2 초안의 원문·상황·레벨 적합성 | 형식·언어 검증 후 관리자 검수와 게시 승인 [A-A] | **추가**: 원문+표현+수업 기준 → 불일치·과도한 난이도 표시 | 검수 시간과 게시 후 수정률 개선 가설. 원문을 그대로 복사했는지만으로 적합성을 판단하지 않음 | P2 |
| A3 표현·기여 후보 중복 | `contribute`는 동일 사용자·언어 내 정규화 text 일치 비교 [H-D] | **추가**: 권한 범위의 후보 → 같은 의미/유용한 변형/새 표현 | 검수 큐 중복 감소 가능. 같은 의미라도 높임말·상황별 변형은 보존. 타 사용자 원문 무단 결합 금지 | P2 |
| A4 교정 기록에서 약점 분류 | `detectFocusAreas`가 튜터 메모·교정 전후를 정규식 6종으로 분류 [A-B] | **추가**: 교정 기록 → 조사/어순/존댓말 등 복수 분류 | 규칙의 누락·오탐 보완 가능. 횟수 집계는 코드 담당. 텍스트에 적힌 발음 메모 분류이지 실제 발음 평가가 아님 | P2 |
| A5 다음 수업·복습·숙제 추천 | `buildNextLessonPlan`의 트랙·약점 팩·오래된 표현·템플릿 [A-B] | **추가**: 승인된 팩·표현+학습 기록 → 추천 후보 순위 | 개인화 가설. LLM 없는 기능에 새 비용 발생. 교사 채택률·학습 성과 비교 전 자동 적용하지 않음 | P3 |
| A6 공식 영상 검색·관련 예시 미리보기 | YouTube 공식 검색·메타데이터, 별도 허용 원문, `retrieveKnowledge` 미리보기 [A-A][H-A] | **유지/추가 조건부**: AI 처리 허용된 후보 텍스트만 관련성 평가 | 현재 코드는 YouTube URL·API 메타데이터를 생성 LLM에 보내지 않음. 조건 확인 없이 Jev로 전송하거나 영상 자막 수집을 추가하지 않음 | P3 |
| A7 학생·튜터·수업 기록·게시·동의 관리 | 관리자 권한, 학생 기록, revision·reviewed·동의/철회 검사 [A-A][H-D] | **유지** | 계정 권한·사용권·게시 승인·동의는 참고 점수로 대체 불가. 관리자 검수 자동 생략 없음 | 유지 |

## Replay

| ID·기능 | 현재 방식과 코드 근거 | Jev 적용안·구분 | 기대효과·검증과 한계 | 판단 |
| R1 영상 목록·선택 | 파일명·길이·해상도·체크섬 등 메타데이터, 사용자 선택 [R-A] | **추가 신규**: 소유 영상의 허용된 설명/전사+방송 목적 → 후보 ID | 의미 검색·추천 가능성. 현재 저장 구조에 설명/전사 필드가 없어 입력 확보가 선행. 영상 자체는 분석 못함 | P3 |
| R2 최신 영상·예약·반복 송출 | `next_occurrence`·`step`, 공식 채널 최신 영상, ID 중복 차단 [R-B] | **유지** | 날짜·타임존·새 영상 판정은 결정적 코드가 적합. 추천 도입 시 R1과 분리하고 자동 송출 권한으로 확대하지 않음 | 유지 |
| R3 업로드·변환·FFmpeg·스트림 실행 | 파일 검증·작업 lease·retry·상태·출력 제한 [R-A] | **유지** | 미디어 처리·취소·재시도·용량 계산을 Jev로 대체할 근거 없음 | 유지 |
| R4 장애 분류·운영 알림 | `SourceFailure`의 정해진 reason, 지표 임계값 알림 [R-C] | **유지**, 자연어 장애 접수 기능 신설 시에만 **추가** | 현재 입력은 이미 분류된 코드여서 이득 적음. 새로운 자유문장 접수 데이터·담당 후보가 생기면 분류 검토 | P3 신규 |
| R5 인증·멤버·연결·쿼터·사용량 | 역할 검사·암호화 연결·리소스/사용량 계산 [R-A] | **유지** | 권한·비밀·할당량·청구의 확정값은 코드/공식 API 담당 | 유지 |
| R6 별도 Dify 영상 기획 템플릿 | kit에 `replay-planner.yml`이 `replay-video-planner` LLM 별칭을 사용 [G-C] | **유지/추가**: 생성은 LLM, 후보 기획의 브리프 적합성 검사 가능 | **Replay 앱 코드에서 이 템플릿을 호출하는 연결은 미확인.** 템플릿 존재를 앱의 운영 LLM 사용으로 계산하지 않음 | P3 |

Replay의 조사 대상 서버·웹에서 실제 LLM 호출은 발견하지 못했다. 검색에 잡힌 `@openai/sites-vite-plugin`은 호스팅 구성으로, 추론 호출 증거가 아니다. 기존 미디어 수집 코드를 분석했다는 사실은 수집 방식의 약관·사용권을 승인했다는 뜻이 아니다. 신규 입력은 공식 API와 권한 있는 원문만 사용한다.

## 공용 LiteLLM과 계정 서비스

| ID·기능 | 현재 방식과 코드 근거 | Jev 적용안·구분 | 기대효과·검증과 한계 | 판단 |
| G1 각 앱의 업무 판단 중계 | 공용 클라이언트는 chat/completions 등, Jev 전용 메서드 없음 [G-A] | **추가 기반**: 서버용 공통 `evaluate` 호출 → LiteLLM TypeSafe 경로 | 앱마다 provider 키를 중복 보관하지 않는 구조. 분류 기능 자체의 경제성은 각 업무별 평가 | P1 기반 확인 |
| G2 생성 모델 자동 선택 | `gateway.py`는 앱별 고정 별칭 생성. Jev 분류 설정 없음 [G-A] | **라우팅**: 허용된 모델 후보를 등급에 연결, Auto Router에 Jev 사용 | 고비용 고정 모델 대비 절감 가설. 이미 저렴한 모델을 쓰면 총비용 증가 가능. 고정/규칙/Jev 3개 경로 비교 | P2 |
| G3 답변 의미 품질 사후 평가 | 공통 클라이언트는 완료·거부·빈 응답·JSON 등 검사 [G-A] | **추가**: 업무 기준+답변 → 수정 필요 여부 | 문법적으로 맞는 JSON의 의미 오류를 보완할 수 있음. 전 요청 공통 검사는 지연·비용 증가, 업무별 필요할 때만 | P2 |
| G4 계정·모델 허용·예산·장애 복구 | virtual key/team 정책, 별도 개인 계정 서비스·구독 워커 [G-A][G-B] | **유지** | Jev는 인증·권한·과금·fallback 코드의 대체재 아님. 개인 구독과 API 과금 모델을 자동으로 섞지 않음 | 유지 |
| G5 Dify와 개인 계정 우회 경로 | Dify 템플릿, Hanmadi/Festa provider 분기, Shorts 계정 워커 [G-B][G-C][F-D] | **라우팅 조건부**: 실제 LiteLLM 자동 별칭을 통과하는 요청에 한정 | LiteLLM 설정만 바꿔도 모든 앱·Codex 화면의 선택 모델이 바뀌는 구조가 아님 | P2 연결 확인 |
| G6 진단·사용량·로그 정리 | 요청·오류 코드와 예산 정보 기반 관리 [G-A][R-C] | **유지**, 자연어 문의 분류가 필요하면 별도 **추가** | 숫자 집계는 코드. 새 분류 기능 없이 운영 로그 전체를 Jev로 보내는 것은 권장하지 않음 | 유지 |

## 블로그 POC의 실제 처리기 추가 검토

Shopshorts는 `wp-auto-blog`의 workflow를 `publish:false`로 요청한다 [S-D]. 다음 항목은 대시보드 내부가 아니라 **연결된 블로그 저장소에서 발견한 후보**다. 블로그 전체 기능을 조사했다고 확대하지 않는다.

| ID·기능 | 현재 방식과 코드 근거 | Jev 적용안·구분 | 기대효과·검증과 한계 | 판단 |
| B1 주제 의미 중복 | `_check_duplicate_with_llm`: Codex 경로는 정확히 DUPLICATE/NOT_DUPLICATE 반환 [B-A] | **대체**: 주제+허용된 기존 목록 → 중복/비중복 Choice | 제한된 출력이라 작은 실험에 적합. 제목만 근거이면 본문 중복 판정으로 과장하지 않음. 다른 기관·제품·정보 요구의 오차단 측정 | P1 |
| B2 검색 결과 관련성 | `review_search`가 결과별 relevant와 실제 quote를 LLM으로 반환 [B-B] | **대체 일부**: 결과별 관련성+미리 나눈 근거 구절 ID 선택 | 독립 검수 호출을 줄일 여지. Jev는 자유 인용문을 생성하지 않으므로 근거 ID→원문 복원·기존 quote 검증 계약을 함께 유지 | P2 |
| B3 기획 범위·근거 충족 | `review_plan`이 범위·필수 질문·근거·현재성까지 복합 출력 [B-C] | **대체 일부/추가**: 사전에 정의한 질문별 지원 여부·범위 분류 | 전체 호출을 단순 치환하지 않음. 필수 질문·답변·인용 생성은 남고, 날짜·검색량 판단은 코드 담당 | P2 |
| B4 글·메타 작성과 관련 글 선택 | `ContentGenerator.generate`, `rank_related_posts`의 규칙 점수 [B-A][B-D] | 생성 **유지**, 관련 글 순위는 **추가** | 내부 링크의 의미 적합성 보완 가능. 생성/검색/최신 사실 확인을 대체하지 않으며 클릭 성과는 미측정 | P3 |
| B5 글 형식·수치·정책·발행 제어 | quality/identity gate, 측정값과 별도 발행 절차 [B-D][S-D] | **유지**, 의미 품질 검사는 검수 보조로 한정 | 포맷·고지·실측 수요·발행 승인 유지. 기존 수집 코드의 실행·확장이나 무검수 발행을 승인하지 않음 | 유지 |

## 권장 연결 구조와 현재 차이

공식 문서에서는 LiteLLM의 **TypeSafe pass-through**와 **Jev Auto Router**를 모두 확인했다. 따라서 별도 Jev API 서버 신설을 기본안으로 삼지 않고 **기존 LiteLLM의 지원 기능을 먼저 검증**한다. pass-through는 `/typesafe/v1/systemone`으로 호출하며 생성용 `/v1/chat/completions`와 요청·응답 계약이 다르다. 제공사 키는 proxy에 두고 앱은 LiteLLM virtual key를 사용한다. [공식 중계 문서](https://docs.litellm.ai/docs/pass_through/typesafe)

```text
앱 서버의 공통 호출 라이브러리
  ├─ 업무 판단 → LiteLLM TypeSafe 경로 → Jev → 분류/선택 결과
  └─ 생성 요청 → LiteLLM 고정 모델 또는 자동 별칭
                                └─ 자동 경로: Jev 등급 판단 → 허용된 생성 모델

개인 계정 워커 / 직접 Gemini / Dify 경로는 별도 연결 확인
```

공식 Auto Router는 `classifier_type: jev`를 제공한다. 내장 분류는 Enterprise 라이선스 없이 사용할 수 있다고 문서화돼 있으며, 사용자 정의 instructions/tier_definitions는 Enterprise 기능이다. 기능은 Beta이므로 설치 버전과 지원 범위를 확인해야 한다. 이는 Jev API 자체가 무료라는 의미가 아니다. [설정](https://docs.litellm.ai/docs/auto_router/setup), [라이선스·권한·계상](https://docs.litellm.ai/docs/proxy/auto_routing)

| 확인할 차이 | 코드에서 확인한 상태 | 구현 전에 필요한 확인 |
|---|---|---|
| LiteLLM 버전 | compose 이미지가 digest `87f34979…`로 고정 [G-A] | 실행 이미지의 실제 버전과 Jev endpoint/router 지원. 최신 문서만 보고 이미 지원한다고 판단하지 않음 |
| 외부 경로 | gateway Caddy와 shared-ai-host Caddy 모두 지정 `/v1/*` 추론 경로만 허용 [G-B] | 사용할 정확한 Jev 경로 추가·인증 보존·관리 경로 차단. 현재 코드는 Jev 경로가 허용 목록에 없음 |
| 클라이언트 계약 | 현재 BASE_URL은 일반적으로 `/v1`, completeText는 choices의 문자열을 기대 [G-A] | 기존 URL에 단순 이어붙이지 않고 proxy 기준 경로와 Jev answers를 별도 처리 |
| 앱 권한·예산 | 앱별 모델 allowlist와 budget 설정, Shorts는 APPS 기본 목록에 없음 [G-A] | Jev 모델·라우터 의존 모델 접근, 제한된 키의 거부, 예산 소진·동시 요청·비용 계상 확인 |
| 분류 비용 | 공식 문서상 Auto Router 분류 호출은 별도 사용량 행으로 기록 | 생성 비용과 Jev 비용을 함께 계산. fallback 성공이 Jev 성공 증거는 아님 |
| pass-through 추적 | 공식 문서상 비용·로그 지원, end-user tracking 미지원 표시 | 앱/사용자별 추적 요구가 충족되는지 실측. 일반 생성 endpoint와 모든 정책이 동일하다고 가정하지 않음 |
| 호출 경로 | Festa 기본 Gemini 또는 명시 LiteLLM·개인 연결, Shorts Codex/Claude 워커, Hanmadi 경로별 상이 | 실제 기능별 경로를 기록하고 원하는 판단에만 연결. 사용자 선택 모델·구독을 자동 전환하지 않음 |

추가 서버가 필요하다는 근거가 생기는 경우는 지원 버전·권한·관측 요구를 기존 proxy로 충족하지 못할 때다. 먼저 기존 기능의 간극을 검증하고 결정한다. `gateway.py`는 설정 생성/관리 스크립트이므로 API 처리기를 바로 넣을 위치가 아니다.

## 비교 실험과 적용 판단

1. **자료 준비:** P1별 100~200개는 초기 탐색 표본으로만 사용한다. 개인정보 없는 허용 사례에 사람이 정답과 경계 사례를 표시한다. 프롬프트 조정 자료와 최종 평가 자료를 분리하고 같은 입력으로 기존 방식·Jev를 비교한다. 적은 표본만으로 운영 정확도를 확정하지 않는다.
2. **변경 없는 비교:** 기존 운영 결과를 유지한 채 복제 평가한다. 버전·기준·입력 범위·fallback을 고정한다. Jev 키/크레딧 준비 후 명시된 실험 예산 안에서만 유료 호출한다. 이번 조사에서는 호출하지 않았다.
3. **업무별 지표:** F1은 주제 상태 정확도·조기 종료·반복 질문률, B1/S1은 중복 누락과 정상 후보 오차단, H1은 관련 예시 선택 품질, A2/A4는 검수자 일치도·검수 시간. 공통으로 전체 성공률·p50/p95 지연·fallback율·사용량을 기록한다.
4. **라우팅은 별도 실험:** 현재 고정 모델, 무료 규칙 라우터, Jev 라우터를 같은 업무에서 비교한다. 품질 하한을 먼저 정하고 모델별 실제 비용·캐시·실패·재생성까지 측정한다. 모델 ID는 실제 허용·연결된 후보로만 정한다.
5. **승격 기준:** 정상 후보 오차단·중요 정보 누락의 허용 수준과 지연 한도를 제품별로 사전에 합의한다. 품질 하한 미달이나 비용/지연 악화면 기존 방식 유지. 사람 승인·권한·날짜·쿼터 규칙은 평가 결과와 무관하게 유지한다.

불확실·미응답 처리도 업무별로 다르다. F1은 기존 판단 경로로 복귀하고, S1/B1은 불확실한 결과를 ‘새 주제’로 통과시키지 않고 기존 검수 또는 보류로 돌린다. 검수 보조는 실패를 표시하며 기존 사람 검수를 유지한다. 라우팅은 허용된 기본 모델로 복귀한다. 인증 실패·예산 소진 시 다른 provider로 우회해 제한을 피하지 않는다.

## 비용과 한계

공식 가격은 입력 100만 토큰당 $0.042, 출력 무료다. 요청당 **전체 입력** 2,000토큰이면 Jev 1만 회는 $0.84라는 단순 가정 계산이다. 실제 입력은 상태와 질문·기준을 포함한다. 한국어 등 비영어 성능은 언어별 평가가 필요하며, 모델 버전은 평가 시 고정한다. [모델·가격·언어](https://docs.typesafe.ai/models)

`순절감 = 제거한 기존 호출 비용 - Jev 비용 - 추가 생성/재시도 비용 - 운영 증가분`으로 평가한다. 구독 기반 Codex/Claude 호출을 줄여도 월 구독료가 바로 줄지는 않는다. 이 경우 응답시간·사용 한도·작업 처리량 개선과 **추가 API 지출**을 구분한다. 이미 생성 호출에 포함된 음성 선택 등을 분리하면 절감보다 추가 비용이 될 수 있다.

Jev는 자유문장·영상·음성 생성기가 아니며 수학·날짜 비교·복잡한 상태 불변식은 코드로 유지한다. 입력 속 지시와 경계 사례에 대한 오판도 평가해야 한다. Score나 confidence를 정확도·법적 적합성의 보증으로 사용하지 않는다. [공식 한계](https://docs.typesafe.ai/model-jaggedness/jev-1.13), [confidence](https://docs.typesafe.ai/confidence)

사용자가 알려준 마지막 상태는 크레딧 부족으로 키 생성이 막힌 상태다. 이후 충전·키 발급은 확인되지 않았다. 운영의 현재 지출·트래픽·데이터 수량을 조회하지 않았으므로 월 절감액이나 전체 ROI는 산출하지 않는다. 앞선 문서의 ‘추가 게시 자료 0개’는 과거 점검 기록이므로 현재 수량으로 재사용하지 않는다.

## 코드 근거

각 링크는 조사한 커밋의 소스다. 링크의 line 번호보다 파일 내 함수명을 우선해 읽는다.

- [F-A] [Festa adaptive-interview.ts](https://github.com/hhj4861/venture-studio/blob/3e5a00b/ventures/market/party-festival-guide/app/lib/server/adaptive-interview.ts): decisionSchema, adaptiveInterview, 질문 및 최종 추천.
- [F-B] [interview.ts](https://github.com/hhj4861/venture-studio/blob/3e5a00b/ventures/market/party-festival-guide/app/lib/server/interview.ts), [travel-interview.ts](https://github.com/hhj4861/venture-studio/blob/3e5a00b/ventures/market/party-festival-guide/app/data/travel-interview.ts): rankRegions, city/reason.
- [F-C] [itinerary.ts](https://github.com/hhj4861/venture-studio/blob/3e5a00b/ventures/market/party-festival-guide/app/lib/server/itinerary.ts), [world-itinerary.ts](https://github.com/hhj4861/venture-studio/blob/3e5a00b/ventures/market/party-festival-guide/app/lib/server/world-itinerary.ts), [route-planner.ts](https://github.com/hhj4861/venture-studio/blob/3e5a00b/ventures/market/party-festival-guide/app/data/route-planner.ts).
- [F-D] [서버 처리기](https://github.com/hhj4861/venture-studio/tree/3e5a00b/ventures/market/party-festival-guide/app/lib/server), [데이터](https://github.com/hhj4861/venture-studio/tree/3e5a00b/ventures/market/party-festival-guide/app/data), [컴포넌트](https://github.com/hhj4861/venture-studio/tree/3e5a00b/ventures/market/party-festival-guide/app/components): aiConfig, flights/world-flights, world-recommendation 및 탐색·저장 UI.
- [S-A] [studio-recommendations.js](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/shopshorts/lib/studio-recommendations.js): previousRecommendations, repeats, recommendBrief.
- [S-B] [studio-scenario.js](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/shopshorts/lib/studio-scenario.js), [studio-editorial.js](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/shopshorts/lib/studio-editorial.js), [explainer-production.js](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/shopshorts/lib/explainer-production.js).
- [S-C] [studio.js](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/shopshorts/lib/studio.js), [studio-api.js](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/shopshorts/lib/studio-api.js), [audio-account.js](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/shopshorts/lib/audio-account.js).
- [S-D] [Cloudflare API](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/shopshorts/functions/api/%5B%5Bpath%5D%5D.js), [studio-automatic.js](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/shopshorts/lib/studio-automatic.js): blog-poc-requests, keyword-feeds, 상태 전이.
- [S-E] [blog-candidates.ts](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/packages/keyword-intel/src/core/blog-candidates.ts), [analyzer.ts](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/packages/keyword-intel/src/core/analyzer.ts).
- [H-A] [knowledge.ts](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/lib/knowledge.ts): retrieveKnowledge.
- [H-B] [v2-ai.ts](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/lib/v2-ai.ts), [study route](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/app/api/study/route.ts): studyCompletion, translate, roleplayReply.
- [H-C] [v2.ts](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/lib/v2.ts), [learning-assessment.ts](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/lib/learning-assessment.ts), [puzzles.ts](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/lib/puzzles.ts), [adaptive-learning.ts](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/lib/adaptive-learning.ts).
- [H-D] [knowledge-store.ts](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/lib/knowledge-store.ts), [v2-store.ts](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/lib/v2-store.ts).
- [H-E] [conversation-provider.ts](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/lib/conversation-provider.ts), [conversation-audio.ts](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/lib/conversation-audio.ts), [API 경로](https://github.com/hhj4861/commerce-automation-kit/tree/b8adaae/apps/hanmadi/app/api).
- [A-A] [study/admin route](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/app/api/study/admin/route.ts): generate, generate-contribution, search, preview, save.
- [A-B] [next-lesson.ts](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/lib/next-lesson.ts), [튜터 학생 상세](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/apps/hanmadi/app/admin/students/%5Bslug%5D/page.tsx): detectFocusAreas, buildNextLessonPlan.
- [R-A] [production_app.py](https://github.com/hhj4861/replay-live/blob/4b3a2d6/server/production_app.py), [repository.py](https://github.com/hhj4861/replay-live/blob/4b3a2d6/server/repository.py).
- [R-B] [automations.py](https://github.com/hhj4861/replay-live/blob/4b3a2d6/server/automations.py), [youtube_channel.py](https://github.com/hhj4861/replay-live/blob/4b3a2d6/server/youtube_channel.py).
- [R-C] [source_diagnostics.py](https://github.com/hhj4861/replay-live/blob/4b3a2d6/server/source_diagnostics.py), [operations.py](https://github.com/hhj4861/replay-live/blob/4b3a2d6/server/operations.py).
- [G-A] [공통 클라이언트](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/packages/litellm-client/index.mjs), [gateway.py](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/services/ai-gateway/gateway.py), [compose.yaml](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/services/ai-gateway/compose.yaml).
- [G-B] [gateway Caddyfile](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/services/ai-gateway/Caddyfile), [shared host Caddyfile](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/services/shared-ai-host/Caddyfile), [account_service.py](https://github.com/hhj4861/commerce-automation-kit/blob/b8adaae/services/ai-gateway/account_service.py).
- [G-C] [Dify 앱 템플릿](https://github.com/hhj4861/commerce-automation-kit/tree/b8adaae/services/dify/apps).
- [B-A] [pipeline.py](https://github.com/hhj4861/wp-auto-blog/blob/72e6d0a/src/pipeline.py): _check_duplicate_with_llm, rank_related_posts.
- [B-B] [search_quality.py](https://github.com/hhj4861/wp-auto-blog/blob/72e6d0a/src/search_quality.py): review_search, _decisions.
- [B-C] [topic_suitability.py](https://github.com/hhj4861/wp-auto-blog/blob/72e6d0a/src/topic_suitability.py): review_plan, issues.
- [B-D] [content_generator.py](https://github.com/hhj4861/wp-auto-blog/blob/72e6d0a/src/content_generator.py), [identity_gate.py](https://github.com/hhj4861/wp-auto-blog/blob/72e6d0a/src/identity_gate.py), [monetization.py](https://github.com/hhj4861/wp-auto-blog/blob/72e6d0a/src/monetization.py).

## 아직 확인하지 않은 영역

운영 LiteLLM의 설치 버전·라이선스·등록 모델, 기능별 실제 사용량·개인 구독 경로, Dify의 현재 배포 그래프, 각 사이트의 최신 운영 UI·DB 내용, 별도 브랜치의 미병합 기능은 전수 확인하지 않았다. 관리 플랫폼이 추가되거나 운영 소스가 위 커밋과 다르면 해당 범위를 추가 조사한다. 이 문서의 확장 목록을 ‘모든 곳에서 효과가 검증됐다’는 의미로 사용하지 않는다.
