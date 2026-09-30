# Jev — 그림 중심 애니메이션 개정본

사용자 피드백: 글씨 위주의 설명을 그림 위주로 바꾼다. 기존 `../20260930-jev-architecture`의 설명 순서·대본·Yooni 음성·1.15배속·중앙 자막을 유지하면서 설명 카드와 긴 제목·부제를 없애고 원본 벡터 캐릭터와 사물 동작으로 교체했다. 이전 두 버전은 보존한다.

## 화면 구성

- 초록색 Jev 로봇: 분류·판단. 주황색 LLM 작가 로봇: 글쓰기. 보라색 앱 콘솔: 흐름 제어.
- 개발 장면: 사람이 노트북과 코딩 에이전트로 앱을 만들고, 완성 앱이 Jev API를 호출하는 두 단계.
- 요청 흐름: 사람의 메시지와 문서가 앱으로 이동하고, 앱과 Jev가 요청·판단을 주고받으며 업무 도구·LLM·사람에게 경로가 나뉜다.
- 예시: 배송 조회는 트럭·상자·집·달력, 답장 작성은 펜·편지·담당자, 불확실성은 표정·물음표·일시정지 표시로 표현한다.
- 짧은 장면 제목, 역할 이름, 내레이션 자막만 유지한다. 배경은 전 장면 동일한 아이보리다.
- Jev가 LLM을 교체하거나 도구를 직접 실행한다고 묘사하지 않는다. 구조도와 사례는 개념 표현이며 실제 Jev API/주문 조회/고객 발송이 아니다.

## 파일과 재현

- `jev-explainer.mp4`: 최종 영상
- `illustrations.mjs`: 원본 캐릭터·사물 SVG와 장면별 동작. 이 파일이 이번 그림의 소스다.
- `produce.mjs`: 기존 실측 음성 재사용, 프레임 편집, 중앙 자막, 조용한 배경음 조립
- `brief.json`: 대본·출처·음성 생성 이력
- `project.json`: 최종 장면 시간·자막 정보
- `storyboard.jpg`: 실제 최종 영상에서 추출한 장면표

```sh
CAK_ENGINE_ROOT=/private/tmp/cak-automatic-explainer-pipeline node docs/videos/20260930-jev-illustrated/produce.mjs preview
CAK_ENGINE_ROOT=/private/tmp/cak-automatic-explainer-pipeline node docs/videos/20260930-jev-illustrated/produce.mjs render
```

`CAK_ENGINE_ROOT`는 자동 제작 기능과 설치된 의존성이 있는 checkout을 가리킨다. 기존 음성 기본 경로는 `/private/tmp/cak-jev-architecture-20260930/remote-narration`, 새 렌더 캐시는 `/private/tmp/cak-jev-illustrated-20260930`이다. 대본과 voiceId가 다르면 레시피가 중단된다. `JEV_NARRATION_CACHE`, `JEV_VIDEO_CACHE`로 경로를 지정할 수 있다.

TTS [실행 36659569103](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36659569103)의 음성 12개를 그대로 재사용한다. 이번 수정에서 새 TTS·Higgsfield·이미지 생성 API 호출은 하지 않았다. 인증정보와 타인의 이미지·영상·음원은 포함하지 않는다.

공식 근거는 `brief.json`과 [직전 영상 설명](../20260930-jev-architecture/README.md)에 기록되어 있다. 새 기술적 주장을 추가하지 않았으며 모든 그래프·계기·배송 결과는 개념 설명용이다.

로컬 완성 영상을 만드는 작업이다. YouTube 업로드·운영 Studio 등록·실제 Jev 통합은 수행하지 않는다.

## 최종 검증

- 139.000초(2분 19초), 1080×1920, 30fps, 4,170프레임, H.264/AAC, 19,657,395바이트.
- 영상 SHA-256: `7894199b6855e02af024a3d56231b81d5994f3c050ca4044877c360f1da662c1`.
- 전체 ffmpeg `-xerror` 디코드 통과. 자막 56개, 최대 2줄·줄당 20자, 대본 전체와 공백 제외 일치.
- 직전 버전과 디코드한 전체 오디오 해시가 동일하다: `22579e4cee53ff0fa9f5e1e8a2ffa04b284fcc1730c3667d6df631ccda6f06ea`. 음성·배속·배경음은 실제로 보존됐다.
- 각 장면의 2초/5초에서 상단 그림 영역을 비교하여 12/12장면 모두 프레임 차이 확인. 자막/하단 진행 막대를 제외한 영역이다.
- Chrome 재생 0.516초 진행, paused=false, 오디오 20,302바이트 디코드. 37/73/104/137초 탐색 readyState=4, 오류 없음.
- 최종 영상에서 추출한 장면표 시각 검수. 자막 영역과 주요 캐릭터·사물 배치를 분리했다. 사람 청음이나 STT 전사 검증을 뜻하지 않는다.
