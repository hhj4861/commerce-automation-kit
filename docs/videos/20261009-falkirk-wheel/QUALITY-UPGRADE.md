# 건축 영상 공통 스타일과 Falkirk 비교 샘플

- 목표: 엘프필하모니 v3에서 선호한 재질·조명·그림 중심 구성을 재사용하고, Falkirk의 물 밀어내기 구간을 동일 음성으로 비교한다.
- 담당/범위: 호출한 Codex 단독. 공통 Blender 스타일, 기존 제작실 렌더러 연결, 15.208초 샘플. 운영 배포·전체 영상 교체·신규 유료 생성 없음.
- 기준: `91c8545`, 작업 브랜치 `feat/architecture-render-kit`. 이전 전편은 보존한다.

## 실제 변경

`apps/shopshorts/renderers/architecture_style.py`와 JSON에 재질, 표면 질감, 모서리, 따뜻한 주광·차가운 보조광, 카메라 조준 함수를 모았다. 제작실의 기존 `architecture.py`와 이번 `quality-sample.py`가 같은 모듈을 사용한다. 런타임은 기존 Cycles 48 samples를 유지한다. 샘플은 엘프필 방식의 EEVEE 64 samples를 사용하며, 샘플/런타임의 스타일 지문이 일치한다.

샘플에는 선체·창틀·곡면 지붕·환기구·석재 이음·볼트·난간을 추가하고, 부력 → 배 진입 → 물 배출의 세 구도를 적용했다. 수위를 고정하고 동일한 배를 따라간다. 양쪽 비교에 같은 음원·자막·시간을 사용했다. 기존 Kyle 1.1배 음성을 재사용했다.

공통 스타일은 소재별 상세 형상을 자동으로 만들지는 않는다. 운영 렌더러의 범용 레이어와 샘플의 상세 배 모델은 다르다. 이번 변경을 모든 주제의 완성도 개선이나 실사 재현 완료로 보고하지 않는다.

## 검증과 수정 기록

- Blender 실제 노드·재질·조명·카메라 검사 통과.
- 제작실 회귀 검사 6개 통과, skip 0. 실제 Cycles 1080×1920, 24fps, 1초 렌더와 전체 디코딩 포함.
- 초기 E2E에서 스타일 지문 변수 선언 누락 발견 → 선언을 보완하고 E2E 재실행 통과.
- 초기 미리보기의 배 잘림과 화살표 가림 수정 후 전체 샘플 렌더.
- 개선/기존/좌우 비교 365프레임, 15.208초. 전체 디코딩, 자막 대사 누락 없음, A/V 차이 0.1초 미만. 세 파일의 디코딩된 음원 해시 일치.
- 최종 2초·8.5초·13초 대표 프레임을 확인했다. 전체 재생 청음이나 사용자의 선호 확인을 대신하지 않는다.
- Blender 내장 Python의 bytecode 캐시 생성은 진입점에서 명시적으로 막는다.
- 상세 근거: `quality-verification.json`. 스타일 지문은 렌더 당시 JSON+Python 모듈을 해시한다.

## 산출물

- 개선 샘플: `/Users/admin/Downloads/vedio/falkirk-quality-sample-v2.mp4`
- 좌 기존 / 우 개선 비교: `/Users/admin/Downloads/vedio/falkirk-quality-comparison-v2.mp4`
- 렌더/로그/검사: iCloud `gpt 작업/commerce-automation-kit/20261009-falkirk-quality/`.
- 유료 API 호출 0. 전편 `falkirk-wheel-webtoon-short.mp4`는 그대로 유지.

## 재현 및 이후 적용

Blender에서 `quality-sample.py --cache <작업 캐시> --preview`로 세 구도를 먼저 확인한다. 보완 후 같은 명령에서 `--preview`를 빼 전체 샘플을 렌더한다. Python `compare.py --cache <작업 캐시> --source-cache <기존 Falkirk 캐시> --output-dir <최종 폴더>`로 동일 음원 비교 및 검증을 수행한다. 원래 음원·자막·폰트가 포함된 기존 캐시가 필요하다.

새 건축 소재는 공통 스타일을 재사용하되 대상 형상과 설명 동작을 따로 설계한다. 전체 제작 전 설명 구간을 짧게 렌더하고 기준 영상과 비교한다. 스타일 변경 시 지문을 확인해 다른 버전의 검증을 재사용하지 않는다. 현재는 작업 브랜치 구현·샘플이며 운영은 미반영이다. 다음 판단은 사용자 비교 확인 후 전편 확대 여부다.
