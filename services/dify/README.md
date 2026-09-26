# Dify + shared LiteLLM

공식 Dify를 포크하고 원본 변경 없이 배포 overlay와 앱 DSL을 관리한다.

- 포크: https://github.com/socar-hyunz/dify
- 소스: Dify **1.17.1**, 정확한 commit과 공식 모델 플러그인은 `upstream.json`에 고정.
- 배포 저장소: 이 디렉터리. Dify 원본 포크에 커스텀 코드를 밀어 넣지 않는다.
- 내부 운영자용 **워크스페이스 하나**, hanmadi chatflow + replay workflow 두 앱.
- UI: `http://localhost:4180`. LiteLLM은 별도 Compose/DB/수명 주기로 운영한다.
- 클라우드 배포, 실제 모델 키, 실제 사용자 데이터 연결은 아직 없다.

## 실행

Linux Docker Engine + Compose **2.24.4 이상**, Git, Python 3.10 이상이 필요하다.
공식 Dify 최소치는 2 CPU/4 GiB RAM이며 이 구성에는 LiteLLM도 추가되므로
처음에는 4 CPU/8 GiB 이상의 서버를 후보로 잡고 부하 측정 후 조정한다(용량 보장 아님).
앱 두 개를 위한 chat/workflow 서비스만 시작하며 Agent sandbox 기능은 범위 밖이다.

1. [게이트웨이 안내](../ai-gateway/README.md)에 따라 모델을 설정하고 LiteLLM을 먼저 시작한다.
   실제 API 공급자 키 또는 자체 모델 서버가 필요하다. LiteLLM/Dify 자체는 모델이 아니다.
2. 게이트웨이에서 hanmadi/replay 가상 키를 각각 발급한다. 마스터 키를 Dify에 입력하지 않는다.
3. 저장소 루트에서 실행한다.

```sh
python3 services/dify/dify.py prepare
python3 services/dify/dify.py compose config --quiet
python3 services/dify/dify.py compose up -d nginx api_websocket worker worker_beat sandbox ssrf_proxy weaviate
```

`prepare`는 포크의 고정 릴리스를 가져오고 commit을 검증한다.
이미 소스가 있으면 고정 commit 및 tracked 파일의 무변경 상태를 검사한다.
`.upstream/dify/docker/.env`를 권한 600으로 만들며 기존 비밀을 덮어쓰지 않는다.
DB/Redis/플러그인/암호화/샌드박스/벡터 DB의 기본 비밀을 무작위 값으로 교체한다.
공식 Compose의 서비스 이미지 태그는 그대로 사용한다. 모든 하위 이미지 digest까지 고정한 구성은 아니다.

`http://localhost:4180/install`에서 최초 설정을 한다.
초기화 암호는 위 비공개 `.env`의 `INIT_PASSWORD`를 로컬 편집기로 확인한다.
운영자 이메일과 별도 로그인 비밀번호를 지정하고 워크스페이스를 하나만 사용한다.
원격 서버에서는 `ssh -L 4180:127.0.0.1:4180 <server>`로 접속할 수 있다.
공개 도메인·TLS·외부 접근 설정은 호스팅 선정 후 별도로 한다.

## 모델 및 앱 설정

Dify 설정 → 모델 공급자에서 공식 **OpenAI-API-compatible** 플러그인을 설치한다.
고정 버전은 `0.0.68`이며 `upstream.json`의 package identifier와 일치하는지 확인한다.
서명 검증은 켠 채로 유지하고 자동 플러그인 업그레이드는 끈다.

두 개의 사용자 정의 LLM/chat 모델을 등록한다.

| 필드 | hanmadi | replay |
|---|---|---|
| Model Name | `hanmadi-chat` | `replay-video-planner` |
| API Base URL | `http://gateway:4000/v1` | `http://gateway:4000/v1` |
| API Key | `.runtime/hanmadi.env`의 전용 LiteLLM 키 | `.runtime/replay.env`의 전용 LiteLLM 키 |
| Stream mode auth | Use | Use |

키 파일의 위치는 `services/ai-gateway/.runtime/`다.
Context size와 max tokens는 **선택한 실제 모델의 한도**에 맞춘다.
검증용 mock 설정은 context 4096/max output 2048이며 실제 공급자 권장값이라는 뜻은 아니다.
`gateway`는 Compose DNS이므로 브라우저나 다른 머신에서 쓰는 주소가 아니다.
이름이 고정된 `shared-ai-gateway_default` 네트워크에 플러그인 컨테이너만 추가 연결한다.
두 스택을 다른 머신에 배치하면 이 네트워크 대신 게이트웨이의 인증된 HTTPS 주소를 사용해야 한다.

앱 → DSL 가져오기로 다음 파일을 각각 가져온 뒤 모델 연결을 확인하고 게시한다.

- `apps/hanmadi-tutor.yml`: 한국어/태국어/일본어, 한국어 설명, 수준/상황 입력, 최근 10턴 대화 문맥.
- `apps/replay-planner.yml`: 브리프/시청자/길이/채널 입력 → 컨셉·장면표·자산·확인 항목.

각 앱의 API Access에서 **별도의 Dify 앱 API 키**를 발급한다.
서비스 서버 → Dify `/v1/chat-messages`(hanmadi), `/v1/workflows/run`(replay)
→ 앱별 LiteLLM 키 → 모델로 호출한다. Dify 키를 브라우저에 넣지 않는다.
인증된 사용자로부터 서버가 불투명한 `user` 값을 정하고, 다른 사용자의 conversation ID 사용을 막는다.
한 워크스페이스의 관리자/앱 편집자는 모델과 기록을 볼 수 있으므로 제품 간 강한 관리자 격리로 해석하지 않는다.

## 데이터·음성·개선 범위

Dify는 대화/워크플로 실행 기록을 DB에 저장한다. 현재 hanmadi의 비저장 정책과 다르므로
실서비스를 이 경로로 바꾸기 전에 보관·삭제·학습 사용 동의 정책을 확정해야 한다.
이번 구현은 기존 hanmadi/replay의 운영 호출을 변경하지 않는다.
음성 입출력은 기존 hanmadi의 STT/TTS → LiteLLM 경로를 유지하고,
텍스트 회화만 Dify로 바꾸는 어댑터는 후속 작업이다. DSL의 음성 기능은 꺼져 있다.

모델은 사용만으로 자동 재학습되지 않는다. 현재 템플릿에는 RAG/장기 기억/자동 평가·튜닝을 넣지 않았다.
검수 교재와 승인 대본을 **서로 다른 지식 베이스**에 넣고 해당 앱에만 retrieval 노드를 추가하는 것이 다음 단계다.
임베딩 모델은 별도 준비해야 한다. 학습자별 장기 기억과 피드백 개선에는 별도 권한·데이터·평가 설계가 필요하다.

## 검증

2026-09-26 [실제 컨테이너 CI 통과](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36248731036).
두 앱의 공개 API → Dify → LiteLLM → 모의 공급자 응답, 대화 이어가기와 사용자 간 conversation ID 거부를 확인했다.
검증 서버는 정리됐으며 상시 접속 가능한 운영 서버를 만든 것은 아니다.

```sh
python3 -m pip install PyYAML==6.0.3
python3 -m unittest discover -s services/dify -v
```

CI `.github/workflows/dify.yml`은 격리된 Dify/LiteLLM/Postgres와 모의 공급자를 시작하여
서명된 플러그인 설치 → 모델별 자격 등록 → 두 DSL 가져오기/게시 → 공개 앱 API 호출을 검사한다.
hanmadi는 대화 이어가기와 다른 사용자 conversation ID 거부도 확인한다.
`tests/integration.py`의 내부 console API 사용은 **고정 버전의 일회성 CI 초기화 전용**이다.
실서버에서 실행하지 않는다. 실제 모델 응답 품질/음성/부하/복구 검증은 별도다.

## 운영 및 업그레이드

`.upstream/dify/docker/volumes/`에 DB·업로드·플러그인·벡터 자료가 저장된다.
이 디렉터리는 임시 캐시가 아니므로 서버에서는 영구 디스크의 고정 경로에 저장소를 배치한다.
`.env` 암호화 키와 DB 덤프, 업로드/플러그인/벡터 데이터는 함께 백업하고 복원을 검증한다.
`prepare` 재실행은 업그레이드·백업·복구 명령이 아니다. `down -v`는 운영에서 사용하지 않는다.

업그레이드는 새 릴리스/라이선스·변경 사항 확인 → fork 동기화 → lock/overlay 갱신 →
백업 → 별도 테스트 환경에서 DB 마이그레이션·DSL/API 검증 → 계획된 배포 순서다.
DB 마이그레이션 후 이미지만 낮추는 복구는 보장하지 않는다.

Dify는 추가 조건이 있는 Apache 기반 라이선스다. 이 구성은 내부 워크스페이스 하나이며
원본 로고·저작권 표시를 유지한다. 고객별 워크스페이스를 제공하는 플랫폼으로 확장할 경우
다중 tenant 조건과 별도 허가 필요 여부를 먼저 확인한다.

근거: [고정 버전 라이선스](https://github.com/langgenius/dify/blob/1.17.1/LICENSE),
[공식 Compose 안내](https://docs.dify.ai/en/self-host/deploy/quick-start/docker-compose),
[공식 모델 플러그인](https://marketplace.dify.ai/plugin/langgenius/openai_api_compatible).
