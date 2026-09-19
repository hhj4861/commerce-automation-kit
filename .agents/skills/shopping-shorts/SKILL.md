---
name: shopping-shorts
description: 쇼핑쇼츠(상품 소개 세로영상+쿠팡 파트너스 링크) 배치 제작 오케스트레이션. "쇼핑쇼츠 만들어줘", "OO 상품 쇼츠 기획", "쇼츠 배치 생성"처럼 상품 기반 세로 콘텐츠 제작·발행이 필요할 때 사용. 광고 브랜드 필름은 ad-video 스킬.
---

# shopping-shorts — 쇼핑쇼츠 배치 제작 & 운영 큐

영상 생성은 [광고 기반 공통 생성 절차](../../../docs/VIDEO-GENERATION.md)를 먼저 읽고 따른다.
광고와 같은 `video:plan` 엔진을 사용한다. `visualPrompt`는 장면 입력이며 직접 생성 호출에 사용하지 않는다.

상품 하나(또는 keyword-intel 후보)를 받아 **기획 배치 → 사람 승인 → 힉스필드 생성 → 원자 조립 →
발행 검수** 파이프라인을 오케스트레이션한다. 강의 3편 실측 분석(2026-07-27) 기반 공정이되,
금지선 충돌 3개(타인 영상 재가공·상세페이지 캡처·가짜 경험담)는 **합법 대체**로 설계돼 있다.

**역할 분담** — 이 스킬은 접착제다. 결정 로직은 아래가 소유:
- `@cak/shopping-shorts`(원자 #12): 대본 lint(block=조립 거부)·대가성 고지 강제·9:16 조립·실측 견적
- `apps/shopshorts` 대시보드: 잡 큐 + **사람 게이트 2개**(기획 승인·발행 검수) — `npm start -w @cak/app-shopshorts` → http://127.0.0.1:5178
- `keyword-intel`(#1): 소재 신호(스코어는 참고 — 자동 실행 트리거 금지)
- `shorts-publish`(#7): 실제 업로드(사람이 실행, 기본 --dry-run)

## 0. 사전 요구

- 힉스필드 MCP 연결(`ToolSearch "select:mcp__claude_ai__balance"`) + 크레딧 확인. 끊겨 있으면 `/mcp` 재연결 안내.
- 대시보드 서버: `curl -s http://127.0.0.1:5178/api/jobs` 실패 시 `npm start -w @cak/app-shopshorts` 백그라운드 기동.
- **광고와 같은 품질 정책**: 기본 `videoTier:"standard"`(Seedance 2.0/1080p). 사용자가 시안을 선택한 경우만 `draft`로 낮춘다. 지원 사양·실제 비용은 생성 전 MCP 프리플라이트로 확인한다.

## 1. 상품 선정 (사람 확정)

- 후보: `npm run analyze -w @cak/keyword-intel -- --top 20` 또는 사용자 지정.
- 쿠팡 실판매 깊이(리뷰 수·로켓 여부) 확인은 **사람이 브라우저로** — 스코어·조회는 참고 지표일 뿐 자동 선정하지 않는다.
- ⚠️ 건기식·화장품 키워드는 `brief.isHealthFunctional=true` 지정(원자 lint 가 강화 모드로 동작).

## 2. 리서치 → 소구점 (ad-video §1.5와 동일 규율)

WebSearch 2~4회로 **근거 있는 소구점**을 도출한다(리뷰에서 반복되는 구매 이유·차별 스펙).
고유성 테스트: 경쟁 제품을 넣어도 성립하면 재도출. 소구점은 `brief.appealPoints`에 근거와 함께.

## 3. 배치 기획 (N편) — 대본 작성 규칙

훅 유형은 계약 enum 5종에서 회전: `problem-solution` | `before-after` | `demo` | `curiosity` | `info-tip`.
**비트 구성 기본**: 훅 3s → 바디 5s → CTA 4s (총 ~12s, 클립 3개). 배치는 유형·장면을 다양화.

대본 4원칙 (원자 lint 가 코드로 강제하지만, 처음부터 지켜서 리젝을 줄인다):
1. **정보성·데모 프레임만** — "N년 써보니"류 가짜 경험담 금지(`fake-experience` block)
2. **효능 단정 금지** — 질병·의학 표현 전면 금지, 건기식은 승인 표현 밖 단정도 block
3. **상품명을 대본에 명시** — 영상·링크 불일치(기만) 방지
4. **description 은 고지 포함** — `disclosure --text ... --append` 또는 원자 `withDisclosure` 사용

`visualPrompt` 는 **자체 생성 전용** — URL·"캡처"·타 플랫폼 영상 참조를 넣으면 `external-source` block (금지선 #1).
파트너스 링크는 **사용자가 발급해 `brief.affiliateUrl` 에 수동 입력**(API 어댑터는 D1 실측 후 예약 슬롯).

잡 JSON(`{brief, script, videoDirection, videoTier?}`) 생성 → 검증·등록.
`videoDirection`에는 실제 근거 `evidence`, 고유성 검토 `uniqueness`, 서사 확인 `narrativeComplete`를 넣는다.
기존 잡에 이 필드가 없으면 `draft`/`rejected`에서 `PUT /api/jobs/:id/video-direction`으로
`{videoDirection, videoTier:"standard"}`를 보완한 후 사람 승인을 받는다. 기획 근거를 임의로 채우지 않는다.
`visualPrompt`에는 장면만 작성한다. 자막·caption·subtitle 삽입 지시는 후반 작업 입력으로 분리한다.
필요한 비트의 연출 강조는 `emphasis: {"2":"hero"}`처럼 지정한다(공통 문서의 입력 예제 참조).
```bash
npm run --silent cli -w @cak/shopping-shorts -- lint --job job.json          # block 0 확인
npm run --silent video:estimate -- --tier standard --durations 3,5,4       # 실제 비트 길이로 교체
curl -s -X POST http://127.0.0.1:5178/api/jobs -H 'content-type: application/json' -d @job.json
```

## 4. 사람 게이트 1 — 기획 승인

대시보드에서 사용자가 **기획 승인** 버튼을 눌러야 `script-approved` 가 된다(서버가 lint 재검증).
스킬은 여기서 멈추고 사용자에게 대시보드 URL 과 견적 총액을 보고한다. **승인 없이 생성 진행 금지**(금지선 #3).

## 5. 클립 생성 (승인된 잡만)

- 승인 후 로컬 서버/클라우드 워커가 광고 기반 공통 CLI를 호출한다.
- 최신 잡의 `videoGeneration.plan.clips`가 준비될 때까지 생성하지 않는다. 오류는 `videoGenerationError`에서 확인한다.
- 공통 문서의 **생성 실행 절차**로 각 클립의 프롬프트·모델·해상도·화면비·길이를 그대로 실행한다.
  수기 프롬프트나 쇼츠 전용 저가 모델로 우회하지 않는다.
- 사용자가 시안을 선택했으면 초안에서 `videoTier:"draft"`를 지정해 승인받는다.
- 다운로드·영상 검증 후 `{to:"generated", clipPaths:[...]}`로 기록한다. 계획과 대본·클립 수가 다르면 서버가 거부한다.

## 6. TTS 내레이션 (기본 포함)

한국어 내레이션은 **tts-narration 원자(#13)** 로 생성한다 — hanmadi 튜터 앱과 동일한
검증 음성(Claire, 한국어 원어민·STT 전수검증). 힉스필드 `generate_audio(seed_audio)`는
쓰지 않는다(목소리 통일).

```bash
npm run --silent cli -w @cak/tts-narration -- script --script script.json --outdir vo/ --join vo/full.mp3
```

비트별 mp3 + 단일 트랙(vo/full.mp3)이 나온다 — §7 assemble 의 `--narration vo/full.mp3` 로 그대로.
키: `ELEVENLABS_API_KEY`(kit `.env`). 음성/모델 재정의: `ELEVENLABS_VOICE_ID` / `ELEVENLABS_TTS_MODEL`.
BGM 이 필요하면 사용자 라이선스 트랙 또는 ai-music 원자 산출물 사용(힉스필드는 음악 생성 불가).

## 7. 조립 (원자가 게이트)

```bash
npm run --silent cli -w @cak/shopping-shorts -- assemble --job job.json \
  --clips hook.mp4,body.mp4,cta.mp4 --out short.mp4 --narration vo.mp3 [--music bgm.mp3]
```
- 원자가 lint 를 재실행해 block 이면 **렌더 자체를 거부**한다.
- 제휴 링크가 있으면 영상 상단에 대가성 고지 오버레이가 자동 번인된다(끄는 옵션 없음).
- 완료 후 전이: `{to:"assembled", outputVideo:"..."}` → `{to:"review", outputVideo:"..."}`.

## 8. 사람 게이트 2 — 발행 검수 → 업로드

사용자가 대시보드에서 영상·고지·상품일치를 확인하고 **발행 확인**을 누른다(서버 lint 재검증).
실제 업로드는 사람이 실행:
```bash
npm run cli -w @cak/shorts-publish -- publish --in short.mp4 --out final.mp4 --mode crop \
  --title "<제목>" --desc "<고지 포함 설명>" --platforms youtube,instagram,tiktok [--dry-run]
```
- `aiDisclosed` 기본 true(AI 표기 은폐 금지). upload-post 계정 미연결이면 자동 dry-run.
- 업로드 requestId 를 대시보드 `publishRef` 로 기록.

## 금지선 (이 스킬에서 자주 부딪히는 것)

1. **타인 영상·이미지 재가공 금지** — 소재는 전량 힉스필드 자체 생성. 쿠팡 상세페이지 캡처도 금지(파트너스 API 이미지는 D1 실측 후 재검토).
2. **가짜 경험담 금지** — AI 인물에게 실사용 후기를 시키지 않는다. 정보성·데모 프레임만.
3. **무검수 대량 발행 금지** — 게이트 1·2 는 UI 버튼(사람)이며 스킬이 대신 누르지 않는다.
4. **영상 속 상품 = 링크 상품** — 불일치는 기만광고. 제네릭 소재면 특정 브랜드 연상 요소 제거.
5. 홈쇼핑 낙수·스코어 자동 트리거로 "무엇을 만들지"를 정하지 않는다(참고 지표).
