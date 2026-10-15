# Hanmadi Flutter UI·타이포그래피 정리 — 2026-10-15

## 결과와 적용 범위

Flutter `/app/`의 화면을 덮는 기본 선택 UI를 작은 공통 팝업으로 교체하고, 모든 메뉴의 글꼴·자간·행간·입력·카드 스타일을 통일했다. 별도 worktree `hanmadi-flutter-ui-polish`, branch `feat/hanmadi-flutter-ui-polish`, base `origin/main e0ffc6b`에서 구현했다. **이 기록은 로컬 검증 결과다. main 머지·운영 배포는 새 PR 승인 후 별도 진행한다.** 기존 Next `/study` 화면과 서버 계약·인증은 변경하지 않았다.

## 공통 디자인 기준

- 제목 Jua, UI 본문 Gowun Dodum, 학습 원문은 기존 Noto 계열 유지. 공통 테마의 15개 텍스트 역할 자간은 0. 페이지 제목 25px, 카드 제목 20px, 본문 15–16px, 안내 12–13px. 제목 행간 1.3, 본문 1.55.
- 회화·단어·음악·AI 대화·번역·보관함에 동일한 공통 제목·본문·버튼·선택 스타일 적용. 스터디의 중복된 큰 제목 제거. 폭 360px 미만에서는 말풍선 로고만 표시해 좁은 화면과 큰 글자의 상단 넘침 방지.
- 화면 좌우 여백 20px, 공통 카드 radius 24px와 얇은 테두리, 입력·버튼 radius 18px, 공통 버튼·선택 필드 최소 높이 48px. 연보라 탭 배경과 흰색 선택 탭으로 계층 표시.
- 언어·회화 상황·대화 상황·번역 입력 언어·연습 레벨에 같은 `AppSelect` 사용. 최대 높이 `min(280px, 화면 높이 × 0.38)`, 너비 최대 320px(상단 언어 236px). 긴 목록은 내부 스크롤, 선택 표식·바깥 클릭·포커스된 Esc 닫기 제공. 잘리는 메뉴 애니메이션은 clip, reduced motion 설정 존중.
- lilac #6355b5, ink #343047, paper #faf9fd, soft #efeafa. 수동 색상 계산: muted/paper 약 4.8:1, brand/soft 약 5.1:1, white/brand 약 6.0:1. 전체 접근성 인증을 의미하지 않는다.

## 검증

- `flutter analyze`: 오류 없음.
- `flutter test`: 16개 통과. 320/1440px·큰 글자 1.3/1.4배·긴 선택지, 스크롤 후 선택, 바깥 클릭·Esc, 모든 텍스트 역할 자간·글꼴, 각 메뉴 제목, 음악 복귀·초안 유지·대화 스크롤 포함.
- 고정 SDK Flutter 3.47.7 / Dart 3.13.5에서 locked dependency 사용. `build-flutter-web.mjs`: release 빌드 성공.
- 실제 로컬 Next 서버 + release Flutter + Chrome, 합성 계정·로컬 AI fixture로 E2E 통과. PKCE 로그인·웹/앱 저장 공유·토큰 폐기·Origin 차단·카탈로그·제한된 메뉴 크기·포커스된 Esc·바깥 닫기·레벨 선택·단어·음악→스터디 복귀·대화·번역·보관함·데스크톱 전환 확인. 운영 데이터·유료 AI 요청 없음.
- 390×844 모바일 각 메뉴와 선택 창, 1440×1000 보관함 캡처를 실제 확인했다. 원문 글자 형태와 UI 제목을 분리하고, 선택창이 전체 화면을 덮지 않는 것을 확인했다.
- 실제 iOS/Android 기기 터치·OS 글자 확대는 미검증. PR의 기존 Flutter CI에서 Android debug / iOS unsigned compile을 확인한다.

## 검증 중 발견 및 처리

Material의 null 자간 역할에 factor를 적용하면 런타임 assertion이 발생해 15개 역할을 명시적으로 0으로 정규화했다. 큰 글자·좁은 화면의 상단 브랜드 넘침을 Flexible/폭별 표시로 해결했다. Flutter web의 semantic DOM 키보드 검증은 메뉴 항목을 실제 focus한 뒤 Esc로 확인한다. 무초점 Esc 동작을 검증했다고 주장하지 않는다. 캡처의 전환 애니메이션/폰트 대기에서 한 번 timeout이 있어 캡처만 animations disabled·caret hide·60초 제한으로 안정화했고, 다음 전체 흐름이 통과했다. 로컬 Next의 외부 node_modules symlink 거부는 해당 worktree에 잠금 파일 기준 설치로 해결했다.

## 산출물

로그와 캡처 원본(합성 데이터만 포함):

`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-flutter-ui-polish-20261015/`

- `flutter-tests.log`, `web-build.log`, `e2e.log`, `e2e/result.json`, `e2e/server.log`
- `e2e/mobile-study.png`, `mobile-scene-picker.png`, `mobile-language-picker.png`, `mobile-level-picker.png`, `mobile-words.png`, `mobile-music.png`, `mobile-chat.png`, `mobile-translation.png`, `mobile-library.png`, `desktop-library.png`
- 이전 실패 증거는 동일 작업 폴더의 `e2e-*-failure` 및 `e2e-capture-timeout`에 보존한다. 캡처를 소스 저장소에 중복 저장하지 않는다.

폰트는 Google Fonts 정본의 수정 없는 TTF와 OFL 라이선스를 함께 포함했다: [Gowun Dodum](https://github.com/google/fonts/tree/main/ofl/gowundodum), [Jua](https://github.com/google/fonts/tree/main/ofl/jua). 기존 학습용 폰트는 보존했다.
