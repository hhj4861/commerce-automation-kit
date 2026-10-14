# Shopshorts native review 연결·배포 준비 — 2026-10-05

## 구현과 검증

main c7ef3e2(PR #148 승인 머지)를 기준으로 Shopshorts 추천 adapter에 `DISCOVERY_REVIEW_MODE=native-llm-v1` 전달을 추가했다. `DISCOVERY_WORKFLOW=research-v2`와 함께 운영자 backend 설정으로 명시해야 한다. 기본값/빈 값은 기존 흐름을 유지하며 잘못된 조합은 HTTP·모델 호출 전에 실패한다. 브라우저 입력은 검수 정책을 바꾸지 못한다.

- 실제 로컬 HTTP·Python 서비스·SQLite를 통해 Codex/Claude 각각 research→draft→review 전달, 선택 모델 유지, 원문 추천 매핑, 같은 요청의 중복 호출 방지, 검수 직전 계정 철회 차단 확인.
- 관련 Node 테스트 60개 통과. 계정 테스트 파일은 `better-sqlite3` 미설치로 최초 시작 실패했으며, 선언된 기존 의존성 설치 후 해당 파일만 다시 실행해 16개 통과. 합계 **76개 통과**. 외부 JEV/LLM 호출은 0회다.
- 로그: 지정 iCloud 작업 루트 `commerce-automation-kit/shopshorts-native-review-20261005/`의 `adapter-tests.log`, `regression-tests.log`, `account-tests.log`. 최초 의존성 오류를 보존했다.
- 모델 응답은 fixture이므로 이번 테스트는 연결·상태 검증이며 새 의미 품질 실측이 아니다. 실제 의미 검증은 기존 [v2.6 고정 입력 보고서](20261005-jev-v26-final.md)에 있다.

## 서버 상태와 준비 결과

운영 서버 `replay-live-508202/shared-ai/us-central1-a`의 기존 discovery 컨테이너는 healthy다. DB quick_check=ok, 기존 요청 complete 3 / held 4 / 진행 중 0을 관찰했다. 데이터·비밀은 `/opt/shared-ai/discovery`에 있고 기존 릴리스의 symlink가 해당 위치를 가리킨다. 다른 서비스 컨테이너는 교체하지 않았다.

승인·머지된 **c7ef3e2c411785c8e852f24a54ea867016370dc4**의 discovery 및 기존 Jev SDK만 Git archive로 서버에 준비했다. 새 릴리스는 `/opt/shared-ai/releases/discovery-c7ef3e2c411785c8e852f24a54ea867016370dc4`, 이미지 태그는 `cak-discovery:c7ef3e2`다. 이 이미지는 아직 운영에 연결되지 않았다.

- 이미지 빌드 exit 0, runtime import 출력: `discovery-v1.2 discovery-v2.2 discovery-v2.6`.
- 시스템 CA 인증서 저장소 비어 있지 않음을 확인했다.
- Dockerfile.dockerignore의 개별 모듈 줄 누락을 의심했으나 기존 CI BuildKit의 COPY/import 통과 및 서버 이미지 검사를 확인했다. 상위 디렉터리 포함 규칙이 있어 누락 문제로 확정하지 않았고 Docker 설정은 수정하지 않았다.
- 준비한 archive: 286720 bytes, SHA256 `0cbb5027cc0d646587bf5023af8abc0289d6cced269f3d56f5fbe92d85cb73d9`.

## 미실행·승인 필요

자동 승인 검토가 운영 컨테이너 교체 명령을 **실행 전에 거절**했다. 이유는 “PR 머지와 배포 준비 승인은 있었지만 정확한 운영 교체의 명시적 승인 미확인” 및 서비스 중단·오동작 위험이다. 따라서 운영 백업/설정 링크/컨테이너 교체는 실행되지 않았다. 운영은 종전 v1.1 이미지 상태이며 새 Shopshorts worker 코드·활성화 설정·Pages 배포도 미적용이다.

검토 가능한 배포 범위: 진행 중 요청 0 재확인 → 서버 내부 SQLite 백업과 quick_check → 기존 비밀·데이터를 같은 경로에 연결 → discovery 서비스만 위 승인 이미지로 교체 → 버전/health/인증 경계/다른 컨테이너 불변 확인. 실패 시 이전 compose·이미지로 복귀하며 데이터/계정 정보를 삭제하지 않는다. 사용자에게 이 정확한 운영 교체 승인을 받은 뒤 수행한다.

앱 연결은 이 후속 PR의 별도 머지 승인이 필요하다. 이후 worker 릴리스를 갱신하고 제한된 실제 계정·화면 E2E가 통과한 뒤 활성화한다. Pages 배포는 로컬 account worker 교체를 대신하지 않는다. 이번 기록은 배포 완료 또는 브라우저 E2E 완료를 뜻하지 않는다.
