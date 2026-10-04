# 본문 모션 템플릿 운영 반영 — 2026-10-04

PR #138·#139 머지, 제작 워커 복구·갱신, Pages 배포, 운영 브라우저의 선택→생성→미디어 저장→편집 재생을 확인했다. 유료 AI 생성·TTS·발행은 실행하지 않았다.

## 반영한 버전

- [PR #138](https://github.com/hhj4861/commerce-automation-kit/pull/138): `a8c02003b40e7eea4179a88702a358689e650646`에 정상 merge.
- #139를 main 기준으로 변경하고 파일 범위·성공한 GitOps 검사를 확인한 뒤 [PR #139](https://github.com/hhj4861/commerce-automation-kit/pull/139)를 정상 merge: `ae6dc868d6744e5e59e52d1204e5fd659e16fbb5`.
- #139 최종 head `f5d79ca`의 문서 정정은 직접 diff 확인: 첫 장면의 motion 지정을 거부하며, 생성 provider 자체를 강제하는 기능은 아니다.
- 운영 소스: `/Users/admin/workSpace/shopshorts-production`, 위 `ae6dc86`의 detached Git worktree. 기존 작업 checkout은 전환하지 않았다.
- 운영 Pages: https://shopshorts-dash.pages.dev
- 배포 URL: https://9c682612.shopshorts-dash.pages.dev
- 기존 production branch는 `main`이며 `deploy/shopshorts` 원격 브랜치는 없었다. 이번 반영은 기존 Direct Upload 방식이다. 플랫폼 GitOps 활성화를 완료했다고 주장하지 않는다.
- 이전 Pages 배포: `092c3248-55a6-4b37-8fb7-0714cf6a546b`, source `8596e3b`.

## 워커 복구와 검증

1. 기존 LaunchAgent `com.cak.studio-production`의 WorkingDirectory가 사라져 프로세스가 없고 종료 코드 78이었다. 기존 실행기 키는 로컬에 0600으로 보존돼 있었다. 새 키를 생성·복사하지 않았다.
2. 영구 경로를 정확한 머지 커밋으로 복구하고 lockfile 기준 전체 `npm ci`를 실행했다. 앱만 설치한 첫 시도는 원자 CLI의 `tsx`가 빠져 실패했으므로 전체 workspace 설치로 보완했다.
3. 긴 iCloud TMPDIR은 tsx의 macOS 소켓 경로 길이 문제를 일으켰다. 실제 저장소는 iCloud를 유지하고 짧은 심볼릭 링크 경로로 검증했다. 이후 운영에는 영구 링크 `/Users/admin/.cak-motion-tmp`를 사용한다.
4. 복구된 운영 소스에서 Node 20.19.3 + `SHOPSHORTS_MOTION_NODE=/Users/admin/.nvm/versions/node/v22.23.3/bin/node`로 전체 테스트 **326/326 통과, skip 0**. 실제 HyperFrames 렌더·180프레임·정지 프레임 유지 검사도 포함한다. 유료 provider 호출은 해당 테스트에서 오류를 던지는 stub으로 금지한다.
5. 기존 plist를 `/Users/admin/Library/Application Support/Shopshorts/studio-production-before-motion-20261004.plist`에 백업했다. 인증 및 Node 20 주 프로세스는 보존하고 모션 Node 22, 작업 디렉터리와 임시 경로만 추가했다.
6. 첫 bootstrap 오류 때 이전 plist로 복구했다. 이후 기존 job 등록 해제를 확인하고 재등록하여 성공했다. 확인 PID 27745, LastExitStatus 0. 등록 해제 확인을 추가한 뒤 성공했지만 첫 오류 원인을 확정하지는 않는다.
7. 기존 인증으로 제작 API 200 및 재시작 직전 대기·실행 작업 0을 확인했다. Pages 구버전은 `motion` 필드를 저장하지 않으므로 로컬 capability·실렌더·기존 heartbeat를 먼저 확인했다. Pages 배포 후 운영 `/api/studio/config`에서 **motion:true**, image/video/voice:true 및 최신 workerAt을 확인했다.

## 운영 브라우저 E2E

[검증 프로젝트](https://shopshorts-dash.pages.dev/studio?id=c3f2c428-adbc-40f2-8a66-6dd7b33e0fef)

- 기존 Google 계정으로 실제 로그인했다. 별도 검증 프로젝트만 생성했으며 기존 사용자 프로젝트는 수정하지 않았다.
- 도입부는 직접 만든 6초 합성 클립을 업로드했다. 실제 Higgsfield 도입부 제작 품질이나 이음새 검증은 아니다.
- 두 번째 장면에서 UI로 `모션 템플릿 → 숫자 비교`를 선택하고 제목·항목을 수정·저장했다. 20m/35m는 예시값이며 주석을 유지했다. 첫 장면의 모션 선택은 비활성화돼 있었다.
- 공통 버튼의 과금 안내 때문에 자동 승인 검토가 한 번 생성 클릭을 거절했다. 실제 저장 상태(첫 장면 asset 존재, 미생성 장면은 motion 한 개)와 실행 분기 및 유료 호출 금지 테스트를 확인한 뒤 같은 UI 동작이 승인됐다. 다른 채널로 생성 요청을 우회하지 않았다.
- UI 생성 요청 → 운영 worker claim → `motion-hyperframes` asset 저장 → 작업 `done` → **2/2장면 준비 완료**를 확인했다. 처리 지연이 있었으므로 이번 1건으로 지연 성능을 보장하지 않는다.
- 생성 미디어 카드에서 실제 재생 시간이 0초→6초로 진행했고 오류가 없었다. 편집기에서 검증 프로젝트의 목소리를 `내레이션 없음`으로 저장한 뒤 6초 위치부터 재생했다. playhead가 187프레임으로 진행했고 모션 video가 1080×1920, paused:false, currentTime 0.327325로 확인됐다. 9초 위치의 숫자 비교 그림도 화면으로 확인했다.
- 운영 asset을 다시 내려받아 ffprobe로 H.264, 1080×1920, 6.000초, 180프레임을 확인했다. 편집 저장 뒤 revision 11에서는 task가 null로 초기화됐지만 생성 asset과 `motion-hyperframes/countup` 정보는 보존됐다.
- 운영 최종 합성 렌더·유료 내레이션·Higgsfield 재생성·플랫폼 발행은 이번 E2E 범위에 포함하지 않았다. 로컬 P1 E2E의 최종 합성 검증과 구분한다.
- JEV 운영 활성화·추가 호출·계정 실행기 설정은 변경하지 않았다.

## 산출물과 복구 기준

비밀 없는 테스트 로그·MP4·결과 JSON은 `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/motion-production-20261004/`에 있다. 운영 `SHOPSHORTS_WORK_DIR`도 이 경로의 `worker/`다. 인증 키·plist 백업은 로컬 비공개 저장소에 유지한다.

- `regression-final.log`: 최종 326/326 통과. 이전 실패 로그도 보존했다.
- `intro-fixture.mp4`: 자체 제작 테스트 도입부.
- `production-motion.mp4`, `production-result.json`: 운영 생성 asset과 검사 결과.
- 웹 복구 기준은 위 이전 Pages deployment ID다. 워커 설정 복구 기준은 로컬 plist 백업이다. 원래 소스 폴더가 이미 없었으므로 백업 plist만으로 과거 소스 버전까지 복원된다고 주장하지 않는다.

Claude 35652와 전용 `.git/peer-mailbox` 양방향 자동 수신을 확인했다. 수신 모니터는 30분 제한을 실제 만료 후 갱신했으며 영구 백그라운드 서비스로 설치한 것은 아니다. Claude는 문구 정정을 맡았고 머지·운영 변경은 Codex 리드가 수행했다.
