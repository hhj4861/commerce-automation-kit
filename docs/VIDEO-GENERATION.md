# 공통 영상 생성 — 광고 품질 기준

광고·쇼핑쇼츠의 **기획 검증, 프롬프트, 모델·해상도 선택, 생성 실행 절차**를 이 경로로 통일한다.
구현은 검증된 `@cak/ad-video-gen` 안의 `core/generation.ts`가 소유한다. 소비 원자는 서로 import하지 않고
공통 CLI와 `@cak/contracts`의 `VideoGenerationRequest` / `VideoGenerationPlan`으로 대화한다.
기존 광고의 `buildSpotPrompt`, 소구점·고유성·서사·사람 승인 게이트와 연출 강조를 그대로 사용한다.

## 품질과 비용

- 광고와 쇼츠 모두 기본 `standard`: 광고 엔진의 `seedance_2_0` / `1080p` 설정.
- 저렴한 시안을 요청한 경우에만 `draft`, 방송용을 선택한 경우 `broadcast`를 명시한다.
  티어 설정의 단일 원본은 광고 원자의 `core/video-policy.js`다. `pickTierDefaults`와 앱 경계 검사가
  같은 메타데이터를 사용한다. 쇼츠 전용 저가 기본값은 사용하지 않는다.
- `standard`는 공식 카탈로그(2026-09-14 Claude 독립 조회) 기준 4–15초다. 3초 비트는
  `durationSec:3`, `generationDurationSec:4`로 계획하고 생성 4초 기준 참고 비용을 표시한다.
  15초를 넘는 클립은 분할해야 한다. `draft`/`broadcast`는 기존 설정을 보존하지만 현재 지원 조합이
  미확인이거나 스키마와 달라 `TODO(D1)` 경고를 발급한다. 사양·파라미터·비용 확인 전 실행하지 않는다.
- 스팟 분할·화면비만 소비 목적에 맞춘다. 광고는 기본 전체 스팟/16:9, 쇼츠는 비트별 클립/9:16이다.
- `referenceCredits`는 과거 실측 참고값이며 미실측은 `null`이다. 현재 비용과 지원 사양은 반드시
  힉스필드의 공식 MCP 모델 조회·`get_cost`로 확인한다. 이 문서/계획 생성은 과금을 실행하지 않는다.
- 실제 영상 생성은 사용자가 승인한 컨셉·제작 범위와 비용 범위 안에서 수행한다. 이미 받은 승인은
  재요청하지 않는다. 범위를 넘는 비용이나 사양 변경이 필요한 경우에만 변경 내용을 먼저 알린다.

## 광고에서 사용

승인한 `AdConcept`를 아래 요청의 `concept`에 넣는다. 근거·승인 플래그를 임의로 만들어 통과시키지 않는다.

```json
{
  "target": "ad",
  "tier": "standard",
  "concept": {
    "subject": "승인한 상품명",
    "sellingPoints": ["확인된 소구점"],
    "evidence": ["실제 제품자료 또는 리서치 근거"],
    "uniqueness": { "passed": true, "rationale": "해당 상품만의 구체적인 차별점" },
    "beats": [{ "index": 0, "durationSec": 5, "description": "승인한 장면 묘사", "emphasis": "hero" }],
    "narrativeComplete": true,
    "humanApproved": false,
    "aspectRatio": "16:9"
  }
}
```

위 예제는 형식 안내이며 `humanApproved:false`라 실행 계획 발급이 거부된다. 실제 승인된 컨셉으로 교체한다.

```bash
npm run --silent video:plan -- --request request.json --out video-plan.json
```

- 성공: stdout `{ok:true, plan}`와 `video-plan.json`을 반환한다. 실패: exit 1과 문제 목록을 반환하고,
  지정한 출력 파일에도 `{ok:false, problems, warnings}`를 저장해 이전 승인 계획이 남지 않게 한다.
- 구간별 생성은 `splitByBeat:true`를 추가한다. 원래 비트의 소구점·연출 강조를 각 클립에 그대로 적용한다.
- 프롬프트를 직접 축약하거나 `build-prompt`만 호출한 뒤 모델을 별도로 고르지 않는다.
  `build-prompt`는 기존 호출 호환·진단용으로 유지된다.

## 쇼핑쇼츠에서 사용

기존 `{brief, script}` 초안에 `videoDirection`을 추가한다. 상품명·소구점은 `brief`, 장면·길이는
`script.beats` 한 곳에서 읽는다. 같은 내용을 별도 광고 컨셉에 복사해 관리하지 않는다.

```json
{
  "videoTier": "standard",
  "videoDirection": {
    "evidence": ["실제 리서치/제품자료 근거"],
    "uniqueness": { "passed": true, "rationale": "해당 상품만의 구체적인 차별점" },
    "narrativeComplete": true,
    "emphasis": { "2": "hero" }
  }
}
```

- `emphasis`의 키는 대본 비트 인덱스다. 시각적 강조가 필요한 비트만 `problem`, `resolution`, `hero`를 지정한다.
  사실·효능의 과장을 추가하는 기능이 아니다. `extraStyle`로 제품별 팔레트 등 추가 연출을 지정할 수 있다.
- 대본의 `visualPrompt`는 장면 입력이다. 힉스필드에 직접 보내지 않는다.
- 사용자 기획 승인 → 원자 대본 lint → 공통 계획 생성 순으로 진행한다.
  로컬 서버는 승인 처리 중 CLI를 실행하고, 클라우드는 승인 직후 로컬 워커가 실행한다.
- 작업의 `videoGeneration.plan.clips`가 준비된 뒤 아래 공통 실행 절차로 생성한다.
  클립 생성 담당 세션이 실행하며, ffmpeg 워커 자체가 힉스필드를 호출하는 것은 아니다.
- 상품·장면·길이·연출·티어 변경은 영상 입력 지문을 바꾸므로 이전 계획으로 생성 완료를 기록할 수 없다.
  수정은 초안으로 되돌려 한 뒤 다시 승인한다. 계획 없음·대본과 다른 클립 수는 완료 전이를 거부한다.
- 제휴 링크·설명란 고지 편집은 영상 계획을 유지한다. 표현 검증은 별도로 다시 수행한다.
  워커 PUT은 별도의 전체 승인 입력 지문으로 대본 무단 편집을 거부한다.
- 이전 초안에 `videoDirection`이 없으면 근거를 보완한다. `draft`/`rejected`에서
  `PUT /api/jobs/:id/video-direction`에 `{videoDirection, videoTier}`를 보낼 수 있다.
  이미 생성/조립된 과거 영상은 이 변경으로 재생성하지 않는다.
- 실패 사유는 `videoGenerationError`에 남고 대시보드에 표시된다.

승인 전 참고 견적도 공통 품질 정책으로 조회한다(예: 3초·5초·4초 대본):

```bash
npm run --silent video:estimate -- --tier standard --durations 3,5,4
```

## 공통 생성 실행 절차 — Codex·Claude 모두 동일

1. **현재 계획 확인.** 광고는 성공한 `video:plan` 결과, 쇼츠는 최신 승인 작업의 `videoGeneration.plan`을 읽는다.
   `engine`이 `ad-cinematic-v1`인지 확인하고 쇼츠는 `videoGenerationProblem`으로 현재 지문과 품질을 대조한다.
   반려·수정된 작업의 이전 계획은 실행하지 않는다.
2. **사양·비용 확인.** 현재 연결된 공식 힉스필드 MCP 도구의 모델 스펙으로 각 클립의 모델·해상도·길이 지원을 확인하고
   `get_cost`를 실행한다. 미지원 조합을 지원하는 것으로 가정하지 않는다(`TODO(D1)` 유지).
   승인된 비트보다 긴 길이만 지원하면 지원 길이로 생성하고 해당 비트 길이로 편집할 수 있다.
   변경한 생성 길이·견적을 기록하고 승인 범위 내인지 확인한다. 큐 지연·비용을 이유로 모델/해상도를 조용히 낮추지 않는다.
3. **같은 계획으로 호출.** 각 `clips[]`의 `prompt`, `model`, `resolution`, `generationDurationSec`, `aspectRatio`, `generateAudio`를
   현재 MCP 스키마에 맞춰 `generate_video` 인자로 전달한다. 보통 이름 매핑은
   `generationDurationSec → duration`, `aspectRatio → aspect_ratio`, `generateAudio → generate_audio`다.
   구형 계획은 재발급한다. 생성 후 `durationSec`로 편집해 내레이션·자막 타이밍을 유지한다.
   `mode` 등 모델별 필수 옵션은 확인된 스키마대로 지정한다. 사용권 있는 참조 이미지는 해당 작업의 입력으로 연결하고
   추가된 미디어·옵션도 견적과 실행 기록에 남긴다. 시네마틱 스타일·안전 영역·연출 강조를 삭제하지 않는다.
4. **완료·실물 확인.** 반환 job id로 상태를 확인하고 완료된 파일만 다운로드한다. 실패한 클립은 인덱스·사유를 기록한다.
   프레임·피사체 일관성·제품 일치·실제 해상도·길이를 확인한다. 품질 차이는 프롬프트 일치만으로 보장되지 않으므로
   확인되지 않은 결과를 승인본으로 취급하지 않는다. 재생성은 승인 범위 내의 실패 구간으로 한정한다.
5. **소비자 후처리.** 광고는 승인 스토리보드의 타이틀·브랜딩·VO와 쇼케이스 흐름을 따른다.
   쇼츠는 비트 순서의 `clipPaths`로 `generated` 전이 → TTS/자막/고지 조립 → 사람 검수 → 발행 흐름을 따른다.
   영상 산출과 외부 게시/광고 집행 권한은 별개다.

## 검증 범위

`packages/ad-video-gen/test/generation.test.ts`는 기존 광고 프롬프트 보존, 채널 간 품질 동일성,
승인·근거·프롬프트 검증 실패 시 계획 거부를 검사한다. `apps/shopshorts/test/video-generation*.test.mjs`는
실제 공통 CLI와 로컬 API, 클라우드 라우터의 생성 계획·입력 변경·상태 전이를 확인한다.
이 테스트는 실제 힉스필드 과금이나 새 영상 품질 평가를 수행하지 않는다.

워커 PUT은 최신 `updatedAt`을 포함해야 한다. 서버는 저장 직전 원본 JSON 비교(CAS)로 경합을 막고
충돌 시 409를 반환한다. 워커는 최대 3회 최신 작업을 다시 읽고 패치를 재계산한다.
기획이나 상태가 달라져 패치가 `null`이면 쓰기를 중단한다.
