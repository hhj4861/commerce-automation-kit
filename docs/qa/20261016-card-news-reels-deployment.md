# 카드뉴스 Reels 머지·배포 검증 — 2026-10-16

사용자 `머지하고 배포해줘` 승인으로 PR #283을 main에 머지하고 중앙 인증 Worker를 배포했다.
릴스 workflow는 운영 main에 등록됐고 실제 원격 영상 생성이 성공했다. 사용자는 후속 `응 그걸로 해줘`로
`@ttangkong_pom` 게시를 승인했다. 사용자 재연결 완료 후 `reauth_required=false`를 확인했다.
목록 API의 계정 ID 누락을 수정하는 PR #285는 사용자 승인 후 머지했다. 이후 사용자가 게시 전 내용 확인과
발견 중심 콘텐츠를 요청해 `CARD_NEWS_REELS_MODE=render`와 공개 게시 보류를 유지한다.
Instagram 게시·자동 업로드 활성화·잔여 할당량 검증은 미완료다.

## 실제 적용

- PR: https://github.com/hhj4861/commerce-automation-kit/pull/283
- main merge: `2e6999c983cd41aed899d790104ebba0aa7edc3c`, 2026-10-16 17:19:15 KST.
- workflow: `.github/workflows/ai-card-news-reels.yml`, active.
- 중앙 인증 Worker: https://cak-credential-broker.guswhd1085.workers.dev
- 최종 운영 버전: `c85cdaf8-de98-4e2c-b667-e4ffd595f84d`.
- 직전 운영 버전(복구 기준): `20b02c1b-f68c-43ee-8882-a456d129df20`.
- 실제 Worker 다운로드 원문에서 새 `ai-card-news-reels.yml` 정책 존재 확인.
- 게시 모드: `CARD_NEWS_REELS_MODE=render`. 승인한 Instagram 고유 ID `38317492141183625`와 프로필 override `commerce_account`를 GitHub 변수에 설정했다.
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

1. 사용자 계정 지정 완료: `@ttangkong_pom`, Upload-Post 프로필 `commerce_account`.
2. 공식 `generate-jwt` 연결 화면에서 사용자가 재연결 완료. `/users` 및 `/users/commerce_account` 실조회로 handle 일치, `reauth_required=false` 확인. `/me`는 HTTP 200, Default 플랜이나 사용량 필드를 반환하지 않아 잔여 할당량은 미확인이다.
3. 실제 목록 API는 ID를 누락하고 단일 프로필 API는 고유 ID를 반환한다. 계정 ID 검증을 완화하지 않고 단일 프로필 조회를 쓰도록 수정: https://github.com/hhj4861/commerce-automation-kit/pull/285 (브랜치 commit `a13e1d9`). Python 63개, shorts-publish 45개, 타입 검사 및 수정 CLI의 실제 ID 대조 통과.
4. PR #285는 승인된 head `a13e1d9`로 2026-10-16 20:25:16 KST 머지했다(main `c5bfa2d`). 이후 지시인 게시 전 내용 확인을 우선하며 공개 업로드는 시도하지 않았다.

## 발견 중심 음성 미리보기 — 후속 진행

- 사용자 방향: 패치 내역 대신 주목 플러그인·실전 Agent 활용·새 오픈소스와 카드별 정확한 원문. 세부 기준은 `docs/tasks/20261016-card-news-content-discovery-brief.md`.
- 새 구현: https://github.com/hhj4861/commerce-automation-kit/pull/290 , 브랜치 `feat/card-news-discovery-narration`, commit `4179a8e`. 본인 변경만 커밋·push했으며 main 미머지·운영 미적용이다.
- 공식 API/RSS에서 Superpowers, GitHub 공식 Playwright MCP 활용 가이드, Talorys를 선택했다. 초기 플러그인 비교 표본은 3개이며 전체 시장 순위가 아니다. GitHub 주간 신규 별과 설치 수, 저장소 생성일과 정식 출시일을 구분한다.
- 새 미리보기: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/card-news-discovery-20261016/preview-v3/reel.mp4`. 95.770초, 1080×1920 H264/AAC, 3.18MB. 로컬 중간 산출물이며 공개 게시·iCloud 동기화 완료를 뜻하지 않는다.
- 기존 Yooni 음성 + 공식 글자 타임스탬프 + 공유 Pretendard modern-v1 자막 43개. 최대 두 줄. 출처를 피해 자막 중심을 높이 80%에 배치했다. 세 예시 단계가 실제 발화에 맞춰 강조된다. QuickTime으로 사용자 검토용 영상을 열었다.
- v1/v2 대본의 추상적 예와 화면 밀도를 보완한 v3에서 3카드 × 7기준 독립 검토를 통과한 후에만 TTS를 생성했다. 대사·원문·화면 이미지 SHA와 검토 digest를 묶었다. 불합격 기록도 같은 작업 폴더에 보존했다.
- 실제 20/50/80초 프레임에서 출처·예시·자막을 확인했다. 오디오 평균 -13.6dB/최대 -3.6dB로 클리핑 없음. 기존 Whisper small의 로컬 전사로 세 카드 순서를 확인했지만 고유명사 오인식이 있어 완전 일치나 직접 청음 완료로 보고하지 않는다.
- 로컬 검사: Python 77개, TTS 16개와 타입 검사, shorts-publish 45개와 타입 검사, broker 경계 25개. workflow YAML 파싱·diff 검사 통과. PR CI는 별도 확인한다.
- 일반 중앙 Codex 자격 갱신 실패가 있어 기존 native ChatGPT 로그인으로 로컬 대본을 검토했다. 운영 전용 카드뉴스 로그인과 다른 경로이며 운영 인증 장애로 단정하지 않는다. 운영 자격·계정은 변경하지 않았다.
- **남은 승인 제약:** 자동 승인 검토가 GitHub 릴스 workflow에 `ELEVENLABS_API_KEY`를 지속 제공하는 중앙 권한 확대를 거부했다(음성 제작 지시가 해당 workflow의 접근 추가까지 명시 승인한 것은 아니라는 사유). broker 정책/운영 credential loader 변경은 미적용. 로컬 미리보기만 기존 허용 runner 범위로 생성했다. 예약 음성 통합은 사용자 명시 승인 후 별도 구현·검증한다.
- 2026-10-16 후속 실조회: reels mode=render, schedule=on, cutover=2026-10-16 유지. 공개 게시·live 활성화·새 PR 머지는 미실행이다.

이 문서는 현재 프로젝트 docs에 저장한 배포 기록이다. 공개 Instagram 게시물은 아직 없으며,
원격 render 성공을 업로드 인증 또는 실제 게시 성공으로 간주하지 않는다.
