# Shopshorts GitOps 활성화

- 목표: 보호된 `deploy/shopshorts`가 Cloudflare broker OIDC로 Pages 배포 자격을 받아 자동 배포하도록 준비한다.
- 담당/범위: Codex; broker policy/config와 관련 회귀 검사·운영 안내만 변경. Claude drama-series 및 제작 UI는 변경하지 않는다.
- 기준 revision: main `7e03f5a2e15261c06d09740bab5fb12890260217`.
- 완료 조건: 자격 격리·보호 해제 거부·기존 플랫폼 회귀 통과, 본인 변경 커밋/push/PR. 운영 완료는 CI 토큰 등록·PR 승인·broker 배포·첫 Actions 실배포 성공을 별도로 요구한다.
- 현재 결과: GitHub 배포 브랜치 보호는 실제 적용됨. 설정에 Shopshorts ref/Secret binding을 추가하고 보호되지 않은 ref를 broker에서도 거부하도록 구현. 토큰 발급과 공식 네트워크 CA 안내는 사용자 응답 대기.
- 검증: Node 22에서 broker 전체·배포 테스트 117개 통과, Python 배포 테스트 8개 통과, git diff --check 통과. GitHub CI는 PR 생성 후 확인한다.
- 다음: 검증 후 PR을 제시하고 명시적 머지 승인을 받는다. Secret 미등록 상태에서 broker를 배포하지 않는다.
