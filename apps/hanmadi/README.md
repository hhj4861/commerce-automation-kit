# Hanmadi — Korean, one phrase at a time

한마디씩, 확실하게. Preply 한국어 튜터를 위한 무자본 정적(SSG) 웹앱 — 체험수업 덱, 라이브 노트, 학습 팩 라이브러리, 학생별 포털까지 한 곳에서.

## 스택

Next.js (App Router, 정적 SSG) · React · TypeScript · Tailwind CSS v4. 외부 API 의존 없음 — 콘텐츠는 전부 빌드 타임에 `data/`에서 읽고, `/live`·학생 포털의 체크 상태는 브라우저 `localStorage`에만 저장된다.

## 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 정적 빌드
```

## 라우트

| 경로 | 용도 |
| --- | --- |
| `/` | 튜터 허브 — 수업 직전 30초 런처 |
| `/trial` | 체험수업 화면공유 덱 (1화면 1스텝) |
| `/live` | 라이브 노트 — 실시간 받아쓰기·교정, 마크다운 복사 |
| `/library` | 학습 팩 목록 (레벨/카테고리 필터) |
| `/library/[packId]` | 팩 상세 — Teaching Mode 토글 |
| `/s/[slug]` | 학생별 포털 (비공개 링크) |

## 콘텐츠 추가

- **새 팩**: `data/packs/demo.ts`를 복사해 `data/packs/{id}.ts` 생성 → `data/packs/index.ts`에 import 등록. 블록 타입 설명은 `data/types.ts` 주석 참조. (팩은 코드 = 재배포 필요)
- **새 학생 / 수업 기록**: 코드 수정 없이 화면에서 처리한다.
  `/admin/students`에서 학생 등록 → 수업 후 `/live`에서 **"학생 포털에 저장"** → 학생 포털에 즉시 반영.
  저장한 새 표현·교정 문장은 학생 포털에서 **복습 퍼즐로 자동 생성**된다 (`lib/puzzles.ts`).
  `data/students/index.ts`의 emma는 저장소가 비었을 때만 보이는 샘플이다.

## 배포

Vercel 무료 티어 + Upstash Redis 무료 티어.

### Redis 연결 (배포 시 필수)

튜터·초대·학생·수업 기록이 저장소에 들어간다. 로컬은 `.data/tutors.json` 파일로 자동 폴백하지만,
**서버리스는 파일시스템이 요청마다 초기화되므로 배포 환경에서는 Redis가 반드시 필요하다.**

1. [upstash.com](https://upstash.com) 무료 가입 → Redis 데이터베이스 생성 (Free tier: 일 1만 명령, 256MB — 이 용도에는 충분)
2. 대시보드의 **REST API** 탭에서 `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` 복사
3. Vercel → Settings → Environment Variables에 두 값 등록 → Redeploy

Vercel Marketplace의 Upstash 통합을 쓰면 `KV_REST_API_URL` / `KV_REST_API_TOKEN`이 자동 주입되는데,
`lib/store.ts`가 두 이름 쌍을 모두 인식하므로 어느 쪽이든 그대로 동작한다.
SDK 설치 없이 REST(fetch)만 쓰므로 추가 의존성은 없다.

로컬에서도 Redis를 쓰려면 `.env.local`에 같은 두 값을 넣으면 된다 (넣지 않으면 파일 저장소 사용).

## 튜터 인증 & 초대

학생 공개 경로(`/s/*`, `/library*`)를 제외한 모든 페이지는 미들웨어가 서버에서 잠근다.
튜터는 `/login`에서 PIN을 입력하면 HMAC 서명 쿠키(60일)로 통과한다.

### 두 종류의 튜터

| 구분 | 등록 방법 | 권한 |
|------|----------|------|
| 소유자(owner) | 환경변수 `TUTOR_PINS`에 `이름:PIN` | 전체 + 다른 튜터 초대/삭제 (`/admin/tutors`) |
| 초대 튜터 | 소유자가 보낸 초대 메일 링크에서 직접 PIN 등록 | 수업 도구 전체 (관리 화면 제외) |

### 초대 → 등록 흐름

1. 소유자가 `/admin/tutors`에서 이메일 입력 → 초대 생성
2. 초대 메일 발송 (`RESEND_API_KEY` 설정 시). 미설정이면 화면에서 링크를 복사해 직접 전달
3. 받은 사람이 링크(`/register?token=…`)를 열면 초대된 이메일이 표시됨 — 링크 소지 자체가 메일 인증
4. 이름 + PIN(숫자 6~12자리) 등록 → 즉시 로그인
5. 링크는 7일 유효, 1회용. 소유자가 언제든 초대 취소·튜터 삭제 가능 (삭제 즉시 해당 PIN 로그인 차단)

### 환경변수

```bash
TUTOR_PINS=대표:072424        # 소유자 (쉼표로 여러 명)
AUTH_SECRET=랜덤문자열         # 세션 서명 키 (바꾸면 전원 재로그인)
RESEND_API_KEY=re_xxx         # 선택 — 초대 메일 발송
MAIL_FROM=Hanmadi <noreply@도메인>
```

- PIN은 튜터 간 중복 금지. 등록 PIN은 scrypt 해시로 저장(평문 미저장)
- 로그인 실패 8회 시 5분 잠금

### 저장소

튜터·초대·학생·수업 기록은 모두 `lib/store.ts`를 통해 저장된다.
드라이버는 환경변수로 자동 선택된다 — Redis 키가 있으면 Upstash REST, 없으면 `.data/tutors.json` 파일.
연결 방법은 위의 **배포 → Redis 연결** 참조.

Redis 키 구조 (해시 3개):

| 키 | field | value |
|----|-------|-------|
| `hanmadi:tutors` | 튜터 이름 | 등록 튜터 (PIN은 scrypt 해시) |
| `hanmadi:invites` | 토큰 해시 | 초대장 |
| `hanmadi:students` | 학생 slug | 학생 + 수업 기록 전체 |

**보관 정책: TTL 없음(영구 보관).** 쓰기마다 `HSET`과 `PERSIST`를 한 요청으로 함께 보내
어떤 경로로도 만료가 붙지 않게 보장한다. 초대장의 7일 제한은 `Invite.expiresAt`
애플리케이션 로직으로만 판단하며, 데이터 자체는 삭제하기 전까지 남는다.
