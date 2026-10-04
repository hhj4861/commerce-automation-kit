# PR #142 운영 반영 검증 — 2026-10-04

사용자의 PR #142 머지·운영 반영 명시 승인에 따라 배포했다.

- PR: https://github.com/hhj4861/commerce-automation-kit/pull/142
- 승인 변경 커밋: `07a540e`; 머지 커밋: `992c1f063e1cf02161a08f1a75c551f07b2e6846`.
- 원격 Platform GitOps verification 통과 후 머지. Shorts의 `deploy/shopshorts` 브랜치는 아직 없으므로 기존 수동 Pages 경로를 사용했다. GitOps 자동 배포 활성화 완료를 뜻하지 않는다.
- 운영: https://shopshorts-dash.pages.dev/studio/dashboard?mode=auto
- Pages 배포: https://84515489.shopshorts-dash.pages.dev — production branch `main`, 승인 머지 SHA 지정, CLI 종료 0.
- 기존 Wrangler OAuth는 공식 CLI에서 갱신됐다. 토큰·시크릿 값이나 바인딩을 교체하지 않았다.

## 적용 범위

새 프로젝트의 설명 연출 계획 검증, 쇼츠 기본 45초 및 첫 0–3초 질문 자막, 롱폼 첫 15초 질문/작은 답 지침, 관련 있는 해시태그, 본편 URL 저장과 실제 관련 동영상 수동 연결 안내를 반영했다. 기존 영상·편집 내용은 소급 수정하지 않는다. 클릭률·조회수 목표는 실험 지표이며 성과 보장이 아니다.

제작 워커의 `/Users/admin/workSpace/shopshorts-production`을 승인 머지 커밋으로 전환했다. 작업 대기/실행 0건, 계정 작업 0건을 재확인하고 정상 종료·재시작했다. 계정 워커가 참조하던 이전 iCloud 릴리스 경로는 같은 로컬 운영 checkout으로 변경했다. 기존 인증과 제작 워커의 Node 22 모션 실행 경로·작업 폴더 설정은 보존했다. 변경한 운영 설정은 `~/Library/LaunchAgents/com.cak.llm-accounts.plist`의 실행 경로·Node 20·PATH이며 이전 릴리스는 삭제하지 않았다.

## 증거

- 로컬 공통 회귀 테스트: 333/333 통과. 후속 단일행 자막 보정 focused 7/7, URL 오류 상태 코드 보정 대상 테스트 통과.
- 실제 로컬 브라우저 → API → 워커 → HyperFrames → 편집기 → 최종 MP4 E2E 통과. 모바일 화면, 첫 질문 자막 렌더 프레임 확인. 이 검증에서 유료 생성/게시 없음.
- 운영 `shorts-policy.js`, `automatic-creation.js`, `editor-model.js`, `studio.js`: 기존 인증을 포함한 조회 HTTP 200, 로컬 승인 커밋 파일과 바이트 일치. 인증 없는 첫 조회는 로그인 HTML이므로 배포 증거로 사용하지 않았다.
- 운영 `/api/studio/config` HTTP 200: 최신 제작 heartbeat, image/video/voice/motion true, mediaProvider higgsfield. 계정 실행기 available/scenarioAvailable true.
- `com.cak.studio-production`, `com.cak.llm-accounts` 정상 running, 새 PID 39165/39167 확인.
- worker 인증 주체의 계정 connected=false는 사용자 계정 연결 상태 검증이 아니다. 사용자 개인 OAuth 실호출이나 운영 유료 영상 생성을 이번 배포 검증으로 수행하지 않았다.
- 자동적인 YouTube 관련 동영상 설정은 구현 범위 밖이다. 본편 URL만 기록하며 실제 Studio 연결 여부를 구분한다.

로컬 검증 로그·렌더 캡처는 지정 iCloud `gpt 작업/commerce-automation-kit/20261004-seokbinggo-chipstack/`에 있다. 소스와 배포 검증 문서는 로컬 Git 저장소에 보존한다.
