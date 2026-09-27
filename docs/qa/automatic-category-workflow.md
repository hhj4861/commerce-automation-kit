# 카테고리 기반 자동 제작 검증 (2026-09-27)

## 범위와 화면 설계

수동과 같은 심리학·건축학·상품광고·막장드라마·역사·과학·직접 입력 카테고리. 카테고리 → 최근 자료 검색 → 키워드 3개 → 대본 생성 → 사람의 대본 승인 → 장면·내레이션·자막·영상 조립 → 사람의 최종 발행 검수.

기존 화면과 이어지는 색상: canvas #f7f7f4, surface #ffffff, ink #242622, brand #ff6b4a, mint #277e64. Noto Sans KR 본문과 DM Sans 숫자·라벨을 유지한다. 왼쪽 정렬, 상단 실제 단계 표시, 검색 결과의 키워드를 강조한다. 동일한 카드로 모든 내용을 나누는 대신 기획/검색 영역과 검수 작업 목록의 역할을 구분한다. 기존 쇼핑 큐는 작업이 있을 때만 별도로 표시하여 잘못된 0건 집계와 관리 영역 중복을 줄였다.

## 연결 계약

동시 작업 세션이 제안한 `/studio/automatic`을 주 진입점으로 채택했다. `/automatic`은 호환 별칭으로 제공한다. 작업 위치: `/private/tmp/cak-automatic-category-workflow`, 브랜치: `feat/automatic-category-workflow`. 모듈: `public/automatic-creation.js`의 `mountAutomaticCreation(host,{fetcher,connect})`; 반환값 ready/refresh/destroy. 자동 프로젝트는 `project.automation.version===1`, 수동은 automation 없음. 신규 LNB 자동 메뉴를 추가하지 않고 영상 제작실의 자동 선택으로 들어간다.

- `/studio/automatic`: 신규 자동 제작과 자동 프로젝트 대본 승인·발행 검수. index.html에서 `mountAutomaticCreation(host)`를 마운트한다.
- `/studio?mode=auto`: 이전 링크 호환, `/studio/automatic`로 이동.
- `/studio?new=1`, `/studio?id=...`: 기존 수동 기획·직접 편집 유지.
- `/studio/automatic?recommendation=...`: 저장된 키워드 검색 결과 복원. 기존 알림의 `/studio?new=1&recommendation=...`도 결과 intent에 따라 자동 화면으로 이동한다.
- `/studio/automatic?project=...`: 자동 프로젝트 이어하기. 콘텐츠 라이브러리의 mode는 auto.
- `/studio/automatic?job=...`, `?request=...`: 기존 쇼핑쇼츠 큐 연결.
- LNB Shopshorts 브랜드는 `/` 링크.

동시 진행 중인 `feat/studio-production-dashboards`가 index/studio/server를 수정한다는 통지를 받았다. 이 브랜치는 해당 worktree를 수정하지 않는다. 경로 제안을 채택했다. 상대 세션이 이 문서를 읽고 연결 계약을 수신·확인했다고 회신했다. 상대 수동 대시보드는 automation 프로젝트를 제외하며, 이 모듈은 펼친 automaticView 상단에 마운트하고 기존 쇼핑 큐를 하단에 유지한다. 수동 대시보드 변경과 통합할 때 위 자동 화면·모듈 계약을 유지하고 별도 수동 대시보드 경로를 보존해야 한다.

## 서버 동작

추천 입력/결과의 optional intent=keywords 및 suggestion.keyword를 추가했다. 기존 수동 추천 응답은 유지한다. 내장 웹 검색 성공과 HTTPS 출처가 없으면 추천을 완료하지 않는다. 키워드 중복·누락은 실패로 표시하며 검색량·상승률을 만들어내지 않는다.

`POST /api/studio/automatic`은 로그인 사용자의 암호화 추천 기록에서 선택 후보를 읽는다. 클라이언트가 보낸 카테고리·기획·출처·owner를 신뢰하지 않는다. 사용자/추천ID/후보 번호에서 결정되는 프로젝트 ID로 동시 요청과 응답 유실 재시도를 중복 방지한다. 실행기가 오프라인이면 저장된 프로젝트와 재시도 안내를 돌려준다.

대본 승인 이후 미디어 워커의 완료 CAS에서만 render를 큐에 넣는다. 내레이션은 기존 추천 목소리를 사용하며 대본 자막과 기본 타임라인을 조립한다. 직접 편집한 타임라인은 보존한다. Cloud API와 로컬 워커 모두 동일한 continuation 함수를 사용한다. 최종 업로드는 reviewed=true를 별도로 요구한다.

## 검증

- 최종 관련 추천·콘텐츠·시나리오·미디어·알림·로컬 워커 회귀 58개 통과.
- Pages API를 esbuild browser bundle로 컴파일 통과(출력 144,484 bytes, 파일 쓰기 없음).
- 로컬 워커 연계/중복 저장 거부 추가 후 자동 제작·실제 HTTP 알림 테스트 9개 재검증 통과.
- 로컬 HTTP에서 인증 전 /automatic 리디렉션, 인증 후 화면 및 모든 JS/CSS 의존성 200 확인.
- 격리 fixture `node apps/shopshorts/test/automatic-browser.mjs` (127.0.0.1:5223), 실제 앱과 API 사용. 외부 검색·미디어·업로드 제공사만 모의 처리.
- Chrome: 역사 선택 → 키워드 검색 진행 표시 → 새로고침 후 같은 카테고리/키워드 복원 → 2번 후보 선택 → 대본 생성 → 승인 체크 전 생성 버튼 비활성 → 승인 후 홈으로 이동 → 자동 제작 중인 콘텐츠 이어하기 → 발행 검수 → 검수 확인 후 모의 업로드 → 발행 완료 확인.
- 데스크톱 스크린샷 검토 후 중복 관리/숨김 스타일을 수정했다. 모바일 CSS는 구현했지만 브라우저 연결이 중단되어 모바일 실화면 검증은 미완료.
- 영상 파일은 fixture에서 실제 생성하지 않으므로 영상 품질·음성 재생 검증을 주장하지 않는다. 실제 유료 생성·운영 업로드 없음.

## 운영 반영

아직 운영 배포하지 않았다. PR별 사용자 머지 승인 필요. 배포 시 Pages 뿐 아니라 `studio-recommendations.js`를 로드하는 계정 실행기도 안전하게 재시작해야 새 keyword 필드를 생성한다. 로컬 제작 서버는 local continuation 변경을 반영하기 위해 재시작해야 한다. 서버/작업 브랜치 push는 운영 반영과 구분한다.

## PR #41 통합 재검증

- 최신 main의 수동 대시보드, 이전 작업 링크, 조회 실패 후 기존 목록 보존을 유지하며 충돌 6개를 해결했다. 자동 제작 모듈은 접지 않고 상단에 표시한다.
- 자동 프로젝트 버튼은 data-auto-action으로 분리하여 기존 쇼핑 큐의 전역 버튼 처리와 충돌하지 않게 했다. 요청 실패 시 기존 버튼의 비활성 상태도 복구한다.
- 자동·수동·콘텐츠·추천·시나리오·알림·실제 로컬 HTTP 통합 회귀 68개 통과, Pages API bundle 144,484 bytes 컴파일 통과.
- 통합 후 브라우저 연결은 시간 초과되어 새 화면의 브라우저 재검증을 완료하지 못했다. 앞선 fixture E2E와 이번 HTTP/통합 테스트 결과를 구분한다.
- Pages /index.html rewrite가 홈으로 정규화되는 문제를 피하려고 canonical / 대상으로 수정했다. 별도 세션 PR #43의 동일 수정이 미리보기 10경로 200을 통과했다는 결과를 수신했으며, 이 브랜치에서도 자동 경로와 호환 별칭에 같은 보정을 포함한다. PR #43 자체 머지는 수행하지 않는다.
- 사용자 계속 요청에 따라 준비된 PR #40 머지 및 운영 반영을 진행 중이다. 운영 완료 여부는 배포 후 실제 응답으로 확인한다.
