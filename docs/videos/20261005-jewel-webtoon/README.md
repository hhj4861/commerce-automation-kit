# 창이공항 주얼 — 웹툰 쇼츠

- 요청: 폭포가 기존 선로를 피해 배치된 이유와 비대칭 지붕으로 이어지는 설계 결과를 45초 안팎으로 설명.
- 소유/기준: 현재 Codex 단독, feat/jewel-webtoon-short, 06e4fa2(PR152 설명 검토 구현).
- 범위: 신규 영상 한 편. 웹/배포/기존 완성본 변경 없음. Kyle 1.1배, 웹툰, Higgsfield 도입6초/최대54크레딧.
- 사실 근거 및 표시할 한계: story.json.research. 가정 배치와 실제 설계 방향을 구분하고 움직이는 폭포로 오해시키지 않는다.
- 완료 기준: 독립 대본 검토 합격 → 원화/도입/음성 → 실제 발화 기반 자막 → 동적 설계 설명 → 시각/음성/디코딩/대본 누락 검사 → Downloads/vedio 결과 → 본인 소스 커밋·push.
- 현재: 34.33초 완성본 렌더·검증 완료. 본인 소스 커밋·push 단계.


## 결과 및 검증

- 결과: `/Users/admin/Downloads/vedio/jewel-airport-webtoon-short.mp4`, 1080×1920, 24fps, 824프레임, 34.33초. 실제 발화 길이에 맞췄고 길이를 맞추기 위한 패딩·추가 배속은 하지 않았다.
- 음성: Kyle `RU7aSi6lT4uQBXMLgDxK`, 1.1배. Pretendard SemiBold 자막 14구간. 원본 일러스트 배경을 유지한다.
- 도입: Higgsfield Seedance 2.0, 6초, 54크레딧, 1회 생성. 생성 ID와 해시는 verification.json 참조.
- 첫 대본은 지붕에서 유리 패널까지 설명이 압축됐다는 독립 검토로 거절됐다. 패널 이야기를 빼고 ‘구멍부터 가장자리까지 서로 다른 거리 → 비대칭 곡면’으로 집중한 새 대본은 7개 검토 항목을 통과했다. 유료 생성 전에 입력 digest와 검토 결과를 확인했다.
- 전체 ffmpeg 디코딩, A/V 길이 일치, 전체 대사 자막 포함, 최대 2줄 자막, 검은 화면/1.5초 이상 무음 없음 확인. 독립 Whisper 전사에서 7개 의미 구간과 결말이 회수됐다. 고유명사 등의 인식 오차가 있어 발음 완벽성의 증명으로 해석하지 않는다.
- 도입 4프레임 및 최종 8지점 화면 검토. 지붕 도해가 배경에 묻히는 초안을 불투명 유리 면/밝은 선으로 수정했다.
- 기존 건물을 그대로 측량한 영상이 아닌 원리 설명용 재구성이다. 가정 배치와 실제 설계 방향을 표시했으며, 실제 작동 중인 폭포를 옮긴다는 뜻이 아니다. 웹 게시·YouTube 업로드는 수행하지 않았다.

## 재현

산출물 루트는 `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261005-jewel-webtoon`이다. `story.json`은 대본·근거·장면의 원본이며 `produce.mjs`는 공식 생성 어댑터, `render.py`는 장면/자막/최종 조립 코드다.

`VIDEO_CACHE`를 산출물 루트로, `CAK_ENGINE_ROOT`를 의존성이 설치된 같은 저장소 런타임으로 설정한다. `produce.mjs review → preflight → tts → generate → poll` 순서이며 TS 어댑터를 호출하는 tts에는 런타임의 tsx loader가 필요하다. 이미 접수된 생성은 receipt를 재사용한다. 새 캐시에서 실행하면 유료 호출이 발생한다. `python3 render.py align|plan|preview|render|verify --cache "$VIDEO_CACHE"`로 조립한다. ffmpeg, Pillow, numpy, Whisper base, Pretendard 폰트가 필요하다. 현재 폰트/모델의 기본 캐시 경로는 앞선 제작 산출물 위치이므로 다른 환경은 해당 위치를 조정한다.

원화는 imagegen 스킬로 원본 생성했다. 기존 사용자 웹툰 참조의 섬세한 선·따뜻한 조명/차가운 배경을 참고하고, 창이공항 아트리움에 우측 폭포와 옆으로 지나는 열차를 그렸다. 원본은 산출물 `art/hero.png`; 제3자 영상 다운로드·재사용은 없다.
