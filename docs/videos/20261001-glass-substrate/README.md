# AI의 숨은 기반 1 — 유리기판

**AI칩 아래에 깨지기 쉬운 유리를 넣는다고?**

15개 장면의 한국어 설명 영상. 칩 연결의 병목, 패키지 대형화와 휘어짐, 열팽창 차이, 유리 코어의 장점과 제조 난제, 일상 속 AI와의 관계를 연결한다. 마지막에는 TGV 편으로 이어진다. 업체는 Intel·삼성전기·SKC/Absolics의 기술 공개와 검증 단계로만 짧게 소개한다. 근거와 표현 한계는 `sources.md`에 기록했다.

## 실제 산출·검증

2026-10-01 최종 MP4 생성: **6분 13.938초**, 416,599,365바이트. 전체 디코딩 통과, 영상/음성 스트림 확인, 자막 110개 원문·타이밍·겹침 검사 통과. -40dB 기준 1.3초 이상 무음 없음. 최종 내보내기에서 주요 8개 장면을 추출해 화면 잘림·범례·자막을 시각 검수했다. 검증 수치와 SHA-256은 `verification.json`, 실제 장면 시작/종료는 `project.json`에 있다.

## 제작 구성

- Kyle `RU7aSi6lT4uQBXMLgDxK`, ElevenLabs multilingual v2, **1.0배속**. GitHub 공식 TTS 작업 `36826211195`에서 생성. 기존 Cloudflare 시크릿 연결을 사용했다.
- Blender 4.5.10 원본 3D 15종. 밝은 웜 그레이 배경, 짙은 칩, 구리 배선, 청록 유리 코어. 1280×720 소스를 1920×1080 / 24fps로 편집. 변형과 구조는 개념 표현이며 실측 모형이 아니다.
- Higgsfield Seedance 2.0 1080p 공장 삽입 영상 6초. 실제 공장 촬영이 아닌 AI 재현으로 화면에 표시한다. 서버 삽입 영상은 크레딧 부족으로 거절되어 자체 3D로 대체했다. 추가 결제·무한 재시도 없음.
- Pretendard SemiBold 하단 중앙 자막. Whisper base에 **승인된 원문**을 강제 정렬하며 음성을 임의로 전사한 문장으로 교체하지 않는다. 인접 자막은 겹치지 않으며 긴 문장은 균형 있는 두 줄로 표시한다.
- 내레이션에 속도 필터를 적용하지 않는다. 장면 길이는 실제 음성 길이 + 약 0.12초로 정하며 -16 LUFS 목표로 정규화한다. 전체 파이프라인은 완성 MP4까지 실제 디코딩 검사한다.

## 파일과 실행 순서

최종 영상: `/Users/admin/Downloads/vedio/glass-substrate-episode-1.mp4`.

중간 영상·음성·모델·로그는 사용자 지정 iCloud 작업 루트의 `commerce-automation-kit/20261001-glass-substrate/`에 보관한다. 인증정보는 이 폴더에 저장하지 않는다. 패키지 소스, 대본 및 검증 기록만 Git에 포함한다.

1. `produce.mjs tts`: 기존 `tts-remote.yml` workflow_dispatch → 성공한 narration 아티팩트를 `VIDEO_CACHE/remote-narration`으로 받는다. 유료 TTS 재실행은 새 호출이다.
2. `produce.mjs cost`: 공식 Higgsfield CLI 비용 조회. `generate <id>`는 영수증을 먼저 저장하고 기존 요청을 재조회한다. 요청 ID 없는 제출 기록은 중복 과금 방지를 위해 자동 재시도하지 않는다.
3. `align.py --cache <VIDEO_CACHE>`: 원문/Voice ID 일치 확인, 원문에 음성 타이밍 정렬. 각 입력은 모델의 30초 창 이하여야 한다.
4. Blender `-b -t 4 --python scene.py -- --cache <VIDEO_CACHE>/3d`: 15개 원본 장면을 렌더링한다. 기본 192프레임(8초)/24fps. `--preview --shot package`로 미리보기를 먼저 확인할 수 있다.
5. `assemble.py --cache <VIDEO_CACHE> --font-dir <Pretendard 폴더> --output <최종 MP4>`: 3D 렌더 완료를 확인한 후 자막·음성을 조립한다. 편집 규칙 변경 시 `--force`로 재합성한다.
6. `verify.py --cache <VIDEO_CACHE> --video <최종 MP4>`: 전체 디코딩, 비디오/오디오 스트림, 길이, 자막 원문/겹침/영역, 긴 무음 구간을 검증한다. 정지 화면은 별도로 시각 확인한다.

`produce.mjs`는 `VIDEO_CACHE`, `CAK_ENGINE_ROOT`와 공식 CLI를 가리키는 `SHOPSHORTS_HIGGSFIELD_CLI`를 사용한다. 이번 실행의 인증/다운로드 어댑터는 기존 `shopshorts-release-8596e3b`의 `studio-higgsfield-auth.mjs`, `studio-higgsfield.mjs`, `runner-client.mjs`이다. 비밀은 기존 Cloudflare 브로커에서 읽고 단기 인증 파일은 승인된 로컬 보안 저장소에만 둔다. CLI 버전은 1.1.26. OS 디스크 마운트가 실패해 공식 7-Zip 26.03으로 기존 Blender DMG를 작업 산출물 폴더에 풀어 실행했다.

영상 생성 소스의 작업 브랜치 저장이며 운영 제작실 배포나 YouTube 게시를 뜻하지 않는다.


## v2 재제작 — 2026-10-01

사용자 요청: 1탄을 다시 제작하되 이전 Higgsfield 영상을 재사용한다. 기존 완성본을 덮어쓰지 않고 `glass-substrate-episode-1-v2.mp4`로 내보낸다. 재제작 완료: **6분 13.938초 / 1920×1080 / 363,674,671바이트**. 전체 디코딩, 15개 원본 장면 길이, 자막 110개 원문·타이밍 검사 통과. 1.3초 이상 무음은 없으며 최종 영상에서 추출한 15개 장면의 구도·범례·자막을 시각 확인했다. 첫 6초와 기존 Higgsfield 소스의 텍스트 제외 화면 SSIM은 0.995771이다. 완료 증거는 `verification-v2.json`, 타임라인은 `project-v2.json`에 기록한다.

완성본: `/Users/admin/Downloads/vedio/glass-substrate-episode-1-v2.mp4`. 30초 미리보기: `/Users/admin/Downloads/vedio/glass-substrate-episode-1-v2-preview-30s.mp4`.

- 기존 공장 영상(생성 ID `8a63ba30-24d3-4a05-9e58-fbfa531d6b3d`)의 첫 6초를 도입부와 제조 설명 부분에 재사용한다. 새 영상 생성·TTS API 호출은 없다. 이 재제작의 신규 Higgsfield 생성/재생성 횟수는 0회, 신규 사용 크레딧은 0이다. 과거 생성 당시 54크레딧 조회 견적과 현재 계정 잔액을 혼동하지 않는다.
- 기존 15개 Kyle 음성 파일, 정배속, 대본, 자막 정렬을 유지한다. 반복하던 8초 영상 대신 각 내레이션 길이 전체에 걸친 독립적인 동작을 렌더링한다.
- 부품 분리, 데이터 경로 증가, 기판 확장, 휘어짐과 접점 높이 차이, 재료별 열팽창, 미세 배선 등장, 보호 운반, 제조·검사, 서버 및 시스템 연결을 장면별로 구분한다. 변형과 치수는 개념 설명용이다.
- 새 3D 원본은 1920×1080 / 12fps, 납품 영상은 FFmpeg 프레임 혼합 보간으로 24fps다. 원본부터 24fps로 렌더링했다고 표현하지 않는다. 웜 그레이 배경, 구리 배선, 짙은 칩, 유리 코어의 대비를 유지한다.
- 사용자 레퍼런스: https://www.youtube.com/watch?v=UcAbZwtEfbk . 제작자의 설명·스크립트와 11:58의 Three.js 화면을 브라우저에서 확인했다. 단순 가구·카메라 조건에서는 코드 쪽이 더 좋았다는 제작자 평가(11:13), 인물·완성 에셋·동작을 추가했을 때 차이가 생겼다는 설명(12:30 이후)을 구분한다. 이를 모든 코드 3D의 품질 상한이나 모든 Higgsfield 모델의 성능으로 일반화하지 않는다. 참고 영상·소품은 다운로드하거나 재사용하지 않았다.

재현 순서:

1. `scene-v2.py --cache <v2-cache>/3d --source-cache <v1-cache>`를 기존 Blender에서 실행한다. `--preview --shot inside,warpage,glass,manufacture`로 주요 구도를 먼저 확인한다.
2. `assemble-v2.py --cache <v2-cache> --source-cache <v1-cache> --font-dir <폰트 폴더> --output <v2 MP4>`로 합성한다. 원본 미디어 길이와 해상도를 검사하며 반복 재생하지 않는다.
3. `verify-v2.py --cache <v2-cache> --source-cache <v1-cache> --video <v2 MP4>`로 전체 디코딩·자막·음성·모든 3D 장면 길이를 검사하고, 최종 프레임을 별도로 시각 검수한다.

중간 산출물: 사용자 iCloud 작업 루트의 `commerce-automation-kit/20261001-glass-substrate-v2/`. v1 소스 자산은 그대로 보존한다.
