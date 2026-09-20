# 종료 조회와 명령이 섞인 도구 호출의 실패 복구

`write_stdin` 두 번 → 명령 → 승인 거절, 또는 실패한 패치 → 실행되지 않은 조회·명령처럼 기존 훅 문법이 해석하지 못하는 순차 호출을 지원한다. 원본 transcript 및 상태 DB를 수동으로 수정하지 않는다.

복구는 신뢰된 호스트 기록의 세션·턴·바깥 호출·준비 시각·소스 해시를 대조한다. 앞선 조회와 명령은 각각 유일한 네이티브 완료 이벤트, 프로세스 ID, 실제 종료 코드와 명령이 일치해야 한다. 처음 반환에 session ID만 있었더라도 실패 단계 준비 시점 이전의 실제 종료 증거가 필요하다. 실패 뒤의 소스 단계는 실행됐다고 추정하지 않는다.

버전 11이 지원하지 못했던 문법만 과거 복구한다. 이미 지원되는 문법이나 새 버전의 입력 불일치, 실행 중 조회, 동적 JavaScript, 다른 세션·턴, 누락·중복·모순된 증거는 계속 미확인으로 남긴다. 거절은 `declined`, 생성 실패는 `not_started`, 패치 검증 실패는 `failed`이며 종료 코드는 `null`이다. 파일 변경·소유권·커밋·원격 반영·사용자 보류 검사는 변경하지 않는다.

검증·설치:

```sh
python3 tools/test-task-finish-mixed-dispatch.py
python3 tools/task-finish-mixed-dispatch.py
python3 tools/task-finish-mixed-dispatch.py --apply --expect-sha256 <직전 검증의 해시>
python3 ~/.codex/hooks/task-finish/gate.py reconcile
```

설치기는 원본을 백업하고, 검증 후 훅 소스가 달라지면 교체를 거부한다. 설치 성공과 실제 Stop 통과는 별도 확인한다. 설치만으로 미완료 작업이나 사용자 인증 테스트를 완료 처리하지 않는다.

## 운영 산출물 정리

커밋 대상으로 잘못 남은 운영 실행기 키와 설정은 Git 밖 `~/Library/Application Support/Shopshorts/`로 보존하고, 로그는 `~/Library/Logs/Shopshorts/`에 둔다. 실행기에는 `CAK_RUNNER_KEY_FILE`로 새 키 경로를 명시한다. 키를 새로 발급하거나 중앙의 공개키·OAuth 인증을 변경하지 않는다. 기존 파일은 새 경로의 인증·서버·실행기 정상 동작을 확인한 뒤 정리한다. 임시 PR 본문도 운영 보관 경로로 이동한다.

로컬 서버·제작 워커 재시작 시 기존 문서의 실행 명령 앞에 다음 값을 추가한다.

```sh
CAK_RUNNER_KEY_FILE="$HOME/Library/Application Support/Shopshorts/credential-runner.jwk"
```

이 값은 환경변수로 export하거나 Node 명령과 같은 줄에 지정한다. LLM 전용 실행기 설정은 `~/Library/Application Support/Shopshorts/llm-account-worker.plist`에 있으며, 현재 로그인 세션의 launchd에 등록된다. 별도 호스트 이전·재부팅 자동 기동은 이 복구 범위에 포함하지 않는다.
