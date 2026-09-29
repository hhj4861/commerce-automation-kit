# 0.1도 뒤 지구 붕괴? 재난의 연결고리

요청: 기후위기 보도와 일본 홍수·중국 태풍·네팔 지진의 관련성을 논리적으로 설명하는 애니메이션. 이전 제작과 같은 1분 세로 영상으로 구성했다.

- [영상](climate-causality-60s.mp4)
- [제작 코드](produce.mjs) / [대본·연출 입력](brief.json)
- [실측 타임라인·자막](project.json) / [장면 미리보기](storyboard.jpg) / [검증](verification.json)

운영 앱이나 영상 플랫폼에는 등록·발행하지 않은 로컬 검토용 콘텐츠다. 코드로 만든 원본 SVG 애니메이션과 ElevenLabs 한국어 내레이션을 합성한다. 음성은 ‘진건 · 차분한 남성’이며, 배경음악은 사용하지 않는다. 원격 TTS 워크플로가 Cloudflare에서 기존 인증을 받아 생성한다. 인증값은 코드·문서·영상에 저장하지 않는다. Higgsfield나 Gemini 영상 생성은 사용하지 않았다.

음성 생성 기록: [최초 9장면](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36546005583), [길이를 줄인 7·8번 장면](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36546675306). 두 실행 모두 성공했다. 최종 음성 실측 합계는 55.310초이며 장면 전환·호흡 시간을 포함해 총 60초로 편집한다. 음성을 잘라내거나 배속하지 않는다.

검증 결과: 60.000초, 1080×1920, 30fps/1800프레임, H.264 + AAC 스테레오, 자막 15구간. ffmpeg 전체 디코딩과 Chrome 실제 재생·음성 디코딩·끝부분 탐색을 통과했다. 모든 장면의 대사가 해당 장면 길이 안에 들어간다. 음성 평균 레벨은 -18.7dB, 최대 -1.6dB이며 9개 장면의 제목·자막·조건 설명을 이미지로 확인했다. 별도의 청음·음성 전사 검증을 했다는 의미는 아니다.

## 샘플에서 반영한 요소

사용자가 제공한 `/Users/admin/Downloads/KakaoTalk_Video_2026-09-29-16-42-54.mp4`를 로컬에서 분석했다. 파일은 1280×720, 24fps, 약 67.375초다. 8초 간격의 장면과 이후 움직임 샘플을 확인 대상으로 삼았다.

- 크림색 종이 느낌의 배경, 얇고 약간 불규칙한 손그림 선.
- 단순한 물체에 얼굴·팔·다리를 붙이는 표현과 작은 흔들림, 등장 동작.
- 복잡한 관계를 설명할 때 짙은 남색 화면과 선 도해로 전환.
- 짧은 장면 제목과 하단의 밝은 자막 영역.

새 영상에서는 지구·물방울·구름을 새로 그리고, 탄소예산·판 운동을 도해로 설명한다. 샘플의 캐릭터·브랜딩·실제 프레임·음성은 복사하거나 삽입하지 않았다. 가로 원본의 시각적 특징을 세로 구도로 재구성한 것이며 원본과 동일한 작화·동작을 재현했다는 뜻은 아니다.

## 보도 확인과 핵심 판단

사용자 제공 링크:

- https://youtube.com/shorts/xIqrv8gGVUs — 블루노트 채널, 2026-09-27 게시. 공식 YouTube Data API의 제목·설명을 확인했으며, 설명란이 아래 YTN 보도를 출처로 명시한다. 영상의 전체 자막을 별도로 내려받거나 시청했다고 주장하지 않는다.
- https://youtu.be/w3bLMs9CXno — YTN 「붕괴까지 앞으로 3년 밖에 안 남았다...재앙급 예고」. [방송사 원문, 2026-09-27](https://www.ytn.co.kr/_ln/0134_202609271048533173)을 확인했다. 본문·영상은 재사용하지 않고 제기된 주장을 원자료와 대조했다.

**‘0.1°C 후 지구 전체가 붕괴한다’는 단일한 과학적 경계나 날짜로 설명할 수 없다.** 1.5°C는 산업화 이전 대비 장기 온난화의 국제 목표이며 단일 연도의 평균기온과 다르다. ‘3년’은 연구의 추정 기준일·확률·배출량 가정이 붙는 탄소예산 계산이다. 지금부터 정확히 3년 뒤 붕괴한다는 예보가 아니다.

일본 홍수·중국 태풍의 구체적 날짜·지역·사건명은 제공되지 않았다. 따라서 개별 재난이 온난화 때문에 발생했다거나 기여도가 얼마라고 단정하지 않는다. 온난화가 강한 강수 위험을 키우는 일반적인 경로와, 개별 사건 분석의 필요성을 설명한다. 태풍의 강수량·강도 변화와 전 세계 태풍의 총 발생 수는 같은 지표가 아니다. 홍수 피해에는 강우뿐 아니라 지형·배수·토지 이용·노출도 등이 작용한다.

네팔의 주요 지진을 설명하는 핵심은 인도판과 유라시아판의 충돌 및 단층 운동이다. 영상은 이 주된 발생 원인을 온난화의 직접 결과로 묶지 않는다. 기후와 지진 사이에 어떠한 물리적 상호작용도 없다고 일반화하는 것은 아니다. 지표의 물·얼음 하중 변화가 단층 응력에 영향을 줄 수 있다는 연구는 있으나, 제시되지 않은 특정 네팔 지진을 온난화 때문이라고 결론 내릴 근거가 아니다.

마지막의 위험 곡선은 정량 예측 그래프가 아닌 설명용 개념도다. 모든 위험이 매끄럽게 증가하거나 완전히 되돌릴 수 있다는 뜻은 아니다. 일부 시스템의 임계점·비가역적 영향이 존재할 수 있으며, 지구 전체에 적용되는 단 하나의 ‘붕괴 스위치’로 단순화하지 않는다.

## 장면별 근거

| 장면 | 설명 | 원자료 |
|---|---|---|
| 1–2 | 1.5°C 장기 목표와 단일 연도 구분 | [WMO, 2026 기후 전망 설명](https://wmo.int/media/news/new-report-suggests-more-global-temperature-records-ahead): 파리협정 기준은 통상 약 20년으로 평가하는 장기 온난화. |
| 3 | 탄소예산과 약 3년의 조건 | [Forster et al., Indicators of Global Climate Change 2025, ESSD 2026, §9](https://essd.copernicus.org/articles/18/3889/2026/): 2026년 초 기준 1.5°C 이내 제한 가능성 50%의 잔여 예산 약 130 GtCO₂. 2025년 배출량 약 42 GtCO₂/년이 유지될 경우 3년 남짓. 예산 소진 시점은 1.5°C 도달 시점과 정확히 같지 않음을 원문이 명시. |
| 4 | 더 따뜻한 공기와 수증기·강한 비 | [IPCC AR6 WGI §8](https://www.ipcc.ch/report/ar6/wg1/chapter/chapter-8/): 대기의 수증기 수용능력 증가와 강한 강수 강화. 영상은 모든 지역의 총 강수량이 똑같이 증가한다고 말하지 않음. |
| 5–6 | 태풍 강수 위험과 사건별 분석 구분 | [IPCC AR6 WGI SPM A.3.4](https://www.ipcc.ch/report/ar6/wg1/chapter/summary-for-policymakers/), [§11](https://www.ipcc.ch/report/ar6/wg1/chapter/chapter-11/): 인간 유발 기후변화가 열대저기압 관련 강한 강수를 증가시킨다는 높은 신뢰도. 특정 일본·중국 사건의 귀속 분석을 수행한 것은 아님. |
| 7–8 | 네팔 지진의 판 구조적 원인 | [USGS, 2015 M7.8 네팔 지진](https://www.usgs.gov/programs/earthquake-hazards/science/m78-nepal-earthquake-2015-a-small-push-mt-everest), [USGS 지진 개요 지도](https://earthquake.usgs.gov/product/poster/20150425/us/1480720073451/poster.pdf). 2015 사례는 일반적인 판 충돌 설명의 근거이며 사용자가 언급한 사건이 2015년이라고 가정하지 않음. |
| 보충 | 물·얼음 하중과 지진의 제한적 연결 | [NASA, Can Climate Affect Earthquakes, Or Are the Connections Shaky?](https://science.nasa.gov/earth/climate-change/can-climate-affect-earthquakes-or-are-the-connections-shaky/). 기상과 지진의 동시 발생만으로 인과를 추론하지 않음. |
| 9 | 추가 온난화마다 위험 증가·감축의 의미 | [IPCC AR6 종합보고서 발표](https://www.ipcc.ch/2023/03/20/press-release-ar6-synthesis-report/). 감축과 적응의 중요성을 설명하는 결론. |

## 재현 방법

애니메이션 기능이 포함된 commerce-automation-kit checkout, npm 의존성, ffmpeg/ffprobe가 필요하다. 현재 프로젝트 checkout이 이전 버전이면 `CAK_ENGINE_ROOT`로 해당 엔진 checkout을 지정한다. 실행되는 앱 파일 자체를 수정하는 레시피는 아니다.

```sh
CAK_ENGINE_ROOT=/path/to/engine node docs/videos/20260929-climate-causality/produce.mjs dispatch
# GitHub Actions에서 최근 tts-remote 실행을 확인한 뒤, 성공한 실행의 narration artifact를 받는다.
gh run download RUN_ID --repo hhj4861/commerce-automation-kit --name narration --dir /private/tmp/cak-climate-causality-20260929/remote-narration
CAK_ENGINE_ROOT=/path/to/engine node docs/videos/20260929-climate-causality/produce.mjs preview
CAK_ENGINE_ROOT=/path/to/engine node docs/videos/20260929-climate-causality/produce.mjs render
```

`dispatch`는 새 유료 TTS 요청을 생성하므로 기존 성공 실행을 재사용할 때는 반복하지 않는다. `preview`와 `render`는 받은 음성과 해당 대본이 일치하는지 검사한다. 음성 길이를 실측해 1800프레임으로 배분하며, 길이가 초과하면 중단한다. 대사를 자르거나 배속하지 않는다. 캐시는 `CLIMATE_VIDEO_CACHE`로 바꿀 수 있다. SVG 도형·움직임·색상은 `produce.mjs`, 대본과 제목은 `brief.json`에서 수정할 수 있다.
