---
name: drama-series
description: Codex에서 AI 드라마·미니시리즈의 기획, 대본, 시나리오 교차 리뷰와 영상 제작을 공통 drama-series 절차로 진행한다. 광고는 ad-video, 상품 소개 쇼츠는 shopping-shorts를 사용한다.
---

# drama-series — Codex 입구

절차의 단일 원본은 [제작 절차](../../../.claude/skills/drama-series/SKILL.md)와 [대본 작성 지침](../../../.claude/skills/drama-series/WRITING-GUIDE.md)다. 먼저 두 파일을 읽고 따른다. 이 입구는 절차를 복제하지 않고 Codex 실행·검토 차이만 정한다. 사용자의 현재 지시와 프로젝트·전역 지침이 우선한다.

## 세션 시작과 CLI

저장소 루트에서 실행한다. `ds`는 설치된 명령이 아니라 다음 명령의 약칭이다.

```bash
npm run --silent cli -w @cak/drama-series -- <명령>
```

iCloud 임시 경로가 길어 `tsx` CLI의 Unix 소켓 생성이 실패하면, 동일 CLI를 `node --import tsx packages/drama-series/src/cli/index.ts <명령>`으로 실행한다. 임시 출력 루트를 `/tmp`로 되돌리지 않는다.

1. 현재 revision과 진행 회차·소유자·기존 승인 범위를 확인한다. 새 세션이라는 이유로 이미 제출한 작업을 재제출하지 않는다.
2. **세션 시작 시 `ds review-inbox --agent codex --dir docs/videos/<작업>/reviews`로 미처리 토큰부터 확인·처리한다.** 메일함 `/Users/admin/workSpace/.agent-mailbox/drama-series/README.md`와 `to-codex/`도 읽는다.
3. `dcddf97` 기준 `review-inbox`, 토큰 리뷰, 키프레임·컷 판정·`next`는 **구현 예정 명령**이다. 현재 CLI의 명령 지원 여부부터 확인한다. 없으면 메일함의 일반 검토만 처리하고 서명 검증·교차 리뷰 관문 통과를 주장하지 않는다. 필요한 관문이 없을 때 shot-v1 유료 생성을 진행하지 않는다.
4. 이어지는 회차는 validate·judge·plan·keyframe·verdict·review에 **`--prev-episode <앞 회차.json>` 필수**, `next`에는 **`--prev-clips <앞 회차 clips 폴더>` 필수**다. 앞 회차 마지막 컷·승인 출력인지 확인한다. 첫 회차 또는 명시적인 `startsFresh`만 앞 회차 입력 대상에서 제외한다. 옵션 미지원/입력 누락이면 경계를 생략해 생성하지 않는다.

## 교차 리뷰와 메일

이 제작 워크플로의 시나리오 교차 리뷰는 작성자 반대 역할이 맡는다: **Codex 작성 → Claude 리뷰, Claude 작성 → Codex 리뷰**. 같은 에이전트의 다른 세션 리뷰로 대체하지 않는다.

- Codex 작성분은 `authoredBy: codex`로 기록하고 `review-request --author codex --reviewer claude`로 토큰을 발급한다(지원되는 revision에서). 경로·지문·앞 회차 결말·validate/JEV 결과·검토 항목을 함께 보낸다.
- Claude 작성분을 받으면 이야기 흐름·장르 약속·연속성·컷 규칙·대사·수위를 확인해 **pass 또는 changes + 항목별 근거**로 답한다. 토큰 리뷰는 `review-respond --agent codex`와 `cross-review-apply`의 서명/지문/만료 검증을 따른다. 상세 인자는 현재 원본 절차/CLI를 확인한다. 대본이 바뀌면 이전 pass를 재사용하지 않는다.
- 미구현/서명키 조회 불가일 때 일반 의견 회신은 가능하지만 토큰 검증 완료로 취급하지 않는다. 키·서명을 임의 대체하거나 직접 pass 보고서를 쓰지 않는다.
- 답장은 메일함 **`.tmp/<파일>.tmp → mv → to-claude/<파일>.md`**로 원자 저장한다. `YYYYMMDDTHHMMSS-codex-<주제>.md`, 머리말 `from: codex / to: claude / re: <원본 파일명> / topic: <주제>`, 토큰 리뷰면 `token:`도 넣는다. 이미 전달한 파일은 수정하지 않고 처리한 원본만 `archive/`로 옮긴다.
- 리뷰/메일은 사용자 승인이 아니다. 기획·키프레임·파일럿·예외·최종 검수·비용은 실제 사용자 승인 범위와 근거를 보존한다. `--by user`를 직접 적는 것으로 승인을 만들지 않는다. 업로드·머지·배포·클라우드 설정 변경은 별도 명시 승인 범위에서만 한다.

## 도구와 생성 인계

- JEV 릴레이는 원본을 사용한다: `node .claude/skills/drama-series/scripts/jev-relay.mjs --request <요청.json> --out <응답.json>`. 이 명령은 GCP SSH·임시 키·실제 판정 호출을 수행한다. **무과금 실행 확인에는 `node --check`와 인자 없는 usage 확인만** 사용한다.
- Higgsfield 도구는 현재 세션의 도구 목록에서 확인한다. Claude 연결이 Codex에도 연결됐다고 가정하지 않는다. 없으면 무과금 대본/검토를 계속하고, 생성 인계가 승인된 범위에서 `ds next`의 출력·계획 지문·소유자 handoff·비용 승인 근거를 Claude 메일함으로 전달한다. `next`가 미구현이면 제출 가능한 컷을 임의로 만들어 보내지 않는다.
- 프레임 시트는 Codex 이미지 보기 도구(로컬 `view_image` 또는 이미지 첨부)로 실제 열어 판정한다. 질문별 근거 프레임 ID와 판정자를 기록한다. 얼굴/의상 참조·승인 키프레임·앞 컷 마지막 프레임을 함께 비교한다. 정지 표본만으로 행동 전 구간, 목소리, 실제 발화·립싱크를 확인했다고 주장하지 않는다. 자료 부족은 pass로 처리하지 않는다.
- GCP 개인 키는 `gen-lang-client-0881453127`의 Secret Manager에서 실행 시 조회하는 구조다. 비밀값을 출력·파일/iCloud/메일/Git에 저장하지 않는다. API·Secret·IAM·키 생성이나 MCP 연결 설정은 이 입구를 읽었다는 이유만으로 변경하지 않는다.
- 대본·검토 기록은 원본 절차의 `docs/videos/<작업>/`, 완성 미디어는 사용자 지정 미디어 경로를 쓴다. **Codex 임시 프레임·렌더·로그는 전역 `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/<프로젝트>/<작업>/`** 아래에 둔다. 원본의 다른 에이전트 임시 경로를 그대로 복사하지 않는다.

연결 조사와 확인 범위는 [Codex 이식 검증 기록](../../../docs/tasks/20261008-drama-codex-parity.md)을 참고한다. 이 기록은 특정 revision의 관측이며 새 세션의 도구/인증 상태를 대신하지 않는다.
