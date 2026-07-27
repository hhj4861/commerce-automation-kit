# Cloud Run 배포 가이드

Hanmadi는 SSR·API·미들웨어를 쓰는 Next.js 앱이라 컨테이너로 배포한다.
로컬에 Docker가 없어도 **Cloud Build가 이 리포의 `Dockerfile`로 빌드**한다.

## 1. 사전 준비 (한 번만)

```bash
# 배포할 프로젝트 선택 (개인 프로젝트 권장 — 회사 프로젝트 X)
gcloud config set project <PROJECT_ID>

# 필요한 API 활성화 (deploy가 자동으로 물어보기도 한다)
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

## 2. 배포

서울 리전(`asia-northeast3`), 공개 웹앱(앱 자체 PIN 인증이 있으므로
`--allow-unauthenticated`). 환경변수는 **런타임**에 주입한다(이미지에 안 굽는다).

```bash
gcloud run deploy hanmadi \
  --source . \
  --region asia-northeast3 \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 --memory 512Mi \
  --min-instances 0 --max-instances 3 \
  --set-env-vars "^@@^AUTH_SECRET=<생성한 랜덤 64자>@@TUTOR_PINS=대표:072424@@UPSTASH_REDIS_REST_URL=https://rare-cattle-35096.upstash.io@@UPSTASH_REDIS_REST_TOKEN=<토큰>"
```

- `^@@^` 는 구분자를 `@@`로 바꾸는 표기(값에 쉼표가 있어도 안전).
- 배포가 끝나면 `https://hanmadi-xxxx.a.run.app` URL이 출력된다.

### 프로덕션 환경변수 체크

| 변수 | 값 | 비고 |
|------|-----|------|
| `AUTH_SECRET` | 랜덤 64자(hex) | `openssl rand -hex 32`. 바꾸면 전원 재로그인 |
| `TUTOR_PINS` | `이름:PIN,…` | **6자리 이상** 권장 (현재 dev는 4자리 `0724`) |
| `UPSTASH_REDIS_REST_URL` | Upstash REST URL | 이미 있음 |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST 토큰 | 이미 있음 |
| `RESEND_API_KEY` | (선택) | 초대 메일 발송 시 |
| `MAIL_FROM` | (선택) | 예: `Hanmadi <noreply@도메인>` |

`.env.local`은 로컬 전용이라 배포에 쓰이지 않는다(`.dockerignore`·`.gitignore`로 제외).
프로덕션 값은 위 `--set-env-vars`로만 넣는다.

## 3. 재배포

코드 수정 후 같은 명령을 다시 실행하면 새 리비전이 뜬다.
환경변수만 바꾸려면:

```bash
gcloud run services update hanmadi --region asia-northeast3 \
  --update-env-vars "TUTOR_PINS=대표:072424,수민:139482"
```

## 보안 노트

- 시크릿을 `--set-env-vars`로 넣으면 배포 이력에 남는다. 더 엄격하게 하려면
  **Secret Manager**를 쓰고 `--set-secrets "AUTH_SECRET=hanmadi-auth-secret:latest"` 형태로 참조한다.
- 앱은 HTTPS(Cloud Run 기본)에서 `secure` 쿠키를 쓴다(`NODE_ENV=production`).
- 학생 포털·체험수업·레벨진단은 의도적으로 공개. 그 외는 미들웨어가 PIN 세션으로 보호.
