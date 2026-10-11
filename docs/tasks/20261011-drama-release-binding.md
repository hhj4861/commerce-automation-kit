# 앞 회차 출시 증거·프레임 결합 기반

- 기준: PR178 머지 cf463e089ace31680d3e7ac7aa3405731af0c54e / feat/drama-release-binding. 사용자 머지·후속 구현 승인.
- 담당: Codex, 별도 worktree. 독립 Codex 리뷰 유지, Claude 호출 없음.
- 범위: 마지막 컷 클립 사본+실제 마지막 RGB24 디코딩 프레임 고정; 내용·파일 SHA manifest; 전달된 사람 승인 기록의 subject 결합; 현재 회차 문맥에 결합해 매 사용 시 원본 바이트 재대조하는 CLI.
- 권한 경계: released 상태나 사람 승인을 자동 발급하지 않는다. 반환 authorized=false. 전달 기록 일치 확인은 사용자 신원 인증이 아니다. 전체 컷 판정·실행 상태·출시 관문 미구현으로 연결 plan/assemble 차단 유지. F08/F10 전체 완료 아님.
- 완료 기준: 위조/오래된 승인·다른 회차·영상/PNG교체·가짜 마지막프레임·동시/기존출력 거부, 합성 실제 ffmpeg+CLI시험, 기존118+runner22 유지, 독립 리뷰·커밋·push·PR.
- 현재: 구현·검증·독립 리뷰 통과. 작업 브랜치 커밋·push·PR 진행. 실제 영상·승인·유료 API·외부 전송 없이 합성 파일만 시험. 산출물은 지정 iCloud commerce-automation-kit/20261011-drama-release-binding, SQLite는 로컬 nonsynced test-runtime.

## 검증 결과 (2026-10-11)

- Node 22.23.3, 기존 lockfile scoped 설치. contracts·drama-series·drama-runner 타입/구문 검사 통과.
- drama-series 135/135, drama-runner 22/22 통과(총157). 기존 legacy 동작·실제 ffmpeg 조립·runner E2E 포함. 새 증거 시험17개: 계약9+실제 CLI8.
- 독립 Codex `/root/wiki_semantic` PASS: 실제 VFR7프레임·회전90도·PTS5초 합성 영상의 전체 rawvideo 마지막 픽셀=PNG, 회전 후64×96을 포함한 픽셀 지문 일치. 추가 S1/S2 없음.
- 검토 고정 SHA-256: adapter `6d44a3aa52d65a111d7522447dca3e72e45f0b7268f1ccc02386300e6c550cff`, core `5d52e531046a80cebe9be4f204195a5a90071826f48e9adb684e4266edd904fa`, CLI `3c4758f874103c08aba4c59d619a8efc9ac00b3d94728e8f21c7353b6ae0d31f`.
- 재작업: PNG 사전 probe에 ffmpeg 전용 옵션이 들어간 오류를 png_pipe 입력으로 수정. 회전 fixture의 출력 metadata가 실제 display matrix를 만들지 않아 입력 display_rotation 옵션과 ffprobe 단언으로 교체. 수정 후 전체 검증 통과.
- 근거: 지정 iCloud 작업 폴더의 `typecheck.log`, `drama-tests.log`, `runner-tests.log`, `release-source-target.log`, `review/vfr-rotation-jYMVX6/true-bundle`.
- 다음: PR을 드라마 기준 브랜치로 제출. 머지는 해당 PR 사용자 승인 후. 이후 전체 컷 판정·실행 상태·출시 관문을 결합할 때만 연결 생성 차단 해제를 검토한다.
