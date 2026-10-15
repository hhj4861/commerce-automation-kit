# Hanmadi Flutter 웹·앱 구현

- 사용자 목표: 확정 기준인 시안 03(음악 복귀 동선 포함)으로 Flutter 웹/iOS/Android를 구현하고 기존 로그인·학습 데이터·AI·음악 API에 연결한다.
- 소유: 현재 Codex 세션. workers/Claude OFF(저장소 공용 플래그 파일 없음). OpenRig refocusing trace에 현재 topology/work 노드가 없어 trace 완료를 주장하지 않는다. 저장소와 실제 소스를 기준으로 직접 진행한다.
- 작업: `/Users/admin/workSpace/commerce-automation-kit-worktrees/hanmadi-flutter-client`, `feat/hanmadi-flutter-client`. 기준 `origin/main` 57da805. 초기 origin/main upstream은 제거했으며 첫 push는 이 작업 브랜치에만 -u로 설정한다.
- 시안: 현재 프로젝트 `docs/hanmadi-design-v3/`, 기준 커밋 0097cad. 이 worktree에 임의 전체 복사/머지는 하지 않는다. 기존 PR #257·다른 세션은 변경하지 않는다.
- 환경: ARM64 Mac, 시작 시 Flutter/Dart 미설치, Xcode는 CommandLineTools만 존재, Android Studio 없음. 최초 디스크 여유 8.1GiB. 다른 세션 파일을 삭제해 공간을 확보하지 않는다.
- SDK: 공식 GitHub flutter/flutter stable shallow clone을 `/Users/admin/.local/share/flutter-sdk`에 설치. 전역 PATH 미변경. 공식 releases_macos.json 조회는 404여서 공식 저장소 경로로 전환했다.
- 산출물/로그: 사용자 지정 iCloud `commerce-automation-kit/hanmadi-flutter-client-20261015/`. 비밀 값은 복사·기록하지 않는다.

## 범위와 완료 조건

1. Flutter 공통 디자인, 4개 메뉴, 회화/단어/음악과 복귀·초안 유지, 모바일/PC 대응.
2. 기존 서버/API 계약과 계정/학습 기록을 재사용. 앱에 서버 비밀을 넣지 않는다. 명시적인 데모 외에는 예시 데이터를 실제 데이터로 표시하지 않는다.
3. 로그인·스터디·AI 대화·번역·보관함·음악·음성 입출력을 연결하고 실패/재시도/로딩을 노출한다.
4. 분석·의미 있는 상태/라우팅/저장 테스트, 웹 release 빌드·브라우저 검증. 네이티브 빌드는 실제 도구/서명 준비 여부를 확인하고 미검증 범위를 별도 기록한다.
5. 본인 변경만 커밋·작업 upstream push·검토 가능한 PR. 사용자 승인 전 main/운영 머지·배포 없음.

## 진행

- 기존 서비스는 Next.js 16.3.6, 실제 학습 API는 `/api/study`와 관련 music/audio/account 경로다. 루트 checkout은 옛 소스라 최신 main에서 worktree를 만들었다.
- learner 인증은 HttpOnly HMAC 쿠키와 서버 actor 키를 사용한다. Flutter 네이티브용 인증 경계를 별도로 설계해야 하며 쿠키를 앱에 임의 복사하지 않는다.
- 현재: SDK 부트스트랩·기존 API/인증/배포 경계 조사 중. 다음: 실제 계약 목록과 클라이언트·인증 연결 설계 후 구현.

## 구현·검증 체크포인트

- Flutter SDK 실제 3.47.7/Dart 3.13.5. 웹/Android/iOS 프로젝트와 공통 클라이언트 구현. 서버 카탈로그와 기본 OFF PKCE 앱 인증 경계를 연결했다. 기존 Origin 함수·운영 화면 유지.
- Flutter 분석/테스트 10개, 기존 서버 279개, TypeScript/변경 파일 lint, 웹 release/Android debug/Next 운영 빌드 통과. 실제 로컬 API의 같은 계정 공유 저장·로그아웃 폐기·브라우저 Origin 보존 확인.
- 작은 화면 넘침, 화면 갱신, 컨트롤러 덮어쓰기, 일본어 폰트 누락을 보완. Noto 글꼴/OFL 동봉.
- 실제 로그인 폼부터 Flutter 음악 복귀·AI 대화·번역·보관함까지 E2E 통과(정상 exit 0, result.json pass=true). iOS 로컬 도구 없음은 확인됐으며 macOS CI 무서명 컴파일을 준비했다. 실제 단말·운영 배포는 아직 아니다.
- 다음: 최종 E2E/실제 스크린샷 확인 → 본인 변경 커밋/작업 브랜치 push/PR → CI 확인. 새 PR 머지 승인은 별도다.
