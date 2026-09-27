# 캡컷 편집 구조 비교 및 로그인 후 AI 계정 안내

2026-09-27 운영 ce0be4e의 코드와 CapCut 공식 기능 안내 비교. CapCut 앱 실조작 비교가 아닌 기능·데이터 모델 검토다. 구현 기준 main에는 별도 PR #34도 포함되지만 이번 변경은 Shopshorts 계정 안내만 다룬다.

## 편집기 차이

| 영역 | 현재 Shopshorts | 남은 차이 |
|---|---|---|
| 작업 공간 | 보관함 / 미리보기 / 속성 / 하단 타임라인 | 배치는 유사하지만 범용 편집기와 기능 범위는 다름 |
| 영상 | 30fps 분할, 잘라내기·복사·붙여넣기, 이동·트림, 자석, 실행 취소 | 한 영상 트랙, 겹침 거부. 다중 영상 레이어·PIP 없음 |
| 움직임·효과 | 장면 재생과 정적 자막 위치 | 키프레임, 전환, 크롭·회전·변형, 속도 램핑, 마스크·크로마키 없음 |
| 자막 | 타임라인 선택·편집·삭제, 화면 드래그, 폰트 7종·스타일 6종 | 대본 기반. 음성 인식 자동 자막·단어별 타이밍·애니메이션 없음 |
| 오디오 | 여러 배경음 구간, 시작점·길이·음량·페이드, 구간 분할, 미리듣기 | 파형·비트 편집 없음. 대본 음성은 장면에 연결되며 프로젝트 목소리 하나 사용 |

근거: public/editor-model.js의 FPS 및 assertClipPositions, editor.js의 각 트랙, music-timeline.js, caption-style.js. 위 미지원 기능은 이번에 구현하지 않았다.

공식 비교 자료:
- https://www.capcut.com/resource/how-to-use-capcut-on-pc (타임라인·자동 자막)
- https://www.capcut.com/tools/keyframe-animation (위치·불투명도 등 키프레임)
- https://h5.capcut.net/creative-suite (다중 영상·오디오·이미지·텍스트 트랙)

다음 개선 우선순위: 다중 영상 트랙·변형 → 키프레임·전환 → 오디오 파형·독립 음성 클립 → 자동 자막. 데이터 계약·미리보기·최종 FFmpeg 출력 모두 함께 확장해야 한다.

## 계정 역할과 이번 변경

Google 로그인은 플랫폼 사용자 인증이고 Codex 또는 Claude 구독 연결은 AI 아이디어·시나리오 생성용이다. 이미지·영상은 Higgsfield, TTS는 별도 음성 서비스가 담당한다. 직접 기획·저장·편집은 LLM 연결을 강제하지 않는다.

기존 llm-account-api 사용자 소유권 검증, 브로커 암호화 저장, 계정 워커를 재사용한다. 참고 화면은 ddl-lint-engine/services/ssot/web/src/app/account-menu.js 및 account-connection.js다. 참고 프로젝트 파일과 인증정보는 수정·복사하지 않는다.

- 홈과 제작실에 부착 가능한 연결 상태·관리 모듈. 미연결 시 연결 안내와 나중에 제공. 실제 HTML 배치는 홈 개편 세션 담당.
- 연결은 클릭으로만 시작. 조회 실패·미연결·실행기 오프라인·인증 진행 중을 구분.
- 연결 완료·해제와 탭 복귀 시 상태 갱신, 대화상자 중복 열림 방지.
- Google 로그인 이후 AI 구독 연결이 별도임을 로그인 화면에 안내.
- 앱의 색상(#f7f7f4, #ffffff, #242622, #73776f, #277e64)과 글꼴(DM Sans/Noto Sans KR)을 유지하고 긴 안내 대신 상태 버튼과 짧은 안내를 사용.

## 화면 개편 세션과의 연결 계약

별도 홈·제작 흐름 개편 세션(01a0dbe8-c325-7680-ad08-abaab2ef43a2)이 위치 조정을 요청했다. 해당 세션은 ai-account.js 확인 및 마크업 수용을 회신했다. 이 런타임의 외부 세션 송신 도구는 제공되지 않아 상세 계약은 이 문서에 남긴다. 다음 계약을 재사용할 수 있다.

- 모듈: public/ai-account.js, ai-account.css, llm-connection.css.
- 상단 버튼: data-ai-account. 안내 영역: data-ai-onboarding와 그 내부 data-ai-* 요소.
- 인증 대화상자: connectLlm({manage:true}). 완료 시 리디렉트하지 않고 닫으며 llm-account-change 이벤트를 보낸다.
- API: /api/studio/llm/status·connect·code·cancel·disconnect. 신규 인증 API 없음.
- index.html/studio.html/studio.css의 이 작업 변경은 원복했다. 해당 파일은 홈 개편 세션이 소유한다. 이 PR 단독으로는 상단 진입점이 나타나지 않으며 아래 마크업 통합이 필요하다.

운영 미반영. 실제 구독 재인증과 유료 생성은 검증하지 않으며, 검증 결과는 PR에 기록한다.

### 최종 통합 계약

head에 /llm-connection.css, /ai-account.css 링크와 type=module src=/ai-account.js를 추가한다. 홈 hero 아래 및 제작실 방식 선택 위에 다음 빈 영역을 놓으면 모듈이 내용을 채운다.

```html
<section data-ai-onboarding hidden></section>
```

상단(모바일·데스크톱)에 다음 버튼을 배치한다.

```html
<button type="button" class="account ai-account-trigger" data-ai-account disabled>AI 확인 중…</button>
```

연결이 새로 완료되면 안내 영역의 `제작 방식 선택` 링크가 `/studio`로 이동한다. 기존 연결 사용자는 상단 상태만 보인다. 이 작업에서 provider 토큰 저장·OAuth 계약·리디렉트 API는 변경하지 않는다. 모듈과 기존 로그인 UI 및 중복 연결 요청 회귀 테스트를 실행한다. 최종 결과는 PR에 기록한다.

## 검증 결과

- ai-account.test.mjs + account-ui.test.mjs: 17건 통과, 종료 코드 0.
- 미연결/연결 완료/인증 중/오프라인/조회 실패/세션 만료, 나중에 후 연결, 탭 복귀, 완료 CTA, 중복 연결 요청을 확인했다.
- JavaScript 구문 및 git diff 공백 검사 통과.
- Google/Codex/Claude 실계정 재인증이나 유료 생성은 실행하지 않았다. 브라우저 연결 도구가 없어 실제 화면 클릭·스크린샷 검증은 미수행이며, 홈 개편 세션에서 마크업 통합 후 검증해야 한다.
- 이 브랜치만 배포하면 상단 모듈은 나타나지 않는다. index.html·studio.html 통합은 해당 소유 세션의 작업으로 남아 있다.

### 자동 제작 경계

/api/draft-requests POST는 draft_requests 대기열에 topic/content_type 등을 저장한다. 이 경로 자체에는 개인 연결 LLM 선택/실행이 없으므로 기존 자동 제작이 개인 Codex/Claude 구독을 사용한다고 보장하지 않는다. 자동 제작 담당 세션에서 소비 워커까지 별도 확인해야 한다. 이번 모듈의 연결 안내는 확인된 수동 추천·시나리오 연결을 재사용한다.
