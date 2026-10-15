# Shopshorts 자동 배포 렌더 검사 실행 환경

- 목표: 시크릿 연결 후 드러난 자동 배포 실행 환경 누락을 해소하고 PR에서 같은 실패를 검출한다.
- 담당: 이 Codex 세션, 독립 `shopshorts-ci-render-deps` worktree. worker/Claude OFF.
- 기준: main `e52dbab`; 운영 `bbe9bee`.
- 증거: Actions 38705722600에서 시크릿 조회 성공, 전체 앱 검사 19건 실패. FFmpeg/FFprobe 부재와 npm workspace cwd를 가정한 CLI 검사 경로 2건 확인. Wrangler 업로드 전 중단됐으므로 토큰 Pages 권한까지 검증된 것은 아니다.
- 범위: Shopshorts CI의 FFmpeg 설치, 두 CLI 검사의 파일 기준 경로, PR의 Ubuntu 전체 앱 검사. 앱 동작/다른 플랫폼 배포/시크릿 값은 변경하지 않는다.
- 완료 기준: 관련 로컬 검사, GitHub Ubuntu 전체 앱 검사, 본인 커밋/push/PR, 승인된 main·운영 승격, 자동 배포 자체 성공과 Pages SHA 일치.
- 로컬 검증: Node 24에서 workspace 폴더 기준 CLI 검사 17개 통과·기존 조건부 1개 생략, 배포 검사 39개 통과. YAML 2개 파싱 및 git diff --check 통과. 실제 Ubuntu 전체 앱 검사는 PR CI에서 수행한다.
- 현재: 수정·로컬 검증 완료, PR 준비 중.
- 다음: 로컬 검사 → main/운영 승격 PR 준비 → Ubuntu CI → PR별 승인 → 머지/실배포 검증.
