# 핸드크림 파일럿 접수 브리프 템플릿

소싱이 끝나면 두 파일의 `REPLACE_` 자리를 채운다. 값의 출처는 **제품 라벨·공급사 제공 자료·본인 촬영**뿐이다
(타사 상세페이지·리뷰 캡처는 CLAUDE.md 금지선 #1).

| 파일 | 소비자 | 검증 명령 |
|---|---|---|
| `product-page.brief.json` | product-page-gen(상품상세, `market: naver-smartstore`, `locale: ko`) | `npm run cli -w @cak/product-page-gen -- validate --brief <path>` |
| `shorts.brief.json` | shopping-shorts(대본 lint·조립, `sponsored: true` → "(광고)" 오버레이·설명란 표기 강제) | 잡 파일(brief+script) 구성 후 `npm run cli -w @cak/shopping-shorts -- lint --job <path>` |

채울 때 주의:
- `ingredients`는 라벨의 **전성분 전체**를 순서대로. 비우면 렌더가 경고하고 자리표시자가 들어간다.
- `claims[].verified` 는 근거 URL을 확인한 뒤에만 `true`. 본문 카피에는 verified=true 만 쓴다.
- `weightG` 는 템플릿에서 뺐다. 포장 포함 실측 g 를 잰 뒤 `"weightG": 85` 처럼 추가한다(0 은 검증 실패).
- `appealPoints` 에 효능 단정(“치료·재생·미백” 등)을 넣지 않는다. lint 가 block 한다.
