# 키프레임 요청·파일·승인 증거

- 기준: PR181 승인 머지 `d2e806648cb35d2baec766b26d25c85d37b7f11f`. 머지 tree가 244개 시험을 통과한 PR head와 동일함을 확인.
- 목표: shot-v1 장면별 요청/키프레임 지문, 실제 16:9 PNG 사본, 사람 승인 원문/검수 항목, 현재 장면/파일 재검사.
- 소유: Codex 리드, drama-keyframe-evidence worktree. 독립 Codex 검토 사용.
- 완료 조건: 파일 변조·대상/자산/장면 변경·동시 출력 충돌·대사 문구만 변경·legacy 회귀 시험, 타입 검사, 독립 검토, 본인 커밋/push/PR.
- 대본에 승인 필드를 쓰지 않고 새 증거 디렉터리만 만든다. 회차 편집 잠금과 실행 원장이 아직 없으므로 기존 대본 수정이나 생성/조립 허용으로 확대하지 않는다. 기존 내용 지문 의미는 유지된다.
- 범위 밖: 실제 이미지 생성/유료 API 호출, 회차 전체 키프레임 시트, 원격 assetId의 출처 증명, 승인자 신원 인증, 실행/출시 승인. 모든 결과 authorized:false.
- 진행: 구현·검증·독립 Codex 리뷰 완료. 작업 브랜치 커밋/push와 PR 생성으로 전달하며, 기준 브랜치 반영은 별도 머지 승인 후.

- 구현 중 타입 검사에서 keyframe-check CLI 닫는 괄호 1개 누락을 발견해 수정. 기능 검사 이전의 문법 오류이며 재검사한다.

## 사용 흐름

CLI 공통 입력은 `--series s.json --episode e.json --cut c1`; 연결 회차면 `--prev-episode prev.json`도 제공한다.

1. `keyframe-build ... --aspect 16:9 --out request.json`: 구도·얼굴·의상 순서 참조와 첫 비트 시작 요청. 부모 출력 폴더는 미리 준비한다.
2. 사용권 있는 실제 이미지 확보 후 `keyframe-source ... --asset <id> --file image.png --out source-dir`: 16:9 단일 PNG를 새 폴더로 보관.
3. 사람이 실제 이미지를 보고 제공한 JSON을 `keyframe-approve ... --asset <id> --source source-dir --approval human.json --out approved-dir`로 기록한다. 승인 JSON은 schemaVersion=1, decision=approve-keyframe, source의 subjectDigest, approvedBy, userQuote, recordedBy, ISO at, checks(composition/cast/wardrobe/props/safety 모두 true)가 필수다. 합성 테스트 승인을 실제 제작에 사용하지 않는다.
4. `keyframe-check ... --asset <id> --source approved-dir`: 현재 장면·원격 식별자·실제 파일·픽셀·승인 결합 검사. ok=true도 영상 생성 권한이 아니다.

- 요청/증거/승인 출력은 덮어쓰지 않는다. 출력 중 실패한 폴더는 보존되며 완료로 사용하지 않는다. source는 evidence.json, approved는 binding.json이 마지막 완료 표식이다.
- 파일 모드 0400은 실수 방지일 뿐 동일 OS 사용자의 변조를 막는 인증 장치가 아니다. 검사 시 실제 바이트를 다시 읽는다.
- 요청·승인 JSON은 소비 경로와 같은 1MiB 제한. 독립 리뷰가 발견한 JSON 이스케이프 팽창(입력 약802KB → 요청약1.6MB)을 출력 전 거부하도록 수정했다. source는 폴더 생성 전 거부하며 회귀 시험으로 고정한다.
- 신규 focused 46개 최초 통과. 독립 검토의 크기 경계 수정 후 통합 결과를 아래에 확정한다.

## 최종 검증 (2026-10-11)

- Node v22.23.3, 고정 atomworks 소비 SDK ad94eaef54dbb0babe3b5916ca6122a5cc841545. 실제 외부 서비스 호출 없음.
- 타입 검사: contracts·drama-series·drama-runner 모두 통과.
- drama-series 269개 + drama-runner 22개 = **291개 통과**, 신규 키프레임 47개 포함. 기존 회차 golden/기존 지문 의미 유지 확인.
- 실제 CLI build → source → 제공된 시험 승인 기록 → check, 실제 합성 PNG 변조/교체/재해시·다중 프레임·잘못된 비율·FIFO·symlink·중복 JSON·동시 출력 충돌 검증. 테스트 승인자는 synthetic-user이며 실제 제작 승인이 아니다.
- 독립 Codex `/root/wiki_semantic`: S2 JSON 출력/소비 크기 불일치 1건 발견 → 수정 후 원래 반례 재현에서 파일/폴더 생성 전 거부 확인 → PASS, 남은 S1/S2 없음. 정상 PNG·장면 변경·파일 변조도 독립 재현.
- 리뷰 고정 지문: core/keyframe-digest.ts `953b5cb3e3eb8a00dc5c1e47e8a6d62db6f0552d7e8d90e0f7f717b05a7cca55`, adapters/keyframe-evidence.ts `267388ef27b5570b6bcfec58b5e1b8b2bc5173c20f9f00b5c86f76382937582f`.
- 로그: 지정 iCloud `gpt 작업/commerce-automation-kit/20261011-drama-keyframe-evidence/`의 `typecheck-final.log`, `drama-final.log`, `runner-final.log`; 독립 재현은 `reviewer/`. Git에 테스트 출력·이미지는 넣지 않음.
- 다음: 이 PR 머지 승인 후 회차 편집 잠금/실행 상태와 전체 컷 승인 결합을 별도 작업으로 진행. 현재 단계로 생성·조립 차단을 해제하지 않는다.
