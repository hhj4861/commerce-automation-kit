# JEV discovery 운영 교체 결과 — 2026-10-05

PR #151 머지와 운영 discovery 교체를 사용자에게 구체적으로 제시한 뒤 “진행해줘” 승인을 받아 실행했다. **공통 서비스는 새 버전으로 교체·검증 완료, Shopshorts 제작 워커 갱신과 실제 화면 E2E는 미완료**다.

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

- `/Users/admin/workSpace/shopshorts-production`은 확인 시 `992c1f0`이며 새 `DISCOVERY_REVIEW_MODE` 전달 코드가 없다. 서비스 교체나 main 머지가 이 제작 워커를 자동 갱신하지 않는다.
- 제작 워커를 승인된 연결 코드가 포함된 릴리스로 갱신하고, 제한된 실제 계정·브라우저 흐름에서 조사→초안→검수·철회·보류 표시를 확인해야 한다. 클라이언트 활성화 설정은 아직 바꾸지 않았다.
- 다른 플랫폼·블로그 활성화나 Pages 재배포는 이번 실행에 포함되지 않았다. 전체 JEV 연동 완료로 보고하지 않는다.

앞선 자동 승인 검토 거절은 실행 전이었다. 이번에는 정확한 운영 교체 범위에 대한 사용자 승인을 받은 후 정상 실행했다. 이전 실패/거절 기록을 삭제하지 않았다.

비밀 없는 작업 로그: 지정 iCloud 작업 루트의 `commerce-automation-kit/shopshorts-native-review-20261005/approved-rollout.py`, `approved-rollout.log`, `production-smoke.log`. DB/비밀 백업은 서버 안에만 보관했다. iCloud 동기화 완료는 확인하지 않았다.
