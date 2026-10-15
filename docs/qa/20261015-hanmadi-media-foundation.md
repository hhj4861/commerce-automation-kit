# Hanmadi 공통 원문·작업 관리 — 2026-10-15

## 구현 범위

관리자의 **원문·작업** 메뉴와 `/api/study/admin/media`를 연결했다. 독립 CLI가 아니라 실제 Next 관리자/저장소 경로다. 기존 `v2Driver`의 Redis CAS를 재사용하며 새 인프라·비밀키·공급자 호출을 추가하지 않는다.

- YouTube 링크/ID를 정규화해 영상당 공통 원본을 등록한다. 원문 언어와 스터디/음악/공통 용도를 기록한다. 수동 제목은 검증된 metadata로 표시하지 않는다. 기존 ID는 중복 등록으로 덮어쓰지 않는다.
- 사용권·보관/학습 이용 근거를 확인한 뒤 TXT/SRT/VTT/LRC 원문을 불변 버전으로 보관한다. 구 입력 폼의 보관 정책을 바꾸거나 과거 미보관 원문을 복원하지 않는다.
- 원문 저장과 정규화 job 생성을 단일 CAS로 처리한다. request ID/입력 hash 재전송은 버전·작업을 중복 생성하지 않는다. 같은 요청에 다른 내용 또는 오래된 revision은 409다.
- 작업은 대기→원문 확인→줄/시간 정리→원문 정리 완료로 표시한다. 정리한 줄에는 asset hash 기반 cue ID가 있고, 시작/끝이 완전한 경우와 읽기 전용을 구분한다.
- lease 20초 / route 제한 30초. 활동 중 중복 실행을 막고 만료 후 checkpoint에서 재개한다. 마지막 시도 5회까지 상태·오류·중단·취소를 보존한다. 이 lease 정책은 외부 유료 작업에는 적용하지 않는다.
- 원문 교체·작업 취소·원본 삭제 뒤 늦은 결과와 이전 lease의 결과는 반영하지 않는다. 오류를 성공으로 바꾸거나 원문을 유실하지 않는다.
- 기존 음악 수집함은 서버에서 실제 레코드를 읽어 **영상 정보만** 연결한다. 기존 자막 원문·곡·게시 상태를 자동 복사/변경하지 않는다. 일반 영상은 이번 공통 화면에서 URL로 등록할 수 있으며 기존 분석 큐 전체의 자동 이관은 남았다.
- owner 전용 GET/POST·동일 Origin·64KB body 경계를 적용한다. 운영 관리자 경로 허용 목록에도 정확한 API 하나만 추가했다. 목록 응답에는 원문·cue 본문을 넣지 않고 선택한 항목에서만 읽는다.
- 50개 원본·원본별 8개 버전·400개 job·총 1,000,000 bytes의 상한을 둔다. 대기 작업의 파생 결과/시도 이력 공간도 예약해 한도 시 조용한 삭제 없이 거부한다. 삭제는 공통 aggregate의 원문/파생 cue/job을 한 CAS로 제거한다. 기존 별도 수집함·게시 자료·서버 백업을 지웠다고 주장하지 않는다.

이 메뉴는 **원문 정리 기반**이다. 학습 자료 생성·JEV·게시·음정 채점·모델 학습을 자동 실행하지 않는다. 원문 이용 근거는 관리자의 확인 기록이며 시스템이 외부 권리 계약을 검증했다는 뜻이 아니다.

## 검증 기록

- 원문/동시성 검사 10개: URL 경계, 언어/용도/권한/크기, canonical 중복, CAS 재시도, 동일 요청 재전송, 원문 버전 충돌, 실제 정규화·캐시·재조회, 잘못된 cue 실패·수정 버전, lease 중복/만료/옛 결과, 교체/취소/삭제 중 결과, 최대 시도·스키마·보관 한도·오래된 삭제 요청.
- 기존 검사를 포함한 **289개 단위 테스트 통과**. 운영 관리자 API 경계 검사도 통과했다.
- 전체 TypeScript·변경 파일 lint·Next production build 최종 실행이 모두 exit 0으로 통과했다. build 결과에 `/api/study/admin/media` 동적 route가 포함된다.
- 실제 브라우저 E2E: 운영과 같은 `HANMADI_DEPLOYMENT=admin` 모드의 Next UI→실제 API→로컬 파일 저장. EN/JA/TH/ES별 직접 작성 텍스트 등록/정리, 잘못된 시간의 실패 표시, 새 버전 수정, 재접속 후 이전 실패와 완료 버전 복원, stale edit 409, owner/Origin/body/URL 검사, metadata 연결과 기존 수집함 보존, 공통 원문 삭제, 390px 화면의 가로 넘침·JS 오류 검사.
- E2E의 네 언어 텍스트는 parser/저장/화면 흐름을 위한 자체 작성 fixture다. 번역·원어민 발음·실제 곡·실제 학습/가창 정확도 시험이 아니다. 기존 YouTube metadata 요청만 로컬 fixture이며 외부 전사/LLM/JEV 호출은 0이다.
- desktop/mobile 캡처를 직접 확인했다. 초기 캡처의 체크박스 배치를 수정하고 상태 설명의 내부 코드는 사용자 화면에서 제외했다. 시도 이력은 한국어로 표시한다.

### 발견·수정 및 환경 제약

1. 최초 typegen을 저장소 root에서 실행해 app 디렉터리를 찾지 못했다. 앱 cwd로 바로잡았다. 일반 sandbox의 worktree 생성 파일 쓰기도 거부돼 승인된 별도 실행 권한으로 typegen을 수행했다. 보호 훅 우회는 하지 않았다.
2. 새 화면의 refresh Promise 반환형을 고쳤다. typegen 전에 기존 PageProps 오류가 보였고, 앱 cwd에서 route types를 생성한 뒤 전체 검사했다.
3. 첫 브라우저 시도는 Playwright 전용 Chromium이 없어 UI 시작 전 중단. 새 브라우저 설치 대신 설치된 Chrome으로 검증했다. CI는 기존 workflow의 Chromium 설치 단계를 사용한다.
4. 두 번째 브라우저 시도에서 select의 정확한 label 선택을 찾지 못했다. 언어·용도 선택기에 명시적 접근 이름을 추가해 해결했다.
5. 정적 검토에서 운영 관리자 API 허용 목록이 정확한 경로 방식임을 찾아 추가했다. 이후 관리자 모드의 실제 브라우저/API로 검사했다.
6. `npm ci`는 기존 고정 의존성에서 high 7건을 보고했다. 이 PR은 의존성 버전/lock을 바꾸지 않았다. 새 라이브러리를 추가하지 않았고 보안 문제가 모두 해소됐다고 보고하지 않는다.

## 재현과 증거

작업 폴더: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261015-media-foundation/`

```sh
cd apps/hanmadi
npm ci --workspaces=false
node node_modules/next/dist/bin/next typegen
npm test
node node_modules/typescript/bin/tsc --noEmit --incremental false
# Install test Chromium if absent, or set PLAYWRIGHT_CHANNEL=chrome for installed Chrome.
HANMADI_E2E_ARTIFACTS='/absolute/path/to/new-artifact-directory' npm run test:media-foundation
npm run build
```

로컬 실행 시 산출물/캐시는 위 iCloud 작업 폴더로 지정한다. `store.json`은 전부 fixture이고 운영 인증정보를 복사하지 않는다. E2E는 기존 store 파일 덮어쓰기를 거부한다.

- `unit-first.log`, `regression-final.log`: 검사 증거.
- `browser-1`, `browser-2`: 중단된 시도와 서버 로그. 재시도마다 새 경로를 사용했다.
- `browser-3`: 최초 전체 흐름 통과 및 desktop/mobile 캡처.
- `browser-final`: UI 마무리/20초 lease 버전의 최종 실행·캡처·result.json·server.log.
- `build.log`, `build-final.log`: 최초/최종 production build.

CI의 `hanmadi-v2.yml`에도 새 E2E와 캡처/결과/로그 업로드를 연결했다. 클라우드 Redis·운영 관리자 계정·외부 공급자·실제 사용자 학습 E2E는 수행하지 않았다.

## 전달·남은 범위

기준: main `e0ffc6b7c9ca1a425ce999dcffc9acc0e9a988d9`, 구현 브랜치 `feat/hanmadi-media-foundation`. 변경은 구현 worktree에서 검증·커밋·push하고 PR로 검토한다. 현재 신규 기능의 운영 배포를 완료했다고 보고하지 않는다.

다음은 공통 원문을 실제 수업/음악 생성 입력에 연결하고, immutable 게시본·검수·튜터 지식 adapter를 구성하는 것이다. 외부 공급자 202/실행 불명 상태·과금·job 연결, 대용량 원문 paging/자산 저장소, 목적/언어 수정 이력, 기존 일반 영상 자동 이관도 남았다. 이번 로컬 정규화의 재개를 외부 유료 모델 재호출 정책으로 재사용하지 않는다.

최종 증적 지문: `browser-final/result.json` SHA-256 `04d673fdf8cae6218903be37bc381ad85c06d81bceb9f32b5cc720a7004357b2`. 최종 UI E2E·타입·lint·build exit 0, desktop/mobile 캡처 확인 완료.
