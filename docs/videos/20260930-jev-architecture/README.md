# Jev 개념·연동 구조·요청 흐름 — 개정 영상

개념 → Claude Code/Codex를 이용한 개발 → 완성 앱의 아키텍처 → 프롬프트 처리 4단계 → 실제 업무를 가정한 예시 순서다. 기존 `../20260930-jev-explainer` 영상은 보존했다.

## 설명 범위

- Jev는 분류·점수 등 좁은 판단을 반환하며, 자유로운 답장이나 코드를 생성하지 않는다. 기존 LLM도 분류할 수 있다.
- Claude Code/Codex에 TypeSafe 스킬을 제공하는 것은 연동 앱의 코드를 작성하도록 돕는 개발 과정이다. 설치하면 모든 대화가 Jev를 거친다는 뜻이 아니며 코딩 에이전트의 기반 모델을 교체하지 않는다.
- 영상의 실행 구조는 예시 설계다. 사용자 → 앱에서 상태·질문 구성 → Jev의 선택/확률/확신도 → 앱의 규칙·권한 확인 → 업무 도구/LLM/추가 확인 → 앱의 응답.
- LLM 호출은 필요한 경로에서만 수행한다. Jev가 주문 조회나 메시지 발송을 직접 실행하지 않는다.
- 확신도와 최대 선택지 확률을 구분하고, 정해진 형식과 의미상 정답 보장을 구분한다. 실제 정확도는 별도 검증해야 한다.
- 택배 도착 날짜와 사과 답장은 가상 예시다. Jev API 호출, 실제 주문 조회, 고객 발송 또는 성능 측정은 수행하지 않았다.

## 제작과 재현

원본 SVG 모션 그래픽 12장면, 전 장면 아이보리 배경, 중앙 자막. Yooni – Natural & Clear, 피치 유지 1.15배속. TTS는 기존 Cloudflare 인증 연동 ElevenLabs 워크플로를 사용했다. 원본의 다른 영상·음원·사이트 화면을 재사용하지 않는다. Higgsfield 호출은 없다.

- 대본과 출처: `brief.json`
- 애니메이션·자막·믹싱 레시피: `produce.mjs`
- 실측 시간·자막: `project.json`
- 최종 영상: `jev-explainer.mp4`
- 최종 영상에서 추출한 장면표: `storyboard.jpg`

```sh
CAK_ENGINE_ROOT=/private/tmp/cak-automatic-explainer-pipeline node docs/videos/20260930-jev-architecture/produce.mjs dispatch
# 성공한 tts-remote의 narration 아티팩트를 /private/tmp/cak-jev-architecture-20260930/remote-narration 에 다운로드
CAK_ENGINE_ROOT=/private/tmp/cak-automatic-explainer-pipeline node docs/videos/20260930-jev-architecture/produce.mjs render
```

렌더 엔진은 자동 제작 기능이 있는 checkout을 `CAK_ENGINE_ROOT`로 지정한다. 레시피는 오디오 메타데이터의 대본·음성 ID 일치와 실측 길이를 검사한다. 인증정보는 문서·영상에 포함하지 않는다.

## 근거 — 2026-09-30 공식 문서 확인

- [TypeSafe introduction](https://typesafe.ai/blog/introducing-system-one-models-and-jev) — System One naming and focused structured decisions; claims are vendor statements, not independently measured here
- [TypeSafe introduction docs](https://docs.typesafe.ai/introduction) — Typed questions and outputs; multiple independent questions
- [Choice](https://docs.typesafe.ai/primitives/choice) — Predefined criteria, selected option and full probability distribution
- [Confidence](https://docs.typesafe.ai/confidence) — Derived from distribution, distinct from selected probability; thresholds and escalation
- [System One](https://docs.typesafe.ai/concepts/system-one) — Text-only input; no generated replies or code; calibration does not guarantee individual correctness
- [Jev with coding agents](https://docs.typesafe.ai/introduction/coding-agents) — Coding-agent integration context and application-controlled routing
- [TypeSafe agent skill](https://docs.typesafe.ai/agent-skill) — Coding-agent integration context and application-controlled routing
- [Intent routing](https://docs.typesafe.ai/patterns/intent-routing) — Coding-agent integration context and application-controlled routing

## 적용 범위

로컬 독립 영상이다. YouTube 업로드·운영 Studio 등록·실제 Jev 연동은 수행하지 않았다.

## 최종 검증

- 139.000초(2분 19초), 1080×1920, 30fps, 4,170프레임, H.264/AAC, 7,490,330바이트.
- SHA-256: `845769d33cb77fa5e24028be4658ec3050003acd94655e85f32c03e596a5cb25`.
- TTS [실행 36659569103](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36659569103) 성공. 음성 12개의 대본·voiceId 일치 검사 통과. 1.15배속 적용 후 음성 합계 134.731초.
- 자막 56개, 최대 2줄·줄당 20자. 대본 전체와 자막 텍스트의 공백 제외 일치 검사 통과. 장면별 음성 뒤 여유 0.317~0.381초.
- 전체 `ffmpeg -xerror` 디코드 통과. 평균 -18.4dB, 최대 -8.4dB. -40dB 기준 0.6초 이상 무음 미검출(사람 청음·STT 검증을 뜻하지 않음).
- Chrome 실제 재생 0.514초 진행, paused=false, 오디오 20,302바이트 디코드. 37/73/137초 탐색 readyState=4, 오류 없음.
- 최종 프레임으로 만든 `storyboard.jpg` 시각 검수. 원본 v1 영상 파일은 수정하지 않음.
