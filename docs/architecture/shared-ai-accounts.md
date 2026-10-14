# 플랫폼 독립 LiteLLM 공통 모듈

2026-09-28 사용자 정정: 공통 로그인이나 서비스 간 계정 공유가 아니라,
여러 플랫폼이 lib처럼 호출하는 공통 모듈로 연결·사용 절차를 동일하게 유지한다.

```text
Festa 서버 ───┐
Hanmadi 서버 ─┼─ @cak/litellm-client ─ LiteLLM ─ 제공자
다른 플랫폼 ──┘
각 플랫폼 인증 → platformId + subject → 동일한 ConnectionAdapter 계약
```

- 플랫폼: 기존 로그인·권한·화면·여행/학습 입력과 결과 검증.
- 공통 패키지: 연결 설정, 선택/상태 흐름, 사용자·플랫폼 격리, 텍스트/JSON/음성 API, 타임아웃·취소·오류 처리.
- 공통 LiteLLM 서버: 제공자 연결, 모델 별칭, 앱/개인 전용 키, 한도·예산.
- 연결 어댑터: 플랫폼 인증 세션과 공통 서버의 private storage/인증 실행기를 연결한다.
  로그인 시스템 통합이나 이메일 자동 병합은 하지 않는다.

공통 소스는 `packages/litellm-client` 한 곳이다. 공급자 설정은 게이트웨이에서 변경한다.
SDK 코드 변경은 패키지 버전과 앱 배포 갱신이 필요하다.

## 연결 흐름

기본 AI → 기존 플랫폼 인증 → connect → refresh → list → client(selection) → disconnect.
연결 상태는 authorizing/connected/expired/quota_exceeded/error/disconnected로 통일한다.
호출마다 사용자·플랫폼·상태를 재검사한다. 실패 시 다른 모델로 자동 전환하지 않는다.
공개 목록에 키·토큰·서버 라우트를 반환하지 않고 공용 앱 키에 개인 모델을 추가하지 않는다.
구독 로그인 중계(accounts v1: Codex 기기 로그인, Claude Code 로그인)는 2026-09-28부터 운영하다 2026-10-13에 퇴역했다. 남은 개인 연결 경로는 API 키 전용 accounts v2 코드(`services/ai-gateway/ACCOUNTS-V2.md`, 미배포)뿐이다. Claude 구독 토큰 중계는 지원하지 않는다.

## 실제 적용 범위

| 대상 | 이번 변경 |
|---|---|
| 공통 패키지 | 전송·타입·연결 수명주기 구현, 서버 인증 어댑터 계약 제공 |
| Hanmadi | 텍스트·STT·TTS를 공통 패키지로 변경. 기존 인증/Dify 경로 유지(Dify는 2026-10-13 D6로 퇴역) |
| Festa | 별도 PR에서 패키지 tarball 의존성으로 3개 추천 API 연결 |
| Replay | 별칭은 존재. 소비 코드 확인/전환은 아직 하지 않음 |
| Dify | 공식 LiteLLM 호환 API 직접 사용. JS 라이브러리를 주입하지 않음. 2026-10-13 D6로 퇴역, 저장소 코드는 #221에서 삭제 |

**구독 로그인 v1은 2026-10-13에 퇴역했다. API 키 전용 v2는 코드만 있고 배포된 곳이 없다(서버리스 스테이징은 2026-10-12 철거, `docs/PROGRESS.md` §7 #17). 운영 적용은 BYOK 약관 확인 뒤 VM에 올리는 별도 과제다(`docs/plans/20261012-shared-ai-vm-maintenance.md` §4).**
SDK 테스트 fixture는 실제 사용자 인증 성공 증거가 아니다.
계정별 구독 워커 관리 CLI(`services/ai-gateway/subscriptions.py`)는 D5로 폐기해 #222에서 지웠다.
웹 어댑터는 플랫폼 인증/권한, challenge 전달, state/PKCE/CSRF, 암호화 자격 저장,
토큰 갱신·회수·재시작·동시 호출 격리를 구현하고 실제 계정으로 검증해야 한다.

검증: SDK의 실제 HTTP 리다이렉트·JSON 오류·시간 초과/취소·사용자/플랫폼 격리,
Hanmadi 기존 회화·음성·학습 회귀, Festa 실제 Workers Request와 3개 추천 API 회귀.
각 저장소 PR 승인 후 배포한다. 이번 구현은 운영 자격·한도·모델을 변경하지 않는다.

[사용법](../../packages/litellm-client/README.md), [공식 API](https://docs.litellm.ai/docs/proxy/user_keys).

## 검증 결과

SDK 9개, Hanmadi 회귀 28개, Festa AI 7개 및 Pages 흐름/바인딩 10개 통과.
두 앱 빌드·타입·lint 통과(Hanmadi 기존 경고 4개).
Hanmadi 3개 언어 로그인→회화→STT/TTS→학습 계획 및 사용자 격리 브라우저 흐름 통과.
Hanmadi의 단독 폴더 Docker 배포를 위해 패키지 tarball과 `COPY vendor/`를 포함한다.
로컬 Docker 실행기는 없어 컨테이너 이미지 자체 빌드는 수행하지 않았다.
