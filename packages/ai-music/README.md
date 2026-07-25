# @cak/ai-music (원자 #8)

광고 컨셉에서 음악을 만들고 광고영상에 자동 매칭(믹스)하는 원자. **백엔드 교체형 + 우선순위**.

## 백엔드 (품질검사 후 우선순위로)

| 백엔드 | 모드 | 광고 라이선스 | 상태 |
|---|---|---|---|
| **elevenlabs** | 공식 API(무인) | ✅ 정식 라이선스 학습, 광고 clear | `ELEVENLABS_API_KEY` 필요 |
| **suno-manual** | 사람 게이트 | ✅ (사용자 Suno 유료플랜) | 프롬프트만 자동, 생성은 Suno UI에서 |
| **suno-auto** | 예약(reserved) | ❌ | **공식 Suno API 부재(2026-07)** — 비공식 래퍼는 ToS·금지선 #2 위반이라 **미지원**. 공식 API 출시 시 활성화 |

> `suno-auto` 는 우선순위 체계에 슬롯만 있고 **자동 실행되지 않는다**. 호출 시 명확한 안내로 실패한다(비공식 엔드포인트에 절대 연결 안 함). Suno 품질은 `suno-manual` 로 쓴다.

## 흐름

```
컨셉 → MusicBrief → (백엔드별) 프롬프트 → [생성: elevenlabs API / suno 수동] → 트랙 → ffmpeg 믹스 → 스코어링된 광고
```
"동적 매칭" = 프롬프트가 컨셉에서 나오므로 **프롬프트 생성이 곧 매칭**이다.

## 구조 (kit 규약)

```
src/core/      prompt.ts(브리프→프롬프트) · mixargs.ts(ffmpeg 믹스) · backends.ts(레지스트리·우선순위)  — 전부 순수
src/adapters/  ffmpeg.ts(spawn·probe) · elevenlabs.ts(공식 API) · suno.ts(가드 스텁) · schemas.ts(zod)
src/obs/       logger.ts     src/cli/ index.ts(prompt|backends|generate|mix)
test/          prompt · mixargs · backends
```
계약: `@cak/contracts` 의 `MusicBrief`/`MusicPromptPlan`/`MusicMixSpec`/`MusicTrack`/`MusicBackendId`.

## CLI

```bash
# 우선순위·사용가능 백엔드 확인
npm run cli -w @cak/ai-music -- backends --priority elevenlabs,suno-manual

# 프롬프트만 (수동/미리보기)
npm run cli -w @cak/ai-music -- prompt --brief brief.json --backend suno-manual

# 생성 (우선순위대로 — 키 있으면 elevenlabs 무인, 없으면 suno-manual 프롬프트 안내)
npm run cli -w @cak/ai-music -- generate --brief brief.json --out track.mp3 --priority elevenlabs,suno-manual

# 광고에 믹스 (VO 아래 더킹 + -14 LUFS + 길이맞춤 페이드)
npm run cli -w @cak/ai-music -- mix --video ad.mp4 --music track.mp3 --out scored.mp4 [--no-duck] [--lufs -14]
```

`brief.json` 예:
```json
{ "energy": "high", "tempo": "slow", "moods": ["heroic","tender","cinematic"],
  "genres": ["orchestral"], "instrumental": true, "durationSec": 30,
  "arc": "정적인 밤에서 시작해 구조의 순간 장엄하게 부풀어오르는 스트링" }
```

## 라이선스 원칙

- **Suno 자동은 만들지 않는다** — 공식 API가 없어 비공식 계정풀 래퍼뿐이고, 그건 Suno ToS + kit 하드 금지선 #2 위반. Suno는 수동으로만.
- **elevenlabs** 는 정식 라이선스 학습 + 유료플랜 광고 clear이라 무인 자동 가능.
- 실제 생성은 사용자의 유료플랜/키가 필요한 **사람 게이트**(비용·라이선스 책임 명확화).

## 파이프라인 위치

`ad-video-gen`(제작) → **`ai-music`(스코어링, 16:9 마스터에)** → `shorts-publish`(9:16 + 업로드).
