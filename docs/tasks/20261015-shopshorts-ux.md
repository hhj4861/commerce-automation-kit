# Shopshorts 제작 동선 정리 · 2026-10-15

- 목표: 새 제작과 이어하기를 구분하고, 보조 도구의 반복 노출을 줄인다.
- 담당: 현재 Codex 세션 단독. worker/Claude 정책 파일 없음 → OFF. 운영 변경·유료 생성 없음.
- 기준: origin/main 57da805, feat/shopshorts-ux-simplify 격리 worktree.
- 범위: 공통 탐색, 제작실 양식 우선 배치, 기존 작업 관리 접기, 내 영상 필터 초기화 오류 수정. 서버·인증·사람 승인 게이트는 변경하지 않는다.
- 완료 기준: 모든 기존 경로 접근, 프로젝트 이어하기/검수 유지, 데스크톱·모바일 확인, 관련 테스트, 본인 변경 커밋·push·PR. 머지·배포는 별도 승인.
- Impeccable: 공식 pbakaus/impeccable 3a923423e48893a4785cfd0db99e06e96ac98e44 / 스킬 4.5.2를 프로젝트 .agents/skills/impeccable에 설치. Apache 2.0 LICENSE 동봉. 실행 권한 복원.
- 자동 엔진: 최초 실행은 권한 비트 유실, 다음 다운로드는 sidecar 검증 실패. 공식 GitHub release에서 바이너리·sidecar를 함께 받아 Python SHA256 일치를 확인한 뒤 복구했다. engine-probe → impeccable-engine 0.1.14, detect 실실행 확인. SHA256 abbd69d540532b91e9599c41d3a6127dfbaabae5e24bafd74ff7e2fb18f4f87c. 검증 우회·자동 훅 등록 없음.
- 현재 세션 엔진 위치: 지정 산출물 폴더의 impeccable-runtime/impeccable-darwin-arm64. 공식 실행기의 IMPECCABLE_BIN 환경변수로 사용했다. 새 세션에서 프로젝트 스킬을 인식하며, 다른 Mac의 실행 바이너리 캐시는 별도 설치가 필요하다.
- 조사: 운영 자동 제작 화면에 전체 작업 관리와 접힌 생성 양식이 중복; /contents도 동일 목록; 제작 화면 mode=auto가 이후 콘텐츠 필터로 유출.
- 구현: 주요 탐색 4개 + 관리 2개, 제작/기타 도구는 접어서 유지(11개 경로 보존). 공통 메뉴가 기존 버튼을 이동하므로 SPA 리스너·아이콘·알림 배지를 보존한다. 자동 제작 양식 우선 배치, 수동 시작 단일 CTA, 기존 관리 목록은 펼칠 때 조회. 선택 작업이 없는 빈 검수 안내는 숨기되 오류 상태는 유지. 콘텐츠 필터는 /contents 주소에서만 초기화.
- 검증: 관련 5개 테스트 파일 40/40 통과. 첫 확장 실행 2건은 @resvg 의존성 누락이었으며 기존 설치 node_modules를 임시 symlink해 해결했다(설치·운영 의존성 변경 없음, 검증 후 링크 제거).
- 브라우저: 격리 fixture http://127.0.0.1:5237, 데스크톱 및 390×844 모바일 확인. 생성 양식 첫 진입 노출, 자동→내 영상 이동 시 자동+수동 전체 7건, 자동 프로젝트 대본 승인·직접 편집 링크 유지, 수동 생성 단계 진입, 모바일 전체 11개 메뉴 및 게시 문구 도구 이동, 접힌 관리 목록을 펼치면 기존 4개 자동 작업 조회를 확인. 유료 생성/운영 데이터 변경 없음. 모바일 viewport 원복.
- Impeccable 정적 점검: 수정 UI 소스 5개에서 cramped-padding(topbar)·radial-halo(기존 미디어 포스터) 경고 2개. 기준 HEAD의 index.html에도 같은 2개가 존재. 이번 동선 개선의 신규 경고가 아니며 재테마나 억제 규칙을 추가하지 않았다. linked CSS를 원래 위치에서 읽는 현재 스캔과 임시 baseline HTML의 저대비 추가 경고는 동일 조건 결과로 비교하지 않는다.
- 화면 캡처: 도구의 iCloud 직접 저장 EPERM, /private/tmp 임시 전달은 자동 승인 검토에서 사용자 저장 경로 지침 위반으로 차단. 우회하지 않았으며 별도 예외/생략 답변 대기. 화면 관찰 자체는 완료했지만 캡처 파일 저장은 미완료.
- 다음: 본인 변경 커밋·push·PR 생성. main/운영 반영은 아직 안 됨. PR별 머지 승인 필요.
- 검증 산출물: iCloud gpt 작업/commerce-automation-kit/20261015-shopshorts-ux.
