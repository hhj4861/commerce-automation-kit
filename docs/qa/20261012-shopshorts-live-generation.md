# Shopshorts 운영 실생성 검증 — 2026-10-12

- 목표: 운영 브라우저 추천·시나리오부터 미디어·새 Kyle 음성·정렬 자막·최종 파일까지 실제 검증. YouTube 발행 제외.
- 담당/범위: 현재 Codex, Shopshorts 운영 검증. 다른 세션 파일 변경 없음.
- 기준: deploy/shopshorts bea0124f97069de8278bc6c4c0b7f93c836489ab; Pages a27b0b91; broker 319343f0-b890-4ebf-8959-5d7ee70028af.
- 완료 기준: 각 실제 단계 응답, 최종 파일·음성·자막·끝부분 확인, 실패·재사용 구분.

## 진행 증거

- 개인 Google 로그인 성공. 운영 브라우저에서 Codex 연결 및 제작 워커 온라인 확인.
- ElevenLabs TLS 복구: 인증 subscription/선택 음성 조회 각각 HTTP 200. Kyle RU7aSi6lT4uQBXMLgDxK, 잔여 문자 34,465. 비밀값 기록 없음.
- Higgsfield 공식 account status 잔액 10.65. 신규 유료 도입 생성 대신 자체 Sapporo 기존 opening.mp4 재사용 예정. 새 Higgsfield 생성 성공으로 보고하지 않음.
- 브라우저 추천 첫 요청: 약 240초 후 연결 시간 초과. LLM 계정 워커 PID 7607은 10월 8일부터 실행되어 이번 승인 배포 소스 미로드.
- 동일 자격의 broker poll 성공, queued 작업 없음 확인 후 launchctl kickstart. 이전 PID 종료, 새 PID 58363. 브라우저 추천 재요청 중.

현재 결과: 진행 중. 다음: 추천 결과와 대본 검증, QA 프로젝트 실제 미디어·TTS·렌더 실행.

## 실제 진행 업데이트

- 추천: 2회 연결 시간 초과 후 실제 웹 검색 추천 3개 완료. 추천 ID dd90afd7-f049-412a-87bd-b9996fa6340e. 수원 서북공심돈·북 마운틴 도서관·퀸 알리아 공항, 검색 근거 5개.
- 운영 브라우저에서 서북공심돈 선택 → 프로젝트 7e88650a-54f0-6eb6-3dac-c4744f24afa4 생성 → 자료 확인 → 대본 작성까지 진행, 이후 계정 갱신 연결 시간 초과로 실패.
- 원인 실측: 같은 launchd 환경의 broker read 진단 3회: 3136ms 성공, 12264ms 성공, 20013ms TimeoutError. 단일 전송 실패에 작업 controller abort하는 코드 경로 확인.
- 운영 실생성 프로젝트 d4ce9ff4-6692-44af-9703-384ab0f136ae: 검수된 원본 recipe 그대로 신규 생성(기존 QA 제목 변경 초안은 보존). 대본 확인·승인 → 자체 Higgsfield opening 6,942,287바이트 업로드 → media task 2a1d7291-ece4-4bea-89f2-38a4d13866a8 실행.
- 새 Kyle 음성 6개 생성(1.1배): 3.178299 / 6.348821 / 5.664467 / 8.159274 / 6.985465 / 7.652336초. Whisper 단어 정렬 6건 생성(coverage 0.8095~1.0, 정확성 최종 시청 검증 전).
- 첫 본문 sunlight 실렌더 완료: 1080×1920, Cycles GPU, 48 samples, 160 frames, SHA256 1d5545335d44dae9c3484b7d09293de4f67671a673deaafe22b503270b1ce8b4. 나머지 본문 진행 중.
- 수정 worktree account-transient-lease, 04b5cfd. 계정·Codex·시나리오 51개 검사 통과. 아직 운영 적용 아님.

## 현재 미완료 경계

- 연결 복구 PR: https://github.com/hhj4861/commerce-automation-kit/pull/197 (main), https://github.com/hhj4861/commerce-automation-kit/pull/198 (deploy/shopshorts). 본인 변경 커밋·upstream push 완료. 두 PR의 머지·운영 적용 승인 요청 중.
- 진단용 계정 워커는 정상 종료했고 LaunchAgent com.cak.llm-accounts로 복구(PID 47251). 임시 launchd 네트워크 진단 작업도 제거했다. 계정·인증 변경 없음.
- 완성 영상은 아직 없음. 미디어 작업은 운영 워커 PID 73202에서 계속 실행 중이며, 두 번째 신규 본문(load)을 렌더하고 있다. 첫 본문 H.264 1080×1920/24fps/6.666667초/160프레임을 ffprobe로 확인.
- 운영 확인 URL: https://shopshorts-dash.pages.dev/studio/automatic?project=d4ce9ff4-6692-44af-9703-384ab0f136ae
- 별도 추천→대본 검증 URL: https://shopshorts-dash.pages.dev/studio/dashboard?mode=auto&project=7e88650a-54f0-6eb6-3dac-c4744f24afa4
- 남은 일: 승인 후 계정 워커 수정 반영·시나리오 재검증, 본문 완료·자동 합성·final-verification 검사·실제 자막/음성/끝부분 확인, 최종 MP4를 /Users/admin/Downloads/vedio 에 저장. 신규 Higgsfield 생성은 잔액 제한으로 이번 검증에 포함되지 않음.
- 전체 실생성 검증 완료로 보고하지 않는다. 브라우저·추천·음성·자막 정렬·첫 본문 성공과 전체 E2E 성공을 구분한다.

## 승인 후 운영 반영

- 사용자 승인 후 PR #197(main), #198(deploy/shopshorts) 정상 머지. #198 최초 CI 이벤트 누락으로 필수 검사가 Expected 상태였으며, PR 재오픈 후 실제 GitOps 검사 run 38253579981 성공을 확인하고 머지했다. 관리자 우회·검사 상태 수동 조작 없음.
- 운영 checkout 6ecbf5c8ef59912cb1204a2f00efa7367f200f2e. 변경은 계정 워커·해당 테스트·QA 문서 3개뿐이다. Pages/broker 변경이나 재배포는 필요하지 않다.
- 실제 운영 의존성에서 계정·Codex·시나리오 51개 검사 재실행: 51 통과, 실패 0.
- com.cak.llm-accounts만 재시작(PID 51254), 기존 미디어 워커 73202와 렌더는 유지했다.
- 브라우저에서 대본 재시도 요청: cdb0f72a-e4ef-44c9-8a76-e301897a87aa, 2026-10-12T13:12:35Z. 서버 running 및 화면 자료 확인 중 확인. 아직 성공 판정 전이다.
- 영상 프로젝트는 revision 20, 장면 4/6(hook 재사용 + sunlight/load/air 신규 생성). wheels/ending 및 최종 합성은 진행 중이다.
- 반영 후 첫 대본 재시도: 자료 확인→대본 작성까지 진행한 뒤 CODEX_TIMEOUT으로 실패. 이전 lease 만료와 달리 실패 상태·메시지가 정상 저장됐다. createCodexGenerator의 호출당 제한은 180초이며 작업 전체 마감은 15분이다. 단일 Codex 호출 지연이 일시적인지 확인하기 위해 동일 UI 재시도를 한 번 더 수행하고, 반복되면 동일 재시도만 계속하지 않는다.
- 두 번째 요청 186330af-eefb-4d03-98e4-237c0b0ccc45도 scenario 단계 CODEX_TIMEOUT으로 실패. 계정 임대 갱신과 실패 저장은 유지됐다. 동일 무수정 재시도는 중단했다.
- 후속 d85abcd306e2a454acb6a9dc943163150436ef9d: 시나리오 호출당 360초(전체 15분과 취소는 유지), 갱신 대기 1개 제한. 관련 53개 검사 통과. 느린 갱신 재현 검사는 이전 구현에서 읽기 12회로 실패, 수정본에서 갱신·완료 2회로 통과했다.
- 후속 PR https://github.com/hhj4861/commerce-automation-kit/pull/201 (main), https://github.com/hhj4861/commerce-automation-kit/pull/202 (deploy/shopshorts). 필수 GitOps·공유 주제 계약 CI 모두 통과. 별도 사용자 머지 승인 대기이며 운영은 여전히 6ecbf5c다.
- 본문 wheels 완료, 마지막 ending 렌더 진행. 직접 확인한 air·wheels·ending 프레임에서 공기압 화살표·바퀴·고정 지붕과 이동 잔디판 구도를 확인했다. 최종 자막·음성 합성 전이다.

## 최종 영상 실생성 결과

- 5개 본문 Blender 장면 모두 새로 생성됐다. 도입은 소유한 기존 Higgsfield 영상 재사용. 6개 Kyle 음성·단어 정렬 자막·modern-v1 헤더와 자막이 합성됐다.
- 미디어 완료 뒤 render a29171b4-c879-40a6-8401-13d64c69d974가 13:54:37Z에 자동 큐 등록됐지만 공유 워커가 가져가지 않았다. 다른 작업의 ID·상태 조회는 자동 승인 검토가 범위 밖 운영 메타데이터로 차단했다. 우회 조회·공유 워커 재시작 없이 해당 프로젝트 ID 한 건만 공식 claim/checkpoint/complete API와 승인 배포본 executeStudioTask로 실행했다(14:03:05Z claim). 자동 큐 소비 성공으로 보고하지 않는다.
- 14:03:18Z 최종 검사 통과, 운영 task done / 발행 검수 화면 확인. YouTube 발행은 하지 않았다.
- 완성본: 41.066667초, 1080×1920, 12,353,538바이트. SHA256 013b53be950da516712a528a935f4f5ad5abc7c9d9650912dc3044f8e1bdd670.
- 공식 assets/final 다운로드 응답과 render SHA 일치. 저장: `/Users/admin/Downloads/vedio/shopshorts-sapporo-live-20261012.mp4`.
- 자동 검사: 전체 디코딩 성공, 검은 화면 0건, 6개 장면 음성 존재, 대사 끝 길이 검사 통과. 선택 음성 RU7aSi6lT4uQBXMLgDxK, 1.1배. 별도 음량 실측 -28.01 LUFS / true peak -5.77dBTP: 재생 가능한 음성이나 작은 편이며 음량 균일화 개선이 필요하다. 청음 완료를 주장하지 않는다.
- 최종 프레임 1.2초/19초/39.5초 직접 확인: 흰색·민트 헤더, Pretendard 두 줄 자막, 개념도 표기, 완결된 마지막 문장 확인. 검수 이미지: iCloud `gpt 작업/commerce-automation-kit/20261012-live-e2e/*-final.jpg`.
- 운영 편집기 5/5 업로드 화면의 실제 video: 1080×1920, readyState 4, muted false, error null. 재생 시작 후 currentTime 41.066667까지 도달해 종료한 것을 DOM으로 확인했다. 후속 재생은 19.747409초에서 일시정지해 두었다. 화면의 제작 워커 오프라인 표시도 확인돼 자동 큐 소비를 정상이라고 판정할 수 없다.
- 실측 소요: 미디어 요청 11:56:38Z → 렌더 큐 13:54:37Z(약 118분). 지정 합성 시작 → 최종 검사 약 13초. 현재 로컬 3D 렌더는 느리며 즉시 제작 성능으로 보고하지 않는다.

**전체 자동 E2E는 미완료**: 추천과 등록 레시피의 미디어·음성·자막·합성은 확인했지만, 두 프로젝트를 나눠 검증했고 대본 LLM 성공·공유 워커의 렌더 자동 소비가 남았다. PR #201·#202 머지 승인 및 최소 작업 상태 조회 승인 대기. 신규 유료 Higgsfield 생성은 이번 범위에서 수행하지 않았다.
