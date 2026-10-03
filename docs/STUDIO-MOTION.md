# 본문 모션 템플릿 (HyperFrames)

2026-10-03. 영상제작실 미디어 단계에서 본문 장면을 **모션 템플릿**으로 만들 수 있다.
템플릿은 챕터 전환, 숫자 비교, 핵심 요약 세 가지이며, 제작 워커가 로컬에서 MP4로 렌더한다.
이 기능은 P0 PoC(`docs/qa/20261003-hyperframes-poc/`)에서 기능 검증을 통과한 템플릿을 운영 경로에 연결한 것이다.

## 동작

- **장면 계약은 append만 했다.** 모션 장면은 `kind:'video'` 그대로이며 선택 필드 `scene.motion = {template, vars}`만 추가된다.
  편집·렌더·업로드 등 하류 단계는 바뀌지 않는다. `motion`이 없는 기존 프로젝트의 동작도 같다.
- **허용 입력은 화이트리스트로 제한한다**(`apps/shopshorts/public/motion-templates.js`).
  - 템플릿 ID와 선언된 변수만 받는다. 임의 HTML·스크립트·URL·파일 경로는 받지 않는다.
  - 문자열: 템플릿별 길이 상한이 있고 제어문자, `<>`, `://`, `javascript:`/`data:`/`file:`를 차단한다.
  - 숫자: 0~9999 정수. 색상: `#RRGGBB`. 아이콘: 고정 목록.
  - 같은 모듈을 UI, Pages API(`lib/studio.js validateScenes`), 워커가 함께 쓴다.
- **도입부는 Higgsfield로 유지한다.** 첫 장면에는 모션 템플릿을 지정할 수 없다(서버가 400을 반환한다).
  - 손그림 애니메이션 프로젝트에서도 쓸 수 없다.
  - AI 시나리오 출력에 `motion`이 있으면 버린다. 모션 지정은 사람이 미디어 단계에서 한다.
- **렌더는 로컬 제작 워커만 한다**(`studio-motion.mjs`).
  - Pages·Functions는 Chromium을 실행하지 않는다.
  - Higgsfield·Google 분기보다 먼저 처리하므로 생성 API 사용료와 크레딧이 들지 않는다.
  - 장면이 템플릿보다 길면 마지막 프레임을 유지한다. 반복 재생하지 않는다.
  - 템플릿 내용이나 장면 길이가 바뀌면 해당 장면의 영상을 무효화한다.
- **실패 유형을 코드로 구분한다.** 검증 실패는 400이다. 그 밖의 실패 코드는 다음과 같다.

  | 코드 | 원인 |
  |---|---|
  | `MOTION_DEPENDENCY_MISSING` | 의존성 누락 |
  | `MOTION_NODE_MISSING` | 렌더용 Node 실행 불가 |
  | `MOTION_NODE_TOO_OLD` | Node 22 미만 |
  | `MOTION_RENDER_FAILED` | 렌더 실패 |
  | `MOTION_TIMEOUT` | 기본 180초 초과(`SHOPSHORTS_MOTION_TIMEOUT_MS`로 조정) |

- **UI**(`public/studio-motion-ui.js`)
  - 미디어 종류에 「모션 템플릿」을 추가했다.
  - 템플릿을 고르면 변수 폼이 나오고, 「템플릿 내용 저장」으로 저장한다.
  - "미리보기"는 워커가 렌더한 **실제 MP4**를 말한다. 미디어 카드와 편집 모니터에서 재생된다. 브라우저에서 템플릿 HTML을 직접 실행하지는 않는다.
  - 워커 heartbeat의 `motion` capability가 false이면 안내를 표시한다.

## 운영 반영 전 필요 사항 (미완료)

- 운영 제작 워커(launchd `com.cak.studio-production`)는 **Node 20.19.3**을 쓴다. HyperFrames에는 Node 22 이상이 필요하다.
  두 가지 방법 중 하나를 골라야 한다.
  - 워커 런타임을 Node 22로 올린다.
  - 워커 env에 `SHOPSHORTS_MOTION_NODE=<Node 22+ 경로>`를 지정한다.
  - 둘 다 하지 않으면 모션 장면 생성이 `MOTION_NODE_TOO_OLD`로 실패한다. 기존 image/video 장면에는 영향이 없다.
- 워커 checkout에서 `npm ci`를 실행해 `hyperframes@0.8.114`와 `gsap@3.14.2`를 설치해야 한다.
  - HyperFrames는 Chrome headless shell을 사용한다(최초 실행 시 `~/.cache/puppeteer`에 받는다).
- **Pages만 배포해서는 동작하지 않는다.** 순서는 워커 갱신 → heartbeat의 `motion: true` 확인 → Pages 반영이다.

## 검증 (2026-10-03, 로컬)

| 범위 | 명령 | 결과 |
|---|---|---|
| 스키마·장면 규칙·무효화·실패 4유형·실제 렌더 | `SHOPSHORTS_MOTION_NODE=<node22> node --test apps/shopshorts/test/motion-templates.test.mjs` | 8/8 통과 |
| Shopshorts 전체 회귀(Node 20, 기존 image/video 포함) | `cd apps/shopshorts && SHOPSHORTS_MOTION_NODE=<node22> node --test test/*.test.mjs` | 326/326 통과 |
| 격리 E2E | `SHOPSHORTS_MOTION_NODE=<node22> PLAYWRIGHT_CHANNEL=chrome node apps/shopshorts/test/motion-browser.mjs` | 통과 |

- **E2E에서 실제로 실행한 경로:** 로컬 studio API, 브라우저 UI, 로컬 워커, HyperFrames 렌더, 저장소 asset, 미디어 카드 재생, 편집 모니터, 자막을 포함한 최종 렌더. 업로드는 하지 않았다.
  - 서버가 도입부 지정과 마크업 변수를 거부하는지도 실제 요청으로 확인했다.
- **E2E에서 fixture로 대체한 것**
  - 대본: 합성
  - 도입부: Higgsfield 대신 ffmpeg로 만든 합성 클립을 업로드
  - 템플릿 값: 20m/35m 예시값
  - 실제 구독 LLM, Higgsfield, Google, ElevenLabs, 업로드는 호출하지 않았다.
- **검증하지 않은 것:** 운영 Pages와 운영 워커 배포, 실제 Higgsfield 도입부와의 이음새, 시청자 이해도.
- 렌더·로그 산출물: iCloud `gpt 작업/commerce-automation-kit/studio-motion-templates-20261003/`
