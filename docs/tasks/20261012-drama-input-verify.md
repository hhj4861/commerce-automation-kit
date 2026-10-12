# drama-runner 입력 원본 바이트 대조 — T2

- 목표: runner README의 경계 "`inputs`의 SHA는 호출자가 제공한 관측값"을 보완한다. 현재 파일의 원본 바이트를 직접 해시해 bundle의 series·episode·모든 gate SHA와 대조하는 단계를 둔다.
- 범위/담당: Claude 작업 T2, `feat/drama-input-verify` worktree의 `apps/drama-runner/**`와 이 기록. 교차 리뷰는 Codex(PID 17661)가 맡는다. 분담과 파일 소유는 메일함 `drama-series` 스레드 `20261012T220855-claude-team-kickoff.md`에서 합의했다.
- 기준: `9e38359` (`origin/feat/drama-regression-pilot`, PR #192 머지 커밋).
- 완료 조건:
  - 원본 바이트 대조 CLI와 `preview --files`
  - 기존 preview 동작·저장 DTO 불변
  - 실패 시 DB 미작성
  - 경로 비노출
  - 시험·typecheck·preflight 통과, 로컬 커밋
- 설계 반영(Codex 사전 의견 `20261012T221600-codex-team-ack-design.md` 5건):
  1. 새 I/O 오류는 모두 고정 문구의 RunnerError로 감싸고 입력 이름만 출력한다.
  2. 열기 직전 FIFO로 바뀌어도 멈추지 않도록 `O_NONBLOCK`으로 연다.
  3. 해시 전후 stat을 비교하고 링크 검사가 마지막 경로 요소에만 적용된다고 명시한다.
  4. files.json은 엄격 JSON·닫힌 스키마로 읽고, bundle의 SHA 형식 검사 뒤에만 파일을 연다.
  5. 실패 시 새 DB 미생성·기존 DB 바이트 불변을 시험한다.
- 구현:
  - **해시 도구**: 새로 만들지 않고 atomworks kernel `verifyArtifact`(고정 `ad94eae`, `@atomworks/kernel/node`)를 재사용한다. 이 함수가 descriptor 하나로 열고 전후 stat·dev/ino를 대조하며 스트리밍으로 해시한다.
  - **ArtifactRef 구성**: 입력마다 계약을 검증한 ArtifactRef를 만든다. 기대 크기가 bundle에 없어서 열기 직전 lstat으로 관측한 크기를 넣는다. 열 때 크기가 다르면 그 사이 파일이 바뀐 것으로 보고 `changed`로 분류한다.
  - **CLI**: 새 하위 명령 `verify-inputs`를 추가하고, `preview`에 선택 옵션 `--files`를 붙였다.
  - **오류 형식**: `RunnerError`에 선택 인자 `extra`를 추가했다(append). `draft.mjs`는 `parseInputs`를 공개한다.
  - **의존성 점검**: SDK 진입점에 `kernel/node`를 더하고, preflight가 이 경로도 대조한다.
  - **시험 helper**: 시험의 합성 bundle 생성 함수를 `test/synthetic.mjs`로 옮겨 두 시험 파일이 공유한다.
- 종료 코드:
  - `input-mismatch`·`input-unreadable`·`input-manifest-mismatch`는 2다.
  - 해시 중 변경(`input-changed`)은 75이고 `retryable:true`다.
  - 우선순위는 읽기 불가 > 바이트 불일치 > 변경이다.
- 검증:
  - drama-runner 31/31 통과(기존 22 + 새 9), 건너뜀 0.
  - typecheck와 preflight(`node tools/check-dependency.mjs`)가 통과했다.
  - 새 시험은 아래를 확인한다.
    - **실데이터**: 실제 1화 입력 22개(`docs/videos/20261006-regression-pilot`)가 golden fixture의 기록 SHA와 일치한다. 하나를 바꾸면 그 이름으로 불일치를 보고한다.
    - **바이트 그대로**: BOM·CRLF·NFD 바이트를 그대로 해시한다. NFC 변환이나 LF 변경은 불일치다.
    - **파일 목록 일치**: gate 누락·추가·비문자 경로, series 누락을 거부한다. bundle SHA 형식 오류도 거부한다.
    - **정규 파일만**: 심볼릭 링크(같은 내용이어도)·디렉터리·FIFO·없는 파일을 거부하며 멈추지 않는다.
    - **files.json 엄격 검사**: 중복 키, 모르는 필드, 빈 경로, 비문자, 누락 필드, 읽을 수 없는 목록을 거부한다.
    - **경로 기준**: 상대 경로는 files.json 위치 기준이고 절대 경로는 그대로 둔다.
    - **CLI verify-inputs**: 종료 0과 2를 확인했다. stdout·stderr 어디에도 경로가 나오지 않는다.
    - **CLI preview --files**: 미리보기 본문이 `--files` 없을 때와 같다. 실패하면 기존 DB 바이트가 그대로이고 새 DB가 생기지 않는다.
    - **CLI 사용법**: `verify-inputs`는 `--files`가 필요하고 `--db`를 거부한다. bundle SHA 오류는 어떤 파일도 열기 전에 실패한다.
- 환경:
  - Node 22.23.3, Claude worktree는 sparse checkout이다.
  - 디스크 여유가 1.1GiB(사용률 100%)라 필요한 폴더만 꺼냈다: `apps/drama-runner`, `packages/drama-series`, `packages/contracts`, `docs/tasks`, `docs/videos/20261006-regression-pilot`.
  - node_modules는 같은 lock의 `drama-ci` worktree에서 APFS 복제(`cp -ac`)했다. runtime node_modules(고정 pin 링크)는 `drama-atomworks-adapter`에서 복사했다.
  - `DRAMA_TEST_STATE`는 세션 스크래치패드 아래(비동기화 로컬)이고, `DRAMA_TEST_ARTIFACTS`는 iCloud `claude 작업/tmp/20261012-drama-input-verify/artifacts`다.
  - 유료 호출·새 패키지 설치는 없었다.
- 현재 결과: 구현과 로컬 시험 완료. Codex 교차 리뷰 대기.
- 다음: Codex 리뷰 pass 후 `feat/drama-input-verify` → `feat/drama-regression-pilot` PR. 머지는 사용자 승인 후.
- 한계:
  - 대조는 그 시점의 확인이며 이후 변경을 막지 못한다(유료 실행 단계가 생기면 실행 직전 재대조 필요). 결과는 저장 DTO에 기록하지 않는다.
  - 링크 거부는 마지막 경로 요소만 대상이다.
  - 해시 중 변경(`input-changed`)의 실제 경합은 시험으로 재현하지 않았다. 이 경로는 kernel `verifyArtifact`의 동작과 위 분류 표에 기댄다.
  - legacy plan 결과와 현재 입력의 의미 대조(fingerprint 재계산)는 범위 밖이다.
