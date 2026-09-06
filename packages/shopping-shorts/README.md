# @cak/shopping-shorts (원자 #12)

**쇼핑쇼츠**(상품 소개 세로영상 + 제휴 링크) 파이프라인의 **결정적 구간**을 담당하는 원자.

| 구간 | 담당 |
|---|---|
| 소재(상품) 신호 | keyword-intel(#1) |
| 대본·클립 생성(힉스필드) | `.claude/skills/shopping-shorts` 스킬 |
| **대본 표현 lint · 고지 강제 · 9:16 조립 · 비용 견적** | **이 원자** |
| 업로드(YT/IG/TikTok) | shorts-publish(#7) |
| 운영 큐·사람 게이트 UI | apps/shopshorts |

## 설계 근거 (2026-07-27, 쇼핑쇼츠 강의 3편 실측 분석)

유통되는 쇼핑쇼츠 공정(강의 3편 분석)에서 **채택한 것**: 훅 유형 라이브러리, 자막>영상>내레이션
레이어 구조, 씬 단위 편집, 파트너스 수익화. **금지선 때문에 대체한 것**:

1. 타인 영상 재가공(강의 3 공정) → **전량 힉스필드 자체 생성** (금지선 #1, lint `external-source`가 차단)
2. 상세페이지 이미지 무단 캡처(강의 2 공정) → 자체 생성 이미지만. 파트너스 API 이미지는 약관 실측(D1) 후
3. 가짜 경험담 훅("N년 써보니") → **정보성·데모 프레임** (lint `fake-experience`가 차단)
4. 무검수 대량 발행 → **사람 게이트 2개**(기획 승인 `script-approved`, 발행 검수 `review`) — lint 는 게이트를 대체하지 않는다

## 하드 게이트

- **lint block → 조립 거부** (`assemble`이 lint 를 먼저 실행, 우회 경로 없음)
- **제휴 링크 있음 + 설명란 고지 누락 → block** (`disclosure-missing`)
- **제휴 링크 있음 → 영상 내 고지 오버레이 강제 번인** (assemble 이 자동 적용)

## CLI

```bash
npm run cli -w @cak/shopping-shorts -- lint --job job.json
npm run cli -w @cak/shopping-shorts -- disclosure --text "..." [--append]
npm run cli -w @cak/shopping-shorts -- estimate --job job.json --model kling3_0-pro [--no-tts]
npm run cli -w @cak/shopping-shorts -- assemble --job job.json \
  --clips hook.mp4,body1.mp4,cta.mp4 --out short.mp4 \
  [--narration vo.mp3] [--music bgm.mp3] [--font /System/Library/Fonts/AppleSDGothicNeo.ttc]
npm run cli -w @cak/shopping-shorts -- probe --in short.mp4
```

`job.json` = `{ brief: ShoppingShortsBrief, script: ShortsScript }` (`@cak/contracts`).

## 구조 (kit 규약)

```
src/core/      lint.ts(표현 검증) · disclosure.ts(고지) · ffargs.ts(9:16 조립 인자) · estimate.ts(실측 견적)
src/adapters/  ffmpeg.ts(spawn·probe) · schemas.ts(zod)
src/obs/       logger.ts
src/cli/       index.ts (lint | disclosure | estimate | assemble | probe)
```

## 주의

- 파트너스 딥링크 API 어댑터는 **예약 슬롯** — 가입·키 발급 + 약관 실측(D1) 전엔 만들지 않는다.
  링크는 사용자가 파트너스에서 발급해 `brief.affiliateUrl` 에 수동 입력.
- 비용 견적은 실측 단가만 사용 — 미실측 모델은 `null` (get_cost 프리플라이트로 실측 후 추가).
- 영상 속 상품 ≠ 링크 상품 불일치는 코드로 확정 판정 불가 → `product-mismatch-risk` 경고 +
  발행 검수(사람)에서 확인.

## score — 생성 전 효율 참고 점수 (2026-09-06)

```bash
npm run cli -- score --jobs a.json,b.json,c.json
```

대본 구조 규칙 점수(0~100, 9차원: 훅 움직임·훅 길이·훅 밀도·10초 페이오프·내레이션 밀도·자막 가독성·브랜딩 시점·CTA·길이).
Google ABCD+Shorts 권장을 번역한 것으로 **참고용**이다. block 하지 않으며 자동 선정에 쓰지 않는다. 감점 사유를 대본에 반영하는 용도. 계약 `ScriptScoreReport`.
