# 제작 실행 상태와 운영 복구 (2026-09-25 갱신)

## 9월 25일 E2E에서 확인한 복구

임시 운영 checkout `/private/tmp/cak-production-20260920`이 사라져 제작 서비스가 `EX_CONFIG (78)`로 실패했다. 계정 실행기는 로그인 자동 등록 위치가 아닌 Application Support의 plist로만 등록돼 있었고 확인 당시 로드되지 않았다. 두 실행기를 영구 checkout `/Users/admin/workSpace/shopshorts-production`과 `~/Library/LaunchAgents`로 복구했다. 실행 소스는 이미 머지·배포 승인된 PR #22의 `de39cf8f79beeb02eb4e04f68f1a30bf3d968a33`이다.

운영 Google 로그인 → 기획 저장 → 실제 연결 계정으로 시나리오 생성 → 화면 이탈 → 결과 재조회에서 24초/3장면 저장을 확인했다. 재진입 시 검수 전 대본을 건너뛰는 화면 오류는 별도 작업 브랜치에서 수정했다. 이 화면 수정의 운영 반영은 후속 PR 승인·머지 후 진행한다. 상세 근거와 미검증 범위는 [E2E 기록](qa/20260925-studio-e2e.md)을 참고한다.

## 확인된 원인과 현재 운영

- 운영 체크아웃은 PR #17에 머물러 있었다. Codex·Claude 시나리오 구현 PR #18은 main에 머지됐지만 배포되지 않았다.
- 계정 추천 실행기만 launchd로 실행 중이었으며 별도 제작 서비스는 등록되지 않았다. 제작 heartbeat는 9월 20일에서 멈춰 있었다.
- PR #18의 broker → 계정 실행기 재시작 → Pages 배포를 수행했다. 운영 계정 상태의 `available: true`, `scenarioAvailable: true`를 확인했다.
- 실행 전인 구버전 Gemini 시나리오 1건은 기존 claim/failure API의 revision·task ID 검증을 통해 재시도 가능하게 종료했다. 기획·장면은 삭제하지 않았다. 새 호출은 로그인한 사용자의 연결 계정을 사용한다.
- 이 작업 중 실제 구독 모델로 시나리오를 다시 생성하지는 않았다. 계정별 생성 경로는 테스트 대역을 사용해 검증했다.

## 상태 UI

진행 안내는 하나만 표시한다. 실패 → 상태 확인 불가 → 연결 대기 → 실행 순서 대기 → 실행 중 → 완료 순서로 우선순위를 적용한다. 대기 상태에는 회전 애니메이션을 표시하지 않는다. 서버에서 `running`을 확인하고 해당 실행기가 연결된 경우에만 실행 중으로 표시한다.

시나리오는 계정 실행기, 이미지·영상·렌더·업로드는 제작 서비스의 상태를 사용한다. 4초마다 연결 상태를 갱신하며 입력 중인 편집 내용은 교체하지 않는다. 서버 연결을 확인하지 못하면 진행 중이라고 단정하지 않는다. 실패 안내에는 재시도, 미연결에는 계정 연결, 오프라인에는 연결 확인 버튼을 제공한다.

구버전의 대기 시나리오는 CAS로 재시도 가능 상태로 바꾼다. 계정 실행기에 접수된 작업과 이미 실행 중인 작업은 이 복구 대상이 아니다.

## 제작·계정 서비스 설치와 갱신

`com.cak.llm-accounts`와 `com.cak.studio-production`을 각자의 LaunchAgent로 유지한다. 관련 없는 쇼핑 큐나 공유 Codex 인증을 실행하지 않는다. 시크릿은 기존 실행기 키를 통해 Cloudflare에서 메모리로 불러온다. plist에 실제 키·토큰을 쓰지 않는다.

1. 영구 경로의 깨끗한 운영 checkout을 승인된 머지 커밋으로 갱신한다. Node 의존성과 `requirements-claude.txt`의 Python 의존성, `node`/`codex`/`claude` 실행 경로를 준비한다. UI 변경이 있으면 승인된 커밋으로 Pages도 배포한다. 임시 경로나 임시 폴더를 가리키는 심볼릭 링크는 운영 실행 경로로 사용하지 않는다.
2. 실행 중인 계정·제작 작업이 끝났는지 확인하고 설치한다. 현재 체크아웃이 구현용 임시 worktree여도 `--checkout`은 영구 운영 경로여야 한다. 설치기는 임시 운영 경로를 거부하고, 새 plist를 검증한 뒤 기존 서비스를 교체한다. 기본값은 제작 서비스만이며, `--service accounts` 또는 `--service all`로 계정 실행기도 관리한다.

```sh
python3 apps/shopshorts/install-studio-service.py --checkout /Users/admin/workSpace/shopshorts-production --service all
python3 apps/shopshorts/install-studio-service.py --checkout /Users/admin/workSpace/shopshorts-production --service all --install
```

등록 위치: `~/Library/LaunchAgents/com.cak.studio-production.plist`, `~/Library/LaunchAgents/com.cak.llm-accounts.plist`. 로그: `~/Library/Logs/Shopshorts/studio-production.log`, `llm-account-worker.log`. 해당 사용자 로그인 시 자동 시작하고, 비정상 종료 후 재시작한다. Mac이 잠자기·전원 종료 상태면 실행할 수 없다. 상시 서버 이전 시 두 Node entry를 같은 실행기 키와 환경으로 서비스 관리자에 등록한다.

3. `/api/studio/config`의 최신 제작 heartbeat와 계정 실행기의 시나리오 지원을 확인한다. 빈 큐에서도 프로세스가 유지되는지 확인한다.

긴 작업 중에도 heartbeat는 갱신한다. 중복 tick은 같은 작업을 재실행하지 않으며, 종료 신호는 현재 실행 중인 작업이 끝날 때까지 기다린다. 시크릿 회전 시 서비스를 재시작한다. 이미지·영상용 Gemini 키의 과거 401 오류는 시나리오 구독 전환과 별개이며, 이 변경은 이미지·영상 생성 성공을 주장하지 않는다.

## 검증

관련 전체 Node 회귀, 계정 상태의 인증·비밀정보 제외, 구버전 대기 복구, 서비스 단독 프로세스 유지·종료, 브라우저 7개 상태와 모바일 폭을 확인한다. 테스트 서버·LLM 응답 대역과 실제 운영 배포 검증을 구분한다.
