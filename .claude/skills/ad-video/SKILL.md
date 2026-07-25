---
name: ad-video
description: 힉스필드(Higgsfield MCP)로 제품/브랜드 광고 영상을 만들고 FIRSTFRAME 쇼케이스 사이트에 자동 반영·재배포한다. "광고 영상 만들어줘", "OO 광고 제작", "쇼케이스에 광고 추가", "진돗개 광고 만들어줘"처럼 광고 영상 제작+사이트 반영이 필요할 때 사용.
---

# ad-video — AI 광고 영상 제작 & 쇼케이스 자동 반영

제품/브랜드 하나를 받아 광고 영상을 생성하고, FIRSTFRAME 쇼케이스에 자동 반영한 뒤 재배포한다. OLIPOP·Allbirds·진돗개 데모를 만든 방법과 동일하다.

**재사용 로직은 kit 모듈에 있다 (2026-07-24 분리 완료)** — `~/workSpace/commerce-automation-kit`:
- `@cak/ad-video-gen` (원자 #5): 컨셉 3중 게이트·프롬프트 조립·NSFW lint·비용 견적·ffmpeg 후반작업(타이틀/concat/스플라이스/VO믹스/포스터). **후반작업은 인라인 ffmpeg 대신 이 CLI를 쓴다.**
- `@cak/showcase-site` (원자 #6): works.json(단일 진실 소스) 검증·works.js 생성·엔트리 CRUD·미디어 등록·빌드·배포. 이 스킬은 오케스트레이터(힉스필드 MCP 호출 + 두 원자 CLI 조합)다.

**사이트 (SITE) — 배포 원천은 kit 단독 (2026-07-24 일원화)**:
- **KIT(배포 원천)**: `~/workSpace/commerce-automation-kit/apps/firstframe` — Cloudflare Pages(firstframe-showcase) 배포는 **항상 여기서만** 실행한다.
- venture-studio(삭제 예정, 배포 금지): `~/Desktop/workSpace/venture-studio/ventures/market/ai-video-agency/website` — works.json **미러만** 유지(로컬 확인용). 이곳의 deploy.sh 는 kit sync 로 위임되는 폐기 래퍼다.
- 광고 반영 순서: kit works.json 반영 → kit sync(배포) → venture-studio works.json 에 같은 엔트리 미러.

**데이터 단일 편집점**: `SITE/works.json` — works.js 는 `gen` 으로 **생성**된다(직접 편집 금지).

## 0. 사전 요구

- **힉스필드 MCP 연결 필수**. 끊겨 있으면(`ToolSearch "select:mcp__claude_ai__balance"` → No match) 영상 생성 불가 → 사용자에게 `/mcp` 또는 세션 재시작으로 재연결 요청.
- 크레딧 확인: `mcp__claude_ai__balance`. 실측 단가(2026-07 기준):

| 작업 | 크레딧 | ≈USD |
|---|---|---|
| seedance_2_0 std **1080p 15s** | 135 | ~$6.4 |
| marketing_studio_video 1080p 15s | 150 | ~$7.5 |
| marketing_studio_video 720p 15s | 75 | ~$3.8 |
| seedance_2_0 std 1080p 5s | 45 | ~$2.2 |
| VO(seed_audio, TTS) | ~1.1 | ~$0.05 |
| nano_banana_pro 이미지 1k | 2 | ~$0.1 |

## 0.5 비용 최적화 (필수 — 이 순서로 태워야 리젝 낭비가 안 생긴다)

**절대 원칙: 컨셉·서사가 확정되기 전에 1080p 15초 풀길이를 생성하지 마라.** (실패: 진돗개에서 미확정 상태로 135cr 풀생성을 5번 리젝 = ~$32 낭비.)

1. **컨셉을 먼저 텍스트로 확정** — 리서치 → 소구점 → 고유성 테스트 → 서사 완결성(1.5절)까지 **생성 없이** 통과시키고 사용자 승인을 받는다. 리젝의 대부분은 여기서 걸러야 할 것이 생성으로 넘어가서 생긴다.
2. **시안은 싸게** — 구도·톤이 불확실하면 `seedance_2_0` **`mode:"fast"`** 또는 **480p** 또는 **5초(45cr)** 로 먼저 확인. 5초 시안 3개(135cr) = 1080p 15초 1편 값.
3. **최종만 고품질** — 확정된 컨셉만 1080p 최종 생성.
4. **구간 단위 재생성** — 긴 광고는 5초 클립 여러 개로 만들어 trim+concat. 마음에 안 드는 **그 구간만** 45cr로 다시 뽑는다(전체 재생성 금지). 30초는 15s×2 또는 5s×6.
5. **모델을 용도로 나눠라** (힉스필드 안에 다 입점):
   - **시안·양산**: `kling3_0`(저렴) 또는 seedance fast
   - **범용**: `seedance_2_0`(중간)
   - **진짜 TV 송출급 최종**: `veo3_1`(4K+네이티브 오디오, 최고 품질·최고가) — "TV급이어야 한다"는 요청이 있을 때만 최종 히어로컷에 사용
   - `models_explore`로 각 모델 duration/해상도/get_cost를 먼저 확인한다.
6. **생성 전 `get_cost:true`로 프리플라이트** 하고, 잔액이 빠듯하면 사용자에게 알린다.

## 1. 제품/소재 준비

- **실제 판매 제품(URL 있음)**: `mcp__claude_ai__show_marketing_studio {action:'fetch', type:'product', url:<제품URL>}` → `product_id` + 이미지들. **`is_primary`가 틀릴 수 있으니** 이미지를 눈으로 확인해 히어로 컷을 고른다(Allbirds에서 primary가 신발이 아니라 양말이었음).
- **제품 URL이 없는 소재(예: 진돗개, 로컬 서비스)**: product 없이 프롬프트만으로 생성. `marketing_studio_video`는 product 없이도 tv_spot 프롬프트로 동작하고, 또는 `seedance_2_0`/`veo3_1` 텍스트→영상 사용. 특정 이미지가 있으면 `media_import_url`로 올려 `start_image`로.

## 1.5 컨셉 설계 (필수) — 소구점 먼저, 장면은 그 다음

**프롬프트는 컨셉의 산출물이다. 컨셉 없이 바로 프롬프트를 쓰지 마라.** 영상 생성 전 반드시 이 순서를 거친다:

### (a) 핵심 소구점 1~2개 확정 — 자료조사로 **동적으로** 찾는다
소구점은 고정 목록에서 고르는 게 아니라 **대상을 리서치해서 도출**한다:

1. **리서치** (WebSearch/WebFetch — 대상당 2~4회 검색이면 충분):
   - **제품**: 공식 제품 페이지의 셀링 카피 · 리뷰에서 반복되는 구매 이유("이것 때문에 샀다") · 경쟁 제품 대비 차별점
   - **브랜드·소재**(제품이 아닌 것): 그 대상이 알려진 이유 · 상징성 · 대중이 부여하는 의미 · 대표 일화
   - 예: 진돗개 리서치 → 천연기념물 제53호, "돌아온 백구" 일화로 상징되는 주인에 대한 절대적 충성, 한 주인만 따르는 성품 → **소구점 = 충성심 · 가족적 유대** (근거 있는 도출)
2. **도출**: 조사 결과에서 가장 강하고 **시각화 가능한** 소구점 1~2개를 확정하고, **근거와 함께 사용자에게 밝힌 뒤** 진행한다.
3. **고유성 테스트 (필수 — 통과 못 하면 컨셉 폐기 후 재도출)**:
   > **"경쟁·유사 대상을 그 자리에 넣어도 광고가 성립하는가?" 성립하면 실패한 컨셉이다.**
   - 카테고리 일반 소구점(모든 개=충성, 모든 음료=시원함, 모든 화장품=촉촉함)에서 멈추지 말고, **그 대상만의 일화·기질·차별 스펙**까지 파고들어 컨셉을 세운다.
   - 실패 사례(실제): 진돗개 광고를 "창가에서 기다리는 개 + 가족"으로 만듦 → 골든리트리버를 넣어도 성립 → 사용자 리젝. 진돗개 고유 자산은 "돌아온 백구"(300km 귀환 실화), 아이·주인을 지키는 용맹 같은 **그 대상만의 서사**였다.
   - 좋은 컨셉의 예: 진돗개=300km 귀환/주인을 구한 개, 특정 음료=그 브랜드만의 성분·제법, 특정 신발=그 소재의 기원 스토리.
4. 사용자가 소구점을 직접 지정하면 그것을 따르고, 리서치는 장면 아이디어 보강용으로만 쓴다.

아래 표는 **감을 잡기 위한 예시일 뿐** — 실제 소구점은 항상 위 리서치에서 나와야 한다:

| 카테고리 | 소구점 예시 |
|---|---|
| 음료 | 청량감 / 맛 / 저당·건강 / 가격 |
| 화장품 | 보습 / 미백 / 노화방지 / 순한 성분 |
| 식품·외식 | 풍미 / 신선함 / 장인정신 / 간편함 |
| 신발·의류 | 착화감 / 소재 / 스타일 / 내구성 |
| 펫·동물 | 충성심 / 가족적 유대 / 영리함 |

### (b) 소구점 → 시각 언어 번역
소구점을 말이 아니라 **장면**으로 옮긴다. 15초 = 4~5비트, 각 비트가 소구점을 "보여줘야" 한다:
- 청량감 → 얼음 갈라짐·응결수·탄산 버스트 매크로, 쿨 하이라이트
- 보습 → 물방울 머금은 텍스처 매크로, 촉촉한 스월
- 충성심 → 창가의 기다림 → 문이 열리자 슬로모 질주 → 곁을 지키는 마지막 샷
- 가족적 유대 → 아이·가족과의 교감, 저녁 거실의 따뜻한 빛

**서사 완결성 (실패 사례에서):** 결과(해피엔딩)로 점프하지 마라 — "구조를 물어 끌어냄 → 갑자기 새벽에 오붓하게 앉음"은
인과가 비어 사용자 리젝됨. '구조됐다'를 보여주려면 '구조가 오는 과정'(도움을 부르러 질주→사람을 깨움→이끌고 귀환)이
있어야 한다. **빠진 연결고리는 15초 클립을 추가 생성해 trim·concat으로 잇는다** — 기존 패스의 앞/뒤를 자르고 사이에
새 패스를 끼우는 멀티패스 편집(ffmpeg filter_complex trim+concat)이 재생성보다 싸고 빠르다.

### (c) TV급 스타일 가이드 — 모든 프롬프트에 상시 포함 ("올드함" 방지)
- 촬영: `high-end TV commercial, cinematic, anamorphic feel, shallow depth of field, smooth dolly/gimbal, subtle speed ramps, no camera shake`
- 조명: `sculptural/dramatic lighting, rim light` + 실내는 `volumetric haze`, 실외는 `crisp modern light` — **평면적 자연광 다큐 톤 금지**
- 그레이딩: `high-contrast cinematic grade, deep shadows, controlled highlights` — 뉴트럴 다큐 그레이딩 금지
- 편집감: 비트마다 샷 사이즈 변화(매크로→미디엄→와이드→히어로)
- 금지: 온스크린 텍스트(항상 후반 오버레이), 신체 부위 클로즈업(NSFW 오탐), 다큐·홈비디오 톤
- 내레이션(TTS)은 **기본 넣지 않는다** — 사용자가 원할 때만. TV 납품용 멘트는 성우 하이브리드 권장.

## 2. 영상 생성 — 연출 규칙 (label-test 실측 기반, 반드시 지킬 것)

`~/Desktop/workSpace/venture-studio/ventures/market/ai-video-agency/portfolio/label-test/RESULT.md` (실측 리포트) 결론:

1. **대형 텍스트(브랜드명·용량 등)는 1080p에서 안정**. 자유롭게 써도 됨.
2. **소형 본문 텍스트(성분표 등)는 VFX가 많으면 오타로 붕괴**(`Prebiotics`→`Ruéiclics`). 라벨 판독 컷은 "제품 정면 + 느린 회전 + VFX 없음"으로만. 법적으로 정확해야 하는 초소형 문구는 AI에 맡기지 말고 실제 이미지 후반 합성.
3. **`tv_spot` 모드는 아바타(사람)를 자동 삽입**한다(warning에 표시됨). 제품만 나오는 광고를 원하면 `product_showcase` 사용하거나, 사람 없는 순수 제품 회전은 `seedance_2_0` + `start_image` 로.
4. **사람 신체(발/다리 등)가 크게 나오는 프롬프트는 NSFW 필터에 오탐**될 수 있음(Allbirds "신발 신는 사람" 차단됨). 차단 시 크레딧은 환불됨 → 사람 없는 제품 중심으로 재시도.

호출 예 (제품 회전, 라벨 안전):
```
mcp__claude_ai__generate_video {model:"seedance_2_0", resolution:"1080p", mode:"std", duration:5,
  generate_audio:false, aspect_ratio:"16:9",
  medias:[{value:"<media_id>", role:"start_image"}],
  prompt:"The <제품> rotates very slowly on a turntable, front facing camera, sharp and undistorted. Soft studio light, shallow depth of field, no camera shake."}
```
호출 예 (제품 TV 스팟):
```
mcp__claude_ai__generate_video {model:"marketing_studio_video", mode:"tv_spot",
  product_ids:["<product_id>"], resolution:"1080p", duration:15, aspect_ratio:"16:9",
  prompt:"Cinematic TV commercial for <제품>. Hero shot held long, product centered, label crisp. Warm light, slow push-in, no shake."}
```

## 3. (선택) 멘트/VO 추가

TV 광고 멘트가 필요하면 — marketing_studio_video의 `generate_audio`는 **음악/SFX만** 만들고 멘트는 안 넣는다(힉스필드는 음악 생성 불가, 음성 TTS만 됨):
1. 보이스 선택: `mcp__claude_ai__list_voices` (예: Maya=b0f766b7-8703-4bd1-b973-f857c36837b6, 따뜻한 여성)
2. `mcp__claude_ai__generate_audio {model:"seed_audio", voice_type:"preset", voice_id:"<id>", prompt:"<VO 스크립트>"}`
3. 합성: `ffmpeg -i video.mp4 -i vo.wav -filter_complex "[0:a]volume=0.32[bg];[1:a]adelay=900|900,volume=1.5[vo];[bg][vo]amix=inputs=2:duration=first:dropout_transition=2[a]" -map 0:v -map "[a]" -c:v copy -c:a aac out.mp4`

## 4. 완료 대기 & 다운로드

- 제출 후 `mcp__claude_ai__job_status {jobId, sync:true}` 를 completed 될 때까지 폴링(비디오 1~4분). `results.rawUrl` 에 mp4 URL.
- **영상은 세로가 길거나 비규격일 수 있음**: 1080p 요청은 대체로 1920×1080로 정확히 나오지만, 480p 요청 시 864×496 등 비규격이 나온 적 있음. 납품엔 규격 리인코딩 필요할 수 있음.

## 5. 사이트에 반영 (자동화 핵심 — kit CLI 사용)

```bash
KIT=~/workSpace/commerce-automation-kit
APP=$KIT/apps/firstframe
# 미디어 등록 (다운로드/복사 + ffprobe 검증 + 포스터 추출):
cd $KIT && npm run cli -w @cak/showcase-site -- add-media --site "$APP" --slug <slug> --src "<mp4 URL|로컬경로>" [--poster-at 13.5]
# 엔트리 추가 (검증→reserved 앞 삽입→저장→works.js 재생성까지 한 번에):
npm run cli -w @cak/showcase-site -- add --site "$APP" --entry <entry.json>
```
후반작업(타이틀/스플라이스/VO믹스 등)은 `@cak/ad-video-gen` CLI:
```bash
npm run cli -w @cak/ad-video-gen -- title --in v.mp4 --out o.mp4 --text "KOREA JINDO" --fade-at 26.5
npm run cli -w @cak/ad-video-gen -- splice --base b.mp4 --insert i.mp4 --out o.mp4 --cut-at 9.5 --resume-at 10
npm run cli -w @cak/ad-video-gen -- mix-vo --video v.mp4 --vo vo.wav --out o.mp4
```
entry JSON 형식 (`@cak/contracts` 의 `ShowcaseWorkEntry` — works.json 의 entries 항목과 동일):
```js
{
  id: "jindo", brand: "진돗개 / JINDO",
  cover: "media/poster-jindo.jpg",
  prev: "media/jindo.mp4",              // 케이스 hover 프리뷰(무음 루프)
  en: { cat:"Pet · Heritage", meta:"Pet · Heritage · 2026", runtime:"0:15 · 1 cut",
        h3:"...", p:"...", chips:["...","..."], how:"<b>How we made it:</b> ...", sub:"Pet · Heritage · 2026 · 1 cut" },
  ko: { cat:"반려 · 헤리티지", meta:"반려 · 헤리티지 · 2026", runtime:"0:15 · 1컷",
        h3:"...", p:"...", chips:["...","..."], how:"<b>제작 방식:</b> ...", sub:"반려 · 헤리티지 · 2026 · 1컷" },
  clips: [
    { poster:"media/poster-jindo.jpg", src:"media/jindo.mp4",
      en:{label:"Hero cut", cap:"..."}, ko:{label:"히어로 컷", cap:"..."} }
  ]
}
```
- `en`/`ko` 양쪽 다 채운다(사이트는 이중언어). 브랜드명·스펙(1080p, 0:15)은 번역하지 않음.
- 컷이 여러 개면 `clips` 배열에 추가(라이트박스에서 썸네일 전환됨).
- `how` 는 HTML 허용(`<b>`).

## 6. 빌드 & 배포 — **"반영"은 로컬+배포 양쪽이 끝나야 완료다**

works 데이터만 고치면 로컬에는 보이지만 **공개 URL(firstframe-showcase.pages.dev)에는 반영 안 된다.** 반드시 배포까지 한다:

```bash
cd ~/workSpace/commerce-automation-kit
npm run cli -w @cak/showcase-site -- sync --site "$PWD/apps/firstframe"
# = validate → gen(works.js) → build(dist) → Cloudflare Pages 배포. validate 실패 시 중단(exit 1).
```

Cloudflare 인증 우선순위: ① 환경변수 `CLOUDFLARE_API_TOKEN` → ② `<site>/.cf-token`(gitignore됨, 이미 세팅됨). 토큰이 없으면 deploy는 throw 하지 않고 `{ok:false, log:'토큰 없음...'}` 보고로 반환된다 — 그 경우 로컬만 됐음을 명시하고 사용자에게 토큰 세팅을 안내할 것.

> 광고를 생성/수정했으면 works.json 반영 직후 **항상 `sync` 까지 실행**해서 로컬·배포를 동기화한다.
> **배포는 kit(apps/firstframe)에서만** — venture-studio 쪽에서는 절대 배포하지 않는다(그쪽 deploy.sh 는 kit sync 위임 래퍼). 이관 기간에는 venture-studio works.json 에 같은 엔트리를 미러만 해 둔다(`--site ~/Desktop/workSpace/venture-studio/ventures/market/ai-video-agency/website` 로 add/gen 까지만, deploy 금지).

## 7. 검증

- `node --check works.js` (문법), 헤드리스 렌더 스크린샷으로 새 케이스 확인:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --autoplay-policy=no-user-gesture-required --window-size=1440,2600 --screenshot=out.png "file://<abs>/showcase.html"`
- 배포 URL `curl -s -o /dev/null -w "%{http_code}"` 200 확인.

## 주의 (RISKS.md)

- **실존 브랜드(OLIPOP·Allbirds 등)는 데모 전용.** 공개 배포에는 가공 브랜드나 계약 고객 제품으로만. 상표·초상 리스크.
- **AI 출처 서명(C2PA)은 제거하지 않는다**(provenance 은폐로 오해). AI 사용은 숨기지 말고 밝히는 게 방어 포지션.
- 음악은 힉스필드로 못 만든다 → 상업 납품 음악은 외부 라이선스(Epidemic Sound 등).
