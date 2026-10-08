# drama-series 키프레임 우선 파이프라인 — 설계 (r7)

- 날짜: 2026-10-08
- 상태: r3 — r2: Codex 리뷰(`archive/20261008T082354-codex-keyframe-design-review.md`) 반영. r3: 사용자 결정(2026-10-08) "모든 컷을 시나리오 대비 판정해 pass 여야 다음으로" — 방식 A(자동 판정 pass 면 진행, 사람은 파일럿·예외 통과·회차 미리보기만) 추가
- r4: 사용자 결정(2026-10-08) — (1) Codex 에서도 같은 구조로 실행 가능하게(이식은 Codex 세션 담당), (2) 시나리오 교차 리뷰: Claude 가 쓴 시나리오는 Codex, Codex 가 쓴 시나리오는 Claude 가 리뷰. §16·§17 추가
- r5: 사용자 결정(2026-10-08) — 파이프라인은 같은 세션에서 이어지지 않으므로 교차 리뷰는 세션이 아닌 **리뷰 토큰** 기반으로 주고받고, 에이전트별 서명 키는 GCP Secret Manager(shorts 프로젝트)에서 관리. §18 추가, §17 갱신
- r6: 사용자 지적(2026-10-08) — 회차 간 연결 누락. "1화 마지막 컷이 2화 첫 컷으로 이어지는 것, 회차·컷마다 배경·문맥이 연결되는 것이 이 파이프라인의 핵심". §19 추가. r5 까지는 회차 안의 연결만 다뤘다(설계 결함)
- r7 초안: 요구 목록(`2026-10-08-drama-pipeline-requirements.md`) 대비 재검토 — 독립 검토 에이전트 결과 반영(§20). Codex 재검토(archive/20261008T154540-codex-full-rereview-dcddf97.md, 판정 changes) 합침(§21) — 사용자 범위 결정 대기
- 대상(담당 범위): `packages/contracts/src/drama-series.ts`(append-only), `packages/drama-series`, `.claude/skills/drama-series`, 관련 spec·test. `apps/shopshorts` 는 건드리지 않는다
- 선행 설계: `2026-10-06-drama-series-design.md`

## 1. 왜 바꾸나 (2화 「문밖」 생성 실측)

| # | 증상 | 원인 |
|---|---|---|
| 1 | 컷마다 쪽문 주변 배경이 바뀜 | 장소 참조 그림은 넓은 통로뿐. 쪽문·잠금쇠·방화문은 글로만 지시 → 매번 새로 지어냄 |
| 2 | 앞 컷 마지막 프레임으로 이어도 배경 재창작(연결 SSIM 0.92인데 배경 불일치) | start_image 는 첫 프레임만 고정. 카메라가 물러나면 세트를 다시 만든다 |
| 3 | 팔 꺾기 행동 누락, 박반장 위치 이상 | 17초 컷에 인물 4·대사 5·행동 4 |
| 4 | 동작 참조 영상의 음성("누리!")까지 따라 함 | 소리가 있는 클립을 video_references 로 넣음 |
| 5 | 일부 프레임 의상(조끼) 누락 | 얼굴·의상을 한 장 참조로만 지정 |

참고 자료(사용자 제공 영상 5편, Higgsfield 공식 Seedance 2.5 가이드 등 6건)의 공통 공정은 "이미지로 장면을 먼저 확정하고 영상은 마지막"이다. 이 설계는 그 공정을 **결정적 관문 + 구조화 필드 기반 프롬프트 조립 + 실행 경계의 사람 승인**으로 코드에 박는다. 재생성을 줄이는 것이 목적이며, 첫 생성 성공을 보장하지 않는다.

## 2. 목표 / 비목표

**목표**
- 생성 전(0크레딧) 결정적 관문이 문제 1·3의 구조적 원인을 대본 단계에서 걸러낸다.
- 신규 정책 회차는 컷마다 사람이 승인한 키프레임 없이는 영상 명세를 만들지 않는다.
- 프롬프트는 구조화 필드(구도·블로킹·비트·대사)에서 자동 조립한다.
- **실행 경계**: 파일럿 컷과 이어지는 컷의 선행 출력이 사람 승인되지 않으면 다음 생성 작업이 '제출 가능' 목록에 나오지 않는다(review 경고가 아니라 코드상 차단).

**비목표**
- 코드가 힉스필드 MCP 를 직접 호출하지 않는다(세션이 호출 — 기존과 동일).
- SSIM 같은 픽셀 지표로 자동 승인하지 않는다.
- 업스케일 단가·참조 강도 조절은 다루지 않는다(TODO(D1)).
- 판정 기준(JEV 장르 관문)을 낮추지 않는다.

## 3. 정책 버전 — legacy / shot-v1

- `DramaEpisode.shotPolicy?: { version: 'shot-v1'; strict: true }` (append).
- **없으면 legacy**: 현행 동작 그대로(새 관문은 info 만, plan 은 키프레임을 요구하지 않음, chainsFrom 기존 의미). 1화·2화 기존 기록이 validate·plan 모두 그대로 통과하는 회귀 테스트를 둔다.
- **shot-v1**: §4 관문 block, §6 keyframes 필수 관문, §8 연결 규칙, §10 실행 경계가 모두 적용된다. 신규 회차의 기본값이며 CLI 외 진입점(라이브러리 함수 `buildPlan`)도 같은 규칙을 적용한다 — 정책은 에피소드 데이터에 저장되므로 진입점과 무관하다.
- 아래 경계값은 **잠정 제작 품질 정책**이며 제공자 제한이 아니다(Seedance 2.5 API 는 4~30초). 상수는 `core/shot-policy.ts` 에 `SHOT_V1` 으로 모으고 출처(2026-10-08 2화 실측 + 가이드 주장)를 주석에 남긴다.

## 4. 계약 변경 (`packages/contracts/src/drama-series.ts`, append-only)

```ts
/** 장소 안의 고정 구도. 구도마다 배경 그림 1장 */
export interface DramaSetup {
  id: string;
  name: string;
  /** 카메라 구도(영어). 예: 'static eye-level medium-wide shot facing the side door' */
  cameraEn: string;
  refAssetId?: string | undefined;
  /** 배경 그림에 그려 넣었다고 '선언한' 소품 id(장소 props 의 부분집합). 이미지 인식 검증이 아니다 */
  visiblePropIds: string[];
}
// DramaLocation
setups?: DramaSetup[] | undefined;

export interface DramaShotPolicy { version: 'shot-v1'; strict: true }
// DramaEpisode
shotPolicy?: DramaShotPolicy | undefined;

export type DramaScreenSide = 'left' | 'center' | 'right';
export interface DramaBlocking { characterId: string; side: DramaScreenSide; depth?: 'front' | 'mid' | 'back' | undefined }
export type DramaCameraMove = 'static' | 'push-in' | 'pull-out' | 'pan' | 'follow';

/** 시간 순 행동 단위. sec 를 주면 그 길이, 없으면 남은 시간을 발화량 비례로 배분. lines 는 이 비트에서 말하는 대사 인덱스 */
export interface DramaBeat { en: string; sec?: number | undefined; lines?: number[] | undefined }

/** 사람 승인 증거. 내용 지문(fingerprintOf)에서 제외한다 */
export interface DramaKeyframe {
  assetId: string;
  /** 승인 당시 내려받은 파일의 sha256 — 같은 assetId 로 파일이 바뀌어도 감지 */
  fileSha256: string;
  /** 승인 당시 keyframeDigest(§7) */
  digest: string;
  approvedBy: string;
  at: string;
}

// DramaCut (모두 선택)
setupId?: string | undefined;
blocking?: DramaBlocking[] | undefined;
/** 앞 컷과 좌우가 바뀌는 이유를 명시(이동·리버스샷). 없으면 반전은 review */
blockingChange?: 'move' | 'reverse' | undefined;
cameraMove?: DramaCameraMove | undefined;        // 생략 = 'static'
beats?: DramaBeat[] | undefined;
/** 이 컷이 화면에 쓰는 장소 소품 id */
usedPropIds?: string[] | undefined;
/** shot-v1: 앞 컷 마지막 프레임에서 바로 이어진다고 명시(§8). 없으면 자체 키프레임으로 시작 */
continuesFromPrev?: boolean | undefined;
keyframe?: DramaKeyframe | undefined;

// DramaCutCast
/** 이 인물이 들고 들어오는 소품 id(배경 그림에 없어도 됨) */
carriesPropIds?: string[] | undefined;

// DramaCharacterLook
/** 의상 전신 참조(얼굴 참조와 분리) */
outfitRefAssetId?: string | undefined;

// DramaClipSpec — medias(image_references 전용)의 의미는 바꾸지 않는다
/** 시작 이미지. keyframe = 승인 키프레임, prev-clip = 앞 컷 승인 출력의 실제 마지막 프레임(생성 시점에 세션이 채움) */
startImage?: { source: 'keyframe'; assetId: string } | { source: 'prev-clip'; fromCut: string } | undefined;
/** 승인 키프레임 자산 id(실행 명세 사본). plan 이 cut.keyframe.assetId 와 같은지 검사 */
keyframeAssetId?: string;
```

- `DramaClipMedia.role` 은 계속 `'image_references'` 만 받는다. 시작 이미지는 `startImage` 로 분리한다.
- `@ImageN` 번호는 어댑터 한 곳(`referenceMap()`)에서 **실제 백엔드에 보낼 image_references 순서**로 한 번만 계산한다. start_image 가 번호에 포함되는지는 미확인(TODO(D1)) — 파일럿에서 확인하고 그 결과를 상수와 테스트로 고정한다. 견적(get_cost) 성공을 근거로 확정하지 않는다.
- contracts 에는 해시·파일 IO·원자 import 를 넣지 않는다(타입만).

## 5. 결정적 관문 `shot` (validate, 0크레딧, shot-v1 에서 block)

| 규칙 | block | review |
|---|---|---|
| 컷 길이 | > 12초 | > 10초 |
| **발화+동작 시간** | 추정 발화 시간(대사 음절 ÷ 2.2음절/초, 기존 dialogue-lint 상수) + 비트당 동작 여유 1.5초 > 컷 길이 | 여유 < 1초 |
| 대사 줄 | > 3 | > 2 |
| 화면 인물 | > 3 | — |
| 비트 | 없음, 또는 > 2, 또는 sec 합 > 길이, 또는 lines 인덱스가 범위 밖·중복·누락 | — |
| 구도 | 장소에 setups 가 있는데 setupId 없음 / 없는 setupId | — |
| **소품(구조화)** | `usedPropIds` 중 (구도 visiblePropIds ∪ 출연진 carriesPropIds ∪ 직전 같은 장소 컷 propState 로 들어온 소품) 어디에도 없는 것 | — |
| 소품(문자열 보조) | — | 장소 소품명·별칭이 action/beats 에 보이는데 usedPropIds 에 없음 |
| 블로킹 | cast 와 blocking 인물 집합 불일치(누락·미등록), 같은 인물 중복 | — |
| 좌우 반전 | — | 같은 구도 연속 컷에서 같은 두 인물의 좌우가 뒤바뀌었는데 blockingChange 가 없음(transitionIn 만으로 면제하지 않음) |

legacy 에서는 같은 규칙을 info 로만 낸다(보고서에는 남김). 기존 dialogue-lint 의 줄 수 review 와 중복되지 않도록 shot-v1 에서는 dialogue-lint 가 줄 수 메시지를 내지 않는다.

## 6. 키프레임 단계 (사람 게이트)

1. `ds keyframe-build --series --episode --aspect <16:9|9:16> --out <dir>/keyframes/requests.json`
   - 컷마다 이미지 요청 1건(gpt_image_2_5). **화면비는 `--aspect`(= plan 의 VideoOptions.aspectRatio)** 이고 digest 에 들어간다.
   - medias = 구도 배경 → 인물 얼굴 → 의상. 프롬프트 = 구도 cameraEn + 블로킹 + 첫 비트 시작 상태 + 사용 소품 + 의상 고정 + "Same set as the reference; do not add or remove set pieces" + 스타일.
   - `continuesFromPrev` 컷도 키프레임을 만든다(구도·블로킹 확인용, 영상에서는 image_references 로만 사용).
2. 세션이 `generate_image_batch` 로 생성 → `<media>/keyframes/<cut>.png` 로 내려받는다.
3. `ds keyframe-sheet --episode --images <dir> --out sheet.jpg` — 회차 전 컷을 한 장(컷 id·첫 대사 라벨)으로.
4. 사람이 승인한 컷만 `ds approve-keyframe --series --episode --cut --asset <job_id> --file <png> --aspect <..> --by user` → `cut.keyframe`(assetId, fileSha256, digest) 기록.
5. shot-v1 plan 필수 관문 `keyframes`: 모든 컷에 keyframe 이 있고, 현재 keyframeDigest 와 같고, 기록된 파일이 존재하면 sha256 이 같아야 한다. 생성된 명세의 `keyframeAssetId` 는 `cut.keyframe.assetId` 와 같아야 한다.

## 7. 지문(fingerprint) 분리

- **내용 지문 `fingerprintOf`**: 기존처럼 대본 전체를 해시하되 `cut.keyframe`(승인 증거)을 대사 verification 과 같은 방식으로 **제외**한다. → 키프레임 승인 저장만으로 다른 관문 기록이 무효화되지 않는다(테스트로 고정).
- **`keyframeDigest(series, episode, cut, aspect)`** (`core/keyframe-digest.ts`, 버전 'kf-v1'): 정지 그림에 영향을 주는 입력만.
  - version, cutId, aspectRatio
  - 해석된 장소 anchorText·구도(cameraEn, refAssetId, visiblePropIds)
  - cast 의 character id, look id, look description, refAssetId, outfitRefAssetId, carriesPropIds
  - blocking, blockingChange, cameraMove, 첫 비트 en, action, visualEn, usedPropIds
  - 입력 연속성: 직전 같은 장소 컷의 propState
  - series.styleEn
  - 대사는 **화자 목록과 줄 수**만 포함(감정·시선이 바뀌는 연기 지시는 action/beats 로 쓰도록 지침화). 순수 문구 변경은 키프레임 재승인을 요구하지 않지만, 기존 대사 검증(line-hash)과 내용 지문이 영상 계획·대사 판정 재실행을 요구한다.
  - 참조 자산의 '버전'은 assetId 로 대표한다(힉스필드 job_id 는 불변 결과). 로컬 키프레임 파일 교체는 fileSha256 으로 감지한다.

## 8. 연결(continuation) 규칙

- legacy: 기존 `chainsFrom`(같은 장소 + transitionIn cut) 그대로. 의미를 바꾸지 않는다.
- shot-v1: `chainsFromV1(prev, cut)` = `cut.continuesFromPrev === true` **그리고** 같은 setupId **그리고** 블로킹 인물 집합이 호환(같거나 blockingChange 명시) **그리고** transitionIn 이 cut. 하나라도 어긋나는데 continuesFromPrev 가 true 면 shot 관문 block. 연결되지 않는 컷은 자체 승인 키프레임을 startImage 로 시작한다.

## 9. 프롬프트 자동 조립 (`toSeedanceClip`, shot-v1 분기)

image_references 순서: 인물 얼굴 → 의상 → 구도 배경 → (continuesFromPrev 컷이면) 승인 키프레임. startImage 는 §4 대로 별도.

프롬프트 순서(필수 조건 앞):
1. 참조 역할: `@Image1 = face of X. @Image2 = outfit of X (keep every garment in every frame). @Image5 = the set and camera framing — keep it identical.`
2. 연속성: startImage 가 있으면 `Start exactly from the start image; background, lighting and wardrobe stay identical to it for the whole shot.`
3. 카메라: cameraEn + 이동(static → `Locked-off camera, no camera movement, no cut.`)
4. 블로킹: `X stays screen-left, Y screen-right for the whole shot.`(blockingChange 가 move 면 비트 안에 이동을 명시)
5. 비트: sec 지정값 우선, 나머지는 각 비트 대사의 추정 발화 시간 + 1.5초 비례로 배분 → `0.0–4.5s: … 4.5–10.0s: …`
6. 대사: `Exactly N spoken lines, nothing else is said:` + 비트 구간 안에 화자·대사 배치
7. 소리: sfx + 항상 `No background music.`
8. 구도 배경 요약 + 스타일

legacy 회차는 기존 조립을 그대로 쓴다(회귀 테스트).

## 10. 실행 경계 — 사람 승인 없이는 다음 작업이 나오지 않는다

`DramaReport.ok` 는 block 이 없으면 true 이므로 review 로는 막을 수 없다. 그래서 생성 진행을 별도 상태로 관리한다.

- 실행 상태 파일 `<dir>/run-<ep>.json` (계약: `DramaRunState { planFingerprint; clips: { cutId; jobId?; assetId?; fileSha256?; frameCheck?; approvedBy?; at? }[] }`, append). 에피소드 파일과 분리해 내용 지문을 흔들지 않는다.
- 컷 상태: `generated → verdict(pass|fail) → [human-approved] → released`. 상태는 출력 자산(job_id + 파일 sha256)에 묶이고, 파일이 바뀌면 판정·승인 모두 무효.
- **모든 컷**은 §10a 컷 판정 `pass` 가 있어야 다음 컷이 열린다(사용자 결정 A).
- 사람 승인(`ds approve-clip --run --cut --asset <job_id> --file <mp4> --by user`)이 추가로 필요한 경우만:
  - 파일럿: 회차의 처음 `PILOT_CUTS = 2` 컷 — pass 이후 사람 승인까지 받아야 3번째 컷부터 열린다.
  - 예외 통과: fail 판정을 사람이 근거를 보고 통과시킬 때(`--override --note` 필수, fail 항목과 함께 기록).
  - 회차 완성 미리보기: 전 컷 released 후 조립본을 사람에게 보이고 승인 — 업로드·최종 1080p 확정 전 관문.
- `ds next --plan --run` — 지금 제출 가능한 컷만 출력한다:
  - 파일럿 2컷이 사람 승인되기 전에는 3번째 컷부터 나오지 않는다.
  - 그 뒤 각 컷은 앞 컷이 pass(또는 예외 승인)인 뒤에만 나온다. `startImage.source = 'prev-clip'` 컷은 그 판정된 자산의 실제 마지막 디코딩 프레임을 쓰라고 명시한다.
  - fail 컷이 있으면 그 컷의 재생성만 나오며(재생성 상한·크레딧은 사용자 승인 범위 안), 뒤 컷은 막힌다.

### 10a. 컷 판정 `clip-verdict` (모든 컷, 0크레딧)

- `ds verdict-build --run --cut --file <mp4>` 가 대본에서 판정 항목을 **자동 생성**한다(판정자가 항목을 고르지 않는다):
  1. 대사: whisper large-v3 받아쓰기와 대본 대조 — 줄별 CER ≤ 0.15(기존 `LINE_CER_MAX`), 줄 수·순서 일치. 결정적.
  2. 비트: 비트마다 구간 시작·중간·끝 프레임 3장 + 질문 "이 프레임들에 '<beat.en>' 이 일어나는가" — pass/fail + 근거 프레임.
  3. 인물·의상·블로킹: 출연진 전원 등장, 좌·우 위치, 의상 요소(look description 의 의상 구)가 유지되는가.
  4. 배경: 승인 키프레임과 같은 세트인가(usedPropIds 소품이 보이는가, 그림에 없는 세트 요소가 생겼는가). SSIM 은 참고 수치로 첨부만.
  5. 연결: 앞 컷이 있으면 join SSIM(참고) + "앞 컷 마지막 장면에서 이어지는가".
  - 산출: `verdict-<cut>.request.json` + 판정용 프레임 시트(비트 행 × 3열, 키프레임 대조 열).
- 판정자: 2~5는 세션의 멀티모달 판정(프레임 시트를 보고 항목별 pass/fail + 근거)을 1차로 쓴다. JEV 가 이미지 입력을 받는지는 TODO(D1) — 받으면 JEV 로 교체해 생성 주체와 판정 주체를 분리한다. 생성 주체가 판정하는 한계는 판정 항목 자동 생성·근거 프레임 필수·사람 예외 통과 기록으로 완화하고, 보고서에 판정자를 명시한다.
- `ds verdict-apply --run --cut --response <json>` — 모든 항목 pass 일 때만 `pass`. 응답에 항목 누락·근거 프레임 누락이 있으면 `fail` 로 기록(침묵 통과 금지).
- 스킬은 `ds next` 출력에 있는 컷만 제출한다(스킬 문장만으로 끝내지 않고 이 명령이 경계다).

## 11. 생성 직후 점검 `frame-check` (참고 지표, 0크레딧)

- 정적(static) 컷: 실제 첫 프레임·**비트 경계 프레임**·실제 마지막 디코딩 프레임을 키프레임과 SSIM(640×360 회색조) 비교 → 보고서에 수치로 남김. 마지막 프레임은 `-sseof` 로 끝부분을 디코딩해 마지막으로 나온 프레임을 쓴다(길이 시각 seek 금지).
- 카메라 이동 컷: 전역 SSIM 은 N/A 로 표시하고 사람 검토 대상으로 넘긴다.
- SSIM 은 픽셀 유사도일 뿐 의상·배경·동작 정확성 판정이 아니다. 높은 값으로 자동 승인하지 않는다(실측: 0.92 인데 배경 틀림). 어떤 값이든 §10 의 사람 승인이 필요하다.
- `frame-sheet` — 비트 경계 프레임을 키프레임 옆에 붙인 검토용 한 장을 만든다.
- 임계값은 실제 좋은/나쁜 컷의 오탐·미탐 기록이 쌓이기 전까지 두지 않는다. 합성 bars/noise 테스트는 계산기 검증용으로만 쓴다.

## 12. 참조 영상·비용 원칙 (스킬)

- 동작 참조 영상: 사용권이 확인된 자체 생성물만. 원본 보존, `ffmpeg -an` 사본 생성 후 `ffprobe` 로 오디오 스트림 0개 확인한 사본만 업로드. 음성 누출이 사라지는지는 미실측.
- 비용 수치(키프레임 장당 약 0.25, 영상 3크레딧/초)는 실제 모델·입력 조합의 get_cost 로 확인한 값만 쓰고, 승인 예산과 분리해 보고한다. 추가 크레딧 집행은 매번 사용자 승인.
- `SKILL.md`: 2(기획) → 2.5 키프레임(사람 승인) → 5(계획) → 6(생성 루프: `ds next` → 생성 → `verdict-build` → 판정 → `verdict-apply` → 파일럿 2컷은 `approve-clip` → 다음) → 7(조립·회차 미리보기 사람 승인).
- `WRITING-GUIDE.md`: 컷 1개 = 비트 1~2개·대사 2줄 이하·5~10초, 블로킹·구도·usedPropIds 작성법, 그림에 없는 세트 요소 금지, 감정·시선은 action/beats 에.

## 13. 테스트 (TDD)

- **legacy 회귀**: 1화(ep01-9min)·2화 기존 대본의 validate·plan 결과가 변경 전과 같다.
- **정책**: shot-v1 경계값(10/12초, 2/3줄, 3/4명, 비트 0/2/3개, sec 합 초과), 발화+동작 시간 초과.
- **소품**: usedPropIds 가 visible/carries/propState 어디에도 없으면 block, carries·propState 로 들어오면 통과, 문자열 보조 탐지는 review 만.
- **블로킹**: 누락·미등록·중복 block, 좌우 반전 + blockingChange 없음 review, 있으면 통과.
- **지문 변형**: keyframe 승인 저장 → fingerprintOf 불변(다른 관문 유효). 장면(action/blocking/setup/look/aspect) 변경 → keyframeDigest 변화 → plan block. 대사 문구만 변경 → keyframeDigest 불변, 대사 검증 재요구. 파일 sha256 변경 → block.
- **참조 매핑**: image_references 순서와 @Image 번호, 의상 참조 위치, startImage 가 medias 에 들어가지 않음, keyframeAssetId 일치 검사.
- **화면비**: keyframe-build 요청 화면비 = plan 화면비, 다르면 digest 불일치로 block.
- **연결**: chainsFromV1 조건별(구도 변경·블로킹 비호환 시 continuesFromPrev block), legacy chainsFrom 불변.
- **실행 경계**: ds next — 파일럿 2컷 pass+사람 승인 전 3번째 컷 비노출, 이후 앞 컷 pass 전 비노출, fail 이면 해당 컷 재생성만 노출, 예외 통과는 --override --note 필수, 파일 sha 변경 시 판정·승인 무효.
- **교차 리뷰**: 리뷰어 = 작성자면 거부, 지문 불일치·changes 면 plan block, 회차 잠금 owner 불일치 시 next/verdict/approve 거부.
- **컷 판정**: verdict-build 항목 자동 생성(비트 수만큼 비트 항목), 대사 CER 결정적 판정, 응답 항목·근거 누락 시 fail, 전 항목 pass 만 pass.
- **frame-check**: 계산기(bars/noise), 카메라 이동 컷 N/A, 실제 마지막 프레임 추출.
- 기존 89개 + tsc.

## 14. 2화 적용 (유료 단계는 별도 사용자 승인)

1. 구도 배경 그림: `aisle/side-door`(1차 3컷 첫 장면 기반, 잠금쇠·방화문·소화함을 그림에 포함), `aisle/wide`(기존), `yard/door`(기존 하역장).
2. 2화를 `shotPolicy: shot-v1` 로 올리고 4~7컷을 규칙에 맞게 재구성 → validate·JEV 재판정.
3. 키프레임 생성 → 시트로 사용자 승인.
4. `ds next` 파일럿 2컷 → 컷 판정 pass + 사람 승인 → 나머지는 컷마다 판정 pass 후 다음 → 회차 미리보기 사람 승인.
5. 이미 만든 3컷·8컷은 legacy 출력이므로 재사용 여부를 사용자와 정한다(키프레임 소급 승인 가능).

## 15. 미확인 (TODO(D1))

- start_image + end_image + image_references 동시 사용: get_cost 견적만 통과(8초 24크레딧) — 실제 생성 허용은 파일럿에서 확인.
- `@ImageN` 이 start_image 를 세는지: 공식 문서 미확인.
- 참조 이미지 최대 개수, 참조 강도 조절: 미확인.
- 무음 참조 영상으로 음성 누출이 사라지는지: 미실측.

## 16. 에이전트 공용 실행 (Claude ↔ Codex)

- 절차의 단일 원본은 `.claude/skills/drama-series/SKILL.md` + `WRITING-GUIDE.md` 다. Codex 입구 `.agents/skills/drama-series/SKILL.md` 는 원본을 읽고 따르라는 얇은 문서로 두고 절차를 복제하지 않는다(어긋남 방지). 이식 작업은 Codex 세션이 맡는다.
- 코드 경계(`ds next`, 컷 판정, 키프레임·plan 관문)는 에이전트와 무관하게 같은 규칙을 강제한다.
- **회차 잠금**: `DramaRunState.owner?: { agent: 'claude' | 'codex'; session: string; since: string }`(append). `ds next`·`verdict-apply`·`approve-clip` 은 `--agent` 가 owner 와 다르면 거부. 넘길 때는 `ds handoff --run --to <agent> --note` 로 명시 기록.
- 힉스필드 생성: Claude 는 claude.ai 계정 커넥터. Codex 는 현재 힉스필드 MCP 미설정 — Codex 에서 쓸 수 있는 공식 MCP 접속 경로가 있는지 TODO(D1). 없으면 Codex 는 무과금 단계를 맡고 생성 요청은 메일함으로 Claude 세션에 넘긴다(`ds next` 출력을 그대로 첨부).

## 17. 시나리오 교차 리뷰 (사람 승인 1 앞의 필수 관문)

- `DramaEpisode.authoredBy?: 'claude' | 'codex'`(append). shot-v1 회차는 필수.
- 시나리오(대본·컷 구성·대사)를 만든 에이전트가 아닌 쪽이 리뷰한다: Claude 작성 → Codex 리뷰, Codex 작성 → Claude 리뷰. 요청·답장은 `.agent-mailbox/drama-series/` 규칙(원자적 쓰기, 머리말)을 따른다.
- 요청 내용: 회차 파일 경로·내용 지문, validate·JEV 결과 요약, 확인받을 항목(이야기 흐름·장르 약속·연속성·컷 규칙·수위).
- 리뷰 요청·응답·기록은 §18 의 토큰 방식으로만 한다(세션 ID 에 의존하지 않는다). `ds cross-review-apply` 가 토큰·지문·서명을 검증해 관문 보고서 `cross-review` 를 남긴다. 리뷰어 = authoredBy 이면 거부.
- shot-v1 plan 필수 관문에 `cross-review` 추가: 현재 내용 지문과 같은 `pass` 기록이 있어야 한다. 대본을 고치면 다시 리뷰.
- 리뷰는 정보이며 사용자 승인이 아니다. 사람 승인 1(기획 확정)은 교차 리뷰 pass 뒤에 사용자에게 받는다.

## 18. 토큰 기반 리뷰 통신 (세션 무관)

파이프라인은 여러 날·여러 세션에 걸쳐 진행되므로, 요청한 세션이 사라져도 리뷰가 이어져야 한다. 메시지를 세션이 아니라 **리뷰 토큰**에 묶는다.

**발급** — `ds review-request --series --episode --author <claude|codex> --reviewer <codex|claude> [--ttl-hours 72]`
- 토큰: 128비트 난수(`rv_<base32>`). 기록 `docs/videos/<작업>/reviews/<token>.request.json`(저장소 커밋 대상): token, kind('scenario'), episode 경로, 내용 지문(fingerprintOf), author, reviewer, createdAt, expiresAt, 요청 요약(validate·JEV 결과, 확인 항목).
- 같은 파일을 상대 메일함(`to-<reviewer>/`)에 사본으로 넣는다(원자적 쓰기). 메일 파일명에 토큰을 포함한다.

**처리** — 리뷰어 쪽은 어느 세션이든 시작 시 `ds review-inbox --agent <me>` 로 자기 앞 미처리 토큰을 찾는다(요청 기록 중 응답 없는·만료 안 된 것). 스킬 시작 단계에 넣는다.

**응답** — `ds review-respond --token --verdict pass|changes --file <리뷰 md> --agent <me>`
- 응답 본문: token, reviewedFingerprint(리뷰 시점 회차 지문 — 요청 지문과 다르면 응답 거부), verdict, findings[], reviewer, respondedAt.
- **서명**: 응답 본문의 canonical 직렬화에 리뷰어 개인 키로 Ed25519 서명. 기록 `reviews/<token>.response.json` + 상대 메일함 사본.

**적용** — `ds cross-review-apply --token`
- 검증(하나라도 실패하면 거부, 사유를 보고서에 기록): 요청 기록 존재, 미사용(1회용), 미만료, reviewer ≠ author, 응답 reviewer = 요청 reviewer, reviewedFingerprint = 요청 지문 = **현재** 회차 지문, 서명이 reviewer 공개 키로 검증됨.
- 통과 시 관문 보고서 `cross-review`(지문·토큰·verdict) 기록, 토큰을 사용 처리. verdict=changes 면 ok=false.

**키 관리 (GCP Secret Manager — 사용자 결정 2026-10-08: "gcp 활용, shorts 프로젝트에 등록")**
- 비대칭 키(Ed25519). 검증에는 공개 키만 필요하므로 공개 키는 저장소 `packages/drama-series/review-keys/<agent>.pub`(커밋), **개인 키는 GCP Secret Manager** 에만 둔다. 로컬 파일·iCloud·메일함·저장소에 개인 키를 쓰지 않는다.
- 프로젝트: GCP `gen-lang-client-0881453127`(표시 이름 shorts) — 사용자 지정 2026-10-08. 같은 날 조회 기준 Secret Manager API 미사용 상태(사용 설정 필요).
- 비밀 이름(GCP 규칙상 `/` 불가): `cak-drama-review-claude-ed25519`, `cak-drama-review-codex-ed25519`. 서명 시 CLI 가 `gcloud secrets versions access latest --secret <이름> --project <id>`(또는 클라이언트 라이브러리)로 실행 시점에 조회해 메모리에서만 사용한다(`--sm-project` 인자, 기본값 환경 변수 `CAK_REVIEW_SM_PROJECT`, 미설정 시 `gen-lang-client-0881453127`).
- API 사용 설정·비밀 생성·IAM 부여는 클라우드 설정 변경이므로 **사용자가 실행하거나 명시 승인 후** 실행한다. 키 생성 스크립트는 개인 키를 디스크에 쓰지 않고 바로 `gcloud secrets versions add --data-file=-` 로 넣고 공개 키만 출력한다.
- 한계(명시): 두 에이전트가 같은 gcloud 계정으로 돌면 서로의 개인 키를 조회할 수 있다. 실질 분리는 에이전트별 서비스 계정을 두고 각 비밀에 `roles/secretmanager.secretAccessor` 를 해당 서비스 계정에만 부여할 때 생긴다. 그 전까지 서명은 '위조 시 흔적이 남는' 수준이다.
- 키 교체: 공개 키 파일에 keyId 를 두고 응답에 keyId 를 넣는다. 폐기된 keyId 서명은 거부.

**메일함 README 갱신** — 수신 대상은 세션이 아니라 역할(claude/codex). 리뷰 메일은 토큰 파일명·머리말 `token:` 을 포함. 세션 ID 는 참고 정보로만 적는다.

**테스트**: 토큰 1회용·만료, reviewer=author 거부, 지문 불일치(리뷰 후 대본 수정) 거부, 서명 위조·keyId 폐기 거부, 응답 reviewer 불일치 거부, inbox 가 응답된·만료된 토큰을 제외, 개인 키가 디스크에 쓰이지 않음(Secret Manager 조회는 주입 가능한 인터페이스로 테스트 대역 사용).

## 19. 회차 간 연결 (핵심 요구 — r6)

이 파이프라인의 목적은 **컷과 컷, 회차와 회차가 배경·문맥으로 이어지는 영상**이다. 2화 첫 컷은 1화 마지막 컷에서 시작한다. legacy 로 만든 1화도 '앞 회차'로 읽혀야 한다.

**단일 기준 `previousCutOf(ctx, index)`** (`core/continuation.ts`) — "이 컷 바로 앞 장면"을 구하는 곳은 여기 하나다.
- index > 0 → 같은 회차 앞 컷.
- index = 0 이고 `episode.continuesFromEpisode` 가 있으면 → 앞 회차의 지정 컷(`ctx.prev.episode` 에서 cutId).
- 그 외 → 없음.
- 이 함수를 쓰는 곳(모두 교체): continuity 관문(소품 상태 이어받기), shot 관문(소품 반입·continuesFromPrev 호환), keyframeDigest(propsIn), 대사 판정 문맥(previousCut·sceneSoFar), 시나리오 판정 상태(앞 회차 결말), 컷 판정의 join 질문, plan 의 startImage, `ds next` 의 useLastFrameOf.

**계약(append)**
- `DramaEpisode.continuesFromEpisode?: { no: number; cutId: string }` — 이 회차 첫 컷이 이어받는 앞 회차 컷.
- `DramaEpisode.startsFresh?: true` — 앞 회차와 이어지지 않는 회차(시간 점프 등)를 명시할 때만.
- `DramaStartImage` 에 `{ source: 'prev-episode-clip'; episodeNo: number; cutId: string }` 추가.

**검사(shot-v1)**
- no ≥ 2 인 회차는 `continuesFromEpisode` 또는 `startsFresh` 중 하나 필수(block).
- `continuesFromEpisode` 가 있는데 앞 회차 대본이 입력되지 않았거나(CLI `--prev-episode`) 지정 컷이 없으면 block.
- 앞 회차 마지막 컷과 첫 컷: 소품 상태 이어받기(continuity), 장소 일치, 출연진 호환을 기존 같은 회차 규칙과 똑같이 적용. 앞 컷이 legacy(구도 정보 없음)면 구도 비교는 review 로 내리고 키프레임 승인 때 사람이 확인.
- 첫 컷 `continuesFromPrev: true` 면 시작 이미지는 앞 회차 그 컷의 **승인된 실제 마지막 프레임**(`prev-episode-clip`), 아니면 자체 키프레임.

**문맥**
- 대사 판정의 previousCut 과 시나리오 판정 상태에 앞 회차 마지막 컷(행동·대사)을 넣는다 — 2화 첫 대사가 1화 결말에 반응하는지 판정된다.
- 교차 리뷰 요청 요약에 앞 회차 결말 컷을 포함한다.

**실행**
- `ds next --prev-clips <앞 회차 클립 폴더>`: 첫 컷이 `prev-episode-clip` 이면 그 파일이 있어야 열리고, `useLastFrameOf` 에 회차·컷·파일을 준다. 파일이 없으면 대기 사유를 낸다.
- 컷 판정 join 질문: 첫 컷은 앞 회차 마지막 장면과 이어지는지 묻는다.

**테스트**: 2화 첫 컷의 previousCutOf 가 1화 지정 컷, 1화 소품 상태 미반영 시 block, 앞 회차 대본 누락 시 block, no≥2 에 연결 선언 없음 block, startsFresh 면 통과, 대사 판정 문맥에 1화 마지막 대사 포함, plan startImage=prev-episode-clip, next 가 앞 회차 클립 없으면 대기, legacy 1화를 앞 회차로 읽음.

## 20. 재검토 보완 (r7 초안 — 요구 목록 대비)

출처: 독립 검토 에이전트(2026-10-08, HEAD dcddf97). Codex 재검토 결과를 합쳐 확정한다. 각 항목 뒤 괄호는 요구 id.

### 20.1 빠진 요구
1. **세계관 규칙 (A7)** — `DramaSeries.worldRules?: { id: string; ruleKo: string; ruleEn: string }[]`(append). 시나리오 JEV 에 규칙마다 "이 회차가 규칙을 어기는가" 질문 자동 생성(확정 fail = block). v1 영상 프롬프트에 `World rules:` 한 줄로 ruleEn 포함. 컷 판정에 규칙 질문 1개(`world-rules`, 근거 프레임 필수). 사태 0일: "좀비는 머리를 베야 죽고 몸통 타격으로 쓰러지지 않는다".
2. **목소리 일관성 (A8)** — `DramaCharacter.voice?: { description: string; audioRefAssetId?: string }`(append). 프롬프트에 화자별 목소리 묘사, `audioRefAssetId` 가 있으면 `audio_references` 로 넣는다 — `DramaClipMedia.role` 에 `'audio_references'` 추가(append; 기존 값 의미 불변). 효과는 TODO(D1, 파일럿에서 확인). 세션은 소리를 들을 수 없으므로 컷 판정에서 목소리는 판정하지 않고, **파일럿 2컷과 회차 미리보기의 사람 확인 항목**으로 명시한다(실행 상태에 확인 항목으로 기록).
3. **비어휘 발화·대사 순서 (B10)** — `DramaLineKind` 에 `'vocal'` 추가(append: 비명·신음 등). vocal 은 CER 대조에서 빼고 "발화가 있었는가"만 본다. 대사 대조에 (a) 줄 순서(줄별 최적 일치 위치가 증가), (b) 여분 발화(일치 구간 밖 전사 길이가 대본 대비 30% 초과 시 review) 추가. 혼합 줄("아악! 누나!")은 작성 지침에서 vocal 줄과 dialogue 줄로 나눈다.
4. **1080p 확정 (C2)** — 실행 상태 컷에 `final?: { jobId; fileSha256; at }`. `ds finalize-list` 가 승인된 초안 중 생성 후 7일 이내인 컷과 견적(get_cost 실측 필요 — 1080p 단가 미실측이면 null 로 표시하고 block)을 낸다. 확정 파일은 `record-final` 로 기록하고 대사 대조를 다시 통과해야 조립에 쓴다. 초안→확정 job 연결을 기록.
5. **재생성 상한 (C3)** — 컷 기록을 덮어쓰지 않고 `attempts[]`(jobId, sha, verdict, credits, at)를 쌓는다. `maxAttemptsPerCut`(기본 3, run-init 인자) 초과 시 `next` 는 재생성을 내놓지 않고 "사용자 승인 필요"로 대기. 실지출 합계를 run 에 기록.

### 20.2 부분 반영 보완
6. **소품 상태 전이 (A6, Codex 수정 반영)** — propState 는 '컷 종료 상태'이므로 값이 같아야 한다는 규칙은 틀리다. 컷 시작 상태 = 앞 장면(previousCutOf) 종료 상태로 보고, 이 컷에서 바뀌는 소품은 비트에 `changes?: Record<소품, 새 상태>` 로 선언한다. 시작 상태 + 선언된 변화 ≠ 종료 상태이면 v1 block. 컷 판정 background 질문에 시작·종료 상태를 함께 넣는다.
7. **생성물 수위 (B8)** — 컷 판정에 `safety` 항목(장르 safetyChecks 에서 질문 자동 생성: 피·상처 노출·노출·미성년 성적 암시 없음). 키프레임 시트 승인 때 같은 체크리스트를 사람에게 함께 보인다. v1 키프레임·영상 프롬프트에 장르 안전 문구(`no blood spray, no exposed wounds, no nudity`) 고정 포함.
8. **대사량 (B9, Codex 수정 반영)** — 단순 최소 줄 수는 두지 않는다. 시나리오 JEV 에 '장면마다 필요한 반응·정보가 대사로 충분히 전달되는가, 회차가 요약처럼 느껴지지 않는가' 질문 추가(의도적 무대사 컷은 비트에 명시하면 예외). 2화를 shot-v1 로 올릴 때 컷을 나눠 대사량 유지.
9. **연결 선언 강제 (A1)** — 같은 장소·전환 cut 인데 `continuesFromPrev` 가 없으면 review("이어지는 장면이면 continuesFromPrev, 아니면 transitionIn 또는 다른 구도"). 앞 회차 연결의 지정 컷이 앞 회차 마지막 컷이 아니면 review.
10. **plan 의 회차 연결 강제 (A2)** — `buildPlan` 이 `episodeLinkFindings` 를 block 으로 포함. `--prev-episode` 누락 시 plan 불가. v1 은 `--keyframes` 누락도 block(파일 sha 검사 생략 방지, E4).
11. **새 세션 이어받기 (E1)** — run 파일에 `mediaDir`, `approvals[]`(kind: scenario·cost·keyframes·pilot·preview·override, by, at, userQuote, recordedBy), `submitted?: { cutId; jobId; at }`, `attempts[]`, `spentCredits` 추가. 세션 시작 절차: review-inbox → run 파일 `ds status` 로 다음 행동 출력.
12. **편집 잠금 (E2)** — 회차 잠금을 run-init 이 아니라 기획 시작 시 `ds lock --episode --agent --session` 으로 만든다(사이드카 `<episode>.lock.json`). 대본을 쓰는 명령(judge-apply, approve-line, approve-keyframe, run-init)은 잠금 소유자만. 인계는 `ds handoff` 가 잠금도 넘긴다.
13. **사람 승인 증거 (B3)** — `--by user` 는 에이전트가 적을 수 있으므로, 승인 기록에 `userQuote`(사용자 발화 원문 한 줄)·`recordedBy`(에이전트·세션)를 필수로 남긴다. 위조를 막지는 못하지만 흔적을 남긴다(한계 명시).
14. **참조 영상 무음 (B11)** — `ds mute-ref --in --out` 이 `-an` 사본을 만들고 `hasAudio` 로 0개를 확인한 뒤에만 성공.
15. **자산 id 와 내용 지문** — 참조 자산 id(refAssetId·outfitRefAssetId·setup.refAssetId·voice.audioRefAssetId)는 `fingerprintOf` 에서 제외한다(등록만으로 JEV·교차 리뷰를 다시 돌리지 않게). 자산은 keyframeDigest 가 맡는다.

### 20.3 계획 코드 결함 보완
16. 테스트 헬퍼에서 픽스처 c4 를 8초로 올린다(6초에 12음절 → shot block). 픽스처 원본은 legacy 테스트용으로 유지.
17. legacy 앞 컷(setupId 없음) 허용을 Task 5(`chainsFromV1`)로 당겨 Task 6 테스트 순서 문제 해소.
18. **v1 조립**: `transcriptReadiness` 가 v1 회차에서는 실행 상태의 컷 판정(dialogue 항목 pass, 최종 파일이면 final 대조 pass)을 받아쓰기 기록으로 인정. 회차 미리보기 승인은 run `approvals[kind=preview]`.
19. **실행 상태 키**: `planFingerprint` 를 대본 지문이 아니라 plan 본문 해시(`planHash`)로. 해상도·초안 여부가 다르면 다른 run.
20. **제출 중 상태**: `ds submit --cut --job` 이 `submitted` 를 기록하고, `next` 는 submitted 컷을 다시 내놓지 않는다(중복 생성 방지).
21. **뒤 컷 무효화**: 컷을 재생성하면 그 컷 끝 프레임에서 시작한 뒤 컷들(startImage prev-clip 사슬)의 판정·승인을 무효로 표시.
22. keyframe-sheet 는 대본 컷 순서로 정렬하고 컷 id·첫 대사 라벨을 그린다(`--font`).
23. `join-check` 는 `previousCutOf` + 정책별 연결 규칙(v1 `chainsFromV1`, 회차 간 포함)을 쓴다.
24. **생성 화면비 고정**: 생성은 항상 16:9(`DramaPlan.aspectRatio` 기록), 쇼츠는 조립에서 blur-fill. 9:16 생성은 shot-v1 에서 block(롱폼 전환 재생성 방지). 키프레임 승인 때 PNG 실제 비율 검사.
25. 소소: plan.ts `DramaStartImage` import, 계약 `startImage?: … | undefined`, `run-init`·`next` 가 실패한 plan(`ok:false`) 거부, `keyframeDigest` 의 컷 위치 -1 방지(id 로 찾기).
26. `ds last-frame --clip --out` 명령(실제 마지막 디코딩 프레임) — 세션이 직접 ffmpeg seek 하지 않게.
27. 계획 Task 13 Step 4 의 임시 폴더를 iCloud `claude 작업/tmp/<날짜-작업>/` 로(전역 규칙 E3).

### 20.4 테스트 보강
- 키프레임 장면 변경 테스트는 같은 ctx 의 컷으로(위치 -1 오검증 제거).
- legacy 출력 회귀는 픽스처 전 컷 프롬프트 스냅샷 + 실데이터 1화·2화 validate/plan 결과 비교 테스트(파일 존재 시).
- plan `prev-episode-clip`, 판정·승인·교차 리뷰 CLI, `plan --keyframes` 경로, 블로킹이 바뀐 continuesFromPrev block 테스트를 코드로.

## 21. Codex 재검토 반영 (r7 — F01~F15)

Codex 판정: changes(✅2·부분26·❌3/31). 방향은 동의, 아래 보완 전 구현 완료 판정 불가.

1. **지문 3종 분리 (F01·F02)** — (a) 내용 지문 `fingerprintOf`(승인 증거·자산 id 제외), (b) **검토 문맥 지문** `reviewContextDigest` = 현재 회차 + `previousCutOf` 로 닿는 앞 회차 컷들 + 장르 팩 버전 — scenario·shot·continuity·cross-review·대사 판정 기록은 이것에 묶는다(앞 회차를 고치면 2화 기록 무효), (c) **실행 지문** `executionPlanDigest` = 모델·해상도·화면비·프롬프트·참조 자산·키프레임 자산·선행 출력 sha — run 파일의 키. `lineHash` 에 앞 장면 요약·같은 컷 앞 대사·화자 프로필 해시를 포함해 문맥만 바뀌어도 대사 재판정.
2. **판정 요청 결합 (F03·F04)** — verdict 요청에 requestId, 실행 지문, 내용 지문, jobId, 클립·키프레임·앞 컷 마지막 프레임 sha 를 넣는다. `verdict-apply` 는 요청 파일을 믿지 않고 질문 목록을 다시 계산해 일치를 확인. 근거 프레임은 **그 질문의 frameIds 부분집합**이어야 한다. 시트에 승인 키프레임, 인물 얼굴·의상 참조, 앞 컷 마지막 프레임을 반드시 포함(manifest). 표본으로 확정할 수 없으면 응답에 `unknown` 을 허용하고 unknown 은 pass 가 아니다(확대 표본 또는 사람).
3. **키프레임 파일 필수 (F05)** — 파일을 확인할 수 없으면 성공으로 치지 않는다(block). 원격 자산 id 와 로컬 sha 둘 다 기록.
4. **작성자 검증 (F06)** — shot-v1 은 `authoredBy` 필수(block). review-request 의 author 는 회차 authoredBy 와 같아야 하고, apply 도 현재 회차 authoredBy 와 대조. 서명은 '키 보유 증거'일 뿐 같은 gcloud 자격에서는 독립성을 증명하지 않는다고 문서에 명시.
5. **원자적 쓰기·동시성 (F07)** — 모든 상태 파일은 고유 임시 파일 → rename, 쓰기 잠금(lock 파일 + revision CAS). 토큰 소비는 `used/<token>` create-exclusive 파일로 1회만, 리뷰 응답도 create-exclusive(같은 응답 재전송은 멱등, 다른 응답은 충돌 보고). inbox 는 서명 검증된 응답만 처리된 것으로 본다. 같은 역할의 두 세션도 잠금으로 막는다(owner = agent + session).
6. **조립 출시 관문 (F08)** — assemble 은 선택 컷·콜드 오픈·trim 원본의 실제 파일 sha 가 run 의 released(판정 pass 또는 예외 승인, 확정본이면 final 대조 pass)와 같아야 한다. 받아쓰기 보고서에도 클립 sha 를 넣는다. v1 은 transcript 보고서만으로 조립하지 못한다. 편집본 최종 검수(자막·콜드 오픈·trim 보존) 승인 기록.
7. **회차 연결 검증 강화 (F09)** — 같은 seriesId, 앞 회차 no = 현재 no − 1(아니면 사유와 사람 승인), 지정 컷은 앞 회차 마지막 컷(아니면 review), startsFresh 와 continuesFromEpisode 동시 선언 block. `--prev-clips` 는 앞 회차 run 의 released sha 와 일치하는 파일만 인정, 재생성 경로에서도 검사.
8. **previousCutOf 사용처 완결 (F10)** — referenceMap(앞 회차 첫 컷 참조·키프레임), join-check CLI, judgeState(앞 결말 대사 포함), 리뷰 요약까지. 구현 후 `ctx.episode.cuts[i - 1]` 직접 접근이 남지 않았는지 검색으로 확인하는 테스트.
9. **비트별 시간 예산 (F11)** — 각 비트 구간에서 (그 비트 대사 발화 + 행동 여유) ≤ 구간 길이. 영문·숫자·vocal 발화는 음절 0 으로 치지 않는 추정 규칙.
10. **블로킹 범위 (F12)** — 출연진 1명이어도 blocking 필수(v1). chainsFromV1 도 블로킹 호환(같은 인물 집합·좌우, 이동은 blockingChange)을 같은 공통 함수로 검사.
11. **리뷰 전달·실패 기록 (F13)** — review-respond 는 서명 응답 사본을 요청자 메일함에 원자 전달. 요청 메일에 토큰·요청 파일·series/episode 경로·지문·응답 명령 전체를 적는다. apply 실패도 `cross-review` 실패 보고서로 남긴다.
12. **비용 원장 (F14, C1)** — run 에 승인 기록(승인 id·범위·옵션·한도), 제출 예약액, 실지출(get_cost·잔액 차이)을 둔다. '0크레딧'은 생성 크레딧만 뜻하며 whisper·JEV·세션 판정·GCP 조회 비용과 구분해 표기.
13. **legacy 검증 강화 (F15, E5)** — 실제 1화 대본·관문 고정 사본으로 validate·plan 결과 고정 테스트, 명령 exit code 보존(파이프로 가리지 않음), 짧은 재조립 시험.
14. **장르 약속 미확정 (Codex B7)** — 필수 약속(훅·사이다·장르 고유) 질문이 미확정이면 plan 필수 관문에서 block 또는 기록된 사람 예외. 현재 review→ok 경로를 막는다.
15. **수위 기준 정합 (Codex B8)** — WRITING-GUIDE 의 '부상 전면 금지' 문구와 장르 팩의 15세 허용(물린 자국 무혈, 컷어웨이 처치)을 맞춘다.
16. **저장 경로 (E3)** — 에이전트별 임시 루트(Claude: iCloud `claude 작업/`, Codex: 사용자 전역 규칙의 `gpt 작업/`)를 설정값으로. 미디어·승인·판정 manifest 로 새 세션이 자산 위치를 복구.
17. **D3·D4 범위** — 업로드는 이번 범위 밖, 업로드 인계 manifest(제목·설명·AI 표시 플래그)만 산출. 배경음악 후반 믹스는 기존 ai-music 원자로 인계 계약만 정의.
