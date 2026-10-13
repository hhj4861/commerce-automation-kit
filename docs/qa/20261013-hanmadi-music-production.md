# Hanmadi 음악·단어·회화 학습 — 운영 반영 (2026-10-13)

## 결과

PR #209·#210의 구체적인 머지·운영 배포 승인 요청에 대한 사용자의 “계속해줘” 지시로 두 PR을 main에 정상 머지하고 학습 앱 Production에 반영했다. 기존 네 언어 오리지널 곡에 단어 회상, 일상 회화, 단어장·내 표현 저장, 음악 문맥의 AI 대화 시작을 연결했다. 상용곡 가사 공급 연결은 별도이며 이번에 활성화하지 않았다.

- 운영: https://hanmadi-lake.vercel.app/study
- PR #209: https://github.com/hhj4861/commerce-automation-kit/pull/209 — merge `ba50446f6403b9945ef9258a09037afed8ce1a3e`.
- PR #210: https://github.com/hhj4861/commerce-automation-kit/pull/210 — merge `f77f853119f99cd20c3f6c3d9204c8663d09900b`.
- 배포: https://hanmadi-6nvar5v5l-dean-10.vercel.app — `dpl_2XdKt3bZBbg5qKSLEctfht6GxnJd`, Production **READY**, 공식 alias 연결 완료.
- Vercel 상세: https://vercel.com/dean-10/hanmadi/2XdKt3bZBbg5qKSLEctfht6GxnJd
- 원격 Next.js 16.3.6 빌드·TypeScript 완료. Vercel build output 생성 18초.

## 소스와 배포 경계

두 PR 각각 CI 5개 성공 및 정확한 head SHA를 확인하고 일반 merge를 사용했다. #209 머지 후 #210의 base를 main으로 변경했다. GitHub의 실제 통합 소스에서 Hanmadi 앱·공용 Google 인증·LiteLLM 클라이언트가 이미 검증한 소스와 동일함을 비교했다. 다른 main 변경은 보존됐다.

배포용 `/Users/admin/workSpace/commerce-automation-kit-worktrees/hanmadi-music-release-20261013`은 `f77f853`의 깨끗한 detached worktree다. 앱 디렉터리가 검증한 #210 head `af6cde7`과 동일함을 다시 확인했다. 기존 공식 Vercel CLI 60.1.3 인증으로 `dean-10/hanmadi` 프로젝트를 명시해 원격 production 빌드를 실행했다. release SHA와 learner 모드를 build/runtime에 지정했다.

배포 전 production 필수 설정 존재와 기존 14개 변수 목록을 확인했다. 최근 다른 세션이 제거한 Dify/accounts v1 변수 7개는 없는 상태를 유지했다. 환경변수, 관리자 앱, 공용 AI 서버, CI 인증은 변경하지 않았다. 새 비밀 값을 만들거나 다운로드하지 않았다.

`deploy/hanmadi`의 조회된 최신 실행은 초기 브랜치 생성 실행 `37291015909`뿐이었다. 기존 CI 자격 연결 미완료 상태를 임의 변경하지 않았다. **이번은 승인된 수동 CLI 운영 배포이며 자동 GitOps 활성화 완료가 아니다.**

## 검증

| 경계 | 결과·증거 |
|---|---|
| 배포 identity | `verifyLearnerRelease` 통과: `/api/deployment`의 `application=hanmadi`, revision `f77f853119f99cd20c3f6c3d9204c8663d09900b` |
| 공개·로그인 | `/study`, `/privacy` 200, Google 로그인 준비 API의 available/clientId 일치, 비로그인 관리자 API 403 |
| 신규 API 보호 | 비로그인 `/api/study/practice-music` 401 |
| 네 언어 음원 | 영어·일본어·태국어·스페인어 MP3 각각 HTTP 200, audio MIME, 512,462바이트. `bytes=0-1023` 요청 각각 206 및 1,024바이트 |
| 실제 운영 UI | 로그인된 Chrome에서 새 버전 새로고침 → 음악 → 한마디 연습곡. 일본어 `小さな今日`, 네 줄 가사, 단어 퀴즈·저장 버튼·회화 화면 표시 확인 |
| 원곡 재생 | 실제 운영 플레이어의 재생 버튼을 누른 뒤 일시중지 상태, 다시 눌러 정지 상태 확인. 원어민 청음 평가로 보고하지 않음 |
| 회화 연결 | `おはよう`의 “아침에 친구와 만나 인사하기” → 질문 `おはよう。元気？` → 예시 답변 `おはよう。元気だよ。` 표시 확인 |
| AI 연결 | “새 AI 대화로 연습” → 곡명·단어·뜻·상황·예시를 담은 입력창 및 “음악 회화 시작” 버튼 확인. 실제 전송은 하지 않음 |
| 운영 오류 관측 | 이번 deployment에 한정한 직전 10분 error-level 조회 `No logs found`. 짧은 관측·해당 필터 범위에 한정 |

개인 계정의 정답·말하기 완료·단어장·내 표현 기록은 변경하지 않았다. 실제 AI·TTS 유료 호출과 신규 계정 생성은 없다. 저장·중복 방지·응답 유실 재시도·새로고침 복원·계정 격리·네 언어 전체 연습은 실제 로컬 HTTP/격리 브라우저 검증으로 확인했다. 이를 운영 개인 기록 쓰기 검증과 혼동하지 않는다.

로컬 검증은 전체 단위 256개, lint 오류 0, production build, 320/390/1024px 브라우저 흐름과 pageerror 0개다. [GitHub 사용자 흐름 CI](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38346325602)도 통과했다. 자세한 구현·fixture 범위는 PR #210의 `docs/tasks/20261013-hanmadi-music-words-conversation.md`에 있다.

운영 UI 캡처는 도구 출력으로 확인했다. 지정 iCloud 경로로 캡처 파일 저장은 브라우저 도구의 EPERM으로 실패해 저장 완료로 기록하지 않는다. 후속 화면 이동 시 검증 탭이 없어 추가 브라우저 조작은 중단했다. 앞서 확인한 운영 결과와 공개 URL 검증은 유지된다.

이 문서는 현재 프로젝트 docs에 별도 보관하는 QA 기록이다. 문서 커밋 자체가 운영 배포를 다시 실행하지 않는다.

## 후속: 실제 음악 회화·답변 음성 검증

사용자의 후속 “계속해줘” 지시로 2026-10-13(KST)에 남아 있던 실제 AI 응답을 확인했다. 운영 revision은 `f77f853` 그대로이며 이번 검증을 위한 코드 변경·재배포는 없다.

검증 흐름은 로그인된 Chrome의 음악 → 일본어 연습곡 → 회화에 써보기 → 새 AI 대화로 연습 → 음악 회화 시작이다. 기존 기본 Gemini 선택을 사용했으며 실제 앱 대화 전송 2회와 답변 음성 버튼 1회를 실행했다. 앱 내부의 번역·재시도 모델 호출 수나 요금은 따로 계측하지 않았으므로 화면 전송 횟수를 모델 호출 횟수로 표현하지 않는다.

| 단계 | 실제 결과 |
|---|---|
| 음악 문맥 전달 | `小さな今日`의 `おはよう`, 아침 친구 인사, 예시 `おはよう。元気だよ。`가 시작 입력에 포함됨 |
| 첫 AI 응답 | `おはよう！よく眠れた？` / `오하요우! 요쿠 네무레타?` / “좋은 아침! 잘 잤어?”와 답변 힌트 표시 |
| 학습자 답변 | `おはよう。元気だよ。よく眠れたよ。` 전송 |
| 후속 AI 응답 | `それはよかった！今日はどこに行く予定なの？` / `소레와 요캇타! 쿄오와 도코니 이쿠 요테이나노?` / “다행이다! 오늘은 어디에 갈 예정이야?”와 답변 힌트 표시 |
| 문맥 유지 | 새 수업을 다시 시작하지 않고, 잘 잤다는 답을 받아 오늘 계획을 묻는 아침 인사 대화로 이어짐 |
| 답변 음성 | 후속 답변의 “들어보기” → “음성 준비 중…” → 오류 없이 버튼 복귀. Speaker는 playback.started 완료 후 준비 상태를 해제함. 운영 로그의 `POST /api/study/audio` HTTP 200 필터로 17:44:35.94 KST 성공 요청 1건 확인 |
| 오류 | 해당 탭 console error 0개, 해당 deployment 직전 10분 error-level 로그 항목 없음 |

학습 완료·단어 저장·표현 저장 버튼은 누르지 않았고 설정·계정·인증을 변경하지 않았다. 첫 시작 요청은 수업 제어용 문장이고 후속 답변은 일본어 원문이다. 공용 학습 자료 제공이나 파인튜닝은 실행하지 않았다. 실제 음성의 원어민 청음 품질 검증으로 확대하지 않는다.

이로써 이전 검증에서 제외했던 **음악 문맥으로 실제 AI 답변 받기 → 학습한 표현으로 답하기 → 후속 회화와 답변 음성 요청**을 운영에서 확인했다. 네 언어 전체 실모델 검증은 아니며 이번 실응답은 일본어 사례다. 실제 결과 탭은 사용자 확인용으로 보존했다. 자동 GitOps 인증과 상용곡 가사 공급의 기존 미완료 상태는 그대로다.


## 후속: 사용자 요청 E2E 재실행 (18:27 KST)

“e2e검증해서 동작확인해줘” 요청으로 기존 결과만 재사용하지 않고 `npm run test:music`을 새로 실행했다. 대상은 `af6cde7` worktree이며 `git diff --exit-code HEAD f77f853119f99cd20c3f6c3d9204c8663d09900b -- apps/hanmadi`로 운영 앱 소스와 동일함을 확인했다. 공개 `/api/deployment`도 동일 revision을 반환했고 `/study` 200, 비로그인 음악 API 401을 재확인했다.

**결과: 종료 코드 0, `passed: true`, 브라우저 pageerror 0개.** 격리한 로컬 Next.js 서버·실제 HTTP API·Chrome에서 다음 흐름을 모두 통과했다.

- 영어·일본어·태국어·스페인어: 원곡 실제 재생 → 가사·뜻 → 단어 오답/정답 → 회화 예시·혼자 말하기 기록 → 단어장·내 표현 저장 → 해당 목록 확인 → 새로고침 복원 → 학습 완료·다시 연습.
- 저장 응답 유실 후 재시도와 중복 방지, 언어별 진행·계정 격리, 인증·Origin·잘못된 revision 거부.
- 곡명·단어·회화 상황을 담은 AI 입력 준비 → 전송 → 테스트 응답 표시. 준비 단계에서 자동 AI 요청이 발생하지 않음을 확인.
- 320/390/1024px 화면 가로 넘침 없음. 화면 캡처 32개 생성, 일본어 회화·저장 완료 화면을 직접 확인.
- 가사 공급 미설정·사용권 대기·일시 오류·만료·재시도, 12줄 원문 순서와 중복 줄 유지, 가사를 계정 상태에 저장하지 않는 경계 확인.

이번 자동화 실행의 AI 응답·TTS 오류·상용곡 공급자·YouTube iframe은 fixture다. 원곡 MP3 재생과 학습·저장·복원 API는 실제 로컬 서버를 사용했다. 운영 Redis에 테스트 학습 기록을 쓰거나 유료 모델을 새로 호출하지 않았다. 운영 실모델·음성 확인은 위 17:44 KST 일본어 사례에 한정하며, 이를 네 언어 전체 운영 실모델 E2E로 확대하지 않는다.

증거 경로:

`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-music-e2e-recheck-20261013-182746/`

- `e2e.log`: 실제 HTTP 검증과 브라우저 실행 성공 출력.
- `browser/result.json`: 검증 항목·성공·오류 목록.
- `browser/server.log`: 실제 저장·조회 요청 로그. Error/Warning/Exception 문자열 없음.
- `browser/original-ja-conversation.png` 등: 화면 캡처.

테스트 서버는 종료되고 합성 계정 fixture 파일은 삭제됐다. 테스트가 생성한 미추적 Next.js 안내 파일 2개만 정리했다. 이번 검증에서 수정이 필요한 실패는 없었으며 제품 코드·운영 배포는 변경하지 않았다.
