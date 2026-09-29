# 초고층 빌딩 꼭대기에 구멍을 뚫는 이유

새로 제작하는 건축학 설명 쇼츠. 상하이 세계금융센터의 상단 개구부를 사례로 바람에 대응하는 설계를 설명한다.

- 형식: 세로 1080×1920, 30fps. 실제 TTS 길이 + 장면당 약 0.3초로 러닝타임 결정.
- 음성: Yooni – Natural & Clear, 피치 유지 1.15배속.
- 중앙 2줄 이내 자막, 어두운 녹색·차콜·골드, 낮은 자체 합성 배경음.
- 외관·풍동 개념 영상 4컷은 Higgsfield Seedance 2.0, 나머지 4컷은 직접 작성한 SVG 애니메이션.
- 참고 영상의 픽셀·오디오는 재사용하지 않는다. 풍동 장면은 실제 현장 기록이 아닌 AI 개념 재현이다.
- 원리 그림의 흐름·압력·비율은 수치 시뮬레이션이 아니다. 압력 감소율이나 안전 보장 수치는 주장하지 않는다.

## 사실 근거

- [SWFC 공식 개요](https://www.swfc-shanghai.com/about_intro.php?l=en): 높이 492m, 101층.
- [프로젝트 참여사 Otis](https://www.otis.com/en/us/our-company/global-projects/project-showcase/shanghai-world-financial-center): 상단 사다리꼴 개구부가 풍압을 줄이는 역할, 병따개 별명.
- [SWFC 2008년 개관 자료](https://swfc-shanghai.com/up_pdf/1321340644_23490.pdf): 상단 개구부의 풍압 감소 목적. 공식 검색 색인 발췌 확인, PDF 직접 조회는 시간 초과.
- [RWDI](https://rwdi.com/services/wind-engineering/): 풍동 시험과 건축 설계의 관계. 본 영상의 실험실이 실제 SWFC 실험 기록이라는 뜻은 아니다.

## 재현

제작 레시피는 `produce.mjs`, 대본과 원본 출처는 `brief.json`이다. 인증정보는 저장하지 않는다.

```sh
CAK_ENGINE_ROOT=/private/tmp/cak-automatic-explainer-pipeline node docs/videos/20260930-skyscraper-wind/produce.mjs dispatch
# 해당 tts-remote 실행의 narration 아티팩트를 /private/tmp/cak-skyscraper-wind-20260930/remote-narration 에 다운로드
CAK_ENGINE_ROOT=/private/tmp/cak-automatic-explainer-pipeline node docs/videos/20260930-skyscraper-wind/produce.mjs render
```

캐시가 없으면 유료 미디어 생성이 발생한다. 접수 기록과 파일 캐시로 중복 생성을 방지한다.
## 완성 및 검증

- `skyscraper-wind.mp4`: 70.000초, 1080×1920, 30fps, 2,100프레임, H.264/AAC, 29,702,717바이트.
- SHA-256: `d43c7a74b6f3f3c3ad9da5997f725c962ea8c6062baaa583629bb71c101c9000`.
- Yooni 생성 [실행 36639351825](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36639351825) 성공. 대본/음성 ID 메타데이터 일치 검증 후 atempo=1.15 적용. 음성 합계 67.572초.
- 장면 사이 여유 0.287~0.340초. 장면별 프레임을 이어 붙여 인위적 검은 공백 방지.
- 자막 30개, 최대 2줄·줄당 20자. 공백을 제외한 전체 내레이션과 자막의 문자 일치 검증.
- Higgsfield Seedance 2.0 9초 영상 4개, 합계 324크레딧. 기존 접수 ID를 유지하며 병렬 대기. 추가 재생성 없음.
- 첫 장면은 생성 영상의 카메라 이동을 역순으로 편집해 첫 프레임부터 개구부가 보인다. 실제 실험이나 물리적 사건을 역재생한 것은 아니다.
- 전체 ffmpeg 디코드(`-xerror`) 성공. 최종 오디오 최대 -8.3dB, 평균 -18.3dB. 배경음은 자체 합성하고 내레이션 중 볼륨을 낮춘다.
- Chrome 실제 재생: 70초·1080×1920 확인, 0.763초까지 진행, 오디오 디코드 25,936바이트. 35초·68초 탐색 readyState=4, 오류 없음.
- `storyboard.jpg` 8장면과 도입부 프레임을 시각 검수했다. 사람 청음·STT 전사 검증을 했다는 뜻은 아니다.

로컬 완성 파일이며 YouTube 업로드·운영 Studio 등록은 수행하지 않았다.
