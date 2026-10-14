# Shopshorts 무료 로컬 시네마 — 2026-10-14

## 작업 카드
- 목적: Higgsfield의 카메라 연출 중심 제작 흐름을 참고해 Shopshorts에 API 사용료 없는 로컬 생성 선택 기능을 통합.
- 담당/범위: 현재 Codex 단독, `feat/shopshorts-local-cinema`; base `1d9c69e`. worker/Claude OFF.
- 완료 기준: 명시적 모드 선택, 연출 설정, ComfyUI 접수·재개·장면 저장, 유료 자동 대체 없음, 기존 검수 유지, 관련 시험·커밋·push.
- 현재: 연결 코드와 UI 구현. 모델 설치·실제 추론·화질 평가·운영 배포는 미완료.
- 다음: 저장 공간 확보 후 로컬 모델과 실제 API workflow를 연결하여 짧은 영상부터 검증. PR 머지는 별도 승인.

## 분석 근거와 범위
[Higgsfield 카메라 가이드](https://higgsfield.ai/blog/ai-video-camera-control)와 [Cinema 소개](https://higgsfield.ai/cinematic-video-generator)는 카메라·렌즈·조명·연출 설정을 제공한다. 이를 Shopshorts의 장면 프롬프트, 연출 프리셋, 시드 재사용 기능으로 구현했다. 카메라 설정은 생성 모델에 전달하는 지시이고, 정확한 물리 카메라 제어를 보장하지 않는다.

Chrome에서 한국어 Cinema 공개 페이지의 로그인/가입, 연출 설명, 참조·카메라 이동 안내를 직접 관찰했다. 로그인 후 생성 화면과 실제 생성 요청은 관찰하지 않았다. 서버 모델·학습 데이터·비공개 API를 복원한 것이 아니다. 공개 페이지의 영상 미리보기 일부도 로딩되지 않았다. REA 스킬을 적용했지만 이 세션에 REA MCP 분석 도구가 연결되지 않아 REA evidence ID는 없다. CLI doctor는 설치 정합성을 확인했을 뿐 대상 분석 증거가 아니다. 제품 기능·공개 자료 분석과 자체 구현을 구분한다.

[ComfyUI 서버 라우트](https://docs.comfy.org/development/comfyui-server/comms_routes)의 `/object_info`, `/prompt`, `/history/{id}`, `/view`를 사용한다. 프레임 길이 규칙은 [공식 LTX 노드](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_lt.py), 출력은 [공식 영상 노드](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy_extras/nodes_video.py)를 참고했다. 업스트림 버전 차이는 실제 `/object_info` 조회와 ComfyUI 제출 검증에서 확인한다.

## 구현과 제한
- 일반·시네마틱 프로젝트의 미디어 단계에서 무료 로컬 모드 선택. 기존 웹툰·하이브리드·애니메이션 제작 설정은 변경하지 않는다.
- 카메라 6종, 조명 4종, 렌즈 3종, 시드. 설정 변경 시 AI 장면·편집·승인 무효화; 소유 미디어 보존.
- 로컬 모드 선택은 무음 제작 선택도 포함한다. 유료 음성·메타데이터 생성은 서버/워커에서 거부. 직접 제작한 음원은 편집에서 추가 가능. 대본 작성 계정과 게시 서비스 이용료까지 무료라는 뜻은 아니다.
- 이미지 PNG / 영상 MP4 출력(50MB 상한), 세로·가로 프로필, 모델별 설정 길이 상한. 결과 메타데이터의 requestedWidth/Height/Fps는 요청값이며 실제 화질 인증이 아니다. 최종 렌더의 1080p 확대는 생성 원본의 디테일 증가와 다르다.
- 루프백 HTTP만 연결하며 리다이렉트와 API·커스텀 노드를 거부한다. 신뢰하는 로컬 ComfyUI를 전제로 한다. 이 어댑터가 OS 네트워크 방화벽을 제공하지는 않는다.
- 접수 전 의도 기록, 접수 ID 디스크·프로젝트 저장, 재시도 시 기존 ID 확인. 접수 응답 분실은 자동 재접수하지 않는다. ComfyUI queue/history를 확인한 후 작업 기록을 복구해야 한다. 파일을 무조건 지워 재요청하지 않는다.
- 같은 시드는 재현을 돕지만 모델·환경 차이까지 동일 출력을 보장하지 않는다. 참조 이미지 입력, 캐릭터 학습, 업스케일 모델, 오디오 생성, 자체 기반모델 학습은 이번 구현에 없다.

## 연결 방법
1. 충분한 공간의 로컬 작업 경로에 ComfyUI와 사용권을 확인한 공개 모델을 준비한다. 먼저 ComfyUI에서 이미지/영상 생성이 실제 성공하는지 확인한다. 모델을 자동 다운로드하거나 라이선스 동의하지 않았다.
2. 성공한 **API 형식** 워크플로(JSON의 노드 ID → class_type/inputs)를 내보낸다. UI 노드/링크 배열 형식은 지원하지 않는다. 텍스트 입력을 `"{{prompt}}"`, seed를 `"{{seed}}"`, width/height를 `"{{width}}"`/`"{{height}}"`로 교체한다. 영상은 length와 fps를 `"{{frames}}"`, `"{{fps}}"`로 교체한다. 문자열 전체가 플레이스홀더여야 하며 숫자로 바인딩된다.
3. 다음 외피로 감싼다. 아래 prompt는 자리 표시이므로 실제 검증한 그래프로 교체해야 한다. 영상은 `SaveVideo`를 MP4로, 이미지는 `SaveImage`를 출력 노드로 지정한다. 영상 프레임 바인딩은 LTX의 8n+1 규칙이므로 다른 프레임 규칙의 모델은 별도 어댑터가 필요하다.

```json
{
  "version": 1,
  "modelLabel": "설치하고 검증한 모델 이름",
  "profile": {"width": 768, "height": 512, "fps": 24, "maxDuration": 4},
  "outputNode": "출력 노드 ID",
  "prompt": {"실제 API 그래프로 교체": {}}
}
```

해상도는 32 배수, 64~1920 범위. 모델이 지원하는 실제 크기와 길이로 설정한다. 프로필 값은 사용자 설정이며 성능 실측 인증이 아니다. 기본 로컬 노드 허용 목록은 `studio-comfy.mjs`의 NODES가 정본이며 목록 밖 워크플로는 실행되지 않는다. 기존 LTX 영상 노드 경로 중심이며 모든 최신 LTX 모델/워크플로를 지원한다고 보장하지 않는다.

4. **제작 워커 프로세스**에 다음 환경변수를 지정한다. 브라우저나 Pages에서 로컬 모델을 실행하는 것이 아니다. 워커와 ComfyUI가 같은 컴퓨터에서 실행되어야 한다.

```sh
export SHOPSHORTS_COMFY_URL='http://127.0.0.1:8188'
export SHOPSHORTS_COMFY_IMAGE_WORKFLOW='/absolute/path/image-api-template.json'
export SHOPSHORTS_COMFY_VIDEO_WORKFLOW='/absolute/path/video-api-template.json'
```

5. Shopshorts 일반·시네마틱 프로젝트 → 미디어 → 무료 로컬 시네마 → 연출 적용 → 대본 검수 → 미생성 장면 만들기. 설치/연결 오류는 유료 API로 대체하지 않는다. 실제 모델 검증 후 원하는 해상도와 최대 길이를 조정한다.

## 현재 장비와 실행 경계
확인 당시 M4 Pro, RAM 48GiB, 디스크 여유 약 9.7GiB. [LTX Desktop 공식 안내](https://github.com/Lightricks/LTX-Desktop)는 Apple Silicon 로컬 실행과 RAM 32GiB 이상, LTX 2.5 Fast 코어 묶음 약 72GB 공간을 안내한다. 이것은 별도 Desktop 제품의 요구량이며 현재 ComfyUI 경로와 호환된다는 인증이 아니다. 이 대형 모델을 설치하지 않았다. 모델별 품질·속도·메모리를 아직 측정하지 않았고 Higgsfield 동급 화질을 보장하지 않는다. 전력·저장장치·장비 비용은 남는다.

## 검증
신규 테스트는 로컬 API 응답 대역으로 연출 바인딩, 유료 노드 거부, 프로젝트 상태 무효화, 무음 강제, 디스크 접수 복구, 응답 분실 중복 차단, 제한 시간 이후 재개, 출력 경로 검사를 수행한다. 실제 AI 영상 생성 성공과 구분한다. 검증 결과: 관련 7개 테스트 파일 49/49 통과, skip 0. 기존 FFmpeg 실제 렌더와 로그인 보호 로컬 서버 정적 경로 시험 포함. 신규 기능 12개는 API 대역 시험이며 AI 추론/브라우저 클릭 E2E는 미검증. `node --check` 및 `git diff --check` 통과.

첫 검증에서 기존 runCli 주입 계약과 lint 주입이 충돌해 별도 runLintCli로 분리했다. 새 worktree의 누락된 의존성은 격리된 검증 폴더에 설치했다. npm 공유 캐시 손상은 전역 캐시 삭제 없이 작업 전용 캐시로 해결했다. 최종 시험 로그: 사용자 지정 iCloud 작업 루트의 `shopshorts/local-cinema-20261014/tests-final.log`. 테스트 대역에는 계정·개인 자료를 사용하지 않았다.
