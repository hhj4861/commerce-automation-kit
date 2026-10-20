# Hanmadi 원문 확보 계획 보존

목표: 수집에서 고른 파일 준비/채널 권한 확인 방법을 원본별로 저장하고 재방문 시 다음 행동을 유지한다.

범위/담당: 현재 Codex 단독(workers/Claude OFF). 기존 본인 worktree `hanmadi-unified-content-flow`, `feat/hanmadi-acquisition-plan`. 기준 main `c0364cc3987cb71d5389547694f7ace6cfa244c7`. refocusing 실행은 work/topology 노드 미설정으로 trace gap을 반환했다. 실제 저장소 설계·배포·감사 문서를 직접 대조했다.

완료 기준: 검색 수집→원본 계획 저장→새로고침/재방문→명시적 계획 변경 보존, 다른 창 충돌409, 실제 원문/준비 상태/작업 이력 미변경, 기존 자료 호환. 독립 acquisition revision을 사용해 원문 처리 job을 무효화하지 않는다. 재수집은 이미 저장한 계획을 덮어쓰지 않는다.

확보 방법은 작업 계획이며 이용 권한·실제 확보·자막 공급·정리 완료가 아니다. 새 공급자/키/권한/운영 콘텐츠/유료 호출/게시 없음. 기존 채널 계획은 미연결 상태에도 계획으로 저장 가능하며 실제 가져오기는 기존 권한 검사를 따른다.

현재: 구현·로컬 검증 완료. 자기 변경 커밋·push·PR까지 진행한다. 머지·운영 배포는 새 PR의 명시 승인 전까지 하지 않는다.

## 구현과 검증 증거

- 검색 수집 선택을 `acquisitionMethod`로 전달해 공통 원본에 저장한다. `file`/`channel`만 허용하며 기존 필드 삭제·의미 변경 없이 optional `acquisition`을 추가했다. `ready`는 실제 처리 상태에서 파생하며 계획 값으로 받지 않는다.
- 기존 원본의 최초 계획 설정과 명시적 변경을 지원한다. 계획 전용 revision으로 stale 편집409, 같은 방법 반복 저장 시 불필요한 증가 없음. 재수집은 기존 계획을 유지한다. 기존 원문 저장·처리·권한·이용 근거 검사는 그대로다.
- 원본 목록/상세에 저장 방법과 다음 행동 표시. 계획 폼을 저장해도 미저장 원문 editor를 재생성하지 않는다. 등록 시 미정은 허용하며 기존 자료는 마이그레이션 없이 읽힌다.
- 전체 단위 테스트 **294개 통과**, 변경 lint·전체 타입 검사·E2E 문법·diff check 통과.
- `media-final` E2E **프로세스 exit0**, 실제 Next UI→owner/origin API→격리 파일 저장소→화면 복원 통과. 검색 수집 계획 전달, 변경 후 새 방문 복원, stale409/다른 origin403, 계획만으로 원문/job/용도가 늘지 않음, 미저장 입력 유지, 네 언어 원문·실패 복구·삭제·모바일 회귀를 확인했다. 모델/자막 공급자는 fixture 또는 미호출이며 실제 곡 확보·게시·학습 성공으로 확대하지 않는다.
- 첫 로컬 실행은 Next SWC 바이너리 누락으로 자동 다운로드가 fixture 외부 호출 차단에 걸려 기동이 멈췄다. 본인 Next 자식만 종료해 실패 로그를 보존했다. 공식 npm 고정 버전 `@next/swc-darwin-arm64@16.3.6`에서 누락 바이너리만 복구했고 선언/lockfile 변경은 없다. 테스트 기동 요청에 4초 timeout·전체 기동90초 한도를 추가했다.
- 그다음 테스트는 새로 추가한 수집 언어 exact label 선택자 오류로 실패했다. 첫 수정은 상대경로 오류로 적용되지 않아 같은 실패가 한 번 더 났으며, 절대 경로로 선택자를 기존 DOM 기준에 맞춘 뒤 최종 실행이 통과했다. 실패는 통과로 계산하지 않는다.
- 산출물: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261018-acquisition-plan/` (`unit.log`, `media-final/result.json`, 스크린샷·서버 로그). 최초 실패는 `media/server.log`, 선택자 실패는 `media-repaired-swc`와 `media-label-fix`에 보존했다.
- UI 상태/서버 저장/충돌 경계를 직접 검토했다. 클라이언트는 서버 모듈을 type-only로 가져오고 파생 상태에 별도 effect/store를 만들지 않는다. 별도 에이전트·Claude 검토는 정책 OFF로 요청하지 않았다.

실제 음악 원문 공급은 여전히 허용된 파일 또는 권한 있는 채널이 필요하다. 이번 구현은 확보 방법의 영속화이며 새 공급자 연결·실제 노래의 가사 확보가 아니다. 운영에는 아직 미반영이며 PR CI의 production build·음악 회귀 결과를 추가 확인한다.
