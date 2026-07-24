# 백로그 — 아직 착수하지 않은 통합/작업 후보

> 결정된 계획이 아니라 **후보**를 기록하는 파일. 착수 시점에 방식을 논의하고, 착수하면 CLAUDE.md 현재 상태 표로 옮긴다.

## ai-video-agency/website 통합 (기록: 2026-07-23)

- **원본 위치**: `~/Desktop/workSpace/venture-studio/ventures/market/ai-video-agency/website`
- **내용물**(기록 시점): `copy-and-direction.md`, `index.html`, `showcase.html`, `dist/`, `media/`, `mockups/` — 정적 웹사이트(랜딩/쇼케이스)
- **상태**: 통합 의사만 있음, 방식 미정
- **착수 시 논의할 것**:
  - `packages/` 원자로 넣을지 vs 별도 앱(`apps/` 등)으로 둘지
  - 정적 사이트라 `@cak/contracts` 의존이 필요 없을 가능성 — 구조 규칙(원자 간 직접 import 금지) 적용 범위 검토
  - `media/`, `dist/` 등 대용량/빌드 산출물의 git 포함 여부(.gitignore 정책)
