# Hanmadi Admin — 영상 자동 분석과 JEV 선별

2026-10-01. 구현 브랜치 `feat/hanmadi-video-analysis`. 이 문서는 코드·로컬 검증 기록이며 운영 배포 완료 기록이 아니다.

## 사용자 흐름

검색어 입력 → 5개씩 검색 → 여러 페이지에서 최대 10개 선택 → 저장할 언어·상황·레벨 선택 → 전체 분석·자료 만들기 → 영상별 결과 확인 → 통과한 초안 검수·게시.

준비 목록에서는 원문 업로드, 자막 붙여넣기, 긴 사용권 서술을 요구하지 않는다. 공개 영상 URL을 공식 Gemini 영상 입력으로 LiteLLM에 전달한다. 영상 파일·자막을 별도로 다운로드하거나 비공식 크롤러를 사용하지 않는다. 생성 결과는 짧은 자체 연습 표현과 영상 구간의 요약 근거이며 원문 전문을 저장하지 않는다. 기존 수동 ‘자료 만들기’와 번역 후보 흐름은 유지한다.

공개 영상 분석 기능이 저작권·이용 범위 판단을 대신하지 않는다. 출처와 분석 방식은 자동 기록하고, 기존 게시 단계의 내용·출처·이용 범위 검수를 유지한다. JEV 통과만으로 게시·파인튜닝을 실행하지 않는다. 게시된 자료는 기존 레벨·상황별 학습과 AI 대화 검색 흐름을 사용하며 모델 가중치 학습은 기존 별도 학습 관리 기능이다.

## 제한과 복구

- 선택: 준비 목록 전체 10개. 서버 prepare API도 1–10개, 중복 없는 정규 YouTube ID만 허용한다. process API는 준비 목록에 포함된 ID만 받는다.
- 분석: 공식 Data API로 공개 상태·길이를 확인한다. 라이브·예정 방송·비공개·삭제·15분 초과 영상은 분석 전에 거절한다.
- 동시 작업: 브라우저 작업자 3개 + 모든 서버 인스턴스가 공유하는 Redis 슬롯 3개. 요청당 영상 1개, API 실행 한도 150초, 공급자 영상 응답 80초 제한. 새로운 분석 시도는 하루 50개로 제한한다. 모델 할당량이 더 작으면 제공자 실패로 표시하며 숨기지 않는다.
- JEV 평가와 저장은 서버에서 순서를 관리한다. 앞서 통과한 초안까지 비교한다. 평가 도중 다른 관리자가 교재를 수정하면 CAS 검증으로 저장을 거절하고 재평가하도록 한다.
- 중지: 진행 중인 요청은 마무리하고 새 영상 시작을 중단한다. 실패 영상만 재시도한다. 새로고침 후 선택 목록은 다시 선택해야 하지만 서버의 분석 결과와 저장된 초안은 재사용한다. 브라우저를 닫은 뒤 남은 영상까지 자동 실행하는 백그라운드 워커는 아니다.
- URL/설정/모델/평가 버전으로 서버 작업 키를 만든다. 처리 중 요청을 합치고, 저장된 초안의 sourceHash로 응답 유실·캐시 만료 뒤에도 중복 생성을 방지한다. JEV 실패 시 분석 결과만 재사용하고 평가를 다시 한다. 실패를 통과로 취급하지 않는다.

## 캐시

검색어의 앞뒤·연속 공백을 정리하고 검색어·페이지 토큰·구형 클라이언트의 언어 옵션으로 캐시를 구분한다. 정상 결과·빈 결과를 1시간 저장하며 오류는 저장하지 않는다. 동일 검색 동시 요청은 Redis lease로 합쳐 YouTube 호출을 한 번만 수행한다. 검색 일일 예산 20회는 실제 캐시 miss 요청에만 적용되므로 예산 소진 후에도 기존 캐시 조회는 가능하다.

운영 캐시·lease·분석·작업 결과는 기존 Upstash에 **독립된 expiring key**(`hanmadi:admin-transient:v1:*`)로 저장한다. 원래 영구 보관되는 curriculum hash에 검색 메타데이터를 넣지 않는다. 분석 결과와 작업 결과·batch는 24시간, 검색은 1시간 후 Redis에서 물리 만료된다. 인증된 API 응답의 HTTP Cache-Control은 계속 no-store다. 로컬 개발·테스트의 transient cache는 프로세스 메모리이며 서버 재시작 후 유지되지 않는다.

## JEV 공통 모듈

JEV 세션과 main의 공통 모듈을 확인했다. 새 판단 서비스를 만들지 않고 `@cak/litellm-client@0.4.0/jev`의 `createJevClient().evaluate()`를 사용한다. 관리자 단독 소스 배포를 위해 기존 배포 방식대로 0.4.0 tarball을 vendor에 포함했다.

평가 버전은 `hanmadi-video-jev-v1`, 모델은 `jev-1.13.0`이다. 영상에서 제안한 1–6개 표현마다 useful / duplicate / irrelevant / unreliable을 판정한다. useful 확률 0.9 이상이며 confidence 0.85 이상인 표현만 저장한다. 정확히 같은 목표언어 표현은 기본 교재·기존 초안·게시 자료 전체와 정규화 비교해 강제로 제외한다. 확률과 confidence는 정답률 보증이 아니며 초기 운영 기준이다.

의미 비교에는 같은 언어의 기본 교재와 모든 기존 초안·게시 자료 중 문자 유사도·상황으로 찾은 관련 표현 최대 24개, 직렬화 9,000바이트까지 보낸다. 비교 대상 수와 실제 비교 수, 각 표현의 판정·confidence, 영상 구간 근거를 초안에 기록한다. 전체 자료를 모두 의미 비교한다고 주장하지 않는다. 새로운 표현끼리의 정확한 중복도 제외한다. 초기 한국어/목표언어별 실제 평가셋 정확도는 아직 실측하지 않았다.

## 운영 설정과 현재 확인 범위

기존 production `YOUTUBE_API_KEY`, `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL`, Redis 설정이 등록된 것을 Vercel API 메타데이터로 확인했다. 비밀 값은 출력하거나 작업 산출물에 저장하지 않았다.

- `HANMADI_VIDEO_MODEL` (선택): 공식 YouTube URL 영상 입력을 지원하는 **Gemini 공급자** 별칭. 생략하면 기존 LITELLM_MODEL을 사용한다. 일반 텍스트 전용 모델은 사용할 수 없다.
- `HANMADI_JEV_API_KEY` (선택): 같은 LiteLLM 주소의 Hanmadi Admin 전용 JEV virtual key. 생략하면 LITELLM_API_KEY를 사용한다. 어떤 경우에도 해당 키에 모델 `jev-1.13.0`, POST `/typesafe/v1/systemone` 권한과 앱 예산이 있어야 한다. TypeSafe 공급자 원본 키는 앱에 넣지 않는다.

운영에는 별도 HANMADI_JEV_API_KEY가 등록되어 있지 않다. 현재 민감 값은 재조회할 수 없어 기존 관리자 키의 JEV 권한과 영상 모델 연결을 이번 작업에서 실호출 검증하지 못했다. 기존 JEV 공통 연결 문서에 기록된 다른 앱 권한/임시 검증 키를 재사용하지 않았다. 운영 적용 전에 관리자 전용 키·모델 권한을 확인하고 비민감 공개 영상 1건으로 분석→JEV→초안 흐름을 확인해야 한다. 실제 유료 파인튜닝은 실행하지 않았다.

## 검증

- 단위/통합 130개 통과: 검색 캐시 hit/miss/만료/오류/동시 요청, 상한·ID·분류 검증, 3개 슬롯, 재시도·영속 초안 중복 방지, JEV 실패 차단·confidence·정확 중복, 평가 후 자료 변경 거절, 공식 영상 미디어 입력/길이/공개 상태.
- 전체 v2 브라우저 E2E 통과: 5개 페이징·총개수, 모든 페이지 선택 10개 제한, 수동 원문 UI 없음, 3개 병렬 처리, 중복 제외, 실패한 1건만 재시도, 320/390/768/1440px 수평 넘침 없음. 기존 학습·번역·대화·자료 검수·학습 관리 회귀 포함.
- 관리자 전용 배포 E2E 통과: 새 videos API 소유자 허용·비로그인 차단, 학습자 경로 차단 유지.
- 영상/검색/평가 공급자 응답은 fixture다. 실제 영상 분석 품질 또는 JEV 운영 권한 성공의 증거가 아니다.
- 산출물: 사용자 지정 `gpt 작업/commerce-automation-kit/hanmadi-video-analysis-20261001/`. 테스트 데이터는 완료 후 삭제하며 비밀을 포함하지 않는다.

## 공식 API 근거

- [Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding): 공개 YouTube URL을 영상 입력으로 전달. preview 기능이므로 모델·과금·한도 변경 가능성을 운영 시 재확인한다.
- [LiteLLM Gemini](https://docs.litellm.ai/docs/providers/gemini): file content part의 file_id/format을 이용한 영상 입력. 공식 변환 코드의 명시적 https URL+MIME 경로는 Gemini file_uri로 전달한다.
- [YouTube Data API videos.list](https://developers.google.com/youtube/v3/docs/videos/list): 공개 상태·contentDetails·snippet 조회.
- [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies): 임시 메타데이터 보관·갱신 정책. 본 검색 캐시는 1시간 물리 만료.
- [TypeSafe API](https://docs.typesafe.ai/api), [Confidence](https://docs.typesafe.ai/confidence), [JEV 공통 계약](20260930-jev-common-client.md).
