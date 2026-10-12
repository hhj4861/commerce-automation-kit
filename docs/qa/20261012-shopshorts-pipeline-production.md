# Shopshorts 공통 제작 파이프라인 운영 반영 — 2026-10-12

## 결과와 범위

사용자가 승인한 #174(자막/헤더), #175(삿포로 전용 Blender), #191(웹/CLI 공통 제작), #193(운영 승격)을 머지했다. Pages, 로컬 제작 워커, Cloudflare 인증 중계 서비스를 배포했다. 새 영상 제작은 중단 지시를 유지했으며 유료 TTS·미디어 생성과 YouTube 업로드는 실행하지 않았다.

- 운영: https://shopshorts-dash.pages.dev/studio/dashboard?mode=auto
- 운영 소스: `bea0124f97069de8278bc6c4c0b7f93c836489ab` (`deploy/shopshorts`, PR #193).
- Pages 배포: https://a27b0b91.shopshorts-dash.pages.dev — 공식 Wrangler exit 0, 수동 배포.
- 로컬 제작 워커: `/Users/admin/workSpace/shopshorts-production`, 같은 SHA, `com.cak.studio-production` PID 73202. 이전 PID 87650 종료 확인 후 재기동.
- broker: `319343f0-b890-4ebf-8959-5d7ee70028af`, 100% 활성. Cloudflare deployment `418c09a6-e627-4af7-bd38-cc6b0b138126`, 2026-10-12T09:09:03Z.

## 실제 검증

- 통합 소스 검증: 483개 중 481 통과, GPU 선택 검사 2개 skip, 실패 0. FFmpeg 웹 API → 저장 → 워커와 CLI의 디코딩 영상/음성 프레임 해시 일치 포함. 상세: 구현 브랜치 task card `docs/tasks/20261012-studio-pipeline-parity.md`.
- 운영 API `/api/studio/config` HTTP 200: `studio-production-v1`, finalInspection=true, captionAlignment=whisper-words-v1, humanPublicationReview=true.
- 실제 운영 `/video-typography.js`, `/authored-recipes.js`, `/automatic-creation.js`를 기존 워커 인증으로 조회: JavaScript HTTP 200, 승인 소스와 SHA256 모두 일치. 무인증 조회는 로그인 HTML로 이동하므로 파일 검증 근거로 쓰지 않았다.
- 운영 `/api/studio/recipes`로 과금 없는 삿포로 QA 초안 생성, `/scenes`로 QA 제목 저장, GET 재조회: 6개 장면이 CLI 공통 팩토리와 deepEqual, pipelineVersion=studio-production-v1, typography=modern-v1, revision=1, task=null.
- QA 초안: https://shopshorts-dash.pages.dev/studio?id=647119e9-9f09-475d-ad49-0a581a913466
- 기존 프로젝트 15개 ID 유지. QA 초안 하나만 추가했고 생성 큐에는 넣지 않았다.
- 2026-10-12T09:14:07Z 제작 워커 heartbeat 확인.
- Whisper/Python 기존 설치 및 small 캐시를 사용. 기존 자체 음성 샘플 3.136초로 정렬 검사(coverage 0.8095); 새 유료 음성 생성 아님.

## 운영 설정 보존

운영 LaunchAgent의 EnvironmentVariables에 SHOPSHORTS_ALIGNMENT_PYTHON=/opt/homebrew/bin/python3, SHOPSHORTS_WHISPER_CACHE=/Users/admin/.cache/whisper, SHOPSHORTS_WHISPER_MODEL=small을 추가했다. plist lint 통과. OS 설정은 저장소 외부여서 gate track이 지원하지 않는다고 반환했으며 Git 커밋으로 포장하지 않았다.

broker 기본 배포는 존재하지 않는 CAK_DEPLOY_CLOUDFLARE_API_TOKEN 참조로 Cloudflare 10182 오류가 났다. 공식 settings API로 실제 운영 구성을 확인한 뒤 기존 27개 Secrets Store 참조, D1, 모든 plain-text 변수/기존 허용 브랜치를 그대로 유지하는 일회성 `.wrangler/broker-live-bindings.json`으로 승인 소스를 배포했다. 이 파일은 Git ignore이며 자격 값은 저장하지 않았다. 배포 후 API로 변수와 27개 참조가 모두 동일함을 다시 확인했다. 미등록 CI 토큰 두 개의 binding을 새로 추가하지 않았고 권한을 확장하지 않았다. 운영 소스의 대본 review/revision 진행 단계 전달이 포함된다.

## 남은 제한 — 완료로 보고하지 않음

1. **새 음성 생성 미검증/차단**: ElevenLabs 연결 TLS 인증서 오류가 계속되며 운영 audioAccount=unavailable. 정상 네트워크 또는 네트워크 관리자의 승인된 인증서 복구 후 실생성 검증이 필요하다. TLS 검증을 끄지 않았다.
2. **향후 GitHub 자동 배포 미활성**: Actions https://github.com/hhj4861/commerce-automation-kit/actions/runs/38226113763 은 자격 요청 403으로 실패했다. 실제 운영의 deploy 허용 ref는 기존 Hanmadi-admin이며 Shopshorts CI 전용 토큰은 없다. 이번 수동 배포 성공이 자동 배포 성공은 아니다. `docs/deployment/shopshorts.md` 절차로 최소 범위 CI 토큰 준비와 허용 ref 설정 후 첫 Actions 배포 검증이 남는다.
3. **운영 브라우저 로그인 이후 E2E 미완료**: Google 로그인 화면까지 확인. Chrome 연결 오류와 다른 작업의 활성 탭 전환이 반복되어 사용자 계정 로그인 완료·클릭 기반 저장은 확인하지 못했다. 위 초안 검증은 서버 API 검증이며 브라우저 검증으로 대신 주장하지 않는다.
4. **모든 건축물의 전용 모델 구현 아님**: 검증된 삿포로 전용 모델을 공통 파이프라인에 연결했다. 다른 건축물에 같은 세부 모델 품질을 보장하지 않는다. 기존 편집 프로젝트는 자동으로 새 기본값으로 덮어쓰지 않는다.

렌더/테스트 로그는 기존 iCloud `gpt 작업/commerce-automation-kit/20261012-pipeline-parity/`에 보관한다. 불완전하게 생성된 `cak-credential-broker/` C3 샘플은 Node 버전 오류로 원격 소스를 내려받지 못한 템플릿이므로 운영 스냅샷 근거로 사용하지 않는다.
