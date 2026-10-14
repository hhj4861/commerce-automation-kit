# Hanmadi 자체 가사 동기화 학습

- 요청: Musixmatch 기능을 REA로 분석해 Hanmadi에 자체 구현. 공급자 API 구매 제안은 이번 목표가 아니다.
- 담당: 현재 Codex / feat/hanmadi-synced-lyrics. base 221cbce.
- 범위: 시간 가사 입력·편집, 재생 중 줄 강조·탐색·반복·속도, 기존 검수/단어/회화/복습 연결.
- 완료 기준: 입력 오류 회귀, 네 언어 연습곡·관리 곡 브라우저 검증, 타입/린트/관련 테스트, 커밋·push·PR. 운영 반영은 머지 승인 뒤.
- 상태: 구현 중. 실제 Pretender 가사 데이터는 미등록이며 이번 분석에서 타사 가사를 가져와 저장하거나 AI 입력에 쓰지 않는다.

## REA 근거 (2026-10-14)

공개 웹 UI를 REA capture_browser_scenario로 실행했다. 소스 복제가 아닌 기능 관찰이다.
- 발견 화면: ev_ffb7fceb2ea025e4f2761d448705d1f5dde32b394a0d82747f8d2facad23ce3d — 시간 동기화 가사·번역 안내, 곡 목록.
- 검색 폼: ev_d11dedf2336e097e61d52e2b44525b29a890b950cc9c205419ef3b269e4a49ba — 제목/아티스트/가사 입력.
- 검색 실행: ev_3efa55251e819c856d776383df05bd8719334d725814d483681dec18105b0070 — 입력 후 빈 문서. 결과 성공은 미확인.
- 곡 상세: ev_8aa4151359ca046da27a10696541384fb21a73edf0d04e1047b606a711d281c1 — verse/chorus 구분, Sync Verified, lyric video, 재생 slider. 로그인 뒤 편집·모바일 앱의 내부 구현은 미확인.
- 참고: https://www.musixmatch.com/discover , https://www.musixmatch.com/lyrics/Taylor-Swift/Anti-Hero
- 공식 YouTube IFrame API: https://developers.google.com/youtube/iframe_api_reference (seekTo/getCurrentTime/playbackRate; native player API만 사용).

Musixmatch의 전체 기능을 재현했다고 주장하지 않는다. 플랫폼에 필요한 동기화 학습 흐름을 자체 코드로 구현한다. 검수 후 게시한 구간만 학습자에게 제공한다.

## 구현·검증 결과

- 자체 코드: TXT/SRT/VTT/LRC 입력, 반복 후렴·offset 처리, 마지막 끝 시간을 추측하지 않는 편집기, 겹친 시간 거부.
- 관리자: 원문 줄 불러오기 → 초 단위 편집/공식 영상 현재 위치 찍기 → 구간 미리듣기 → 원문 적용 → 기존 생성·JEV·사람 검수·게시.
- 학습자: 실제 재생 시간에 따른 구간 강조, 줄 탐색/반복, 속도, 발음/번역 표시, 기존 단어·회화·저장·복습. 듣기만으로 학습 진도를 변경하지 않는다.
- 단위 테스트 263개 PASS, 수정 파일 ESLint·전체 TypeScript PASS, Next 프로덕션 빌드 PASS.
- 최종 owned-music 브라우저 E2E PASS: 관리자 시간 수정/거부, 검수·게시, YouTube API 모의 동기화·반복·속도·재생 제한·정리, 네 언어 실제 연습곡 오디오, 저장·복습·계정 분리, 320/390/1024 폭.
- 실외부 연결: YouTube 공식 API 문서 샘플 M7lc1UVf-VE는 실제 재생 → 0.75배속 → 두 번째 시간 구간 강조 PASS. LLM/JEV는 HTTP fixture이며 유료 호출 없음.
- Pretender(TQ8WlA2GXbk): 두 실임베드 시도에서 YouTube가 “이 동영상은 볼 수 없습니다” 표시. API 연결/속도 목록은 확인됐지만 이 곡의 실재생 동기화는 FAIL/미검증. 지역·권리·재생 환경 중 정확한 원인은 미확정. 우회하지 않음.
- 실곡 가사 미등록은 별도 남은 조건이다. 기능 자체 구현은 가사 원문 자동 확보를 뜻하지 않는다. Musixmatch 데이터/코드 복제 없음.
- 증적: iCloud gpt 작업/commerce-automation-kit/20261014-synced-lyrics/{e2e-final,e2e-live-control,e2e-live-2,unit-tests.log,build.log}. live-control의 가사 표시는 자체 작성 fixture이며 Pretender 가사가 아니다.
- 적용: 로컬 구현 브랜치. 운영 미반영. PR CI 확인 후 머지 승인 요청.

- 추가 회귀: `test:music` 전체 PASS. 기존 licensed-feed 12줄 흐름과 네 언어 진단·수업·음악·단어·회화·저장 재시도·복습·재접속 확인. 생성된 Next 지침 파일은 사용자 지시에 따라 커밋에서 제외하고 해당 worktree의 생성본만 정리했다.
