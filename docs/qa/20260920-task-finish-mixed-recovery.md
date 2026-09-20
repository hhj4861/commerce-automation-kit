# 작업 완료 보류 복구 — 2026-09-20

## 원인

`functions.exec` 한 호출에서 `apply_patch`가 완료된 뒤 `exec_command`가 자동 승인 검토에서 실행 전에 거절됐다. 실제 로그에는 파일 변경 완료 이벤트와 호스트 거절 응답이 모두 있었지만, `batch_failure_receipt`는 앞선 단계가 셸 명령인 경우만 해석했다. 파일 수정 이후의 거절은 종료 기록으로 복구되지 않았다.

대상은 이 프로젝트 세션의 `exec-45338b7c-16e3-419c-914b-af85ae0c440f`다. 원본 세션 로그의 바깥 호출 `call_k4oK03dm9hgIQ95KCXZCoRu2`, ordinal 661의 네이티브 `FileChange completed`, ordinal 662의 `CreateProcess Rejected` 응답을 확인했다. 이전 알림 구현·성능 검증의 커밋/푸시 실패가 원인은 아니었다.

## 수정

`tools/task-finish-mixed-recovery.py`는 기존 훅의 순차 배치 실패 판정에서 앞선 파일 변경도 확인할 수 있도록 작은 패치를 적용한다.

- 절대 경로의 `Update File`만 지원한다. 네이티브 unified diff의 경로 집합, hunk별 이전/이후 내용과 줄 수가 실제 요청과 정확히 대응해야 한다.
- 기존 세션·턴·호출 소스 해시·준비 시각·유일한 호스트 응답·유일한 미종료 호출 검사를 그대로 거친다.
- 앞선 파일 수정은 `completed` 네이티브 이벤트와 `{}` 도구 결과가 모두 있어야 한다. 실행 중·실패·누락·중복·다른 수정·모호한 문맥은 복구하지 않는다.
- 거절된 뒤의 명령은 `declined`, `exit_code: null`로 기록한다. 실행 성공이나 exit 0으로 바꾸지 않는다.
- 지원 범위는 요청 chunk와 네이티브 hunk가 1:1 대응하는 수정이다. 파일 이동/삭제/추가, hunk 병합 등 지원하지 않는 형식은 계속 미확인 상태를 유지한다.
- 상태 DB와 원본 로그를 수동 수정하지 않는다. 훅 신뢰 설정·`hooks.json`·소유권·커밋·원격 확인 규칙도 변경하지 않는다. 기존 `reconcile` 경로로만 실제 기록을 복구한다.

## 적용 절차

```sh
python3 tools/test-task-finish-mixed-recovery.py -v
python3 tools/task-finish-mixed-recovery.py          # 검증만
python3 tools/task-finish-mixed-recovery.py --apply  # 원본 백업 후 실행 코드 교체
python3 ~/.codex/hooks/task-finish/gate.py reconcile
```

설치 대상은 `~/.codex/hooks/task-finish/gate.py`이며 변경 전 코드는 같은 디렉터리의 `backups/mixed-patch-<UTC>.py`에 보존한다. 설치 중 다른 세션이 훅을 수정했다면 덮어쓰지 않고 중단한다. 재실행은 멱등적이다. 이는 사용자가 요청한 로컬 복구 적용이며, 구현 브랜치의 PR 머지와 별개다.

## 검증

- 신규 회귀 테스트 10개 통과: 정상 복구, 원래 셸 배치 동작, 실패를 성공으로 인정하지 않음, 경로/내용 불일치, 추가 변경, 잘못된 줄 수, 모호한 문맥, 네이티브 증거 누락·중복·다른 세션·늦은 종료, 잘못된 호출 바인딩, 명령이 출력한 오류 문자열 거부.
- 기존 디렉터리/후행 조회 복구 테스트 8개 통과.
- 설치 전 실제 세션 로그를 읽기만 하는 검증에서 대상 호출이 `batch-dispatch-failure / declined / exit_code=null / step_index=1`로 판정됨을 확인했다.

- 기존 훅의 격리된 전체 프로토콜 회귀 142개 통과(359.535초). 테스트 원본은 기존 hook source repository에서 읽어 임시 디렉터리로 복사했으며 실제 상태 DB를 사용하지 않았다.
- 전체 검사 중 다른 세션이 추가한 로컬 설정 승인 기능을 보존했다. 최신 설치 파일을 기준으로 신규 10개를 재검증한 뒤 패치를 적용했으며, 실제 설치된 코드의 커밋·푸시 차단 및 종료 증거 관련 핵심 회귀 5개도 통과했다(18.006초).

## 실제 적용 및 복구 결과

- 전역 실행 파일 `/Users/admin/.codex/hooks/task-finish/gate.py`에 적용했다. 변경 전 백업은 `/Users/admin/.codex/hooks/task-finish/backups/mixed-patch-20260920T021843740477Z.py`다.
- 공식 `reconcile` 실행 후 문제의 호출은 미종료 목록에서 제거되고 `batch-dispatch-failure / declined / exit_code=null`로 기록됐다. 실제 실행 전 거절 상태를 유지한다.
- 보류 사유는 없음(`hold: null`). 오래된 관찰 범위에 포함된 기존 파일 1,034개, 다른 세션이 이미 커밋한 파일 39개, 다른 세션의 제거된 임시 빌드 파일 2개는 Git 이력·현재 파일 상태·본인 소유 목록과 대조하고 공식 `exclude --reason`으로 분류했다. 본인 소유 파일은 제외하지 않았다.
- 현재 프로젝트의 공식 검사 함수 `check`는 소유 미확인 0개, 커밋·원격 확인 문제 0개를 반환했다. 이는 완료 조건의 사전 확인이며 최종 Stop 이벤트를 수동 생성한 결과가 아니다.
- 복구 소스·테스트·이 문서는 별도 구현 브랜치 `fix/task-finish-mixed-rejection`에서 관리한다. 전역 실행 파일 적용과 기준 브랜치 머지는 별개이며 기준 브랜치는 머지하지 않았다.
