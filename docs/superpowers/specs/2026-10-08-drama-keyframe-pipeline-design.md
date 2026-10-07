# drama-series 키프레임 우선 파이프라인 — 설계

- 날짜: 2026-10-08
- 상태: 설계 승인 대기(사용자 2026-10-08 방향 승인: "응 그렇게 진행해")
- 대상: `packages/drama-series`, `packages/contracts`(append-only), `.claude/skills/drama-series`
- 선행 설계: `2026-10-06-drama-series-design.md`

## 1. 왜 바꾸나 (2화 「문밖」 생성에서 실측한 문제)

| # | 증상 | 원인 |
|---|---|---|
| 1 | 컷마다 쪽문 주변 배경이 바뀜(큰 회색 문 → 시계·빨간 패널 → 창문 벽) | 장소 참조 그림은 넓은 통로뿐. 쪽문·잠금쇠·방화문은 **글로만** 지시 → 매번 새로 지어냄 |
| 2 | 앞 컷 마지막 프레임으로 이어도 배경이 재창작됨(연결 SSIM 0.92인데 배경 불일치) | start_image 는 첫 프레임만 고정. 카메라가 물러나는 순간 모델이 세트를 다시 만든다 |
| 3 | 팔 꺾기 행동 누락, 박반장 위치 이상 | 17초 컷에 인물 4·대사 5·행동 4. 요구가 많으면 일부만 반영된다 |
| 4 | 동작 참조 영상의 음성("누리!")까지 따라 함 | video_references 에 소리가 있는 클립을 그대로 넣음 |
| 5 | 일부 프레임에서 의상(조끼) 누락 | 얼굴·의상을 한 장 참조로만 지정 |

참고 자료 조사(사용자 제공 영상 5편 + Higgsfield 공식 Seedance 2.5 프롬프트 가이드 등 6건, 2026-10-08)의 공통 공정은 **"이미지로 장면을 먼저 확정하고 영상은 마지막"** 이다. 이 설계는 그 공정을 결정적 관문과 프롬프트 자동 조립으로 박아, 컷별 시행착오(=크레딧 소모) 없이 첫 생성에서 맞추는 것이 목표다.

## 2. 목표 / 비목표

**목표**
- 생성 전(0크레딧) 결정적 관문이 문제 1·3을 대본 단계에서 차단한다.
- 컷마다 시작 키프레임 이미지(장당 약 0.25크레딧)를 사람이 승인한 뒤에만 영상 명세를 만든다.
- 프롬프트는 사람이 손으로 쓰지 않고, 구조화된 필드(구도·블로킹·비트·대사)에서 자동 조립한다.
- 생성 직후 자동 점검(0크레딧)이 어긋난 컷 위에 다음 컷을 쌓지 못하게 멈춘다.

**비목표**
- 코드가 힉스필드 MCP 를 직접 호출하지 않는다(MCP 는 세션에서만 호출 — 기존과 동일).
- 업스케일 단가·참조 강도 조절은 다루지 않는다(미확인, TODO(D1)).
- 판정 기준(JEV 장르 관문)을 낮추지 않는다.

## 3. 계약 변경 (`packages/contracts/src/drama.ts`, append-only)

```ts
/** (2026-10-08) 장소 안의 고정 구도. 구도마다 배경 그림 1장 — 그림에 실제로 보이는 소품만 지문에 쓸 수 있다 */
export interface DramaSetup {
  id: string;                 // 예: 'side-door'
  name: string;               // 예: '쪽문 정면'
  /** 카메라 구도 문구(영어). 예: 'static eye-level medium-wide shot facing the side door' */
  cameraEn: string;
  refAssetId?: string | undefined;
  /** 이 배경 그림에 실제로 보이는 소품(장소 props 의 부분집합) */
  visibleProps: string[];
}
// DramaLocation 에 추가
setups?: DramaSetup[] | undefined;

export type DramaScreenSide = 'left' | 'center' | 'right';
export interface DramaBlocking { characterId: string; side: DramaScreenSide; depth?: 'front' | 'mid' | 'back' | undefined }
export type DramaCameraMove = 'static' | 'push-in' | 'pull-out' | 'pan' | 'follow';

/** 사람이 승인한 컷 시작 키프레임. fingerprint 는 승인 당시 컷의 시각 필드 해시 */
export interface DramaKeyframe { assetId: string; approvedBy: string; at: string; fingerprint: string }

// DramaCut 에 추가
setupId?: string | undefined;
blocking?: DramaBlocking[] | undefined;
cameraMove?: DramaCameraMove | undefined;   // 생략 = 'static'
/** 시간 순 행동(영어) 1~2개. 있으면 visualEn 대신 시간 구간 프롬프트로 조립 */
beatsEn?: string[] | undefined;
keyframe?: DramaKeyframe | undefined;

// DramaCharacterLook 에 추가
/** 의상 전신 참조(얼굴 참조와 분리). 있으면 얼굴 다음 순서로 넣는다 */
outfitRefAssetId?: string | undefined;

// DramaClipSpec 에 추가
/** 시작 키프레임 자산 id. 이어지는 컷(startFromCut)이면 구도 참조로만 쓴다 */
keyframeAssetId?: string;
```

기존 대본(1화, 2화 c1~c2)은 새 필드가 없어도 그대로 유효하다. 새 관문은 새 필드가 **없을 때 review(경고)**, 있는데 규칙을 어기면 block 으로 동작해 옛 회차를 깨지 않는다. 단, `--strict-shots` (새 회차 기본)에서는 누락도 block.

## 4. 결정적 관문 `shot` (validate 에 추가, 0크레딧)

| 규칙 | block | review |
|---|---|---|
| 컷 길이 | > 12초 | > 10초 |
| 대사 줄 수(dialogue) | > 3 | > 2 (기존 dialogue-lint 와 중복 메시지 없이 이 관문으로 이관) |
| 화면 속 인물(cast) | > 3 | — |
| 비트(beatsEn) | > 2 | 없음(strict 에선 block) |
| 카메라 이동 | — (필드가 하나라 구조상 1개) | — |
| 구도 | 장소에 setups 가 있는데 setupId 없음 / 없는 setupId | — |
| **보이지 않는 소품** | 컷 action·beatsEn 에 등장한 장소 소품이 구도 `visibleProps`(구도 없으면 장소 `props`)에 없음 | — |
| 블로킹 | cast ≥ 2 인데 blocking 없음(strict), blocking 의 인물이 cast 에 없음, 같은 인물 중복 | cast ≥ 2 인데 blocking 없음(비strict) |
| 좌우 일관성(180도 규칙) | 같은 구도의 연속 컷에서 같은 두 인물의 좌우가 뒤바뀜(transitionIn 없이) | — |

소품 등장 판정: 장소 `props` 의 한국어 소품명이 action 문자열에, 또는 소품의 영어 별칭(`setup` 그림 생성 시 함께 기록하는 `visibleProps` 와 같은 이름)이 beatsEn 에 포함되는지 문자열 일치로 본다. 오탐보다 누락이 비싸므로 단순 포함 검사로 시작한다.

## 5. 키프레임 단계 (새 사람 게이트)

1. `ds keyframe-build --series --episode --out <dir>/keyframes/requests.json`
   - 컷마다 이미지 요청 1건: 모델 `gpt_image_2_5`, 16:9. medias = 구도 배경 그림 → 인물 얼굴 → 의상 순.
   - 프롬프트 = 구도 cameraEn + 블로킹(좌·중·우, 앞·뒤) + **첫 비트의 시작 상태** + 의상 고정 문구 + "Same set as the reference, do not add or remove set pieces" + 스타일.
   - 이어지는 컷도 키프레임을 만든다(구도·블로킹 확인용).
2. 세션이 `generate_image_batch` 로 생성 → 내려받아 `<media>/keyframes/<cut>.png`.
3. `ds keyframe-sheet --episode --images <dir> --out sheet.jpg` — 회차 전 컷을 한 장(컷 id·대사 첫 줄 라벨)으로 모아 사람에게 보여 준다.
4. 사람이 승인한 컷만 `ds approve-keyframe --episode --cut --asset <job_id> --by user` → `cut.keyframe` 기록(컷 시각 필드 fingerprint 포함).
5. `plan` 의 필수 관문에 `keyframes` 추가: 모든 컷에 keyframe 이 있고 fingerprint 가 현재 컷과 같아야 한다(장면을 고치면 키프레임 재승인).

## 6. 프롬프트 자동 조립 (`toSeedanceClip` 개편)

medias 순서: [start_image: 키프레임 — 이어지지 않는 컷] → 인물 얼굴 → 의상 → 구도 배경 그림 → [이어지는 컷: 키프레임을 image_references 로 추가]. 이어지는 컷의 start_image(앞 컷 마지막 프레임)는 생성 시점에 세션이 넣는다(기존과 동일).

프롬프트 순서(필수 조건을 앞에, 공식 가이드 권장):
1. **참조 역할**: `@Image1 = face of X. @Image2 = outfit of X (keep every garment in every frame). @Image5 = the set and camera framing — keep it identical.`
2. **연속성**: 시작 프레임이 있으면 `Start exactly from the start image; background, lighting and wardrobe stay identical to it for the whole shot.`
3. **카메라**: cameraEn + 이동(static → `Locked-off camera, no camera movement, no cut.`)
4. **블로킹**: `X stays screen-left, Y screen-right for the whole shot.`
5. **비트**(beatsEn 있을 때): 길이를 비트 수로 균등 분할 — `0–5s: … 5–10s: …`. 없으면 기존 visualEn.
6. **대사**: `Exactly N spoken lines, nothing else is said:` + 줄마다 화자·대사(비트 구간 안에 배치).
7. **소리**: sfx + 항상 `No background music.`
8. 구도 배경 문구(장소 anchorText 대신 구도가 있으면 cameraEn+visibleProps 요약) + 스타일.

## 7. 생성 직후 자동 점검 `frame-check` (0크레딧)

- `ds frame-check --clip <mp4> --keyframe <png> [--min <ssim>]` — 클립의 0·50·100% 프레임과 키프레임의 SSIM(640×360 회색조).
- 결과는 기존 `join-check` 와 함께 보고. **기준값은 추측하지 않는다**: 이번 2화 클립(3컷=배경 유지, 폐기한 4컷=배경 붕괴)과 다음 파일럿으로 보정하기 전까지는 review(경고)만 낸다. 보정 근거는 `core/join.ts` 의 상수 주석에 실측값으로 남긴다.
- 스킬 절차: 점검이 경고를 내면 다음 이어지는 컷을 생성하지 않고 사람에게 보인다.

## 8. 스킬·지침 갱신

- `.claude/skills/drama-series/SKILL.md`: 2(기획) → **2.5 키프레임(사람 승인 1.5)** → 5(계획) → 6(생성: **파일럿 2컷** 먼저, frame-check 후 나머지) 순서로 개정.
- 동작 참조 영상은 `ffmpeg -an` 으로 소리를 지운 파일만 업로드한다(음성 누출 대응 — 커뮤니티 근거, 미실측이라 효과는 다음 생성에서 확인).
- `WRITING-GUIDE.md`: 컷 1개 = 행동 1~2개·대사 2줄 이하·5~10초, 블로킹·구도 지정법, 그림에 없는 세트 요소 금지.

## 9. 테스트 (TDD)

- `shot` 관문: 규칙별 block/review 경계(10/12초, 2/3줄, 3/4명, 비트 2/3개), 보이지 않는 소품, 블로킹 누락·중복·좌우 반전, 비strict 하위호환(1화 대본 그대로 통과).
- 키프레임: approve 기록, 장면 수정 후 fingerprint 불일치 → plan block.
- 프롬프트 조립: medias 순서·@Image 번호, 비트 시간 분할, "Exactly N spoken lines", No background music, 이어지는 컷의 키프레임 배치.
- keyframe-build: 요청 medias·프롬프트 구성.
- frame-check: smptebars vs 노이즈로 판별력 확인(기존 join 테스트 방식).
- 회귀: 기존 89개 테스트 + tsc.

## 10. 2화 적용 순서와 비용

1. 구도 배경: `aisle/side-door`(1차 3컷 첫 장면 기반, 잠금쇠·방화문·소화함을 그림에 포함), `aisle/wide`(기존), `yard/door`(기존 하역장 그림) — 약 0.5크레딧.
2. 2화 4~7컷을 규칙에 맞게 6컷 안팎으로 재구성 → validate·JEV(시나리오·소품·대사) 재판정.
3. 키프레임 6~8장(약 2~4크레딧) → 시트로 사용자 승인.
4. 파일럿 2컷 → frame-check·사람 확인 → 나머지 일괄 생성. 영상 약 180크레딧.
5. 이미 만든 3컷(배경 유지)·8컷은 재사용, 폐기한 4컷 영상은 쓰지 않는다.

## 11. 미확인 (TODO(D1))

- start_image + end_image + image_references 동시 사용: `get_cost` 견적은 통과(2026-10-08, 8초 24크레딧) — 실제 생성 허용 여부는 파일럿에서 확인.
- Seedance 2.5 의 참조 이미지 최대 개수와 참조 강도 조절 가능 여부: 미확인.
- 무음 참조 영상으로 음성 누출이 사라지는지: 미실측.
- `@ImageN` 번호가 start_image 를 세는지: 지금까지 start_image 를 맨 앞에 넣고도 인물 번호가 맞게 동작한 생성 사례가 있으나 공식 문서 미확인 — 파일럿에서 확인.
