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
