# 초고층 빌딩 안에 660톤짜리 쇠공을 매단 이유

[62초 완성 영상](taipei101-damper.mp4) · [대본](brief.json) · [애니메이션 제작 코드](produce.mjs) · [실측 타임라인과 자막](project.json) · [장면 미리보기](storyboard.jpg)

사용자가 승인한 건축학 Shorts. 1080×1920, 30fps, Yooni – Natural & Clear 음성, 음높이를 유지한 1.15배속, 중앙 자막, 전 장면 크림색 배경을 적용했다. 8장면·25개 자막. 원본 손그림 SVG를 프레임마다 렌더링했으며 힉스필드 영상이나 타인의 영상·음성을 재사용하지 않았다. 배경음악은 없다. 프로젝트 docs에 저장한 결과물이며 Studio나 YouTube에는 업로드하지 않았다.

## 사실과 도해 범위

[TAIPEI 101 공식 전망대 안내](https://www.taipei-101.com.tw/ko/observatory/feature)를 확인했다. 질량 660톤, 지름 약 5.5m, 41개 강철판, 케이블로 매단 수동 TMD와 하부 유압 점성 댐퍼, 강풍에 의한 흔들림과 재실자의 불편 감소가 설명의 근거다. 관성·주기 조율·점성 저항에 의한 에너지 소산을 도식화했다.

움직임·비율·두 건물의 비교 파형은 원리 설명용 창작 애니메이션이며 실제 수치 해석이나 진폭·감소율 측정값이 아니다. 쇠공이 항상 정확히 반대 방향으로 움직인다거나 단독으로 붕괴·지진을 방지한다고 주장하지 않는다. 41장 설명 그림은 적층 원리를 간략히 그렸으며 실제 41장을 모두 그린 도면이 아니다.

## 음성과 검증

[TTS 생성 실행 36586659576](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36586659576) 성공. 기존 Cloudflare 인증을 사용하는 공식 ElevenLabs API를 사용했다. 각 음성 메타데이터의 대본·음성 ID를 대조했으며 ffmpeg atempo=1.15를 적용했다.

- ffprobe: 62.000초, H.264, 1080×1920, 30fps, 1,860프레임, AAC 스테레오.
- 음성 합계 59.535초. 장면별 추가 여백 0.285~0.327초로 긴 장면 간 공백을 줄였다.
- 모든 대본 문자가 자막에 포함되며 중앙 배치, 최대 2줄·줄당 20자 이하를 확인했다.
- ffmpeg 전체 디코딩 성공. -40dB 기준 0.8초 이상 연속 무음은 검출되지 않았다.
- 최종 영상에서 8개 장면을 추출해 구도와 자막을 시각 검수했다. 별도의 사람 청음이나 음성 전사를 수행했다는 뜻은 아니다.
- 자막 시간은 발화 길이와 글자 수를 기준으로 분배하며 단어 단위 강제 정렬은 아니다.

## 재현

애니메이션 기능과 의존성이 설치된 checkout을 CAK_ENGINE_ROOT로 지정한다. 원음 캐시는 TAIPEI_VIDEO_CACHE로 변경할 수 있다. 원격 artifact의 보존 기간은 1일이며 재생성 시 TTS 사용량이 발생한다.

```sh
CAK_ENGINE_ROOT=/path/to/checkout node docs/videos/20260929-taipei101-damper/produce.mjs dispatch
gh run download RUN_ID --repo hhj4861/commerce-automation-kit --name narration --dir /private/tmp/cak-taipei101-damper-20260929/remote-narration
CAK_ENGINE_ROOT=/path/to/checkout node docs/videos/20260929-taipei101-damper/produce.mjs measure
CAK_ENGINE_ROOT=/path/to/checkout node docs/videos/20260929-taipei101-damper/produce.mjs render
```
