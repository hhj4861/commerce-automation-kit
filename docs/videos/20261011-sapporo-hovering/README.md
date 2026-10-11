# 삿포로 돔 — 8,300톤짜리 축구장을 공기로 움직인다고?

완성 파일: `/Users/admin/Downloads/vedio/sapporo-hovering-architecture-short.mp4`

40.0417초 · 1080×1920 · 24fps · Kyle1.1배속 · AAC-LC 스테레오. 승인된 Pretendard 흰색/민트 헤더와 차콜 자막을 적용했다. 본문은12개 의미 단위 자막이며 마지막 대사 뒤1.5317초 여유를 유지한다. 음성/자막/영상 검증 및 실제 완성본15시점의 화면 검수를 통과했다. 상세 증거는 `verification.json`이다. 유튜브 업로드나 Shopshorts 운영 변경은 이번 범위에 포함하지 않는다.

## 작업 카드

- 목표: 잔디를 이동하는 이유와 공기가 하중을 나누어 받는 원리를 하나의 완결된 쇼츠로 설명.
- 범위/소유자: 이 디렉터리, 호출한 Codex 세션 단독. 다른 세션 변경 없음.
- 기준: `98eda397f2414caf7541caabe844efbf41eb5803`, `feat/architecture-render-kit`.
- 완료 기준: 1차 출처, 정확한 대본 별도 심사, Higgsfield 도입, Kyle1.1, 원리 동작, 최신 자막, 전체 디코드/음성/자막/결말 검증.
- 결과: 완성 영상 검증 통과. 소스와 검증 기록을 작업 브랜치에 커밋·upstream push하는 단계.

## 제작 및 검증

- 대본은2회 보완 후 정확한 입력 digest 기준 심사를 통과했다. 질량 감소와 하중 분담을 구별하고 불필요한 숫자 나열을 줄였다.
- 오리지널 이미지 기반 Higgsfield6초 도입1회,54크레딧. TTS6구간은 한 번씩 생성했다. 재조립·바퀴 접지 수정·자막 개선은 추가 유료 호출 없이 진행했다.
- 본문은 Blender Cycles48samples/MetalGPU/100% 해상도. 기본5장면 렌더3553.34초. 공기 장면만 별도 접지 수정본을 사용한다.
- `air-contact.py`는 불변 `scene.py`를 검증해 바퀴/허브/요크를 지면에 유지하고 상부 받침대만 올린다. `check-contact.py`는 실제 Blender geometry의4개 바퀴 접지와 받침대 상승을4시점에서 확인한다.
- 최종 파일961프레임 전체 디코드 통과. 모든 장면의 비무음 확인, 원본 음성과 상관0.99946, peak -1.21dB.12개 자막의 실제 프레임 위치 확인 통과. 검토된 대본 모두 보존.
- 기계 배치와 공기 표현은 원리 개념도다. 제조 도면이 아니며 Higgsfield 도입과 본문3D의 화풍 차이는 남아 있다.

## 근거

- [삿포로 돔 공식 설명](https://www.sapporo-dome.co.jp/dome/hovering/): 약8,300톤,120×85m,7.5cm 상승,34바퀴.
- [Kawasaki 제작사 발표](https://global.kawasaki.com/en/corp/newsroom/news/detail/ba010801.html): 공기가 전체 하중의 약90%를 지지한다. 질량 자체가 감소하는 것이 아니다.

## 재현

중간 작업 루트는 iCloud `gpt 작업/commerce-automation-kit/20261011-sapporo-hovering`이다. 완성본만 Downloads/vedio에 저장한다. 의존성: Blender4.5.10,ffmpeg,Pillow,numpy,Whisper,기존 Shopshorts 공식 제공자 어댑터. `VIDEO_CACHE`는 작업 루트, `CAK_ENGINE_ROOT`는 검증된 Shopshorts 런타임을 지정한다.

1. `produce.mjs review/preflight/tts/generate/poll`: 정확한 대본 검토, 과금 확인, 음성 및 도입. 기존 receipt를 보존하고 모호한 유료 요청은 자동 재시도하지 않는다.
2. `render.py align/plan`: 원문 정렬,1.1배속,완결된 문장 자막과 여유 시간.
3. Blender background에서 `scene.py -- --out CACHE/clips --timeline CACHE/timeline.json --percent 100 --samples 48`.
4. 동일 옵션과 `--shot air --out CACHE/clips-air`로 `air-contact.py`; `check-contact.py`는 `--out CACHE/qa --timeline CACHE/timeline.json`으로 접지를 확인한다.
5. `finish.py build/prepare/assemble/verify --cache CACHE`: 그래픽 트랙, provenance 확인, 수정 air클립 선택,6초 도입 합성,명시적 음성 매핑,검증. 각 모드는 별도 실행한다.
6. 실제 최종 화면을 검수하고 `verification.json`에 기록한다. 원본 파일과 결말을 보존하며 결과 파일을 덮어쓰기 전에 요청 범위를 확인한다.
