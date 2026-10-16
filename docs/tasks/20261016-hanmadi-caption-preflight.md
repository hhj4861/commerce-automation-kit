# Hanmadi 자막 확보 사전 안내

- 목표: 검색·수집 뒤에 채널 연결 오류로 막히는 흐름을 없앤다.
- 소유: invoking Codex; workers/Claude OFF. 기존 본인 worktree, fix/hanmadi-caption-preflight.
- 기준: main 6fda2bcf0c7d4ad1fd4a53937d57b7cfe973db17.
- 범위: 관리자 읽기 API의 비밀 없는 설정 여부, 검색·수집 사전 안내, 원문 직접 가져오기 차단, 파일 등록 연결, E2E 회귀.
- 완료 조건: 연결 전 안내와 disabled 버튼, 불필요한 수집/자막 요청 0건, 파일 원문·연결된 정상 가져오기 경로 유지, 검증 후 커밋/브랜치 푸시/PR.
- 제한: YouTube 공개 자막 존재를 다운로드 권한으로 표시하지 않는다. 공식 API는 영상 수정 권한을 요구한다. 새 채널 자격 발급·운영 설정·머지·배포는 이번 수정 완료와 구분한다.
- 검증: 단위 290개, 대상 lint, production build, 전체 타입 검사, 원문·음악 전체 E2E 통과.
- 결과: 미연결 사전 안내와 자막 요청 0건 확인. 커밋·브랜치 푸시·PR 생성 후 머지 승인 대기.
- 증거: docs/qa/20261016-hanmadi-caption-preflight.md.
