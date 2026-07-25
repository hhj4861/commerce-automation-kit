# @cak/showcase-site (원자 #6)

FIRSTFRAME형 쇼케이스 사이트의 데이터·빌드·배포 관리.

**핵심 원칙: `works.json` 이 단일 진실 소스, `works.js` 는 생성물(직접 편집 금지).**
계약은 `@cak/contracts` 의 `Showcase*` (packages/contracts/src/showcase-entry.ts).
실제 관리 대상 사이트 예시: `apps/firstframe` (site.config.json 이 있는 디렉토리만 관리 대상).

## 역할

- `works.json` 파싱·검증 (엔트리·필드 특정 에러, 미디어 파일 존재까지 — silent drop 금지, 전부 나열)
- `works.js` 생성 (`window.FF_WORKS = [...]` — showcase.html 이 `<script src="works.js">` 로 로드)
- 엔트리 삽입/삭제 (삽입은 첫 reserved 예약 슬롯 **앞**, 없으면 맨 끝)
- 미디어 등록: URL 다운로드/로컬 복사 → ffprobe 규격 확인 → ffmpeg 포스터 추출
- dist 조립(html→index.html + works.js + media/) 및 Cloudflare Pages(wrangler) 배포

## CLI 사용법

공통 인자 `--site <dir>` (절대경로 또는 INIT_CWD 기준 상대경로). stdout=결과 JSON, stderr=로그.

```bash
# kit 루트에서
npm run cli -w @cak/showcase-site -- validate  --site apps/firstframe   # 검증(미디어 존재 포함), 실패 exit 1
npm run cli -w @cak/showcase-site -- gen       --site apps/firstframe   # works.json → works.js
npm run cli -w @cak/showcase-site -- list      --site apps/firstframe   # id/brand/clips 요약
npm run cli -w @cak/showcase-site -- add       --site apps/firstframe --entry new-entry.json   # 검증→삽입→저장→gen
npm run cli -w @cak/showcase-site -- remove    --site apps/firstframe --id olipop              # 삭제→저장→gen
npm run cli -w @cak/showcase-site -- add-media --site apps/firstframe --slug jindo2 \
                                               --src https://example.com/v.mp4 --poster-at 1.0
npm run cli -w @cak/showcase-site -- build     --site apps/firstframe   # gen 포함 → dist 조립
npm run cli -w @cak/showcase-site -- deploy    --site apps/firstframe   # Cloudflare Pages 배포
npm run cli -w @cak/showcase-site -- sync      --site apps/firstframe   # validate→gen→build→deploy
```

종료코드: `0` 정상 / `1` 검증·사용법·토큰 설정 실패 / `75` 일시적 실패(wrangler 배포 실패 등 — 재시도 가치 있음).

### 배포 토큰

`CLOUDFLARE_API_TOKEN` 환경변수 → `<site>/.cf-token` 파일(trim) 순으로 찾는다.
토큰이 없으면 throw 하지 않고 `{ok:false, log:"토큰 없음 — ..."}` 보고서로 투명하게 반환한다.
**토큰 값은 로그·보고 어디에도 출력하지 않는다** (wrangler 자식 프로세스 env 로만 전달).

## 설계 제약

- **구조**: `src/core`(순수 — I/O 없음) / `src/adapters`(파일·spawn·fetch·zod) / `src/obs`(logger) / `src/cli`
- **의존성**: `@cak/contracts` + `zod` + Node 내장만. 원자 간 import 금지(logger 는 keyword-intel 패턴 복제).
- **silent drop 금지**: 검증 문제는 `problems[]`/`warnings[]` 로 전부 나열, 배포 결과는 `ShowcaseDeployReport` 로 보고.
- **원자적 쓰기**: works.json/works.js 는 tmp 파일 후 rename (부분 쓰기 파손 방지).
- **id/slug 형식**: 영문 소문자·숫자·하이픈 (`^[a-z0-9]+(-[a-z0-9]+)*$`). 단 reserved 엔트리(`__reserved__` 등
  내부 마커)는 형식 검사 예외 — firstframe 실데이터 호환.
- **배포는 명시적 명령으로만** — 지표/스코어에 의한 자동 배포 트리거 금지(계약 주석 참조).
- ffmpeg/ffprobe spawn 타임아웃 240s, wrangler 300s. 테스트는 실제 ffmpeg/wrangler/네트워크를 실행하지 않는다.

## 검증

```bash
npm run typecheck -w @cak/showcase-site
npm test -w @cak/showcase-site   # 50 tests
```
