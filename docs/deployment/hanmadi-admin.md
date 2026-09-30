# Hanmadi Admin GitOps

관리자 배포는 학습 앱과 별도의 `hanmadi-admin` 프로젝트다. 소스와 저장 계약은 `apps/hanmadi`에서 공유하고 `HANMADI_DEPLOYMENT=admin`으로 관리자 경로만 제공한다. 관리자 화면·로그인·세션 쿠키는 별도 호스트에서 동작한다. 학습 자료와 번역 후보를 연결하려면 두 프로젝트가 동일한 Redis를 사용해야 한다. 학습 앱의 프로젝트·배포 브랜치는 변경하지 않는다.

| 항목 | 관리자 | 학습 앱 |
|---|---|---|
| 배포 브랜치 | `deploy/hanmadi-admin` | `deploy/hanmadi` |
| Vercel 프로젝트 | `hanmadi-admin` / `prj_nAbFTwdgyPZkwhJOcyZ73hWiEoKE` | `hanmadi` / `prj_xJ5tTXyMYNV6qL1fVnWxFBuIRoRf` |
| 주소 | `https://hanmadi-admin.vercel.app` (도메인 예약, 미배포) | `https://hanmadi-lake.vercel.app` |
| 실행 모드 | `HANMADI_DEPLOYMENT=admin` | 기존 기본값 |
| 중앙 CI 키 | `CAK_HANMADI_ADMIN_DEPLOY_VERCEL_TOKEN` | 기존 `CAK_DEPLOY_VERCEL_TOKEN` 계약 유지 |

## 배포 흐름

1. 기능 PR을 검증하고 승인받아 `main`에 머지한다.
2. `main` → `deploy/hanmadi-admin` 승격 PR을 만들고 명시적 승인 후 머지한다.
3. 기존 `Platform deployment`가 관리자 대상만 선택한다. 브랜치가 보호되지 않았거나 더 새로운 커밋이 있으면 중단한다. 최초 브랜치 생성은 배포하지 않는다.
4. GitHub OIDC를 Cloudflare broker에서 확인해 관리자 CI 키만 받는다. 저장소 ID·소유자 ID·보호된 정확한 ref·workflow·subject·GitHub-hosted runner·push/manual 이벤트가 모두 일치해야 한다. 다른 앱 키나 런타임 키를 받지 않는다.
5. 필수 운영 환경변수 이름을 확인하고 테스트 → Vercel production pull → build → prebuilt deploy를 실행한다. 토큰은 프로세스 환경으로만 전달한다.
6. 운영 주소의 `/api/deployment`가 `hanmadi-admin`과 triggering SHA를 반환하고, 로그인 페이지 200·비로그인 관리자 API 403·학습 API 404인지 확인한다. 실제 운영 검증이 실패하면 workflow도 실패한다. 자동 롤백은 추가하지 않았다.

Vercel native Git 배포는 기존 `vercel.json`에서 비활성화돼 있다. 관리자 프로젝트는 Git 연결 없이 Actions에서 명시적 프로젝트 ID로 배포한다. 웹 배포는 LiteLLM/Dify 서버나 학습 작업을 실행하지 않는다.

## 2026-09-30 실제 확인 상태

- Vercel `dean-10`에 관리자 프로젝트를 생성했고 `hanmadi-admin.vercel.app` 도메인 등록을 확인했다. 운영 배포는 아직 없다.
- `deploy/hanmadi-admin`을 검증된 main `1b0c3a25d5556c3d3619bff7ca870d60f6034bce`에서 초기화했다.
- 현재 GitHub 자격은 `push=true`, `admin=false`, `maintain=false`다. 브랜치 보호 설정은 404로 거절됐으며 **아직 보호되지 않았다**. 배포 코드의 보호 조건을 제거하거나 우회하지 않는다.
- CI 토큰 생성은 Vercel CLI OAuth 권한에서 `Cannot create tokens for this app (403)`으로 거절됐다. 같은 이름의 토큰이 생성되지 않았음을 조회했다. 기존 로그인 토큰이나 Replay CI 키를 재사용하지 않았다.
- 운영 broker에는 Replay CI 키만 등록돼 있고 CAK 배포 ref 허용 목록은 비어 있다. 관리자 정책·키 바인딩은 아직 운영 broker에 적용하지 않았다.
- 기존 Hanmadi의 운영 환경변수는 Sensitive라 원문을 다시 읽을 수 없다. 소유자 PIN·Redis 설정을 새 프로젝트로 전달하는 작업은 자동 승인 검토에서 명시적 승인 부족으로 거절됐다. 해당 작업은 실행되지 않았으며 운영 로그인·자료 변경도 하지 않았다.

## 활성화에 필요한 설정

저장소 관리자가 `deploy/hanmadi-admin`에 PR 필수, `Platform GitOps verification` 필수, force push·삭제 금지를 설정한다. 관리자에게도 적용한다. GitHub 인증 계정이나 보호 규칙을 우회하지 않는다.

프로젝트 범위를 `hanmadi-admin`으로 제한한 전용 Vercel CI 토큰을 발급해 Cloudflare Secrets Store `de2c8d7c3e9c4067acc22212522c0fc4`의 `CAK_HANMADI_ADMIN_DEPLOY_VERCEL_TOKEN`에 등록한다. 키를 GitHub Secrets에 중복 복사하지 않는다. 운영자 비공개 0600 JSON의 키 이름은 `HANMADI_ADMIN_DEPLOY_VERCEL_TOKEN`이며 기존 `apps/credential-broker/admin.mjs register-deploy`를 사용한다. 값은 채팅·로그·Git·iCloud 작업 폴더에 남기지 않는다.

키 등록 후 `wrangler.json`의 Secrets Store binding `SS_HANMADI_ADMIN_DEPLOY_VERCEL_TOKEN`과 `GITHUB_DEPLOY_ALLOWED_REFS`에 정확히 `refs/heads/deploy/hanmadi-admin`을 추가하고 검증된 broker를 배포한다. 기존 ref·Replay 설정·다른 서비스 binding을 보존한다. 현재 PR은 이 운영 활성화가 끝났다고 주장하지 않는다.

관리자 Vercel **production**에 아래 설정이 필요하다. 비밀은 Vercel 대시보드나 승인된 비공개 파일로 주입한다. 기존 앱 환경변수를 삭제·수정하지 않는다.

| 이름 | 설정 |
|---|---|
| `HANMADI_DEPLOYMENT` | `admin` (일반 설정) |
| `HANMADI_APP_URL` | `https://hanmadi-lake.vercel.app` (일반 설정) |
| `AUTH_SECRET` | 관리자 전용 새 서명키 |
| `TUTOR_PINS` | 승인된 소유자 계정; 초대 튜터는 관리자 로그인 불가 |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | 기존 Hanmadi와 동일한 저장소 |
| `YOUTUBE_API_KEY` | 공식 검색 API 키 |
| `LITELLM_BASE_URL`, `LITELLM_API_KEY`, `LITELLM_MODEL` | 관리자 자료 생성에 허용된 가상 키와 모델 |

임베딩·파인튜닝 변수는 기존 선택 설정을 따른다. 이 작업에서 유료 학습을 활성화하지 않는다. `HANMADI_RELEASE_SHA`는 각 배포에서 주입한다.

설정이 모두 준비된 뒤 승인된 승격 PR을 머지하고 Actions URL·커밋·운영 주소·로그인/자료 조회 결과를 기록해야 활성화 완료다. 아직 준비되지 않았다면 운영 배포를 실행하지 않는다.

공식 근거: [Vercel 프로젝트 범위 토큰](https://vercel.com/docs/rest-api/authentication/create-an-auth-token), [Vercel Git 설정](https://vercel.com/docs/git/vercel-for-github), [Sensitive 변수](https://vercel.com/academy/optimize-your-vercel-account/sensitive-env-vars).

## 구현 검증

- Hanmadi 단위 테스트 93개, 배포·broker 테스트 89개, 배포 Python 테스트 8개 통과.
- 전체 학습 앱 E2E와 관리자 전용 E2E 통과. 검색 일괄 선택·영상별 일괄 초안·번역 후보 검수·자료 버전·평가·파인튜닝 관리 흐름은 fixture provider로 검증했으며 유료 학습을 실행하지 않았다.
- 관리자 모드 production build, TypeScript 검사 통과. ESLint 오류 0개, 기존 경고 4개.
- 관리자 로그인·소유자 권한·학습자 경로 차단·학습 앱 연결과 390/1440px 화면을 확인했다. 로컬 산출물은 사용자 지정 iCloud 작업 루트의 `commerce-automation-kit/hanmadi-admin-gitops/`에 저장했다. 운영 검증과는 별개다.
