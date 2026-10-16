# 카드뉴스 Reels 머지·배포 검증 — 2026-10-16

사용자 `머지하고 배포해줘` 승인으로 PR #283을 main에 머지하고 중앙 인증 Worker를 배포했다.
릴스 workflow는 운영 main에 등록됐고 실제 원격 영상 생성이 성공했다. 공개 게시 계정은 아직 미확정이므로
`CARD_NEWS_REELS_MODE=render`다. Instagram 게시·자동 업로드 활성화·연결 계정/잔여 할당량 검증은 미완료다.

## 실제 적용

- PR: https://github.com/hhj4861/commerce-automation-kit/pull/283
- main merge: `2e6999c983cd41aed899d790104ebba0aa7edc3c`, 2026-10-16 17:19:15 KST.
- workflow: `.github/workflows/ai-card-news-reels.yml`, active.
- 중앙 인증 Worker: https://cak-credential-broker.guswhd1085.workers.dev
- 최종 운영 버전: `c85cdaf8-de98-4e2c-b667-e4ffd595f84d`.
- 직전 운영 버전(복구 기준): `20b02c1b-f68c-43ee-8882-a456d129df20`.
- 실제 Worker 다운로드 원문에서 새 `ai-card-news-reels.yml` 정책 존재 확인.
- 게시 모드: `CARD_NEWS_REELS_MODE=render`. Instagram 계정 ID·업로드 프로필 override는 설정하지 않았다.
- 기존 텔레그램: `CARD_NEWS_SCHEDULE=on`, 전환일 `2026-10-16` 유지.

## 검증

- PR의 원격 검사 전부 성공(릴스/텔레그램 테스트, GitOps, Shopshorts render, topic-discovery contract).
- 기존 로컬 증거: 카드뉴스/릴스 63개, shorts-publish 44개 + 타입 검사, broker 81개 통과.
- 운영 main 렌더 실행: https://github.com/hhj4861/commerce-automation-kit/actions/runs/38873188651 — success.
- 소스: 실제 텔레그램 발송 실행 `38844598258`, 소스 SHA `02349c719a0b3f5c0708987ea2de130fe194396d`.
- 원격 artifact `12033723277` 메모리 검사: `reels-status.json.status=rendered`, `seconds=132.33`, `reel.mp4` 존재.
- Worker 익명 `/github/secrets`, `/runner/secrets` 호출은 각각 403으로 차단.
- 최종 원격 설정과 직전 운영 버전 비교: 바인딩 37개 모두 동일, 차이 없음. DB·Secret·OAuth 기록 생성/회전 없음.

## 배포 중 발견·복원

처음 읽은 macOS Library Wrangler 캐시는 만료된 이전 위치였다. 실제 CLI/기존 admin 코드가 쓰는
`~/.wrangler/config/default.toml` 세션으로 전환해 정상 API 조회를 확인했다. 인증 값은 출력·클라우드 복사하지 않았다.

첫 배포에서 `--keep-vars`만으로는 저장소 설정에 명시된 오래된 `GITHUB_BLOG_DISCOVERY_ENABLED=false`가 보존되지 않았다.
배포 직후 조회로 원래 true가 false로 바뀐 것을 확인했고, 동일 승인 코드에 배포 전 값을 명시해 즉시 재배포했다.
최종 API와 직전 버전 전체 바인딩 비교로 `GITHUB_BLOG_DISCOVERY_ENABLED=true`, Replay 활성화,
기존 배포 ref/다른 연결 37개가 모두 원래와 같음을 검증했다. 임시 첫 버전 `ce258939-54f2-41c4-8c4f-43291ed98328`은
현재 운영 버전이 아니다. 설정 파일의 블로그 값과 운영 값 차이는 기존 drift로 남아 있으므로 다음 broker 배포도
실제 운영 설정을 먼저 확인해야 한다.

## 남은 단계

1. 사용자가 게시할 Instagram 계정을 지정한다. 과거 기록 `@ttangkong_pom`은 현재 연결 검증이나 사용 승인이 아니다.
2. 해당 Upload-Post 프로필/계정 고유 ID와 재인증·업로드 할당량을 확인한다.
3. 고유 ID를 고정하고 첫 공개 게시 검증 → 실제 공개 URL 확인 → `live` 일일 자동 게시를 활성화한다.

이 문서는 현재 프로젝트 docs에 저장한 배포 기록이다. 공개 Instagram 게시물은 아직 없으며,
원격 render 성공을 업로드 인증 또는 실제 게시 성공으로 간주하지 않는다.
