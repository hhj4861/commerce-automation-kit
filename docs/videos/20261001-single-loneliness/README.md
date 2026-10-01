# 잘 살아왔는데, 왜 퇴근 후가 허전할까?

경제적으로 독립한 성인 싱글 시청자를 위한 심리교육 롱폼. **싱글의 외로움 · 퇴근 후 공허함 · 정서적 연결 · 비교에서 벗어나기 · 도움을 받는 연습 · 부담 없는 관계**를 핵심 키워드로 선정했다.

가상의 지윤·현우가 퇴근 후 느끼는 허전함에서 출발해, 필요한 연결을 구체화하고 일상에서 실행 가능한 선택을 찾는 26장면의 창작 이야기다. 핵심 문장은 “내가 늘 필요한 사람이 되어야만, 사랑받을 수 있는 것은 아닙니다.”

## 제작 방식

- 원본 SVG 그림과 코드 기반 애니메이션. 따뜻한 크림색 배경, 집·카페·도시·공원·독서 장면, 눈 깜빡임·손짓·보행·표정·휴대전화·달력 등의 움직임.
- 사용자가 선택한 ElevenLabs **Kyle – Friendly, Natural and Guttural**, `RU7aSi6lT4uQBXMLgDxK`, **1.0배속**. 배속 필터 없음.
- 16:9·1920×1080 출력. 1280×720 원본 그림을 12fps로 렌더하고 1080p·24fps로 조립한다. 원래부터 24fps로 그린 애니메이션은 아니다.
- Pretendard SemiBold 두 줄 자막, 하단 중앙. 자막은 발화 길이와 글자 수로 시간을 분배한 근사 타이밍이며 강제 단어 정렬은 아니다.
- 공식 TTS 원음 대본·Voice ID를 대조한다. 처음의 미세한 무음만 제거하고 장면 끝 여백은 약 0.2~0.28초로 제한한다. 배경음악은 넣지 않는다.
- Higgsfield나 타인 영상·이미지를 사용하지 않았다. 업로드·운영 제작실 배포는 이번 작업 범위가 아니다.

## 근거와 표현 검수

- [WHO — Social connection](https://www.who.int/news-room/questions-and-answers/item/social-connection): 외로움은 원하는 연결과 실제 연결 사이의 차이에서 느끼는 주관적인 괴로움이며, 객관적 관계 부족인 사회적 고립과 구분한다. 4번 장면의 정의에 반영.
- [NHS — Dealing with loneliness](https://www.nhs.uk/every-mind-matters/lifes-challenges/loneliness/): 타인의 선택된 소셜미디어 장면과 자신을 비교하는 문제, 감정 나누기, 관심사 활동 등을 참고. 8번 장면에서 출처를 말한다.
- [CDC — Improving Social Connectedness](https://www.cdc.gov/social-connectedness/improving/index.html): 다양한 관계, 일상적 연락, 공통 관심사의 모임, 도움 주고받기와 전문가 상담 제안을 참고. 13번 장면에서 출처를 말한다.

개별 사례·대화·실험·비유는 창작이며 연구 참가자나 실제 치료 사례가 아니다. 기관이 이 영상의 전체 접근법을 검증하거나 추천했다고 주장하지 않는다. 결혼 여부·재산·나이가 외로움을 결정한다고 단정하지 않으며, 연애·결혼을 치료법으로 제시하지 않는다. 완치·기간·효과를 보장하지 않는다. 생활에 영향을 주는 지속적인 어려움은 전문가에게 도움을 요청할 수 있도록 안내한다.

## 파일과 재현

- [대본](script.md) · [설정](brief.json) · [제작 코드](produce.mjs)
- `project.json`에 실측 타임라인, `verification.json`에 최종 검증 결과를 저장했다.
- 최종 영상: `/Users/admin/Downloads/vedio/single-loneliness-kyle-100x.mp4`
- 중간 파일: 지정된 iCloud `gpt 작업/commerce-automation-kit/20261001-single-loneliness/`
- [공식 TTS 실행 36813750027](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36813750027): 26장면 생성 성공. GitHub OIDC → Cloudflare 비밀 참조 → ElevenLabs 공식 API. 토큰은 제작 파일에 저장하지 않는다. 워크플로 음성 artifact 보존은 1일이므로 이후 재현에는 보관한 원음 또는 새 유료 TTS 생성이 필요하다.
- [Pretendard](https://github.com/orioncactus/pretendard): SIL Open Font License 1.1. 기존 제작 캐시의 폰트와 라이선스를 참조한다.

```sh
# VIDEO_CACHE/VIDEO_FINAL/VIDEO_FONT로 저장 위치 변경 가능
# VIDEO_CACHE/runtime에는 @resvg/resvg-js가 필요하다.
node docs/videos/20261001-single-loneliness/produce.mjs measure
node docs/videos/20261001-single-loneliness/produce.mjs preview
node docs/videos/20261001-single-loneliness/produce.mjs render
```

## 업로드용 제안

제목: **잘 살아왔는데 왜 퇴근 후가 허전할까? | 혼자 잘 사는 어른들의 외로움**

설명: 혼자 사는 삶은 편안한데, 어떤 저녁은 유난히 허전하신가요? 경제적으로 독립한 싱글의 일상에서 느낄 수 있는 외로움을 가상의 두 인물과 함께 살펴봅니다. 비교를 잠시 멈추고, 내게 필요한 연결을 알아차리며, 부담 없는 작은 약속을 만드는 이야기입니다. 일반적인 심리교육 콘텐츠이며 개인의 진단·치료를 대신하지 않습니다. 영상의 인물·사례는 창작이며, 그림은 자체 제작 애니메이션, 음성은 AI 내레이션입니다. 참고: WHO Social connection / NHS Dealing with loneliness / CDC Improving Social Connectedness.

해시태그: #외로움 #싱글라이프 #심리학 #마음돌봄 #인간관계

조회수나 검색 노출을 보장하는 키워드는 아니다. 최종 영상은 별도 요청 전 공개 업로드하지 않는다.

## 실측 챕터

00:00 잘 사는데 왜 허전할까
02:13 내게 부족했던 연결
03:49 나를 더 외롭게 하는 해석
05:27 부담 없는 연결의 시작
07:54 도움을 주고받는 관계
09:24 나의 저녁을 돌보는 법
10:53 작은 일주일 실험
12:25 연결을 선택하는 삶

## 최종 결과와 검증

**13분 27.1초, 1920×1080, 24fps, H.264/AAC 스테레오, 43,289,059바이트**. 최종 MP4를 지정된 Downloads/vedio 폴더에 저장했다. 전체 파일 디코딩 성공, 영상·음성 길이 차이 0.02초 미만, 26장면·215개 자막의 대본 누락 및 시간 겹침 없음. Pretendard-SemiBold 실제 선택 로그를 확인했다.

전체 음성에서 -45dB 기준 1.2초 이상 긴 무음은 없었다. 전체 장면 미리보기와 완성본의 5초·400초·799초 프레임을 확인했고, 자막을 그림과 분리된 하단 여백에 배치했다. 별도 사람 청음·음성 전사 검증은 하지 않았다.

SHA-256: `25afc5666f08cb1f929fc0b0a4e6f636f8519d6a5b869fb978f5a30d816c45e5`
