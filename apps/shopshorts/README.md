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
| POST | `/api/jobs/:id/transition` | `{to, note?, clipPaths?, outputVideo?, publishRef?}` — 허용 전이만 |
| POST | `/api/jobs/:id/lint` | 원자 lint 재실행 + 리포트 저장 |
| POST | `/api/jobs/:id/estimate?model=` | 원자 견적 |

## 주의

- 서버는 127.0.0.1 바인딩(외부 노출 금지). 인증이 없으므로 절대 0.0.0.0 으로 바꾸지 말 것.
- 잡 등록은 `.claude/skills/shopping-shorts` 스킬이 기획 초안을 밀어넣는 용도. 사람이 UI 에서 승인해야 다음 단계로 간다.
