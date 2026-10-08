# Shopshorts 자동 제작 파이프라인 점검 — 2026-10-08

## 결론

**단계별 기능은 상당 부분 연결되어 있지만, 현재 수동 제작과 동등한 전체 파이프라인은 아니다.** 운영 화면에서 웹툰 주제 추천은 성공했으나, 추천을 대본으로 넘길 때 `지원하지 않는 영상 연출입니다.`가 재현됐다. 그러므로 운영 웹툰 자동 제작의 완주를 확인했다고 보고할 수 없다.

이번 작업은 점검과 별도 건축 영상 제작이다. Shopshorts 앱 코드·운영 설정·배포는 변경하지 않았다. 실제 업로드·유료 미디어 생성도 웹 점검에서는 실행하지 않았다.

## 기준과 실제 실행 증거

- 소스: main `985831e`, deploy/shopshorts 및 설치된 제작 워커 checkout `7e03f5a`. 이 두 revision 사이 `apps/shopshorts` diff는 없다. 작업 시작 checkout의 옛 feature 브랜치를 운영으로 오인하지 않았다.
- 운영 UI: https://shopshorts-dash.pages.dev/studio/dashboard?mode=auto
- 사용자가 승인한 개인 계정으로 로그인, `Codex · 연결됨`, `제작 워커 온라인` 확인.
- 건축학·웹툰·45초·Higgsfield 총 상한 54로 알 바흐르 타워 관심사를 입력, 실제 추천 완료. AHR·Arup·Heatherwick·MVRDV 링크가 검색 근거에 표시됨. UI가 보여주는 출처와 JEV 서버 실제 실행 증적은 구분한다.
- 추천 ID: `965404b3-5d9e-4cdf-8aec-7eb2a168c2e3`.
- `이 주제로 자료 확인 · 대본 만들기` 클릭 후 프로젝트 `1bf3fb70-f2f6-6794-1433-668ad17f879d` 생성, 동시에 `지원하지 않는 영상 연출입니다.` 노출. 이후에도 `자료 검색 요청 대기 중`, `창을 닫아도 서버에서 계속 처리합니다`와 진행 중 1개로 표시됐다. 대본은 확보하지 못했다.
- 재현 페이지: https://shopshorts-dash.pages.dev/studio/dashboard?mode=auto&project=1bf3fb70-f2f6-6794-1433-668ad17f879d
- 브라우저 탭 연결 오류는 새 탭에서 저장된 추천을 복원해 해결했다. 인증 우회나 토큰 추출은 하지 않았다.

## 기능 비교

| 단계 | 확인 상태 | 근거 및 남은 차이 |
|---|---|---|
| 카테고리·스타일·음성·자막 선택 | 운영 UI 확인 | 웹툰/자동 혼합/애니메이션/시네마틱, Kyle, 숏폼 1.1배 및 자막 위치 옵션. `public/automatic-creation.js` |
| 주제 추천·출처 | 운영 실호출 성공 | 동일 계정 추천 이력을 사용. 수동으로 이미 만든 롤링 브리지가 후보에 재등장해 전체 제작 이력 통합은 불완전. `lib/studio-recommendations.js:46` |
| JEV 공통 선정·검증 | 연결 코드 존재, 운영 실행 미확인 | `DISCOVERY_ENABLED=1` 때 공통 서비스 분기. 로컬 launchd 명시 환경에 없는 것만으로 OFF라고 확정하지 않음. 이번 추천의 JEV 실행 receipt는 확보하지 못함. `services/topic-discovery/runtime-config.mjs`, `lib/studio-recommendations.js:63` |
| 자료 확인→대본 | 운영 실패 재현 | 지원하지 않는 연출 오류. 체크아웃의 validator는 webtoon/hybrid를 허용하므로 잘못된 값 또는 운영 구성 요소의 버전 불일치 가능성은 있으나 원인 확정 아님. 실제 수신 payload·실행 revision 대조 필요. `lib/animation-plan.js:7`, `lib/studio-scenario-account.js` |
| 실패 상태 | 불일치 재현 | 오류와 대기 진행률이 함께 표시. 예약 이후 upstream 예외·오류 응답의 상태 전이를 확인해야 함. `lib/studio-automatic.js`, `lib/studio-scenario-account.js` |
| 대본 깊이 검토 | 코드·테스트 확인 | focus/why/mechanism/example/payoff/pacing/visuals 인용·digest 검증, 유료 생성 전 실패 차단. `lib/explanation-depth.js` |
| Higgsfield 도입·원화 | 코드·테스트 확인 | 웹툰 첫 장면 6초, 원화+도입 합계 견적·잔액·상한·불명확 제출 재시도 차단. 수동 제작은 native imagegen 원화와 54크레딧 도입을 조합하므로 웹 총 상한 54와 비용 구성이 다름. `studio-webtoon.mjs` |
| 설명용 화면 | 연결됐지만 품질 구성 상이 | 웹 기본은 원화+정형 도해; 혼합의 3D는 평행 투영 박스 구조도. 수동 Blender의 입체 모델·물성·접힘·카메라 연출이 통합된 것은 아님. `studio-webtoon.mjs`, `public/hybrid-graphics.js:2`, `studio-hybrid-render.mjs` |
| TTS 실측·길이 보호 | 코드·실제 렌더 테스트 확인 | 음성 길이를 측정해 장면 길이에 반영. 웹 숏폼 1.1/롱폼 1.0. `studio-runner.mjs`, `studio-narration.mjs` |
| 자막 타이밍 | 단순 분배 연결 | 문장/글자 가중치로 프레임 배분. 수동 제작에서 수행하는 음성 강제 정렬이 아님. `lib/cinematic-production.js:36` |
| 결말 여유 | 일부 보호, 동일하지 않음 | 음성 뒤 0.3초 기준. 이번 별도 영상의 마지막 대사 뒤 2.7초 hold와 같은 마무리 정책은 없음. `lib/cinematic-production.js` |
| 최종 검수 | 사람 발행 검수 존재, 자동 미디어 검수 부족 | 렌더 직후 전체 디코딩·무음/검은 화면·자막/음성 완전성·대표 장면 시각 검수의 일괄 합격 증적은 없음. `studio-runner.mjs` |
| 조립→업로드 | 코드 연결, 사람 승인 유지 | 미디어 완료·대본 승인·자산 완비 후 렌더. 발행은 별도 검수이며 이번 운영 실업로드는 안 함. `lib/studio-automatic.js` |

## 테스트

동일 앱 코드가 설치된 `/Users/admin/workSpace/shopshorts-production`에서 다음 실행:

```sh
node --test apps/shopshorts/test/studio-automatic.test.mjs apps/shopshorts/test/adaptive-hybrid.test.mjs apps/shopshorts/test/webtoon-hybrid.test.mjs apps/shopshorts/test/explanation-depth.test.mjs apps/shopshorts/test/cinematic-production.test.mjs
```

**37개 중 36 통과, 실패 0, 명시적 opt-in 실제 hybrid 워커 테스트 1개 skip.** 실제 웹툰 렌더러/워커 경로 및 시네마틱 조립 테스트 포함. 첫 worktree 실행은 의존성 `@resvg/resvg-js` 부재로 실패했고, 설치된 동일 코드 checkout에서 재검증했다. 단위/통합 테스트 통과를 운영 유료 생성 E2E 통과로 간주하지 않는다.

워커 launchd는 `shopshorts-production`을 가리킨다. 서비스 Node 20, 모션 렌더 Node 22.23.3 경로가 별도 지정되어 있다. 이번 점검에서 재시작하지 않았다.

## 다음 구현 우선순위

1. 운영 웹툰 대본 생성 오류의 실제 수신 연출값과 각 서비스 실행 revision을 대조하고 실패 상태를 확정 전이한다. 동일 UI 재현으로 대본 도착까지 검증한다.
2. 수동·웹·CLI의 주제 이력과 JEV receipt를 공통 작업 manifest에 남긴다. 추천에서 끝내지 말고 제작 이력까지 중복 비교한다.
3. 검토된 장면 계획에서 공통 렌더러를 선택하고, Blender/웹툰/모션의 화면 품질 기준을 맞춘다. 글자·박스 도식만으로 구조 원리를 대신하지 않는다.
4. TTS 강제 정렬·결말 hold·출력 품질 검증을 공통화하고 동일 입력에 대한 CLI/웹 결과를 비교한다.

이 문서는 누락·운영 실패를 기록한 점검 결과이며, 위 후속 구현이나 운영 복구 완료 선언이 아니다.
