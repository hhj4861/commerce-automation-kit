# Codex–Claude 협업 연결 점검 · 2026-10-03

## 확인된 상태

- 사용자 지정 리드: Codex 01a0b3ac-df1b-7293-a99c-74f3c6e650d0.
- 기존 Claude: PID 35652, 세션 0169c5a6-7305-44fd-a610-72b142184d2b.
- Claude 보고서 `.git/peer-mailbox/claude-35652-to-codex-lead-001.md`를 읽었다.
- 리드 답신 `.git/peer-mailbox/codex-lead-to-claude-35652-001.md`를 저장했다. 런타임 메시지이며 Git 커밋 대상이 아니다.
- HyperFrames P0(본문 챕터 전환/숫자 비교/그림 중심 요약)만 승인했다. 기준 origin/main 확인 리비전: `90f86d81f181b7d49ebd229be1e589829c4d9058`. 별도 worktree에서 진행하며 스튜디오 통합·운영 배포·머지는 포함하지 않는다.
- iTerm CUA 연결은 반복 시간 초과. orch-flow peer-inbox는 ORCH_DISABLED. 해당 제한을 해제하지 않았다.
- 저장소 engine-exchange 두 플래그는 OFF이나 이번 사용자 지시는 지정 Claude와의 협업을 명시적으로 허용한다. 공유 설정은 바꾸지 않았다.

## 실제 양방향 확인 — 후속 검증

초기 미연결 기록 이후 Claude가 이미 자체 Monitor를 실행하고 있음이 실제 답신으로 확인됐다. Channels 재시작은 현재 협업 연결에 필요하지 않다.

1. Codex가 리드 답신 001을 생성 → Claude가 002 ACK 작성. 승인 범위를 항목별로 재진술했다.
2. Codex가 답신 002로 iCloud worktree 경로 정정 요청 → Claude가 003으로 로컬 이동·진행 결과를 보고했다.
3. Codex가 읽기 전용 2초 파일 감시를 시작했다. 지정 수신 파일명만 읽고, symlink/64KiB 초과 파일을 거부하며, 2초간 안정된 파일의 이름+SHA256으로 중복을 억제한다.
4. 003 보고를 감지한 감시 실행이 공식 `send_message_to_thread` 도구로 **현재 Codex 스레드**에 알림을 보냈다. 도구 성공 응답뿐 아니라 실제 대화에 `[Claude 35652 동료 답신 자동 수신]` 이벤트가 도착했다. 리드가 해당 003 본문을 읽었다.

003 SHA256: `3dd26fa2dfe9f36a16fa16c8ee03d10a97b49c02a65d180d85ab77180d85d64b`.

Claude 보고 기준 worktree는 `/Users/admin/workSpace/commerce-automation-kit-worktrees/hyperframes-poc`로 이동됐고 P0가 진행 중이다. 이 보고 수신이 P0 렌더 결과의 리드 검증 완료를 뜻하지 않는다.

## 현재 동작 범위와 재개 방법

- Claude 수신: 기존 세션 Monitor가 새 `codex-lead-to-claude-35652-NNN.md` 파일을 감지한다. 덮어쓰지 않고 새 순번을 쓴다. 30분 감시가 만료되면 Claude가 갱신한다.
- Codex 수신: 실행 중인 감시 셀은 새 `claude-35652-to-codex-lead-NNN.md`를 감지해 `mcp__codex_tui__send_message_to_thread`로 실제 리드 스레드에 알린다. 현재 실행은 30분 한정이며 종료 시 만료를 알린다. 작업을 재개할 때 미확인 파일을 읽고 감시를 재가동해야 한다.
- 이는 **현재 작업 세션에서 검증한 양방향 자동 알림**이다. 앱 종료·머신 재부팅·도구 런타임 종료 이후에도 살아 있는 24시간 데몬이 아니다. 감시가 켜져 있다는 증거 없이 상시 연결로 보고하지 않는다.
- 공식 app-server proxy 읽기 시험은 18초 내 응답을 받지 못했고 종료했다. 이것을 성공 경로로 사용하지 않는다.
- 내부 소켓 인증키, 다른 세션 권한, hook/permission 설정, 전역 orchestration 토글을 변경하지 않았다.
- 동료 답신은 협업 자료다. 자동 알림을 새 사용자 권한이나 PR 머지 승인으로 해석하지 않는다. 단순 ACK에 무한 재답신하지 않는다.

공식 참고: https://code.claude.com/docs/en/channels , https://learn.chatgpt.com/docs/app-server . 실제 성공 경로는 설치된 Codex 네이티브 스레드 메시징 도구와 기존 Claude Monitor다.

JEV 자체는 별도 품질 NO-GO 상태이며 `20261003-jev-integration-verification.md`가 근거다.
