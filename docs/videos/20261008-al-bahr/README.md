# 이 빌딩은 왜 햇빛을 따라 우산을 펼칠까?

알 바흐르 타워(아부다비)의 외부 차양을 설명하는 **54.875초 건축 쇼츠**. 완성 파일은 `/Users/admin/Downloads/vedio/al-bahr-webtoon-short.mp4`다. 유튜브 업로드·Shopshorts 운영 배포는 수행하지 않았다.

## 제작 결과

- 1080×1920 / 24fps / H.264 + AAC, 약 35MB.
- 웹툰 원화 기반 Higgsfield 도입 6초 + 코드 기반 입체 구조 설명. 본문은 정지 그림 확대가 아니라 차양 접힘·펼침, 햇빛 경로, 실내 가열 및 선택적 면 개폐를 움직인다.
- Kyle `RU7aSi6lT4uQBXMLgDxK`, ElevenLabs multilingual v2, 후처리 1.1배. Pretendard SemiBold 자막.
- 같은 사무실을 따라 햇빛 유입→바닥·가구 가열→외부 차양→냉방 부담 감소로 연결. 에어컨이 불필요해진다는 주장은 하지 않는다.
- 마지막 음성 뒤 2.736초 유지. 음성 실측에 따라 길이를 정했고 문장을 잘라 맞추지 않았다.
- 구조·형태는 자체 제작한 설명용 재구성이다. 실제 패널 치수·배치·시간 스케일의 정밀 시뮬레이션은 아니다.

## 사실 근거와 비용

[설계 엔지니어 Arup의 Al Bahr Towers 프로젝트](https://www.arup.com/projects/al-bahr-towers/). 유리 밖의 umbrella-like 차양이 태양에 맞춰 동작하고 유입 일사를 줄이는 원리를 사용했다. 수치 절감률·세계 최초 등은 넣지 않았다.

Higgsfield Seedance 2.0 std/1080p/6초 1회 생성, 견적 54크레딧. 제출 ID `722f2140-b1da-47c2-b223-43c8c31850d0`, 완료 후 다운로드. 재생성 없음. 실제 계정 결제 총액을 견적으로 단정하지 않는다. 원화는 native imagegen을 사용했고 OpenAI API 키를 사용하지 않았다.

TTS는 [공식 원격 제작 워크플로 실행 37740232027](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37740232027)에서 6개 음성을 생성했다. 메타데이터의 원문·음성·모델 일치를 검증했다.

## 검증

- 최초 대본 검토의 payoff/pacing 부족을 보완하고 별도 검토 7항목 전부 통과. `review.json`의 인용·판정 및 digest로 현재 대본 일치를 확인한다.
- 원문 기반 Whisper 강제 정렬 후 실제 배속을 타임스탬프에 반영. 전체 대본이 20개 자막 구간에 빠짐없이 포함되는지 검사했다.
- 1,317프레임, 전체 디코딩 통과, A/V 길이 차이 0.1초 미만, 0.5초 이상 검은 구간 없음.
- 최대 음량 -1.4dB. 1초 이상 무음은 도입 영상의 짧은 여유와 의도한 엔딩뿐이다.
- 대표 최종 8프레임과 차양 개폐 미리보기를 직접 확인. 모든 프레임을 사람이 검사한 것은 아니다.
- 초기 조립에서 ffmpeg 페이드 `d=.5`가 거부되어 `d=0.5`로 수정한 뒤 전체 조립·검증을 다시 실행했다.

## 재현 소스와 작업 카드

소유: Codex / `feat/al-bahr-webtoon`, base `985831e`. 이 폴더와 관련 점검 문서만 변경했다. 앱 런타임 구현은 변경하지 않았다.

- `story.json`: 대본·화면 계획·근거·음성·예산.
- `produce.mjs`: 별도 대본 검토, 공식 Higgsfield 견적/생성/상태 수집. 제출이 불명확하면 재제출하지 않는다.
- `media.mjs`: TTS 작업 영수증과 원격 산출물 검증/수집.
- `scene.py`: Blender 4.5.10 입체 장면·동작 렌더.
- `render.py`: align → plan → assemble → verify → contact. Blender는 plan 후 assemble 전에 실행한다.
- `review.json`, `verification.json`: 현재 대본과 최종 파일의 검증 근거.

작업 자산·로그·중간 렌더: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261008-al-bahr`. 인증정보는 포함하지 않는다. 재생성은 기존 영수증과 크레딧 승인을 확인해야 한다.

완료 기준인 대본 검토·렌더·음성/자막·최종 검사는 통과했다. 본인 소스의 커밋·푸시 후 전달한다. 현재 앱 점검의 운영 오류는 [별도 감사 문서](../../qa/20261008-shopshorts-pipeline-audit.md)에 남겼으며 복구 완료로 취급하지 않는다.
