# Blender 본문 품질 비교 — 2026-10-08

목표: 사용자가 지적한 도입부 이후의 시각적 품질 저하를 10초 차양 개폐 장면에서 개선한다. 전체 55초 영상을 덮어쓰거나 운영 제작실을 변경하지 않는다.

소유/기준: Codex, `feat/al-bahr-webtoon`, 기존 완성본 커밋 `9810e86`. 범위는 `quality-sample.py`, `quality-finish.py`, 이 문서와 QA JSON이다.

## 원인과 변경

| 기존 | 이번 비교안 |
|---|---|
| 차양 반경을 축소/확대해 펼침 표현 | 힌지를 중심으로 삼각형 반쪽 패널을 회전. 중앙 주름도 접히며 반쪽 패널의 변 길이를 유지 |
| 단면 방·상자 가구 위주 | 외벽 가까이에서 차양·연결대·유리창을 집중해서 보여줌 |
| 단색 재질, 유리는 청록색 금속에 가까움 | 얇은 천 직조 요철, 금속 연결부, 전달·반사가 있는 유리, 내부 공간과 목재 결 |
| 회청색 배경과 모형의 낮은 분리도 | 따뜻한 차양/측광과 차가운 유리, 가는 짙은 윤곽선 |
| EEVEE 16샘플, ray tracing OFF | Cycles Metal GPU, 48샘플 + denoising, 1080×1920, 24fps |
| 차양 장면 중간 카메라 위치 급변 | 10초에 걸친 연속 카메라 이동, 개폐 전/진행/완료를 유지 |

EEVEE 64샘플 + ray tracing 미리보기도 만들었으나 유리 노이즈가 남아 최종 비교안은 Cycles로 선택했다. 첫 모델의 접힌 패널 겹침을 줄이기 위해 중앙 주름을 추가했다. 단순 샘플 수 증가만을 품질 개선으로 취급하지 않았다.

## 범위와 한계

- **시각적 품질 비교용 무음 10초**다. 기존 대본/TTS/Higgsfield를 새로 생성하지 않았고 추가 유료 API 호출은 0회다.
- 기존은 단면, 개선안은 외벽 근접 구도로 카메라·모델·재질·렌더러를 함께 바꿨다. 렌더러 하나만 바꾼 통제 실험이 아니다.
- Arup의 [태양을 따라 우산처럼 개폐하는 외부 차양 설명](https://www.arup.com/projects/al-bahr-towers/)을 기준으로 자체 모델을 만들었다. 실제 제작도·실측·기구학을 복제한 것이 아니며 **설명용 재구성**이다.
- 웹툰의 가는 윤곽·따뜻한 광원/차가운 배경 대비를 적용했다. 손으로 그린 인물 웹툰과 동일한 화풍이라는 의미는 아니다.
- 외벽 미적 완성도를 높이는 실험이므로, 실내 열 감소의 인과 설명은 전체 영상 적용 전에 단면 장면과 다시 연결해야 한다.

## 실행

원본은 `/Users/admin/Downloads/vedio/al-bahr-webtoon-short.mp4`이며 SHA-256 `8c2e4c1f383856719e696d07c27057fe44364db54df2bc013221f51a5a4d6455`를 유지한다.

작업 캐시:
`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261008-al-bahr-quality`

```sh
# Blender 4.5.10 LTS. 위 캐시를 --cache로 전달한다.
blender -b --python docs/videos/20261008-al-bahr/quality-sample.py -- --cache '<cache>' --preview
blender -b --python docs/videos/20261008-al-bahr/quality-sample.py -- --cache '<cache>'
python3 docs/videos/20261008-al-bahr/quality-finish.py
```

완성 파일:
- `/Users/admin/Downloads/vedio/al-bahr-quality-improved-10s.mp4`
- `/Users/admin/Downloads/vedio/al-bahr-quality-before-after-10s.mp4`

## 검증 상태

완료: Blender 렌더와 비교본 조립 프로세스 모두 exit 0. 두 결과물 모두 10.0초·240프레임이며 전체 디코딩 오류가 없다. 개선본은 1080×1920, 비교본은 1080×1080이다. 오디오는 의도적으로 없다.

- 4개 포즈에서 반쪽 패널 변 길이 불변, Python 구문 검사 통과.
- 0.1/2/4/6/9.5초 실제 프레임 간 변화량으로 정지 출력이 아님을 확인.
- 최종 비교 영상의 1/4/8초 화면을 직접 확인: 접힘·전개 구분, 대비, 연결부와 그림자, 라벨 가독성 확인. 사람의 전체 실시간 재생 검수로 간주하지 않는다.
- 기존 55초 영상의 SHA-256 일치 확인. 추가 Higgsfield/TTS 요청 0회.
- 상세 결과: `quality-sample-qa.json`. 전체 본문 및 운영 앱에는 아직 적용하지 않았다.

다음 판단: 비교본에서 이 방향을 확인한 뒤, 전체 본문에서는 외벽 근접 장면과 실내 열 감소 단면 설명을 연결한다.
