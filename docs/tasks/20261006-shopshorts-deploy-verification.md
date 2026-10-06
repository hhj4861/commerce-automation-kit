# Shopshorts 운영 배포 검증 보완

- 목표: PR #157 운영 검증에서 발견한 hybrid heartbeat 누락과 테스트 저장 경로 필수 환경 의존 수정.
- 담당/범위: Codex, fix/shopshorts-deploy-verification. Pages API heartbeat allowlist, 해당 회귀 검사, topic-discovery 테스트 임시 경로만 수정. 제작 알고리즘·시크릿·Claude 드라마 파일 변경 없음.
- 기준: main 및 deploy/shopshorts cca7b0986284520ec5580e17a529ee063086e58c.
- 운영 상태: 위 커밋 Pages f5186e9a-efca-4114-8930-bc1d56376ff0에 배포, 제작 워커 갱신·실제 혼합 렌더 검증. hybrid boolean은 기존 Pages allowlist에서 빠져 있었지만 생성 UI/실행 경로는 이 값을 필수 조건으로 사용하지 않음.
- 완료 기준: Pages worker PUT → config GET에서 strict hybrid boolean 보존/초기화 검증, DISCOVERY_TEST_DIR 없이 HTTP 연동 테스트 통과, 자기 변경 commit/push/PR. 후속 PR 머지는 별도 승인 필요.
- 자동 배포 미완료 사유: 현재 GitHub 자격 admin=false, 보호 설정 PUT 404. Cloudflare CI 전용 토큰 미등록. 보호·자격 검증을 우회하지 않음.
- 검증: Pages heartbeat + topic-discovery HTTP 연동 16검사 통과(DISCOVERY_TEST_DIR 미설정, TMPDIR은 지정 iCloud 작업 폴더로 연결). git diff --check 통과. 다음: 본인 변경 commit/push 및 후속 PR, 승인 전 운영 미반영.
