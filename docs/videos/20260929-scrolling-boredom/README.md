# 쇼츠를 계속 보는데 왜 더 심심할까?

사용자 승인 주제로 제작한 65초 세로 심리학 애니메이션. Shorts 고정 음성 **Yooni - Natural & Clear**, 음높이를 유지하는 **1.15배속**, **중앙 자막**을 사용한다.

- [현재 영상 · 1.15배속](scrolling-boredom-115x.mp4) · [이전 60초 · 1.25배속](scrolling-boredom-60s.mp4)
- [대본](brief.json) · [제작 코드](produce.mjs)
- [실측 타임라인·자막](project.json) · [장면 미리보기](storyboard.jpg) · [검증 기록](verification.json)

현재 프로젝트 docs에 저장하는 검토용 결과물이며 운영 Studio나 YouTube에는 등록·발행하지 않는다. 사용자가 제공한 샘플의 손그림 분위기를 참고하되, 최신 요청에 따라 처음의 크림색 배경을 전 장면에 유지하고, 인물·스마트폰·책·화면 속 그림을 새 SVG로 그렸다. 타인 영상·음성·썸네일은 사용하지 않았다. Higgsfield 생성물이 아닌 코드 기반 애니메이션이며, 음성만 기존 Cloudflare 인증을 사용하는 공식 ElevenLabs TTS로 생성한다. 배경음악은 없다.

## 대본과 편집

기존 9장면 대본을 그대로 유지하고 원음을 **1.15배속**으로 다시 처리했다. 발화 길이는 **61.912초**, 전체는 **65초**다. 음성의 앞뒤를 잘라 대사를 누락시키지 않는다. 추가 편집 여백은 합계 **3.088초**, 장면당 **0.32~0.38초**다. 이 수치는 음성 파일 밖의 여백이며 발화 자체의 자연스러운 쉼까지 모두 제거했다는 뜻은 아니다.

[YouTube 공식 기준](https://support.google.com/youtube/answer/15424877?hl=en)의 세로·최대 3분 조건에 들어간다. 실제 업로드 검증은 수행하지 않았다.

전개: 공감 질문 → 다음 영상을 찾는 행동 → 같은 10분의 실험 비교 → 예상과 다른 결과 → 책의 첫 장 비유 → 몰입에 대한 해석 → 연구 범위 → 직접 비교할 행동 → 마무리.

캐릭터의 표정·손짓, 화면 스크롤, 책의 이동, 설명 요소의 순차 등장으로 움직임을 만든다. 실험 결과는 방향만 도식화하며 임의의 효과 크기나 확률을 그리지 않는다. 자막은 문장 안에서 길이를 균형 있게 나누어 짧은 어미만 단독으로 뜨지 않게 했으며, 배속 적용 후 음성 길이에 맞춰 글자 수 비율로 시간을 배분한다. 단어 단위 강제 정렬은 아니다.

## 근거와 표현 범위

- Tam, K. Y. Y., & Inzlicht, M. (2024). *Fast-forward to boredom: How switching behavior on digital media makes people more bored*. Journal of Experimental Psychology: General, 153(10), 2409–2426. [논문 초록](https://pubmed.ncbi.nlm.nih.gov/39158465/) · [DOI](https://doi.org/10.1037/xge0001639).
- [APA 연구 발표](https://www.apa.org/news/press/releases/2024/08/online-videos-boredom): 같은 10분 동안 한 영상을 이어 보는 조건과 여러 영상 사이를 바꾸는 조건의 비교. 이어 본 조건에서 지루함이 낮고 만족·주의 몰입·의미 평가가 높았다는 결과를 설명한다.
- [저자 연구실의 실천 제안](https://yytamlab.psych.utoronto.ca/life-hacks.html): 넘기기·빨리 감기를 줄이고 내용에 주의를 기울여 보는 제안.

논문은 총 1,223명의 7개 실험을 보고하며, 비대학생 표본과 온라인 글 조건에서는 결과가 덜 분명했다. 영상에서도 모든 사람에게 동일한 효과라고 일반화하지 않는다. 뇌 손상·도파민 고갈·중독을 측정하거나 진단한 연구로 설명하지 않는다. 책의 첫 장 비유와 “재미에 들어갈 시간”은 설명을 위한 창작 표현이다. 마지막 행동은 효과를 보장하는 치료법이 아닌 자기 비교 제안이다. 이 연구는 짧은 영상이라는 형식 전체의 해로움이나 이번 재생속도 설정의 영향을 검증한 연구가 아니다.

## 음성 생성 및 재현

[TTS 실행 36565021120](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36565021120)이 성공했다. 10개 원음 중 인덱스 `0,1,2,3,5,6,7,8,9`를 최종 대본 순서로 선택했다. 음성 ID는 `n2fbxG88jqAoaVPUy3IG`이며 각 파일의 메타데이터와 대본을 대조한다. 생성 비밀값은 저장하지 않는다.

원본 실행의 artifact를 사용하는 경우, 위 인덱스의 mp3와 mp3.json을 각각 `beat-00`부터 `beat-08`로 순서대로 복사해 캐시의 `remote-narration/`에 둔다. 원격 artifact 보존 기간은 워크플로 설정상 1일이다. 이후에는 아래 dispatch로 현재 9장면 대본을 새로 생성할 수 있으며, 유료 사용량이 발생한다.

```sh
CAK_ENGINE_ROOT=/path/to/animation-enabled-checkout node docs/videos/20260929-scrolling-boredom/produce.mjs dispatch
# 위 dispatch로 새로 생성한 9장면 실행은 인덱스 재배열 없이 받는다.
gh run download RUN_ID --repo hhj4861/commerce-automation-kit --name narration --dir /private/tmp/cak-scrolling-boredom-20260929/remote-narration
CAK_ENGINE_ROOT=/path/to/animation-enabled-checkout node docs/videos/20260929-scrolling-boredom/produce.mjs measure
CAK_ENGINE_ROOT=/path/to/animation-enabled-checkout node docs/videos/20260929-scrolling-boredom/produce.mjs render
```

캐시는 `BOREDOM_VIDEO_CACHE`로 변경 가능하다. 레시피는 설정된 목표 길이를 넘는 음성과 과도한 빈 시간을 만드는 짧은 음성을 거부한다. 최종 검증 기록은 verification.json을 참조한다.

## 최종 검증

65.000초·1080×1920·30fps·1950프레임, H.264/AAC 스테레오를 확인했다. 9장면·28개 자막의 대본 누락 없음, 장면 내부 자막 시간 연속성과 중앙 배치를 검증했다. -40dB 기준 0.7초 이상 연속 무음은 검출되지 않았다. ffmpeg 전체 디코딩과 Chrome 재생·음성 디코딩·끝부분 탐색이 통과했다. 최종 9장면 이미지를 검수했다. 별도의 청음이나 음성 전사 검증을 수행했다는 의미는 아니다.
