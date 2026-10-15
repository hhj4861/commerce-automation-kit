# Hanmadi 공통 Flutter 클라이언트

시안 03을 구현하는 웹·Android·iOS 클라이언트. 기존 Next 서버가 인증·자료·학습 기록·AI·음성의 단일 원본이다. 서버 키를 Flutter에 넣지 않는다.

## 실행

- SDK: Flutter 3.47.7 / Dart 3.13.5, framework `abaf9c523780a608bd46686fd5e53740a07077f8`.
- `flutter pub get --enforce-lockfile`, `flutter analyze`, `flutter test`.
- Android/iOS: `flutter run --dart-define=HANMADI_API_ORIGIN=https://hanmadi-lake.vercel.app`. 로컬 에뮬레이터는 지원되는 loopback 주소만 HTTP 허용하며 운영은 HTTPS다.
- 앱은 시스템 브라우저의 기존 Google·아이디 로그인을 사용한다. 고정 `hanmadi://auth` 복귀 + S256 PKCE, 120초 일회용 코드, 14일 학습자 전용 세션. 토큰은 키체인/Android 보안 저장소에만 저장한다. 브라우저 세션 쿠키를 복사하지 않는다.
- **서버 앱 인증은 기본 OFF**: 승인된 배포에서 `HANMADI_NATIVE_CLIENT_ENABLED=true`와 기존 AUTH_SECRET·Redis를 준비해야 한다. 관리자 배포에서는 항상 차단된다. iOS/Android 서명·스토어 등록은 별도다.

## 웹

기존 웹 `/study`는 유지한다. Flutter 웹은 같은 원본의 `/app/`에서 기존 HttpOnly 쿠키와 API를 사용한다.

프로젝트 루트에서 `HANMADI_FLUTTER_BUILD_OUTPUT=<작업 산출물 경로> FLUTTER_BIN=<SDK>/bin/flutter node apps/hanmadi/scripts/build-flutter-web.mjs --stage`를 실행한 다음 Next를 빌드한다. Flutter 프로젝트가 원본이고 `public/app`은 Git에서 제외하는 빌드 결과다. 승인된 `deploy/hanmadi` GitOps는 고정 Flutter SDK로 먼저 빌드·stage한 뒤 기존 Vercel 원격 빌드를 실행한다. `.vercelignore`가 Flutter 산출물을 업로드에 포함하고 비밀·로컬 상태를 제외한다. 관리자 배포에는 Flutter 빌드를 추가하지 않는다. 실제 운영 반영은 PR·배포 승격 승인이 필요하다.

웹은 4개 공통 메뉴와 회화/단어/음악, PC 사이드바를 제공한다. 음악의 스터디 복귀는 이전 회화/단어 선택을 복원한다. 연습 구간·기록은 서버에 저장하고, 화면 단계·대화·입력 초안은 실행 중 메모리에 유지한다. 새로고침하면 대화 초안은 사라진다.

## 검증

`HANMADI_E2E_ARTIFACTS=<전용 산출물 경로> node scripts/flutter-client-e2e.mjs` (apps/hanmadi에서 실행). 실제 로컬 Next·저장소·Flutter release를 연결하며 AI는 결정적 fixture다. Flutter 웹은 탭 전환 후 편집기 포커스와 의미 구조 갱신을 기다린 뒤 입력을 검증한다. 운영 모델 품질이나 실제 Google 계정 로그인 검증과 구분한다.

CI는 고정 SDK로 웹 release, Android debug, iOS 무서명 컴파일을 실행한다. 로컬 iOS 빌드에는 전체 Xcode가 필요하다. 실제 단말의 마이크·시스템 브라우저 복귀·서명 배포는 단말 검증이 필요하다.
