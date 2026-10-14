# Hanmadi 자체 음악 학습

- 목표: Musixmatch 없이 관리자 원문 등록 → AI 자료 생성 → JEV 평가 → 사람 검수·게시 → 학습자의 가사·단어·회화·저장·AI 대화.
- 소유: 이 세션 / feat/hanmadi-owned-music. base 1f820e3. 다른 worktree 변경 없음.
- 범위: 기존 Redis/CAS·LiteLLM·JEV·음악 연습 UI 재사용. 관리자만 원문 제공, 사용자 입력 불필요. TXT/SRT/VTT 지원, YouTube 공식 임베드 재생. 다운로드·스크래핑 없음.
- 완료 기준: 권한·원문 검증·동시/중복 작업·검토/실패 상태·게시/회수·진도 버전·단어/표현 저장 단위/API/browser 검증, lint/build, own commit/push/PR.
- 한도: 원문 12,000자/100구간, AI 학습 구간 2~8개, 100곡 보관, 생성 하루 20회·동시 2곡. AI 호출과 JEV는 서버에서만 실행.
- 현재: 구현·로컬 검증 완료. Pretender 원문/사용권은 확보하지 않았고 상용 가사를 내장하지 않음. 실모델·운영 배포 미검증.
- 다음: 검증한 작업 브랜치를 커밋·푸시하고 PR 작성. 머지는 별도 명시적 승인 필요.


## 구현 및 검증 진행

- 자체 카탈로그: `hanmadi:v2`의 `music-catalog:v1` 필드. 관리자/학습 앱은 같은 기존 Redis를 사용해야 함. 원문·사용권·JEV 검토 결과는 관리자 API에만 노출. 학습자 응답에는 게시한 구간·회화와 본인 진도만 포함.
- AI는 기존 `LITELLM_BASE_URL/API_KEY/MODEL`, JEV는 기존 `HANMADI_JEV_API_KEY` 사용. 신규 외부 가사 공급자 설정은 불필요. 모델 가중치 파인튜닝을 실행하는 기능이 아니라 학습 자료를 생성·게시하는 기능.
- 원문 변경 시 게시가 내려가고 이전 생성 결과를 무효화. 수정 버전으로 새 진도 시작. 게시 회수 이후 요청 차단; 이미 개인 보관함에 저장한 단어·일상 표현은 유지됨.
- 관리자 생성/평가 상태는 Redis job lease로 보호(3분); 동시 2곡, 하루 생성·평가 시도 20회. 실패한 JEV는 생성 결과를 재사용. 자동 재시도 없음. 네트워크 유실 시 목록으로 확인.
- 관리자가 게시한 Pretender 공식 영상 ID의 자료가 있으면 기존 Pretender 버튼도 해당 자료를 우선 사용. 실제 Pretender 가사는 여전히 미확보. 테스트는 직접 작성한 원문과 HTTP fixture만 사용.
- 현재 검증: 전체 단위 264/264, 신규 중요 경계 8/8, 신규 브라우저 E2E(등록/VTT 업로드→JEV 실패/재시도→검수→게시→단어/회화/저장→2구간 복습 완료→재접속→게시 회수) 통과. 320/390/1024 너비 확인. lint 오류 0(기존 경고 4), build 1회 통과. 최종 변경의 신규 E2E(`e2e-release`), 기존 음악 E2E(`music-regression-final`), lint, production build(`build-final.log`) 모두 통과.
- 테스트 중 수정: 폼 필드 탐색의 동명 숨김 필드, React 시각 상태 처리, 한국어 음성 오류 표시를 반영. 가변 곡 길이 도입 후 기존 4개 보기 순서 보존. 첫 실패를 숨기지 않고 해당 경계를 수정/확인한 뒤 재실행.
- 로컬 산출물: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/hanmadi-owned-music-20261014/`. Next dev가 생성한 AGENTS/CLAUDE 파일은 기존 소스가 아니며 서버 종료 후 본인 생성분만 제거.
- JEV 의미 비교는 게시한 음악·교재 표현 중 최대 120개를 요청에 포함하며, 동일 문장 비교는 수집한 전체 참조에서 확인. 신규 자료의 모든 의미 중복을 보장하는 기능은 아님.
- 실모델 생성 품질·실제 Pretender 내용·운영 배포는 이번 fixture 검증의 범위가 아님. 별도 검수·머지 및 운영 승격 필요.

- PR #225: https://github.com/hhj4861/commerce-automation-kit/pull/225. 신규 음악 E2E를 기존 Hanmadi CI에 포함하고 runner 임시 폴더의 검증 산출물을 업로드하도록 연결. 로컬은 설치된 Chrome, CI는 Playwright Chromium을 사용. 운영 미반영.
