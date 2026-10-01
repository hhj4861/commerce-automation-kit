# Hanmadi Admin 영상 분석 운영 배포 — 2026-10-01

사용자가 PR #103 및 후속 PR #107 머지와 운영 배포를 명시 승인했다. 최신 운영 배포 #109는 성공했고 초기 Gemini HTTP 400 문제는 해소됐지만, 실제 영상 응답의 JSON 해석 실패가 남아 영상 분석→JEV→초안 저장 검증은 아직 완료되지 않았다. 검색·캐시·관리자 접근과 배포 성공을 영상 학습 흐름 성공과 구분한다.

## 배포

- 운영: https://hanmadi-admin.vercel.app/study/admin
- 구현 [PR #103](https://github.com/hhj4861/commerce-automation-kit/pull/103): 최종 코드 `103e8887c70b432e33e9c83a5ef6adab3bd6e4d5`, main 머지 `eb396b114cae79beaf260086951f917df021a5d7`.
- 승격 [PR #105](https://github.com/hhj4861/commerce-automation-kit/pull/105): main → `deploy/hanmadi-admin`, 머지 `f79cb910f911c0120c49402a0609586ff18a58da`.
- [GitOps 실행](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36831610270): plan·관리자 배포 모두 success. 배포 브랜치 보호·기존 중앙 자격 경로를 그대로 사용했다.
- Vercel `dpl_2aMYCdp9xgWJd6LhrsYNNKvjDAE4`, production READY. 고정 URL: https://hanmadi-admin-q3i2q5hzq-dean-10.vercel.app
- 운영 `/api/deployment`의 application=`hanmadi-admin`, revision=`f79cb910f911c0120c49402a0609586ff18a58da` 일치.
- 학습 앱 `deploy/hanmadi`와 다른 앱은 배포하지 않았다. 검수 없는 자료 게시와 유료 파인튜닝도 실행하지 않았다.

## 설정 및 담당 세션 조율

기존 JEV 담당 세션과 직접 메시지를 주고받아 아래 설정의 등록·재조회 결과를 확인했다. 토큰은 채팅·Git·iCloud 산출물로 전달하지 않았다.

- JEV 담당: Hanmadi Admin 전용 운영 가상 키 `hanmadi-admin-jev`를 Vercel production `HANMADI_JEV_API_KEY`의 sensitive 변수로 직접 등록. 모델 `jev-1.13.0`, 경로 `/typesafe/v1/systemone`, 10 RPM, $0.50/30d, 만료 없음. 운영용 키로 유지하며 앞서 회수한 임시 평가 키와 구분한다. 등록 당시 spend=0, 다음 예산 초기화 2026-11-01T00:00Z.
- Admin 담당: production `HANMADI_VIDEO_MODEL=hanmadi-chat` 등록·재조회. 기존 모델은 `hanmadi-chat`, 주소는 `https://shared-ai-d5cy7m6i7q-uc.a.run.app/llm/v1`임을 비밀 아닌 설정 값으로 확인했다. 일반 LLM 키는 변경하지 않았다.
- 공통 JEV SDK는 주소 끝 `/v1`을 제거하고 `/typesafe/v1/systemone`을 붙인다. 설치된 SDK 코드와 외부 호출 없는 검증으로 확인했다.
- 키 등록은 실제 영상 분석·JEV 평가 성공의 증거가 아니다. 현재 아래 실호출은 JEV 단계 전에 실패했다.

## CI 및 운영 확인

- PR #103의 study·connection·connections·native-runtime·Platform GitOps verification 5종 통과 후 main 머지.
- 승격 PR #105의 같은 5종 검사 통과 후 배포 브랜치 머지. main push에 별도로 실행된 중복 Dify 검사는 Docker 이미지 다운로드의 `unauthorized: authentication required`로 실패했다. 동일 커밋의 실패 검사만 1회 재시도해 success를 확인했다. 코드·검사·인증 조건을 완화하지 않았다.
- 구현 로컬 검증: 단위/통합 133개, TypeScript, lint, 관리자 전용 및 전체 v2 E2E 통과. 이 E2E의 모델 응답은 fixture다.
- 배포 workflow의 운영 확인: release SHA, 로그인 페이지, 비로그인 관리자 API 403, 학습자 API 404 통과.
- 실제 owner PIN 로그인과 관리자 자료 조회 HTTP 200. PIN·쿠키는 메모리에서만 사용했다. 실제 브라우저 로그인도 확인했다. 첫 브라우저 검증의 화면 전환 대기 시간 초과는 실패 기록으로 보존했다.
- 실제 검색: `처음 본 일본인과 스몰토크 잘 하는 법`, 첫 페이지 5개·YouTube 추정 총 1,562개. 첫 요청 cacheHit=false, 공백을 달리한 반복 요청 cacheHit=true, cachedAt 동일. 공식 검색 API의 반복 호출 감소를 운영에서 확인했다.
- 영상 선택·준비 목록·언어/상황/레벨 설정과 390px 수평 넘침 없음을 확인했다. 화면 산출물에는 로그인 PIN·쿠키·키를 포함하지 않았다.

## 최초 배포의 실제 영상 분석 — 실패 기록

1. 사용자 대화에 있던 영상 `71gMyqGhDCk`: 공개 상태·길이 검사에서 거절. 약 2.7초, state=failed. 공개/일반/15분 이하 조건 중 정확히 어느 항목인지는 현재 응답으로 구분되지 않는다. 영상이 15분을 초과했다고 단정하지 않는다.
2. 공식 검색으로 확인한 `OA6gpD9mP0A`(일본어 회화 자기소개 1분 스피치): 준비·공개/길이 검사 이후 영상 분석 응답 실패. 2026-10-01 07:46:56–59 UTC, 약 3.5초, state=failed. API HTTP 200 안의 작업 실패 상태이며 성공한 분석으로 세지 않는다.
3. JEV 담당의 해당 시간 서버 로그 조회: `hanmadi-chat` → `gemini-flash-lite-latest` 요청이 GeminiException BadRequestError, HTTP 400 / INVALID_ARGUMENT. quota·권한·NotFound 신호는 없었다. 아래 설치된 변환 코드에서 YouTube URI가 보존되지 않는 원인을 확인했다.

두 요청으로 저장된 초안·게시 자료는 없고 JEV 실평가에도 도달하지 않았다. 추가 분석을 반복해 성공 사례만 고르지 않고 실패 원인을 먼저 확인한다. 원인이 해소되고 동일 영상으로 재검증하기 전에는 영상 분석 기능까지 정상 운영한다고 보고하지 않는다.

## #109 운영 실검증 — 응답 형식 문제로 미완료

- 운영 release `b6c079ad1be14c7f801829c8b46b895b34a4c840`와 실제 owner 로그인 HTTP 200을 확인한 뒤 같은 영상 `OA6gpD9mP0A`를 1회 처리했다. 설정은 일본어·스몰토크·레벨 1이다.
- 처리 시간: 2026-10-01 08:29:00.453–08:29:22.968 UTC, 22,515ms.
- 결과: state=`failed`, 메시지 “AI 답변 형식을 확인하지 못했어요. 다시 시도해 주세요.” 초안 0→0, 게시 자료 0→0. 추가 유료 재호출은 하지 않았다.
- JEV 담당의 읽기 전용 로그 확인: native POST가 HTTP 200으로 끝난 기록 1개, 해당 구간 GeminiException·INVALID_ARGUMENT·JEV systemone 호출 기록 0개. JEV 운영 키 spend=0.0, 모델·경로·$0.50/30d·10RPM 권한은 그대로다. Hanmadi 서버 키 누적 spend=0.3895447이며 이 숫자를 이번 영상 1건 비용으로 해석하지 않는다.
- 앱 코드상 이 오류는 `jsonAnswer`가 JSON 파싱 또는 최상위 객체 검증에 실패할 때 발생한다. native HTTP 성공·STOP·비어 있지 않은 텍스트 검사 이후의 오류다. 실제 응답 전문은 저장되지 않아 JSON 설정 전달 문제, 배열 등 다른 최상위 타입, 출력 형식 중 정확한 원인은 아직 확정하지 않았다.
- API 키·쿠키는 메모리에서만 사용했고 로그에 출력하지 않았다. 새 임시 키·콘텐츠 게시·파인튜닝은 실행하지 않았다. JEV 담당이 설치된 변환 코드에서 generationConfig·systemInstruction의 매핑과 요청 객체 포함을 확인했다. 설정 누락을 확정 원인으로 볼 수 없다. 기존 사용량 조회에서도 해당 응답 본문은 찾지 못했다.

후속 [PR #110](https://github.com/hhj4861/commerce-automation-kit/pull/110), `fix/hanmadi-video-json`의 `b90532b`: responseSchema로 최상위 객체와 필수 필드를 지정하고, 완전한 JSON/코드 펜스 앞뒤 공백만 정리하며, 실패 로그에는 문자 수·JSON 타입·펜스 여부만 남긴다. 기존 잘못된 응답 차단과 JEV·저장 전 중단은 유지한다. 실제 실패 원인 확정이나 운영 성공을 주장하지 않는 계약 강화·진단 수정이다.

로컬 테스트 145개·TypeScript·변경 파일 ESLint·diff 검사를 통과했고 본인 3개 파일을 커밋·upstream push했다. 추가 모델 호출은 하지 않았다. CI와 설치된 변환기의 네트워크 없는 스키마 보존 확인을 진행하며, PR #110의 main 머지·최소 운영 승격·같은 영상 재검증 승인을 별도로 요청했다. 아직 운영 미반영이다.

## 확인된 원인과 후속 수정 PR

- JEV 담당이 운영 LiteLLM 1.102.1의 `llms/gemini/chat/transformation.py`를 확인했다. Gemini Files URL이 아닌 HTTPS `file_id`는 `convert_url_to_base64`를 거치며 YouTube watch URL의 HTML이 영상 MIME과 함께 전달된다. 네트워크 없는 재현에서도 `file_id`가 제거되고 `file_data`로 바뀌었다.
- 설치된 native Gemini 경로는 `/v1beta/models/{model_name}:generateContent`이며 기존 API 키 인증·모델 별칭 라우팅을 사용한다. 운영 edge는 이 경로를 허용하지 않아 비인증 빈 요청에서 404를 확인했다. `/gemini` 접두사를 추가하는 경로와 혼동하지 않는다.
- 수정 [PR #107](https://github.com/hhj4861/commerce-automation-kit/pull/107), 고정 커밋 `3346f68c20d1e520d2c2c09ef3949e04f91ad4f3`: native `fileData.fileUri`로 YouTube 주소 보존, 정상 종료 응답만 수용, 상태 코드·경과 시간만 오류 로그 기록. shared edge와 standalone Caddy 모두 Hanmadi 모델 하나의 정확한 POST 경로만 추가한다.
- 작업 브랜치 `fix/hanmadi-native-video`에 커밋·upstream push 완료. 사용자 추가 승인 후 PR #107을 main에 머지했다: `bc8a870958c0071952968b8cf0e7a1eabda9150b`, 2026-10-01 08:11:15 UTC. 아래 #109 GitOps 배포로 운영 앱에도 반영했다.
- 로컬 테스트 142개, Next route typegen 후 TypeScript, 변경 TS 파일 ESLint, diff 검사 통과. 로컬 Docker가 없어 실제 Caddy 검사는 CI에서 실행했다.
- [Shared AI cloud deployment CI](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36833931369) success: 실제 Caddy에서 native URI 보존, 정상 인증 전달, 무인증·잘못된 키 401, 다른 메서드·모델·stream·관리 경로 404 통과. PR #107의 8개 CI 전부 통과 후 머지했다. [study CI](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36833931334)는 테스트·전체 lint·빌드·v2 브라우저·관리자 배포 경계까지 통과했다.
- JEV 담당의 고정 커밋 읽기 전용 검토에서 차단할 코드 결함은 발견되지 않았다. native URI, 모델 경로 인코딩, 기존 키, STOP 응답 검증, 정확한 POST 허용과 나머지 경로 차단을 확인했다. 운영 native 실호환과 영상→JEV→저장은 여전히 미검증이다. 서버 적용·추가 유료 호출은 하지 않았다.

## 승인 경계와 남은 검증

사용자가 “PR #107 머지·게이트웨이 반영·운영 재배포 승인”으로 추가 범위를 명시 승인했다. main 머지와 별도 edge Caddy 적용, Hanmadi Admin 배포 브랜치 승격·운영 배포를 완료했다. 기존 운영 키로 같은 영상 `OA6gpD9mP0A` 분석·JEV·초안 경로 확인을 이어간다. `deploy/litellm` 배포만으로 edge가 갱신되지 않는다. 검수 전 앱 자료 게시와 파인튜닝은 실행하지 않는다.

승격 [PR #109](https://github.com/hhj4861/commerce-automation-kit/pull/109)는 `fix/hanmadi-native-video` → `deploy/hanmadi-admin`으로 승인된 6개 파일만 포함한다. 먼저 만든 main 기반 #108에는 병행 머지된 PR #106의 학습 앱 단어장 변경이 포함돼 배포 없이 닫았다. #109의 connection CI 첫 시도에서는 기존 화면 대비 검사가 2.957을 측정했으나 직후 출력한 RGB(181,60,10)/흰색의 계산값은 5.808이었다. 영상 변경과 무관한 색상 전환 시점 문제로 판단해 검사·코드 변경 없이 실패 작업만 1회 재실행했고 8분 8초에 정상 통과했다. 같은 소스의 #107 connection 검사도 통과했다. 첫 실패는 통과로 덮어쓰지 않는다.

#109의 8개 CI와 edge 검증 완료 후 08:26:03 UTC 배포 브랜치에 머지했다: `b6c079ad1be14c7f801829c8b46b895b34a4c840`. [GitOps 실행 36836273654](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36836273654)의 plan·Hanmadi Admin deploy 모두 success. 운영 `/api/deployment`가 `hanmadi-admin`과 이 SHA를 반환하는 것을 확인했다. 다른 앱의 배포 브랜치는 변경하지 않았다.

JEV 담당과 확인한 edge 적용·복구 순서:

1. 적용 직전 현재 Caddy mount·이미지·Compose 식별자·설정 해시를 다시 조회해 다른 세션의 변경을 보존한다.
2. 승인된 머지 커밋의 Caddy 설정을 별도 릴리스에 준비하고 같은 Caddy 이미지로 validate한다. 관리 API가 꺼져 있으므로 기존 Compose 식별자를 유지한 edge 단독 재기동으로 적용한다.
3. native 경로 무인증·잘못된 키 401, GET·다른 모델·관리 경로 404와 기존 health·추론·JEV 경로 보존을 확인한다. DB·LiteLLM 키·예산·다른 컨테이너는 변경하지 않는다.
4. 실패 시 적용 직전 기록한 mount·설정·동일 이미지로 edge만 복구하고 기존 경로를 재확인한다. 앱도 이전 배포로 복구할 수 있지만 이전 영상 경로 역시 실패했으므로 영상 기능 복구 성공이라고 부르지 않는다.

JEV 담당이 08:17 UTC 위 edge 적용을 완료하고 공개 경로 12/12 통과를 회신했다. 같은 Caddy 이미지로 validate 후 edge만 교체했으며 gateway·DB·accounts의 컨테이너 ID와 재시작 횟수는 보존됐다. 원격 릴리스는 `/opt/shared-ai/releases/hanmadi-native-edge-bc8a870958c0071952968b8cf0e7a1eabda9150b`, Caddy SHA-256은 `d120ec2d73f1ca2f00db3015c4364744b484a46c9b9491e89609c8b15774817e`다. 복구는 실행하지 않았다. 담당 작성 [상세 증적](20261001-hanmadi-native-edge-production.md), 커밋 `8e2f773`을 읽어 확인했다.

새 임시 검증 키 발급 요청은 자동 승인 검토에서 거절됐다. 정확한 새 키·권한·예산·호출 범위에 대한 사용자 승인이 없다는 이유였으며, 담당 세션에 해당 요청은 전달되지 않았고 키도 발급하지 않았다. 새 키 발급 없이, 수정 배포 승인 후 기존 운영 키를 앱 런타임에서 사용해 검증하는 경로로 변경했다.

## 사용자 문의 OpenAI 키 사용 여부

이번 배포 세션의 직접 OpenAI 호출 기록은 없다. JEV 담당이 승인된 서버의 gateway 환경 파일·실제 컨테이너 환경·런타임 LiteLLM 설정을 읽기 전용으로 확인한 결과, 사용자가 문의한 접두/끝자리와 일치하는 키 및 `openai/` 모델 연결은 없었다. `hanmadi-chat`은 Gemini flash-lite이며 해당 제공자 키도 문의한 키와 불일치했다. 키 원문을 출력·저장하지 않았고 검증용 모델 호출도 하지 않았다. 다른 프로젝트·과거 교체 키·외부 TypeSafe 서비스 내부의 사용 여부까지 미사용으로 단정하지 않는다.

## 증적

산출물 루트: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-video-analysis-20261001/production/`.

- `verification.json`: 첫 브라우저 화면 전환 대기 실패.
- `verification-attempt2.json`: 운영 검색 캐시·첫 영상의 조건 검사 거절·모바일 결과.
- `short-video-verification.json`: 짧은 영상의 실제 공급자 요청 실패.
- `before-analysis-1440.png`, `after-analysis-1440.png`, `after-analysis-390.png`: 실제 운영 화면.
- JEV 담당 키 등록 증적: `gpt 작업/hanmadi-admin/jev-live-20261001/production-connection.json`.

이 문서는 운영 상태를 기록하며 실패를 완료로 바꾸지 않는다. 원문·키·PIN·쿠키·공급자 응답 전문은 저장하지 않는다.
