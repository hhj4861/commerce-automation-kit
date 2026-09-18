# apps/shopshorts — 쇼핑쇼츠 통합 운영 앱

공용 UI, 로컬 실행 서버·워커, Cloudflare Pages Functions·D1·R2 구성을 한 디렉터리에서 관리한다.
UI·상태는 클라우드에서도 사용할 수 있고, ffmpeg·TTS·클립 생성 같은 무거운 실행은 로컬 Mac 워커가 담당한다.

영상의 기획 검증·프롬프트·품질 설정은 **광고 기반 공통 생성기**를 사용한다.
초안의 `videoDirection`(근거·고유성·서사)과 `videoTier`(기본 `standard`)를 받아,
승인 후 `videoGeneration.plan`을 발급한다. 로컬 서버와 클라우드 워커가 같은 CLI를 호출한다.
실제 힉스필드 호출은 이 계획을 읽는 제작 세션이 담당한다.
계획 누락/입력 변경/클립 수 불일치는 `generated` 전이를 거부한다.
[입력 예제·공통 실행 절차](../../docs/VIDEO-GENERATION.md)

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
- `video-generation.mjs` — 공통 생성기 CLI 브릿지
- `lib/video-generation.js` — 로컬/클라우드의 생성 입력 매핑·계획 신선도 검사
- `schema.sql` — D1 스키마
- `migrations/` — 기존 D1에 적용하는 증분 스키마
- `wrangler.toml` — Pages·D1·R2 배포 설정
- `data/` — 로컬 모드의 운영 데이터

## 로컬 실행

```bash
npm start -w @cak/app-shopshorts     # http://127.0.0.1:5178 (127.0.0.1 바인딩 — 외부 노출 없음)
```

데이터: `apps/shopshorts/data/jobs.json` (gitignore — 운영 데이터).
검증용 데이터 경로는 `SHOPSHORTS_DATA_DIR`, 포트는 `SHOPSHORTS_PORT`로 격리할 수 있다.

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
| POST | `/api/jobs/:id/estimate` | 공통 생성기의 videoTier 기준 참고 견적(실제 비용은 MCP 프리플라이트) |
| PUT | `/api/jobs/:id/video-direction` | `{videoDirection, videoTier?}` — 초안/반려 상태에서 공통 생성 기획 보완 |
| GET | `/api/hot-keywords` | keyword-intel 상위 후보 3개(큐 중복 제외, 10분 캐시) + 초안 요청 목록 |
| POST | `/api/draft-requests` | `{topic, contentType, opportunity?}` — 초안 요청 큐. **contentType: shorts 활성 / ad·blog·music 예약 슬롯**(콘텐츠 유형 확장 심). Claude 세션 모니터가 감지해 대본 작성→잡 등록 |
| POST | `/api/draft-requests/:slug/done` | 초안 완료 처리(요청 제거) |
| DELETE | `/api/draft-requests/:slug` | 아직 작성 전인 초안 요청 취소 |
| DELETE | `/api/jobs/:id` | 콘텐츠 작업 삭제. Cloud에서는 D1 작업과 R2 preview/final을 함께 삭제하며, 후반작업·업로드 진행 중에는 409로 거부 |
| GET | `/api/keyword-feeds/:channel?date=YYYY-MM-DD` | 최신 또는 KST 관측일별 trend/blog 스냅샷 조회 |
| GET | `/api/keyword-feed-dates` | 보관된 관측일 목록 |
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

## 소재 리서치 (트렌드 탐색 통합)

키워드 카드의 **🔎 리서치** → 현지 검색어(샤오홍슈·도우인 중국어 / TikTok 영어) 칩 + 관찰 창(실검색
팝업 420×760, 모바일은 새 탭) + 관찰 메모 → 메모가 초안 요청에 첨부되어 대본 연출 참고로 전달된다.

- 검색어 변환 캐시: D1 `keyword_research`(클라우드) / `data/keyword-research.json`(로컬) — **검색어 문자열만 저장**,
  타 플랫폼 콘텐츠 수집·다운로드 경로 없음(금지선 #1·#2).
- **변환 생성자는 Claude 세션 모니터**다: `/api/keyword-research/pending` 을 감지해 변환을 만들어
  PUT(`x-shopshorts-worker` 헤더)으로 채운다. 세션이 없으면 pending 이 유지되며 UI 는 3분 후 폴링을 멈추고
  재시도를 안내한다(무한 폴링 방지). 상위 트렌드 키워드는 미리 시드되어 즉시 뜬다.

## 영상 제작실 (2026-09-18)

대시보드의 **새 쇼츠 만들기**, 또는 `/studio`에서 시작한다.

- **자동**: 기존 `/trends`의 네이버 소재 추천·초안·기존 제작 큐를 유지한다.
- **수동**: 기획 → 시나리오 → 이미지·영상 → 편집 → 업로드. 프로젝트는 자동 큐와 별도 저장한다.
- 카테고리: 심리학, 건축학, 상품광고, 막장드라마, 역사, 과학, 직접 입력. 숏폼은 9:16/최대 180초, 롱폼은 16:9/최대 600초.
- 장면 단위 대본 편집, 이미지/영상 혼합, 직접 제작하거나 사용권이 있는 파일 등록(50MB), 드래그/키보드 버튼 순서 조절, 장면 길이, 배경음 파일·음량, Yooni/Claire/무음 선택을 지원한다.
- 브라우저 미리보기는 장면 순서를 보여준다. 선택한 음성/BGM은 **최종 영상 만들기**로 ffmpeg 결과에 반영된다. 캡컷의 모든 기능(다중 영상 레이어·전환 효과·키프레임·정밀 트리밍)을 구현한 것은 아니다.
- 대본 검수 후 생성, 최종 영상 검수 후 업로드하는 두 사람 게이트를 유지한다. 편집이 바뀌면 최종 영상을 무효화한다. 영상 원본 오디오는 제거하며 목소리 길이가 장면보다 길면 잘라내지 않고 편집을 요청한다.
- 광고 카테고리는 기존 shopping-shorts CLI의 표현 lint를 생성·조립·발행 전에 다시 호출하며 `(광고)`를 영상과 설명에 추가한다. 긴 시나리오는 기존 계약의 12비트 단위로 lint한다. 설명과 API에 AI 생성 표시를 전달한다.

### Google 로그인 / 계정 등록

`/login`에서 가입·로그인 및 OAuth 등록 상태를 확인한다. 첫 로그인도 동일한 Google 인증으로 처리하며, 별도 비밀번호를 받지 않는다. **현재 하나의 공유 운영 워크스페이스**로, 허용된 계정끼리 프로젝트를 공유한다. 불특정 사용자의 공개 가입이나 사용자별 테넌트 격리를 제공하지 않는다.

로컬은 kit `.env` 또는 프로세스 환경, Pages는 배포 환경의 secret/변수에 다음을 설정한다. 실제 비밀값은 저장소에 넣지 않는다.

```text
GOOGLE_CLIENT_ID=<웹 애플리케이션 OAuth 클라이언트>
GOOGLE_CLIENT_SECRET=<서버 비밀>
SHOPSHORTS_ORIGIN=https://shopshorts-dash.pages.dev
SHOPSHORTS_SESSION_SECRET=<무작위 32자 이상 문자열>
SHOPSHORTS_GOOGLE_ALLOWED_EMAILS=owner@example.com,editor@example.com
```

Google Cloud의 승인된 리디렉션 URI: `${SHOPSHORTS_ORIGIN}/auth/google/callback`.
로컬은 `http://127.0.0.1:5178`을 origin으로 사용할 수 있다. state·PKCE 검증, Google userinfo의 이메일 인증 여부·허용 목록 검사 후 24시간 HttpOnly/SameSite 쿠키를 발급한다. HTTPS에서는 Secure 쿠키를 사용한다. Google 토큰은 저장하지 않는다. 로그아웃은 브라우저 쿠키를 삭제하며, 허용 목록에서 제거하거나 서명 비밀을 회전하면 기존 세션을 차단한다. 기존 `SHOPSHORTS_TOKEN` 워커와 관리자 링크도 호환된다.

OAuth가 미설정인 로컬은 기존과 같이 loopback 전용 접근을 허용한다. `GOOGLE_CLIENT_ID`를 설정하면 로컬도 로그인한다. 원격은 인증 없이 접근할 수 없다. Google 로그인은 **운영 앱 인증**이며 YouTube 업로드 권한을 주지 않는다.

### 생성/편집 워커 설정

기존 자동 모드의 Seedance/힉스필드 흐름은 변경하지 않는다. 수동 모드는 서버에서 호출할 수 있는 공식 Gemini REST API를 사용한다. 모델별 계정 권한·지원 여부·과금은 공급자에서 확인해야 하며 미실측 단가를 UI에 추정 표시하지 않는다.

| 기능 | 제작 서버/워커 환경 |
|---|---|
| 대본 | `GEMINI_API_KEY`, `SHOPSHORTS_TEXT_MODEL` (기본 `gemini-2.5-flash`) |
| 이미지 | 같은 키, `SHOPSHORTS_IMAGE_MODEL` (기본 `gemini-2.5-flash-image`) |
| 영상 | 같은 키, `SHOPSHORTS_VIDEO_MODEL` (기본 `veo-3.1-generate-preview`) |
| 음성 | `ELEVENLABS_API_KEY`; 선택 보이스가 해당 계정에서 사용 가능해야 함 |
| 숏폼 업로드 | `UPLOAD_POST_API_KEY`, `UPLOAD_POST_USER`; 플랫폼 연결 완료 필요 |
| 롱폼 업로드 | `YOUTUBE_CLIENT_SECRET`, 기존 youtube-upload OAuth 인증 토큰 |

영상은 1080p/8초 클립을 생성하고 편집 시 지정 길이에 맞춰 반복/자른다. 영상 생성 요청 ID와 음성 결과를 로컬에 저장해 재시도 시 재사용한다. 실패는 프로젝트에 기록한다. 업로드는 실제 전송 직전에 `submitting` 기록을 남기고 중복 실행을 차단한다. 플랫폼 응답이 불명확하면 재전송하지 말고 플랫폼과 요청 ID를 먼저 확인한다. 접수된 Upload-Post 작업은 최대 10분까지 폴링하며, 이후 계속 처리 중이면 접수 상태와 요청 ID를 표시한다.

- 로컬 서버: 자체 제작 루프, `data/studio-projects.json`, `data/studio-media`, `data/studio-work`. 로컬 데이터 디렉터리당 서버 하나를 실행한다. 재시작 시 중단된 작업을 실패로 표시하고 자동 재과금하지 않는다.
- Pages: `migrations/0005_studio.sql`을 D1에 적용 후 UI/Functions를 배포한다. `worker.mjs`를 같은 소스로 갱신·재시작해야 수동 큐를 처리한다. D1의 `studio_projects`, R2의 `studio/` prefix를 사용한다. 기존 워커 토큰으로만 작업 claim/결과 저장/미디어 전송을 허용하고 revision CAS로 중복 처리를 막는다.
- 클라우드 워커가 강제 종료되면 실행 중 작업은 운영자가 실제 프로세스 종료와 외부 API 접수 여부를 확인한 후 복구해야 한다. 임의의 시간 초과로 유료 작업/업로드를 재실행하지 않는다.
- 검증 서버: `SHOPSHORTS_STUDIO_RUNNER=off`로 유료 작업 실행을 끌 수 있다. 운영 데이터와 분리하려면 `SHOPSHORTS_DATA_DIR`와 `SHOPSHORTS_PORT`도 지정한다.

### 검증 범위

`npm test -w @cak/app-shopshorts`는 인증 state/PKCE/허용 목록/쿠키 변조, 사람 게이트, 작업 CAS, 편집 무효화, 로컬 영속화·복구, Range 전송, **실제 ffmpeg 이미지+영상+BGM 조립**, 기존 자동 제작 회귀를 검증한다. 외부 OAuth·유료 Gemini/ElevenLabs 실호출·실계정 게시와 운영 배포는 이 테스트에 포함하지 않는다.

공식 참고: [Google 서버 OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Google userinfo](https://developers.google.com/identity/openid-connect/openid-connect), [Gemini generateContent](https://ai.google.dev/api/generate-content), [이미지 생성](https://ai.google.dev/gemini-api/docs/image-generation), [Veo 영상 생성](https://ai.google.dev/gemini-api/docs/veo), [YouTube 합성 미디어 표시](https://developers.google.com/youtube/v3/docs/videos#status.containsSyntheticMedia).
