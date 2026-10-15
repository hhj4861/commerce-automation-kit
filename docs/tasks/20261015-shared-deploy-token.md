# 공용 Cloudflare 배포 토큰 연결

- 목표: 사용자가 등록한 `CAK_DEPLOY_API_TOKEN`을 기존 배포 계약에 연결해 Shopshorts GitHub 자동 배포의 503을 해소한다.
- 담당: 이 Codex 세션. worker/Claude 정책 OFF. 독립 worktree `cloudflare-shared-deploy-token`, 브랜치 `fix/cloudflare-shared-deploy-token`.
- 기준: origin/main `bf2bdfd`; 운영 Pages `bbe9bee`.
- 범위: 브로커의 Secrets Store 이름 매핑 1개, 관련 구성 검사와 운영 안내. 앱 UI, 플랫폼 접근 정책, 실제 토큰 값은 변경하지 않는다.
- 완료 기준: 관련 검사 통과, 본인 변경 커밋/push/PR, 명시 승인 후 머지, 운영 바인딩 보존 추가, Actions 자체 배포 성공과 Pages SHA 일치.
- 확인: Secrets Store의 사용자 지정 시크릿 active/workers; 운영 배포 바인딩은 아직 없음.
- 검증: 구성/배포 Node 검사 57개 통과, git diff --check 통과.
- 현재: 소스 변경 검증 완료. 운영 연결과 실배포는 머지 승인 후 수행한다.
- 다음: 커밋/push/PR → 해당 PR 머지 승인 → 운영 연결과 실배포 검증.
