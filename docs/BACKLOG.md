# 백로그 — 아직 착수하지 않은 통합/작업 후보

> 결정된 계획이 아니라 **후보**를 기록하는 파일. 착수 시점에 방식을 논의하고, 착수하면 CLAUDE.md 현재 상태 표로 옮긴다.

## ai-video-agency/website 통합 (기록: 2026-07-23 → **착수: 2026-07-24**)

- **원본 위치**: `~/Desktop/workSpace/venture-studio/ventures/market/ai-video-agency/website`
- **상태**: ✅ 착수 — 미정이던 3가지 전부 결정(사용자 확정):
  - **구조**: 로직은 `packages/` 원자 2개(`@cak/ad-video-gen` #5, `@cak/showcase-site` #6), 사이트 실체는 **`apps/firstframe`** (workspaces에 `apps/*` 추가). 각 모듈 독립 빌드·원자 간 직접 import 없음 — 계약(`AdConcept`/`AdVideoJob`/`Showcase*`)으로만 연결.
  - **contracts 적용 범위**: 사이트 앱은 콘텐츠+`site.config.json` 만 가짐(코드 없음). 로직 원자들이 계약을 소유.
  - **대용량 asset**: `media/`(58MB)는 **git 포함**(단일 소스 보존 — venture-studio 쪽 최종 삭제 예정이라 유실 방지). `dist/`·`.cf-token` 은 gitignore. 용량 커지면 R2/LFS 이전 검토.
- **이관 정책**: 이관 기간 동안 venture-studio 사이트와 **양쪽 동일 기능**(showcase-site CLI가 `--site` 로 양쪽 관리, 단일 진실 소스 works.json + works.js 생성 방식으로 양쪽 통일). **최종적으로 venture-studio 쪽 삭제 → kit이 단일 소스.**
- 랜딩 구버전 `index.html`·`mockups/`·기획 md는 kit로 이관하지 않음(쇼케이스 제품 산출물만 이관).
