# 회차 편집 잠금과 전체 컷 키프레임 승인 결합

- 기준: 사용자 승인 PR182 merge 30dba8d (검증 head56884cc와 동일 tree).
- 목표/소유: Codex 리드의 drama-episode-approval worktree. shot-v1 대본 쓰기를 agent+session 소유·소유권 revision·실제 파일 SHA CAS로 보호하고 모든 컷의 실제 키프레임 승인 증거를 현재 회차 문맥에 결합.
- 완료: 경쟁 소유/쓰기/인계·오래된revision/SHA·강제종료 시 fail-closed·기존 CLI 쓰기보호·전체 컷 누락/중복/변조/대사변경·legacy 회귀 검증, 독립 Codex 리뷰, 본인 commit/push/PR.
- 잠금은 협조하는 CLI 작업자의 편집 직렬화다. OS 권한 보안/다중기기 분산잠금이 아니다. `<episode>.lock.json` 소유권 기록과 원자 mkdir writer mutex를 사용하며 lease/자동 회수 없음. 프로세스가 죽으면 stale writer는 명시 오류로 정지, 살아 있는 writer를 시간 초과로 빼앗지 않는다.
- 소유권 revision은 lock/handoff/release마다 증가, 편집 CAS는 원본 바이트 SHA를 사용. 상태와 대본을 한꺼번에 바꾸는 트랜잭션을 가장하지 않는다. 편집은 대본 파일 한 개를 원자 교체하며 소유권은 변하지 않는다.
- 키프레임 결과는 컷별 사람 승인 기록의 결합이다. 회차 미리보기 승인이나 신원 인증/영상 실행 허가가 아니다. 모든 결과 authorized:false, plan/assemble 차단 유지.
- 진행: 구현·통합 검증·독립 Codex 재검토 PASS. 작업 브랜치 commit/push/PR로 전달하며 기준 브랜치 반영은 별도 승인 후. 실제 제작·유료 호출·운영 배포 없음.

- 첫 타입검사에서 episode-edit 응답의 authorized 중복 필드를 발견해 제거. 잠금 status가 이미 authorized:false를 제공하므로 동작 변경 없이 중복만 정리한다.

- 독립 리뷰 S2: 대소문자 비구분 파일시스템에서 .LOCK.JSON 출력으로 .lock.json을 덮을 수 있음. 출력 경로의 실제 부모를 정규화하고 예약 메타데이터 경로를 대소문자 무시 검사한다. writer 디렉터리의 부모 symlink 별칭도 같은 경로로 검사한다. 회귀 시험 추가.

## 검증

- Node22.23.3, atomworks 소비 pin ad94eaef54dbb0babe3b5916ca6122a5cc841545.
- 수정본 타입 검사 3개 workspace 통과. drama-series **292개**, drama-runner **22개**, 총 **314개** 통과(신규23개).
- 실제 CLI 소유권 인계/대사승인/대본편집/판정 반영/전체컷 build-check, 독립 프로세스 2개의 lock·edit 경쟁, 쓰기 전후 SIGKILL, PNG·series 검사 중 변경, alias 출력 우회를 포함한다. 기존 legacy golden 유지.
- 로그: 지정 iCloud `gpt 작업/commerce-automation-kit/20261012-drama-episode-approval/`의 typecheck-final.log·drama-final.log·runner-final.log. 상태/미디어 합성시험이며 실제 제작 승인이 아니다.
- 한계: 대본 한 파일의 원자 교체와 협조 작업자 잠금만 제공. 판정 보고서·대본 다중파일 거래/자동 crash 복구/실행 원장은 후속 범위. 다른 기기 동시 편집 및 같은 OS 사용자의 임의 파일 변경에 대한 인증 방어를 주장하지 않는다.

- 독립 Codex `/root/wiki_semantic` PASS: 대소문자 잠금 메타 덮기 원래 CLI 반례, writer 부모 symlink, release/reacquire 옛 guard 거부 확인. 실제 PNG 집계의 대사변경·인계·앞 컷 검사 후 변조·시리즈 변조 focused4개 통과. 강제종료 실행 증거는 리드가 담당. 남은 S1/S2 없음.
- 검토 고정 SHA256: lock `697244f9036c3757a254750a517a65e3a88345302421955439146f23de9db4a7`, aggregate `df5a34225d109d8396ca2dc045357e13be25c43c8d5f9da3a226f622ab840c26`, CLI `bb827a1a0c6837b17b1552ca99811e34c179a8e17974557e50e8069cec8688d4`.
- 다음: 승인 머지 후 실행 상태·판정/대본 영속 복구·전체 관문과 실제 생성 제출 경계 결합. 이번 구현만으로 유료 작업을 제출하지 않음.
