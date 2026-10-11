# 드라마 atomworks 어댑터 첫 단위

- 담당: Codex. 사용자 승인: 첫 구현 단위의 호환 시험·무과금 소비 기반·독립 리뷰·PR.
- 기준: commerce eae6be572e33e0c0932a5deeb3e44685c2127aa6, atomworks ad94eaef54dbb0babe3b5916ca6122a5cc841545.
- 범위: 실제 1화 validate/plan stdout·보고서·종료코드 고정, 합성 미디어 조립, apps/drama-runner 초안 DTO/로컬 SQLite.
- 제외: 실제 유료/제공자 호출, 기존 승인 전환, shot-v1/F10, 원본 상태 변경, 배포·새 PR 머지.
- 완료 기준: 호환 golden 일치, 합성 조립 및 기존 drama 시험, 새 소비자 시험·깨끗한 설치, 독립 Codex 리뷰, 커밋/push/PR.
- 현황: 구현·통합 검증·독립 리뷰 PASS. 구현 a8d1e65를 작업 브랜치에 커밋/push하고 [PR #177](https://github.com/hhj4861/commerce-automation-kit/pull/177)을 게시했다. 기준 브랜치에는 아직 미반영.
- 다음: PR을 검토해 머지 여부 결정. SQLite는 동기화되지 않는 로컬에, 미디어·시험 로그는 지정 iCloud 작업 루트에 둔다.

## 구현 중 관측

- 실제 1화 입력 22개: validate=0, plan=1(props·scenario stale), budget=1에서도 차단. 원본 수정 없이 golden으로 보존.
- 첫 어댑터 시험의 상대 import 경로 한 단계 초과로 module-not-found 발생. test 파일 기준 경로를 바로잡음; 제품 로직 실패와 구분.
- 공개 SDK digest 반환형은 sha256 문자열, Principal kind는 agent/human. 로컬 계약 원문에 맞춤.

- 새 어댑터 20/20 초기 통과. 기존 시험 81/89: CLI 8개가 npx/tsx IPC EADDRINUSE로 실행 전 실패. 긴 iCloud TMPDIR에서 재현. CLI 시험만 소켓이 필요 없는 `node --import tsx`로 변경(제품 CLI 무변경), 오류 원문도 보존.
- 외부/legacy DB 보호: 전용 application_id가 없는 기존 SQLite는 읽기 전용 검사 후 거부. 초기화 중단 DB도 자동 추측 복구하지 않음.

## 통합 검증

- runner 21/21, 기존 drama 89/89(10 files, skip 0). 실제 FFmpeg 자체 합성 조립·오디오 검증 포함. 실제 에피소드 미디어 시험 아님.
- drama tsc 및 runner JS 구문 검사 통과. 소비자 파일 경로는 Node22.23.3 고정 SDK 공개 진입점으로 확인.
- SDK 설치를 apps/drama-runner/runtime의 별도 lockfile로 분리. root lock의 외부 extraneous 잔재 3개 제거; 일반 commerce 설치가 외부 file 링크에 의존하지 않게 함.
- commerce/runtime npm ci 후 runner 21/21 재통과. 로그: 지정 작업 artifacts의 commerce-clean-install.log, runner-clean-install.log, runner-test.log, legacy-test.log.
- 독립 Codex 리뷰 진행 중. 이 첫 단위는 atomworks actual adoption으로 등록하지 않음.

- 독립 검토 S2-1: 전용 DB의 application_id 읽기 검사가 exclusive lock도 foreign DB(2)로 뭉갬. 실제 SQLite 잠금 반례 확인. busy/locked는 재시도75, 외부DB는2, 기타 저장 오류는1로 구분하고 잠금 해제 후 재전달까지 회귀 추가.

## 최종 결과

- 최종 lockfile의 오프라인 root npm ci 성공(586 packages). SDK runtime 별도 clean install·preflight 성공.
- 최종 통합: runner **22/22**, drama **89/89**, 모두 skip 0. 기존 drama tsc / runner JavaScript 구문 검사 / diff --check 통과.
- 독립 Codex (`/root/wiki_semantic`) **PASS**, 미해결 S1/S2 없음. 직접 확인: strict JSON, 승인/지문 변조, foreign DB 바이트 보존, owned DB 잠금·해제 4/4; 원본 22개 SHA를 eae6be5 git blobs와 대조. 전체 시험/설치는 리드 증거.
- 리뷰 대상 draft.mjs SHA-256: `1e25a95b6769e65d41295db6c5aef1fcf725a292395bb34a6dc6772c90004072`.
- PR 기준은 feat/drama-regression-pilot(eae6be5). main/운영 전환·새 PR 머지·실제 소비 adopted 등록은 이번 작업에서 수행하지 않음.
