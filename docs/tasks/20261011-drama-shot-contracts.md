# shot-v1 컷 계약·결정적 관문

- 기준: feat/drama-regression-pilot `766436aff15a8bd84500c8949dbddc1adf46d728` (PR179·180 머지).
- 목표: 구도·블로킹·비트·소품 상태와 시간 예산을 구조화해 생성 전 문제를 보고한다.
- 소유: Codex 리드, drama-shot-contracts worktree. 독립 Codex 읽기 전용 검토.
- 범위: append-only 계약/스키마, shot 관문, 비트 시간 배분/블로킹 호환 공통 함수, 생성·조립 차단, 회귀 시험.
- legacy: 기존 지문/프롬프트/계획 유지. validate에는 설계 §5대로 info 전용 shot 보고서 한 개 추가.
- 제외: 키프레임 승인·vocal 종류·실행 상태·대사 판정·유료 생성·출시/운영 배포. shot-v1은 준비 관문 통과와 관계없이 plan/API/CLI 생성·조립을 거부한다.
- 완료 조건: 신규 경계 시험, 기존 drama/runner 회귀, 타입 검사, 독립 검토, 본인 변경 커밋/upstream push/PR.
- 진행: 구현·통합 검사·독립 Codex 재검토 PASS. 다음: 작업 브랜치 커밋/push/PR, 기준 브랜치 머지는 별도 승인.

- 첫 focused 시험: 44/49 통과. 실패 5개는 테스트 입력 테이블이 배열을 인자로 펼친 문제 4건과 validate 옵션(`--out` 대신 `--gates`) 1건. 입력을 객체로 감싸 실제 배열 경계를 검사하도록 수정한다.
- 2차 focused 시험: 48/49 통과. CLI plan은 기존 규칙상 실패 보고서 파일을 저장하므로, 파일 부재 대신 `ok:false, plan:null`을 검사한다. 생성 명세 부재와 실패 증거 보존을 구분한다.
- 전체 1차 검증: 타입 통과, drama 220/221, runner 21/22. 코드 실패 없음. CLI 실패 파일은 `{ok:false,reports}`이므로 clips 부재와 stdout plan:null을 검사. legacy golden 차이는 설계된 info shot 보고서뿐: 원본 golden은 수정하지 않고 새 보고서의 info-only/지문/일치와 나머지 전체 동일성을 각각 검사한다.

## 사용·검사 경계

회차에 `shotPolicy: {version: "shot-v1", strict: true}`와 `authoredBy`를 명시한다. 각 컷의 `beats[].lines`는 0부터 시작하는 대사 인덱스이며, 대본 순서를 유지하고 모든 줄을 정확히 한 번 배정한다. `sec` 생략분은 발화량+행동 여유 비례로 배분한다. 명시한 구간의 남는 시간은 정지 여유이며 길이를 자동 확대하지 않는다.

`validate --series <series.json> --episode <episode.json> --gates <dir>`는 기존 관문과 `shot.json`을 저장한다. shot-v1의 block은 exit 1, legacy의 shot 결과는 info만 제공한다. 장소의 `props` 문자열이 소품 식별자이며 이번 스키마에는 별도 별칭 필드가 없다. 문장 언급 검사는 등록 문자열만 보조적으로 찾고 이미지 존재를 검증하지 않는다.

선행 컷이 없거나 장소가 바뀌면 변화 없는 propState는 초기 상태 선언으로 취급한다. 같은 장소 선행 컷이 있으면 그 종료 상태에서 비트 changes를 순서대로 누적해 현재 종료 상태와 비교한다. 앞 회차가 legacy인 경우의 구도/블로킹 생략 예외는 `previousCutOf`로 얻은 그 앞 회차에만 적용한다.

생성·조립은 shot 관문 통과 이후에도 차단한다. CLI plan은 실패 증거 파일(`ok:false,reports`)을 저장하고 stdout의 plan은 null이다. 직접 어댑터 호출도 차단한다. 키프레임 참조/승인, 실행 원장·출시 승인, vocal 종류·대사 순서 실제 음성 검증은 다음 구현 범위다.

## 검증 증거

- 타입 검사: contracts·drama-series·drama-runner 통과(`typecheck-final.log`).
- drama 전체 222개 통과(`drama-final.log`, 기존 172 + 신규 50), runner 22개를 합해 244/244.
- runner 22개 통과(`runner-final.log`). historical golden 파일 그대로; info-only shot 보고서를 별도 단언하고 나머지 전체 비교 유지.
- 로그: iCloud `gpt 작업/commerce-automation-kit/20261011-drama-shot-contracts/`.
- 실제 모델 호출/유료 생성/운영 배포 없음.

- 독립 검토 S2-01: join-check가 legacy chainsFrom만 사용해 shot-v1의 독립 컷(continuesFromPrev:false)을 연결로 오판정. 수정 전 신규 CLI 회귀 실패를 확인하고 정책별 공통 chainsFromV1로 교체. true인데 호환되지 않는 연결은 파일 검사 전에 block, 실제 legacy 앞 회차만 생략 예외 적용.
- 독립 Codex 최종 PASS: S2-01의 원래 합성 CLI 반례를 같은 파일로 재실행해 exit 0/joins:[] 확인, 신규 연결 경계 시험 별도 1/1 통과. 비트 시간/선행 소품/legacy 예외/생성·조립 차단 직접 검증. 새 S1/S2 없음. CLI SHA256 `97566b45da8e615b436324ca14c48c9ee093c1c4457ec7c4af68be3d77cfa29f`.
