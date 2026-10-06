---
name: drama-series
description: AI 미니시리즈 드라마를 주제 관문(조회 유발 요소 JEV 판정)→기획→대본→관문(대사·장소·시나리오 JEV 판정)→참조 이미지→Seedance 생성→받아쓰기 대조→조립까지 진행한다. "드라마 만들어줘", "미니시리즈 생성", "OO 장르 드라마 1화", "회귀물/참교육 드라마 영상"처럼 이야기형 연속 영상 제작 요청 시 사용. 광고는 ad-video, 쇼핑쇼츠는 shopping-shorts 스킬.
---

# 드라마 시리즈 제작

원자 `@cak/drama-series`(판단 없는 검사·명세·조립)를 이 스킬이 실행한다. 원자는 외부를 호출하지 않는다. JEV 판정과 힉스필드 생성은 이 스킬이 한다. 대본은 반드시 `WRITING-GUIDE.md`를 따른다.

CLI: `npm run --silent cli -w @cak/drama-series -- <명령>` (이하 `ds <명령>`)

## 0. 작업 폴더
- 대본·관문 기록(커밋): `docs/videos/<YYYYMMDD-작업명>/` — `series.json`, `ep01.json`, `gates/`, `judge/`
- 영상·이미지(커밋 안 함): `/Users/admin/Downloads/vedio/drama/<YYYYMMDD-작업명>/{refs,clips,out}`

## 1. 주제 관문 (조회 유발 요소)
1. 장르를 정한다. `ds genres`로 장르 팩을 확인한다. 맞는 팩이 없으면 `packages/drama-series/genres/`에 새 팩을 추가한다(코드 수정 없음).
2. 주제 후보 5개를 `topics.json`(`{genreId, topics:[{id, logline, synopsis, claimedElements}]}`)으로 쓴다. 후보마다 장르 팩 `hookElements`(강한 갈등·복수·배신·금기 관계·숨겨진 정체·계층 격차·관능적/퇴폐적 분위기) 중 **2개 이상을 분명히** 담는다. 퇴폐미는 선택 요소이며 수위 경계(`WRITING-GUIDE.md`)를 지킨다.
3. `ds topic-build --topics <dir>/topics.json --out <dir>/judge/topic-r1.json` → `jev-relay.mjs` → `ds topic-apply --topics … --request … --response … --gates <dir>/gates`.
4. **통과한 주제만** 다음 단계로 간다. 통과가 없으면 후보를 고쳐 다시 판정한다(최대 2회). 수위 안전이 미확정이면 표현을 고친다 — 기준을 낮추지 않는다.
5. 순위(`ranking`)와 확정 요소를 사용자에게 보여주고, 시나리오로 쓸 주제를 고른다(사용자가 정하지 않으면 1순위).

## 2. 기획 (사람 승인 1)
1. 고른 주제를 `series.json`의 `topic`에 **topics.json의 값 그대로** 복사한다(지문이 달라지면 생성 명세가 거부된다).
2. `series.json`(인물·말투·장소·소품·회차 개요)과 `ep01.json`(컷·대사)을 쓴다. 주제가 확정한 요소가 회차 대본에 실제로 드러나게 쓴다. 대사의 `verification`은 비워 둔다(자동 unverified).
3. `ds validate --series … --episode … --gates <dir>/gates` → block 이 0이 될 때까지 고친다.
4. 시나리오·소품 판정:
   - `ds judge-build --kind scenario … --out <dir>/judge/scenario-r1.json`
   - `node .claude/skills/drama-series/scripts/jev-relay.mjs --request <dir>/judge/scenario-r1.json --out <dir>/judge/scenario-r1.res.json`
   - `ds judge-apply --kind scenario … --request <dir>/judge/scenario-r1.json --response <dir>/judge/scenario-r1.res.json --gates <dir>/gates`
   - `props`도 같은 순서.
   - 시나리오 판정에는 구조(훅·갈등·사이다·다음 화·장르 약속), **주제 요소 반영**, **수위 안전**, 재미 점수(참고)가 함께 들어간다. 요소 반영 실패나 수위 미확정은 차단이다.
5. 사용자에게 시나리오 전문(컷별 장면·대사)과 판정 결과(재미 점수 포함)를 한국어로 보여주고 **기획 승인**을 받는다. 판정은 구조 점검이지 조회수 예측이 아니라고 함께 말한다.

## 3. 대사 관문 (씬별)
1. `ds judge-build --kind dialogue …` → `jev-relay.mjs` → `ds judge-apply --kind dialogue …` (대사 파일에 `verified`가 기록된다).
2. 확정 fail·미확정 대사는 지침대로 고쳐 다시 판정한다. **대사를 고치면 지문이 바뀌므로 2-3(validate)·2-4(scenario, props)부터 다시 돌린다.** 재판정은 최대 2회.
3. 그래도 미확정인 대사는 판정 수치와 함께 사용자에게 보여주고, 승인한 것만 `ds approve-line --episode … --cut … --line … --by user --note "<수치와 사유>"`로 기록한다. 사용자 승인 없이 이 명령을 쓰지 않는다.

## 4. 참조 이미지
- 인물 모습(`looks`)과 장소마다 `gpt_image_2_5`로 1장씩 만든다(장당 약 0.25크레딧, `get_cost`로 확인). 같은 인물의 다른 모습은 기존 이미지를 참조로 넣어 얼굴을 유지한다.
- 직접 열어 보고(외형·글자·로고), job_id 를 `refAssetId`로 `series.json`에 기록한다. 이미지는 `…/refs/`에 내려받는다.
- 노출·선정적 연출 없이 설정한다(생성 필터·광고 적합성).

## 5. 생성 계획 (사람 승인 2)
1. 힉스필드 `generate_video`에 `get_cost: true`로 컷 하나를 조회해 단가가 `packages/drama-series/src/core/estimate.ts` 표와 같은지 확인한다. 다르면 표와 `RATE_MEASURED_AT`을 고치고 테스트를 돌린 뒤 진행한다.
2. `ds plan … --gates <dir>/gates --budget <승인 한도> --draft --out <dir>/plan.json`. 실패하면 보고서대로 고친다.
3. 사용자에게 클립 수·합계 크레딧·잔액(`balance`)을 보여주고 **비용 승인**을 받는다. 재생성 상한도 함께 정한다.

## 6. 생성
1. `plan.json`의 클립마다 `generate_video`를 호출한다: `model` = `clip.model`, `params`의 값 그대로, `medias` = `clip.medias.map(m => ({role: m.role, value: m.assetId}))`, `prompt` = `clip.prompt`. 프리셋 추천이 오면 승인 계획과 다르므로 `declined_preset_id`로 거절한다.
2. **대표 클립 1개 먼저** → 내려받아 프레임과 소리를 확인 → 나머지 클립 생성.
3. 결과는 `…/clips/<cutId>.mp4`로 저장한다. 실제 차감량은 `balance`로 확인해 `docs/videos/<작업>/USAGE.md`에 조회 견적과 구분해 기록한다.
4. 대사 클립마다 `ds verify-clip … --cut <id> --media …/clips/<id>.mp4 --gates <dir>/gates`. block 이면 그 클립은 채택하지 않고, 재생성 상한 안에서 다시 만든다.
5. 접수 결과가 불명확하면(타임아웃) 중복 제출하지 말고 작업 이력부터 확인한다.

## 7. 조립과 검수
- `ds assemble --series … --episode … --gates <dir>/gates --clips …/clips --out …/out/ep01.mp4 --font /System/Library/Fonts/AppleSDGothicNeo.ttc` — 대사 컷마다 통과한 `verify-clip` 기록이 없으면 조립을 거부한다
- 독백(`plan.json`의 `voiceOver`)이 있으면 목소리를 사용자와 정한 뒤 `tts-narration` 원자로 만든다. 아직 자동 믹스는 없으므로 사용자에게 알린다.
- 결과 경로를 알리고 **사람 검수**를 받는다. 업로드는 이 스킬 범위 밖(`youtube-upload` 원자, 별도 승인).

## 금지
- 검증되지 않은 대사를 생성에 넣지 않는다(`plan`이 막는다. 우회하지 않는다).
- 판정 실패를 통과로 바꾸거나 기준값을 낮추지 않는다.
- 승인 범위를 넘는 결제·요금제 변경·재생성을 하지 않는다.
