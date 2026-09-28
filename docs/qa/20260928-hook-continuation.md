# 완료 훅 자동 후속 메시지 반복 수정

## 원인

`UserPromptSubmit`은 `[codex-task-finish]`로 시작하는 문자열만 자동 후속 메시지로 인식했다. 실제 Codex 메시지는 `<hook_prompt hook_run_id="…">[codex-task-finish]…</hook_prompt>` 형식이었다. 이 메시지를 새 사용자 요청으로 오인하면서 `hold`를 삭제하고 `attempts`를 0으로 되돌려 동일한 종료 증거 누락을 계속 재요청했다.

## 수정과 보존 범위

`tools/task-finish-hook-continuation.py`는 검토한 설치본 SHA-256에만 적용되는 설치기다. 정확히 감싸진 task-finish 자동 메시지와 기존 stop_hook_active를 인식해 보류 및 반복 횟수를 유지한다. 일반 사용자 입력은 이전처럼 재개한다. 파일 소유권, 커밋·푸시 확인, 종료 증거 검증은 바꾸지 않는다. 과거 중단 호출을 성공으로 만들거나 DB·원본 로그를 편집하지 않는다. 적용 전 백업과 원자적 교체를 수행한다.

## 검증

`python3 tools/test-task-finish-hook-continuation.py`: 7개 통과. 실제 임시 SQLite 상태를 사용해 자동 메시지의 보류 유지, 새 사용자 요청의 재개, 3회 후 미완료 중지, 원래 pending 호출 보존, 잘못된 wrapper 거부, 설치본 변경 시 거부를 확인했다.

사전 검증: 후보 SHA-256 `3a6390eca9e616cb14c15fc1320c86b6fc13188e27f8a4c6bbcd0b7e87db2816`.

현재 디스크 가용 공간은 약 92GiB이며 이번 상태 조회·임시 SQLite 검사는 성공했다. 과거 `disk I/O error`나 `unable to open database file`의 원인은 이 검사로 확정하지 않는다. DB 삭제·재생성으로 증거를 없애지 않는다.

과거 daemon 재시작 직전 호출 `exec-7c2d308f-afb2-48a3-8f69-050f6f891e47`의 종료 증거는 여전히 없다. 이 수정은 그 기록을 완료로 바꾸는 것이 아니라, 미완료 보류를 보존하고 무한 자동 재요청을 중단하는 수정이다. 전역 설치 여부와 실제 Stop 수신은 별도로 확인한다.

## 실제 로컬 설치

2026-09-28 검증·커밋한 설치기를 `--apply`로 실행해 정상 종료했다. 설치본 SHA-256은 위 후보와 일치한다. 백업은 `/Users/admin/.codex/hooks/task-finish/backups/hook-continuation-20260928T075936971538Z.py`다. `hooks.json`, 신뢰 목록, 증거 DB와 원본 transcript는 수정하지 않았다. 설치 후 전체 상태 조회도 정상 종료했다. 새 Stop 자동 후속 메시지에서의 실제 실행 및 이미 열린 모든 세션의 수신은 아직 확인하지 않았다.
