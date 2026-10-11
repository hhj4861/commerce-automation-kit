# @cak/drama-series (원자 #15)

장르를 모르는 AI 미니시리즈 제작 엔진. 시리즈·회차·컷 검증, 대사·장소·시나리오 관문, 생성 명세·견적, 받아쓰기 대조, ffmpeg 조립을 맡는다. **외부 서비스를 호출하지 않는다.** JEV 판정과 힉스필드 생성은 실행자(`.claude/skills/drama-series`, 이후 Shopshorts Studio)가 하고 결과 파일을 CLI에 넣는다.

- 설계: `docs/superpowers/specs/2026-10-06-drama-series-design.md`
- 시험 제작 근거: `docs/videos/20261006-minidrama-pilot/`
- 장르 추가: `genres/<id>.json` 파일 하나(스키마는 `src/core/genre.ts`)
- 관문 추가: `src/core/gates/` 파일 하나 + `registry.ts` 등록
- 영상 모델 추가: `src/adapters/video/` 에 `toXxxClip` 추가 후 `plan.ts`에서 선택

## 미확인 (TODO(D1))
- Seedance 2.5 `@ImageN`이 요청 medias 순서를 따른다는 것은 시험분 생성으로 확인했고 공식 문서에서는 확인하지 못했다.
- 단가표(`src/core/estimate.ts`)는 2026-10-06 `get_cost` 조회값이다. 생성 직전마다 다시 조회한다.
- 독백 목소리를 Seedance 음성 참조로 맞추는 방법은 미검증이다.

## 회차 연결 문맥 (F10 첫 단위)

현재 회차에 `continuesFromEpisode: { "no": 1, "cutId": "c4" }`를 선언하면 `validate`, `judge-build`, `judge-apply`, `approve-line`, `plan`, `verify-clip`, `join-check`, `assemble`에 `--prev-episode <앞 회차.json>`를 함께 준다. `approve-line`도 연결 회차에서는 `--series`가 필요하다. 같은 시리즈의 바로 앞 회차 마지막 컷, 같은 장소만 지원한다. `startsFresh: true`와 동시 선언하거나 연결 선언 없이 앞 회차를 입력하면 거부한다. 새 선언이 없는 기존 회차의 경로·검증 방식은 유지한다.

앞 회차 연결 컷의 대사·행동·소품 상태를 판정 문맥에 포함한다. 앞 컷·현재 대본·시리즈·장르 팩이 바뀌면 `reviewContextDigest`가 달라져 이전 판정과 대사 승인을 다시 사용할 수 없다. 기존 `fingerprint`와 `lineHash`의 의미는 유지하며, 판정 결과를 기록하는 것만으로는 문맥 지문이 바뀌지 않는다. 연결 회차 질문 ID에도 문맥 지문을 붙여 옛 응답과 새 요청의 혼합을 거부한다. 내부 `applyVerdicts` 호출은 연결 회차에서 요청 당시 `reviewContextDigest`를 마지막 인수로 전달해야 한다(미연결 호출은 기존 형식 유지).

`join-check --prev-clips <앞 회차 클립 폴더> --clips <현재 회차 클립 폴더>`로 경계 파일을 구분한다. 회차마다 같은 cutId를 써도 현재 회차 파일을 앞 회차 파일로 자동 대체하지 않는다. SSIM 검사는 참고용이며 출시 승인이나 파일 출처 증명이 아니다.

**연결 회차의 생성 명세와 조립은 아직 차단한다.** 승인된 앞 회차 출시·프레임 SHA를 실제 출력 바이트에 결합하는 경로가 다음 구현 대상이다. 현재 변경은 문맥 검증만 제공하며 F10 전체·shot-v1·키프레임 승인·자동 다음 회차 실행을 완료한 것이 아니다. `startsFresh`는 연결하지 않겠다는 선언으로, 출시 승인을 대신하지 않는다.
