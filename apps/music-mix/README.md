# apps/music-mix — 롱폼 음악 믹스 채널 서비스 (조립)

`packages/`의 독립 원자들을 **조립**해 롱폼 음악 믹스 영상을 만드는 서비스.
(구조 원칙: `packages/`=독립 원자, `apps/`=조립 서비스. 원자끼리는 서로 모르고, 이 앱이 각 원자 CLI를 오케스트레이션한다.)

```
ai-music(트랙 N개 생성) → longform-mix(concat+배경+챕터+썸네일) → youtube-upload(업로드)
```

## 사용

```bash
cd apps/music-mix
npm run compose
```

- `mix.config.json` 하나로 채널 전체를 정의: 트랙별 브리프(장르·BPM·보컬), 배경(비주얼라이저/Pexels footage/이미지), 썸네일(감성/클릭베이트), 설명·해시태그·태그·카테고리·공개범위·업로드 여부.
- 산출물은 `out/`(gitignore). **이미 있는 트랙은 건너뛴다**(재개 + ElevenLabs 크레딧 절약).
- 자격증명은 `kit/.env`(ELEVENLABS_API_KEY, PEXELS_API_KEY, YOUTUBE_CLIENT_SECRET) 자동 로드.
- `upload: false`면 조립까지만(영상·썸네일 확인 후 `true`로).

## Vol.2 만들기

`mix.config.json`의 title·tracks(브리프)·thumbnail 문구만 바꾸고 `out/` 비우면 새 볼륨 생성.
(트랙을 새로 뽑으면 크레딧 소모 — 4분곡=3,000크레딧, ElevenLabs Starter 40k/월=~13곡)

## 산출물

`out/mix.mp4`(영상) · `out/thumbnail.jpg`(썸네일) · `out/chapters.txt`(유튜브 챕터) · `out/tracks/*.mp3`(트랙).
