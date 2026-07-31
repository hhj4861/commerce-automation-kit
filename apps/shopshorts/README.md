# apps/shopshorts — 쇼핑쇼츠 통합 운영 앱

공용 UI, 로컬 실행 서버·워커, Cloudflare Pages Functions·D1·R2 구성을 한 디렉터리에서 관리한다.
UI·상태는 클라우드에서도 사용할 수 있고, ffmpeg·TTS·클립 생성 같은 무거운 실행은 로컬 Mac 워커가 담당한다.

```
[Pages 공용 UI + Functions API + D1 큐 + R2 영상]
             ▲ 결과 업로드          │ 사람 승인·작업 요청
             └──── [worker.mjs / 로컬 Mac] ────┘
```

## 구성

- `public/index.html` — 로컬·클라우드 공용 UI
- `functions/` — Cloudflare Pages API와 인증 미들웨어
- `server.mjs` — 로컬 API와 정적 UI 서버
- `worker.mjs` — 클라우드 큐의 lint·TTS·조립 실행자
- `schema.sql` — D1 스키마
- `migrations/` — 기존 D1에 적용하는 증분 스키마
- `wrangler.toml` — Pages·D1·R2 배포 설정
- `data/` — 로컬 모드의 운영 데이터

## 로컬 실행

```bash
npm start -w @cak/app-shopshorts     # http://127.0.0.1:5178 (127.0.0.1 바인딩 — 외부 노출 없음)
```

데이터: `apps/shopshorts/data/jobs.json` (gitignore — 운영 데이터).

## Cloudflare 실행·배포

```bash
npm run cloud:dev -w @cak/app-shopshorts
npm run cloud:deploy -w @cak/app-shopshorts
```

프로젝트: `shopshorts-dash` (`https://shopshorts-dash.pages.dev`)

- D1: `shopshorts`
- R2: `shopshorts-media`
- Pages 시크릿: `SHOPSHORTS_TOKEN`
- 딥링크 사용 시: `COUPANG_ACCESS_KEY`, `COUPANG_SECRET_KEY`

로컬 워커 환경에는 `SHOPSHORTS_CLOUD_URL`과 동일한 `SHOPSHORTS_TOKEN`이 필요하다.

## 키워드 동기화

`.github/workflows/keyword-intel-sync.yml`이 매시 7분·37분에 실행되어 트렌드·블로그
키워드를 채널별로 D1에 전송한다. Mac 워커는 키워드를 전송하지 않고 영상 작업만 담당한다.

GitHub Actions 시크릿:

- `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`
- `NAVER_AD_CUSTOMER_ID`, `NAVER_AD_API_KEY`, `NAVER_AD_SECRET_KEY`
- `SHOPSHORTS_CLOUD_URL`, `SHOPSHORTS_TOKEN`
- 텔레그램 사용 시 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`

최초 배포 전 기존 D1에 마이그레이션을 적용한다.

```bash
npx wrangler d1 migrations apply shopshorts --remote
```

## 상태 흐름과 게이트

```
draft ──(게이트1: lint 재검증+사람 승인)──> script-approved ─> generated ─> assembled
      ─> review ──(게이트2: lint 재검증+사람 확인)──> published        └> rejected ─> draft
```

- **게이트 전이(승인·발행)는 서버가 그 자리에서 원자 lint 를 재실행** — 캐시된 결과를 신뢰하지 않는다.
- `review` 진입은 `outputVideo`(조립 산출물) 필수.
- **업로드는 발행 확인(사람 게이트 2)이 트리거한다** — 검수를 마친 사람이 버튼을 누르면
  로컬 워커가 shorts-publish `upload`(렌더 생략, 9:16 완성본 전용)로 upload-post 에 전송하고
  requestId·플랫폼별 결과 URL 을 잡에 기록한다. 무검수 자동 발행 경로는 없다(금지선 #3·#8 —
  모든 업로드는 사람 버튼 1회 = 저관여 + 사람 감시). 실패 시 UI 의 "업로드 재시도" 버튼으로 재요청.

## API

| 메서드 | 경로 | 무엇 |
|---|---|---|
| GET | `/api/jobs` | 전체 잡 + 상태 목록 |
| POST | `/api/jobs` | 잡 등록(draft 고정, 등록 시 lint 자동 실행) — 스킬의 입구 |
| POST | `/api/jobs/:id/transition` | `{to, note?, clipPaths?, previewVideo?, outputVideo?, publishRef?}` — 허용 전이만 |
| POST | `/api/jobs/:id/lint` | 원자 lint 재실행 + 리포트 저장 |
| POST | `/api/jobs/:id/estimate?model=` | 원자 견적 |
| GET | `/api/hot-keywords` | keyword-intel 상위 후보 3개(큐 중복 제외, 10분 캐시) + 초안 요청 목록 |
| POST | `/api/draft-requests` | `{topic, contentType, opportunity?}` — 초안 요청 큐. **contentType: shorts 활성 / ad·blog·music 예약 슬롯**(콘텐츠 유형 확장 심). Claude 세션 모니터가 감지해 대본 작성→잡 등록 |
| POST | `/api/draft-requests/:slug/done` | 초안 완료 처리(요청 제거) |
| GET | `/api/jobs/:id/video?which=preview\|final\|clipN` | 영상 스트리밍(Range 지원) — **잡에 기록된 파일만**(임의 경로 차단) |
| POST | `/api/jobs/:id/finalize` | **자막+TTS 조립**(generated→assembled, 비동기). tts-narration(#13) Claire 정렬 내레이션 + shopping-shorts assemble(자막 h-560·고지 번인) — 바쿠치올 클립과 동일 스타일/보이스. ElevenLabs 비용 발생 |

## 퍼널 (2026-07-28 확장)

```
핫 키워드(TOP3 표시) →[발행 버튼]→ 초안 요청 →(Claude 모니터: 대본 작성)→ draft
  →[기획 승인]→ (Claude 모니터: 힉스필드 클립 생성) → generated + 무자막 미리보기 링크
  →[자막+TTS 붙이기]→ (서버: Claire TTS + 조립) → assembled + 최종 영상 링크
  →[검수 요청]→ review →[발행 확인]→ published → (워커: upload-post 실제 업로드 → 결과 URL 기록)
```
LLM 이 필요한 단계(대본·클립 생성)는 Claude 세션 모니터가, 결정적 단계(TTS·조립)는 서버가 수행.

## 주의

- 서버는 127.0.0.1 바인딩(외부 노출 금지). 인증이 없으므로 절대 0.0.0.0 으로 바꾸지 말 것.
- 잡 등록은 `.claude/skills/shopping-shorts` 스킬이 기획 초안을 밀어넣는 용도. 사람이 UI 에서 승인해야 다음 단계로 간다.
