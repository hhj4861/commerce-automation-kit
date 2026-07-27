# @cak/tts-narration — 원자 #13

한국어 내레이션 TTS. ElevenLabs 공식 API 무인 생성 — **hanmadi 튜터 앱과 동일한 검증 설정**을 공유한다(같은 목소리 보장).

- 기본 음성: **Claire** (한국어 원어민, whisper STT 전수검증으로 채택)
- 3자 이하 짧은 문구: `eleven_turbo_v2_5` + `language_code: ko` 강제
  (multilingual v2는 짧은 글자에서 언어 자동감지가 흔들림 — '누'→'수' 실측 사례)
- 긴 문장: `eleven_multilingual_v2` (프로소디 최상)
- 정책 원본: `src/core/policy.ts` ↔ `apps/hanmadi/lib/tts.ts` — **바꿀 때 반드시 함께**

## 사용

```bash
export ELEVENLABS_API_KEY=...   # 재정의: ELEVENLABS_VOICE_ID / ELEVENLABS_TTS_MODEL

# 텍스트 1건 → mp3
npm run cli -w @cak/tts-narration -- generate --text "오늘 소개할 상품은..." --out vo.mp3

# ShortsScript(원자 #12) 대본 → 비트별 mp3 + 단일 트랙
npm run cli -w @cak/tts-narration -- script --script script.json --outdir vo/ --join vo/full.mp3
```

`script` 는 `outdir/narration.json` 에 manifest(NarrationBatchResult)를 남긴다.
`--join` 결과를 shopping-shorts 조립의 `--narration` 에 그대로 넘기면 된다.

## 파이프라인

keyword-intel → (대본 작성) → shopping-shorts lint → **tts-narration** → shopping-shorts assemble → shorts-publish
