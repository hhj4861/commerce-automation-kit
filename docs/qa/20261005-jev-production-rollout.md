# JEV discovery 운영 교체 결과 — 2026-10-05

PR #151 머지와 운영 discovery 교체를 사용자에게 구체적으로 제시한 뒤 “진행해줘” 승인을 받아 실행했다. 후속 “계속” 요청으로 **공통 서비스와 Shopshorts 계정 워커의 코드 갱신·연결 검증까지 완료했다. 새 검수 기능 활성화와 실제 계정 화면 E2E는 미완료**다.

## 실제 반영

- [PR #151](https://github.com/hhj4861/commerce-automation-kit/pull/151): main에 squash merge. 머지 커밋 `aeeec75761f5afac88a25be1b42f30e3d3eb6133`. CI 2개 통과, 관련 로컬 테스트 76개 통과. 머지된 adapter/service/native review 소스가 검증한 파일과 같음을 확인했다.
- 서버: 개인 GCP `replay-live-508202`, `shared-ai`, `us-central1-a`의 discovery 서비스만 교체했다.
- 서비스 소스: 앞서 승인·머지된 PR #148의 `c7ef3e2c411785c8e852f24a54ea867016370dc4`. #151의 런타임 변경은 Shopshorts adapter이므로 이 서비스 이미지에는 추가 변경이 없다.
- 릴리스: `/opt/shared-ai/releases/discovery-c7ef3e2c411785c8e852f24a54ea867016370dc4`.
- 이미지: `sha256:ba7242caddafaa94a75106805b43f80bb6185f7c5aee1ba62b619994850f6698` (`cak-discovery:c7ef3e2`).
- 실행 모듈 버전: 단일 단계 `discovery-v1.2`, research 기본 `discovery-v2.2`, 명시적 native 검수 `discovery-v2.6`.

## 보존·검증

1. 교체 직전 진행 중 요청 0, SQLite quick_check=ok 확인. 서버 내부 백업 `/opt/shared-ai/backups/discovery-c7ef3e2c411785c8e852f24a54ea867016370dc4/discovery.sqlite` 생성 및 무결성 확인(0600).
2. 기존 `/opt/shared-ai/discovery/.env`와 data를 그대로 연결. 비밀 설정 내용 불변, 기존 요청 **7건 전체 행 일치**, 다른 실행 중 컨테이너 ID 불변 확인. 새 키·권한·예산 변경 없음.
3. 새 discovery healthy, 내부 health HTTP 200, runtime import와 v1.2/v2.2/v2.6 확인. 실패 시 이전 compose·이미지로 복귀하는 절차를 준비했으며 실제 복귀는 필요하지 않았다.
4. 공개 주소 `https://shared-ai-d5cy7m6i7q-uc.a.run.app/discovery`에서 아래 검사 통과. 운영 키는 서버 프로세스 안에서만 사용했다.

| 검사 | 응답 |
|---|---|
| private health 외부 비노출 | 404 |
| 익명 discovery 요청 | 401 |
| 유효 인증 + 존재하지 않는 요청 | 404 / request_not_found |
| 지원하지 않는 reviewMode | 400 / unsupported_review_mode |
| 브라우저 Origin 직접 요청 | 403 / backend_only |

검사 후에도 DB 요청 7건·quick_check=ok다. 이번 배포 검증의 새 LLM/JEV 호출은 **0회**이며, 의미 품질을 새로 측정한 것이 아니다. 기존 실호출 품질 근거는 main의 `docs/qa/20261005-jev-v26-final.md`에 있다.

## 남은 작업

- 제한된 실제 계정·브라우저 흐름에서 조사→초안→검수 및 보류 표시를 확인해야 한다. 계정 철회와 재생은 HTTP 통합 대역 테스트로 확인했으며 실제 연결 계정을 해제하지 않았다.
- 클라이언트 활성화 설정은 아직 바꾸지 않았다. `DISCOVERY_ENABLED=1`, `DISCOVERY_WORKFLOW=research-v2`, `DISCOVERY_REVIEW_MODE=native-llm-v1`, 운영 `DISCOVERY_URL`을 계정 워커에 적용하고 실제 요청을 검증해야 한다.
- 브라우저 Google 로그인에는 개인·회사 계정이 함께 표시됐다. 자동 승인 검토가 사용 계정 미지정을 이유로 계정 선택을 거절하여 사용자 선택을 요청했다. 로그인 완료·실계정 생성 성공으로 보고하지 않는다.
- 다른 플랫폼·블로그 활성화나 Pages 재배포는 이번 실행에 포함되지 않았다. 전체 JEV 연동 완료로 보고하지 않는다.

## 후속 운영 워커 갱신·검증

- `/Users/admin/workSpace/shopshorts-production`의 미완료 변경이 없음을 확인하고 `992c1f0`에서 승인·머지된 #151의 `aeeec75761f5afac88a25be1b42f30e3d3eb6133`으로 정상 detached checkout했다. 새 구현이나 미승인 PR 머지는 없다. 이 구간의 Shopshorts 변경은 `lib/topic-discovery.js`와 해당 테스트뿐이며 제작·렌더 실행 소스는 불변이다.
- 계정 큐 전체 페이지에서 진행 중 작업 0, studio 12개 프로젝트에서 queued/running 작업 0을 확인했다. 인증 응답은 메모리에서 상태·개수만 추출했고 키·계정 자격·프로젝트 본문은 출력하지 않았다.
- 실제 운영 checkout의 설치 의존성으로 `topic-discovery.test.mjs`, `test-client.mjs`, `test-runtime-config.mjs`, `studio-service.test.mjs`를 실행해 **27개 통과, 실패 0**을 확인했다. Codex/Claude 3단계·재생·검수 직전 철회, 기존 기본 동작, 자격 실패, 서비스 종료 검증을 포함한다. HTTP 서버는 실제지만 검색·모델은 대역이다.
- 기존 runner 키 → broker의 Shopshorts 전용 discovery 키 → 운영 discovery 조회를 실제 모듈로 확인했다. 유효한 UUID의 없는 요청 조회가 **404 / request_not_found**로 종료됐다. 최초 검사는 UUID가 아닌 경로여서 plain-text 404 파싱에 실패했으며, 서버 경로 규칙을 확인한 뒤 UUID로 수정해 통과했다. 최초 실패를 인증 성공 근거로 사용하지 않았다.
- 계정 작업 0을 다시 확인한 뒤 `com.cak.llm-accounts`에 정상 SIGTERM을 보내 launchd 재시작을 확인했다. 이전 PID 39167 → 새 PID 32719, state=running, last exit=0. `com.cak.studio-production`은 PID 39165를 유지했다.
- LaunchAgent plist·기존 환경변수·키·예산은 수정하지 않았다. discovery 활성화 플래그는 없는 상태를 유지하므로 일반 추천은 기존 경로다. 이번 후속 확인의 새 LLM/JEV 호출은 **0회**다.

앞선 자동 승인 검토 거절은 실행 전이었다. 이번에는 정확한 운영 교체 범위에 대한 사용자 승인을 받은 후 정상 실행했다. 이전 실패/거절 기록을 삭제하지 않았다.

비밀 없는 작업 로그: 지정 iCloud 작업 루트의 `commerce-automation-kit/shopshorts-native-review-20261005/approved-rollout.py`, `approved-rollout.log`, `production-smoke.log`. DB/비밀 백업은 서버 안에만 보관했다. iCloud 동기화 완료는 확인하지 않았다.
