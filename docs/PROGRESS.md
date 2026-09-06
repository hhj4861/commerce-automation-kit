# PROGRESS — 작업 진행 기록 & 세션 인계

> **이 파일의 목적:** 새 IDE/새 Claude 세션이 이 문서 하나만 읽고 곧바로 이어서 작업할 수 있게 한다.
> 설계 근거는 각 문서에, **"지금 어디까지 왔고 다음에 뭘 하나"는 여기에** 기록한다.
> 최종 갱신: **2026-09-04**

---

## 0. 새 세션 시작하기 (먼저 이것부터)

```bash
cd ~/workSpace/commerce-automation-kit   # ⚠️ 경로 변경됨 (아래 §6 참조)
npm install                              # 최초 1회
cd packages/keyword-intel && npm test     # 128개 통과하면 정상(2026-09-04 기준)
```

읽는 순서: `CLAUDE.md`(금지선·규칙) → **이 파일**(현황) → 작업할 원자의 `docs/`.
작업 종류별 킥오프 프롬프트는 `docs/SESSION-PROMPTS.md`.

> ⚠️ **이 프로젝트는 여러 Claude 세션이 병렬로 작업해 왔다.** 아래 §9에 다른 세션 산출물을
> 정리해 뒀다. 착수 전 반드시 훑을 것 — 이미 내려진 설계 결정(ADR)과 기각된 선택지가 있다.

---

## 1. 현재 상태 한눈에

| 원자 | 상태 |
|---|---|
| **contracts** | `KeywordSignal` / `IntelBatch` 계약 확정. append-only 유지 중 |
| **meta-paid-reach (PoC)** | ✅ **착수(09-04)** — Meta 공식 Marketing API Campaign→Ad Set→Video→Creative→Ad 경로. 기본 dry-run, 실제 생성도 전량 PAUSED, 사람 승인+라이브 이중잠금+하드 예산 상한. impressions/spend/status 폴링 후 1,000회 또는 지출 상한에서 Campaign 우선 PAUSE. 설정/권한 가이드와 단위 테스트 포함. **실계정 호출·과금은 아직 미수행**. 테스트 18·타입체크. 브랜치 `feat/meta-paid-reach-poc`(develop 병합 `2a77a55`). **다음** = `packages/meta-paid-reach/README.md` 「검증 순서」 2~4(preflight→CREATE_PAUSED→Ads Manager 사람 검수) |
| **keyword-intel (#1)** | ✅ **Phase 1·2 완료 + G1·G2 실호출 통과 + 일일 자동화 가동 중**. 남은 것: Phase 3(사람 판단) |
| slide-renderer (#2) | 미착수 스캐폴드 |
| coupang-connector (#3) | 미착수 스캐폴드 |
| manychat-reply (#4) | 미착수 스캐폴드 |
| ad-video-gen (#5) | ✅ 착수(07-24) — 컨셉 게이트·프롬프트·비용·ffmpeg 후반. 실제 생성은 `.claude/skills/ad-video` 스킬 |
| showcase-site (#6) | ✅ 착수(07-24) — works.json 단일소스·CRUD·CF Pages 배포. `apps/firstframe` 관리 |
| shorts-publish (#7) | ✅ **착수(07-25) + 실계정 첫 업로드 성공(07-28)** — 광고영상(16:9)→쇼츠(9:16) 로컬 ffmpeg 렌더(기본 blur-brand)→upload-post 통합 업로드. 테스트 42·타입체크. **실측(07-28)**: 프로필 `commerce_account`(YT=BetterrShop·IG=ttangkong_pom)로 바쿠치올 쇼츠 YT+IG 동시 업로드·비동기 poll 스키마 검증 완료. 결함 수정: 인스타는 global description 무시·`instagram_title`이 캡션 전문(문서 실측) → description 있으면 `instagram_title=제목+설명` 전송(제휴 링크·대가성 고지 탈락 방지). 파트너스 링크 영상은 shopping-shorts 고지 번인+lint 선행 필수 |
| ai-music (#8) | ✅ **착수(07-25)** — 컨셉→음악 브리프→프롬프트→트랙을 광고에 믹스(더킹·-14 LUFS). 백엔드 교체형: elevenlabs(공식 API·광고 clear), suno-manual(사람 게이트), suno-auto(가드 스텁—공식 API 부재, 비공식 미지원). 테스트 24·타입체크. 실생성은 ElevenLabs 키/Suno 유료 필요 |
| shopping-shorts (#12) | ✅ **착수(07-27)** — 쇼핑쇼츠 결정적 파트(대본 lint·고지 강제·9:16 조립·실측 견적). 테스트 28·타입체크·CLI/대시보드 E2E 스모크 통과. 근거: 쇼핑쇼츠 강의 3편 영상분석 — 채택(훅 유형·레이어 편집·파트너스 3%)/금지선 대체(타인영상 재가공→전량 자체생성, 상세페이지 캡처→금지, 가짜 경험담→lint block). 스킬 `.claude/skills/shopping-shorts` + `apps/shopshorts` 대시보드(사람 게이트 2개, 127.0.0.1 전용)와 3축 구성. 파트너스 딥링크 API는 D1 실측 후 예약 슬롯 |
| product-page-gen (#10) | ✅ **착수(07-26) + 적대적 리뷰 3렌즈 반영 완료** — 키워드→큐텐재팬 상세페이지(일본어 HTML+텍스트+컴플라이언스 리포트). 결정적 파트: 약기법 23규칙+화장품법 14규칙 lint(NFKC 정규화·면책문구 프리패스·혼합스크립트 방어, block 시 렌더 거부), Qxpress 물류 게이트(인화성·Economy 규격 회전 판정·부피무게 하한 추정·2023-08 요율 TODO(D1)), 마진 시뮬(평시 12%/메가와리 27.5%, 음수·enum 검증, 표시-판정 일치), 톤 3종 렌더(src escape·locale 무결성). **리뷰 실측 결함 24건 수정**(critical 2: gauges lint 우회·img src 주입 / major 8 / minor 14) — 게이트 우회 경로 전부 폐쇄, render 게이트가 brief.productName·전성분까지 lint. 테스트 67·타입체크·E2E 스모크 통과. 카피·리서치·사람 게이트는 `.claude/skills/product-page` 스킬. 근거: venture-studio `shopee-yeokjikgu/platform-selection-2026-07-26.md`. J'QSM 등록 자동화는 의도적 미구현(사람 게이트) |
| longform-mix (#9) | ✅ **착수(07-26)** — N트랙→롱폼 음악믹스 영상(무료 ffmpeg). 배경 3종(비주얼라이저/footage/이미지)·챕터·썸네일 2종(감성/클릭베이트)·Pexels 공식 API. 테스트 19. gym mix Vol.1 산출 |
| youtube-upload (#11) | ✅ **착수(07-27) + comment 명령(07-28)** — 롱폼 YouTube Data API 업로드(videos.insert+썸네일+챕터) + **댓글 작성**(commentThreads.insert, 쇼츠 파트너스 링크 노출용 — 제휴 링크 댓글은 대가성 고지 없으면 거부). OAuth 리프레시 토큰 무인. 테스트 16. **force-ssl 스코프 추가로 구 토큰은 comment 사용 전 `auth` 재인증 1회 필요**(채널 선택 함정: BetterrShop=「모두의 상품」). 댓글 고정은 API 미지원(수동) |

**keyword-intel 게이트 현황**

| 게이트 | 상태 | 근거 |
|---|---|---|
| D1 (스펙 실측) | ✅ D1-1~4·D1-6 확정 / ❌ **D1-5(약관)·D1-7~10 대기** | `packages/keyword-intel/docs/IMPLEMENTATION.md` §0, `.claude/agents/d1-researcher.md` |
| G1 (10키워드 E2E) | ✅ 실호출 통과 (2026-07-23) | 10/10 신호, 원장 정확, zod 실응답 일치 |
| G2 (무누락 대량수집) | ✅ 실수집 통과 (2026-07-23) | 시드 182개 커버리지 100%, 실패 0 |
| G3 (유용성 판정) | ⬜ **다음 작업 — 사람 게이트** | 아래 §5 |

---

## 2. 무엇이 돌아가고 있나 (운영 중)

```
launchd  com.cak.keyword-intel-daily   매일 09:30 KST
  └─ packages/keyword-intel/scripts/daily-collect.sh
       ├─ DNS 준비 대기(getaddrinfo 연속2회+3초타임아웃, 최대~5분)  ← wake 직후 미준비 대응
       ├─ collect --file seeds/g2-seeds.txt     ← 182키워드, 예산게이트·재시도·DLQ 보호
       │    └ 전량 미도달이면 CLI exit 75 → 60초 후 최대 3회 재수집(자가복구)
       └─ report                                ← 텔레그램 다이제스트(전량실패 시 🚨 배너)
```

- **로그**: `packages/keyword-intel/data/daily.log` (5MB 로테이션)
- **DB**: `packages/keyword-intel/data/intel.db` (schema v3)
- **텔레그램**: 봇 `@cak_keyword_intel_bot` — 토큰·chat_id 는 `.env` (gitignore 됨)
- **끄기**: `launchctl unload ~/Library/LaunchAgents/com.cak.keyword-intel-daily.plist`
- **수동 실행**: `bash scripts/daily-collect.sh` 또는 개별 `npm run collect/report`

### CLI 명령

```bash
npm run collect -- "루테인,콜라겐"          # 키워드 직접 지정
npm run collect -- --file seeds/g2-seeds.txt # 시드 파일(줄당 1개, # 주석 허용)
npm run analyze -- --top 20                  # opportunity 상위 N (참고 지표)
npm run dlq                                  # 반복실패 격리 현황
npm run dlq -- clear [키워드]                # 격리 즉시 해제
npm run report -- --dry-run                  # 다이제스트 미리보기(전송 안 함)
npm run report -- --setup                    # 텔레그램 chat_id 탐색
```

---

## 3. 코드 지도 (keyword-intel)

```
src/
├── adapters/     naver-client.ts(NAVER_LIMITS 상수 단일소스) · schemas.ts(zod) · telegram.ts
├── core/         analyzer.ts(순수 스코어 로직) · time.ts(KST 날짜 단일 정의)
├── store/        db.ts(마이그레이션) · signals.ts(영속화·TTL·조회) · dlq.ts
├── budget/       ledger.ts(일일 예산 영속 원장 — 한도 우회 방지의 핵심)
├── obs/          logger.ts(stderr JSON) · retry.ts(백오프) · alerts.ts
└── cli/          collect.ts(오케스트레이션) · report.ts(다이제스트) · index.ts(진입점)
```

**DB 스키마 (v3)** — `runs` / `signals` / `call_ledger` / `dlq` / `signal_history`

> ⚠️ **`signals` vs `signal_history` 구분이 중요하다.**
> `signals` = 원본성 데이터(시계열·가격분포) → 약관 TTL(`compliance.cacheTtlHours`)로 만료·삭제.
> `signal_history` = **자체 가공 지표만**(스코어·집계 수치) → TTL 무관 장기 보관.
> 이 분리가 없으면 TTL 24h × 일일 수집에서 전일 스냅샷이 항상 purge 되어
> Δ(전일 대비)와 G3 캘리브레이션 근거가 구조적으로 소멸한다. LEGAL-BOUNDARY 경계 2의
> "원본 재판매 vs 자체 가공 인사이트" 구분을 저장 구조에 반영한 것이기도 하다.

---

## 4. 실전에서 배운 것 (재발 방지 — 코드에 박혀 있음)

목킹 테스트로는 안 잡히고 **실호출에서만 드러난** 것들. 회귀 테스트로 고정돼 있으니 되돌리지 말 것.

| 발견 | 대응 |
|---|---|
| 초당 429 스로틀 빈발(errorCode 012) | 백오프 재시도. **일일 429와 상태코드가 같아** 구분 불가 → 예산 원장으로 판별 |
| datalab **ECONNRESET 38건** — 죽은 keep-alive 소켓 재사용 | `tunedNaverAgent`(유휴 1초 + 타임아웃) + 네트워크 오류 재시도 |
| **ENOTFOUND 182건 전량 실패** (wake 직후 DNS 미준비, 2026-07-24) | ①DNS 코드 재시도 추가 ②**서버 미도달 실패는 예산 환불**(`ledger.release`) ③스크립트 네트워크 대기 |
| 타임아웃 15초가 과도 → datalab 24건 즉시 실패 (2026-07-24) | 30초로 완화 + **`UND_ERR_HEADERS_TIMEOUT`을 재시도 목록에 추가**(누락돼 있어 재시도가 안 됐음) |
| `EHOSTUNREACH`/`ENETUNREACH` 누락 (수정 리뷰에서 발견) | ENOTFOUND의 wake-time 형제 코드인데 재시도·환불 집합 양쪽에 없었음 → `UNREACHABLE_NET_CODES`에 추가 |
| 실패 호출도 쿼터를 소비 | callsSpent 는 **"시도 시점" 계상**. 단 서버 미도달은 환불(위) |
| 401/5xx 같은 전역 오류가 키워드별 DLQ로 오귀속 | DLQ는 **키워드 귀속 실패(HTTP 400)만** 계상 |
| DLQ 격리가 영구화(리셋 경로 도달 불가) | 쿨다운(24h) 후 자동 재시도 + `dlq clear` 명령 |
| 상대 `DB_PATH`가 cwd 기준 → 원장 분열 → 한도 초과 위험 | 패키지 루트 기준 해석 |
| **예약 실행이 09:37 wake DNS 로 182건 전량 실패했는데 CLI 가 exit 0** → 스크립트가 재시도 못함(하루 유실, 사람 수동복구). 2026-07-24 재발 | ①준비 프로브 nc→**Node getaddrinfo 연속2회+타임아웃**(nc 도 getaddrinfo라 경로차이 아님, 단발 타이밍이 문제였음) ②전량 미도달 시 CLI **exit 75(EX_TEMPFAIL)** ③스크립트가 **75일 때만** 60초 후 최대 3회 재수집(exit 1 크래시·저장실패는 재시도 안 함=쿼터 보호) ④다이제스트 🚨 전량실패 배너 |
| 미도달 판정을 사람 메시지 부분매칭으로 하면 **연결타임아웃을 놓친다**(undici `UND_ERR_CONNECT_TIMEOUT` 은 message 에 코드가 없고 err.code 에만 있음, 적대적 리뷰 발견) | 실패 reason 을 **`[코드] 메시지`** 로 태깅 — 환불(spend 의 err.code)과 자가복구 판정이 동일 소스를 읽게. 스킵(예산·DLQ)은 판정에서 제외(격리 1건이 전체 자가복구를 막지 않게) |
| **부분 미도달은 self-heal 사각지대**(2026-07-28 실측: DNS flap 으로 28/182 ENOTFOUND, 신호>0이라 exit 0 → 재시도 안 됨 → 그 28개 하루치 유실). exit 75 자가복구는 **전량** 미도달만 커버 | `collectSignals` 메인 패스 뒤·`saveBatch` 앞에 **부분 재수집(recover)** 추가 — `UNREACHABLE_NET_CODES`(환불된 미도달)만 골라 delay 후 재수집, 기본 2패스×15s. **성공분 쿼터 재소비 없음**(미도달만 대상=quota-safe), 같은 run 병합이라 리포트 정합 유지. 2패스 후에도 남으면 wholesale(exit 75)로 승계. 테스트 3종(부분복구·미도달만대상·전량승계) |

**리뷰 방식:** 각 단계마다 3렌즈(정확성·금지선·테스트공백) 리뷰 → 발견별 반증 검증 워크플로를 돌렸다.
누적 31건+ 확정 수정. 새 기능 추가 시 같은 방식 권장.

---

## 5. 다음 작업 — Phase 3 (G3, 사람 게이트)

**코드 작업이 아니라 사람 판단이 필요한 단계다.** 통과 조건: "스코어가 사람 판단과 일치".

1. 매일 아침 텔레그램 리포트(또는 `npm run analyze -- --top 20`)를 보고
   상위 키워드에 **"실제로 해볼 만한가"** 판정을 기록
2. 상위권 키워드를 쿠팡에서 검색해 **실판매 깊이**(리뷰 수·로켓 여부)와 대조
3. 결과로 스코어 가중치·`confidence` 상한(현재 v0 0.7 고정) 캘리브레이션
4. **G3 분기**: 일치 → 원자 #1 완성(다음 원자/조합으로) / 괴리 → 스코어 재설계 또는 목적 축소

> 며칠치 `signal_history` 가 쌓여야 Δ·모멘텀이 의미를 갖는다. 첫 데이터: 2026-07-23.
> 관측된 계절성 주의: 7월 수집에서 건기식 트렌드 전반이 음수 모멘텀(비수기),
> "각질 필링" 트렌드 100(여름 피크) — 캘리브레이션 시 계절 보정 검토 대상.

### 논의된 확장 후보 (미착수)

- **블로그 축 추가**: 현재 지표는 "상품 판매 기회"에 최적화돼 있고 **블로그/콘텐츠 최적화가 아니다**.
  같은 검색 API의 `/v1/search/blog.json`으로 문서 경쟁도를 얹으면 "콘텐츠 기회" 스코어 산출 가능.
  🚨 **선행 필수**: 검색 API 25,000/일은 쇼핑·블로그·지식iN **공유 쿼터**다. 현재 `BudgetLedger`는
  소스별 독립 clamp라 shop 20,000 + blog 20,000 = 40,000 > 25,000 이 통과해버린다.
  **`BudgetLedger` 쿼터 그룹 + 그룹 합산 clamp를 먼저 구현할 것**
  (`packages/keyword-intel/docs/QUESTION-MINING.md` §6·§10에 "다른 무엇보다 먼저"로 명시됨).
- **지식iN 질문 마이닝**: 설계 완료·구현 0 → `docs/QUESTION-MINING.md`. **착수 조건: G3 통과 후**
  (지금 병목은 소재가 아니라 검증이라는 판단). 채널별/마켓별 모듈 분리는 **ADR로 기각**돼 있으니
  분리를 다시 제안하기 전에 그 문서의 재검토 트리거를 확인할 것.
- **데이터랩 쇼핑인사이트**(D1-4 스펙 확정 완료, 어댑터 미구현) — 별도 1,000/일 예산 분리 필요.
- 그 외 통합 후보는 `docs/BACKLOG.md`.

---

## 6. 함정 & 주의사항

1. **경로가 바뀌었다**: `~/Desktop/workSpace/...` → **`~/workSpace/commerce-automation-kit`**.
   이유: macOS TCC 정책이 launchd 백그라운드 작업의 Desktop 접근을 차단해 자동수집이 불가능했다
   (`Operation not permitted`, exit 126). Desktop 아래로 되돌리면 자동화가 다시 깨진다.
   `docs/BACKLOG.md` 등 일부 문서에 남은 옛 경로 표기는 참고용.
2. **비밀정보**: `.env`(퍼미션 600, gitignore)에 네이버 키·텔레그램 토큰이 있다.
   `.env.example` 에는 절대 실값을 넣지 말 것(과거 1회 유입 → 스크럽함).
   토큰이 노출됐다고 판단되면 네이버 개발자센터 "재발급" / BotFather `/revoke` 로 교체.
3. **한도 우회 금지**: 다중 계정·프록시로 일일 한도를 넘기지 않는다(LEGAL-BOUNDARY 경계 4).
   예산은 env·생성자 **양쪽에서** 공식 한도(25,000/1,000)로 clamp 된다 — 이 방어를 풀지 말 것.
4. **스코어는 참고 지표**: opportunity 로 제조·발주·광고를 **자동 실행하지 않는다**(경계 5).
   `analyze`·리포트 출력에 이 문구가 박혀 있다.
5. **⚠️ 플래그 키워드**: `seeds/g2-seeds.txt` 주석에 표시된 10개는 수집은 합법이나
   **콘텐츠·광고화 시 사람 게이트 필수**(식품표시광고법 §8 / 화장품법 표현 / NMN 원료적법성).
6. **git**: 초기 커밋 존재(`820af63`, 2026-07-24 14:44 KST). 워킹트리 clean. `.gitignore` 는
   `.env`·`data/`·`*.db`·`node_modules/`·`.idea/` 를 무시한다(2026-07-24 검증). ⚠️ 이후 이 세션이
   자가복구 수정으로 6개 파일을 변경했다(미커밋). 다음 커밋 대상.

---

## 7. 미해결 항목

| # | 항목 | 성격 | 비고 |
|---|---|---|---|
| 1 | **D1-5 약관 실측** | 사람 작업 | `developers.naver.com/products/terms` 자동 접근 전 경로 차단. 로그인 브라우저로 제7·8·11조 + 검색 특약 2.1 확인 필요. **비차단**: 확정 전까지 보수적 기본값(`resaleRestricted=true`, TTL 24h)이 안전한 쪽이라 Phase 1~3 진행에 지장 없음. 데이터 판매/SaaS를 검토할 때 반드시 선행 |
| 2 | 한도 리셋 시각 | TODO(D1) | 공식 미명시 → KST 자정 가정. `core/time.ts` |
| 3 | 트렌드 미확보 2건 | 정상 | "비타민C 발포정"·"유산균 분말 스틱" — 데이터랩에 데이터 자체가 없는 롱테일. 계약대로 `latest:null` 투명 표현 |
| 4 | 머신 종료 시 그날 수집 누락 | 구조적 한계 | launchd `StartCalendarInterval` 특성. 잠자기는 wake 시 실행됨. 다이제스트가 "오늘 수집 없음" 경고 표시 |
| 5 | ~~git 커밋 0개~~ ✅해결(2026-07-24) | — | 초기 커밋 `820af63` 존재, 워킹트리 clean. (단 이 세션 자가복구 수정 6파일 미커밋 — 다음 커밋 대상) |
| 6 | ~~README §1·§5 stale~~ ✅오정정(2026-07-24) | — | 재검증 결과 README 는 이미 "Phase 1·2 완료·G1·G2 통과·다음 Phase 3" 로 최신. 이 stale 지적 자체가 낡았던 것 |
| 7 | ~~`.idea/` 미ignore~~ ✅해결(2026-07-24) | — | `.idea/` 는 .gitignore 14줄에 있음, 커밋에 IDE 파일 0개 |
| 8 | `BudgetLedger` 쿼터 그룹 미구현 | 확장 선행조건 | 검색 API 공유 쿼터(25,000) 합산 clamp 부재 → 블로그·지식iN 소스 추가 전 필수 (§5) |
| 9 | D1-7~10 실측 대기 | 사람/조사 | Reddit 상업승인 · 네이버 검색광고 API · YouTube Data API · Google Ads Keyword Planner. 해외 소스 착수 시 선행 |
| 10 | meta-paid-reach Graph API 버전 | TODO(D1) | 기본 `v26.0`(`.env.example`·`meta-client.ts`)은 2026-09-04 이전 세션의 "최신" 판단. 실계정 호출 전 앱 대시보드 지원 버전으로 재확인, `META_GRAPH_API_VERSION`으로 고정 |
| 11 | meta-paid-reach 예산 단위·통화 | 사람 작업(부분 확정) | 공식 통화표 확인(2026-09-04): **KRW offset=1, USD offset=100**. KRW 계정이면 `lifetimeBudgetMinorUnits`와 `pauseAtSpendAccountCurrency` 모두 원 단위(15000=15,000원). 실제 계정 통화는 `preflight`로 확인 뒤 사람 검수. 상세 `packages/meta-paid-reach/docs/SETUP-GUIDE.md` 4-1 |
| 12 | meta-paid-reach 무과금 실계정 검증 경로 | TODO(D1) | Meta Sandbox 광고계정(광고 미송출)은 Meta for Developers 공식 게시물(2023)로 존재 확인 — 앱 대시보드 Marketing API→Tools→Sandbox Ad Account Management. 공식 문서 페이지는 2026-09-04 자동 접근 404 → 로그인 브라우저에서 메뉴 존재·영상 업로드·Insights 동작 확인 필요. SETUP-GUIDE.md 마지막 절 |
| 13 | YouTube 유료 노출 자동화 — Google Ads API 개발자 토큰 등급 | TODO(D1) | 새 토큰은 Test 등급(테스트 계정 전용). Explorer 자동 승격(실계정 일 2,880 작업) 또는 Basic 신청(2026-07부터 브랜드 인증 시 수시간 검토) 필요. 관리자 계정(MCC)에서 발급. 자동화 원자 착수 전 등급 확인 |
| 14 | 쿠팡 파트너스 링크를 유료 광고 랜딩으로 사용 | TODO(D1) | 파트너스 약관의 유료 광고 조건 + Google Ads 브리지 페이지/리디렉션 정책 미확인. 이번 설계는 파트너스 링크를 쓰지 않아 해당 없음(`docs/YOUTUBE-SHORTS-1000-VIEWS-E2E-TEST.md` §6) |
| 15 | Shorts 단독 동영상 조회 캠페인(VVC) 저장 가능 여부 | TODO(D1) | 공식 문서가 "Shorts ads only VVC"를 언급(입찰 추천 부정확 경고)하나 화면에서 인스트림·인피드 해제 저장이 되는지 미확인. 1회차 집행 때 확인 |
| 16 | 스마트스토어 화장품 단순유통 추가 서류·스마트에디터 HTML 입력 | 사람 확인 | 네이버 도메인 자동 접근 불가. 판매자센터 화면에서 확인 후 `docs/HANDCREAM-PILOT-CHECKLIST.md` §6 갱신 |

---

## 9. 다른 세션이 남긴 산출물 (착수 전 필독)

이 저장소는 최소 3개 Claude 세션이 병렬로 작업했다. **아래는 이번 세션이 만들지 않은 것들**이며,
이미 내려진 결정·제약이 들어 있다.

| 파일 | 무엇 | 새 세션이 알아야 할 핵심 |
|---|---|---|
| `.claude/agents/d1-researcher.md` | **커스텀 서브에이전트**(D1 실측 전담) | 새 API·약관 확인이 필요하면 이 에이전트를 쓴다. 규율: 공식 1차 원문+원어 인용 있을 때만 ✅, **2패스 독립 재확인** 필수, 미확인 값은 코드 상수로 커밋 금지(`TODO(D1-n)`). D1-1~10 현황표가 여기 있다 |
| `docs/ARCHITECTURE.md` | **모노레포 전체** 조합 원리 | 의존 규칙(원자끼리 직접 import 금지, 계약 append-only), **사람 게이트 표**(규제상 자동화 불가 지점), 절대 금지선 6개, "MSA 아닌 모놀리식+큐/크론" 결정. 설계 원칙은 무인화가 아니라 **"저관여 + 사람 감시"** |
| `packages/keyword-intel/docs/QUESTION-MINING.md` | 지식iN 질문 마이닝 **설계(구현 0)** | **ADR 주의**: 채널별(광고/블로그/쇼츠)·마켓별 모듈 분리는 **기각**됨(재검토 트리거 명시). Google PAA/SerpAPI는 **금지·재론 불가**. 착수 조건 = **G3 통과 후**. 선행 = BudgetLedger 쿼터 그룹. wp-auto-blog 브릿지는 단방향 JSON export만, **D1-5 확정 전 질문 원문 verbatim 게시 금지**(재표현 게이트) |
| `docs/BACKLOG.md` | 통합 후보 기록 | ai-video-agency/website 통합 — **착수됨(2026-07-24)**: 원자 #5/#6 + `apps/firstframe`. 결정사항(구조·media git 포함·이관 정책)은 BACKLOG 항목 참조 |
| `packages/{slide-renderer,coupang-connector,manychat-reply}/README.md` | 미착수 3원자의 **유지조건·금지선** | 코드는 0, 제약만 박혀 있다. 착수 전 반드시 읽을 것 — 예: slide-renderer는 **입력이 자체촬영·라이선스 소스여야** 원자로 성립(스크래핑 입력이면 위법 스크래퍼), coupang-connector는 **파트너스/셀러 모드 혼용 금지**, manychat-reply는 **팔로우 게이팅 금지**(Meta Spam) |
| `tsconfig.base.json` | 매우 엄격한 TS 설정 | `noUncheckedIndexedAccess`·`exactOptionalPropertyTypes`·`verbatimModuleSyntax` 켜짐. 새 패키지는 이걸 extends |
| `~/.claude/projects/.../memory/` | 프로젝트 메모리 | `naver-devcenter-access.md`(접근 기법), `ai-video-agency-website-integration.md`. **경로 이중화로 옛 경로 키에도 중복 존재** |
| `packages/meta-paid-reach/` | **Meta 1,000회 유료 노출 PoC 원자**(다른 에이전트 세션 산출, 2026-09-04) | 안전장치 11개는 README §안전장치가 단일 원본. **`.env` 자동 로드 없음**(셸 export 필요). 상태 파일 `*.paid-reach-state.json`은 gitignore(광고 객체 ID·성과 스냅샷, 토큰 미기록). 중지 완료 상태파일 `run` 재실행 거부. 라이브 `run`은 프로세스 유지 필요(비정상 종료 시 Meta 측 lifetime_budget/end_time이 마지막 방어선) |

> **병렬 세션 주의**: 다른 세션이 같은 파일을 동시에 수정할 수 있다. 큰 변경 전 `git status`
> (커밋이 생긴 뒤에는 `git diff`)로 예상 밖 변경이 없는지 확인할 것.

---

## 8. 변경 이력

| 날짜 | 내용 |
|---|---|
| 2026-07-23 | D1 실측(D1-1~4 확정) · Phase 1(zod 검증·상수 확정) · Phase 2(store/budget/obs·analyze/dlq CLI) · G1·G2 실호출 통과 · 시드 182개 확정 · 일일 자동화+텔레그램 리포트 구축 · 리뷰 3회 31건 수정 |
| 2026-07-24 | 저장소 경로 이동(TCC 대응) · 첫 자동실행 DNS 실패 진단 → 결함 4건 수정(DNS 재시도·**예산 환불**·네트워크 대기·타임아웃 완화+재시도코드 보강) · 다른 세션 산출물 조사·통합 · 이 문서 작성 |
| 2026-07-24 (2세션) | PROGRESS 실측 검증(테스트·git·자동화·문서 드리프트) → **09:37 예약 실행 재발** 분석: 분류 결함은 이미 커밋돼 있었고 남은 갭 = **자가복구 부재**. 준비 프로브 getaddrinfo 연속2회+타임아웃, 전량 미도달 CLI **exit 75**, 스크립트 75-한정 3회 재수집, 다이제스트 🚨 배너, 실패 reason `[코드]` 태그화(연결타임아웃 누락 수정). 적대적 검증 2회로 자체 수정의 오탐 2건 발견·수정. 회귀 테스트 +10(71→81). 문서 드리프트 정정(git 커밋·`.idea`·README·테스트수) |
| 2026-07-24 (3세션) | **원자 #5/#6 착수** — ai-video-agency/website 통합(BACKLOG 항목 해소). 계약 `AdConcept`/`AdVideoJob`(ad-video-job.ts)·`ShowcaseEntry`/`ShowcaseSiteConfig`/`ShowcaseDeployReport`(showcase-entry.ts) append. workspaces에 `apps/*` 추가, `apps/firstframe`(쇼케이스 실체+media 58MB git 포함, `.cf-token` gitignore) 이관. `@cak/ad-video-gen`(컨셉 게이트·프롬프트·비용·ffmpeg 후반) + `@cak/showcase-site`(works.json 단일소스·works.js 생성·빌드·CF Pages 배포) 구현. 이관 기간 venture-studio 사이트와 양쪽 동일 기능(`--site`), 최종 venture-studio 삭제 예정. 힉스필드 MCP 생성 호출은 venture-studio의 `ad-video` 스킬이 오케스트레이션(스킬↔원자 CLI 연동) |
| 2026-07-27 (쇼핑쇼츠 세션) | **원자 #12 shopping-shorts + apps/shopshorts + 스킬 착수** — 쇼핑쇼츠 강의 3편(머니로드 6.6억 사례·조팀장 클로드+힉스필드 자동화·AI머니업클래스 CapCut 편집) 장면단위 영상분석으로 공정 도출. 채택: 훅 유형 5종·자막>영상>내레이션 레이어·파트너스 3% 수익화·데이터랩→쿠팡 검증(=keyword-intel 재사용). **금지선 대체 3건**: 타인영상 재가공→전량 힉스필드 자체생성(lint external-source block), 상세페이지 이미지 캡처→금지(파트너스 API 이미지는 D1 후 재검토), 가짜 경험담 훅→lint fake-experience block. 계약 shopping-shorts.ts append. 원자: lint(NFKC 정규화, 건기식 강화 모드)·고지 강제(설명란+영상 오버레이, 우회 경로 없음)·9:16 조립(ffmpeg)·실측 견적(kling pro 1.75cr/s 2점 검증). 대시보드: 전이 화이트리스트+게이트 전이 시 lint 실시간 재검증, 업로드는 사람 실행. 테스트 28·타입체크·E2E 스모크(등록→게이트→견적) 통과 |
| 2026-07-27 (큐텐 실전) | **큐텐 셀러 승인 완료 → 첫 테스트 산출물 + 상품 카탈로그 축 구축**. ① product-page 스킬 첫 실전 가동: 나이아신아마이드 세럼 테스트 상세페이지(약기법 lint 0건·물류 648엔·마진 2,190엔↑ 통과, AI 히어로 이미지 aiLabeled) — J'QSM엔 "판매중지(비공개)"로만 등록(샘플 데이터 실판매 금지). Qoo10 검색 봇차단·r.jina.ai 401 → 경쟁확인은 로그인 브라우저 필요. ② **apps/qoo10-catalog**: 등록 후보 카탈로그(파일 스토리지 storage/, git 포함) — keyword-intel 후보 유입→screen(물류·마진 spawn+브랜드 블랙리스트[올리브영 PB 시드] 표시)→**clear는 공급처·병행판매정책 확인 기록 강제**(사람 게이트)→page-generated→listed 순서 강제. 실측 결함 수정: NFKD 정규화가 한글 슬러그를 자모 분해로 소멸시킴→NFC. 올리브영 관련 법적 정리: 사진 무단사용 불가(본인 촬영으로 대체), 진정상품 역직구는 조건부 가능(개인수입 24개/품목, PB·독점총판 회피) |
| 2026-07-27 (TTS 통일 세션) | **원자 #13 tts-narration 착수** — kit 한국어 내레이션을 hanmadi와 동일한 검증 TTS로 통일(Claire 원어민 음성, 짧은글자 turbo v2.5+ko 강제). 발단: hanmadi /trial '누'→'수' 발음 버그 → 원인 2겹(언어 자동감지 실패+영어화자 억양) → 보이스 3종 whisper STT 전수검증으로 Claire 채택. 원자화: generate/script CLI(비트별 mp3+ffmpeg join), NarrationClip 계약, 테스트 10, 정책 hanmadi lib/tts.ts와 동기 유지 규약. 스킬 교체: shopping-shorts §6·ad-video §3 한국어 VO를 힉스필드 seed_audio→이 원자로. hanmadi 편입 여파 로컬 빌드 수정(자체 node_modules 독립, npm install --workspaces=false) |
| 2026-07-29 (클라우드 전환) | **apps/shopshorts 통합 클라우드 구성 가동** — 공용 UI·로컬 서버/워커·Cloudflare Functions/D1/R2를 단일 앱에서 관리한다(기존 `apps/shopshorts-cloud`는 통합 후 제거). 대시보드는 Cloudflare Pages(고정 무료 도메인 shopshorts-dash.pages.dev)+D1(큐 단일 진실 소스)+R2(영상), 실행은 로컬 워커(apps/shopshorts/worker.mjs) 하이브리드: lint 검증(승인 직후, 위반 시 자동 반려)·finalize(Yooni TTS+동기 조립→R2 업로드)·핫키워드 push(30분)·하트비트(UI 워커 온라인 배지). 사람 게이트는 Functions 전이 화이트리스트+lintChecked/최종영상/자리표시자 링크 서버 강제. **배포 전 적대적 리뷰 워크플로(26 에이전트)로 확정 결함 22건(치명 3: 발행 데드엔드·반려잡 과금 조립·lint 게이트 우회) 수정 후 배포**. 클립 생성(힉스필드)·대본 작성은 Claude 세션 모니터가 클라우드 큐 폴링. 로컬 서버는 개발·로컬 운영 모드로 유지한다. 터널 방식은 폐기(회사망 QUIC 차단·URL 유동) |
| 2026-08-04 (소재 리서치) | **트렌드 탐색에 소재 리서치 통합** — 키워드 카드 🔎 → 현지 검색어(샤오홍슈·도우인·TikTok) 변환 칩·관찰 창(실검색 팝업, 임베드는 플랫폼 차단이라 불가)·관찰 메모→초안 첨부(대본 연출 참고). 변환 캐시 D1 keyword_research(검색어 문자열만 — 콘텐츠 수집 경로 없음), 생성자=Claude 세션 모니터(pending 감지), 상위 키워드 사전 시드. 적대적 리뷰 25건 확정(치명: 12초 자동갱신이 패널·메모 파기) 전부 수정 — 재렌더 상태복원·폴링 상한/이탈 가드·경쟁 조건 seq 가드·실패 시 메모 보존·stored XSS escape·로컬 server.mjs 패리티. **운영 사고**: keyword-intel sync CI(30분 주기)가 네이버 DataLab 일일 쿼터 소진 → CI 연쇄 실패+로컬 09:30 수집 전멸+피드 공백. 조치: CI 스케줄 중단(`gh workflow enable "keyword-intel sync"` 로 재개), 피드는 7/31 아카이브로 복구. **주기 재설계 결정 대기**(추천: CI 하루 2회) |
| 2026-09-04 (Meta PoC) | **원자 #14 meta-paid-reach 착수** — 「Meta 공식 광고로 상품 콘텐츠 최소 1,000회 유료 노출」 PoC. Campaign→Ad Set→Video→Creative→Ad 생성(전량 PAUSED, 기본 dry-run), impressions/spend/status 폴링, 1,000회 또는 지출 상한에서 Campaign부터 자동 PAUSE, 라이브 집행 3중 잠금(확인 문구+환경변수 2개+Ad Set 하드 상한)+활성화 직전 원격 재검증. 계약 paid-reach.ts append. 테스트 18·타입체크. **실계정 호출·과금 0회**. 브랜치 정리: 모든 로컬·원격 브랜치를 develop에 병합·푸시(`2a77a55`), 이후 `feat/meta-paid-reach-poc` 분기. 문서 동기화(CLAUDE.md 상태표·이 문서 §1/§7/§9·SESSION-PROMPTS §6) |
| 2026-09-05~06 (유료 노출 플랫폼·지표 재정의) | 사용자 질의 "릴스 말고 유튜브 쇼츠 먼저?" → 자산은 YouTube가 유리(BetterrShop·OAuth·9:16 파이프라인), Google Ads API는 개발자 토큰 등급 관문(§7 #13). **지표 정정(09-06)**: 상품 약속은 노출이 아니라 **쇼츠 조회수 1,000**이며 테스트 대상은 「상품정보→상품상세+쇼츠→유료 광고→조회수 1,000」 파이프라인 전체. 공식 확인: Shorts는 동영상 조회(VVC) 캠페인 멀티포맷에서 구매, 과금 조회=10초 이상 시청, **광고 조회는 공개 조회수에 포함**, 총예산 최소 3일·초과 청구 없음. 설계서 `docs/YOUTUBE-SHORTS-1000-VIEWS-E2E-TEST.md`(파이프라인 10단계 담당 원자·갭·실측표·결정사항). 갭: 접수 브리프 템플릿, 한국어 상품상세(product-page-gen 계약에 ko 로케일은 있으나 렌더 실물 미확인), 의뢰 콘텐츠 "(광고)" 오버레이 강제, Meta PoC 조회 지표. 쇼케이스 데모 영상은 광고 권리 문제로 소재 제외 |
| 2026-09-06 (1회차 종목 선정) | 시장 **한국 확정**. keyword-intel 09-06 수집분(182 시드)으로 28일·7일 모멘텀+쇼핑 모멘텀+시즌·비주얼 가산, 광고 리스크 키워드 제외 → **추천 1회차 핸드크림(+109%/28일, 자체 최고점, 건조 시즌), 2회차 립마스크**. 건기식(아쉬와간다 +237% 등)은 식품표시광고법 게이트로 3회차 이후. 한계: 상대지수 키워드 간 비교 불가, 절대 검색량 미저장, 쇼핑 경쟁 필드 0(수집 점검 필요). 상세 `docs/YOUTUBE-SHORTS-1000-VIEWS-E2E-TEST.md` §5-1. 다음 = 종목의 실제 상품·권리 확보(파일럿 셀러 or 본인 소싱) |
| 2026-09-06 (핸드크림 파일럿 착수) | 결정: **본인 소싱 핸드크림 → 스마트스토어 등록, 랜딩=스마트스토어 상품 페이지**. 코드(TDD): 계약 `PageMarket` += `naver-smartstore`, product-page-gen 스키마·ko 전성분 자리표시자(테스트 69); 계약 `ShoppingShortsBrief.sponsored` append, `overlaySpecFor` 단일 판단으로 조립 두 경로 "(광고)" 오버레이, lint `disclosure-missing` sponsored 확장(테스트 42). 전체 489→497 통과·타입체크. 문서: `docs/HANDCREAM-PILOT-CHECKLIST.md`(공식 확인: 등록 완제품 단순 소매는 화장품책임판매업 등록 불요, 통신판매업 신고 필요), 접수 템플릿 `docs/templates/handcream-pilot/`. 미확인: 스마트스토어 화장품 카테고리 추가 서류, 스마트에디터 HTML 입력(→ 이미지 변환 경로) |
