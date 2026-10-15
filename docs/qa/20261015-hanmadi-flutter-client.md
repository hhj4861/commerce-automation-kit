# Hanmadi Flutter 공통 클라이언트 검증

## 범위와 반영 상태

- 디자인 시안 03 기준으로 신규 `apps/hanmadi-flutter`를 구현. 웹·Android·iOS 플랫폼 소스와 4개 메뉴, 회화/단어/음악 학습·저장·복습, AI 대화, 번역, 보관함, 음성을 연결했다.
- 기존 Next/Redis 자료·계정·학습 기록을 단일 원본으로 재사용한다. 카탈로그 API에서 원본 커리큘럼·단어 팩·검수 자료·음악 교육 자료를 내려준다. Flutter에 서버 비밀이나 별도 학습 DB를 만들지 않는다.
- 기존 `/study` 운영 화면은 유지. 신규 웹 `/app/`은 Flutter 산출물을 명시적으로 stage한 빌드에서만 제공한다. 현재 운영 배포·전환은 수행하지 않았다.
- 앱 인증은 `HANMADI_NATIVE_CLIENT_ENABLED=true`로 활성화하기 전까지 기본 OFF이며 admin 배포에서는 항상 OFF다. 기존 Google 웹 로그인/아이디 로그인을 시스템 브라우저에서 재사용하고 S256 PKCE 일회용 코드로만 학습자 세션을 발급한다. 120초 코드, 14일 세션, 매 요청의 공유 저장소 폐기 확인, 앱 로그아웃 즉시 폐기.
- 최초의 서명만 검사하는 Origin 변경안은 자동 승인 검토에서 거절됐다. **기존 Origin 함수는 변경하지 않았다.** 좁은 학습 API allowlist에만 서명·만료·서버 폐기 확인을 먼저 수행하는 별도 경계를 추가했다. 거절된 방식은 구현하지 않았다.

## 실제 확인

| 경계 | 결과 | 근거 |
| --- | --- | --- |
| Flutter 정적 분석 | 통과 | `flutter analyze`: No issues found |
| Flutter 단위/위젯 | 11개 통과 | 320/390/1440px 메뉴·입력 유지, 음악 이전 탭 복귀·단계 보존, 오류 시 입력 보존·중복 요청 차단, WAV 헤더, 화면 종료 후 늦은 음성 재생 취소 |
| 기존 서버 회귀 | 279개 통과 | npm test, 앱 PKCE·재사용·만료·변조·기본 OFF·관리자 차단·폐기 후 Origin 경계 거부 포함 |
| 서버 타입/린트 | 통과 | Next route types + 로컬 TypeScript 5.9.3, 변경 파일 ESLint |
| Flutter 웹 release | 통과 | 실제 engine compile, `/app/` base href |
| Android debug | 통과 | ARM64 Mac 기존 Android SDK/JDK21, APK 생성 |
| GitOps 회귀 | 39개 통과 | 기존 대상/브랜치/자격 분리 정책 보존, 두 workflow YAML 파싱 통과 |
| Next 운영 빌드 | 통과 | 신규 app-login/catalog/client-auth 포함 |
| 실제 API 공유 기록 | 통과 | 로컬 Next + synthetic 계정: 앱 세션 저장 → 같은 웹 계정에서 확인, 토큰 로그아웃 → 401, Origin 없는 쿠키 POST → 403 |
| 웹 사용자 전체 흐름 | 통과 | 실제 로그인 폼 → Flutter release → 음악 진입/스터디 복귀 → AI 대화 → 번역 → 보관함, 모바일 390px/PC 1440px 화면, JS 오류 없음. AI는 local fixture |
| iOS 컴파일 | 통과 | GitHub macos-latest, run 38693905446/job 116285914030, release --no-codesign 성공. 로컬 Mac은 CLT만 존재 |
| 실제 단말·Google 계정 | 미검증 | 마이크 권한·오디오 장치·앱 링크 복귀·스토어 서명은 실제 단말 확인이 필요 |

## 발견·수정

- 320px 번역 언어 선택 폭 넘침, PC 메뉴의 Material 선택 표시, 모델 변경 후 화면 갱신 누락을 테스트로 발견해 수정.
- 입력 중 build에서 TextEditingController 값을 덮어쓰는 코드를 제거. 컨트롤러 listener로 메모리 초안을 동기화하며 실패한 요청은 입력·대화 기록을 유지한다.
- 일부 일본어 글자가 외부 fallback 폰트 지연 시 표시되지 않아 공식 NotoSansKR(일본어·한국어·라틴 포함)와 NotoSansThai를 앱 자산에 포함. OFL 라이선스 동봉. 각 variable font의 regular 인스턴스로 생성했다.
- 음악 상단 고정 `스터디로`와 공통 메뉴를 유지. 회화/단어 중 마지막 탭으로 복귀하며 학습 구간은 서버, 화면 단계는 앱 메모리에 보존한다. 서버가 복습 단계면 새로 로드해도 복습 화면을 복원한다.
- 음성은 원본 응답 MIME을 보존하고 PCM16 mono 16k 입력을 WAV로 전송. 50초 녹음 제한, 화면 종료/메뉴 이동 시 녹음 정리.

## 산출물·재현

- SDK `/Users/admin/.local/share/flutter-sdk`, Flutter 3.47.7 / Dart 3.13.5, framework `abaf9c523780a608bd46686fd5e53740a07077f8`.
- 로컬 산출물: 사용자 지정 iCloud `gpt 작업/commerce-automation-kit/hanmadi-flutter-client-20261015/`.
- `web/`: 웹 release, `flutter-build/app/outputs/flutter-apk/app-debug.apk`: Android 디버그 APK.
- `backend-tests.log`, `next-build.log`, `e2e/`의 화면·결과·서버 로그. AI 호출은 로컬 fixture이며 운영 키·유료 모델을 사용하지 않았다. 실패 결과와 성공 결과를 구분한다.
- `apps/hanmadi-flutter/README.md`의 빌드/실행 절차 참조. Git에는 소스·잠금 파일·폰트·라이선스만 보관한다.

## 남은 운영 경계

PR별 사용자 승인 전 main/배포 브랜치 머지·운영 활성화를 하지 않는다. 승인된 deploy/hanmadi GitOps에 고정 SDK Flutter 빌드·stage를 추가하고 `.vercelignore`로 산출물 업로드/로컬 비밀 제외를 명시했다. 관리자 배포에는 이 단계를 실행하지 않는다. 이 구성은 소스 준비이며 실제 배포 성공과 구분한다. iOS/실제 단말 검증과 배포 서명은 별도 확인 대상이다.

최종 브라우저 결과: `e2e/result.json` pass=true, CLI 정상 exit 0. 이전 실패 화면·로그는 실패로 보존하며 성공 캡처와 혼동하지 않는다. Flutter의 탭 전환 후 의미 구조 편집기 포커스/프레임 초기화와 읽기 전용 textbox 역할을 실제 DOM에 맞춰 검증했다.

CI 첫 실행(38693562574)은 shallow SHA checkout에 릴리스 태그가 없어 Flutter가 `0.0.0-unknown`으로 판정되어 의존성 단계에서 실패했다. 로컬 HEAD의 공식 태그 `3.47.7`과 해시 일치를 직접 확인했고, workflow를 해당 태그 checkout + 정확한 HEAD SHA 검증으로 변경했다. 버전·의존성을 바꾸거나 검증을 끄지 않는다. 수정 후 CI 결과는 별도 확인한다.

66daa7b CI에서 웹 분석/테스트·실제 서버 브라우저·release와 iOS 무서명 컴파일을 확인했다. 모바일→PC 전환 캡처는 하단 탭이 사라지고 두 렌더 프레임이 지난 뒤 수행하도록 보완했으며 로컬 전체 E2E가 다시 정상 exit 0으로 통과했다.

추가 배포 호환성 확인: `HANMADI_DEPLOYMENT=admin npm test`도 279개 통과했다. 관리자 배포가 공통 npm test를 실행하므로 모바일 인증 테스트 프로세스의 기본 배포 모드를 격리했다. 제품의 admin 차단은 그대로이며 해당 차단 테스트도 유지한다. 66daa7b의 Flutter 웹/Android/iOS와 기존 사용자 흐름 CI는 모두 정상 완료했다.

## 최종 확인 — 2026-10-15

실행 코드 기준 `1a4e8a736917952da049b8d67019f01bc99ef0c1`에서 다음 원격 검증이 모두 SUCCESS다.

- Flutter 웹 release·분석·10개 테스트·실제 서버 브라우저, Android debug, iOS 무서명 release: [run 38695058532](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38695058532).
- 기존 로그인·언어·회화·관리자·음악·수집곡·단어장·진단 전체 사용자 흐름: [run 38695058608](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38695058608).
- GitOps: [run 38695058658](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38695058658).
- [PR #265](https://github.com/hhj4861/commerce-automation-kit/pull/265) 검토 준비. 변경은 작업 upstream에 커밋·푸시했고 main/운영은 변경하지 않았다. 앱 인증 운영 플래그는 활성화하지 않았다.
- **남은 것**: 해당 PR의 사용자 머지 승인, 운영 승격 승인·배포 검증, 실제 단말의 Google 계정 로그인/마이크/앱 링크 복귀/서명 배포. 컴파일 성공을 실기기 검증 완료로 표현하지 않는다.

이 최종 기록은 문서만 추가하며 위에서 검증한 실행 코드·의존성·workflow를 변경하지 않는다.

## 채팅 스크롤 최종 보완

- 새 AI 답변이 추가되기 전 프레임의 스크롤 범위를 사용하던 문제를 수정했다. 레이아웃 완료 후 새 범위로 이동하며 화면이 폐기됐으면 중단한다.
- 전송 버튼 활성화 프레임과 실제 대화 2건 수신을 확인하는 회귀 테스트를 추가했다. 기존 구현은 499px 목표 중 115px까지만 이동해 실패(384px 차이), 수정본은 통과했다. 첫 테스트 시도는 입력 후 버튼 활성화 프레임을 기다리지 않은 테스트 결함도 있어 이를 먼저 보완한 뒤 전후 비교했다.
- 수정본 `flutter analyze` 오류 없음, 전체 단위/위젯 테스트 11개 통과, `git diff --check` 통과. 서버/인증/의존성/배포 경계 변경 없음.
- 이전 HEAD 220b746의 웹/Android/iOS·기존 전체 사용자 흐름·GitOps도 모두 SUCCESS 확인. 이 추가 수정의 원격 CI는 마지막 push 후 PR #265의 해당 HEAD 검사에서 확인한다. 운영·실기기 미검증 경계는 유지한다.
