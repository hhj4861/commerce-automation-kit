# 자동차 위로 배가 지나가는 도로의 비밀

## 결과

- 완성본: `/Users/admin/Downloads/vedio/veluwemeer-webtoon-short.mp4`
- 32.458초, 1080×1920, 24fps, 779프레임, 약9MB. Kyle `RU7aSi6lT4uQBXMLgDxK`, 로컬1.1배 처리. Pretendard SemiBold 자막12구간.
- 범위: 신규 건축학 쇼츠 한 편. 기존 영상·웹 서비스·YouTube 게시 변경 없음. 제작 소유: 현재 Codex 단독. base origin/main `985831e`.
- Higgsfield Seedance2.0 도입6초, 1회 생성, 조회/접수 견적54크레딧. 생성전 잔액249.9. 정확한 차감 내역은 별도 미조회. 생성 ID는 verification.json.
- 사실 근거: story.json.research. 한 교차점의 물 containment → 바닥·지지벽 → 하부 차량 통과를 설명. 과거 지하철 굴착·해저터널 접합과 다른 원리. 실제 측량도·시공도 대신 개념 재구성으로 표시.

## 검토와 한계

첫 두 대본 검토는 반복과 배수 부주제 분산 때문에 불합격했다. 부주제를 제외한 최종 대본은 유료 호출 전 별도 Codex 검토7항목을 모두 통과했다. 최종 대본/화면 설명과 검토 digest는 verification.json에 보관한다. 40초를 예상했지만 실제 발화 길이를 기준으로32.46초로 조립했으며 패딩이나 추가 배속으로 길이를 맞추지 않았다.

실제 도입6시점, 본문 미리보기와 최종6시점 화면을 확인했다. 본문에서 자동차가 벽 앞으로 나타나던 그리기 순서를 고쳤다. 전체 MP4 디코딩, 음성/영상 길이, 대사 자막전수 포함, 최대2줄 자막, 검은 화면/1.5초 이상 무음 없음 확인. 별도 Whisper 전사에서 핵심과 마지막 문장이 회수됐다. 고유명사 등 전사 오차가 있어 발음 완벽성이나 청음 검증으로 주장하지 않는다. 시청자 반응·조회수는 아직 미검증.

로컬 ElevenLabs TLS 인증서 오류는 여전하지만, 기존 허용된 main `tts-remote.yml`이 공식API로 음성을 생성했다. Cloudflare 비밀관리와 기존 GitHub OIDC만 사용했고 인증서 검증·접근권한을 변경하지 않았다. 배포 브랜치 무과금검증은403이었고, 정책상 TTS가 허용된main의 검증이 성공한 뒤1회 생성했다. 사용자가 네트워크를 바꿀 필요 없이 이번 음성은 회수됐다.

## 소스와 재현

- `story.json`: 대본·화면 계획·사실 근거.
- `produce.mjs`: 검토 및 공식 TTS/Higgsfield 어댑터. review가 합격해야 유료생성 가능. 생성 접수결과가 불명확하면 자동재시도하지 않는다.
- `render.py`: 웹툰 구조/하중 모션·음성1.1배·강제정렬 자막·조립·검증. `draft-preview`는 예정 장면만 확인하며 최종음성과 무관한 초안이다.
- 캐시: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261007-veluwemeer`. 원화·도입·음성·검토·접촉시트 포함. 비밀정보는 이 폴더에 저장하지 않음.
- 원화는 내장imagegen으로 생성해`art/hero.png`로 복사. 프롬프트: 네덜란드 수로교를 모티브로 한9:16 섬세한 건축웹툰, 청록색 물을 담은 콘크리트 수로 위의 작은 배와 수직 방향의 아래 도로를 달리는 앰버 자동차, 따뜻한 석양·차가운 물 대비, 콘크리트 바닥으로 두 길이 분리된 구조, 글자/홍수/폭포 없음. 기존 타인 영상 다운로드·재사용 없음.

`VIDEO_CACHE`를 캐시로, `CAK_ENGINE_ROOT`를 의존성이 설치된 `/Users/admin/workSpace/shopshorts-production`으로 지정한다. `produce.mjs review → preflight → tts → generate → poll`; 새캐시의 tts/generate는 비용 발생. 이번 tts는 아래의 기존원격경로로 대신 실행했다.

원격TTS는 `tts-remote.yml`을 main에서`verify_secrets_only=true`로 먼저 확인한 뒤, 검토완료scenes를`beats:[{index,role,narration,durationSec}]`로 바꿔base64 `script_b64`와 Kyle `voice_id`를 workflow_dispatch로 전달한다. `narration` artifact를 내려받아대본·voiceId·modelId를검증하고scene ID별voice파일로 매핑한다. secrets/로그의 키를복사하지 않는다. 이번run: https://github.com/hhj4861/commerce-automation-kit/actions/runs/37573183547

`python3 render.py align|plan|preview|render|verify --cache <캐시>` 순서. ffmpeg·Pillow·numpy·Whisper base가 필요하다. Pretendard는 기존20261005-jewel-webtoon캐시, 모델은20261001-glass-substrate캐시를재사용한다. 완성MP4는Git에 넣지 않는다.
