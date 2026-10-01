# 전역 완료 훅: 늦게 종료된 빌드 뒤 중복 패치 실패 복구

## 문제와 변경

세 호출이 같은 `functions.exec` 안에서 순차 호출됐다: (1) 빌드가 프로세스 ID를 반환하고 계속 실행, (2) Git 상태 조회 종료, (3) 같은 절대 경로를 Delete와 Add로 중복 지정한 패치가 호스트 검증에서 거부. 빌드는 패치 실패 약 20초 뒤 정상 종료했지만 기존 복구기는 이 3단계 조합을 지원하지 않아 완료 훅에 실패 호출이 남았다.

`tools/task-finish-three-step-failure.py`는 기존 `batch_failure_receipt`의 선행 종료 증명만 확장한다. 정확히 Bash/Bash/apply_patch 세 단계, 첫 명령의 실행 중 응답, 둘째 명령의 종료 응답, 마지막 중복 경로 패치의 정확한 호스트 오류가 모두 있어야 한다. 원본 세션·턴·호출 소스 해시·단계 연결 검증은 기존 코드가 계속 담당한다.

실제 native 완료 이벤트의 명령·프로세스·상태·반환 코드·시각을 대조한다. 첫 명령의 완료는 패치 실패 후 30초까지 인정하되, 그 명령이 원래 호출 안에서 시작했음이 증명돼야 한다. 다음 조회가 시작돼도 이전 프로세스의 정확한 종료 증거는 유효하다. 누락·중복·실행 중·다른 명령·다른 세션·다른 턴·추가 실행·패치 자체의 실행 이벤트·시간 역전은 거부한다.

복구되는 패치의 상태는 **failed / exit_code null**이다. 실패를 성공으로 바꾸지 않으며 상태 DB·원본 로그·신뢰 설정을 직접 수정하지 않는다. 파일 소유권·관찰 범위·커밋·원격 push 검증 함수는 변경하지 않는다. 30초 초과 등 지원하지 않는 조합은 계속 pending으로 남는다.

## 검증

- 신규 unittest 23개 통과(여러 잘못된 필드·시각·입력은 subTest로 검증).
- 기존 directory recovery 회귀 8개 통과.
- 설치기 dry-run과 멱등성, 부분 설치/지원하지 않는 입력 거부, 컴파일 검증 통과.
- 실제 과거 원본 기록을 수정 코드에 메모리 내에서 대입해 failed/null 영수증 생성 확인. 이 검증 자체는 상태를 쓰지 않았다. 첫 시도는 실행 중 로그 변경 때문에 원본 안정성 검사에서 거부됐고, 조기 반환 없이 재실행해 통과했다.
- 과거 호출: `call_bcd0BI7vK0CFZXku6fHP4DC3` / 미확인 패치: `exec-b53f2704-649d-404b-8b10-adea854d114b`.
- 패치 거부: 2026-09-30 06:07:32.708 UTC. 빌드 실제 종료: 06:07:53.158 UTC, native ID `exec-d4d7dea1-0fbe-44df-8dff-a97d5fe6a7ea`, exit 0.
- 선행 종료 증거 해시: `2244d047b8d3f2d5771ec377d5a9916db3ecda1fcdf769d0730779ac1551630f`.
- 호스트 실패 응답 해시: `c27a6e722a072ebc0d909597dc14e76aa23f8abc898c9a063234e144579c3727`.

## 적용 절차

사용자가 2026-10-01 전역 완료 훅 수정을 명시 승인했다. 별도 로컬 worktree에서 구현한다. 설치기는 기본 dry-run이며 적용 시 원본 SHA-256을 요구하고 직전 재확인·백업·원자적 교체를 수행한다. 훅 정의·신뢰 설정은 변경하지 않는다.

```sh
python3 -B tools/test-task-finish-three-step-failure.py
python3 -B tools/task-finish-three-step-failure.py
python3 -B tools/task-finish-three-step-failure.py --apply --expect-sha256 <dry-run의 원본 SHA>
python3 ~/.codex/hooks/task-finish/gate.py reconcile
```

## 실제 적용 결과

2026-10-01 사용자 승인에 따라 검증된 설치기를 전역 `~/.codex/hooks/task-finish/gate.py`에 적용했다. 원본은 `~/.codex/hooks/task-finish/backups/three-step-failure-20261001T032208481570Z.py`에 보존했다. 원본 SHA-256은 `511b9685c9d6f29c3612c126279bd75daee182f1e4d2ff7371dfeff3d6b49ba8`이다.

공식 `reconcile`에서 대상 `exec-b53f2704-649d-404b-8b10-adea854d114b`가 미확인 목록에서 해소됨을 확인했다. 종료 복구 이후 이전 iCloud 스냅샷과 새 clone의 차이 1,060개가 재관찰됐다. 현재 working/staged/HEAD diff가 없고 각 경로가 이미 tracked(25개) 또는 새 clone에 부재(1,035개)임을 확인한 뒤, 이번 세션의 Jev·훅 작업 밖에 있는 영상 산출물·프로젝트 이동 설정·타 배포문서에 한해 공식 `exclude`로 사유를 기록했다. 실제 파일 수정·삭제는 없다.

설치 후 회귀와 멱등성도 다시 확인한다. 전역 설치 및 현재 세션의 reconcile 실행은 확인했지만 다른 열린 모든 세션의 즉시 로드·수신까지 주장하지 않는다. 이 수정은 Jev 기능·운영 배포 변경이 아니다.

설치된 gate.py SHA-256: `101c4d4da3ffdae56edd0a95f83f510e63bc767df1e7eb7ead1f674e065e577f`.
