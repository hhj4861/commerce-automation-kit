# @cak/product-page-gen — 원자 #10

키워드/상품 브리프 → 큐텐재팬 등록용 상세페이지 산출물. 결정적 파트 전담:

| 모듈 | 역할 |
|---|---|
| `core/lint` | 일본 약기법(22규칙)·한국 화장품법(11규칙)·물류 키워드(2규칙) 표현 lint. block 존재 시 렌더 거부 |
| `core/logistics` | Qxpress 인화성 게이트 · Economy(1kg·A4·2.5cm) 적격 판정 · 부피무게 · 요율 추정(2023-08판, TODO(D1) 현행 재확인) |
| `core/margin` | 검증된 수수료 구조(평시 12% / 메가와리 23.5%+광고)로 마진 시뮬레이션. 기본 통과 문턱 15% |
| `core/render` | ProductPageDoc → 톤 3종(clean-derma/premium-amber/vivid-pop) 인라인 스타일 HTML + 텍스트 폴백. AI 이미지 미표기·briefId 불일치 시 렌더 거부 |

카피 생성·리서치·사람 게이트 오케스트레이션은 `.claude/skills/product-page`.
계약: `@cak/contracts` `product-page.ts` (ProductPageBrief/Doc, ComplianceReport, LogisticsCheck, MarginInput/Result).

```bash
npm run cli -- validate  --brief brief.json
npm run cli -- lint      --doc doc.json            # exit 0 통과 / 2 block
npm run cli -- logistics --name "BBクリーム" --weight 100 --dims 15x8x4
npm run cli -- margin    --sale-jpy 4089 --wholesale-krw 12100 --rate 8.94 --qxpress-jpy 675 --scenario megawari --domestic-ship 300
npm run cli -- render    --brief brief.json --doc doc.json --out out/slug
```

수치 근거: `venture-studio/ventures/market/shopee-yeokjikgu/platform-selection-2026-07-26.md` (2026-07-26 교차검증).
테스트 49개 (`npm test`).
