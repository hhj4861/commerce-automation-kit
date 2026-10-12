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

**연결 회차의 생성 명세와 조립은 아직 차단한다.** 아래 증거 준비·대조 기능은 제공하지만, 전체 컷 판정·실행 상태·출시 승인까지 결합하는 경로는 다음 구현 대상이다. 현재 변경은 문맥과 증거 검증을 제공하며 F10 전체·shot-v1 영상 실행·회차 전체 키프레임 승인·자동 다음 회차 실행을 완료한 것이 아니다. `startsFresh`는 연결하지 않겠다는 선언으로, 출시 승인을 대신하지 않는다.

### 앞 회차 클립·프레임 증거 준비와 대조

```sh
# out의 부모 디렉터리는 먼저 준비한다. out 자체는 반드시 새 디렉터리다.
node --import tsx src/cli/index.ts release-source \
  --series series.json --episode ep01.json --cut c4 \
  --clip /approved-local-input/c4.mp4 --out /work/ep01-c4-evidence

node --import tsx src/cli/index.ts continuation-check \
  --series series.json --episode ep02.json --prev-episode ep01.json \
  --source /work/ep01-c4-evidence --approval source-approval.json \
  --out /work/ep02-source-binding.json

# 저장한 결합 기록을 사용할 때에는 실제 파일과 문맥을 다시 확인한다.
node --import tsx src/cli/index.ts continuation-check \
  --series series.json --episode ep02.json --prev-episode ep01.json \
  --source /work/ep01-c4-evidence --approval source-approval.json \
  --binding /work/ep02-source-binding.json
```

`release-source`는 **미출시 증거 묶음**(`clip.mp4`, `last-frame.png`, `source.json`)을 만들며 승인하지 않는다. 같은 시리즈의 마지막 컷만 받는다. MOV/MP4 입력(최대256MiB·120초·각 변4096px), 첫 영상 스트림을 전체 디코딩하고 마지막 RGB24 프레임을 PNG로 저장한다. 추출 정책은 `video-0-rgb24-last-v1`; `pixelSha256`은 RGB24 픽셀 해시와 너비·높이를 함께 정규화해 해시한다. ffmpeg 기본 회전 처리를 두 디코딩에 동일 적용한다. 원본 파일은 변경하지 않고 출력 묶음의 파일은 읽기 전용으로 둔다.

사람이 실제 클립·프레임을 확인한 경우에만 다음 형식의 별도 기록을 제공한다. 도구는 이 기록을 자동 생성하지 않는다. `subjectDigest`는 검토한 `source.json`의 값이다.

```json
{
  "schemaVersion": 1,
  "decision": "approve-continuation-source",
  "subjectDigest": "sha256:<검토한 증거의 64자리 hex>",
  "approvedBy": "<사용자 식별자>",
  "userQuote": "<실제 사용자 승인 발화>",
  "recordedBy": "<기록한 에이전트/세션>",
  "at": "<승인 시각 ISO8601>"
}
```

`continuation-check`는 클립·PNG 바이트를 재해시하고 클립을 다시 디코딩해 마지막 프레임과 대조한다. 잘못된 프레임을 넣고 manifest 해시만 갱신해도 거부한다. 전달된 승인 기록의 대상, 앞 회차 대본·시리즈, 현재 문맥을 결합한다. 클립·프레임·앞 회차 대본·시리즈가 바뀌면 새 증거와 그에 맞는 승인 기록이 필요하며, 현재 회차 문맥이 바뀌면 저장한 binding도 재검사해야 한다.

성공의 `ok:true`는 **증거 일치**만 뜻한다. `authorized:false`와 미구현 출시 관문 사유를 항상 함께 반환한다. 사용자 발화 진위·작성자 신원 인증, 모든 컷의 의미 판정, 음성 검사, 실행 상태, 최종 출시 승인이나 생성 권한을 증명하지 않는다. 임의로 파일을 수정할 수 있는 같은 OS 사용자에 대한 인증 방어도 제공하지 않는다. 연결 `plan/assemble` 차단은 유지된다.

출력 경로가 있으면 덮어쓰지 않는다. 실패 시 해당 실행의 부분 폴더가 남을 수 있으며 `source.json`이 없거나 검증되지 않으면 재사용할 수 없다. 사용자 원본·다른 실행의 결과를 지우지 않는다. 프레임 추출은 ffmpeg 실행당30초 제한이며 초과 시 실패로 표시한다. 실제 외부 판정·생성 API를 호출하지 않는다.

### 샘플 프레임 시각 판정 (출시 판정 아님)

모든 컷에 사용할 수 있는 `visual-verdict-build`는 클립 사본과 첫·중간·마지막 PNG 및 `request.json`을 새 디렉터리에 저장한다. 중간은 전체 디코딩 ordinal `(frameCount-1)/2`를 내림하며 중복 ordinal은 제거한다(1프레임은 1장, 2프레임은 2장). 프레임 시각 간격을 균등하게 표집하는 방식은 아니다. 가변 프레임·회전은 실제 디코딩 순서와 회전 후 픽셀을 기준으로 한다.

```sh
node --import tsx src/cli/index.ts visual-verdict-build \
  --series series.json --episode ep01.json --cut c1 --job actual-job-id \
  --clip /authorized-input/c1.mp4 --out /work/c1-visual-review

node --import tsx src/cli/index.ts visual-verdict-apply \
  --series series.json --episode ep01.json --cut c1 --job actual-job-id \
  --source /work/c1-visual-review --response visual-response.json \
  --out /work/c1-visual-report.json
```

연결 회차는 두 명령 모두 `--prev-episode`를 추가한다. 시각 판정자가 요청의 PNG들을 직접 보고 응답한다. 외부 모델 호출은 자동 실행하지 않는다. 응답 형식은 `schemaVersion:1`, 요청의 `requestId`·`requestDigest`, 선언한 `reviewer`, ISO8601 `reviewedAt`, `answers[]`이며, 각 답은 `questionId`, `verdict: pass|fail|unknown`, `reason`, `frameIds[]`를 갖는다. 요청의 질문을 모두 정확히 한 번씩 답해야 한다. pass/fail은 해당 질문에 허용된 프레임을 최소 하나 인용한다. unknown은 근거 프레임이 없어도 되지만 사유는 필요하며 통과로 취급하지 않는다. 결과는 fail이 우선하고, fail 없이 unknown이 있으면 unknown이다. CLI는 pass만 exit0, fail/unknown/검증 오류는 exit1이다.

질문은 현재 대본의 행동, 출연진별 외형·의상 설명, 마지막 프레임의 배경·소품 상태에서 자동 생성한다. 적용 시 현재 대본·앞 회차 문맥·장르·job ID와 실제 클립/PNG를 다시 검사하고 질문 전체를 재생성한다. 질문 편집·누락, 오래된 응답, 다른 질문의 프레임 인용, 실제 ordinal과 다른 PNG를 거부한다. 출력 보고서가 이미 있으면 덮어쓰지 않는다. 직접 사용하는 어댑터 `applyVisualVerdict`도 같은 검증을 수행한다. core의 순수 함수만으로 실제 파일 검증을 대신하지 않는다.

**한계:** 이는 `sampled-visual-description` 범위의 보고서다. 샘플 사이 동작·의상 변화, 전체 비트, 참조 이미지와 인물 신원·세트 일치, 앞 컷과의 시각 연결, 대사는 검증하지 않는다. 선언한 job ID가 제공자에서 발급된 것인지, reviewer 신원이 진짜인지 인증하지 않는다. 이 때문에 결과 pass에도 `authorized:false`와 미충족 항목이 남는다. 기존 전체 출시·실행 관문이나 사람 승인 기록으로 변환하지 않으며, 연결 plan/assemble 차단은 유지한다. 같은 OS 사용자의 악의적인 동시 파일 변조를 방어하는 인증 경계가 아니다.

새 두 명령의 대본·시리즈·이전 회차·요청·응답 JSON은 1MiB 이하 UTF-8 일반 파일만 받는다. 중복 키(이스케이프로 같은 키를 쓴 경우 포함), 비유한 숫자, 과도한 중첩을 거부한다. FIFO·심볼릭 링크·장치 입력은 읽기 전에 거부한다. 기존 legacy 명령의 JSON 파싱 규칙은 바꾸지 않는다.

### shot-v1 키프레임 요청과 승인 기록

`shot-v1`·`authoredBy`·완전한 blocking·1~2개 beats가 있는 컷에 대해 생성 요청을 준비한다. 참조는 세트 → 얼굴들 → 의상들 순서다. 구도가 선언되면 해당 구도의 참조 자산이 필수이며, 외형별 얼굴 참조도 필요하다. `keyframe-build`는 제공자 호출을 하지 않는다.

```sh
node --import tsx src/cli/index.ts keyframe-build \
  --series series.json --episode ep01.json --cut c1 --aspect 16:9 --out request.json

# 실제로 확보한 사용권 있는 PNG를 새 증거 폴더에 보관한다.
node --import tsx src/cli/index.ts keyframe-source \
  --series series.json --episode ep01.json --cut c1 --asset actual-asset-id \
  --file /authorized-input/keyframe.png --out /work/c1-source

# 사람이 이미지를 확인하고 제공한 승인 기록을 결합한다. 승인을 자동 생성하지 않는다.
node --import tsx src/cli/index.ts keyframe-approve \
  --series series.json --episode ep01.json --cut c1 --asset actual-asset-id \
  --source /work/c1-source --approval human-approval.json --out /work/c1-approved

node --import tsx src/cli/index.ts keyframe-check \
  --series series.json --episode ep01.json --cut c1 --asset actual-asset-id \
  --source /work/c1-approved
```

연결 회차에는 네 명령 모두 `--prev-episode`를 추가한다. 출력의 부모 폴더는 먼저 준비하고, 출력 파일/폴더 자체는 새 경로를 사용한다. 원본 대본과 이미지, 이전 증거는 수정하지 않는다. PNG는 단일 프레임·실제 16:9·각 변 최대4096px·256MiB 이하만 받는다. 파일 해시와 전체 디코딩 픽셀 해시를 보관하고 승인 확인 때 다시 대조한다. 요청·승인 JSON은 UTF-8 일반 파일 최대1MiB이며 중복 키·FIFO·심볼릭 링크를 거부한다. 요청 출력도 동일 크기 제한을 적용한다.

`human-approval.json` 형식:

```json
{
  "schemaVersion": 1,
  "decision": "approve-keyframe",
  "subjectDigest": "sha256:<검토한 source/evidence.json의 64자리 hex>",
  "approvedBy": "<사용자 식별자>",
  "userQuote": "<실제 사용자 승인 원문>",
  "recordedBy": "<기록한 에이전트/세션>",
  "at": "<승인 시각 ISO8601>",
  "checks": {"composition": true, "cast": true, "wardrobe": true, "props": true, "safety": true}
}
```

장면 지문은 스타일, 장소·구도, 참조 자산, 얼굴·의상, 블로킹, 첫 비트, 행동·화면 설명, 사용·휴대 소품, 같은 장소의 앞 컷 소품 상태, 화자 순서·대사 수 및 안전 검사 항목에 결합된다. 대사 문구와 대사 검증 상태만 바뀌면 이미지 승인은 유지된다. 장면·자산 ID·실제 이미지가 바뀌면 기존 승인을 거부한다. 기존 대본 내용 지문의 의미는 바꾸지 않는다.

**범위:** 이는 주어진 사람 승인 기록과 단일 컷 이미지의 결합 검사다. 사용자 신원·발화 진위나 원격 자산 ID의 실제 출처를 인증하지 않는다. 회차 전체 승인, 실행 원장, 출시 승인을 대신하지 않으므로 성공해도 항상 `authorized:false`이며 shot-v1 `plan/assemble` 차단은 유지한다. 생성 API, 유료 호출, 대본 안 `cut.keyframe` 변경은 하지 않는다. 부분 출력은 보존하지만 검사를 통과하지 않으면 사용할 수 없다(`source`는 evidence.json, `approved`는 binding.json을 마지막에 쓴다).
