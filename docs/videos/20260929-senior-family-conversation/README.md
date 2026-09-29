# 자녀에게 서운한 마음, 어떻게 말해야 할까?

시니어 시청자를 위한 **약 12분 51초·30장면의 심리학 대화 애니메이션**. Yooni - Natural & Clear 음성을 **원래 속도(1.0배속)**로 사용하고 **16:9·큰 중앙 자막·크림색 배경**을 유지한다.

- [영상](senior-family-conversation.mp4)
- [전체 대본](script.md) · [제작 설정](brief.json) · [제작 코드](produce.mjs)
- [실측 타임라인](project.json) · [장면 미리보기](storyboard.jpg) · [검증 기록](verification.json)

사용자 요청에 따라 프로젝트 docs에 제작한 로컬 검토용 결과물이다. 운영 Studio 등록이나 YouTube 발행은 하지 않았다. 샘플의 손그림 분위기를 참고해 인물·휴대전화·달력·선물·대화 도식을 새 SVG로 그렸다. 타인 영상·이미지·음성은 재사용하지 않았다. Higgsfield 생성물이 아닌 코드 기반 애니메이션이며, 공식 ElevenLabs TTS로 음성을 생성했다. 배경음악은 없다.

## 이야기와 움직임

1. 연락과 방문을 기다리는 마음, 일어난 일과 해석 구분하기
2. 일어난 일 → 내 마음 → 소중한 이유 → 작은 부탁으로 표현하기
3. 자녀의 사정 듣기, 함께 시간 정하기, 거절·문자·선물·돌봄 경계 다루기
4. 거친 말 뒤의 대화 회복, 내 삶의 연결, 안전과 존중, 네 줄 연습과 마무리

가상의 영숙 씨 가족 사례와 창작 대화 예시다. 모든 시니어가 외롭거나 모든 자녀가 무관심하다고 전제하지 않는다. 부모에게만 관계 회복 책임을 지우거나 대화법의 성공을 보장하지 않는다. 교육용 일반 대화 예시이며 진단·치료를 제공하지 않는다.

휴대전화 진동과 문자 입력, 기다림 표시, 눈 깜빡임·입 움직임·손짓·표정, 두 사람이 가까워지는 동작, 달력 체크, 선물 이동, 심장 박동, 단계별 카드 강조를 사용한다. 12fps로 그린 애니메이션을 24fps 영상으로 출력한다. 입 움직임은 발음별 정밀 립싱크가 아닌 대화 연출이다. 모든 장면에 첫 크림색 배경을 유지한다.

자막은 중앙에 최대 두 줄, 줄당 24자 이내로 표시한다. 실측 발화 길이에 글자 수 비율로 시간을 배분하며 단어 단위 강제 정렬은 아니다. 장면마다 약 0.5초의 편집 여백을 둔다. 발화의 자연스러운 쉼은 보존한다.

## 근거와 표현 범위

- [Utah State University Extension — I Messages](https://extension.usu.edu/relationships/research/effective-communication-skills-i-message-and-beyond): 자신의 경험·감정·이유·바람을 구체적으로 말하는 구성에 참고했다. 대본의 네 줄 예시는 이 원칙을 설명하기 위한 창작이며 검증된 치료 프로토콜이나 효과 보장이 아니다.
- [University of Minnesota Extension — Communicating under pressure](https://extension.umn.edu/community/family-and-wellness/mental-health/stress-and-change/communicating-under-pressure): 상대의 말을 이해하려고 듣고, 내가 이해한 뜻을 다시 확인하는 설명에 참고했다.
- [National Institute on Aging — Staying Connected](https://www.nia.nih.gov/health/loneliness-and-social-isolation/loneliness-and-social-isolation-tips-staying-connected): 자녀 외에도 친구·의미 있는 활동 등 여러 연결을 유지하는 일반 제안에 참고했다. 고령 자체를 외로움과 동일시하지 않는다.

실제 가족을 묘사하거나 개별 갈등의 원인을 확정하지 않는다. 반복적인 모욕·위협·강요가 있는 상황은 단순한 말투 문제와 구분해 안전과 도움 요청을 우선하도록 안내한다.

## 음성 및 재현

[TTS 실행 36571681242](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36571681242)에서 30장면의 원음을 생성했다. 기존 GitHub OIDC → Cloudflare 비밀 참조 → 공식 ElevenLabs 경로를 사용하며 비밀값을 산출물에 저장하지 않는다. 음성 ID는 `n2fbxG88jqAoaVPUy3IG`다. 레시피는 원음별 메타데이터의 대본과 음성 ID를 대조하고, 원본 음성을 배속 필터 없이 사용한다. 기존 1.15배속 영상의 오디오를 다시 늘리지 않는다.

Node.js, ffmpeg/ffprobe, `@resvg/resvg-js`와 Shopshorts의 NanumGothic/Jua/DoHyeon 폰트가 필요하다. 원음 artifact 보존 기간은 워크플로 설정상 1일이므로 이후 재현에는 공식 TTS 재생성이 필요하며 유료 사용량이 발생한다.

```sh
gh run download 36571681242 --repo hhj4861/commerce-automation-kit --name narration --dir /private/tmp/cak-senior-family-conversation-20260929/remote-narration
CAK_ENGINE_ROOT=/path/to/animation-enabled-checkout node docs/videos/20260929-senior-family-conversation/produce.mjs measure
CAK_ENGINE_ROOT=/path/to/animation-enabled-checkout node docs/videos/20260929-senior-family-conversation/produce.mjs preview
CAK_ENGINE_ROOT=/path/to/animation-enabled-checkout node docs/videos/20260929-senior-family-conversation/produce.mjs render
```

`SENIOR_VIDEO_CACHE`로 원음·중간 파일 경로를 변경할 수 있다. 음성 길이가 10~15분 범위 밖이면 렌더를 중단한다. 최종 검증 수치는 verification.json에 기록한다.

## 최종 검증

전체 **771.000초(12분 51초)·1280×720·24fps·18,502프레임·H.264/AAC 스테레오**다. 실측 음성은 **754.602초**, 장면 사이 추가 편집 여백은 장면당 **0.50~0.58초**다. 30개 처리 음성의 PCM 데이터가 원본 MP3를 같은 형식으로 디코딩한 데이터와 모두 일치함을 확인했다. 배속 필터를 적용하지 않는다.

30장면·258개 자막에서 대본 누락, 자막 시간 단절, 줄 길이 초과가 없음을 확인했다. ffmpeg 전체 디코딩과 Chrome 처음·중간·끝 재생 및 오디오 디코딩이 통과했다. -40dB 기준 1.2초 이상 연속 무음은 검출되지 않았다. 최종 30장면 미리보기를 검수했다. 별도의 사람 청음이나 음성 전사 검증은 수행하지 않았다.
