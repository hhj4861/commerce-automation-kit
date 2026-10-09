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

## 남은 단계

- 6-6: PR #168 → #169 머지 뒤 이미지 빌드(`litellm-staging`, `edge-staging`)를 실행하고 digest를 기록한다(승인 필요).
- 6-6b(선택): 다른 브랜치의 토큰이 거부되는지 실측한다.
- 6-7: Neon 스테이징 가입과 DB URL 입력(사용자).
