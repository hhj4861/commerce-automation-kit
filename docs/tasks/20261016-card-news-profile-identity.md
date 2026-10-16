# 카드뉴스 Instagram 계정 ID 조회 수정

- 목표: 재연결한 `@ttangkong_pom`을 고유 ID로 검증해 첫 릴스 게시와 일일 자동화를 진행한다.
- 범위/담당: 현재 세션 단독, `fix/card-news-instagram-profile-identity`. 계정 게이트·중복 방지는 유지한다.
- 기준: main `2e6999c983cd41aed899d790104ebba0aa7edc3c`.
- 실측: 공식 users 목록은 Instagram handle/reauth_required만 반환한다. 단일 `users/commerce_account`는 고유 username ID `38317492141183625`를 반환하며 `reauth_required=false`다.
- 변경: profiles CLI에 선택 프로필 조회를 추가하고 릴스 검증이 단일 프로필 응답을 사용한다. 목록 모드 호환 유지, ID가 없거나 다르면 게시 거부.
- 완료 기준: 관련 회귀 검사·타입 검사·실제 CLI 읽기 검증·본인 커밋/push·PR. 이 수정 PR 머지는 별도 명시 승인 후.
- 검증: Python 카드뉴스/릴스 63개, shorts-publish 45개 및 타입 검사 통과. 실제 수정 CLI로 `commerce_account`의 ID·handle·reauth_required=false 일치 확인. 목록 ID 누락·다른 계정·재연결 요구 시 거부 검증 유지.
- 환경 보정: 첫 Python 회귀 검사는 Linux 기본 글꼴 경로로 3건 실패 → 설치된 macOS 한글 글꼴을 명시해 전부 통과. Vitest는 격리 worktree의 캐시 쓰기 제한 → `--no-cache`로 재검증 통과.
- 현재: GitHub에 승인된 프로필·고유 계정 ID를 고정했다. 게시 모드는 render 유지, 공개 게시/자동 업로드 활성화는 아직 하지 않았다. `/me`는 사용량 필드를 반환하지 않아 잔여 업로드 할당량은 미확인이다.
- 다음: 검증 후 PR 준비. 머지 후 계정 ID 고정·첫 게시·공개 URL 확인.
- 공식 계약: https://docs.upload-post.com/api/user-profiles/#get-a-specific-user-profile
