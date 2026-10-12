# Shopshorts와 터미널 영상 제작 파이프라인 대조 — 2026-10-12

## 결론과 작업 카드

**부분 통합이며 동일하지 않다.** 공통 CLI와 웹 워커는 일부 실행 경로를 공유하지만, 최근 터미널에서 개별 영상에 작성한 Blender 모델·연출·음성 정렬·완성본 검수는 운영 Shopshorts에 모두 편입되어 있지 않다. 메뉴의 ‘3D’와 고품질 렌더 설정만으로 동일 결과물을 보장할 수 없다.

- 요청: 대교 영상 제작 중단 후 플랫폼 기능 점검. 새 영상·외부 유료 생성·업로드·운영 수정·머지 없음.
- 소유/범위: 이 점검 보고서 한 파일. 다른 세션 코드·문서 및 운영 작업 상태 보존.
- 점검 대상: 운영 화면, 운영 checkout, 원격 배포 브랜치, 관련 미머지 구현과 직접 제작 소스. 검증 결과와 구현 계획을 구분한다.
- 완료 기준: 단계별 연결 여부, 실제 사용자 화면 실패 상태, 배포 누락, 공유 구현의 한계, 검사 범위와 다음 순서 기록.
- 현재: 점검 완료. 기능 수정·배포는 수행하지 않음. 중단한 대교 영상은 미완성이며 소스·캐시 보존; 후속 영상 제작 승인과 혼동하지 않는다.

## 확인한 버전과 실행 근거

- 원격 `deploy/shopshorts`: `cf73676a46f29fd539e45af57767b49c64c5c0fa`. `/Users/admin/workSpace/shopshorts-production`의 HEAD도 일치하며 checkout은 깨끗함.
- `com.cak.studio-production.plist`의 WorkingDirectory는 위 checkout, 실행 경로는 해당 `apps/shopshorts/studio-service.mjs`. 설정 경로를 확인한 것이며 실행 프로세스 전체 메모리의 코드 해시 검증을 뜻하지 않음.
- 원격 main: `97a5c6c1f7072688048290e770eb3b54a1cb1e8c`. 최신 main과 운영 브랜치를 같은 것으로 취급하지 않음.
- 운영 웹: `https://shopshorts-dash.pages.dev/studio/dashboard?mode=auto`. 로그인된 기존 사용자 세션에서 확인. 워커 온라인, Codex 연결됨, 진행 중 0개, 확인 필요 2개.
- 현재 화면의 삿포로 프로젝트 `cfb5427a-2686-5652-8b40-3763eea54340`: ‘시나리오 생성 시간이 초과됐습니다. 계정 실행기 상태를 확인하고 다시 시도하세요.’ 대본 생성 재시도 버튼. 알 바흐르 프로젝트도 목록에 시나리오 생성 확인 필요 표시. 재시도·새 생성은 누르지 않음. 과거 실패 기록이 남아 있다는 사실이며, 지금 모든 새 요청이 반드시 실패한다는 뜻은 아님.
- 자동 제작에서 건축학을 선택해 웹툰 혼합/자동 혼합/설명 애니메이션/시네마틱 옵션 확인. ‘전체 Blender’ 선택 항목과 ‘검증된 영상 포맷으로 시작’ 항목은 현재 화면에 없음.
- 직접 `/api/studio/config` 탭 탐색은 브라우저의 `ERR_BLOCKED_BY_CLIENT`로 차단돼 상세 API 응답은 검증하지 못함. 다른 경로로 브라우저 제한을 우회하지 않았음.

## 단계별 차이

| 단계 | 터미널에서 최근 수행한 방식 | 운영 Shopshorts (`cf73676`) | 판정 |
|---|---|---|---|
| 주제·근거 | 이번 대화에서 실제 자료를 검색하고 중복·호기심을 사람이 재검토 | `lib/topic-discovery.js`가 공유 서버 client 사용, 건축 대상·위치·원리·첫 장면·출처를 구조화 | 어댑터 있음. 이번 점검에서는 신규 추천/JEV 실요청을 실행하지 않아 현재 서버 결과는 미확인 |
| 질문과 답·대본 검토 | 최근 영상의 자체 `story.json` 검토. 빗물터널은 사용자 피드백으로 실제 흥미·질문 대응 실패가 드러남 | `studio-scenario.js`가 자료 조사→초안→`reviewDepth`→1회 수정·재검토. digest와 원문 인용으로 검토 유효성 검사 | 검토 구조 존재. 의미적 합격은 자동 보장하지 않으며 터미널 자체 검토와 같은 실행은 아님 |
| Blender 장면 | 영상별 `scene.py`로 건물·부품·환경·카메라·작동을 직접 작성 | `renderers/architecture.py`: rect/ellipse/path/polygon 레이어를 입체화, 재질/깊이/힌지/흐름, 정사영 카메라·배경 | **가장 큰 차이. 동일 전용 모델·공간 연출 아님** |
| 자동 혼합 | 제작자가 장면별 적절한 방법을 직접 선택 | `public/hybrid-plan.js`가 상황/단면/비교/흐름에 따라 웹툰·3D·모션 분기. 건축 cutaway는 실제 Cycles 48samples | 공유 라우팅 있음. Cycles 사용 여부는 모델·연출 품질과 별개 |
| 도입부 | 이번 편별 사용자 승인으로 전체 Blender 예외 적용 | `sceneRoute`는 첫 장면을 Higgsfield로 고정. 원화·6초 영상 견적/잔액/중복 접수 검사 | **사용자 승인형 전체 Blender 분기가 없음**. 설명 애니메이션은 SVG 경로이며 같은 Blender가 아님 |
| 음성·길이 | Kyle 1.1, 공식 TTS speed 설정, 발화 실측·경계 무음 정리·마지막 여유 | Kyle/속도 선택, `studio-narration.mjs` 캐시·실측 있음. 원본 TTS 후 FFmpeg atempo 사용. cinematicEdit가 음성 길이+.3초에 맞춤 | 일부 공통 목표지만 실행·설정·종료 여유는 다름 |
| 자막·헤더 | Pretendard SemiBold/둥근 차콜/74% 위치/흰색·민트 헤더, 로컬 Whisper 타임스탬프 정렬 | `cinematic-production.js`는 gothic/외곽선/82~88% 위치 등을 사용. 글자 수 가중치로 자막 시간 배분 | **최신 디자인·발화 정렬 미일치** |
| 완성본 QA | 전체 decode, 원본과 최종 오디오 비교, 모든 발화 구간 RMS, 검은 화면, 실제 프레임 검토 | 렌더 프로세스 종료·일부 report 체크 후 업로드/완성 상태. 위 항목이 모두 공통 필수 출고 게이트로 연결되지는 않음 | **검증 공통화 부족**. 대본의 화면 계획 심사와 실제 픽셀·소리 검사는 별도 |
| 저장·발행 | Downloads/vedio 파일, 명시적 업로드만 | R2 자산·프로젝트·checkpoint 보존, 자동 media 완료 후 render 연결, 최종 발행 검수 별도 | 플랫폼 기능 있음. 이번 점검에서 게시 테스트 안 함 |

공유 주제 서버에는 이미 `candidate.expectedAnswer`와 실제 `answer`를 비교해 뻔한 상식·규모 나열을 거르는 value 질문이 있다(`services/topic-discovery/service.py:304`). 따라서 ‘의외성 기준이 전혀 없다’고 단정하면 안 된다. 어느 reviewMode/JEV 경로가 운영에서 적용되고 해당 기준을 실제 통과했는지는 별도 실요청·결과 근거가 필요하다. 반환값 자체도 `factChecked:false`, `requiresHumanReview:true`를 유지한다.

## 미머지 변경: 단순 배포 누락과 미구현 구분

- [PR #174](https://github.com/hhj4861/commerce-automation-kit/pull/174): **OPEN, mergedAt=null**, base main. 최신 자막·도입 헤더를 공유 SVG/브라우저/워커에 적용. 현재 운영에는 없음.
- [PR #175](https://github.com/hhj4861/commerce-automation-kit/pull/175): **OPEN, mergedAt=null**, base `feat/modern-video-typography`, head `d38c52174ef6256e6344e91675da56a730b5d12c`. 삿포로 전용 레시피와 모델을 `runHybridCli → executeStudioTask → prepareWebtoon → renderHybridScene → renderAuthoredScene`에 연결한 구현.
- #175의 고정 허용 모델 ID는 `sapporo-hovering-v1` 하나. 임의 주제에 대해 새 전용 Blender 모델을 만드는 범용 엔진이 아니다. 빗물터널/이번 대교의 자체 `scene.py`는 연결돼 있지 않다.
- 기존 #175 작업 기록에는 공통 CLI로 삿포로 본편42.233초 렌더·검수 완료가 남아 있다. 이는 이전 검증 기록이며 이번 점검에서 다시 유료 생성/실렌더한 것은 아니다. 브라우저만으로 모든 단계를 완주했다는 주장도 아니다.
- 두 PR을 적용하더라도 전체 Blender 선택, 일반 주제별 전용 모델, 음성 타임스탬프 정렬, 공통 출고 검수가 모두 해결되는 것은 아니다.

## 이번 실행 검사와 한계

운영 checkout/Node20으로 아래 네 검사 파일 실행:
`architecture-quality.test.mjs`, `explanation-depth.test.mjs`, `adaptive-hybrid.test.mjs`, `studio-automatic.test.mjs`.
**31건 중 29통과, 0실패, 2생략**. 생략은 opt-in 실제 Blender/HyperFrames 렌더. 이 결과는 fixture 기반 API·대본 검토·경로·승인·재사용 검사이며 운영 신규 영상 E2E 성공이 아니다.

#175 worktree의 `authored-recipes.test.mjs` 재실행은 `@resvg/resvg-js` 의존성 부재로 import 시점 실패. 0통과이며 기능 실패로 단정하지 않음. 다른 세션 worktree에 의존성 설치/파일 변경은 하지 않았다. 배포 전 의존성을 갖춘 격리 검증 환경에서 다시 통과해야 한다.

현재 Mac의 ElevenLabs 공식 API TLS는 Fortinet 발급 인증서가 신뢰되지 않아 실패했다(Node20, Node24 시스템 CA, 시스템 curl). 키·한도 문제로 단정하지 않음. 새 TTS 요청은 전송 전에 실패했고 TLS 검증 비활성화/CA 임의 등록은 하지 않았다. 같은 네트워크에서 실행되는 제작 워커의 실음성 준비 상태는 단순 `voice: !!env.ELEVENLABS_API_KEY`로 입증되지 않는다.

검사 로그: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261012-pipeline-audit/{production-checks.log,recipe-checks.log}`.

## 권장 구현·검증 순서 — 아직 실행하지 않음

1. **실행 준비 상태를 바로잡기:** 시나리오 시간 초과를 요청 ID/계정 실행기 단계별로 진단. TTS 정상 TLS 연결과 Blender/모션 런타임/예산을 확인하고 워커 온라인과 ‘생성 가능’을 분리한다. 오래된 실패를 무작정 재요청하지 않는다.
2. **검증된 변경 운영 반영:** 의존성을 갖춘 #174/#175 회귀 검증→각 PR 명시 승인·머지→deploy/shopshorts 승격→Pages와 제작 워커 동시 적용. 브라우저에서 레시피 초안부터 발행 검수까지 실제 완주해 비교한다. 자동 게시하지 않는다.
3. **공통 제작 계약으로 묶기:** 주제 근거·예상 답/실제 답·대본 검토·장면의 원인/변화/결과·모델/리그·동작 타이밍·음성·자막·검수 보고서를 하나의 버전된 프로젝트로 저장. 터미널도 개별 조립 스크립트 대신 같은 실행기를 호출한다.
4. **전용 장면을 확장 가능한 등록 방식으로 통합:** 기존 검증된 Blender 모델/리그를 신뢰된 레시피와 매개변수로 등록하고, 미지원 주제는 검토·제작 필요를 명시한다. 도형 렌더를 전용 모델과 같은 품질로 표시하거나 사용자 입력 Python을 서버에서 무제한 실행하지 않는다. 승인형 전체 Blender 모드도 웹/CLI에 같은 계약으로 추가한다.
5. **출고 게이트와 실제 비교:** 타임스탬프 자막, 음성 누락·끝 잘림·검은 화면·프레임 검증, 첫 질문/최종 답/실제 장면 일치의 시청 검토를 필수 상태로 저장. 같은 프로젝트를 CLI와 웹으로 만들어 renderer/source/voice/style/검수 결과를 비교한 뒤 ‘동일 파이프라인’이라고 보고한다.

이번 변경은 이 보고서뿐이다. 대교 영상은 사용자 요청으로 중단 상태이며 운영 기능이 개선되었다고 보고하지 않는다.
