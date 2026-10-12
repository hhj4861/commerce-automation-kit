# 서버리스 전환 Phase 1 운영 반영 기록 (2026-10-09)

대상: `docs/plans/20261009-serverless-p1-foundation.md`의 Task 6. 사용자 승인("응", 2026-10-09)을 받아 6-1~6-5를 실행했다. 비밀값은 출력하거나 기록하지 않았다.

| 단계 | 결과 |
|---|---|
| 6-1 state 버킷 | `gs://replay-live-508202-tfstate` 생성. us-central1, 객체 버전 관리, 공개 접근 차단(enforced), 균일 버킷 수준 접근 |
| 6-2 state 이전 | `terraform init -force-copy`로 로컬 사본(0600)을 `shared-ai-host/default.tfstate`(39,025바이트)로 옮겼다. `terraform state list`는 16개다. Terraform이 남긴 로컬 `terraform.tfstate`(비워짐)와 `.backup`(권한 644로 생성됨), 스크래치패드 사본을 바로 지웠다. iCloud 원본은 내용을 그대로 두고 이름만 `terraform.tfstate.migrated-20261009`로 바꿨다. plan은 `11 to add, 0 to change, 0 to destroy`였다 |
| 6-3 shared-ai-host apply | 11개 추가: API(artifactregistry·secretmanager), Artifact Registry `shared-ai`, 시크릿 컨테이너 8개. state는 27개가 됐다. 적용 뒤 공개 edge `/health` 200, `/llm`·`/discovery` 401(키 없음), VM은 RUNNING·e2-small, 레지스트리 태그 불변 설정 켜짐, 시크릿 8개를 확인했다 |
| 6-4 WIF apply | 빈 `gcp-identity` prefix로 초기화했다. plan `7 to add`를 그대로 적용해 7개를 추가했다: STS·IAM Credentials API, pool `cak-images`, provider `github-images`, SA `cak-shared-ai-images`, 연동 바인딩, `shared-ai` 레지스트리 writer 권한 |
| 6-5 저장소 변수 | `GCP_IMAGES_WIF_PROVIDER`=`projects/581413260951/locations/global/workloadIdentityPools/cak-images/providers/github-images`, `GCP_IMAGES_SERVICE_ACCOUNT`=`cak-shared-ai-images@replay-live-508202.iam.gserviceaccount.com`. 둘 다 비밀이 아니다 |

## 비용 영향

모두 무료 범위이거나 과금 0이다. 버킷에는 state 수십 KB만 있어 Always Free 안이다. 시크릿 컨테이너는 버전이 없어서, 레지스트리는 이미지가 없어서 과금되지 않는다. WIF·SA는 무료다.

## 주의 (머지 전까지)

`main`의 shared-ai-host 코드에는 아직 backend 블록이 없고 `machine_type` 기본값이 e2-standard-2다. PR #169가 머지될 때까지 다른 checkout에서 이 모듈의 terraform을 실행하지 않는다. 실행하면 빈 로컬 state로 전체 생성을 시도하게 된다.

## 6-6 이미지 빌드

사용자 승인("제가 머지 후 빌드까지")으로 PR #168(`4d289a9`)과 #169(`8da0101`)를 merge commit으로 머지했다(#169는 base를 main으로 바꾼 뒤 머지). 이어서 main에서 빌드를 실행했다.

1. **첫 실행은 둘 다 실패했다**(run 37901219891, 37901223209).
   - WIF 토큰 교환은 성공했지만 SA를 사용할 때 `iam.serviceAccounts.getAccessToken` 권한 거부가 났다.
   - 원인은 subject 형식이다. 이 저장소는 GitHub OIDC **immutable subject**를 쓴다(`use_immutable_subject: true`, prefix `repo:hhj4861@71001056/commerce-automation-kit@1310729493`). 그래서 실제 `sub`는 `repo:hhj4861@71001056/commerce-automation-kit@1310729493:ref:refs/heads/main`인데, 바인딩은 기본 형식(`repo:hhj4861/commerce-automation-kit:ref:...`)이었다. 계획에서 `TODO(D1)`로 남긴 항목이다.
2. **바인딩을 고쳤다.**
   - 테스트를 먼저 바꿔 실패를 확인한 뒤 수정했다(`test_image_builder_can_only_write_the_shared_ai_repository`).
   - plan은 `1 to add, 0 to change, 1 to destroy`(바인딩 교체)였고 그대로 적용했다.
3. **두 번째 실행은 둘 다 성공했다**(run 37901856359, 37901859818).

| 이미지 | 태그 | digest |
|---|---|---|
| `us-central1-docker.pkg.dev/replay-live-508202/shared-ai/edge-staging` | `8da0101c813eaa7fb351c1cd7f3be3a0a77286e7` | `sha256:3ab3ac02426f806b398da4e68dcf9e5775727d1318a09906dd9598099f0a46a0` |
| `us-central1-docker.pkg.dev/replay-live-508202/shared-ai/litellm-staging` | `8da0101c813eaa7fb351c1cd7f3be3a0a77286e7` | `sha256:2c3f70cdbc08cac6bbc639905b1840740b26288425b095e43c0075c95fc39fb6` |

Phase 5에서 Cloud Run 배포 신원을 만들 때도 이 저장소의 subject는 immutable 형식(`repo:hhj4861@71001056/commerce-automation-kit@1310729493:ref:<ref>`)이다.

## 남은 단계

- 6-6b(선택): 다른 브랜치의 토큰이 거부되는지 실측한다.
- 6-7: Neon 스테이징 가입과 DB URL 입력(사용자).
