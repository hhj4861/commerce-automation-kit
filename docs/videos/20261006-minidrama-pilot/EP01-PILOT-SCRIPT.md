# 1화 시험분 — 「야간 상하차」 도입부 (약 60초)

- 형식: 16:9 실사, 7클립 합계 60초(1~5컷 10초씩, 6컷은 6초+4초로 분할), Seedance 2.5 `omni_reference` / 480p `draft: true` / `generate_audio: true`
- 참조 이미지(gpt_image_2_5, 2026-10-06 생성·눈검수 통과, job_id를 `image_references`로 전달):
  - 한서윤 — v2 `0fc5b969-2257-476a-b5a2-cdd3a04af627` (체형 수정, 2026-10-06 사용자 요청. v1 `0edd3fa3-34a2-4b8e-a1cf-62d6f895d0b7`은 폐기, 1컷 재생성 필요)
  - 최민재 — `09f1b75b-cff9-477d-a8a7-061d8885e6dd`
  - 오창식 — `9fe9d5b0-da4a-4400-8a6d-91244eb0fb60`
  - 물류센터 — `2ae41641-0ebc-45ea-ae47-f785e1c5b8f3`
  - 로컬 사본: `/Users/admin/Downloads/vedio/drama/20261006-minidrama-pilot/refs/` (영상 클립은 같은 폴더의 `clips/`)
- `@ImageN` 번호는 **그 클립 요청의 medias 순서**다(1·2컷 생성에서 확인). 클립마다 아래 표의 순서로 넣는다.
- 조직원 2명은 참조 없이 묘사로만 만든다(얼굴 일관성이 덜 중요한 단역).
- 대사 표시: ✅ JEV 확정 통과(`jev/r1`, `jev/r2`) / ⚠️ JEV 미확정 — 사용자 결정 대기.

## 연속성 규칙 (2026-10-06 사용자 지시: "배경·장소가 컷에서 변경이 없었으면 계속 유지")

**장소 A — 야간 작업 통로 (1~5컷, 같은 장소·같은 밤·연속된 시간)**
- 1~5컷 모두 물류센터 참조 이미지를 넣고, 아래 **장소 고정 문구**를 프롬프트에 그대로 붙인다. 컷마다 배경 묘사를 새로 쓰지 않는다.
- 배치: 왼쪽에 돌아가는 롤러 컨베이어, 오른쪽에 박스가 쌓인 파란 팔레트 랙, 회색 에폭시 바닥과 노란 통행선, 랙의 주황 경광등, 천장의 차가운 흰색 LED 줄조명. 컨베이어 옆에 **허리 높이의 빈 박스 더미**(1컷부터 화면에 보이게 해 4컷 액션의 복선으로 쓴다).
- 소품 상태 이어가기: 4컷에서 무너진 빈 박스 더미는 5컷에서도 바닥에 흩어진 채로 둔다.
- 장소에 실제로 있을 소품만 쓴다(예: 매트·체육관 장비 금지). 넘어지는 동작은 빈 박스 더미 위로 처리해 부상 묘사를 피한다.

장소 고정 문구(영어, 1~5컷 공통):
`Same continuous location in every cut: the night-shift aisle of the warehouse shown in the location reference — a running roller conveyor on the left, tall blue pallet racks stacked with cardboard boxes on the right, polished grey epoxy floor with yellow lane lines, amber safety lamps on the racks, cold white overhead LED strips, and a waist-high pile of empty cardboard boxes beside the conveyor. Keep the same layout, lighting and time of night.`

**장소 B — 센터 주차장 차 안 (6컷 앞 6초)**, **장소 C — 센터 직원 사물함실 (6컷 뒤 4초)**: 의도된 장소 전환이다. 한 클립 안에서 두 장소를 오가면 전환이 실패할 위험이 커서 두 클립으로 나눴다(비용 동일: 초당 3크레딧, 6초 18 + 4초 12 = 30).

공통 스타일 꼬리말(모든 클립): `Cinematic Korean TV drama, photorealistic, cold blue-white fluorescent light with warm amber accents, shallow depth of field, subtle film grain, natural Korean speech with accurate lip sync.` (장소 A 클립은 `ambient conveyor hum.` 추가)

## 컷 구성

| # | 시간 | 장소 | 장면 | 대사 / 소리 | 기능 |
|---|---|---|---|---|---|
| 1 | 0–10s | A | 새벽 2시 통로 전경 → 다른 작업자들이 버거워하는 무거운 박스를 서윤이 아무렇지 않게 들어 팔레트에 올린다. 컨베이어 옆 빈 박스 더미가 보인다 | 컨베이어 소음, 스캐너 '삑'. 자막 `새벽 2시, 경기 남부 물류센터` | 숨긴 힘의 암시 |
| 2 | 10–20s | A | 오창식과 조직원 둘이 통로로 들어와 민재의 멱살을 잡는다 | 오창식 ✅ "야, 막내. 이번 주 몫 내놔." / 민재 ⚠️ "제 일당이에요. 제발요…" | 원인(약자가 당함) |
| 3 | 20–30s | A | 서윤이 박스를 내려놓고 걸어와, 민재의 멱살을 쥔 오창식의 손목을 잡는다 | 서윤 ✅ "그 사람 놔주세요." / 오창식 ✅ "넌 또 뭐야?" | 행동의 시작 |
| 4 | 30–40s | A | **핵심 액션 1** — 조직원 하나가 달려들자 서윤이 비켜서며 짧은 관절기로 **컨베이어 옆 빈 박스 더미 위로** 넘어뜨린다. 더미가 무너진다 | 박스 무너지는 소리. 서윤 ⚠️ "다치기 싫으면 가세요." | 숨긴 힘 공개 |
| 5 | 40–50s | A | **핵심 액션 2** — 흩어진 박스 사이에서 두 번째 조직원의 주먹을 흘려 팔을 꺾어 제압. 오창식이 뒷걸음질, 민재가 입을 벌리고 본다 | 오창식 ⚠️ "너… 두고 보자." | 결과(1차 승리) |
| 6a | 50–56s | B | 주차장의 어두운 세단 안, 계기판 불빛 아래 오창식이 전화한다 | 오창식 ✅ "부사장님, 일이 좀 꼬였습니다. 웬 여자가 끼어들어서요." | 윗선 등장 |
| 6b | 56–60s | C | 사물함실. 서윤이 사물함 문을 닫는 순간, 문 안쪽의 검은 정장·이어피스 차림 경호팀 단체사진이 스친다 | 정적, 문 닫히는 소리. 자막 `2화에서 계속` | 다음 화 갈고리 |

## 클립별 참조 순서와 프롬프트 (영어)

| 클립 | medias 순서 (@Image1, 2, …) |
|---|---|
| 1 | 서윤 v2, 물류센터 |
| 2 | 오창식, 민재, 물류센터 |
| 3 | 서윤 v2, 오창식, 민재, 물류센터 |
| 4 | 서윤 v2, 오창식, 물류센터 |
| 5 | 서윤 v2, 오창식, 민재, 물류센터 |
| 6a | 오창식 |
| 6b | 서윤 v2 |

**Cut 1** (10s)
`Wide establishing dolly shot along the conveyor in @Image2 at 2 AM, then a medium shot of @Image1 (29-year-old Korean woman, curvy figure, low ponytail, black cap, fitted grey work vest, white cotton gloves, calm expressionless face) lifting a heavy cardboard box with ease and setting it on a pallet, while two male workers in the background strain to lift similar boxes together. Barcode scanner beeps. No dialogue.` + 장소 고정 문구 + 꼬리말

**Cut 2** (10s)
`@Image1 (Korean man in his 40s, slicked-back hair, thin mustache, black leather jacket, gold chain) walks down the aisle with two burly henchmen in black tracksuits and grabs the collar of @Image2 (21-year-old thin Korean man, messy black hair, neon yellow safety vest over a grey hoodie). Handheld medium close-up, tense. @Image1 says in Korean, low and menacing: "야, 막내. 이번 주 몫 내놔." Then @Image2 answers trembling in Korean: "제 일당이에요. 제발요…" One speaker at a time.` + 장소 고정 문구(`@Image3` 지정) + 꼬리말

**Cut 3** (10s)
`@Image1 (the woman in the black cap and grey vest) sets down a box and walks calmly between @Image2 (man in black leather jacket) and @Image3 (young man in neon vest), then grips @Image2's wrist firmly. Slow push-in close-up on @Image1's calm eyes. @Image1 says quietly in Korean: "그 사람 놔주세요." @Image2 sneers in Korean: "넌 또 뭐야?" One speaker at a time.` + 장소 고정 문구(`@Image4` 지정) + 꼬리말

**Cut 4** (10s)
`A henchman in a black tracksuit lunges at @Image1 (woman in black cap and grey vest). She sidesteps and uses one short, precise joint-lock throw that sends him falling onto the waist-high pile of empty cardboard boxes beside the conveyor; the pile collapses around him. @Image2 (man in leather jacket) watches, stunned. Grounded realistic choreography, no blood, no injury detail. Dynamic tracking shot, then she straightens and says calmly in Korean: "다치기 싫으면 가세요."` + 장소 고정 문구(`@Image3` 지정) + 꼬리말

**Cut 5** (10s)
`Among the scattered empty boxes from the collapsed pile, the second henchman throws a punch; @Image1 (woman in black cap and grey vest) deflects it and controls his arm in a standing arm lock until he gives up. @Image2 (man in leather jacket) backs away nervously. Reaction shot of @Image3 (young man in neon vest) staring with his mouth open. @Image2 points and says in Korean: "너… 두고 보자." Realistic non-graphic fight, no blood.` + 장소 고정 문구(`@Image4` 지정) + 꼬리말

**Cut 6a** (6s)
`Night, outdoor parking lot of the logistics center. @Image1 (man in black leather jacket, gold chain) sits in a dark sedan, lit only by the dashboard, holding a phone to his ear, tense and deferential. He says politely in Korean: "부사장님, 일이 좀 꼬였습니다. 웬 여자가 끼어들어서요." Static close-up, ominous.` + 꼬리말

**Cut 6b** (4s)
`Staff locker room of the logistics center, fluorescent light. @Image1 (woman in black cap and grey vest) closes her metal locker; for one moment the inside of the locker door shows a small framed group photo of her in a black suit with an earpiece among a bodyguard team. Quiet, door clicks shut. No dialogue.` + 꼬리말

## 후반 작업

1. 7클립을 순서대로 ffmpeg concat. 컷 사이 음량 정규화(-14 LUFS 목표).
2. 한국어 자막 번인(하단, 외곽선·그림자, 액션 동작을 가리지 않음). 생성 음성의 실제 발화와 대조해 맞춘다.
3. 첫 2초 안에 `AI로 생성된 영상입니다` 표기. 업로드 시 YouTube 합성 콘텐츠 표기를 켠다(업로드는 이번 범위 밖).
4. 대사 클립은 whisper 전사를 대본과 대조하고, 어긋나면 채택하지 않는다(`SCRIPT-REVIEW.md` 대사 작성 기준).
