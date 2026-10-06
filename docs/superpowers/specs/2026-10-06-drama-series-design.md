# 드라마 시리즈 생성 파이프라인 설계 (`@cak/drama-series`, 원자 #15)

- 작성: 2026-10-06 · 브랜치 `feat/drama-series` (origin/main `7e9d866` 기준)
- 상태: **설계 초안 — 사용자 검토 대기.** 승인 전에는 구현하지 않는다.
- 출발점: `docs/videos/20261006-minidrama-pilot/`의 시험 제작(1·2컷 생성, JEV 대사·시나리오 판정 3회)에서 검증한 절차를 코드와 스킬로 옮긴다.

## 1. 요구사항 (사용자 원문)

| ID | 원문 | 설계 반영 |
|---|---|---|
| R-1 | "https://youtu.be/TnIIDaH_q7Q 가 진행한 방법으로 미니시리즈 드라마를 생성하고 싶어" | 한 줄 소재 → 시리즈 설정 → 컷 분할 대본 → 참조 이미지 → Seedance 2.5 → 조립 (§3) |
| R-2 | "영상생성전에 어감이 이상하거나 대사가 문맥에 맞지않는것들을 최대한 필터링해야해, jev를 사용하면 좀 나아지지 않을까?" | 대사 관문: 발음 규칙 검사 + JEV 판정 + 생성 후 받아쓰기 대조 (§6) |
| R-3 | "재작업 방지를 위해서 jev를 통해 검증된 대사가 사용되게 해주고, 시나리오 자체가 조회수를 높일만한 내용인지에 대한 컨펌도 필요" | 검증되지 않은 대사는 생성 명세에 들어가지 못한다. 시나리오 구조 관문 + 사람 승인 (§6, §8) |
| R-4 | "배경및 장소가 컷에서 변경이 없었으면 계속 유지되어야 한다" / "물류센터에 메트가 존재해?" | 장소 연속성·소품 개연성 관문 (§6) |
| R-5 | "대본 작성 지침을 skill등으로 정리" | `.claude/skills/drama-series` + 작성 지침 문서 (§8) |
| R-6 | "파이프라인은 어떤 소재든지 범용적이여야 하고 확장성을 고려" | 장르 팩(데이터)·관문 등록부·어댑터 교체 구조 (§4, §5, §7) |
| R-7 | "shopShorts 프로젝트에 하나의 기능(드라마생성)을 추가" / "codex '영상제작실-편집-개선'에서 수정중이라 협업" | 2단계 Studio 연동, Codex 작업 머지 후 착수 (§9) |
| R-8 | "아포칼립스인데 먼치킨" + 회귀자 선택 | 첫 장르 팩 `regression-apocalypse` (§5) |
| R-9 | "영상 저장위치를 /Users/admin/Downloads/vedio/drama 하위에 생성" | 산출물 루트 기본값 (§10) |

## 2. 범위

- **1단계(이번 구현):** 원자 `packages/drama-series` + 계약 추가 + 장르 팩 2개 + 스킬. 회귀물 60초 시험분 생성을 수용 시험으로 삼는다.
- **2단계(별도 승인):** Shopshorts Studio의 `workflow: 'drama-series-v1'`. Codex 작업 머지 후 착수한다.
- **비범위:** YouTube 업로드(기존 `youtube-upload` 원자 사용), 실제 결제, 운영 배포, 원자 안의 외부 API 직접 호출.

## 3. 전체 흐름

```
로그라인 + 장르 팩
  → ① 시리즈 설정(bible) ──────── 시나리오 관문(JEV) → [사람 승인 1: 기획]
  → ② 회차 대본(episode: 장소·컷·대사)
       ├ 구조·길이 검사(결정적)
       ├ 장소 연속성·소품 개연성(결정적 + JEV)
       └ 대사 관문(발음 규칙 + JEV)  → 미통과 대사는 수정 또는 [사람 승인]
  → ③ 참조 이미지 명세 → (스킬이 생성) → 등록
  → ④ 생성 명세(plan) + 견적        → [사람 승인 2: 비용]
  → ⑤ (스킬이 생성: 대표 클립 1개 먼저 → 나머지)
  → ⑥ 클립 검증: 받아쓰기 대조, 길이·오디오
  → ⑦ 조립: 연결·음량·자막·AI 표기·전환 효과 → [사람 검수]
```

원자는 ①~④·⑥·⑦의 **판단 없는 검사와 파일 생성**만 맡는다. 힉스필드 생성, JEV 호출, 이미지 생성은 실행자(스킬 또는 Shopshorts 작업기)가 하고, 결과 파일을 원자에 다시 넣는다.

## 4. 원자 구조

```
packages/drama-series/
  genres/                     장르 팩(JSON). 코드 수정 없이 추가
  src/core/                   순수 함수: 스키마·관문·명세·견적
    model.ts                  zod 스키마(계약 타입과 일치 검증)
    gates/registry.ts         관문 등록부
    gates/*.ts                관문 하나당 파일 하나
    plan.ts                   생성 명세 조립
    estimate.ts               견적(단가표 + 미실측 null)
    assemble-args.ts          ffmpeg 인자 생성(순수)
  src/adapters/
    judge/jev.ts              TypeSafe systemone 요청 생성 / 응답 해석
    video/seedance-2-5.ts     Seedance 2.5 생성 명세 형식
    transcribe/whisper.ts     whisper CLI 실행·결과 해석
    ffmpeg.ts                 조립 실행
  src/cli/index.ts            JSON in/out CLI
  test/                       vitest (유료 호출 0)
```

- 원자는 `@cak/contracts`만 의존한다. 다른 원자를 import하지 않는다.
- 같은 판단을 앱에서 다시 구현하지 않는다. 앱과 스킬은 CLI를 호출한다.

## 5. 도메인 모델과 장르 팩

### 계약 (`packages/contracts/src/drama-series.ts`, 추가 전용)

- `DramaSeries`: `id, title, logline, genreId, characters[], locations[], episodes[]{no,title,summary}, safety{nonGraphic:true}`
- `DramaCharacter`: `id, name, profile, speech{default, toSuperior?, toSubordinate?}, looks[]{id, description, refAssetId?}`. 같은 인물의 다른 모습(예: 회귀 전·후)은 `looks`로 구분한다.
- `DramaLocation`: `id, name, anchorText(장소 고정 문구), props[](이 장소에 실제로 있는 소품), refAssetId?`
- `DramaEpisode`: `seriesId, no, cuts[]`
- `DramaCut`: `id, locationId, durationSec, characters[]{id, lookId}, action, camera, sfx?, caption?, propsChanged[]?, lines[], transition?(편집 전환: flash·cut 등)`
- `DramaLine`: `speaker, text, kind: 'dialogue'|'monologue', verification{status:'unverified'|'verified'|'human-approved'|'rejected', judgeRef?, approvedBy?, at?}`
- `DramaGateReport`: `gate, stage, ok, findings[]{severity:'block'|'review'|'info', cutId?, lineIndex?, message, evidence?}`
- `DramaClipSpec`: `cutId, backend, params(모델·해상도·길이·medias 순서), prompt, estCredits|null`
- `GenrePack`(원자 내부 데이터, 계약 아님)

### 장르 팩 (`genres/<id>.json`)

```jsonc
{
  "id": "regression-apocalypse",
  "name": "회귀자 먼치킨 아포칼립스",
  "promise": "미래를 아는 압도적 주인공이 모두가 무너질 때 정답을 실행한다",
  "hookRules": ["첫 10초 안에 주인공의 비정상적 우위나 회귀 사실을 보여준다"],
  "scenarioChecks": { "hook": { "task": "…", "pass": "…", "fail": "…" } },
  "dialogueStyle": ["독백은 짧게, 미래 지식을 드러내되 설명하지 않는다"],
  "actionRules": ["한 번에 1~2명, 한 동작으로 끝낸다", "유혈·절단 묘사 금지"],
  "structure": { "pilotCuts": 7, "episodeMinutes": [3, 8] }
}
```

- 1단계 팩 2개: `regression-apocalypse`(R-8), `hidden-master-revenge`(지금까지의 「야간 상하차」. 회귀 테스트용 고정 자료).
- 시나리오 판정 질문은 팩에서 온다. 장르마다 문구만 바꾸면 같은 관문 코드를 쓴다.

## 6. 관문 (등록부, 단계별)

관문 인터페이스: `{ id, stage: 'bible'|'episode'|'plan'|'clip', kind: 'deterministic'|'judge', run(input) → DramaGateReport }`. 판정형 관문은 **두 단계**로 나뉜다. `build`가 판정 요청을 만들고, `apply`가 응답을 받아 보고서를 만든다.

| 관문 | 단계 | 종류 | 막는 것 | 근거 |
|---|---|---|---|---|
| `schema` | 전체 | 결정적 | 필수 필드 누락, 존재하지 않는 인물·장소 참조 | — |
| `scenario` | bible/episode | judge | 장르 팩 기준(훅·갈등·사이다·다음 화 장치·장르 약속) 미달 | 시험분: 약한 대조 시나리오 5/5 확정 실패, 실제 5/5 확정 통과 |
| `dialogue-lint` | episode | 결정적 | 같은 음절 반복(수수료·똑똑히), 컷 길이 대비 과다 음절, 장르 팩 금칙어 | "수수료→수술이" 실제 오발음 |
| `dialogue-judge` | episode | judge | 문맥·말투·자연스러움 중 확정 fail | 시험분: 문맥 이탈·번역투 대조군 확정 fail |
| `continuity` | episode | 결정적 | 같은 장소 연속 컷의 참조·고정 문구 불일치, 한 컷 두 장소, 앞 컷 소품 변화 미반영 | R-4 |
| `prop-plausibility` | episode | judge | 그 장소에 없을 소품(예: 물류센터 매트) | R-4 |
| `verified-lines` | plan | 결정적 | `verified`·`human-approved`가 아닌 대사가 있으면 생성 명세 발급 거부 | R-3 |
| `budget` | plan | 결정적 | 견적 합계가 승인 상한 초과, 미실측 단가(null) | 프로젝트 규칙: 지어내지 않음 |
| `transcript` | clip | 결정적 | whisper 전사와 대본 대사 불일치(정규화 후 문자 오류율 기준) | 시험분 2컷 |

판정 규칙(기본값, 설정 가능): JEV `confidence ≥ 0.85` 그리고 선택 확률 `≥ 0.90`이면 확정. 확정 fail은 `block`, 미확정은 `review`. 대사는 세 항목 모두 확정 pass이고 발음 검사가 깨끗해야 `verified`가 된다. 아니면 후보를 바꿔 재판정하고(기본 최대 2회), 그래도 안 되면 사람 승인(`human-approved`, 승인자·시각 기록)만 남는다. **실패를 조용히 통과로 바꾸지 않는다.**

## 7. 어댑터

- **판정기 `judge`**: 인터페이스 `buildRequest(questions) → body`, `parseResponse(raw) → Verdict[]`. 1단계 구현은 JEV(`jev-1.13.0`, TypeSafe systemone 형식). 원자는 네트워크를 쓰지 않는다. 전송은 실행자가 기존 승인 경로(임시 키 1회·$0.01 상한·즉시 회수)로 한다. 정답 라벨이 요청에 섞이면 거부한다(label leak 방지).
- **영상 백엔드 `video`**: `toClipSpec(cut, assets) → DramaClipSpec`. 1단계 구현은 Seedance 2.5(`omni_reference`, 480p `draft` 기본). `@ImageN`은 **그 요청의 medias 순서**로 매긴다(시험분에서 확인). 공식 문서에 없는 가정이므로 README에 미확인으로 남긴다. 다른 모델은 같은 인터페이스로 추가한다.
- **받아쓰기 `transcribe`**: whisper CLI(로컬, 무료).
- **조립 `ffmpeg`**: 연결, 음량 -14 LUFS, 자막 번인(하단·외곽선), 첫 2초 AI 표기, 편집 전환(섬광·암전)을 처리한다. 회귀 전환처럼 편집이 더 확실한 효과는 생성하지 않고 여기서 만든다.

## 8. 스킬과 대본 작성 지침

- `.claude/skills/drama-series/SKILL.md`: 실행 순서와 사람 승인 단계. "드라마 만들어줘", "미니시리즈 생성" 요청 시 사용.
- `.claude/skills/drama-series/WRITING-GUIDE.md`: 시험분에서 얻은 규칙을 정리한다.
  - 회차마다 동기 → 행동 → 결과. 액션이 해결책을 대신하지 않는다.
  - 대사: 짧고 흔한 단어. 반복 음절과 낯선 한자어를 피한다. 컷당 0~2줄, 10초당 최대 약 22음절. 인물별 상대에 따른 말투(반말·존댓말)를 설정에 명시한다.
  - 장소: 그 장소에 실제로 있는 소품만. 같은 장소는 같은 참조·고정 문구. 소품 상태를 이어 간다. 한 클립에는 장소 하나만.
  - 액션: 한 번에 1~2명, 짧은 한 동작, 비유혈. 넘어지는 동작은 장소에 있는 물체로 받는다.
  - 생성: 대표 클립 1개 먼저 → 확인 → 나머지. 편집으로 되는 효과는 생성하지 않는다.
  - 표현·법: 원작 설정 복제 금지(금지선 #1), 가상 인물·기업, 비속어 대신 등급 안전 표현, AI 생성 표기.
- 사람 승인 1(기획)과 2(비용)는 생략할 수 없다. 이미 받은 승인 범위 안에서는 다시 묻지 않는다.

## 9. Shopshorts 연동 (2단계, Codex 협업)

- 붙는 위치(origin/main 기준 조사):
  - `apps/shopshorts/lib/explainer-production.js` 패턴을 따라 `lib/drama-production.js`(`DRAMA_WORKFLOW = 'drama-series-v1'`)를 추가한다.
  - `lib/studio.js` `validateBrief`·`productionOptions`에 드라마 흐름 옵션을 추가한다. 카테고리 `막장드라마`는 장르 팩 선택으로 일반화를 검토한다.
  - `studio-runner.mjs` `executeStudioTask` 분기와 `capabilities()`에 드라마 흐름을 추가한다. 원자 CLI 호출은 기존 `command()`/`cli()`를 쓴다.
  - Studio의 기존 승인 플래그를 매핑한다. `approved` = 사람 승인 1·2, `reviewed` = 검수.
- **협업 규칙:** Codex 세션 "영상제작실-편집-개선"이 Shopshorts를 수정 중이다. 1단계는 `apps/shopshorts`를 수정하지 않는다. 2단계는 그 작업이 머지된 main 위에서 시작한다. 시작 전에 위 파일들의 최신 상태와 Codex 변경 범위를 대조하고, 겹치면 사용자에게 순서를 확인한다. 분기를 등록부로 바꾸는 리팩터링은 이번 범위에 넣지 않는다(Codex 작업과 충돌 위험).

## 10. 산출물 위치

- 대본·관문 기록(작음, 커밋): `docs/videos/<YYYYMMDD-작업명>/`
- 영상·이미지(큼, 커밋 안 함): 기본 `/Users/admin/Downloads/vedio/drama/<YYYYMMDD-작업명>/{refs,clips,out}`. CLI `--media-root`로 바꿀 수 있다.

## 11. 테스트

- vitest로 관문마다 통과·차단 사례를 둔다. 고정 자료는 시험분 실제 응답이다: `jev/r1`, `jev/r2` 응답, 2컷 whisper 전사, 매트 장면 대조군.
- 어댑터: JEV 요청 형식(라벨 유출 거부 포함), 응답 해석(확률 합·선택 일치 검증), Seedance 명세(medias 순서와 `@ImageN` 일치).
- 조립: 합성 클립(ffmpeg 테스트 패턴)으로 실제 ffmpeg 실행 테스트.
- 유료 호출 0. JEV·힉스필드는 고정 자료로만 테스트한다.

## 12. 1단계 수용 기준

1. 회귀물 시험분 대본이 모든 관문을 통과하거나, 미통과 항목이 사람 승인으로 기록된다.
2. `plan`이 검증되지 않은 대사를 포함한 대본을 거부한다(테스트).
3. 시험분 7클립을 생성(약 180크레딧, 승인 후)하고 받아쓰기 대조를 통과한 클립으로 60초 영상을 조립한다. 액션·회귀 전환·독백 품질을 사람이 검수한다.
4. 타입체크와 테스트가 통과한다. README와 `docs/PROGRESS.md`를 갱신한다.

## 13. 위험과 미확인

- JEV가 멀쩡한 대사를 확정 통과시키는 비율이 낮다(시험분 7줄 중 4줄). 사람 승인 경로가 자주 쓰일 수 있다. 회차 전체로 다시 측정한다.
- `@ImageN` 문법, Seedance 음성 참조로 독백 목소리를 맞추는 방법, 액션 품질은 미확인이다. 시험분에서 확인한다.
- 단가는 2026-10-06 조회값이다(2.5 480p 초안 3크레딧/초). 생성 직전에 다시 조회한다.
- 2단계는 Codex 작업 일정에 따라 늦어질 수 있다.
