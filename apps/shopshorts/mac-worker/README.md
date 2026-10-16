# Shopshorts Mac 제작 워커 이관

Docker 없이 새 개인 Mac에 설치하는 **온라인 설치 패키지**다. OS 이미지나 도구를 전부 포함한 오프라인 복제본은 아니다. 회사 Mac에는 Docker·새 런타임을 설치하지 않는다. 패키지를 만든 Mac에서는 설치를 거부한다.

## 새 Mac에서

1. ZIP을 압축 해제(또는 DMG를 열고 내부 패키지 폴더에 진입)하고 `Install.command`를 실행한다. macOS 14 이상·여유 공간 20GiB 이상이 필요하다. 최초 실행용 Python 3은 Apple Command Line Tools에서 제공된다. 새 Mac에서 해당 도구가 없다면 macOS 설치 안내를 먼저 완료하고 다시 실행한다. Apple Silicon/Intel에 맞는 Homebrew 도구를 내려받으며 관리자 확인이 필요할 수 있다. macOS의 보안·회사 관리 정책을 우회하지 않는다.
2. Node 22·FFmpeg·Python 3.11·Blender 4.2 이상/Cycles·Whisper·npm 의존성을 준비한다. 인터넷이 필요하며 처음에는 수 GB가 내려받아질 수 있다. Blender가 이미 있으면 덮어쓰지 않고 호환성을 검사한다. 지원되지 않는 GPU는 CPU로 작동할 수 있으므로 새 Mac에서 렌더 시간·화질을 확인한다.
3. 별도로 안전하게 옮긴 **기존 워커 인증키** `credential-runner.jwk`를 파일 선택창에서 고른다. AirDrop 등 개인 간 안전한 전달을 사용하고 채팅·Git·ZIP·iCloud에 키를 넣지 않는다. 현재 인증 브로커는 기존 공개키를 신뢰하므로 이 설치기는 키를 임의로 교체하거나 새 키를 등록하지 않는다. 키는 새 Mac의 `~/Library/Application Support/Shopshorts/`에 0600으로 저장한다.
4. Cloudflare 인증·제작 API·ElevenLabs TLS 연결 및 로컬 도구를 검사한다. 생성·업로드·과금 요청은 하지 않는다. 실패하면 `Check.command`로 재검사한다.
5. 기존 Mac의 **실행 작업이 끝난 것을 확인하고 워커를 중지**한다. 그 후 새 Mac에서 `Start.command`를 실행한다. 시작 시 다시 점검하고 확인창을 표시한다. 기존 Mac의 작업 상태를 이 설치기가 자동 판정하거나 원격 중지하지 않는다.
6. Shopshorts에서 짧은 시험 제작을 끝내고 실제 음성·자막·완성 영상을 확인한다. 이때부터 실제 API 비용이 발생할 수 있다. 새 Mac은 로그인·인터넷 연결 상태를 유지하고 제작 중 절전되지 않도록 설정한다. LaunchAgent는 사용자 로그인 후 실행된다.

`Stop.command`는 이 Mac의 제작 워커만 중지하며 인증·결과물을 지우지 않는다. 기존 Mac의 중간 렌더 파일은 ZIP에 포함되지 않는다. 완료된 클라우드 자산은 서버에 유지되지만 실행 중인 작업의 자동 재개를 보장하지 않는다. LLM 계정 워커·다른 자동화 서비스는 이번 제작 워커 패키지의 이관 대상이 아니다.

## 저장 위치와 복구

- 버전별 제작 코드: `~/workSpace/shopshorts-worker/<source commit>/`
- 인증·가상환경·민감한 OAuth 임시 캐시: `~/Library/Application Support/Shopshorts/`
- 렌더·Whisper 모델·로그: `~/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/mac-worker/`
- 로그/프레임은 작업 폴더로 지정하지만 OS·도구 자체의 모든 캐시까지 그 위치로 옮기는 것은 아니다. OAuth 임시 파일은 iCloud 밖에 둔다. iCloud 저장도 로컬 디스크를 사용한다.
- 기존 설치·설정·변경 파일을 덮어쓰지 않는다. 설치 도중 실패하면 수정되지 않은 동일 소스 폴더를 재사용해 다시 시도할 수 있다.
- 이전 워커는 검증 완료 전 삭제하지 않는다. 새 워커 중지 → 실행 작업 상태 확인 → 이전 워커 재시작 순서로 복구한다. 두 워커를 동시에 시작하지 않는다.
- 설치된 소스는 해당 commit의 스냅샷이며 `.git`을 포함하지 않는다. 버전 업데이트는 새 패키지로 진행한다. Pages GitOps가 새 Mac 워커까지 자동 갱신하는 기능은 이번 범위에 포함되지 않는다.

## 패키지 제작

```bash
python3 apps/shopshorts/mac-worker/build-bundle.py --ref HEAD --out '/지정한 작업 폴더/Shopshorts-Mac-Worker.zip'
```

Git에 커밋된 허용 경로의 소스·폰트와 npm lockfile만 내보낸다. `.env`·비공개 키·런타임 데이터·기존 영상·node_modules·다른 세션의 미커밋 파일은 복사하지 않는다. 인증·설치 작업은 빌드 중 수행하지 않는다. 다른 소스 버전은 `--ref`로 명시하며 결과의 commit/ZIP SHA256를 확인한다. manifest는 변조·누락 점검용이며 코드서명·공증을 대체하지 않는다.

공식 설치 근거: [Homebrew](https://docs.brew.sh/Installation), [Blender cask](https://formulae.brew.sh/cask/blender), [Whisper](https://pypi.org/project/openai-whisper/20250625/). Homebrew의 도구 버전은 대상 Mac에서 결정되며, 전체 의존성이 기존 Mac과 바이트 단위로 동일한 이미지는 아니다.
