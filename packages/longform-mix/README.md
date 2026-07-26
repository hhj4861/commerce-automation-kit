# @cak/longform-mix (원자 #9)

여러 트랙(ai-music 로 생성)을 **하나의 롱폼 음악 믹스 영상**으로 조립한다. **전부 로컬 ffmpeg = 무료**.
오디오 이어붙임 + 배경(무료 오디오 반응형 비주얼라이저 또는 이미지 루프) + 유튜브 챕터 + 썸네일.

## 무료 원칙

- 조립·렌더는 100% ffmpeg(로컬). 추가 API 비용 0.
- 배경도 **비주얼라이저**(showwaves 네온 파형 + 타이틀)면 이미지 자산조차 불필요 → AI 이미지 생성비 0.
- 돈이 드는 건 음악 생성(ai-music)뿐. 이 원자는 이미 만든 트랙을 조립만 한다.

## 파이프라인 위치

`ai-music`(N곡 생성) → **`longform-mix`(조립: 오디오+비주얼+챕터+썸네일)** → 업로드(별도).

## CLI

```bash
# 챕터(유튜브 타임스탬프) 미리보기
npm run cli -w @cak/longform-mix -- chapters --tracks tracks.json

# 조립 (기본 = 무료 비주얼라이저)
npm run cli -w @cak/longform-mix -- assemble --tracks tracks.json --out mix.mp4 \
  --visualizer --title "GYM HYPE MIX" --subtitle "Phonk · Hardstyle · Trap · DnB"

# 조립 (이미지 배경 루프 — 이미지 있을 때)
npm run cli -w @cak/longform-mix -- assemble --tracks tracks.json --out mix.mp4 --visual bg.jpg

# Pexels 무료 스톡 다운로드 (PEXELS_API_KEY 필요)
npm run cli -w @cak/longform-mix -- fetch-image --query "fitness woman gym" --orientation landscape --out athlete.jpg
npm run cli -w @cak/longform-mix -- fetch-video --query "gym workout" --orientation landscape --out gym-bg.mp4

# 배경을 진짜 footage로 (파형 대신)
npm run cli -w @cak/longform-mix -- assemble --tracks tracks.json --visual gym-bg.mp4 --visual-kind video --out mix.mp4

# 감성(플레이리스트) 썸네일 — 【태그】 + letterspaced 흰 타이틀 (클릭베이트 대신 세련)
npm run cli -w @cak/longform-mix -- thumbnail --aesthetic --image athlete.jpg \
  --tag "PLAYLIST" --title "GYM HYPE" --subtitle "WORKOUT MIX · VOL.1" --out thumb.jpg
# 클릭베이트 썸네일(굵은 2줄 + 노랑) — --aesthetic 없이. 한글은 --no-letterspace
npm run cli -w @cak/longform-mix -- thumbnail --image athlete.jpg --title "운동할 때 이거 틀면" --subtitle "미쳐버림" --out thumb.jpg
```

`tracks.json`:
```json
[
  { "file": "mix/mix-phonk-01.mp3", "title": "Phonk" },
  { "file": "mix/mix-trap-01.mp3",  "title": "Trap" }
]
```
(`durationSec` 생략 시 ffprobe 로 자동 측정 → 챕터 타임스탬프 계산)

## 구조 (kit 규약)

```
src/core/      tracklist.ts(챕터) · assembleargs.ts(ffmpeg 인자·비주얼라이저·썸네일·영상루프)  — 전부 순수
src/adapters/  ffmpeg.ts(spawn·probe) · pexels.ts(무료 스톡 API) · schemas.ts(zod)
src/obs/       logger.ts     src/cli/ index.ts(chapters|assemble|thumbnail|fetch-image|fetch-video)
test/          tracklist · assembleargs
```
계약: `@cak/contracts` 의 `LongformTrack`/`ChapterMark`/`LongformSpec`/`ThumbnailSpec`/`VisualKind`.

배경 3종: **visualizer**(무료 파형, 자산 불필요) · **video**(Pexels footage 루프) · **image**(정적 이미지 루프).
썸네일 2종: **aesthetic**(플레이리스트 감성) · 기본(클릭베이트). 스톡은 **Pexels 공식 API만**(상업 무료, 스크래핑 아님).

## 남은 것

- **업로드**: 롱폼(수십 분)은 쇼츠 파이프라인이 아님 → YouTube Data API 롱폼 업로드는 별도 단계로.
- **footage 반복**: 짧은 클립 루프는 시각적으로 반복적 → 긴 클립/여러 클립 순환은 향후.
