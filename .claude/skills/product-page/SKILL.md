---
name: product-page
description: 키워드/상품 하나로 큐텐재팬 등록용 상세페이지 산출물(일본어 HTML+텍스트+근거·컴플라이언스 리포트)을 만든다. "/product-page 나이아신 화장품", "상세페이지 만들어줘", "큐텐 리스팅 페이지 생성"처럼 상품 상세페이지 생성이 필요할 때 사용.
---

# product-page — 큐텐재팬 상세페이지 자동 생성

키워드(예: `나이아신 화장품`) 또는 특정 상품을 받아, 리서치→카피→lint→렌더를 거쳐
`out/{slug}/` 에 등록용 산출물을 만든다. **결정적 로직은 `@cak/product-page-gen`(원자 #10) CLI**,
이 스킬은 리서치·카피 생성·사람 게이트를 오케스트레이션한다.

```
키워드 → ①리서치(검증) → ②brief.json → ③카피(doc.json) → ④lint(block 0까지)
       → ⑤물류·마진 게이트 → ⑥render → ⑦사람 승인 → (수동) J'QSM 등록
```

CLI 호출: `cd ~/workSpace/commerce-automation-kit/packages/product-page-gen && npm run cli -- <cmd> ...`

## 0. 불변 규칙 (kit 금지선 적용)

- **타사 이미지 검색·수집·재사용 절대 금지**(금지선 #1). 이미지 입력은 (a) 사용자 본인 촬영 (b) 공급사가 사용 허가한 이미지 (c) 그 둘을 원본으로 한 AI 생성(i2i, `aiLabeled=true` 필수)뿐이다.
- **사람 승인 게이트 통과 전 어떤 것도 플랫폼에 올리지 않는다**(금지선 #3·#8). v0.1 의 모듈 범위는 파일 산출까지 — J'QSM 등록은 사람이 한다.
- **검증된 claim 만 본문에 사용.** 리서치에서 출처 URL 이 확보된 주장만 `verified: true` 로 brief 에 넣고, 미검증 주장은 카피에 쓰지 않는다(경고 대상).
- 효능 카피는 **일본 약기법 안전 표현**으로만 쓴다. 아래 대체표 참조. lint block 이 남으면 render 가 거부된다(코드 게이트).

## 1. 리서치 (WebSearch/WebFetch)

1. 성분·소구점: 공식/학술/공식 브랜드 소스에서 확인, claim 당 출처 URL 기록 → `evidence.md`
2. 큐텐재팬 경쟁 확인: `https://www.qoo10.jp/gmkt.inc/Search/Default.aspx?keyword=<URL인코딩>`
   (직접 접근이 523 이면 `https://r.jina.ai/<원URL>` 경유). **브랜드 공식샵(公式)이 동일 카테고리를 팔면 경쟁 게이트 경고** — 사용자에게 보고.
3. 시세 확보 → 마진 게이트 입력값. 환율은 실시간 조회(예: `curl -s https://open.er-api.com/v6/latest/JPY`).

## 2. brief.json 작성 → `validate --brief`

`ProductPageBrief`(@cak/contracts) 형식. 이미지가 아직 없으면 `images: []` 로 두고 진행
(렌더 출력에 `{{IMAGE_SLOT:hero}}` 토큰이 남고, 등록 전 채워야 한다).

## 3. 일본어 카피 생성 (doc.json) — 약기법 안전 표현 대체표

| ❌ 쓰면 안 됨 (block) | ✅ 대체 |
|---|---|
| 治る/治療, ニキビが治る | 肌を整える / キメを整える |
| シミが消える | (メイクアップ効果で)目立たなく |
| 再生, 細胞活性化 | うるおいを与える |
| アンチエイジング, 若返り | エイジングケア(年齢に応じたお手入れ) |
| 美白 (승인 부외품 아니면) | 明るい印象に導く |
| 浸透 (무한정) | 角質層まで浸透 |
| 副作用がない/絶対安全 | パッチテスト推奨 등 사실 서술 |

섹션 구조는 8종(hero → pain-points → ingredient → selling-points → usage → full-ingredients → faq → policy).
policy 는 스토어 공통 문구 슬롯 — 상품별 하드코딩 금지.

## 4. 게이트 실행 (전부 CLI)

```bash
npm run cli -- lint --doc out/{slug}/doc.json            # exit 2 면 표현 수정 후 반복
npm run cli -- logistics --name "<상품명>" --weight <g> [--dims WxHxT]
npm run cli -- margin --sale-jpy N --wholesale-krw N --rate <실시간환율> \
  --qxpress-jpy <logistics 추정치> --scenario megawari --domestic-ship 300
```

- logistics 가 flammable(exit 2)이면 **품목 자체를 기각**하고 사용자에게 보고 (Qxpress 발송 불가).
- margin 은 **megawari 시나리오 기준으로도 pass** 해야 진행 권장 (연매출이 메가와리에 집중되는 구조).
- 도매가가 아직 없으면 margin 은 생략 가능하되 산출물에 "마진 미검증" 경고를 남긴다.

## 5. 렌더 → 사람 승인

```bash
npm run cli -- render --brief out/{slug}/brief.json --doc out/{slug}/doc.json --out out/{slug}
```

산출: `body.html`(큐텐 에디터 HTML 소스 붙여넣기용) · `body.txt`(폴백) · `lint-report.json` · `evidence.md`(스킬이 작성).
**미리보기를 사용자에게 보여주고 명시 승인을 받은 뒤에만** 등록 단계로 안내한다.
등록 시 이미지 먼저 J'QSM 업로드 → `images/*`·`{{IMAGE_SLOT:*}}` 를 실제 URL 로 치환.

## 6. 이미지 (선택)

사용자/공급사 실사가 있으면 힉스필드 MCP(i2i)로 히어로/텍스처/무드 컷 생성 가능 —
반드시 원본=사용권 있는 실사, `origin: 'ai-generated', aiLabeled: true` 로 brief 에 기록.
실물과 다르게 보이는 과장 연출(용량·질감 왜곡)은 표시광고 리스크 — 승인 게이트에서 함께 검토.

## 7. 산출 구조

```
out/{slug}/
├── brief.json        # 입력 브리프 (검증 통과본)
├── doc.json          # 카피 완성본 (lint block 0)
├── body.html         # 큐텐재팬 HTML (인라인 스타일, 스크립트 0)
├── body.txt          # 텍스트 폴백
├── lint-report.json  # 컴플라이언스 리포트 (conditional 항목 = 사람 확인 목록)
├── evidence.md       # claim 별 출처
└── images/           # 사용권 있는 이미지만
```

## 미구현 (다음 단계 후보)

- 세로 이미지 슬라이스 export(HTML→PNG, Playwright) — 이미지 중심 리스팅용
- Shopify `descriptionHtml` 어댑터(시안 v2 에서 설계 완료, 마켓 확장 시)
- J'QSM 등록 자동화 — **의도적으로 미구현**(사람 게이트 원칙, 공식 API 확인 전 착수 금지)
