# apps/shopshorts-cloud — 쇼핑쇼츠 클라우드 대시보드 (Pages + D1 + R2)

"UI·상태는 클라우드, 실행은 로컬 Mac" 하이브리드 — Vercel식 고정 무료 도메인(`shopshorts-dash.pages.dev`)으로
어디서든 접속·조작하고, 무거운 작업(ffmpeg·TTS·클립 생성)은 로컬 워커가 큐를 집어가 수행한다.

```
[Pages(UI) + Functions(API) + D1(큐=단일 진실 소스) + R2(영상)]
      ▲ 결과 업로드/상태 갱신                 │ 승인·요청(사람 게이트)
[Mac: worker.mjs(결정적 작업) + Claude 세션(대본·클립 생성)]     [휴대폰/어디서든]
```

## 구성

- `functions/_middleware.js` — 전 경로 토큰 인증(?token= 1회 → 쿠키 30일 / 워커는 Bearer)
- `functions/api/[[path]].js` — 잡 CRUD·전이 화이트리스트·finalize 요청·R2 영상 스트리밍(Range)/업로드·초안요청·핫키워드·워커 하트비트
- `schema.sql` — D1 스키마(jobs/draft_requests/hot_keywords/meta)
- `public/` — 대시보드 UI(로컬판 이식 + 워커 온라인 배지 + finalize 요청 방식)
- 로컬 워커: `apps/shopshorts/worker.mjs` (`npm run worker -w @cak/app-shopshorts`)

## 게이트 의미 유지 (금지선 #3·#8)

- 승인·발행 전이는 사람 버튼 → Functions 가 전이 규칙 강제
- lint 는 클라우드에서 못 돌므로 **워커가 승인 직후 검증, 위반 시 draft 자동 반려+사유** — 우회 불가
- 발행 검수(review) 진입은 최종 영상 업로드 필수. 업로드 자체는 여전히 사람이 CLI 로

## 배포 절차 (1회)

```bash
export CLOUDFLARE_API_TOKEN=...   # Pages+D1+R2 Edit 권한
npx wrangler d1 create shopshorts          # → database_id 를 wrangler.toml 에 반영
npx wrangler r2 bucket create shopshorts-media
npx wrangler d1 execute shopshorts --remote --file=schema.sql
npx wrangler pages project create shopshorts-dash --production-branch=main
npx wrangler pages deploy public           # (이 디렉토리에서)
npx wrangler pages secret put SHOPSHORTS_TOKEN --project-name=shopshorts-dash
# .env 에 SHOPSHORTS_CLOUD_URL=https://shopshorts-dash.pages.dev 추가 후:
npm run worker -w @cak/app-shopshorts
```

## 트레이드오프

- Mac 이 꺼지면: 조회·승인은 가능(큐에 대기), 실행은 워커 복귀 후 — UI 에 워커 온라인/오프라인 표시
- 클립 로컬 경로(clipPaths)는 Mac 파일 기준 — 워커와 같은 머신이어야 조립 가능
