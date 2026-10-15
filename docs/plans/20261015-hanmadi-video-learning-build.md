# Hanmadi: 관리자 영상 수집에서 스터디·음악 학습까지 자체 구축

작성일/갱신일: 2026-10-15. 상태: **v2 전체 설계·42개 기능 명세 완료, 음정·리듬 로컬 기술 검증 #267 main 반영, 신규 기능의 앱 통합·운영 반영 전**.

2026-10-15 후속: [머지·배포 판단과 잔여 42개 항목](../qa/20261015-hanmadi-remaining-work.md)을 함께 본다. 기술 검증 도구의 main 반영은 학습 앱 기능 배포가 아니다.

**전체 구조는 [현재 어드민 기준 전체 설계 v2](../design/20261015-hanmadi-admin-learning-architecture.md)를 먼저 읽는다.** 이 문서는 기능별 구현/인수 기준이다. 기존 28개 기능에 관리자·학습 관리 14개를 추가했다. 원천 데이터 공급과 음정·리듬 분석은 요구사항에 포함하지만, 아직 실호출/REA·실음원 검증이 끝나지 않은 항목은 완료로 표시하지 않는다.

## 1. 제품 목표와 이번 산출물

관리자가 YouTube 영상을 수집하면 플랫폼이 실제 내용을 분석하고, 검수한 자료가 알맞은 학습 화면에서 사용되게 한다. **스터디 영상은 수업·표현·단어·대화·복습으로, 음악 영상은 원곡 감상·동기화 자막·뜻·따라 부르기·복습으로 연결한다.** URL을 수집하거나 분석 결과를 저장한 것만으로 완료 처리하지 않는다. 게시된 자료로 학습자가 연습하고 진도를 복원하는 것이 완료 기준이다.

- 담당/범위: 현재 Codex 세션 단독. 이번 작업은 독립 설계 문서이며 앱 구현·배포·공급자 계약·유료 실행을 포함하지 않는다.
- 기준: [REA 조사 보고서](../research/20261015-hanmadi-music-rea.md), 앱 소스 `cc17c81cf8fe6cb78a68cbb3230d01adfddd0776`의 일반 소스 확인.
- v2 운영 대조: 관리자 `7ef60980`, 학습 앱 `566480da`의 공개 배포 버전과 실제 관리자 메뉴 확인. 위 소스와 앱 Git tree 일치. 현재 의미 검색/모델 학습 연결 준비 전, Pretender 자막 필요 상태. 세부 관찰은 전체 설계 §2.
- 검증: 기존 경로·상태·기능과 제안 기능 구분, REA 근거 연결, 각 기능의 입력·처리·출력·인수 기준 대조.
- 다음 구현 묶음: 공통 수집·원문·작업 이력 기반 → 스터디/음악 자료 생성·검수·게시 → 학습 화면·복습 통합 순서. 실제 구현은 최신 main과 진행 중 claim을 재확인하고 별도 worktree에서 한다.

### “우리 플랫폼에 학습”의 구현 범위

| 층위 | 실제로 하는 일 | 활성화 조건 |
|---|---|---|
| 사용자 학습 콘텐츠 | 분석한 내용을 수업·음악 학습 단위로 구성해 게시 | 내용·출처·이용 범위 검수 통과 |
| AI 튜터의 자료 활용 | 게시된 표현을 기존 지식 검색/선택적 의미 검색으로 찾아 대화·설명에 사용 | 게시 revision과 접근 범위가 유효함 |
| 모델 자체 재학습 | 별도 dataset·평가·학습 job·모델 활성화 | 재학습 용도 허용, 별도 실행 확인과 평가 통과. 영상 수집으로 자동 실행하지 않음 |

기존 `learning-*`의 dataset·검색·재학습 기능을 재사용한다. 새 음악 자료를 대화에 활용하는 것과 모델 파인튜닝 완료를 같은 상태로 표시하지 않는다. 현재 관리자 교재는 단일 표현 단위이며 음악 저장소와 별개다. 완결 수업의 목표→활동→평가→복습 구조와 음악의 지식 자료 adapter는 추가 구현한다. 전체 설계 §5~6을 따른다.

## 2. REA 관찰에서 가져오는 설계 원칙

아래 R1~R5는 조사 보고서의 전체 Evidence ID·배포물 해시로 연결된다. 정적 코드와 공식 제품 설명을 참고한 **자체 설계**이며 타사 서버 알고리즘을 복원한 설계가 아니다.

| 근거 | 확인한 내용 | 적용 |
|---|---|---|
| R1 Language Reactor | 자동 정지·반복·뜻 숨김/공개·자막 이동 관련 코드/문자열 | 공통 cue 재생, 듣기 우선, 구간 연습 |
| R2 Migaku | 단어 상태 갱신·사전·카드 연결 메시지와 읽기 표시 설정 | 단어 선택 → 뜻 → 기존 단어장 → 복습, 아는 단어 상태 공유 |
| R3 Supadata | timed chunk·전사 mode·비동기 job 계약 | 영상 전사 어댑터, 단위/언어 정규화, 중복 과금 방지 |
| R4 Musixmatch | 가사/자막·곡 식별·restricted/copyright/reporting 필드 | 곡/녹음 버전 매칭과 공급자 제한 보존 |
| R5 LyricFind | 줄/단어 동기화 제품, 웹 facade의 지역 필드 | 타이밍 정밀도·지역·허용 기능별 제공 |

R1·R2의 일부 큰 번들은 분석 한도로 부분 복구됐고 실사용 비교는 하지 않았다. R3~R5의 카탈로그·계약·실제 곡 제공 여부는 미검증이다. 따라서 이 문서의 인수 시험을 통과해야 해당 기능을 완료로 본다.

## 3. 관리자부터 학습자까지의 흐름

1. 관리자 수집함에서 영상 검색 또는 URL 등록 → 메타데이터·언어 확인 → `스터디`/`음악` 선택. 자동 분류는 제안하고 관리자가 확정한다. 같은 영상에 두 용도가 있으면 원본은 공유하고 학습 자료는 별도로 만든다.
2. 자막·분석 가능한 원문·오디오의 확보 상태를 확인한다. 원문 확보와 원곡 재생 가능 여부는 독립적이다.
3. 스터디는 장면·표현·문법·난이도·문제를, 음악은 곡/녹음 버전·가사 cue·읽기·뜻·어휘·연습 구간을 분석한다.
4. LLM 초안 → 형식/근거 검사 → JEV 평가 → 관리자 미리보기·수정 → 지정 버전 게시.
5. 스터디 자료는 스터디 카탈로그/수업/대화에, 음악 자료는 음악 카탈로그/곡별 학습에 나타난다. 두 자료 모두 기존 단어장·복습·진도와 연결한다.
6. 변경·게시 취소·권한 만료 시 새 요청에서 해당 버전의 검색·표시를 중단하고 관련 캐시/색인을 무효화한다. 이전 학습 기록은 존재하지 않는 콘텐츠로 오인되지 않게 보존한다.

### 멜로디·자막을 확보하는 방법

**원곡의 멜로디 감상·구간 연습은 공식 YouTube 플레이어에서 제공한다.** 영상 ID·시간 구간을 저장하고 같은 플레이어를 seek/play한다. YouTube 오디오를 추출·분리·재호스팅하는 수집기로 구현하지 않는다. 원본 파일은 권리자가 별도로 제공하거나 자체 제작한 파일만 받는다. 이는 저장소의 공식 API·타인 콘텐츠 재사용 금지선 및 [YouTube 정책](https://developers.google.com/youtube/terms/developer-policies?hl=en)에 맞춘 구현 경로다.

| 확보 대상 | 우선 구현 경로 | 없을 때 상태/동작 |
|---|---|---|
| 제목·채널·길이·썸네일·공식 영상 링크 | 기존 YouTube Data API 검색/상세 | 불가 이유 표시, 제목만으로 내용 분석하지 않음 |
| 채널 소유 자막 | 기존 소유자 OAuth + 공식 captions API | 편집 권한 없으면 unavailable. 로그인 반복으로 해결되는 것처럼 안내하지 않음 |
| 사용 허용된 전사·자막 파일 | 관리자 SRT/VTT/LRC 입력 또는 업로드 | 원문 없음. 메타데이터 수집은 유지 |
| 외부 전사 | R3 어댑터. 공급자·원 플랫폼 이용 조건 확인 후 native 우선 | 생성은 별도 비용 확인 후 실행, 조용한 ASR fallback 없음 |
| 상업곡 가사/동기화 | R4/R5의 계약된 API, 곡·지역·용도 일치 확인 | 가사 학습 미준비. 공식 영상 감상은 별도 제공 가능 |
| 실제 오디오 파일·멜로디 분석 입력 | 자체 제작/권리자가 별도 제공한 파일 + 이용 범위 기록 | 원곡 재생/자막 학습은 유지, 음정 분석 기능만 미제공 |

Supadata·Musixmatch·LyricFind의 내부 시스템을 자체 복제하는 것이 아니다. **수집 관리·검수·학습 엔진·플레이어·복습은 자체 구축하고, 원천 자료는 승인된 입력/공식 공급 경로와 교체 가능한 어댑터로 연결한다.** 기존 공개 영상 모델 입력도 공급자의 지원·이용 범위를 확인한 경우에만 사용한다. 모델이 “봤다”고 답하는 것만으로 자막 원문 확보가 되지는 않는다.

## 4. 기능 목록과 기능별 구현

표의 파일 경로는 `apps/hanmadi/` 기준이다. “기존”은 기준 revision의 코드 존재이며 운영 실호출 완료를 뜻하지 않는다. 신규 파일·액션은 모두 **제안**이다.

### 4.1 공통 관리자·수집 기반

| ID/우선순위 | 기능·현재 상태 | 구현 방법 | 기능별 완료 기준 |
|---|---|---|---|
| C01/P0 | 통합 영상 수집함 / 음악·일반 영상 경로는 기존 | `youtube-video-search.tsx`, `music-video-collection.tsx`, `video-preparation-queue.tsx`를 공통 수집 화면으로 조합. URL은 video ID로 정규화하고 공식 검색/상세 재사용. 원본별 용도·자료 상태를 표시 | 같은 URL 변형을 다시 넣어도 중복 원본 없음. 음악·스터디의 개별 초안은 유지 |
| C02/P0 | 용도·언어·레벨 지정 / 일부 기존 | 수집 항목에 `uses: study/music`, targetLanguage, scene, level 추가. 모델 분류/언어 감지는 confidence와 근거를 가진 제안. 관리자 확정 전 게시 금지 | 음악·강의·혼합·언어 불일치 사례를 수정 가능. 음악을 일반 스터디로 자동 게시하지 않음 |
| C03/P0 | 출처·권한·자료 확보 / 음악 원문 입력·소유 자막 기존 | `music-collection.ts`, `youtube-music.ts`, `music-source.ts`의 경로를 공통 source 서비스로 추출. 표시·번역·파생 문제·AI 처리·오디오 분석·재학습 권한을 개별 관리. 기존 boolean만으로 새 용도 허용 안 함 | 승인된 원문은 재입력 없이 두 파이프라인 사용. 허용되지 않은 기능만 구체적 사유로 제한 |
| C04/P0 | 전사/가사 제공자 연결 / 신규 | 제안 `lib/media-source-providers.ts`: 소유 자막/업로드/R3/R4/R5 공통 결과 계약. source priority는 관리자가 확인한 정책으로 결정. R3는 ms→초, 언어 검사, 202 job 저장·조회. R4/R5는 녹음·지역 매칭 | 빈 값·206·401·429·202·다른 언어가 “수집 성공”으로 오인되지 않음. 외부 어댑터는 키/계약 전 미활성 |
| C05/P0 | 분석 작업·중단 재개 / 기존 lock·cache 확장 | `video-ingestion.ts`의 중복 방지·동시 실행 제한 재사용. 영속 job에 단계·입력 hash·lease·외부 job ID·출력 reference 저장. 요청 제한 시간 내 작은 단계로 실행, 미완료는 기존 인증된 관리 실행/예약 실행에서 재개 | 재시도·페이지 재접속·함수 중단 후 완료 단계 재과금 없음. 만료 lease 회수와 실패 단계만 재시도 |
| C06/P0 | 자막 타임라인·근거 보존 / 음악 일부 기존 | 공통 cue 저장소에 원본 provider ID, 원문, 언어, 시작/끝, 원본 순서·버전 저장. 원본과 정규화본 분리, 겹침/말 없는 구간을 검토 사유로 표시. 검토된 선택 구간을 기존 파서에 맞게 변환 | 1530ms가 1.53초, 잘린 원문 없이 페이지 탐색, 중복 가사도 다른 시간의 cue로 유지 |
| C07/P0 | 미리보기·JEV·사람 검수 / 기존 확장 | 영상·원문·생성 표현·판정 근거를 나란히 보여주고 `cueId`로 이동. `video-provider.ts`, `video-language-review.ts`, `owned-music-ai.ts` 재사용. 형식/원문 근거는 코드로 먼저 검사 | JEV unavailable/낮은 신뢰도는 검토대기. 잘못된 읽기·없는 근거·허용 범위 밖 본문을 자동 게시 안 함 |
| C08/P0 | 버전 게시·취소 / 두 도메인 기존 | 기존 지식/음악 publish에 sourceRevision·artifactHash·검수 revision 비교 추가. 게시본 snapshot을 읽고 편집 중 초안은 학습자에게 노출하지 않음. 관련 색인/캐시 무효화 | 오래된 탭 publish는 409. 초안 수정 중 기존 게시본 동작. 취소 후 검색·곡 링크에서 비공개 자료 없음 |
| C09/P1 | 관리자 일괄 처리·진행 상황 / 일부 기존 | 수집함에서 선택 항목만 단계별 작업. 항목별 queued/running/review/blocked/failed 표시, 오류 코드·재시도 위치·실제 호출 비용 표시 | 한 영상 실패로 배치 전체 유실 없음. 일일 예산 전 예약과 정산, 취소 시 진행·완료 요청 구분 |
| C10/P0 | 공급자별 기능·준비/실검증 상태 / 신규 | metadata/transcript/lyrics/audio/pitch/rhythm별 capability와 configured/verified/blocked를 분리. 어댑터 버전·샘플 검증 시각·원인을 저장 | 키가 있거나 API 정의가 있다는 이유로 확보/분석 완료 표시 안 함. 실제 응답 증거와 연결 |
| C11/P0 | 용도별 분석 preset·학습 목표 / 신규 | language/level/scene/objective/activity/schema/prompt/rubric 버전을 묶음. 스터디·음악별 생성 계약을 선택하며 원본은 공유 | 목표 없는 문항·잘못된 용도·오래된 평가 재사용 거부. 기존 단일 표현 자료는 그대로 열림 |

### 4.2 스터디 영상 → 스터디 학습

| ID/우선순위 | 기능·현재 상태 | 구현 방법 | 기능별 완료 기준 |
|---|---|---|---|
| S01/P0 | 실제 영상의 학습 포인트 추출 / 기존 1~6표현 분석 | `video-provider.ts`의 공식 영상 입력과 JSON 검증 확장. 실제 언어 포인트·시간·근거 cue·장면을 저장. 확보된 원문이 있으면 sourceRevision과 연결. 자막 관찰과 모델 요약을 다른 evidenceType으로 기록 | 제목만 있는 입력·접근 불가 영상에서 관찰/대사 조작 없음. 자료별 근거를 원래 위치에서 확인 |
| S02/P0 | 수업 묶음 생성 / 표현 초안 기존, 완결 수업 신규 | `ContentDraft`를 유지하고 선택적 LessonArtifact 추가. 도입 목표→원문 관찰→표현/문법 설명→듣기/빈칸/순서/말하기→정답 해설. 각 문항의 근거와 자체 작성 여부 보존 | 정답 없는 문항·본문과 다른 뜻·난이도 벗어난 설명 검출. 모든 문항이 학습 목표 또는 cue에 연결 |
| S03/P0 | 스터디 카탈로그·수업 연결 / 기존 수업 확장 | `v2-lesson.ts`, `v2-lesson.tsx`, 기존 catalog/provider 경계를 확인하고 게시 수업 adapter 추가. language/level/scene로 조회, 원본 영상·수업 ID로 진입 | 관리자가 게시한 같은 revision을 대상 언어 스터디에서 열고 수업 완료 가능. 음악은 음악 목록에도 별도 연결 |
| S04/P1 | 문장 듣기·섀도잉·이해 확인 / 부분 기존 | R1 방식의 공통 cue player 재사용. 듣기→뜻 공개→직접 발화→문맥 문제. 마이크 사용은 사용자가 시작하며 실패 시 녹음 없이도 진행 | 모바일 재생·구간 반복·권한 거절 복구. 재생 클릭만으로 수업 완료/숙련 증가하지 않음 |
| S05/P0 | 학습 표현을 AI 튜터 자료로 활용 / 지식 검색 기존 | 게시 ContentDraft에 출처/수업 연결을 보존하고 `retrieveKnowledge` 및 기존 검색 dataset에 포함. 음악 자료는 사용 범위가 허용된 선정 표현만 별도 연결. 기존 평가 후에만 semantic index 활성화 | 해당 언어·레벨의 대화에 근거 표현 사용. 비공개/다른 언어/철회 source는 검색되지 않음 |
| S06/P1 | 단어·문장 복습과 진도 / 저장·복습 기존 | 사용자·언어·unit ID에 source revision 연결. 기존 expression/word-study 저장 동작과 스케줄 재사용. 변경된 문항은 새 버전으로 재평가하되 과거 기록 보존 | 저장→복습→대화→재로그인 복원. 같은 저장 요청 재시도로 카드 중복 없음 |

### 4.3 음악 영상 → 음악 학습

| ID/우선순위 | 기능·현재 상태 | 구현 방법 | 기능별 완료 기준 |
|---|---|---|---|
| M01/P0 | 원곡·녹음 버전 연결 / 음악 메타데이터 기존 | 곡명·아티스트·영상 ID·provider track/ISRC·녹음 버전 연결. 라이브/커버/스튜디오를 다른 recording으로 관리. R4 근거 | 이름이 같은 다른 곡·다른 버전을 자동 연결 안 함. 관리자가 비교 후 선택 |
| M02/P0 | 전체 가사 cue와 선정 학습 단위 / 선정 단위 기존 | R3~R5 자막을 전체 transcript asset로 보관하고 기존 2~8개 MusicUnit을 cue reference로 생성. 가사/읽기/뜻/어휘를 분리. 전체 원문을 기존 100줄 파서에 맞춰 조용히 절단하지 않음 | 원문 전체 탐색과 선정 구간 학습이 같은 cue로 이동. 공급자 제한 시 허용된 분량만 표시 |
| M03/P0 | 멜로디 감상·구간 반복 / 기존 player 개선 | `music-playback.tsx`는 videoId가 같으면 플레이어 유지. ready 이전 seek는 최신 요청만 대기. cue 시작/끝·반복 횟수·대기시간을 상태로 제어. 공식 영상의 원곡을 그대로 듣기 | 10개 줄 이동 시 iframe 유지, 원곡 소리 확인, 잘못된 구간/다른 곡 재생 없음. 숫자상 seek 성공만으로 청음 통과 아님 |
| M04/P1 | 동기화 가사·자동 정지·뜻 공개 / 일부 기존 | R1 cue clock/강조에 listen/practice/shadow 모드 추가. CC는 공식 플레이어 옵션으로 지원하되 외부 가사 UI와 분리. 공급자 word timing이 있을 때만 단어 강조, cue만 있으면 줄 강조 | pause/seek/속도 변경/끝 구간에서 상태 일치. 단어 시간 미제공 시 정밀 가라오케로 표시 안 함 |
| M05/P0 | 가사 뜻·어휘·문화/문법·문제 / 기존 MusicUnit 확장 | 허용된 가사와 cue에 근거한 원래 뜻·시적 의미·일상 표현을 구분. `owned-music-ai.ts`로 생성·검수. 가사 밖 표현은 자체 연습문장으로 표시, 발음 TTS와 원곡 구별 | 문자 그대로 번역해 생기는 의미 오류·틀린 읽기 검토. 상업곡에 자체 제작 음성을 원곡처럼 제시하지 않음 |
| M06/P1 | 단어 클릭·상태·복습 / 어휘 목록 저장 기존 | R2처럼 토큰 span+단어 버튼과 줄 재생 버튼 분리. `vocabulary.ts`/기존 expression store에 문맥·cue·뜻 저장. 알려진 단어 숨김은 사용자 선택. 언어별 분절/정규화 적용 | EN/JA/TH/ES에서 단어 선택 가능, 접근성 중첩 버튼 없음, 동형어는 문맥 의미 보존 |
| M07/P1 | 따라 부르기·내 발화 비교 / 녹음 비교 신규 | 원곡 구간 재생→정지→사용자 마이크 녹음→내 녹음 재생→본인이 다시 시도. 음정/발음 자동 채점은 검증된 모듈이 준비된 곡에만 추가. 원곡의 TTS 합성/보컬 복제는 포함하지 않음 | 노래 없이 텍스트만 표시하는 시험으로 통과 안 함. 실제 원곡·마이크·내 녹음 재생과 삭제/권한 거절 확인 |
| M08/P2 | 실제 멜로디/음정 분석 / 신규·허가 오디오 필요 | 별도 제공 오디오 asset 수신→형식/길이 검사→F0·voicing·리듬 특징 계산→관리자 확인→cue별 reference contour 저장. 사용자 녹음과 시간 정렬 후 pitch/rhythm을 별개 피드백으로 표시 | 자체 연습곡에서 기준 음정/무성/옥타브 오류 검증. 반주 혼합곡의 단일 F0를 보컬 정답으로 오판하지 않음. 검증 전 점수 미제공 |
| M09/P0 | 음악 게시·곡별 진입·완료 복원 / 기존 확장 | 기존 `owned-music-store.ts`, `music-study-link.ts`, `/study/music/[language]/[songId]` 유지. 감상/가사/연습/음정 분석 capability별 상태 표시. 학습 완료는 실제 활동 기록 기준 | 게시곡 목록→곡 학습→저장→복습→재로그인 진도 복원. 자료 없음이 로그인/새로고침으로 해결되는 것처럼 표시 안 함 |

M08은 R1~R5에서 복원한 알고리즘이 아니다. 사용자의 멜로디 요구를 충족하기 위한 별도 설계다. 초기 후보는 공식 [librosa F0/pYIN 설명](https://librosa.org/doc/dev/auto_tutorials/01-intro/03-f0.html)의 F0·voicing 추정이다. #267에서 고정 버전·기본 라이선스·로컬 실행을 확인했으며, CPU/메모리 부하·실제 가창 정확도·제품 채점은 `TODO(D1)`이다. 혼합 음원의 보컬 분리/다성음 분석은 별도 선정·검증이 필요하다. 영상 iframe은 원시 오디오 입력으로 사용할 수 없다.

v2에서는 음원 입력·선율·리듬·정렬·피드백을 [전체 설계 §7](../design/20261015-hanmadi-admin-learning-architecture.md#7-멜로디리듬자막-처리-설계와-검증-공백)로 구체화했다. 후속 #267에서 **Basic Pitch 1.0.1 REA 정적 분석과 librosa 0.11.0 pYIN/onset/beat의 자체곡 4개 로컬 실행을 완료**했다. Basic Pitch 추론·CREPE 실행·실제 보컬 기준 채점은 미검증이다. [실측과 한계](https://github.com/hhj4861/commerce-automation-kit/blob/e52dbabde158d3fe11e356187b4966ef17a81b92/docs/qa/20261015-hanmadi-audio-proof.md)를 따른다. M08 완료에는 엔진 입출력·버전·라이선스 확인과 기준 선율/박자 대비 검증이 필요하다. 전체 BPM과 가사 타이밍, STT 일치와 발음, 노래 음정과 언어 성조를 같은 지표로 쓰지 않는다.

### 4.4 공통 운영 품질

| ID/우선순위 | 기능 | 구현 방법 | 기능별 완료 기준 |
|---|---|---|---|
| O01/P0 | 언어 품질 | EN/JA/TH/ES별 읽기·뜻·문맥·분절 fixture와 실제 샘플. 기존 language-flow·language review 재사용 | 각 언어 스터디·음악 흐름을 독립 통과, 태국어를 띄어쓰기로 대체 안 함 |
| O02/P0 | 접근·출처·철회 | owner 변경 작업/사용자별 진도 권한 재사용. 외부 원문을 명령으로 취급하지 않음. 수집 ID만으로 임의 URL fetch하지 않음. 철회 시 캐시·dataset·index 연계 무효화 | 관리자 우회·SSRF·다른 사용자 기록 접근 차단. 외부 텍스트의 지시로 도구/키 유출 없음 |
| O03/P0 | 비용·실패 관측 | job/단계/공급자 request ID·입출력 hash·토큰/요금/소요시간 기록. 서버 로그에는 키·원문 전체·사용자 녹음 내용 제외 | 실제 과금과 견적 구분. 429와 권한 거부를 재시도로 은폐하지 않음 |
| O04/P1 | 앱에서 결과 확인 | 수집함에 게시 앱 링크와 검증 상태. 자동 검증/fixture/실제 계정 결과를 구분 | “수집됨”과 “학습 가능” 별도. 마지막 실제 검증 source/revision/시각 추적 |

### 4.5 기존 관리자 입력·편집·반영·진단 보존

| ID/우선순위 | 기능·현재 상태 | 구현 방법 | 기능별 완료 기준 |
|---|---|---|---|
| A01/P0 | 번역 후보 검토·전환 / 기존 | 후보 동의·개인정보·언어·중복 검토 후 기존 교재 전환. provenance에 기여 이력을 보존하고 모델 학습 dataset 제외 유지 | 후보가 자동 게시/재학습되지 않음. 거절·전환·게시 이력 추적 |
| A02/P0 | 수동 교재·검수·보관 정책 / 기존 확장 | `v2-admin.tsx`의 생성/저장/검수 유지. 원문을 보관하지 않는 현행 입력과 새 보관 동의 asset 입력을 구분. 목표/활동 editor·편집 이력 추가 | 과거 원문 복원 주장 없음. 저장 방식 안내와 실제 보관 일치. 초안/게시본 분리 |
| A03/P0 | 앱 반영 확인 / 검색 미리보기 기존 | `Preview` 검색 조건 유지. 수업/곡별 게시 revision·실제 링크·개별 검증 결과 추가 | 검색 결과 있음과 실제 학습 성공 구분. 비공개 자료 링크 노출 없음 |
| A04/P1 | AI·자료·음성 진단 / 네 언어 진단 기존 | `diagnostics-admin.tsx`·진단 API에 공급자/단계별 probe 추가. 설정 읽기와 실제 모델/재생 시험 분리 | 화면 열기로 유료 호출 없음. 연결 오류·품질 오류·브라우저 재생 오류를 구별 |

### 4.6 AI 자료 활용·모델 학습: 기존 학습 관리의 4단계 확장

| ID/우선순위 | 기능·현재 상태 | 구현 방법 | 기능별 완료 기준 |
|---|---|---|---|
| L01/P0 | 게시 교재/음악 지식 adapter / 교재 검색 기존 | ContentDraft와 허용 MusicUnit을 KnowledgeEntry로 변환. source/artifact revision, cue, language/level/scene/domain 보존 | 음악 게시만으로 자동 검색됐다고 보고 안 함. 음악 표현의 실제 검색·튜터 사용 확인 |
| L02/P0 | 자료 버전·허용 범위 snapshot / 기존 확장 | `makeDataset/currentDataset/invalidateLearning` 재사용, source/rights revision 추가. 제한·분량을 관리자에게 표시 | 초안/철회/허용 범위 밖 자료 포함 거부. 수정 시 연결 dataset/index 무효화 |
| L03/P0 | 검색 평가셋·결과 / 기존 확장 | `EvaluationCase`·lexical 평가 재사용. 다른 언어/상황/domain과 no-match 사례 포함. 답변·교육·음성 품질은 별도 평가 | 검색 적중을 전체 정확도로 표시 안 함. case/dataset/engine 버전 일치 |
| L04/P1 | 의미 검색 생성·평가·적용 / 코드 기존·운영 미연결 | `learning-retrieval.ts`의 build/evaluate/enable 유지. 현재 단일 index에 범위 필터 추가, 복수 index는 필요 시 계약 추가 | 실제 embedding 연결·동일 index 평가 후만 활성화. 미연결 시 lexical 정상 |
| L05/P1 | 모델 학습 dataset·분할·export / 코드 기존·운영 미연결 | 권한 확인된 관리자 자료만 source/recording 단위 train/validation/test 분리. 기존 JSONL와 최소 예제 수 정책 유지 | test 자료 공급자 학습에 미전송. 사용자 번역 후보/녹음 자동 편입 없음 |
| L06/P1 | 학습 작업 준비·제출·조회·취소 / 코드 기존·운영 미연결 | `learning-training.ts`의 prepared/submitting/submitted/unknown 등 재사용. request/config/dataset ID와 실제 원격 job 연결 | 응답 유실 상태에서 중복 학습 제출 안 함. prepared를 학습 성공으로 표시 안 함 |
| L07/P1 | 독립 시험·검수·모델 적용/복귀 / 코드 일부 기존 | 분리 시험 결과·버전을 기존 review 메모와 연결. alias 등록·앱 키 접근 확인·적용 범위 검사 후 활성화, default-model 복귀 | 성공 모델도 검수/권한/별칭 없으면 미활성. 기본 모델 복귀와 철회 모델 미사용 확인 |
| L08/P0 | 품질 피드백·철회·재학습 대응 / 일부 기존 | 관리자 수정·평가·사용자 동의 피드백을 검토 후보로 관리. source→자료→dataset/index/model 의존 관계 무효화 | 가중치에서 자동 삭제 주장 없음. 영향 모델 비활성·대체 확인. 피드백 자동 게시/학습 없음 |

## 5. 데이터·API 구현 계약

### 저장할 객체: 기존 계약에 추가하고 원자 간 직접 import하지 않는다

| 객체 | 핵심 데이터/관계 | 저장·호환 정책 |
|---|---|---|
| MediaSource | sourceId, videoId, metadata, uses, targetLanguage, revision, provenance, capabilities | 원본 정규화 ID로 중복 방지. 기존 수집 ID와 alias 매핑. 사용자 로그인 토큰과 분리 |
| SourceAsset | sourceId/revision, kind(transcript/audio), provider, providerAssetId, hash, language, recordingId, rightsRef, expiresAt | 공급자 원본과 정규화 결과 분리. 파일은 서버의 비공개 저장소, DB에는 참조. 캐시·보관 기간은 허용 범위 |
| Cue | cueId, assetRevision, start/endSeconds, text, speaker?, wordTimings?, timingPrecision | 시간 없는 cue는 읽기 전용으로 보존 가능하나 구간 재생은 비활성. 긴 영상은 페이지/구간 단위 접근 |
| ProcessingJob | sourceRevision, pipeline, inputHash, model/prompt/rubricVersion, stage, lease, outputs, attempts, providerJobId, costs, error | 모델·원문·정책이 바뀌면 다른 job. 처리 성공과 결과 저장을 단계별 기록해 재사용 |
| LessonArtifact/MusicArtifact | 기존 draft/song ID, sourceRevision, units/cueRefs, quiz/answers/evidence, generatedVersion, review | 기존 API 응답은 유지하고 선택 필드 추가. 전체 transcript를 선정 unit 배열로 대체하지 않음 |
| PublishedRevision | artifactRevision/hash, reviewer, reviewedAt, rightsVersion, publication target | 게시 snapshot 불변. 초안 변경과 동시 편집 CAS/409. 실패 시 기존 게시본 유지 |
| LearnerActivity | actor, language, artifactId/revision, unit/cueId, action, progress, wordState | 재생·저장·완료를 구분. 중복 요청 ID 처리. 기존 진도/단어장과 이중 저장소 만들지 않음 |

`capabilities`는 예를 들어 `canEmbed`, `canDisplayTranscript`, `canGenerateExercises`, `canUseInTutor`, `canAnalyzeAudio`, `canTrainModel`처럼 서버가 권한·자료 상태로 계산한다. 단순히 key 설정 여부만으로 true를 주지 않는다. 알 수 없음은 미허용/확인 필요이며 허용으로 추정하지 않는다.

### 상태 모델

- 원본과 단계: `collected → acquiring → source-ready → analyzing → generated → reviewing → ready`.
- 작업 예외: `blocked`(자료/권한/설정 필요), `failed`(실행 실패), `cancelled`. 마지막 성공 단계·reasonCode·재개 조건 보존.
- 게시 상태는 별도: `draft / published / unpublished`. 위 `ready`가 자동 게시를 뜻하지 않는다.
- 음악은 `embed-only`, `lyrics-ready`, `study-ready`, `pitch-ready` capability를 독립적으로 표시한다. 가사 확보 실패가 공식 감상 기능을 없애지 않는다.
- 기존 `ContentDraft.status` 등은 유지한다. 새 상태값을 기존 enum에 섞어 구 클라이언트를 깨지 않도록 job/capability 객체에 둔다.

### API와 실행 위치

기존 `/api/study/admin/videos`의 prepare/status/process, `/api/study/admin/music`의 collection/save/generate/publish는 호환을 유지한다. 먼저 내부 공통 source/job 서비스를 만들고 기존 액션을 adapter로 연결한다. 이후 제안 `/api/study/admin/media`에 `collect`, `set-purpose`, `acquire`, `analyze`, `review`, `publish`, `unpublish`, `retry`, `cancel`을 단계적으로 추가한다. 모든 변경은 owner/origin 검사와 expectedRevision, 실행 요청 ID를 받는다. 작업 생성 응답은 job ID와 상태이고 긴 외부 작업을 HTTP 연결 하나에 매달지 않는다.

기존 앱·서버와 `v2Driver`의 CAS/claim을 우선 사용한다. 초기 구현은 영속 job과 제한된 단계 실행이면 충분하며 별도 이벤트버스/MSA는 만들지 않는다. 외부 비동기 작업은 provider job ID를 저장한다. 네트워크 응답 유실로 외부 실행 여부가 불명확하면 `execution-unknown`으로 남기고, 공급자의 idempotency/조회 지원 확인 전 생성 요청을 자동 반복하지 않는다. lease TTL·갱신·단계 제한 시간은 실제 함수 제한보다 짧게 설정해 검증한다.

선정한 공식 API에만 서버에서 접근한다. 키는 승인된 서버 비밀 설정에 보관하고 클라이언트·문서·iCloud 산출물에 넣지 않는다. 사용자 제공 오디오/녹음은 삭제·보관기간·외부 분석 동의를 분리한다. 모든 콘텐츠·cue·녹음을 Git에 저장하지 않는다.

## 6. 구현 묶음과 인수 시험

각 묶음은 관련 검증→자기 변경 커밋·push→PR 준비까지 진행하고, 실제 머지·운영 배포는 별도 승인 절차를 따른다. 아래 순서는 소요기간 약속이 아니다.

| 묶음 | 포함 기능 | 완료 산출물·검증 |
|---|---|---|
| A: 수집·원문·작업 기반 | C01~C06, O02~O03 | 통합 수집함, 기존 음악/영상 이관 adapter, 허용 원문 입력, job 재개·예산·CAS 시험. 외부 키 없이도 자체 자료로 통과 |
| B: 스터디로 연결 | C07~C08, S01~S03·S05, O01 | 실제 관찰 근거→수업/표현 생성→검토→게시→스터디/대화 검색. 기존 영상 파이프라인 회귀 |
| C: 음악 학습 완성 | M01~M05·M09 | 승인된 가사 cue·원곡 재생→자료 생성→검토→게시→곡별 학습. stable player·타이밍·원곡 청음 확인 |
| D: 학습 UX·복습 | S04·S06, M06~M07, C09, O04 | 문장 정지·뜻 공개·단어 선택·내 발화 재생·진도 복원. 접근성·모바일 확인 |
| E: 실제 공급자 검증 | C04의 외부 어댑터 | 이용 범위·키 준비 후 각 공급자 대상 곡 샘플 검사. Pretender는 실제 가사/녹음 매칭·학습까지 통과해야 성공 |
| F: 멜로디 분석 고도화 | M08 | 허가 오디오와 사용자 녹음의 음정/리듬 분석 평가. 준비 전 C의 원곡 감상·자막 학습 출시를 막지 않음 |

v2에서는 위 묶음 전에 **기술 증거 확보**(C10·M08: 실제 전사/가사 응답, 선율/리듬 후보 배포물 분석·자체 오디오 실측)를 둔다. A01~A04는 기존 메뉴 보존/연결에 포함하고, L01~L08은 별도 학습 관리 통합 묶음으로 검증한다. 전체 설계 §9 순서가 초기 묶음 순서보다 우선한다. 외부 준비가 필요한 실검증과 자체 자료로 가능한 구현을 구분해 진행한다.

### 반드시 실행할 E2E

1. **스터디 × 네 언어:** owner 검색/URL 수집→purpose/언어 확정→분석→근거·문항 검수→게시→검증용 학습자 수업→표현 저장→대화 적용→복습→다시 로그인해 진도 복원. 해당 자료가 게시된 정확한 revision인지 확인한다.
2. **음악 × 네 언어:** 원곡 수집→녹음 버전·자막/원문 연결→cue 미리보기→뜻/어휘 생성·검수→게시→음악 목록→원곡 소리·줄 이동·반복·뜻 공개→저장·복습→진도 복원. 자막 없는 영상은 embed-only 안내도 시험한다.
3. **실제 외부 호출:** 자체 제작/허용 영상의 실제 API 응답부터 시작한다. fixture 시험과 실제 공급자·브라우저 시험을 별도 기록한다. 상업곡은 제공 여부·이용 조건 확인 전 성공 수에 넣지 않는다.
4. **실패/변경:** 202 응답 후 재접속, 생성 응답 유실, 429, 무자막/다른 언어, source revision 변경 중 publish, 공급자 권한 만료·게시 취소, 같은 cue 저장 재시도, 삭제/임베드 불가 영상, 마이크 거절을 검증한다.
5. **품질:** 관리자도 원문 구간을 직접 재생해 분석과 비교한다. JEV 통과 수치만으로 실제 뜻/발음/가사 일치·원곡 재생을 통과 처리하지 않는다. 음정 점수는 별도 기준 음원 평가 전 노출하지 않는다.

## 7. 구현 전 확정할 항목

| 항목 | 지금 상태 | 구현 시 처리 |
|---|---|---|
| 실제 곡 가사 공급자·Pretender 커버리지 | 미확인 | Musixmatch/LyricFind 현재 문서·계약·곡/지역/용도 확인. 제공 가능한 한 공급자로 먼저 검증 |
| Supadata 취득 경로·이용 범위·SDK 비동기 호환 | 미확인 | REA 보고서의 npm/documentation 버전 차이 재확인, 공식 REST schema 검증, 안전한 키 주입 |
| 음원 파일·노래 녹음 사용 범위 | 일반 YouTube URL만으로 확보되지 않음 | 권리자 제공/자체 제작 파일의 입력 경로 준비. 영상 추출기로 대체하지 않음 |
| 멜로디 알고리즘·채점 기준 | 로컬 기술 검증 일부 완료(#267), 앱 통합·채점 미완료 | pYIN 합성/자체곡 실행 결과와 혼합음 반례를 기준으로 관리자 reference 검수·마이크 정렬·실가창 평가 구현. 노래와 발음 분리 |
| 기존 전체 자막 제한/저장 규모 | 기존 parser는 2~100줄·12,000자, 음악 단위 2~8개 | 원문 asset 페이지화·크기/시간 한도·보관 정책 결정. 기존 제한을 무작정 확대하지 않음 |
| LR/Migaku 런타임 UX 비교 | 미설치·미실행 | 정적 근거로 자체 구현은 가능. 실사용 비교가 필요하면 설치·계정 준비 후 별도 조사 |

## 8. 구현자가 다시 볼 근거 파일

- REA 배포물·Evidence·제약·공식 출처: [조사 보고서](../research/20261015-hanmadi-music-rea.md).
- 기존 음악 수집→검수→학습 배포 경계와 fixture 한계: [수집곡 운영 QA](../qa/20261015-hanmadi-collected-music-production.md).
- 기준 소스 위치: `/Users/admin/workSpace/commerce-automation-kit-worktrees/hanmadi-synced-lyrics/apps/hanmadi/`. 이 worktree는 읽기 기준이며 새 구현 시 임의로 전환/수정하지 않는다.
- 공통 수집: `lib/video-ingestion.ts`, `video-policy.ts`, `video-provider.ts`, `music-collection.ts`, `youtube-music.ts`, `music-source.ts`.
- 스터디/자료 활용: `lib/knowledge.ts`, `knowledge-store.ts`, `learning-pipeline.ts`, `learning-retrieval.ts`, `learning-training.ts`, `components/v2-lesson.tsx`.
- 음악/복습: `lib/owned-music.ts`, `owned-music-ai.ts`, `owned-music-store.ts`, `music-study-link.ts`, `vocabulary.ts`, `word-study.ts`, `components/music-playback.tsx`, `v2-original-music.tsx`.
- 공식 재생 API: [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference). seek 뒤 endSeconds가 계속 적용된다고 가정하지 말고 구간 끝 정지/반복을 자체 상태로 검증한다.

이 문서는 요구사항과 구현 기준이다. 수집 버튼·분석 결과 저장·CI 통과·문서 커밋을 스터디/음악 학습의 운영 완료로 보고하지 않는다.
