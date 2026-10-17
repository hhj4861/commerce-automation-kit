# Hanmadi E2E 사용성 개선 — 2026-10-17

- 목표: E2E 진단의 단어장 목적지·음악 복귀·원문 접근성·중복 문구 4개 개선.
- 범위/담당: 현재 Hanmadi 세션, Flutter 공통 화면과 관련 테스트. API·운영 데이터·설정 변경 없음.
- 기준: main `08922ab`, 진단 `docs/qa/20261017-hanmadi-e2e-ux-audit.md`(프로젝트 checkout 문서).
- 완료 조건: 원문이 접근성 tree에 노출, 직접 단어장 필터 진입·표현 필터 복귀, 음악 목록 복귀 및 단계 유지, 작은 화면의 입력/시작 버튼 노출, 정적 분석·테스트·웹 빌드·실제 서버 E2E 후 본인 변경 커밋·upstream push·PR.
- 현재: 4개 개선 구현 및 로컬 검증 완료. 하늘색·공통 글꼴, 선택/복사, 필수 AI/저장/오류 안내 유지. 운영 미반영.
- 검증/다음: 아래 로컬 검증 완료 후 본인 변경만 커밋·정상 push·PR 생성. 원격 CI를 별도 확인한다. PR 머지와 운영 배포는 해당 PR 승인 후 별도 진행.

## 검증 중 발견 및 조정

- 1차 정적 분석 통과, Flutter 테스트 24개 통과·1개 실패. 단어장 목적지 테스트가 기본 800×600에서 하단 내비게이션과 겹친 링크를 tap하여 실제 화면 이동이 발생하지 않았다는 hit-test 증거를 확인했다. 운영과 같은 390×844 viewport 및 scroll 후 frame settle을 명시해 다시 확인한다. 테스트 경고를 끄거나 성공 기준을 완화하지 않는다.

- 최종 Flutter 테스트 25개·분석·웹 빌드 통과. 첫 브라우저 회귀는 원문이 `aria-label`이 아니라 실제 접근성 text span으로 노출되는 점을 locator가 반영하지 못해 실패했다. failure DOM/HTML에 일본어 원문이 실제 text로 존재함을 확인했으며 원문 검증을 exact text 기준으로 수정한다. 실패 후 정리 지연으로 소유 경로를 확인한 runner PID 28930만 SIGTERM 종료(종료 증거 확인). 실패 오류를 정리 전에 기록하고 로컬 mock 연결도 명시적으로 닫도록 보완한다. 첫 실패 캡처는 별도 보존한다.

- 2차 브라우저 회귀: 원문·선택창·단어 저장·단어장 직접 진입은 통과했다. ‘나의 표현’ 접근성 이름에 실제 복습 개수(2)가 붙는 점을 exact locator가 반영하지 않아 멈췄다. 실패 DOM/캡처로 목적지 정상과 카운터를 확인하고 카운터를 허용하는 이름으로 수정한다. 이번 실패는 자체 종료 코드 1로 정리됐고 정리 완료를 확인했다.

## 최종 구현과 검증

- `/library?tab=words` 진입 의도를 route에서 읽어 내 단어장은 단어 필터로, 나의 표현은 표현 필터로 연다. 필터를 바꾸고 재방문해도 바로가기의 의도를 따른다.
- 음악 연습의 뒤로가기와 복습 완료는 음악 목록으로 복귀한다. 버튼 이름도 ‘음악 목록으로’이며 곡별 연습 단계는 유지한다.
- 공통 `LearningText`는 원문·언어를 명시적인 읽기용 semantics로 노출한다. 기존 SelectableText의 선택/복사는 유지하고, 뜻을 가린 경우 의미를 노출하지 않는 회귀를 확인한다.
- AI 대화·번역·보관함의 장식성 Heading을 제거했다. 대화 시작 제안과 입력창은 320×568에서 함께 보이며, AI 오류 안내는 짧게 유지한다.
- 최종 `flutter analyze --no-pub`: 오류 없음.
- 최종 `flutter test --no-pub --reporter expanded`: 25개 통과.
- `flutter build web --no-pub --base-href /app/`: 성공.
- 최종 실제 Next API·합성 계정·Chrome E2E: exit 0, 20개 경계/회귀 검사 통과. 원문 텍스트, 단어/표현 목적지, 음악 목록 복귀, 320px 시작 버튼, 기존 인증·저장·채팅·번역·보관함을 검증했다. AI는 로컬 fixture만 사용했다.
- 새 `mobile-direct-vocabulary.png`, `mobile-chat-small.png`, `mobile-translation.png`, `mobile-music.png` 화면을 검토했다. 실제 보조기술·네이티브 단말·운영 AI 공급자 실호출은 이번 로컬 검증에 포함하지 않는다.
- 산출물: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-e2e-usability-20261017/`. 분석·테스트·웹 빌드·최종 E2E 로그와 실패 시도별 증거를 보존한다. 이번 `.next` 임시 링크는 실행 종료 뒤 해제했다.
