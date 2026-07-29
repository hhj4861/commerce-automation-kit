# @cak/youtube-upload (원자 #11)

롱폼 영상을 **YouTube Data API v3**로 업로드(videos.insert) + **커스텀 썸네일**(thumbnails.set) +
**챕터 설명** 자동 삽입. OAuth 리프레시 토큰으로 **1회 인증 후 무인**. 공식 API만(스크래핑·우회 아님).

파이프라인: ai-music(N곡) → longform-mix(조립: 영상+썸네일+챕터) → **youtube-upload(업로드)**.

## 1회 설정 (사람 게이트)

1. **Google Cloud 프로젝트** → **YouTube Data API v3** 활성화
2. **OAuth 2.0 클라이언트 ID(데스크톱 앱)** 생성 → `client_secret_*.json` 다운로드
3. `.env`:
   ```
   YOUTUBE_CLIENT_SECRET=/path/to/client_secret.json
   # YOUTUBE_TOKEN_PATH=~/.cak-youtube-tokens.json  (기본값, 생략 가능)
   ```
4. **1회 인증**(대화형): 
   ```
   npm run cli -w @cak/youtube-upload -- auth
   ```
   → 출력된 URL을 브라우저에서 열고 채널 승인 → localhost 리다이렉트 URL의 `code=` 값을 붙여넣기 → 리프레시 토큰 저장

## 업로드

```bash
npm run cli -w @cak/youtube-upload -- channels   # 인증 검증

npm run cli -w @cak/youtube-upload -- upload \
  --video gym-mix-footage.mp4 \
  --title "【Playlist】 헬스장 각성 브금 🔥 Gym Hype Workout Mix Vol.1" \
  --description "..." --chapters-file chapters.txt \
  --tags gym,workout,phonk,trap --category 10 \
  --thumbnail gym-mix-thumbnail.jpg --privacy private
```
- `--category 10` = Music. `--privacy private|unlisted|public`.
- `--chapters`/`--chapters-file`: longform-mix 의 유튜브 챕터 텍스트("0:00 …") → 설명에 삽입돼 챕터 인식.
- 커스텀 썸네일은 채널이 **썸네일 권한**(전화 인증) 필요.

## 댓글 (쇼츠 링크 노출용, 2026-07-28 추가)

쇼츠 UI는 설명란을 접어놓기 때문에 파트너스 링크는 **댓글**로 노출하는 게 표준이다.

```bash
npm run cli -w @cak/youtube-upload -- comment --video-id VIDEO_ID \
  --text "제품 보러가기: https://link.coupang.com/a/... \n이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."
```

- **고지 게이트**: 제휴 링크(link.coupang.com·coupa.ng) 포함 댓글은 대가성 고지("파트너스"+"수수료")
  없으면 거부(`core/comment.ts` — shopping-shorts disclosure 와 동일 의미, 원자간 import 금지라 최소 재구현).
- **youtube.force-ssl 스코프 필요** — 2026-07-28 이전 발급 토큰은 `auth` 재인증 1회 필요.
  ⚠️ 채널 선택 화면은 **브랜드 계정명** 표시(BetterrShop=「모두의 상품」, 개인 「홍현종」=베스트셀러).
- **댓글 고정(pin)은 Data API 미지원** — 스튜디오/앱에서 수동으로 고정할 것.

## 구조 (kit 규약)

```
src/core/      description.ts(설명+챕터) · video-resource.ts(insert 바디) · comment.ts(댓글 고지 게이트)  — 순수
src/adapters/  youtube.ts(googleapis OAuth·insert·thumbnail·commentThreads) · schemas.ts(zod)
src/obs/       logger.ts     src/cli/ index.ts(auth|channels|upload|update-meta|set-privacy|comment)
test/          core (설명·바디·댓글 검증)
```
계약: `@cak/contracts` 의 `YoutubeUploadJob`/`YoutubeUploadResult`.

## 한도·주의

- **쿼터**: videos.insert ≈ 1,600 유닛/회, 기본 일 10,000 → **~6개/일**. 부족 시 Google에 증량 신청.
- **미검수 OAuth 앱**: 테스트 사용자로 본인 계정 추가하면 됨(게시 안 해도 무인 동작). 리프레시 토큰은 미검수 앱이면 7일 만료 가능 → 검수(게시) 또는 주기적 재인증.
- 업로드 실패 중 429/5xx·네트워크는 exit 75(일시적), 그 외 exit 1. 썸네일만 실패해도 업로드는 성공 처리(failures 로 투명화).
