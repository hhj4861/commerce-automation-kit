# apps/firstframe — FIRSTFRAME 광고 쇼케이스 사이트

AI 제작 광고영상을 모아 보여주는 정적 쇼케이스. **이 앱은 콘텐츠(HTML·데이터·미디어)와
설정만 가지며, 모든 조작 로직은 `@cak/showcase-site` 원자가 담당한다.**

- 공개 URL: https://firstframe-showcase.pages.dev (Cloudflare Pages, 프로젝트 `firstframe-showcase`)
- 원본 출처: `~/Desktop/workSpace/venture-studio/ventures/market/ai-video-agency/website`
  — 이관 기간 동안 양쪽 동일 기능 유지, **최종적으로 venture-studio 쪽은 삭제 예정**(이 앱이 단일 소스가 된다).

## 파일 구조

| 파일 | 역할 |
|---|---|
| `works.json` | **단일 진실 소스** — 광고 케이스 데이터. 직접 편집하거나 CLI `add` 로 추가 |
| `works.js` | works.json 에서 **생성**됨(`gen`). 직접 편집 금지 |
| `showcase.html` | 사이트 본체 (EN/KO 토글, works.js 로드) |
| `media/` | 영상·포스터. **git에 커밋함**(단일 소스 보존 목적) — 커질 경우 R2/LFS 이전 검토 |
| `site.config.json` | 배포 대상·경로 설정 (`ShowcaseSiteConfig` 계약) |
| `.cf-token` | Cloudflare API 토큰 (**gitignore됨** — 절대 커밋 금지) |
| `dist/` | 빌드 산출물 (gitignore됨) |

## 사용법 (앱 디렉토리에서)

```bash
npm run validate   # works.json 검증 + 미디어 존재 확인
npm run gen        # works.json → works.js 생성
npm run build      # dist/ 재빌드
npm run deploy     # Cloudflare Pages 배포
npm run sync       # validate+gen+build+deploy 한 번에
```

새 광고 추가는 `@cak/showcase-site` CLI 의 `add`/`add-media`, 영상 후반작업은
`@cak/ad-video-gen` CLI 를 사용한다 (각 패키지 README 참조).
