# Hanmadi 음악 학습: REA 기반 5개 서비스 조사

확인일: 2026-10-15. **학습 UX는 Language Reactor·Migaku를 참고해 자체 개선하고, 가사 공급은 별도 제공자로 분리하는 방향을 권고한다.** Supadata는 영상 전사 연동 후보이고 Musixmatch·LyricFind는 가사 공급 후보다. 어느 쪽도 이번 조사로 Pretender 가사 확보·학습 게시까지 검증된 것은 아니다.

## 작업 범위와 완료 상태

- 요청: 다섯 대상의 REA 분석과 한마디 적용점 조사. 담당: 현재 Codex 세션 단독.
- 완료 기준: 공개 배포물별 REA Evidence 확보, 현재 앱과 중복 제거, 적용 우선순위·설치 필요·미확인 사항 기록.
- 기준 코드: `hanmadi-synced-lyrics` worktree `cc17c81cf8fe6cb78a68cbb3230d01adfddd0776`. 이후 코드 변경에는 재대조가 필요하다.
- 결과: 정적 조사 완료. 확장 설치·로그인·실제 공급자 API 호출·계약·운영 변경은 수행하지 않았다.
- 다음 권고: 플레이어 유지·문장 자동 정지·단어 저장 연결을 먼저 구현하고, 공급자 실연동은 이용 범위와 대상 곡 제공 여부를 확인한 뒤 별도로 검증한다. 이 권고는 구현·설치·결제 승인이 아니다.

## 분석 방식과 근거

REA 6.4.0의 공개 CLI `analyze-javascript-application`으로 CRX·배포 SDK·배포 웹 번들을 **실행하지 않고** 분석했다. 자체 앱은 일반 소스 읽기로 대조했다. 아래 구분을 유지한다.

- **REA 정적 관찰**: 배포물의 모듈·문자열·호출 후보·데이터 모델. 실행 여부를 증명하지 않는다.
- **소스 보강**: 원본 파일에서 문자열·분기·필드 위치를 직접 확인. REA가 모든 의미를 복구했다고 주장하지 않는다.
- **공식 설명**: 제품 문서의 기능·계약. 이번 계정에서 실제 작동한 증거는 아니다.
- **설계 제안**: 관찰을 바탕으로 한 한마디 적용안. 성능·학습 효과는 실측 전이다.

기본 SDK와 Swift 컴파일러가 맞지 않아 최초 REA 호출이 실패했다. 기존 macOS 14.4 SDK를 해당 CLI 프로세스의 `SDKROOT`로만 지정해 해결했다. 설치·전역 도구 선택은 변경하지 않았다. 난독화·동적 호출·분석 예산 때문에 두 확장과 LyricFind 그래프는 부분 복구다. SDK 그래프가 완전해도 SaaS 서버 내부가 분석된 것은 아니다. 자동 추출된 endpoint 후보에는 일반 설정 함수도 섞이므로 실제 네트워크 호출로 취급하지 않았다.

### 배포물 식별

| 대상 | 확보한 공식 공개 배포물 | SHA-256 |
|---|---|---|
| Language Reactor | Google CRX, manifest 5.1.8, 4,200,021 bytes | `d884058867f40c98f59a68131ceec25f1dff694d05059f6ebc4b3804718b3f5b` |
| Migaku | Google CRX, manifest 1.30.16.0, 155,767,944 bytes | `1a9b84744c129e526f88eeb4404ce67f30fa2c5cd281f1b90bfb39bf7591e8e9` |
| Supadata | npm `@supadata/js` 1.4.0 tarball | `89bc92a44f70f2cd449fb160a65c7a5ec8a330b796cce77a7816cab1c36107d0` |
| Musixmatch | 공식 저장소의 `dist/javascript-client-generated.zip`, Git blob `785e117d09f6bb60d1be58a7317189529f283b4b` | `db6cab97b2921aca5da240da93fe8c0f396261178e87fb7cb84badf1cd2cad0f` |
| LyricFind | `lyrics.lyricfind.com` Next 배포 HTML, build `Y1L29cJF6dNx0WV4ccAfa` | `e702af5f4257b9d9c6f9a6d8423574e12b8e167bd2e6b0eb4640b371e2f2b7b2` |

LyricFind 해시는 HTML 기준이고 개별 JS 해시는 `inventory.json`에 있다. Musixmatch ZIP의 최신 제품 버전 여부는 미확인이다. 확장은 대용량 리소스를 전부 분석하지 않고 기능 관련 파일을 골랐다. 선택 파일·크기·해시는 각 `slice-manifest.json`에 남겼다.

### REA Evidence

| 대상 | Evidence ID | 범위·제약 |
|---|---|---|
| Language Reactor | `ev_4657ee45dc0900977ab591c5a023f0abdbb164b5205b36cf3ce70e808f2fee2e` | 4개 파일 중 JS 3개 구문 분석. YouTube 대형 번들 의미 분석 heap 제한, 그래프 부분 복구 |
| Migaku | `ev_76dd2355f72af0479e5f7f27448a1a1e6f975a2e1243e5d9b8c8878a3be0c7b7` | 8개 파일 선택, JS 6개 분석. player-store 파싱 heap 제한, memory 의미 그래프 결과 예산 제한 |
| Supadata | `ev_0f6cb1eb11809075ffa458e9a69b61a9d5af63df8233ba2122150b592d801527` | SDK 관련 7개 파일, JS 4개. 정적 그래프 완전, 동적 의미 관계 미확인 |
| Musixmatch | `ev_a974e8e4970b9fb1c3cd3e14fc8d8761a29ff2b6a3cbc3bbbb606b19d062c389` | SDK 8개 파일 선택, JS 7개. 선택 범위 정적 그래프 완전 |
| LyricFind 웹 | `ev_ba6f75dd6fcb07ee4623fea0f7bd7c244b42834ec5d2c452e4f44f7dff0096ba` | 3개 JS. 의미 그래프 노드 상한, 부분 복구 |
| LyricFind API facade | `ev_78c66eff2f07738ba643873f435941c89b387613fb5a092657a3b1795b7c7bf6` | 추가 2개 JS. 부분 그래프, 구문 분석 실패 0. 파트너 API 접근 증거가 아님 |

원본·선택 파일·전체 Evidence·로그 보관 위치:

`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261015-music-rea/<대상>/`

기본 Evidence는 `rea-evidence.json`, LyricFind 후속은 `rea-api-evidence.json`이다. 이 위치는 작업 산출물이며 Git에 제3자 번들을 넣지 않았다. 로컬 파일 존재와 iCloud 업로드 완료는 별개다.

## 서비스별 확인과 적용 판단

### Language Reactor: 듣기 흐름과 자막 조작

[공식 Chrome 배포](https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm)는 이중 자막·팝업 사전·세밀한 재생 제어를 설명한다.

배포물 `pageScript_lly.min.js`에서 문장 끝 자동 정지, 반복, 이전·다음 자막 이동, 번역 숨김·수동 공개, 아는 단어의 읽기 표시 숨김을 확인했다. 예: line 18 문자 offset 약 62411의 autoPause 설명, 68500의 hideTranslation, 66398의 transliteration 관련 문자열. 일부는 UI 문자열이므로 실제 동작 검증과 구분한다. `lln-hold-scheduled`·`lln-hold-active` 상태 스타일도 있다.

YouTube caption URL을 감지하는 코드도 있지만, 이는 브라우저 확장의 내부 구현 흔적이다. 한마디가 호출할 수 있는 공식 가사 공급 API가 생긴다는 뜻은 아니다. 해당 획득 방식을 복제하거나 자막 추출 우회로 쓰지 않는다.

**한마디 적용:** 재생 중 뜻을 감추고 정지 시 공개하는 듣기 우선 모드, 문장 끝 자동 정지, 키보드 이전·다음·반복을 작은 학습 화면에 통합한다. 이미 있는 속도·줄 반복은 새 기능으로 다시 만들지 않는다.

### Migaku: 단어 상태에서 복습까지 연결

[공식 기능 안내](https://migaku.com/faq/features)는 단어 상태·사전·미학습 단어 집중·자막 탐색·카드와 복습 기능을 설명한다. 공개 설명의 언어 목록에서 태국어 지원은 확인되지 않았다.

정적 분석 범위의 `memory.methods-3d39b339.js` line 161, offset 약 156694에서 `UPDATE_PAGE_KNOWN_STATUS`, `UPDATE_PAGE_HAS_CARD`, `OPEN_DICTIONARY`, `LOOKUP_WORD` 메시지를 확인했다. `ToolbarDisplayOptions.methods-03ef00cc.js`에는 읽기 표시 범위 설정이 있다. 전체 배포물의 별도 일반 소스 읽기에서는 known/unknown/learning/ignored 집계와 설정 키도 확인했다. 메시지·설정은 연결 구조의 단서이며 실제 복습 알고리즘 복원은 아니다.

**한마디 적용:** 자막의 단어 선택 → 뜻 확인 → 문장·재생 위치와 함께 저장 → 기존 단어 복습·AI 대화로 연결한다. 곡마다 별도 어휘 상태를 만들지 않고 사용자·언어별 기존 단어장과 연결한다. 아는 단어 숨김·미학습 단어 비율은 선택 기능으로 둔다. 태국어는 띄어쓰기 기반 분리로 대체하지 않고 실제 분절·뜻·읽기를 검증해야 한다.

### Supadata: 영상 전사의 기술적 후보

공개 SDK에서 transcript·YouTube transcript·batch·translate 경로와 timed chunk 모델을 확인했다. [현재 공식 REST 문서](https://docs.supadata.ai/get-transcript)의 중심 경로는 `/v1/transcript`다. 시작·길이는 **밀리초**이므로 한마디의 초 단위와 변환해야 한다. 선호 언어가 없으면 다른 언어가 반환될 수 있어 응답 언어 검사도 필요하다.

기존 자막만 요청하려면 `mode=native`, 타이밍을 유지하려면 `text=false`가 적합하다. 기본 `auto`는 AI 생성으로 넘어갈 수 있다. 202의 작업 ID와 200의 빈 결과를 구분하고, 생성 재요청 없이 작업 조회를 이어가야 한다. 단, 계측 전 성공률·속도·노래 가사 정확도를 주장할 수 없다.

**버전 주의:** 이번 npm latest 조회는 1.4.0인데 현재 문서는 비동기 결과 예제에 SDK ≥1.5.0을 요구한다. 문서 예제를 그대로 붙이지 말고 REST 응답 검증 또는 고정 SDK의 실제 지원 범위를 확인한다.

[요금 안내](https://supadata.ai/pricing)는 무료 월 100 credits, 기존 전사 1 credit, AI 생성 분당 2 credits를 제시한다. 무료 기능·호출 실패도 무조건 무과금이라고 가정하지 않는다. [공식 MCP](https://supadata.ai/mcp)도 있지만 이번에는 연결하지 않았다.

**적용 조건:** [약관](https://supadata.ai/legal/terms)은 제3자 데이터의 지식재산권을 이전하지 않는다. 공개 SDK 분석은 완료했지만 서비스 내부를 역분석하지 않았다. SaaS API가 있다는 사실만으로 상업곡 가사 재게시·번역·문제 생성 권한이나 원 플랫폼 접근 방식의 적합성이 입증되지는 않는다. 저장소의 공식 API·콘텐츠 이용 조건 검증을 거친 소스에 한해 연동 후보로 삼는다.

### Musixmatch: 곡 식별과 제한 정보를 보존하는 어댑터

[공식 SDK 배포 저장소](https://github.com/musixmatch/musixmatch-sdk)에서 가사·동기화 자막·곡 모델을 분석했다. `ApiClient.js:60`은 HTTPS API base, `SubtitleApi.js:158`은 `/track.subtitle.get`이다. Subtitle 모델에는 `subtitle_body`, `restricted`, `lyrics_copyright`, `pixel_tracking_url`, Track 모델에는 ISRC 등이 있다.

**한마디 적용:** 곡명 검색 결과만 연결하지 말고 아티스트·ISRC·녹음 버전을 확인한다. 공급자의 제한·저작권·표시/보고 요구를 버리지 않고 모델에 보존한다. 라이브·어쿠스틱 영상에는 스튜디오 녹음의 타이밍을 그대로 붙이지 않는다.

[공식 API workspace](https://www.postman.com/musixmatch-dev)는 확인했지만 문서 상세 일부는 접근 실패했다. 현재 계약·요금·Pretender 제공 여부·번역/TTS/문제 생성·저장 허용 범위는 미확인이다. 공개 SDK 분석만으로 사용 계약을 대신할 수 없다.

### LyricFind: 줄·단어 동기화와 지역 조건

[공식 Lyric Display](https://www.lyricfind.com/products/lyric-display)는 정적·줄별·단어별 표시를 제공한다. [공식 번역 소개](https://www.lyricfind.com/products/translations)의 핵심 언어 목록에는 일본어·스페인어 등이 있으나 태국어는 명시되지 않아 별도 확인이 필요하다.

공개 웹 배포물의 API facade에서 같은 origin의 `/openapi.spec.json`, `/api/v1`, `territory`와 `lrcincluded` 같은 필드를 확인했다. 선언된 OpenAPI 파일은 이번 도구에서 열리지 않아 실제 명세는 확보하지 못했다. 이 공개 웹앱의 경로를 한마디가 사용할 라이선스 파트너 API라고 판단하거나 가사 획득용으로 호출하지 않았다.

**한마디 적용:** line/word timing을 구분하고 공급자가 주지 않은 단어 타이밍은 만들어내지 않는다. 지역·곡별 권한·만료를 관리한다. 파트너 문서·키·계약·Pretender 커버리지와 견적은 미확인이다.

## 현재 한마디와 차이

아래는 기준 revision의 일반 소스 확인이다. 현재 운영 전체 E2E 통과라는 의미는 아니다.

| 이미 있는 기능 | 이번에 확인한 추가 기회 |
|---|---|
| 공식 YouTube iframe, 속도 조절, 전체·구간 반복 | 영상별 플레이어 인스턴스 유지, 문장 끝 자동 정지·다음 문장 이동 |
| 원문·읽기·뜻 및 표시 토글 | 듣기 중 숨김 → 정지/선택 시 뜻 공개 |
| 학습 줄의 어휘 퀴즈·저장·대화 | 자막 단어 직접 선택, 기존 단어장과 학습 상태 공유 |
| SRT/VTT/LRC와 수동 타이밍 편집 | 공급자 응답 정규화·출처/언어/권한/버전 관리 |
| LLM → JEV → 사람 검토 후 게시 | 위 검토 유지, 원문/타이밍 변경 시 이전 평가 재사용 금지 |

근거 파일: `apps/hanmadi/components/music-playback.tsx`, `v2-original-music.tsx`, `v2-music-language.tsx`, `music-video-collection.tsx`, `lib/music-collection.ts`, `music-source.ts`, `owned-music.ts`.

구체적 병목 후보: `music-playback.tsx`는 줄 재생 요청마다 request ID를 갱신하고 해당 effect에서 iframe을 다시 만든다. 타이머 내부 구간 반복은 seek를 쓰지만 다른 줄 선택은 재생기를 재생성한다. 영상이 같으면 준비된 플레이어에 seek/play만 보내도록 바꿀 여지가 있다. 지연 감소량은 아직 측정하지 않았다.

현재 학습 자료는 검토된 **2~8개 학습 단위**이며 전체 곡 자막 보기가 아니다. 공급자 원문 전체 cue와 검토된 학습 단위를 구분해야 한다. 기존 `SourceLine`은 초 단위, 줄 수·본문 길이·구간 겹침 등의 제한이 있으므로 외부 응답을 그대로 넣으면 안 된다. 현행 iframe에는 CC 언어/표시 파라미터도 없다. [YouTube 공식 옵션](https://developers.google.com/youtube/player_parameters)으로 사용 가능한 CC를 표시하는 개선은 가능하지만, CC 텍스트를 별도 앱 자막·퀴즈로 가져오는 권한과는 다르다. [공식 captions.download](https://developers.google.com/youtube/v3/docs/captions/download)는 영상 편집 권한을 요구한다.

직전 운영 수집 검증에서는 Pretender 공식 영상 `TQ8WlA2GXbk`의 메타데이터를 수집했지만 자막 원문·학습 게시까지 이어지지 않았다. 이번 조사가 그 공백을 해소한 실호출 증거는 아니다. 기존 기록: [수집곡 운영 QA](../qa/20261015-hanmadi-collected-music-production.md).

## 권고 우선순위와 인수 기준

| 순서 | 제안 | 확인할 완료 기준 |
|---|---|---|
| P0 | 동일 영상의 플레이어 유지 | 10개 줄 이동에서 iframe 재생성 없음, 늦은 ready 이벤트 오동작 없음, 기존 반복·속도 정상. 선택 후 소리 시작 p50/p95 실측 |
| P0 | 감상/자막/학습 자료 상태 구분 | 학습 자료가 없어도 허용된 공식 영상 감상 가능. 자막 없음·언어 불일치·권한 없음·생성 중을 다르게 안내 |
| P0 | 공급자 어댑터와 원본 이력 | source/recording ID, 언어, 지역, timing 정밀도, 허용 용도·만료·출처·버전을 보존. 비밀키는 서버에만 유지 |
| P1 | 문장 자동 정지·듣기 우선 모드 | 선택한 모드에서만 cue 끝 정지, 번역 공개·반복 횟수·대기시간·이전/다음 동작을 네 언어로 검증 |
| P1 | 단어 선택 → 저장 → 복습 | 기존 저장소에 중복 없이 저장, 원문 cue·뜻·재생 위치 유지, 저장 실패 시 재시도 가능. 줄 버튼 안 중첩 버튼 회피 |
| P1 | 레벨에 맞춘 미학습 단어 표시 | 사용자·언어별 상태 분리. 태국어 분절·읽기 검증. 수치를 학습 효과 보장으로 표시하지 않음 |

공급자 테스트에는 `1530ms → 1.53s`, 빈 결과·언어 불일치·겹친 구간·202 재개·권한 만료를 포함한다. 부분 실패와 비용을 기록하고 silent drop하지 않는다. 일반 영상의 자막 품질을 가창·반주가 섞인 노래의 가사 정확도로 일반화하지 않는다. 대상 녹음 버전·도입부 offset은 관리자 미리보기에서 확인한다.

## 설치·계정이 필요한 단계

| 대상 | 이번 정적 조사 | 후속 실사용 검증에 필요한 것 |
|---|---|---|
| Language Reactor | 설치 불필요, CRX 분석 완료 | 공식 Chrome 확장 설치. 동일 영상에서 자동 정지·뜻 공개·단축키 UX 관찰 |
| Migaku | 설치 불필요, CRX 분석 완료 | 공식 확장 + [계정 로그인](https://migaku.com/download). 결제/체험 시작은 별도. 넓은 사이트·클립보드 권한 때문에 별도 시험 프로필 권고 |
| Supadata | 설치·키 불필요, 공개 SDK 분석 완료 | API 키의 안전한 서버 설정 또는 MCP OAuth. 권리·원 플랫폼 이용 조건 확인 후 작은 실호출 |
| Musixmatch | 공개 배포 SDK 분석 완료 | 파트너 계정/키와 현재 API 문서, 대상 곡·지역·학습 용도 이용 범위 확인 |
| LyricFind | 공개 웹 번들 분석 완료 | 파트너 문서/키·계약, 대상 곡·지역·동기화/번역 제공 범위 확인 |

로컬 Chrome 프로필의 두 확장 ID 설치 경로를 확인했으며 둘 다 발견되지 않았다. **설치는 아직 하지 않았다.** 두 확장의 실사용 비교는 설치 후 추가 조사이고, 공개 번들 정적 분석 완료와 구분한다. Supadata/Musixmatch/LyricFind 서버 알고리즘·카탈로그 전체·계정별 권한은 이번 조사 범위에서 확인되지 않았다.
