# AI의 숨은 기반 2 — TGV

**전기가 안 통하는 유리, 칩은 어떻게 연결할까?**

사용자 요청으로 1탄의 후속 롱폼과 그 영상·음성을 재사용하는 세로 숏폼을 제작한다. 대본은 `brief.json`, 사실 확인은 `sources.md`, 3D 원본은 `scene.py`, 롱폼 편집은 `assemble.py`, 숏폼 편집은 `shorts.py`이다.

## 구성과 제작 원칙

- 16개 장면: 절연과 금속 연결의 역할 → 표면 배선/층간 연결의 비유 → TGV 단면 → 구멍 품질 → LIDE 가공 예 → 표면 처리·씨앗층 → 구리 도금 → 내부 빈틈 → 열팽창·신뢰성 → 검사 → 기술 제공 기업 → 일상과의 관계 → TSV 구분 → 정리 → HBM 예고.
- LPKF·MKS Atotech·SCHOTT는 가공·도금·소재 기술 제공 사례로만 소개한다. 기업 우열, 특정 AI칩 채택, 실측하지 않은 성능·비용 개선은 주장하지 않는다.
- 치수·변형·전류의 빛 점은 단순화한 개념 모형이다. 금속화는 한 가지 공정 예이며 모든 TGV의 유일한 방식이라고 표현하지 않는다. 레이저 변성 후 선택적 제거와 금속층 성장의 동작을 각각 보여 준다.
- 기존 1탄 Higgsfield `broll-factory.mp4` 첫 6초를 롱폼 도입에 재사용하고 화면에 AI 재현임을 표기한다. 해당 영상은 특정 실제 공장·TGV 장비 촬영이 아니다. 이번 신규 Higgsfield 생성 요청은 0회다.
- 신규 Kyle `RU7aSi6lT4uQBXMLgDxK` 정배속 음성 16개는 기존 Cloudflare 자격을 사용하는 공식 TTS 워크플로 `36843465496`에서 생성했다. 실제 workflow 상태 success 확인. 새 음성 제작 비용이 발생할 수 있으며 Higgsfield 신규 비용 0과 혼동하지 않는다. 숏폼은 이 음성을 문장 단위로 재편집하므로 별도 TTS 호출이 없다.
- 3D 소스는 1920×1080 / 12fps. 24fps 전달본은 FFmpeg 프레임 혼합 보간이다. 본문 전체 길이에 걸친 동작이며 8초 루프를 반복하지 않는다.
- Pretendard SemiBold 자막. 롱폼 52px, 숏폼 60px. 승인 대본 원문에 기존 Whisper base를 정렬하며 임의 전사로 대본을 교체하지 않는다.

## 저장 위치

- 작업 산출물: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261001-tgv/`.
- 숏폼 산출물: 같은 상위 경로의 `20261001-tgv-short/`.
- 롱폼 최종 목적지: `/Users/admin/Downloads/vedio/tgv-episode-2-long.mp4`.
- 숏폼 최종 목적지: `/Users/admin/Downloads/vedio/tgv-episode-2-short.mp4`.
- **제작 및 검증 완료**: 롱폼 6분 12.417초(1920×1080), 숏폼 1분 38.333초(1080×1920). 둘 다 24fps·Kyle 1.0배속. 실제 길이·해시·검증 결과는 `verification.json`, `shorts-verification.json`에 기록했다.
- 롱폼 자막 113개, 숏폼 자막 45개. 두 파일 모두 전체 디코딩과 영상·음성 스트림 길이 일치 검사 통과. 롱폼은 1.3초 이상, 숏폼은 1초 이상 무음이 없다. 최종 MP4에서 각각 16개·14개 구간 프레임을 추출해 자막·잘림·끝 장면을 확인했다.
- 20초 도입부 미리보기: `/Users/admin/Downloads/vedio/tgv-episode-2-preview-20s.mp4`.

## 재현

1. `produce.mjs tts`: 새 음성 생성이 필요한 경우에만 실행한다. 외부 요청이므로 이미 생성된 실행/아티팩트를 먼저 확인하고 중복 호출하지 않는다. 영상 생성 모드는 이 제작법에서 지원하지 않는다.
2. `align.py --cache <cache> --model-dir <existing model cache>`: 16개 음성의 Voice ID·원문을 검사하고 자막 타이밍을 저장한다.
3. Blender `-b -t 2 --python-exit-code 1 --python scene.py -- --cache <cache>/3d --preview`: 모든 장면 구도를 먼저 확인한다. `--preview`를 빼면 전체 렌더. `--shot`으로 서로 다른 장면 집합을 분리할 수 있다. 렌더 로그의 COMPLETE와 종료 코드를 함께 확인한다.
4. `assemble.py --cache <cache> --source-cache <cache> --intro <existing Higgsfield clip> --font-dir <fonts> --output <long MP4>`: `--only <index>`는 완료된 장면 한 개를 먼저 편집한다. 전체 실행은 각 클립의 타임스탬프를 초기화하고 실제 길이를 맞춘 후 합성한다. 영상/음성 각각의 길이, 전체 디코딩, 자막 타이밍·길이, 긴 무음을 검사한다.
5. `shorts.py --source-cache <cache> --long-cache <cache> --cache <short-cache> --intro <existing Higgsfield clip> --font-dir <fonts> --output <short MP4>`: 롱폼 시각 마스터와 동일 음성만 재사용한다. 별도 영상·음성 API 호출이나 신규 Blender 렌더는 없다.

최종본에서 장면별 프레임을 다시 추출해 구도·자막·마지막 장면을 검수한다. 편집 규칙 변경 시 `--force`로 해당 클립을 갱신한다. Git에는 제작 소스·타임라인·검증 기록만 보관하며 비밀정보와 영상 캐시는 저장하지 않는다. 영상 제작은 YouTube 업로드나 운영 제작실 배포를 뜻하지 않는다.
