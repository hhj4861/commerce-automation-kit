# @cak/ad-video-gen — 원자 #5: 광고영상 생성 지원

힉스필드(MCP) 기반 광고영상 제작의 **주변 로직 전부**를 담는 원자.
실제 생성 호출(MCP)은 외부 오케스트레이터(venture-studio 의 ad-video 스킬)가 하고,
이 원자는 (1) 생성 전 게이트·프롬프트·비용 (2) 생성 후 ffmpeg 후반작업을 제공한다.
계약은 `@cak/contracts` 의 `AdConcept` / `AdBeat` / `AdVideoJob` / `AdVideoModel` / `AdVideoTier` / `AdVideoResolution`.

## 역할

| 단계 | 기능 | 모듈 |
|---|---|---|
| 생성 전 | 컨셉 3중 게이트(리서치 소구점+근거 · 고유성 테스트 · 서사 완결성 + **사람 승인**) | `src/core/concept.ts` |
| 생성 전 | TV급 프롬프트 조립(STYLE_GUIDE 상시 포함) + lint(NSFW 오탐 금지구 · 온스크린 텍스트 지시 검출) | `src/core/prompt.ts` |
| 생성 전 | 비용 견적 — **2026-07 실측 단가만** 사용, 미실측 조합은 `credits:null`(지어내지 않음) | `src/core/cost.ts` |
| 생성 후 | ffmpeg 인자 빌더(순수): probe/poster/grid/title/concat/splice/mix-vo | `src/core/ffargs.ts` |
| 생성 후 | ffmpeg spawn 실행·probe 파싱(zod) / https 다운로드 | `src/adapters/` |

## CLI 사용법 (stdout=JSON 데이터, stderr=JSON 로그)

```sh
# 생성 전
npm run cli -- check-concept --concept concept.json          # 3중 게이트 → {ok,problems,warnings}
npm run cli -- build-prompt --concept concept.json [--extra-style "Teal and amber palette."]
npm run cli -- lint-prompt --text "..."                      # 또는 --file prompt.txt
npm run cli -- estimate --model seedance_2_0 --resolution 1080p --duration 15
npm run cli -- tier --tier standard                          # 티어 기본 조합 + 견적

# 생성 후 (ffmpeg 필요)
npm run cli -- probe --in spot.mp4
npm run cli -- poster --in spot.mp4 --at 13.5 --out poster.jpg
npm run cli -- grid --in spot.mp4 --out grid.png [--count 4] [--interval 4]
npm run cli -- title --in spot.mp4 --out titled.mp4 --text "KOREA JINDO" --fade-at 26.5 [--font 경로]
npm run cli -- concat --out full.mp4 --in a.mp4 --in b.mp4
npm run cli -- splice --base b.mp4 --insert i.mp4 --out o.mp4 --cut-at 9.5 --resume-at 10 [--base-dur 30] [--title "..." --fade-at 26.5]
npm run cli -- mix-vo --video v.mp4 --vo vo.wav --out mixed.mp4 [--bg-vol 0.32] [--vo-vol 1.5] [--delay-ms 900]
npm run cli -- download --url https://... --out clip.mp4
```

종료 코드: `0` 정상 / `1` 검증·사용법 실패(`{ok:false, problems}`) / `75` 일시적 실패(다운로드 네트워크·5xx).
상대 경로 인자는 `INIT_CWD`(워크스페이스 실행 시 사용자 위치) 기준으로 해석한다.

## 설계 제약 (변경 시 근거 필요)

- **사람 게이트 하드코딩**: `humanApproved=false` 컨셉은 `check-concept` 실패이자 `build-prompt` 거부.
  CLAUDE.md 금지선(무검수 광고 자동발행 금지)의 코드 구현이다.
- **고유성 테스트**: "경쟁·유사 대상을 넣어도 광고가 성립하면 실패한 컨셉" — `uniqueness.passed=false` 는 생성 금지.
- **단가는 실측만**: `seedance_2_0` 1080p 9cr/초(5s=45·15s=135 검증점), `marketing_studio_video` 1080p 10cr/초·720p 5cr/초.
  표에 없는 조합(veo3_1, kling3_0, fast, 480p/4k …)은 `credits:null` + "생성 전 get_cost 프리플라이트 필수".
  USD 환산은 4000크레딧 팩 단가 1cr=$0.0475.
- **프롬프트 lint**:
  - 금지구(`perfume commercial`, `lingerie`, `person lacing up`, `bare feet`, `bare skin`)는
    힉스필드 NSFW 필터 **오탐 실측 사례**(차단·크레딧 환불 이력) — 검출 시 violation.
  - 화면 내 텍스트 지시는 violation("텍스트는 AI가 아니라 후반 오버레이로").
    단 `no on-screen text` 같은 **부정형은 위반이 아니다**(매치 직전 부정어 검사).
- **core 는 순수**: `src/core/*` 는 I/O·spawn 금지. ffmpeg 인자는 배열/문자열만 조립하고
  실행은 `src/adapters/ffmpeg.ts` 만 담당(타임아웃 240s, 실패 시 stderr 마지막 줄 포함 throw).
- **silent drop 금지**: 실패는 전부 `problems`/violations 배열 또는 에러 메시지로 투명화.
- 의존성은 `@cak/contracts` + `zod` + Node 내장만. 원자끼리 import 금지(logger 는 keyword-intel 패턴 복제).

## 실측 검증 이력

- 2026-07-24: 전 CLI 커맨드 실기 스모크 통과 — lavfi 테스트 클립으로 probe/poster/grid/title/concat/splice/mix-vo
  실행, 스플라이스 결과 길이 = cutAt(1.5)+insert(2)+tail(2) ≈ 실측 5.56s 일치.
- 단가표·STYLE_GUIDE·NSFW 오탐 구문·drawtext/amix/splice 패턴은 2026-07 힉스필드 실측에서 확정.

## 테스트

```sh
npm run typecheck -w @cak/ad-video-gen
npm test -w @cak/ad-video-gen   # vitest 50개 — ffmpeg 실행 없이 순수부만
```
