# @cak/shorts-publish (원자 #7)

완성 **광고영상(16:9)** 을 그대로 입력받아 → **쇼츠/릴스(9:16, 1080×1920)** 로 로컬 ffmpeg 렌더 →
**YouTube · Instagram · TikTok** 에 upload-post 통합 API로 한 번에 업로드.

출신: 6개월 전 `scene-image-generator-new` 은 이 변환을 **GCP FFmpeg VM**(`terraform/server.js`)에서 했다.
이 원자는 **VM을 걷어내고 로컬 ffmpeg** 로 동일 처리(상시비용·IP관리 제거)한다.

## 설계 판단: 광고엔 헤비 템플릿 금지

광고는 이미 TV급 시네마틱 + **자체 브랜딩/엔딩**을 갖는다. 콘텐츠형 쇼츠 템플릿(큰 자막바·훅 텍스트·
컬러 캡션바)을 얹으면 프리미엄감이 죽는다 → 기본은 **최소 개입**.

| mode | 처리 | 용도 |
|---|---|---|
| `crop` | 센터 크롭 풀블리드(바 없음) | 피사체 중앙 컷 전용(좌우 잘림 위험) |
| `blur` | 블러필(원본 보존, 위아래 자기프레임 블러) | 텍스트 없이 |
| **`blur-brand`** ★ | 블러필 + 하단 **세이프존 워드마크** | **광고 쇼츠 기본값** |
| `letterbox` | 원본 100% + 검정 바 + 얇은 워드마크 | 에디토리얼 |
| `heavy` | (대조군) 훅바+캡션바 | 광고엔 부적합함을 보여주는 예시 |

### 워드마크 규칙 (blur-brand)

- **세이프존**: 워드마크를 영상밴드 아래 로어서드(`y=h-620`)에 둬 틱톡/릴스 하단 UI(캡션·버튼)와 안 겹침.
- **끝 3초는 원본 엔딩에 양보**: 소스가 자체 엔딩 타이틀/로고를 가지면 중복되므로, 워드마크를
  영상 길이에 상대적으로 페이드아웃(`END_RESERVE_SEC=3`, `FADEOUT_LEN_SEC=1.5`). `--no-fadeout` 로 끔.
- 단일 워드마크 기본(프리미엄), `--tagline` 주면 2줄.

## 구조 (kit 규약)

```
src/core/       ffargs.ts (렌더 인자·필터, 순수) · upload.ts (multipart 필드, 순수)
src/adapters/   ffmpeg.ts (spawn·probe) · upload-post.ts (HTTP) · schemas.ts (zod 검증)
src/obs/        logger.ts
src/cli/        index.ts (render | describe-upload | publish | poll)
test/           ffargs.test.ts · upload.test.ts  (순수 함수, 토큰 고정)
```

계약: `@cak/contracts` 의 `ShortsJob`/`ShortsRenderSpec`/`PublishTarget`/`PublishResult`/`ShortsMode`/`ShortsPlatform`.

## CLI

```bash
# 렌더만
npm run cli -w @cak/shorts-publish -- render --in ad.mp4 --out short.mp4 \
  --mode blur-brand --brand "KOREA JINDO" [--tagline "충성심의 대명사, 진돗개"] [--no-fadeout]

# 업로드 미리보기(계정 연결 전 — 무엇이 전송될지)
npm run cli -w @cak/shorts-publish -- describe-upload --video short.mp4 \
  --title "..." --platforms youtube,instagram,tiktok [--user NAME]

# 렌더 + 업로드(자격증명 없으면 자동 dry-run)
npm run cli -w @cak/shorts-publish -- publish --in ad.mp4 --out short.mp4 \
  --mode blur-brand --brand "KOREA JINDO" --title "..." \
  --platforms youtube,instagram,tiktok [--desc][--tags a,b][--dry-run]

# 비동기 상태 폴링
npm run cli -w @cak/shorts-publish -- poll --request-id <id>
```

## upload-post 준비 (사용자 작업 — 코드가 대신 못 함)

1. https://www.upload-post.com 가입 → **API 키**(무료 10건/월) + 프로필(`user`) 생성
2. 계정 연결: YouTube(OAuth), Instagram(**비즈니스/크리에이터 + FB 페이지 필수**),
   TikTok(**앱 검수 전 업로드가 SELF_ONLY 강제**될 수 있음)
3. 환경변수 `UPLOAD_POST_API_KEY`, `UPLOAD_POST_USER` 설정 후 `--dry-run` 제거

실측 스펙: `POST https://api.upload-post.com/api/upload`, `Authorization: Apikey <KEY>`, multipart
`video`/`title`/`user`/`platform[]` + 플랫폼별 옵션. 문서: https://docs.upload-post.com/api/upload-video/

## AI 표기 (프로젝트 원칙)

업로드 시 유튜브 `containsSyntheticMedia`, 틱톡 `is_aigc` 를 `aiDisclosed`(기본 true) 그대로 전송.
AI 출처(C2PA)를 숨기지 않는다 — 은폐가 아니라 밝히는 게 방어 포지션.

## 알려진 개선점

- 밝은 영상용 워드마크 스크림(현재는 그림자만 — 야간 영상은 충분, 주간 밝은 배경은 개선 여지).
- 힉스필드 `reframe`(피사체 추적 9:16)로 `crop` 구도 깨짐 회피 옵션.

## 실계정 실측 (2026-07-28)

- YT+IG 동시 업로드·비동기 `poll` 응답 스키마 검증 완료(`results[].post_url`·`status`).
- **인스타 캡션**: global `description` 은 인스타에서 무시되고 `instagram_title`(→`title` 폴백)이
  캡션 전문이 된다 → description 있으면 `instagram_title=제목+설명` 전송(제휴 링크·고지 탈락 방지).
- 파트너스 링크 포함 영상은 shopping-shorts 의 lint·고지 번인(`DISCLOSURE_OVERLAY_TEXT`)을 선행할 것.
