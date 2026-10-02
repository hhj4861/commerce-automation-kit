# AI의 숨은 기반 3탄 — HBM

주제: **비싼 AI칩이 계산도 못 하고 기다리는 이유**. 용량과 대역폭을 구분하고, HBM의 적층·TSV·인터포저 연결이 실제 서비스에 어떤 영향을 주는지 설명한다. 특정 기업의 성능 우위나 투자 수익을 주장하지 않는다.

## 제작 상태

- 대본 17구간·Kyle 음성 생성과 정확한 대본 자막 정렬 완료.
- 롱폼 계획 327.333초, 숏폼 계획 77.125초. 최종 파일 검증 결과는 `verification.json`, `short-verification.json`을 기준으로 한다.
- 본 렌더링 및 최종 시각·음성 검증 진행 중. 이 상태에서 완성 파일 전달로 보고하지 않는다.
- 기존 1·2탄과 다른 완성 영상은 수정하지 않았다. 웹 제작실 배포와 YouTube 업로드는 이번 작업에 포함하지 않는다.

## 제작 방식

- 도입부: Higgsfield Seedance 2.0/std/1080p/16:9/6초/생성 음성 없음. 새 생성 1회, 재생성 0회. 작업 ID `01603a68-fd02-451f-b492-ab9fc22e2cf9`, 완료·다운로드 확인.
- 공식 견적 54크레딧. 생성 전 1,200.1, 생성 후 1,146.1크레딧으로 조회 잔액 차이 54 확인. 계정 조회의 플랜 문자열은 `plus`였으며, 사용자 제공 Pro 구독량과 별도로 기록한다. 요금제 변경·추가 결제 없음.
- 본문: 자체 Blender 4.5.10/EEVEE, 1920×1080, 네이티브 24fps. 서버실·기판·주방/창고 비유·서비스 화면·통신 공간을 제작하고, 전체/중간/확대 구도를 전환한다. 물리 치수 및 배치가 단순화된 개념 재현이다.
- 음성: ElevenLabs Kyle `RU7aSi6lT4uQBXMLgDxK`, 1.0배. [TTS 실행](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36972343577) 성공, 17파일 회수. 저장된 메타데이터의 텍스트·Voice ID를 대본과 대조한다.
- 자막: 로컬 Whisper로 원문 대본 시간 정렬, Pretendard SemiBold, 흰색/어두운 외곽선, 하단 배치. 고정 제목판과 자막 박스를 없애고 장면 위에 배치한다.
- 숏폼: 롱폼과 동일한 3D·Higgsfield·음성을 재활용한다. 중앙의 주요 대상을 세로로 재구성하며 608×1080 영역을 1080×1920으로 리사이즈한다. 네이티브 세로 3D 재렌더가 아니며 추가 유료 요청 없음. 세로 크롭에서 핵심 구조가 보이는지 별도 검토한다.

## 소스와 저장 경로

- `brief.json`: 원문 대본·장면 목록·유료 도입부 프롬프트·예산 상한.
- `sources.md`: 1차 출처와 사실 표현의 한계.
- `produce.mjs`: 기존 Cloudflare 인증 어댑터/공식 Higgsfield CLI와 TTS workflow 호출. 접수 영수증으로 중복 유료 요청을 막는다.
- `align.py`: 원문을 변경하지 않는 자막 시간 정렬.
- `scene.py`: 환경·재질·카메라·부품 동작의 자체 생성 코드.
- `edit.py`: 자막·정배속 음성·도입부 조립과 롱폼/숏폼 전체 디코딩 검증.

최종 전달 예정 위치:

- `/Users/admin/Downloads/vedio/hbm-episode-3-long.mp4`
- `/Users/admin/Downloads/vedio/hbm-episode-3-short.mp4`

중간 자산·로그:
`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261002-hbm/`

인증은 기존 Cloudflare 브로커에서 읽고, CLI의 일시 인증 파일은 로컬 `~/Library/Application Support/Shopshorts` 아래에만 둔다. Git·영상 자산 폴더에 비밀을 기록하지 않는다.

## 재현

1. 기존 영수증 및 출력 상태를 확인한다. 유료 도입부는 `produce.mjs cost` 조회 후 예산 내 최초 실행만 `generate`한다. 실패/미확정 접수는 공식 이력을 확인하며 자동 재제출하지 않는다.
2. `produce.mjs tts`의 원격 실행을 확인하고 `narration` artifact를 캐시의 `remote-narration`으로 회수한다. 기존 음성이 있으면 새 호출하지 않는다.
3. `align.py --cache <캐시> --model-dir <기존 로컬 Whisper 모델>` 실행.
4. Blender에서 `scene.py -- --cache <캐시>/3d --preview`로 구도를 확인한 뒤 같은 명령에서 `--preview`를 빼 본 렌더링한다. 중단 파일은 ffprobe로 확인하고 해당 장면만 `--force --shot <id>`로 재렌더링한다.
5. `edit.py --cache <캐시> --font-dir <Pretendard 폴더> --output <롱폼 경로>`; 숏폼은 `--short` 추가 및 별도 출력 경로. 원본 완성본을 덮어쓰는 경로를 지정하지 않는다.
6. 최종 디코딩·A/V 길이·자막 폭/타이밍·긴 무음·장면별 화면을 확인한 후 결과 보고서를 확정한다.

기술 검증의 통과가 레퍼런스와 동일한 미술 품질을 보장하지 않는다. 이번 편은 신규 공간·구도 기준을 처음 적용하는 제작이며 실제 완성본을 함께 검토한다.
