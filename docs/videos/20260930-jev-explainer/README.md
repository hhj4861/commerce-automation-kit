# Jev 쉽게 이해하기 — 고객 문의를 분류하는 AI

TypeSafe의 Jev를 가상 고객 문의 두 가지로 설명하는 독립 영상이다. 회사 홍보 영상이나 실서비스 시연이 아니며 Jev API를 호출하지 않았다.

## 내용

배송 완료인데 상품을 못 받았다는 문의가 들어온다. 미리 정의한 배송·환불·기타 중 담당을 판단하고, 확률을 프로그램의 규칙에 연결한다. 배송 문제와 취소 요청이 섞인 두 번째 문의는 추가 확인으로 보낸다.

- 90/8/2 및 49/48/3은 가상 확률이다. 영상과 대본에서 실제 측정치가 아님을 표시한다.
- 확신도는 확률 분포를 요약한 지표이며 최상위 선택지 확률과 동일하다고 하지 않는다. 가상의 confidence 수치는 만들지 않았다.
- 타입·스키마 준수와 의미상 정확도를 구분한다. ‘환각 없음’을 ‘절대 틀리지 않음’으로 설명하지 않는다.
- 기존 LLM도 구조화 출력과 분류가 가능하다. Jev의 역할과 특화를 설명하며 다른 방식이 불가능하다고 주장하지 않는다.
- 현재 문서 기준 텍스트 입력을 사용하고, 글쓰기·코드 생성·동영상 이해를 Jev 기능으로 묘사하지 않는다.
- 속도·비용 배수의 독립 실측은 하지 않았으므로 수치 경쟁 그래프를 만들지 않는다.

## 근거 — 2026-09-30 확인

- [소개 원문](https://typesafe.ai/blog/introducing-system-one-models-and-jev): System One과 Jev의 발표·설계 목표. 회사 주장과 독립 측정을 구분한다.
- [시작 문서](https://docs.typesafe.ai/introduction): 같은 상태에 대해 독립된 작은 질문들을 평가하고 코드에서 조합.
- [Choice](https://docs.typesafe.ai/primitives/choice): 미리 정의한 선택지, choice 및 확률 분포.
- [Confidence](https://docs.typesafe.ai/confidence): 확률과 확신도의 구별, 불확실할 때 사람·추가 질문으로 분기.
- [System One](https://docs.typesafe.ai/concepts/system-one): 텍스트 전용 입력, 답장/코드를 생성하지 않음, 확률 보정은 개별 정답 보장이 아님.

## 제작

`produce.mjs`는 이 에피소드의 원본 SVG 모션 그래픽, 음성 길이에 맞춘 편집, 중앙 자막, 배경음을 재현하는 레시피다. 따뜻한 아이보리 배경을 전 장면 유지하고, 초록은 분류 흐름, 적갈색은 불확실성에 사용한다. TypeSafe 사이트 영상·이미지·로고를 복제하지 않는다.

Yooni – Natural & Clear, atempo=1.15. TTS는 기존 Cloudflare 인증을 사용하는 ElevenLabs 워크플로로 생성한다. 영상은 전부 로컬 원본 애니메이션이며 Higgsfield 생성 비용이 없다. 인증정보는 저장하지 않는다.

```sh
CAK_ENGINE_ROOT=/private/tmp/cak-automatic-explainer-pipeline node docs/videos/20260930-jev-explainer/produce.mjs dispatch
# tts-remote 실행의 narration 아티팩트를 /private/tmp/cak-jev-explainer-20260930/remote-narration 에 다운로드
CAK_ENGINE_ROOT=/private/tmp/cak-automatic-explainer-pipeline node docs/videos/20260930-jev-explainer/produce.mjs render
```

## 완성본과 검증

- `jev-explainer.mp4`: 123.000초(2분 3초), 1080×1920, 30fps, 3,690프레임, H.264/AAC, 6,464,642바이트.
- SHA-256: `fe931d81f6b8b97a1ffca4e4d8e7d16182b4aa16221701c02b4cdd09a684a3f7`.
- TTS [실행 36656748371](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36656748371) 성공. 12개 음성의 대본과 voiceId 일치 검증. 피치 유지 1.15배속 적용 후 음성 합계 119.033초.
- 원본 모션 그래픽 12장면. 자막 49개, 최대 2줄·줄당 20자. 확률 문장만 구십/팔/이 퍼센트를 90%/8%/2%로 표기하고, 그 외 발화 내용 누락 없음 검사.
- 장면별 음성 뒤 여유 0.317~0.350초. 오디오 평균 -18.6dB, 최대 -8.4dB. 내부 문장 호흡 중 0.632초의 낮은 음량 구간 1개가 확인됐다. 장면 간 긴 빈 구간은 만들지 않았다.
- 최종 전체 디코드 `ffmpeg -xerror` 통과.
- Chrome 최종 파일 재생: 123초, 0.482초까지 진행, paused=false, 오디오 디코드 18,839바이트. 수정 장면 44초와 끝부분 121초 탐색 readyState=4, 오류 없음.
- `storyboard.jpg` 및 숫자 자막 수정 장면을 시각 검수. 사람 청음이나 STT 전사 검증을 수행했다는 뜻은 아니다.
- 숫자 자막 변경 시 SVG 그래픽 소스가 동일함을 비교하고 기존 모션 프레임을 재사용했다. 신규 TTS·외부 이미지·영상 생성 없음.

로컬 완성 파일이다. YouTube 업로드·운영 사이트 등록은 수행하지 않았다.
