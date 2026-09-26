# Shared AI gateway

앱과 독립적으로 배포하는 LiteLLM + PostgreSQL 서버. `hanmadi` / `replay`는 각각 팀·가상 키·모델 허용목록·30일 예산을 가진다. 이 디렉터리만 별도 저장소나 서버로 옮길 수 있으며 npm 모노레포 또는 앱 코드를 import하지 않는다. 학습·기억·RAG 서버는 아직 포함하지 않는다. 설계·기존 솔루션 조사: [SHARED-AI-PLATFORM](../../docs/SHARED-AI-PLATFORM.md).

## 시작

요구사항: Docker Engine + Compose v2, Python 3.10 이상. 로컬 4100 포트를 사용해 기존 hanmadi 로컬 게이트웨이 4000과 충돌하지 않는다.

```sh
cd services/ai-gateway
python3 gateway.py init
# .env에 실제 공급자 model 경로/API 키 또는 Ollama 주소 입력
python3 gateway.py render
docker compose config --quiet
docker compose up -d --wait --wait-timeout 300
```

`init`은 `.env`가 이미 있으면 중단한다. `LITELLM_SALT_KEY`는 DB의 암호화 데이터와 함께 보존하며 임의 재생성하지 않는다. `.env`·`.runtime`은 Git 제외/비공개 파일이다. 실제 키를 CLI 인자, 채팅, 커밋에 넣지 않는다. `.env`는 `KEY=value` 또는 따옴표로 감싼 값 형식이며 셸 명령·변수 확장을 실행하지 않는다. Docker Compose가 `$`를 확장할 수 있으므로 해당 문자가 포함된 비밀은 Compose의 literal quoting 규칙에 따라 작은따옴표로 감싼다.

모델 설정:

| 용도 | `.env` 설정 | 앱이 호출하는 별칭 |
|---|---|---|
| hanmadi 대화 | `HANMADI_CHAT_MODEL`, `HANMADI_CHAT_API_KEY`, 선택 `HANMADI_CHAT_API_BASE` | `hanmadi-chat` |
| replay 기획·대본 | `REPLAY_CHAT_MODEL`, `REPLAY_CHAT_API_KEY`, 선택 `REPLAY_CHAT_API_BASE` | `replay-video-planner` |
| hanmadi 음성 | `ELEVENLABS_API_KEY` | `hanmadi-stt` / `hanmadi-tts` |

모델 경로는 공급자의 실제 지원 모델을 선택한다. `openai/<model-id>`, `gemini/<model-id>`, `ollama_chat/<installed-model>` 등이 가능하다. Ollama는 외부 API 키 없이 별도 서버의 `*_CHAT_API_BASE`가 필요하다. 컨테이너의 `localhost`는 호스트 Mac 또는 다른 컨테이너가 아니다. 클라우드에서는 모델 서버의 내부 DNS를 사용한다. 외부 공급자 주소에 자격증명을 포함하지 않는다. 키·모델이 없으면 해당 모델은 등록하지 않으며 누락된 키를 가짜 값으로 채우지 않는다. 같은 기반 모델을 두 별칭에 연결해도 지식이나 가중치가 서비스별로 학습되는 것은 아니다.

음성 모델은 `elevenlabs/eleven_v3`와 `elevenlabs/scribe_v1`이다. 이 조합은 별도 hanmadi 개발 게이트웨이에서 실호출한 조합이며, 이 Docker 이미지/DB 구성에서 음성 실호출을 재검증한 것은 아니다.

## 앱별 키 발급

공급자 모델을 등록하고 서버가 healthy가 된 후 실행한다. 아래 5달러는 실행 예시일 뿐 사용자 예산 결정이나 보장된 청구 상한이 아니다.

```sh
python3 gateway.py provision --app hanmadi --budget-usd 5
python3 gateway.py provision --app replay --budget-usd 5
```

각 앱의 `.runtime/<app>.env`에 가상 키가 저장된다. 출력에는 키가 나오지 않는다. 이 파일의 `LITELLM_BASE_URL`을 실제 HTTPS 게이트웨이 주소로 바꿔 **각 앱 서버의 비공개 환경변수**로 주입한다. 파일 전체를 Git에 추가하거나 앱 브라우저로 보내지 않는다. 마스터 키는 앱에 제공하지 않는다. hanmadi 연결 코드는 PR #31에 있으며 아직 main에 병합되지 않았다. replay 앱의 실제 호출 어댑터는 이번 범위에 포함하지 않는다.

동일 정책으로 재실행하면 기존 키를 확인하고 보존한다. 기존 팀/키 정책이 다르면 자동 변경하지 않고 차이를 검토하도록 중단한다. 키 발급 도중 통신 오류가 나면 중복 발급 방지를 위해 pending 파일을 남긴다. 관리자 화면에서 해당 앱의 발급 결과를 확인하고 불명확한 키를 폐기한 뒤에만 pending 파일을 제거하고 재시도한다. 앱 키의 회수·정책 변경은 별도 운영 작업이다.

실제 비용 집계에는 모델 가격 매핑과 비동기 집계·동시 요청의 영향이 있다. 공급자 예산도 함께 설정하고, 비용 미등록 모델의 비용 0을 무료로 해석하지 않는다. 앱 내부의 사용자 인증·사용자별 요청 제한은 계속 필요하다.

## 클라우드로 옮기기

1. 이 디렉터리를 Docker 서버에 배치하고 비밀은 별도 주입한다. DB와 salt를 함께 암호화 백업하고 복구를 검증한다.
2. DNS를 해당 서버로 연결하고 `.env`의 `GATEWAY_DOMAIN`을 실제 도메인으로 설정한다. 방화벽은 공개 80/443만 허용한다.
3. `docker compose --profile public up -d --wait`로 HTTPS 프록시를 시작한다. Caddy의 공개 인증서 발급에는 실제 DNS와 외부 통신이 필요하다.
4. 추론 요청·잘못된 키·다른 서비스 모델 접근·예산·DB 재시작·키 회수·백업 복구를 검사한 뒤 앱 주소를 전환한다.

외부에는 지정된 `/v1` 추론 경로만 노출한다. `/ui`, `/key/*`, `/team/*`는 공개 프록시에서 404 처리한다. 관리자 접근은 SSH 터널로 서버의 127.0.0.1:4100에 접속한다. DB는 호스트 포트를 공개하지 않는다. 프록시는 업로드/파인튜닝/영상 생성 경로를 자동으로 노출하지 않는다.

기본은 단일 게이트웨이 인스턴스다. 다중 인스턴스 운영 시 공유 Redis 기반 제한·캐시 설정과 부하 검증을 추가해야 한다. GPU는 LiteLLM 중계에 필요하지 않지만, 직접 모델 추론·파인튜닝 서버를 운영하면 별도 자원이 필요하다. 이 구성은 관리형 서버리스 함수 배포가 아니라 상시 컨테이너 서버용이다.

## 검사와 적용 상태

```sh
python3 -m unittest -v
# Docker 통합검사는 .github/workflows/ai-gateway.yml 참조
```

단위 검사는 비밀 보존, 누락 공급자 처리, 서비스 권한 분리, 예산 명시, 잘못된 관리자 URL, 불명확한 키 발급 재시도 차단을 다룬다. CI는 실제 LiteLLM/PostgreSQL 컨테이너와 **모의 공급자**로 앱별 키 발급·권한·재시작 후 유지·Caddy 설정을 검사한다. 실모델 답변 품질, 실제 청구 상한, 공개 DNS/TLS는 별도 인수 검사다.

2026-09-26: 로컬 단위 검사 7개 통과. 로컬 Mac에는 Docker가 없어 Compose 기동 검사는 GitHub Actions에서 수행하도록 구성했다. 클라우드 미선정, 공개 서버 미배포, 공급자 모델·운영 키 미설정이다. 기본 설정은 실사용 가능한 대화 모델이 0개인 준비 상태다.

이미지는 공식 레지스트리에서 확인한 immutable digest로 고정했다. `main-stable` 조회 당시 digest를 고정한 것이며 앞선 로컬 pip 버전과 동일하다고 가정하지 않는다. 업그레이드는 새 digest와 통합검사를 함께 변경한다.
