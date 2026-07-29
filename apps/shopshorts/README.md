# apps/shopshorts — 쇼핑쇼츠 운영 대시보드 (원자 조합 서비스)

`packages/`의 원자들을 조합해 쇼핑쇼츠 제작·발행 큐를 운영하는 **로컬 전용** 서비스.
원자 로직을 재구현하지 않는다 — lint/견적/조립은 전부 `@cak/shopping-shorts` CLI 를 spawn.

```
keyword-intel(#1) ─┐  (소재 신호)
스킬 shopping-shorts ─→ [이 앱: 잡 큐 + 사람 게이트] ─→ shorts-publish(#7) 업로드(사람 실행)
힉스필드(생성)     ─┘        │
                      @cak/shopping-shorts(#12): lint·고지·조립 게이트
```

## 실행

```bash
npm start -w @cak/app-shopshorts     # http://127.0.0.1:5178 (127.0.0.1 바인딩 — 외부 노출 없음)
```

데이터: `apps/shopshorts/data/jobs.json` (gitignore — 운영 데이터).

## 상태 흐름과 게이트

```
draft ──(게이트1: lint 재검증+사람 승인)──> script-approved ─> generated ─> assembled
      ─> review ──(게이트2: lint 재검증+사람 확인)──> published        └> rejected ─> draft
```

- **게이트 전이(승인·발행)는 서버가 그 자리에서 원자 lint 를 재실행** — 캐시된 결과를 신뢰하지 않는다.
- `review` 진입은 `outputVideo`(조립 산출물) 필수.
- **업로드는 이 앱이 하지 않는다** — shorts-publish CLI 로 사람이 실행하고 requestId 만 기록.
  (완전 무인화 금지 — 저관여 + 사람 감시. 금지선 #3·#8)

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
  →[검수 요청]→ review →[발행 확인]→ published (업로드는 사람이 CLI)
```
LLM 이 필요한 단계(대본·클립 생성)는 Claude 세션 모니터가, 결정적 단계(TTS·조립)는 서버가 수행.

## 주의

- 서버는 127.0.0.1 바인딩(외부 노출 금지). 인증이 없으므로 절대 0.0.0.0 으로 바꾸지 말 것.
- 잡 등록은 `.claude/skills/shopping-shorts` 스킬이 기획 초안을 밀어넣는 용도. 사람이 UI 에서 승인해야 다음 단계로 간다.
