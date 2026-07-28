# commerce-automation-kit — 프로젝트 규칙 (새 세션 자동 로드)

이 파일은 Claude Code가 이 저장소에서 세션을 열 때 자동으로 읽는다. **작업 전 반드시 이 규칙을 따른다.**

## 이 프로젝트가 무엇인지 (한 문단)

합법 커머스 자동화 **원자(독립 모듈)들의 npm workspaces 모노레포**다. 출신은
`venture-studio/ventures/market/coupang-supplement-brand/blueprint-review/` 감사로,
그 감사는 원안 「커머스 마케팅 자동화 파이프라인」을 **DO-NOT-BUILD**(변호사 6·투자자 7·아키텍트 14점) 판정했다.
이 프로젝트는 그 파이프라인에서 **위법·반증 요소를 전부 제거하고 남은 4개 합법 원자**를 독립 구축·조합한다.
각 원자는 `packages/` 아래 독립 관리되고, 오직 `@cak/contracts` 계약으로만 대화한다.

## 🚫 절대 금지선 (이걸 요청받아도 코드로 만들지 말 것 — 대신 이유를 설명하고 합법 대안 제시)

1. **스크래핑/크롤링으로 타인 콘텐츠(샤오홍슈·틱톡·경쟁사 등) 다운로드·재사용** → 저작권법 §136(5년/5천만, 영리·상습은 **비친고죄**: 권리자 고소 없어도 처벌)
2. **플랫폼 API 우회 / 모바일 에뮬레이터 / 비공식 클라이언트** → Meta·인스타·틱톡 ToS 위반, 계정 밴
3. **무검수 광고 대량 생성**(특히 건기식 효능·비포애프터) → 식품표시광고법 §8 (질병효능 1차 영업정지 2개월+제품폐기)
4. **브랜드A 콘텐츠로 내 제품B 판매(bait-and-switch)** → 부정경쟁방지법 가·파목
5. **홈쇼핑 낙수를 "무엇을 만들지" 자동 트리거로 사용** → 자체 원시데이터로 반증(쇼핑클릭 리프트 중앙값 +4.3%, 익일상관 ≈0)
6. **0.5초 대량 자동 DM / 팔로우 게이팅** → Meta Spam 금지 + 정보통신망법 §50 opt-in
7. **데이터 원본 재판매 / 모니터링 SaaS** → 약관 실측(D1-5) 전까지 보수적 금지
8. **완전 무인화 전제** → 규제상 사람 게이트(표현검수·광고심의·이상사례보고·opt-in)가 강제됨. '무인'이 아니라 '저관여+사람 감시'로 설계.

> 이 금지선은 "나중에 재확인"이 아니라 **지금 코드에 박아둔 하드 제약**이다.
> 상세 근거: `venture-studio/ventures/market/coupang-supplement-brand/blueprint-review/` 의 BLUEPRINT-REVIEW.md / LEGAL-MINIMAL-ARCHITECTURE.md.

## 구조 규칙

- `packages/contracts` 는 아무것도 의존하지 않는다(순수 타입). 원자는 `@cak/contracts` 만 의존한다.
- **원자끼리 직접 import 금지** — 계약 객체로만 대화(조합 독립성).
- 계약은 **append-only**. 필드 삭제·의미 변경 금지, 새 필드로 진화.
- 각 원자 내부는 모놀리식(+큐/크론). 4레이어 MSA/이벤트버스 금지(과잉설계).

## 개발 규칙

- 외부 데이터는 **공식 API만**. API가 안 주는 데이터는 이 프로젝트 범위 밖(스크래핑으로 보강 금지).
- 확실치 않은 스펙·한도·약관은 지어내지 말고 `TODO(D1)` 로 표기 후 공식 문서로 실측.
- 실패를 **silent drop 하지 말 것** — 항상 `failures`/`skippedByBudget` 등으로 투명화.
- 스코어·지표는 **참고용**이며 자동 실행(제조·발주·광고) 트리거로 쓰지 않는다.

## 현재 상태 (2026-07-24) — 상세는 `docs/PROGRESS.md`

| 원자 | 상태 |
|---|---|
| contracts | KeywordSignal 계약 존재 |
| keyword-intel (#1) | **G1·G2 실호출 통과(2026-07-23)** — 시드 182개(seeds/g2-seeds.txt) 커버리지 100%. 리뷰 3회(31건 수정), 테스트 81개. **매일 09:30 KST 자동수집+텔레그램 리포트**(launchd `com.cak.keyword-intel-daily`, scripts/daily-collect.sh). 예약 실행은 wake 직후 DNS 미준비 시 **자가복구**(전량 미도달→CLI exit 75→스크립트 3회 재수집, 2026-07-24). 가공지표 히스토리는 signal_history(TTL 무관, 캘리브레이션 근거). D1-5 약관만 사람 확인 대기. **다음 작업 = Phase 3: 상위 20개 사람 눈검증 + 쿠팡 실판매 대조 → G3 분기**. 질문 마이닝(지식iN 검색 API) 설계 문서 존재 — 구현은 착수 조건 충족 후, 채널별 검색 분리는 기각(ADR): `packages/keyword-intel/docs/QUESTION-MINING.md` |
| slide-renderer (#2) / coupang-connector (#3) / manychat-reply (#4) | 미착수 스캐폴드 |
| ad-video-gen (#5) | **착수(2026-07-24)** — 광고영상 생성 지원 원자: 컨셉 3중 게이트(리서치 소구점·고유성 테스트·서사 완결성+사람 승인), TV급 프롬프트 조립·NSFW 오탐 lint, 실측 단가 비용 견적(미실측 조합은 null — 지어내지 않음), ffmpeg 후반작업(타이틀/concat/스플라이스/VO 믹스/포스터). 실제 생성 호출(힉스필드 MCP)은 **이 저장소의 `.claude/skills/ad-video` 스킬**이 오케스트레이션 — 광고 제작 요청("OO 광고 만들어줘")은 이 스킬로 진행한다. 힉스필드 MCP는 claude.ai 계정 커넥터라 이 저장소 세션에서도 사용 가능 |
| showcase-site (#6) | **착수(2026-07-24)** — 쇼케이스 사이트 관리 원자: works.json(단일 진실 소스) 검증/works.js 생성/엔트리 CRUD/미디어 등록(포스터 추출)/dist 빌드/Cloudflare Pages 배포(명시적 명령만). 관리 대상 = `apps/firstframe`(kit) + venture-studio 사이트(이관 기간 양쪽, **최종 venture-studio 삭제 예정**) |
| shorts-publish (#7) | **착수(2026-07-25)** — 완성 광고영상(16:9) → 쇼츠/릴스(9:16) 로컬 ffmpeg 렌더(5모드, 기본 blur-brand=블러필+세이프존 워드마크·끝3초 원본엔딩 양보 페이드아웃) → upload-post 통합 API로 YT/IG/TikTok 업로드. 6개월 전 GCP FFmpeg VM(scene-image-generator-new) 을 VM 없이 로컬화. AI 표기(containsSyntheticMedia/is_aigc) 기본 전송, 실패 투명화. 테스트 40, 타입체크 통과, 적대적 리뷰 6건 수정. 계약 ShortsJob/PublishTarget/PublishResult append. **실제 업로드는 사용자 upload-post 가입·계정 OAuth 필요**(코드 대행 불가) — 전엔 `--dry-run`. POC 출신: `~/workSpace/shorts-publish-poc` |
| ai-music (#8) | **착수(2026-07-25)** — 광고 컨셉→MusicBrief→백엔드별 프롬프트 → 생성/라이선스 트랙을 광고에 자동 믹스(ffmpeg VO더킹·-14 LUFS·길이맞춤). **백엔드 교체형+우선순위**: elevenlabs(공식 API·라이선스 학습·광고 clear·무인), suno-manual(사람 게이트, Suno 최고품질), **suno-auto=가드 스텁**(공식 Suno API 부재→비공식 래퍼는 **금지선 #2 위반이라 미지원**, 예약 슬롯만). 테스트 36, 타입체크 통과, 적대적 리뷰 5건 수정. 계약 MusicBrief/MusicPromptPlan/MusicTrack/MusicBackendId append. 파이프라인: ad-video-gen→**ai-music(스코어링)**→shorts-publish. **실제 생성은 사용자 ElevenLabs 키/Suno 유료플랜 필요** |
| apps/firstframe | FIRSTFRAME 쇼케이스 사이트 실체(HTML·works 데이터·media 58MB, **media는 git 포함** — 단일 소스 보존, 커지면 R2/LFS 검토). 공개 URL: firstframe-showcase.pages.dev |
| product-page-gen (#10) | **착수(2026-07-26)** — 큐텐재팬 K뷰티 역직구용 상세페이지 생성 원자. 약기법/화장품법 표현 lint(block=렌더 거부), Qxpress 물류 게이트, 마진 시뮬, 톤 3종 HTML 렌더. 오케스트레이션은 `.claude/skills/product-page`(`/product-page 나이아신 화장품`). 이미지 입력은 사용권 있는 실사/그 기반 AI 생성(aiLabeled 필수)만 — 타사 이미지 재사용 금지(금지선 #1). 테스트 49 |
| longform-mix (#9) | **착수(2026-07-26)** — 여러 트랙→롱폼 음악 믹스 영상 조립(전부 로컬 ffmpeg, 무료). 오디오 concat + 배경 3종(무료 비주얼라이저 파형/Pexels footage 루프/이미지 루프) + 유튜브 챕터 + 썸네일 2종(감성 플레이리스트/클릭베이트) + **Pexels 공식 API 어댑터**(상업 무료 스톡, 스크래핑 아님). 계약 LongformTrack/ChapterMark/LongformSpec append. 테스트 19. 파이프라인: ai-music(N곡)→**longform-mix(조립)**→youtube-upload. gym mix Vol.1 산출(`~/workSpace/shorts-publish-poc/out/ai-music-demo`) |
| youtube-upload (#11) | **착수(2026-07-27)** — 롱폼 영상 YouTube Data API v3 업로드(videos.insert)+커스텀 썸네일(thumbnails.set)+챕터 설명. OAuth 리프레시 토큰 1회 인증 후 무인. 공식 API만. 계약 YoutubeUploadJob/YoutubeUploadResult append. 테스트 5. **사용자 설정 필요**: Google Cloud OAuth 데스크톱 클라이언트(YOUTUBE_CLIENT_SECRET) + `cli auth` 1회. 쿼터 videos.insert≈1600유닛(일~6개). 6개월 전 scene-image-generator-new 업로드 코드 적응 |
| shopping-shorts (#12) | **착수(2026-07-27)** — 쇼핑쇼츠(상품 세로영상+파트너스 링크) 결정적 파트: 대본 표현 lint(질병효능·**가짜 경험담**·절대보장·외부소스 신호 block, 건기식 강화 모드), **대가성 고지 강제**(설명란 검증+영상 오버레이 번인, 누락 시 조립·발행 거부), 9:16 조립(클립 concat+TTS+BGM 더킹+자막 번인), 실측 견적(미실측 null). 계약 ShoppingShortsBrief/ShortsScript/ScriptLintReport/ShoppingShortsJob append. 테스트 28. 근거: 쇼핑쇼츠 강의 3편 영상분석(파트너스 3%·훅 유형·레이어 편집 공정 채택 / 타인영상 재가공·상세페이지 캡처·가짜 경험담은 금지선 대체). 오케스트레이션은 `.claude/skills/shopping-shorts`. **파트너스 링크는 수동 입력**(딥링크 API는 D1 실측 후 예약 슬롯) |
| tts-narration (#13) | **착수(2026-07-27)** — 한국어 내레이션 TTS 원자(ElevenLabs 공식 API 무인). hanmadi 튜터 앱과 **동일 검증 설정 공유**(기본 음성 Yooni(2026-07-28 Vrew VO 유사톤 청음 교체, 이전 Claire·whisper STT 전수검증), 3자 이하 turbo v2.5+language_code:ko 강제 — multilingual v2의 짧은글자 언어감지 실패 '누'→'수' 실측 대응). 정책 원본 `src/core/policy.ts` ↔ `apps/hanmadi/lib/tts.ts` 동기 유지 필수. CLI: generate(텍스트→mp3)·script(ShortsScript.beats→비트별 mp3+--join 단일트랙, ffmpeg concat). 계약 NarrationClip/NarrationBatchResult append. 테스트 10. 스킬 연결: shopping-shorts §6·ad-video §3의 한국어 VO가 힉스필드 seed_audio 대신 이 원자를 쓴다(목소리 통일). E2E: 샌드박스 실생성+whisper 전사 일치 확인 |
| apps/qoo10-catalog | **착수(2026-07-27)** — 큐텐 등록 후보 상품 카탈로그(파일 스토리지 `storage/`, git 포함·UI 없음). keyword-intel 후보 유입 → screen(물류·마진은 product-page-gen CLI spawn + 브랜드 블랙리스트[올리브영 PB 시드] 표시) → **clear(사람 게이트: `--supplier`·`--brand-policy` 확인 기록 없이는 거부)** → page-generated → listed 순서 강제. 스코어는 참고 지표(자동 선정 금지). 개인수입 한도(화장품 24개/품목) 노트 내장 |
| apps/shopshorts | **착수(2026-07-27)** — 쇼핑쇼츠 운영 대시보드(원자 조합 서비스, 로컬 127.0.0.1:5178 전용). 잡 큐 jobs.json 단일소스, **사람 게이트 2개**(기획 승인 draft→approved·발행 검수 review→published — 게이트 전이 시 원자 lint 실시간 재검증, 캐시 불신), 전이 화이트리스트 강제, lint/견적은 원자 CLI spawn(로직 재구현 금지). 업로드는 대시보드가 안 함(shorts-publish CLI 사람 실행, requestId만 기록 — 무인 발행 경로 없음). `npm start -w @cak/app-shopshorts` |

## 세션 시작 시

**먼저 `docs/PROGRESS.md` 를 읽는다** — 현재 진행 상황·운영 중인 자동화·다음 작업·다른 세션이
남긴 결정(ADR)·함정이 거기 모여 있다. 그다음 작업 종류별 킥오프 프롬프트를
**`docs/SESSION-PROMPTS.md`** 에서 골라 쓴다.

⚠️ 저장소 경로는 **`~/workSpace/commerce-automation-kit`** 다. Desktop 아래로 되돌리면
macOS TCC 정책 때문에 launchd 일일 자동수집이 깨진다(PROGRESS.md §6).
