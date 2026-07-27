# apps/qoo10-catalog — 큐텐 등록 후보 상품 카탈로그 (파일 스토리지)

"문제 없는 상품을 미리 선별해 두고, 그 목록 기반으로 상세페이지 생성·등록"을 위한
**별도 스토리지 디렉토리**. UI 없음 — CLI + `storage/` JSON 파일(git 포함, 세션 간 인계).

```
후보 유입(keyword-intel / 수동) → screen(자동: 물류·마진·브랜드 리스크)
  → clear(사람 게이트: 공급처·병행판매 정책 확인 기록 강제)
  → /product-page 로 상세페이지 생성 → mark page-generated → J'QSM 등록 → mark listed
```

## 상태 흐름

`candidate → screened → cleared → page-generated → listed` (+`rejected`)

- **screen(자동)**: ① 브랜드 리스크 목록 대조(`blacklist-brands.json` — 올리브영 PB 등, 사람 관리) ② Qxpress 물류 게이트(인화성이면 clear 불가) ③ 마진 시뮬(도매가·판매가·환율 주어지면). 전부 `@cak/product-page-gen` CLI spawn — 로직 재구현 없음.
- **clear(사람 게이트)**: `--supplier`(공급처)·`--brand-policy`(병행판매 정책 확인 내용) **없이는 실행 자체가 거부**된다. "문제없음" 판정의 책임 소재를 기록으로 남기는 장치.
- **mark**: cleared → page-generated → listed 순서 강제(게이트 우회 금지).

## CLI

```bash
CAT="npm run --silent cli -w @cak/app-qoo10-catalog --"
$CAT import-keywords --top 20                 # keyword-intel 상위 후보 유입(스코어=참고)
$CAT add --name "나이아신 세럼" --brand "OOO" --weight 120 --dims 12x4x4 --wholesale-krw 4500
$CAT screen [--id <id>] [--sale-jpy 2190 --rate 8.92]   # id 생략 시 candidate 전체
$CAT clear --id <id> --supplier "OO도매" --brand-policy "총판 아님·병행 제한 없음 확인(날짜)"
$CAT mark --id <id> --status page-generated --ref "packages/product-page-gen/out/<slug>"
$CAT mark --id <id> --status listed --ref "Qoo10 상품번호"
$CAT list [--status cleared] / show --id <id>
```

## 주의

- 스코어(opportunity)는 **참고 지표** — 자동 선정·자동 등록 트리거로 쓰지 않는다(kit 규칙).
- 블랙리스트는 참고 목록(표시만) — 최종 판단과 갱신은 사람. CJ/올리브영 PB 시드 포함.
- 화장품 역직구 개인수입 한도(1품목 24개) 노트가 각 항목에 박힌다 — 대량 구매 유도 금지.
- 이미지 사용권(`imageRights`: none|user-photo|supplier-licensed)이 none 이면 상세페이지에
  실제품 이미지를 넣을 수 없다(금지선 #1) — clear 전에 확보 권장.
