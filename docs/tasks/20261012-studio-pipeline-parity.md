# 공통 영상 제작 실행기 — 2026-10-12

- 목표: CLI·웹이 같은 제작 버전, 사전 연결 검사, 장면 실행기, 음성 정렬, 최종 검수를 사용한다.
- 소유: Codex 호출 세션, `feat/studio-pipeline-parity`. 별도 대교 영상 제작은 사용자 요청으로 중단 유지.
- 기준: #175 `d38c521` (#174 의존). PR 머지·운영 배포 미승인, 운영 checkout은 변경하지 않음.
- 범위: 공통 실행 경로와 검수/실패 진단. 사용자 입력 코드 실행, 자동 발행, 인증서 검증 해제 없음.

## 구현

새 프로젝트에만 `studio-production-v1`을 저장한다. 기존 저장본은 버전 없는 legacy 경로와 사용자 편집을 유지한다. Cloudflare Pages는 요청/저장/상태를 맡고 실제 제작 워커가 렌더링한다.

웹의 프로젝트 생성 및 시나리오 조사·독립 검토를 CLI에서도 호출한다. 장면 실행, 선택한 목소리와 속도, 재시도 자산 재사용, 자막·헤더, 완성본 검사는 동일 모듈이다. 검색/시나리오/검토/수정 단계가 브로커와 화면에 전달되며 제한 시간 오류에 실패 단계가 남는다. 이는 외부 LLM 응답 지연 자체를 해결했다는 의미는 아니다.

음성은 저장 후 Whisper 단어 시각과 검토 대본을 대응시킨다. 정렬 실패 시 유료 음성을 먼저 보존하며 재시도에 재사용한다. 분할 방식이 변경되면 정렬만 다시 한다. 자동 타임라인은 음성 끝을 보존하고, 수동 편집은 사용자 의도를 유지한다.

완성본 검사: 크기·타임라인 길이, 전체 디코딩, 예기치 않은 검은 화면, 대사 구간 음량, 자동 장면의 대사 잘림. 보고서와 SHA-256을 저장하고 업로드 전에 같은 파일인지 다시 확인한다. 최종 사람 검수는 유지한다. BGM이 섞인 음량 검사만으로 목소리 정체성이나 영상의 설명력을 보증하지 않는다.

## CLI 사용

```sh
node apps/shopshorts/studio-production-cli.mjs --project PROJECT.json --action create --brief BRIEF.json
node apps/shopshorts/studio-production-cli.mjs --project PROJECT.json --action scenario --assets ASSETS --work WORK
node apps/shopshorts/studio-production-cli.mjs --project PROJECT.json --action preflight
node apps/shopshorts/studio-production-cli.mjs --project PROJECT.json --action media --assets ASSETS --work WORK --approve-script
node apps/shopshorts/studio-production-cli.mjs --project PROJECT.json --action render --assets ASSETS --work WORK
```

BRIEF는 웹과 같은 입력 JSON이다. 로컬 시나리오 기본 실행기는 로그인된 Codex이며 웹에서는 연결된 계정 실행기를 사용한다. 양쪽이 같은 조사·검토 함수를 호출하지만 LLM의 비결정적 결과를 똑같이 보장하지 않는다. ASSETS/WORK는 승인된 작업 저장 경로를 지정한다. `create`는 기존 파일을 덮어쓰지 않으며 CLI 동시 변경은 잠금으로 차단한다. 발행 CLI는 추가하지 않았다.

## 검증과 한계

- Shopshorts·계정 브로커 최종 전체 회귀검사: 코드 `1fa9a2d`, 로그 `resume-tests.log`. 470검사 중 **468통과·2건너뜀·0실패**, 종료 코드 0, 35.2초. 새 시나리오 fixture 보완까지 포함한 전체 재실행 결과다. 모션 실행기는 Node 22.23.3을 지정했다. GitHub Platform GitOps verification/contract 검사도 같은 코드에서 통과했다.
- 실제 FFmpeg 통합: 웹 API → 로컬 저장소 → 워커 → 완료 저장 및 같은 입력의 CLI 렌더. 디코딩한 모든 영상·음성 프레임 해시 일치, 검수 결과 저장, 무음·검은 화면·잘못된 길이 거부 확인. 기술용 영상/톤 fixture이며 실제 Kyle 음성 품질 검사가 아니다.
- 실제 저장된 삿포로 도입 음성 3.136초 + 로컬 Whisper small: 대응률 0.8095, 자막 시각 0.571~2.920초. 기존 음성/모델 재사용, 유료 호출 0회.
- 신규 TTS 실생성은 현재 네트워크의 ElevenLabs 인증서 오류로 미검증. 재확인에서도 Node는 `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, 시스템 curl은 SSL 오류 60/HTTP 000을 반환했다. 인증정보를 보내지 않은 연결 확인이며 TLS 검증은 유지했다. 신뢰된 네트워크/인증서 복구 후 운영 워커에서 확인해야 한다.
- 로컬 Chrome 실제 화면에서 자동 제작 대시보드와 펼쳐진 제작 입력을 확인했다. 제작 순서(카테고리→주제 추천→자료 확인→대본→영상·음성→완성), 검증 포맷 진입점, 웹툰/자동 혼합/애니메이션/시네마틱 선택, 길이/예산/목소리·자막 설정을 확인했다. 확장 연결은 시간 초과여서 네이티브 Chrome 제어로 확인했으나 다른 작업이 탭을 반복 전환하여 생성→저장→이어하기 UI 검증은 미완료다. 로컬 fixture의 인증·워커 온라인 표시는 모의 응답이며 운영 연결의 증거가 아니다. 실제 API/워커 통합 검증과 구분한다.
- 전용 정밀 Blender 모델은 등록된 삿포로 레시피만 제공한다. 임의의 새 건축물 모델/연출을 생성하는 기능이나 모든 수작업 영상과 같은 품질을 보장하지 않는다. 새 모델은 검토 후 레시피로 등록해야 한다.
- 아티팩트: iCloud `gpt 작업/commerce-automation-kit/20261012-pipeline-parity/`. Git 소스는 로컬 worktree에 있다.

## 운영 적용 순서 — 아직 미실행

1. #174 → #175 → 이 후속 PR의 개별 머지 승인 및 통합 검증.
2. 워커 환경 준비: ffmpeg/ffprobe, 선택한 Blender 실행기, 모션용 Node 22, `SHOPSHORTS_ALIGNMENT_PYTHON`에 Whisper/torch 설치. `SHOPSHORTS_WHISPER_MODEL` 기본 small, `SHOPSHORTS_WHISPER_CACHE`를 지속 작업 경로에 지정하고 모델을 미리 준비한다. 사전 검사는 Python import를 확인하지만 모델 다운로드 성공까지 보증하지 않는다.
3. 브로커의 새 진행 단계와 제작 워커를 먼저 배포하고 TLS·등록 레시피 생성·검수 통과를 확인한다. 이후 Pages를 배포한다. 구버전 워커에 새 프로젝트만 보내는 부분 배포는 피한다.
4. 운영 브라우저에서 새 제작 1건과 기존 편집 1건을 검증하고, 실제 영상과 음성·자막·결말을 사람이 확인한다. 신규 유료 생성/발행 예산은 기존 사용자 승인을 따른다.

## 운영 반영 진행 — 사용자 승인 후

- 사용자 승인: #174·#175·#191 머지 및 운영 반영.
- #174는 최신 main의 메타데이터 import를 보존해 충돌 해결, 관련 17검사 통과 후 머지했다.
- #175는 레시피/메타데이터 생성 API를 모두 보존해 충돌 해결, 관련 32검사 통과 후 머지했다.
- #191 + 최신 main 통합 상태: 전체 **483검사 중 481통과·2건너뜀·0실패**, 45.1초, `integrated-tests.log`. 실제 FFmpeg 동등성/완성본 검수 포함.
- 운영 큐 조회: 기존 15프로젝트, queued/running 0건. 운영은 아직 구버전이다.
- 운영 Mac의 Python Whisper/torch와 기존 small 모델을 확인했다. 서비스에 지속 캐시 경로를 명시해야 한다. Cloudflare OAuth의 Pages/Workers 쓰기 권한은 확인했다.
- ElevenLabs TLS 인증서 검증 실패는 유지된다. 코드 배포와 신규 음성 실생성 성공을 구분한다.
