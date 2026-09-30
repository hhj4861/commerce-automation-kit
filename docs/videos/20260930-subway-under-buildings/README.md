# 지하철은 건물 아래를 어떻게 뚫을까?

원본 3D 건축 설명 쇼츠. 지상 건물 → 지반 이동 위험 → 토압식 쉴드 → 굴착면 압력 → 배출량 조절 → 콘크리트 세그먼트 → 뒤채움 주입 → 계측 → 완성 터널 순서다.

- 영상: [subway-under-buildings.mp4](./subway-under-buildings.mp4)
- 1080×1920 / 30fps / 약 55초
- 음성: Yooni (`n2fbxG88jqAoaVPUy3IG`), 생성 후 `atempo=1.15`
- 중앙 자막, 아이보리 배경, 청록색 굴착기, 주황색 작동 부품
- 원본 Blender 3D 형상과 동작으로 제작. 타인의 영상·이미지를 사용하지 않았다.
- 이 영상은 토압식 쉴드의 개념 설명이다. 치수, 비례, 속도, 변형을 실제 설계·시공 자료로 사용할 수 없다. 모든 지반에서 같은 공법을 쓰거나 지반 변형이 전혀 없다는 뜻이 아니다.

## 제작 파일

`brief.json`은 대본과 음성 설정, `scene.py`는 Blender 장면과 애니메이션, `produce.py`는 실제 음성 길이 기반 타임라인·자막·합성을 담당한다. `sources.md`는 기술 근거이며 `verification.json`은 완성 파일의 검증 결과다.

## 재현

Blender 4.5.10, Python 3, FFmpeg(libass), Apple SD Gothic Neo 폰트가 필요하다. 작업 출력은 사용자가 지정한 iCloud 렌더 루트 아래 개별 폴더로 분리한다. TTS는 기존 `tts-remote.yml` 공식 ElevenLabs 호출 워크플로의 run `36706679980`을 사용했다. 인증정보는 소스에 포함하지 않는다.

```sh
python3 produce.py prepare --cache "$VIDEO_CACHE"
"$BLENDER" --background --python-exit-code 1 --python scene.py -- --cache "$VIDEO_CACHE" --preview
"$BLENDER" --background --python-exit-code 1 --python scene.py -- --cache "$VIDEO_CACHE"
python3 produce.py assemble --cache "$VIDEO_CACHE"
```

`remote-narration/beat-00.mp3`부터 `beat-08.mp3` 및 각 메타데이터 파일이 캐시에 필요하다. 준비 단계에서 대본과 음성 ID 일치를 검증한다. 속도를 적용한 실제 음성 길이에 장면당 약 0.13초를 더해 장면을 구성한다. 자막은 문장 글자수에 비례해 시간을 배분하며 단어 강제 정렬 결과는 아니다.

YouTube 업로드나 운영 제작실 변경을 포함하지 않는 독립 영상 산출물이다.
