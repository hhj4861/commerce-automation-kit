# Festa Jev 운영 shadow 연결 — 2026-10-01

운영 Festa에 Jev 전용 키와 서버 바인딩을 설정하고 재배포했다. 실제 운영 요청의 로그에서 `mode=shadow`, `outcome=observed`를 확인했다. **Jev 판단을 사용자 결과에 채택하는 on 모드는 활성화하지 않았다.** 기존 LLM 경로가 계속 질문을 결정하고 생성·검수한다.

## 적용 위치와 범위

- 운영: https://festacheck.pages.dev/oktoberfest
- 고정 배포: https://78af2da1.festacheck.pages.dev
- 배포 ID: `78af2da1-f251-4eec-b8db-0bb65789ef03`, Production, deploy success.
- 배포 소스: `478c7e519c309fa25f77cadda133888e83349950`, `feature/agent-test`.
- 이전 운영 배포: `29dff29c-deca-4b6c-aed0-e3ece59dc057`. 준비 중 다른 세션의 PR #39 배포를 발견해 해당 최신 소스를 그대로 사용했다. 이전 Jev 테스트 브랜치 소스로 덮어쓰지 않았다.
- 앱 소스 변경 없음. 현재 운영 커밋의 정적 frontend와 Pages Functions를 검증·재빌드했다. 기존 환경변수와 일반 LLM 키 권한은 보존했고 production의 Jev 바인딩 5개만 추가했다. Preview 설정은 변경하지 않았다.
- 소스 checkout: `/Users/admin/workSpace/venture-studio-worktrees/festa-shadow-production` (현재 운영 커밋에 고정한 detached 검증 checkout). 문서 소스는 사용자 지정 현재 프로젝트의 `docs/qa/`에 저장한다.

## 운영 설정

모든 Jev 바인딩은 Cloudflare Pages production의 `secret_text`로 설정했다. TypeSafe 원본 키는 공용 게이트웨이에만 있고, Festa에는 전용 LiteLLM 가상 키만 연결했다. 키는 명령 인수·파일·Git·빌드 산출물·보고서에 기록하지 않았다.

| 설정 | 적용값 |
|---|---|
| `JEV_INTERVIEW_MODE` | `shadow` |
| `JEV_BASE_URL` | `https://shared-ai-d5cy7m6i7q-uc.a.run.app/llm` |
| `JEV_MODEL` | `jev-1.13.0` |
| `JEV_MIN_CONFIDENCE` | `0.8` |
| `JEV_API_KEY` | 별도 운영 가상 키, 값 비공개 |
| 가상 키 별칭 | `festa-jev-shadow` |
| 모델 권한 | `jev-1.13.0`만 |
| 허용 경로 | `/typesafe/v1/systemone`만 |
| 예산 | $0.05 / `30d` |
| 요청 한도 | 10 RPM |
| 만료 | 없음. 운영 연결용으로 유지하며 테스트 종료 시 폐기하는 임시 키와 구분 |
| 조회 시 다음 예산 초기화 | `2026-11-01T00:00:00Z` |

키 정책은 발급 후 서버에서 재조회했다. 조회 당시 LiteLLM 기록 spend는 **$0.000197358**이었다. 연결 사전 확인 및 운영 확인 호출을 포함한 누적 기록이며, 요청 한 건 비용이나 공급자 최종 청구서 실측으로 해석하지 않는다.

## 실제 검증

1. 정적 Next production build·TypeScript 검사 통과, Pages Functions 번들 통과. 비밀 없이 빌드했으며 정적 출력에는 런타임 API 키를 주입하지 않았다.
2. 전용 키 사전 실제 호출: 합성 식재료 미확인 사례에 `ask_food`, 신뢰도 1.0 반환.
3. 새 Production 배포 success 및 소스 SHA 일치, Jev 바인딩 5개 존재 확인.
4. 운영 공개 `/api/adaptive-interview`에 합성 옥토버페스트 답변을 전송. 실제 HTTP 200, provider=`litellm`, topic=`food` 후속 질문 반환.
5. 같은 요청의 Cloudflare tail 로그에서 아래 이벤트 확인. 로그는 요청 본문·헤더·쿠키를 저장하지 않고 고정된 Jev 메타데이터만 추렸다.

```json
{"event":"festa_jev_interview","rubric":"festa-question-plan-v3","mode":"shadow","outcome":"observed","candidate":"ask_food","decision":"ask","focus":"food","model":"jev-1.13.0","confidence":1,"elapsedMs":656,"inputTokens":1735,"outputTokens":106,"requestOutcome":"ok"}
```

운영 응답 질문: **“동행인이 드시지 못하는 특정 식재료나 알레르기가 있는 재료가 있으신가요?”**

이 요청의 전체 HTTP 응답은 4,693ms였다. Jev의 656ms는 전체 응답 시간에 포함된다. 단일 합성 사례이며 평균 지연·비용 개선율이나 일반 정확도 증거가 아니다. shadow에서는 기존 LLM 판단/검수를 계속 수행하므로 당장 호출 비용 절감이 생기는 구조가 아니다. Jev 호출에는 3초 제한이 있으며 오류·저신뢰 등은 기존 경로로 복귀한다.

첫 tail 관측창은 이벤트 0건으로 종료돼 검증 통과로 취급하지 않았다. 두 번째에는 tail을 먼저 열고 API 요청을 수행해 위 이벤트와 응답을 함께 확인했다. 두 tail 프로세스와 배포·검증 프로세스 모두 종료 확인했다. 이번 배포 후 확인은 공개 API와 서버 로그를 연결한 검증이다. 브라우저의 전체 클릭 흐름 재검증과 구분한다.

## 운영 유지·복구와 다음 단계

- 현재 운영은 **shadow 유지**. 실제 사용자의 축제·조건·대화 이력이 Jev 판단을 위해 TypeSafe로 전달된다. 로그에는 해당 원문을 저장하지 않는다.
- 일반 LLM 키와 Jev 키가 분리돼 있다. Jev의 예산/요청 한도 오류가 기존 LLM 권한을 확대하거나 우회하게 하지 않는다.
- 되돌릴 때는 production `JEV_INTERVIEW_MODE=off`를 설정하고 **그 시점의 최신 운영 소스**로 재배포한다. 타 세션의 새 코드를 과거 배포로 덮어쓰지 않는다. 긴급한 호출 중단은 전용 키 회수로 할 수 있으나, 설정/런타임의 off 전환과 별개로 기록한다.
- Pages secret 변경은 이를 사용하는 새 배포 전에 적용해야 한다. 이번 작업에서도 바인딩을 먼저 설정한 뒤 재배포했다. [Cloudflare Pages 공식 바인딩 문서](https://developers.cloudflare.com/pages/functions/bindings/)
- 다음은 여러 사례의 shadow 판단 품질·실패율·추가 지연·누적 비용 비교다. 관찰 결과를 검토한 뒤 on 전환을 별도로 결정한다. 이번 운영 연결 승인을 on 전환 승인으로 확대하지 않았다.

## 산출물

`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/festa/shadow-production-20261001/`

| 파일 | SHA-256 |
|---|---|
| `provisioning.json` | `469d17d71f9b2a031963ee2c48302bf4431f12e5cab1f5f224ee35d243cceefd` |
| `shadow-confirmation-events.json` | `87baa9490ea81b40f302c280d8f3c7ec31709a1d7870e75a998d774c44840c49` |
| `production-api-smoke.json` | `b6ee62621aa5c438c965e7ec3401653f6992309873ec754b27825a320753383c` |
| `key-policy.json` | `c39aae91d54940d313671407462a44e0e627110f8f32fd3d6b2633fd6f6d3e04` |
