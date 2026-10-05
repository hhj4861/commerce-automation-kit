# Daily Fortune Drama 생성 엔진

## 재사용 구조

`/fortune` 입력 → Google 세션별 에피소드 → D1 기존 제작 큐 → 기존 ShopShorts 워커 → Higgsfield → R2 → 로그인 사용자만 결과 조회.

1. 이름·나이·성별·외형·생활환경·배경·날짜·운세 원문을 정규화한다. 나이에 따라 학교/회사/지역 활동을 추천하되 사용자가 바꿀 수 있고 성별로 직업을 추측하지 않는다.
2. 예시 운세 또는 전달받은 운세를 세 가지 테마의 6장면 대본으로 만든다. 원문과 행동 팁은 이야기에도 반영한다. 현재 시나리오는 결정적 템플릿이며 LLM 자유 창작이 아니다. `scenario:false`인 운영 워커와 독립적으로 사용 가능하다.
3. 같은 사용자·외형의 이전 기준 시트가 있으면 새 에피소드의 보호된 미디어 키로 복사해 재사용한다. 없으면 기준 캐릭터 시트를 먼저 생성하고 다음 6장면의 공식 `--image` 참조로 전달한다. 외형·배경을 프롬프트에도 반복한다. 참조 파일 내용 해시까지 생성 식별자에 포함한다. 제공자가 얼굴 동일성을 완전히 보장하는 것은 아니다.
4. 웹툰: `nano_banana_2` 이미지 7개 중 기준 시트를 제외한 6장을 표시하고 한글을 브라우저에서 합성하여 PNG로 저장한다.
5. 기본 숏드라마: 같은 그림 6장 + 지원 한국어 TTS + 음성 길이에 맞춘 자막 타임라인 + FFmpeg MP4. 기준 시트는 영상에서 제외한다. 음성 생성 완료 시 서버가 다음 렌더 작업을 저장하므로 브라우저를 닫아도 이어지고 완료 음성은 재사용한다.
6. 실제 생성 숏드라마: 기준 이미지 1개 + `seedance_2_0` 영상 6개 + 같은 음성/자막/MP4 단계. 비용 때문에 선택 모드로 둔다.

사주 계산과 운세 해석은 생성 엔진의 별도 상위 계약이다. 출생정보를 임의로 해석하지 않고 지금은 예시/제공 운세만 받는다. 검증된 만세력 어댑터(양력/음력·출생지 시각·절기·일자 경계 테스트 포함)를 연결한 뒤 서버가 계산 출처를 부여해야 한다. 사진 기반 얼굴 커스텀과 이전 회차 서사 기억은 아직 지원하지 않는다. 같은 프로필의 기준 시트는 날짜를 넘어 재사용한다.

## 비용·복구·접근

- 사용자가 대본을 보고 에피소드 크레딧 상한을 설정한 뒤 생성한다. 반복 Codex 승인 팝업을 제품에 넣지 않는다.
- 공식 `generate cost` 후 상한을 검사하고, D1 체크포인트로 예약 크레딧/제출 의도를 저장한 뒤 `generate create` 한다.
- 접수 여부 불명 요청은 자동 재제출하지 않는다. 성공한 장면과 접수 ID를 재사용하며, 재시도 예약 금액도 상한에 누적한다. 실패 요청이 환불됐다고 임의로 가정하지 않는다.
- 이 상한은 Higgsfield 크레딧이다. TTS는 별도 ElevenLabs 사용량이다. 이미지 생성 클릭과 음성·영상 생성 클릭을 분리하며 무음 선택을 제공한다.
- 입력 지문과 사용자 해시로 같은 요청을 재사용한다. 입력이 바뀌면 기존 결과 표시를 즉시 지운다.
- 기존 일반 프로젝트는 그대로 유지하고 운세 프로젝트 목록/상세/미디어만 소유자로 제한한다. 워커는 기존 인증으로 작업한다.
- 구버전 워커는 운세 작업을 claim할 수 없다. API와 워커의 `fortuneEngine:1` 확인 후 새 생성 요청을 허용한다.
- 외부 게시/광고는 이 엔진에서 차단한다. 실제 고객 서비스 전에 보관기간·삭제·요금·동의와 부하 제한을 별도 확정해야 한다.

## API

- `GET /api/studio/fortune/config`: 엔진/워커 상태·운세 테마.
- `POST /api/studio/fortune`: `{profile:{name,age,gender,hair,clothes,life,setting},date:"YYYY-MM-DD",output:"webtoon|motion|video",fortune:{source:"example|provided",theme:"communication|focus|spending",summary?,tip?}}`.
- `GET /api/studio/fortune/:id`: 소유자의 에피소드.
- `POST /api/studio/fortune/:id/generate`: `{revision,approved:true,maxCredits}`.
- `POST /api/studio/fortune/:id/render`: `{revision,voice}`. 음성이 없으면 narration, 준비되면 render를 큐에 넣는다.
- 기존 `/api/studio/:id/assets/:sceneId`와 `/assets/final`: 보호된 결과.

로컬 사업 에이전트는 운세 원문·프로필 DTO를 이 API에 전달하는 어댑터로 붙인다. 사용자 인증이나 비용 상한을 생략하는 공개 업로드 URL을 만들지 않는다. 모델 판단/사업 수집용 Ollama는 미디어 생성 서버가 아니다.

## 운영 반영

운영 사이트의 현재 `execution:cloud-worker`, `mediaProvider:higgsfield`, image/video/voice=true, 음성 starter 잔여 41,769자 확인(사용자 전달 상태 2026-10-04). 이는 기존 연결 확인이며 새 엔진 실제 생성 검증은 아니다.

1. 동일 변경을 Pages Functions/UI와 기존 실행 서버 checkout 모두에 반영한다.
2. 서버의 기존 실행기 키와 데이터는 유지한다. 새 `admin init`로 키/금고를 회전하지 않는다.
3. 실행 중 작업이 종료된 뒤 기존 서비스 운영 방식으로 `studio-service.mjs`를 갱신한다. 실행 서버 위치는 현재 미확인이다. 사용자는 위치를 모른다고 답했다.
4. `/api/studio/fortune/config`에 최신 heartbeat와 `fortuneEngine:1`이 나오는지 확인한다.
5. `/fortune`에서 테스트 프로필로 준비 → 크레딧 상한 지정 → 생성 → PNG/무음 MP4 → 음성 MP4 순으로 실제 확인한다. 운영 게시나 광고는 수행하지 않는다.

## 검증

`node --test apps/shopshorts/test/fortune.test.mjs apps/shopshorts/test/studio-higgsfield.test.mjs apps/shopshorts/test/studio.test.mjs`

`node apps/shopshorts/test/fortune-browser.mjs`: 실제 브라우저+세션/API, 합성 테스트 그림만 사용, 유료 호출 0. 입력/소유자 분리·그림 표시·오래된 결과 제거·원문 반영·모바일 레이아웃 확인.

전체 앱 회귀 실행: 283건 중 274 통과, 9 실패. 실패는 이 격리 checkout의 better-sqlite3/hyperframes 미설치에 관련된 기존 테스트. 실제 FFmpeg 시네마틱/한국어 자막 회귀는 통과했다. 운영 서버 엔진 갱신 및 실제 Higgsfield/TTS 호출은 미검증이며, 준비 완료로 표시하지 않는다.

근거: [Higgsfield 공식 CLI](https://github.com/higgsfield-ai/cli/blob/main/README.md), [공식 모델/참조 매개변수](https://github.com/higgsfield-ai/cli/blob/main/MODELS.md), [Google 캐릭터 일관성 가이드](https://codelabs.developers.google.com/gemini-consistent-imagery-notebook).
