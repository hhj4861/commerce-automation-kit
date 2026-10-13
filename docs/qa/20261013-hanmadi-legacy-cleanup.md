# Hanmadi 퇴역 연결 설정 정리 — 2026-10-13

- 목표: shared-ai VM 점검 전에 Hanmadi의 Dify/accounts v1 의존을 해제한다.
- 승인: 사용자가 Codex에서 운영 변수 7개 삭제 → 기존 운영 코드 `2bc7178` 새 배포 → (a)~(d) 검증·Claude 전달을 직접 승인했다.
- 담당: Codex. 대상은 Vercel `dean-10/hanmadi` Production이다. VM·Festa·음악 학습 PR #209는 변경하지 않는다.
- 이번 설정 정리 당시 소스: `2bc71787a8417d0cd315b80dab04acded829d9fb`. 이후 음악 학습 배포로 변경된 현재 revision은 아래 점검 종료 확인에 별도 기록한다.
- 완료 조건: 승인한 변수만 제거, 동일 소스의 새 배포 READY/공식 URL 연결, (a) revision, (b) 내 AI 준비 중, (c) 회화 저장 안 함 안내, (d) 퇴역 경로 로그 확인. 화면과 HTTP 검증은 구분한다.

## 실행 전

- 기존 운영 배포: `dpl_581jrsQDbdfJS7jV66pWPYqpLnmQ`, `hanmadi-qmtwcg0j9-dean-10.vercel.app`, READY.
- Production에 대상 7개가 존재한다. Preview와 팀 공용 환경에는 해당 변수가 없다. 같은 팀의 현재 Vercel 프로젝트 목록에는 `festa`가 없다.
- 제거 대상: `CONVERSATION_PROVIDER`, `DIFY_BASE_URL`, `DIFY_API_KEY`, `DIFY_USER_SECRET`, `AI_ACCOUNTS_URL`, `AI_ACCOUNTS_KEY`, `AI_ACCOUNTS_SUBJECT_SECRET`.
- `LITELLM_*` 6개와 인증·Redis·Google·YouTube·ElevenLabs 변수는 보존한다. 비밀값은 출력·저장하지 않는다.
- Claude `al-cfadbf`에 시작 claim을 보냈고 전송 도구의 연결 큐 접수를 확인했다. 실제 수신 여부는 별개다.

## 실제 운영 반영

- 삭제: `2026-10-13T04:04:38.499Z`~`04:04:39.896Z`. 7개 모두 Production 한정인 것을 확인한 뒤 ID별로 삭제했다.
- 삭제 직후 나머지 14개의 ID·이름·대상 환경·수정 시각이 동일함을 비교했다. `LITELLM_*` 6개가 유지됐다.
- 배포 입력 251개(2,863,324바이트)를 `2bc7178`의 Git 원문과 대조했다. 기존 `hanmadi-lyrics-release` detached checkout은 변경 없이 보존했다.
- Vercel CLI 60.1.3의 원격 Production 빌드를 사용했다. 배포 단위 `HANMADI_RELEASE_SHA=2bc71787a8417d0cd315b80dab04acded829d9fb`, `HANMADI_DEPLOYMENT=learner`만 명시했다. 옛 deploymentId를 재사용하지 않고 현 프로젝트 환경을 읽는 새 소스 배포를 만들었다.
- 새 배포 ID: `dpl_DH79X9RhHnBRn1Sn6HQSSoT82Z51`.
- READY 시각: **2026-10-13 04:06:09.284 UTC / 13:06:09.284 KST**.
- 고유 URL: https://hanmadi-mqu0uqkiz-dean-10.vercel.app
- 공식 URL: https://hanmadi-lake.vercel.app
- `04:12:41.082Z` 재확인: READY, 공식 URL이 새 배포 ID를 가리킴, 삭제 대상 이름 0개, 보존 대상 14개.

## (a)~(d) 검증

| 항목 | 결과 | 근거·한계 |
|---|---|---|
| (a) 배포 revision | **PASS** | 공식 `/api/deployment` HTTP 200, `application=hanmadi`, `revision=2bc71787a8417d0cd315b80dab04acded829d9fb` (`04:07:50.517Z`) |
| (b) 학습자 내 AI | **PASS — 실제 Chrome 화면** | 새 배포로 새로고침 후 「내 AI」를 열어 “개인 계정 연결 서버를 준비 중이에요. 기본 Gemini로 연습할 수 있어요.” 표시를 확인했다. 개인 학습 설정·진도·대화는 변경하지 않았다. |
| (c) 튜터 회화 안내 | **미검증 — 기존 튜터 인증 필요** | `/conversation?language=ja&mode=free`는 튜터 로그인 안내를 표시했다. 현재 브라우저의 학습자 로그인은 튜터 권한이 아니다. PIN은 조회·출력·추정하지 않았고 인증을 우회하지 않았다. “이 앱은 대화 내용을 서버에 저장하지 않아요” 안내는 아직 실제 화면에서 확인하지 못했다. 점검 종료 후에도 동일한 인증 요구를 확인했다. |
| (d) 퇴역 경로 호출 | **보조 확인: 조회 0건** | 새 READY 시각 이후 Cloud Run `shared-ai` 로그에서 UA `node` 및 `/accounts`, `/v1/chat-messages`, `/v1/workflows/run`을 조회했을 때 `[]`였다. 짧은 관측 기간이며 로그 지연·기존 클라이언트는 별도 고려한다. (b)·(c)의 대체 증거로 쓰지 않는다. |

추가: 새 배포의 Vercel error 로그를 직전 15분 범위로 조회했으나 항목이 없었다. 이것을 모든 요청의 오류 부재로 일반화하지 않는다. 모델·음성 공급자 호출은 0회이며, 유료 회화 전송은 하지 않았다.

## 인계·남은 작업

- 최초 인계: Claude `al-cfadbf`에 새 배포 시각/ID와 (a)·(b)·(d) 결과, (c) 미완료를 전송했다. 도구는 연결 큐 접수를 반환했다. 당시에는 done으로 전달하지 않았고 W1 선행 조건을 미충족으로 알렸다.
- 후속 통지: `to-codex/20261013T182416-claude-w1-start.md`를 읽었다. Claude는 사용자와 (c)를 점검 뒤로 미루기로 결정했으며, Codex done을 기다리지 않고 W1을 시작한다고 통지했다. Claude는 새 배포 READY 시각 이후 퇴역 경로 호출 0건(curl 제외)을 별도로 확인했다고 보고했다. 이는 **Claude 보고**이며 Codex의 추가 로그 조회 결과가 아니다.
- 점검 중 Codex 대응: 종료 통지 전까지 Hanmadi 운영 E2E와 shared-ai 호출 시험을 보류했다. 아래 확정된 중단 구간의 502는 기능 회귀나 통과 근거로 집계하지 않는다. 이 통지로 VM 변경·PR 머지·토큰 삭제에 대한 새 승인을 추정하지 않는다.
- 다음: 점검 종료 통지는 수신했다. 기존 튜터 로그인이 가능할 때 (c)를 확인한다. PIN을 모르면 대체 확인 범위와 실제 화면 미검증 한계를 정리한다. 기존 프로필이 없으면 개인 진도를 임의 변경하지 않는다. (c)는 통과로 변경하지 않는다.
- 새 음악 학습·일본어 응답 품질 개선 PR #209는 이번 배포에 포함되지 않았다.
- 증적: iCloud 작업 루트의 `commerce-automation-kit/hanmadi-legacy-cleanup-20261013/deploy.log`, `deployment-check.json`. 코드·키·인증 쿠키를 그곳에 복사하지 않았다.

## 점검 종료 통지 및 직접 재확인

- `to-codex/20261013T195638-claude-maintenance-done.md` 수신: Claude는 W1~W17 완료와 claim 해제를 보고했다. 중단 구간은 **2026-10-13 09:25:08~10:53:59 UTC (18:25:08~19:53:59 KST)**다. DB 78개 테이블·2,930행, 모델 목록·discovery 보존 및 인증된 Hanmadi 키 조회 200은 Claude 보고이며 이번 Codex 조회 결과와 구분한다.
- **Codex 직접 확인: 2026-10-13 10:57:46.430 UTC.** 공개 `https://shared-ai-d5cy7m6i7q-uc.a.run.app`에 인증정보 없이 GET했다. `/health` 200, `/llm/v1/models` 401, `/accounts/connections`·`/v1/chat-messages`·`/llm/key/generate` 각각 404였다. 모델·음성 생성은 호출하지 않았다. 인증된 요청의 모델 실행이나 POST 동작 검증으로 확대하지 않는다.
- 같은 시각 Hanmadi `/api/deployment`는 200, `application=hanmadi`, **revision `f77f853119f99cd20c3f6c3d9204c8663d09900b`**를 반환했다. 기존 `2bc7178` 배포가 여전히 최신이라고 보고하지 않는다.
- Git 기록상 `f77f853`은 음악 학습 PR #210 머지이며 #209의 머지 `ba50446`을 포함한다. [별도 운영 기록](20261013-hanmadi-music-production.md)은 새 배포 `dpl_2XdKt3bZBbg5qKSLEctfht6GxnJd` 및 퇴역 변수 7개를 제외한 기존 14개 유지 확인을 기록하고 있다. 이 문서의 설정 정리 배포와 후속 음악 배포는 별개다.
- 이번 Vercel 관리 API의 현재 배포 상세 조회는 HTTP 403으로 실패해 최신 환경변수 목록을 직접 재조회하지 못했다. 공개 revision과 위 별도 운영 기록을 구분해 보존한다. 인증을 변경하거나 접근 제한을 우회하지 않았다.
- 두 revision 사이 `conversation-provider.ts`, `model-connections.ts`, `app/conversation`, `components/model-conversation.tsx`의 Git 차이는 없었다. 코드 동일성은 (c)의 실제 운영 화면 확인을 대체하지 않으며 **(c)는 계속 미검증**이다.

## 현재 운영 버전 후속 검증 — 11:53~11:55 UTC

사용자의 후속 진행 요청으로 `f77f853`에서 확인 가능한 검증을 이어갔다. 새 코드·배포·환경변수·학습 진도 변경은 없다.

- **관리 조회 재확인:** 공식 Vercel CLI 60.1.3 `project inspect`로 `dean-10/hanmadi`와 프로젝트 ID를 확인했다. `env ls production`의 메타데이터만 출력한 결과 `11:53:04.180Z`에 14개가 존재하고 퇴역 변수 7개는 없었다. `LITELLM_*` 6개도 유지됐다. 앞선 직접 REST API의 403 원인은 확정하지 않았지만, 공식 CLI를 통한 현재 설정 재조회는 성공했다. 민감 변수 값은 조회·출력·저장하지 않았다.
- **현재 배포:** CLI `inspect`에서 `dpl_2XdKt3bZBbg5qKSLEctfht6GxnJd`가 Production READY이고 공식 alias 두 개가 연결된 것을 직접 확인했다. `(a)` 공개 `/api/deployment`도 `11:55:49.237Z`에 200과 `f77f853119f99cd20c3f6c3d9204c8663d09900b`를 반환했다.
- **(b) 현재 버전의 실제 Chrome 확인:** `/study` → 「내 AI」에서 “개인 계정 연결 서버를 준비 중이에요. 기본 Gemini로 연습할 수 있어요.”를 확인했다. 기본 Gemini가 선택돼 있었으며 연결 동의·계정 연결·모델 선택·대화 전송은 하지 않았다.
- **(d) 점검 종료 뒤 로그:** `2026-10-13T10:54:00Z`부터 `11:55:49.237Z`까지 Cloud Run `shared-ai`의 UA `node` 및 `/accounts`, `/v1/chat-messages`, `/v1/workflows/run` 요청 조회 결과는 **0건**이었다(조회 한도 100). 조회 시점의 수집 지연 가능성을 포함한 이 범위의 결과이며, 앞으로의 모든 요청을 보증하지 않는다.
- **(c)의 로그인 없는 보조 검증:** 운영 소스는 Dify·명시 provider 설정이 없으면 LiteLLM을 선택하고, `/conversation`은 그 provider가 Dify일 때만 `storesConversation=true`를 전달한다. 일반 회화 컴포넌트는 false일 때 저장 안 함 안내를 표시한다. 해당 소스·테스트·관련 의존 파일과 lockfile이 운영 revision과 같은 기존 `hanmadi-language-music-20261013` checkout에서 `conversation-provider.test.ts`와 `model-connections.test.ts` **12개가 통과**했다. 가짜 전송을 주입한 단위 검증이며 실제 공급자 호출은 없다.
- **남은 한계:** 현재 `/conversation`은 여전히 튜터 로그인 안내를 표시한다. 위 코드·설정·단위 테스트는 인증된 운영 화면의 렌더링이나 실제 튜터 회화 요청을 대신하지 않는다. **(c) 실제 화면 확인만 미검증으로 유지**하고, 기존 튜터 인증이 가능해지면 이어서 확인한다. 인증 우회나 새 튜터 권한 생성은 하지 않았다.
