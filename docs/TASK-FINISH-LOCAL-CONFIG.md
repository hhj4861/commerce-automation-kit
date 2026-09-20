# 승인된 로컬 비밀 설정의 완료 기록

2026-09-20 사용자가 `.env` 비밀값을 Git에 올리지 않고 해시·승인 사유로 기록하는
기능을 명시적으로 승인했다. 기존 `hold`는 미완료이고 `exclude`는 타 세션 파일만
대상이라, 본인이 수정한 Git 제외 설정을 정상적으로 기록할 경로가 없었다.

## 허용 범위

- 현재 세션이 등록·관찰한 `.env`, `.env.local`, 환경별 `.env.production` 등의
  로컬 설정만 대상이다. 코드와 `.env.example` 같은 템플릿은 허용하지 않는다.
- Git ignore 적용, index·HEAD·작업 시작 커밋에 미등록, 실제 일반 파일,
  권한 0600, 하드 링크 없음, 저장소 밖/심볼릭 링크 없음 조건을 매번 확인한다.
- 먼저 `local-config-plan --path .env`로 경로·해시·소유 기록을 확인한다.
  사용자의 명시적 승인 후 반환된 `source_digest`와 승인 사유를 전달한다.

```sh
python3 ~/.codex/hooks/task-finish/gate.py local-config-plan --path .env
python3 ~/.codex/hooks/task-finish/gate.py approve-local-config --path .env \
  --expect-source-digest '<사전 확인된 digest>' --reason '<사용자 승인 근거>'
```

파일 내용이나 비밀값은 기록하지 않는다. Git blob과 원시 바이트 SHA-256, 경로,
권한, 승인 사유·시각·세션, 기존 소유 기록을 보존한다. 승인 명령은 완료 상태를
만들거나 기존 보류·미종료 호출·다른 파일의 문제를 지우지 않는다. 일반 Stop
검사가 나머지 파일의 커밋과 실제 upstream 반영을 계속 확인한다.

승인 후 내용·권한·ignore·Git 추적 상태가 바뀌면 승인은 더 이상 유효하지 않다.
설정을 변경한 경우 새 계획과 명시적 재승인이 필요하다. 해당 파일의 이전
소유·감사 기록은 삭제하지 않는다.

## 설치와 검증

구현은 기존 훅 전체를 덮어쓰는 사본 대신 검증된 부분 패치다. 다른 세션이
수정한 훅도 재검증하며, 예상하지 못한 코드나 설치 직전 원본 변경을 발견하면
적용하지 않는다. 기존 파일 백업을 남기고 `hooks.json`, 신뢰 설정, 상태 DB를
직접 편집하지 않는다. 자동 완료 결과는 실제 Stop 이벤트와 구분한다.

```sh
python3 tools/test-task-finish-local-config.py
python3 tools/task-finish-local-config.py
python3 tools/task-finish-local-config.py --apply --expect-sha256 '<검증한 훅 SHA-256>'
```

회귀 테스트는 임시 Git 저장소에서 승인 전후, 변경된 비밀값, 권한·ignore 변경,
staged/committed 파일, 심볼릭 링크·하드 링크, 타 세션 소유, 진행 중 수정,
기존 보류, 미확인 파일, 일반 코드 미커밋·미푸시를 검사한다. 실제 비밀값은
테스트 입력에 사용하지 않는다.
