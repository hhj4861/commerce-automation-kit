# drama-runner — 로컬 계획 초안 경계 (첫 단위)

기존 drama-series의 `PlanResult`를 atomworks `SubjectRef`와 전용 SQLite 문서로 변환하는 **데이터 전용 기반**이다. 저장되는 값은 항상 `status: unverified-preview`, `authorized: false`다. `ok: true`는 변환/저장 성공이며 생성·출시 승인이 아니다. 실제 제공자 호출, 예산 예약, 리뷰 승인, 기존 상태 마이그레이션 명령은 없다.

실제 소비 채택 완료가 아니다. shot-v1·앞 회차 연결(F10)·현재 입력과 legacy 결과의 재검증·승인/원장 통합은 다음 단위다. `inputs`의 SHA는 **호출자가 제공한 관측값**이며 원본 바이트를 읽어 인증한 증거가 아니다. 이 초안을 유료 실행의 입력으로 사용하지 않는다.

## 설치 경계

commerce의 일반 `npm ci`는 종전과 같이 실행한다. SDK는 `runtime/`의 별도 lockfile로 명시적으로 설치한다. 원자 drama-series는 atomworks를 import하지 않는다. 필요한 atomworks 공개 SDK는 contracts/kernel/state-store 세 개뿐이다.

이 첫 단위의 `file:` 설치는 아래 상대 배치를 요구한다. 임의의 가변 main checkout이나 registry 버전으로 대체하지 않는다.

```
<workspace>/commerce-automation-kit-worktrees/drama-atomworks-adapter/  (이 저장소)
<workspace>/atomworks-worktrees/drama-consumer-pin/                    (고정 checkout)
```

- Node **22.23.3 이상, 23 미만**: 새 runner만의 요구 조건. commerce 전체 엔진은 변경하지 않았다.
- atomworks commit: `ad94eaef54dbb0babe3b5916ca6122a5cc841545`.
- atomworks lock SHA-256: `7bd79fdfbc938f6e4927bb5e371c9b1df9c1689f955caa2e53316f5ad039c446`.
- 설치 순서: 고정 checkout에서 `npm ci --ignore-scripts` → `npm run build -w @atomworks/contracts` → kernel → state-store.
- commerce root에서 `npm ci --ignore-scripts`, 이어 `npm ci --prefix apps/drama-runner/runtime --workspaces=false --ignore-scripts`.
- `npm run preflight -w @cak/drama-runner`: commit·tracked/untracked clean·lock SHA·실제 SDK resolved 경로 확인.

빌드된 dist/node_modules는 로컬 신뢰 영역이다. preflight는 서명 검증·악성 로컬 코드의 실행 격리가 아니다. 설치 전 고정 소스를 확인하고 lockfile로 설치/재빌드해야 한다. CI는 아래의 고정 상대 배치를 사용하며, 배포용 휴대 설치는 미구현이다. 다른 앱 설치에 이 checkout을 요구하지 않는다.

## CI

`.github/workflows/drama.yml`은 드라마 두 패키지·contracts·루트 package/lock·워크플로 변경이 있는 PR 및 `feat/drama-regression-pilot`, `main` push에서 실행한다. 두 job은 Node **22.23.3**을 사용한다(drama-series의 `>=20`도 충족). commerce 설치는 같은 루트 lockfile에 `--workspace`를 지정하여 관련 패키지로 한정하고 모두 `--ignore-scripts`를 적용한다.

- `drama-series`: macOS 15에서 FFmpeg/ffprobe 및 `drawtext` 필터를 확인한다. 없으면 Homebrew `ffmpeg-full`을 설치하고 해당 bin을 PATH에 우선 등록한다. AppleSDGothicNeo 존재도 확인한 뒤 시험·타입체크한다. 기존 실제 미디어 조립 시험의 macOS 글꼴 의존성 때문에 이 runner를 사용한다. 기본 runner의 축소된 FFmpeg에 `drawtext`가 없으면 실제 조립 시험이 실패하므로 바이너리 존재만으로 준비 완료로 판단하지 않는다.
- `drama-runner`: `$GITHUB_WORKSPACE/commerce-automation-kit-worktrees/drama-ci`와 `$GITHUB_WORKSPACE/atomworks-worktrees/drama-consumer-pin`에 각각 checkout한다. 기존 `file:../../../../../atomworks-worktrees/drama-consumer-pin/...`과 preflight 경로를 수정하지 않는다. 위 README의 commit·lock SHA와 실제 checkout을 먼저 대조하고 SDK 3개 빌드 → commerce/runtime 설치 → preflight → 시험·타입체크 순서로 실행한다.
- runner의 `DRAMA_TEST_ARTIFACTS`는 `$HOME/Library/Mobile Documents/drama-ci`로 설정한다. 호스티드 runner의 일반 로컬 폴더이며, 동기화 위치 거부 시험을 재현하는 이름이다. 실제 SQLite 시험은 별도의 `$RUNNER_TEMP/drama-state`를 쓴다. 실제 iCloud 연결·운영 DB 접근은 없다.

사용자가 commerce 저장소의 Actions secret **`ATOMWORKS_READ_TOKEN`**을 설정해야 한다. fine-grained PAT의 repository access는 **`hhj4861/atomworks`만**, repository permissions는 **Contents: Read-only**로 제한한다. 토큰 주체도 해당 비공개 저장소의 읽기 권한이 있어야 한다. checkout에는 `persist-credentials: false`를 적용한다. 토큰을 다루는 job이므로 외부 action은 태그 대신 커밋 SHA로 고정한다(checkout·setup-node v4.4.0, 주석에 버전 표기). 일반 `GITHUB_TOKEN`은 다른 비공개 저장소의 checkout 자격을 대신하지 못한다([checkout 공식 안내](https://github.com/actions/checkout/tree/v4#checkout-multiple-repos-private)).

secret이 없거나 fork/Dependabot PR처럼 secret이 전달되지 않는 경우 runner job은 이유를 출력하고 **실패**한다. 자동 skip이나 `pull_request_target`으로 우회하지 않는다. 대안은 atomworks 전용 **읽기 전용 deploy key**이며, 선택 시 사용자가 키·secret을 관리하고 checkout을 `ssh-key` 방식으로 변경해야 한다. 현재 워크플로는 PAT 방식이고 이 작업에서는 secret/키를 만들지 않는다. 실제 GitHub Actions 성공 여부는 secret 설정 후 해당 PR 실행에서 별도로 확인한다.

## 입력과 출력

`src/draft.mjs`의 공개 함수:

- `parseBundle(text)`: 중복 JSON 키 등을 거부하는 엄격 파서.
- `makeDraft(bundle)`: 순수 변환. legacy 실패·관문 누락/모순·중복 컷·견적 불일치·NFD 의미 문자열을 거부한다.
- `saveDraft(dbPath, draft)`: 전용 로컬 DB에 내용을 주소로 쓰는 불변 초안 저장. 같은 본문은 같은 opId/key로 재전달되어 revision 1을 유지한다.

bundle 구조:

```json
{
  "schemaVersion": 1,
  "revision": "consumer-r1",
  "inputs": {
    "series": "<raw SHA-256 hex>",
    "episode": "<raw SHA-256 hex>",
    "gates": {"props.json": "<raw SHA-256 hex>"}
  },
  "legacyResult": {"ok": true, "plan": "<실제 PlanResult.plan 객체>", "reports": []}
}
```

위 JSON은 필드 설명용이며 실행 픽스처가 아니다. `legacyResult`는 plan 파일 단독이 아니라 **plan CLI stdout 전체**다. `required-gates`, `verified-lines`, `backend`, `budget`의 통과 보고서 네 개가 필요하다. 구조 검사만으로 판정자 인증이나 현재 입력과의 일치가 입증되지는 않는다.

지문은 `content`=시리즈/회차 원본 SHA, `reviewContext`=content+입력 manifest+보고서, `execution`=legacy plan(`createdAt` 제외)다. 원본 바이트 SHA는 그대로 받고 의미 값은 aw-jcs-1 규칙을 검사한다. 경로는 DTO에 넣지 않는다. `createdAt`만 재실행 시각이므로 초안/멱등 지문에서 제외한다.

```
npm run --silent cli -w @cak/drama-runner -- preview --input bundle.json
npm run --silent cli -w @cak/drama-runner -- preview --input bundle.json --db /local/existing-directory/preview.db
```

`--db` 생략 시 stdout 변환만 한다. DB 부모 디렉터리는 먼저 만들어야 한다. iCloud/Dropbox 등 동기화 폴더는 거부한다. 기존 파일은 전용 SQLite `application_id`가 있어야 열고, 외부/legacy DB는 읽기 전용으로 확인한 뒤 거부한다. 초기화 중 강제 종료돼 표시 없는 DB가 남아도 자동으로 덮어쓰지 않는다. SQLite 위치 검사는 알려진 동기화/네트워크 경로 제한이지 모든 파일시스템에 대한 보증이 아니다.

종료코드: 0=초안 변환/저장 성공, 2=사용법·입력·위치/외부 DB 거부, 1=저장 무결성/충돌 등, 75=SQLite busy(재시도). JSON `ok`, `code`, `detail`을 확인한다. 영구 오류를 재시도로 숨기지 않는다.

## 검증

```
export DRAMA_TEST_ARTIFACTS='<지정 iCloud 작업 하위 폴더>'
export DRAMA_TEST_STATE='<동기화되지 않는 로컬 시험 폴더>'
export TMPDIR="$DRAMA_TEST_ARTIFACTS"
npm test -w @cak/drama-runner
npm test -w @cak/drama-series
npm run typecheck -w @cak/drama-series
npm run typecheck -w @cak/drama-runner
```

폴더는 미리 생성한다. DB 시험은 로컬 폴더만 사용하며 자체 시험 DB만 종료 후 정리한다. CLI 사본·미디어·로그는 지정 artifacts 폴더에 남긴다.

`test/fixtures/legacy-golden.json`은 commerce `eae6be5`의 실제 1화 입력 22개 SHA와 validate/plan/낮은 예산 plan의 stdout·출력 파일·관문 보고서·종료코드를 변경 전에 기록한 것이다. 시험마다 원본을 사본으로 복사해 비교하며 원본에는 쓰지 않는다. 실제 기준은 validate=0, plan=1: props/scenario가 현재 대본과 다른 지문이므로 차단된 상태다. 이를 pass로 고치지 않았다.

기존 assemble 시험의 자체 생성 클립 2개/약 8초 조립을 실제 FFmpeg·오디오로 검증한다. 실제 1화 미디어 재조립을 검증했다는 뜻은 아니다. FFmpeg와 AppleSDGothicNeo가 있는 macOS에서 미디어 시험이 skip되지 않았는지 반드시 확인한다. 실제 제공자/JEV/Whisper 요청은 이 시험에 없다.

롤백: runner를 사용하지 않고 기존 drama-series CLI를 그대로 쓴다. 새 DB만 별도 보관하고 기존 상태 역변환은 하지 않는다.
