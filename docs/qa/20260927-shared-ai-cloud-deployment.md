# Shared AI 운영 연결 검증 — 2026-09-27

## 결과와 적용 범위

Hanmadi 운영 사이트 **https://hanmadi-lake.vercel.app/conversation** 에 Dify 회화와 LiteLLM 음성 연결을 실제 적용했다. 기존 튜터 계정으로 로그인한 브라우저에서 한국어·태국어·일본어 응답 표시, 대화 이어가기 및 답변 듣기 요청을 검증했다. Hanmadi API를 통한 음성 생성 → 음성 인식도 통과했다.

- 공용 API: `https://shared-ai-d5cy7m6i7q-uc.a.run.app`
- 개인 GCP 프로젝트: `replay-live-508202`, VM `shared-ai`, zone `us-central1-a`.
- 설치 경로: 서버 `/opt/shared-ai/repo`. Dify 관리 화면은 공개하지 않으며 IAP 터널의 localhost:4180으로만 접근한다.
- PR [#44](https://github.com/hhj4861/commerce-automation-kit/pull/44), [#45](https://github.com/hhj4861/commerce-automation-kit/pull/45)는 각각 명시적 승인 후 머지·적용했다. 배포 기반은 `5bb8c87e0cfa9259132e84e8537bb18c19d8de74`, 상태 경로 수정 머지는 `db1a804e9b71ac6f7870b43ebbd6837710dbcab2`다.
- 이 문서는 PR #45 당시 `services/shared-ai-host/README.md`에 남아 있는 초기화 대기·Hanmadi 미적용 상태를 갱신하는 최종 실행 기록이다.

## 운영 구성

Hanmadi → Dify Hanmadi 앱 → LiteLLM `hanmadi-chat` → Gemini. 음성은 Hanmadi → LiteLLM → ElevenLabs다. Replay는 별도 키와 `replay-video-planner` 모델을 사용하는 Dify 워크플로로 분리했다.

- LiteLLM 1.102.1, Dify 1.17.1 고정 소스, OpenAI-API-compatible 플러그인 0.0.68. 플러그인 서명 검증 유지, 자동 업데이트 끔.
- Dify 단일 워크스페이스 소유자 `guswhd1085@gmail.com` 생성은 사용자 개별 승인 후 수행했다.
- Hanmadi Dify 앱: `2bd6d391-b119-40c4-b001-4be6bee368a9`.
- Replay Dify 앱: `5f18417f-2691-4426-ac72-abc7fa24aa26`.
- 채팅 모델은 `gemini/gemini-flash-lite-latest`, 음성 모델은 `elevenlabs/eleven_v3` 및 `elevenlabs/scribe_v1`.
- 앱별 LiteLLM 키에 모델 허용 목록, 분당 30회, 초기 30일 $5 예산을 적용했다. 공급자 청구의 절대 상한은 아니다.
- 공급자 키는 사용자 지정 `.env`에서 필요한 값만 주입했다. 기존 기본 Gemini 키는 인증 실패했고 사용 가능한 대체 키로 실제 응답을 검증했다. 키 값은 기록하지 않는다.
- Dify 관리자 비밀은 서버 `/opt/shared-ai/dify-admin.json`, 앱 비밀은 `/opt/shared-ai/apps.json`에 0600으로 보관한다. 로컬로 키 파일을 복사하지 않았다.

## Hanmadi 운영 배포

Vercel `dean-10/hanmadi`의 production 환경에 `CONVERSATION_PROVIDER`, `DIFY_BASE_URL`, `DIFY_API_KEY`, `DIFY_USER_SECRET`, `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL`, `LITELLM_STT_MODEL`, `LITELLM_TTS_MODEL`, `LITELLM_TTS_VOICE`를 등록하고 새 production 배포를 완료했다. 기존 튜터 PIN, 인증 비밀, Redis 설정은 변경하지 않았다.

- 적용 배포: `dpl_9nxPoa1TmXiBFSADzQYDYSLuvnZt`, Ready.
- 고정 배포 URL: https://hanmadi-jid5nv96p-dean-10.vercel.app
- 운영 별칭: https://hanmadi-lake.vercel.app
- 이전 배포: `dpl_5Humr4Kq3GBe47nTWboLqHFwpYu1` / https://hanmadi-nzv39g7wp-dean-10.vercel.app
- 롤백 시 이전 배포를 명시적으로 선택하고 신규 환경변수의 이후 배포 반영 여부도 함께 점검한다. 현재 연결을 임의로 되돌리지는 않았다.

## 실제 검증

| 검사 | 결과 |
|---|---|
| 공개 `/health` | 200, edge alive. 프록시 생존 검사이며 모델 건강 전체를 뜻하지 않음 |
| LiteLLM 미인증 요청 | 401 |
| Hanmadi 키 모델 목록 | 200, Hanmadi chat/STT/TTS만 노출 |
| Replay 키로 Hanmadi 모델 접근 | 403 |
| 공개 관리 경로 | 404 |
| Dify 한국어·태국어·일본어 실제 생성 | 모두 200 |
| Dify 다른 사용자로 기존 conversation ID 접근 | 404 |
| Replay 영상 기획 워크플로 | 200, status succeeded, 15초 카페 영상 기획안 반환 |
| Hanmadi 기존 튜터 로그인 | 200, 정상 인증 쿠키 발급 |
| Hanmadi 브라우저 세 언어 대화 | 모두 200, 답변이 화면에 실제 표시됨 |
| Hanmadi 일본어 두 번째 대화 | 200, 동일 conversation ID 유지 |
| 브라우저 마지막 답변 다시 듣기 | 음성 API 요청 200 |
| Hanmadi 음성 API 실호출 | 200 audio/mpeg, 56,050 bytes |
| 같은 음성 WAV 변환 후 Hanmadi STT | 200, `こんにちは。コーヒーを一つお願いします。` 원문 일치 |
| Hanmadi 대화 저장 동의 없음 | 400 |
| Hanmadi 잘못된 Origin | 403 |
| Hanmadi 비로그인 대화 | 401 |
| LiteLLM/DB 재시작 후 기존 앱 키 | 모델 목록 200, 설정 유지 |
| PR #44 머지 후 CI | 구성·게이트웨이·Dify·Hanmadi 4건 통과 |
| PR #45 실제 Caddy 라우팅 CI 및 머지 후 CI | 통과 |

테스트용 합성 문장만 사용했다. 브라우저 테스트 후 튜터 로그아웃 200 및 임시 관리 브라우저 쿠키 삭제를 확인했다. 실제 사람의 마이크 입력과 스피커 청음은 수행하지 않았다. 답변 생성 성공은 교육 내용의 정확성을 보장하지 않는다. 특히 태국어 응답의 한국어 발음 설명에 오류가 관찰되어, 학습 품질 평가와 교정용 자료 보강이 필요하다.

## 백업과 복원

- 최종 백업: 서버 `/opt/shared-ai/backups/20260927-post-apps` (디렉터리 0700, 파일 0600).
- `litellm.dump` 229,718 bytes, `dify.dump` 355,252 bytes, `service-configs.tgz` 18,690,727 bytes.
- 설정 아카이브는 관리자·앱 비밀, LiteLLM/Dify 설정 및 Dify storage/plugin 디렉터리를 포함한다. 개발 PC로 내려받지 않았다.
- 네트워크 없는 임시 PostgreSQL 컨테이너와 tmpfs에 실제 복원: LiteLLM public 테이블 86개, Dify 144개 및 앱 2개 확인. 검사 컨테이너 제거 완료. 운영 DB는 덮어쓰지 않았다.
- 별도로 매일 VM 디스크 스냅샷/7일 보존 설정이 있다. 전체 VM 재해 복구·오프사이트 복원 시험을 했다는 뜻은 아니다. 이번 논리 백업은 수동 시점 백업이다.
- Terraform state와 배포 메타데이터는 현재 프로젝트 Git 제외 `data/shared-ai/`에 0600으로 보관한다.

## 완료 범위와 후속 한계

Hanmadi의 실제 Dify 회화 연결과 공용 서버 구축은 운영에 적용됐다. Replay는 Dify 영상 기획 API를 구성·실호출한 범위이며 Replay 제품 화면까지 연결한 것은 아니다.

개인 Codex 구독 연결 기능은 앞선 PR #42에서 구현·로컬 검증했지만 이 클라우드 서버에는 개인 OAuth를 복사하거나 로그인하지 않았다. 현재 공용 앱은 Gemini API 키를 사용한다. Claude 구독 연결 및 클라우드 개인 Codex 계정 연결이 완료됐다고 보고하지 않는다. Dify/LiteLLM 자체가 대화를 통해 모델 가중치를 자동 학습하는 구성도 아니다.

인프라 고정 항목 예산 계산은 약 $60.57/월이고 스냅샷·Cloud Run·트래픽·세금·모델 API 사용료는 별도다. 사용자 승인 $70/월은 목표 예산이며 청구 상한이나 비용 경보가 아니다.
