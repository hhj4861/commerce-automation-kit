# 괜찮다는 거짓말 — 1부 립싱크 v3

## 작업 카드

- 목표: 갈등을 먼저 보여주는 2분40초~3분 웹툰 숏드라마. 서윤·민지의 목소리/표정 구분과 실제 대사 립싱크.
- 소유/범위: Codex, `feat/webtoon-psychology-trilogy`, 준비 기준 `f576436`. 이 제작 폴더만 수정한다. 기존 완성본·다른 세션·운영 앱은 유지한다.
- 승인: 사용자가 9컷 예상 120~125크레딧 설명과 최대140크레딧·압축 구성에 동의. 9건 접수/완료/다운로드, 표시된 비용 합계 **123크레딧**. 재접수 0건. ElevenLabs 음성 비용은 별도이며 금액을 합산했다고 주장하지 않는다.
- 현재: 26개 편집 구간, 170.7917초 계획, 한국어 자막70개. 립싱크 원음 상관 검증 9/9 통과. 최종 렌더·전체 디코딩·AV 길이 검증 통과. 1920×1080, 24fps H.264/AAC.
- 완료 기준: 전체 디코딩, 정확한 프레임/AV 길이, 자막 본문·시각 검수, 본인 소스 커밋과 upstream push.
- 결과: 아래 로컬 MP4 완성. 첫 갈등 대사와 후반 통화 장면에서 목소리 구분·립싱크를 확인할 수 있다. 공개 업로드/운영 반영은 이번 범위에 없다.

## 편집·연기

- 첫7.67초에 서윤의 서운함을 보여주고 ‘그날 오후’로 되돌아간다. 같은 장면을 후반 절정에서 재사용하며 추가 생성하지 않는다.
- 반복 속마음과 설명을 줄이고 케이크·보내지 못한 메시지·포크 두 개·반응 장면으로 이어간다. 다음 만남을 예고하며 1부를 마무리한다.
- 서윤: `UqW1DivwFt1NwUMSGnTn`, 민지: `JguuvPsf0F2TNXefsblh`, 남성 내레이션: `CxErO97xpQgQXYmapDKX`. **1.0배**, 인위적 피치 변경 없음.
- 감정 흐름: 괜찮은 척 → 쓸쓸함 → 서운함 → 대화 단절. 민지는 무심함 → 뒤늦은 사과 → 방어적인 해명. 대사별 감정 지시를 음성과 영상에 적용한다.
- Kling Avatars 2.0 Pro로 원화+최종 음성에서 새 립싱크9컷(입력 합계59.79초). 나머지는 기존 Higgsfield 인물 동작 영상 재사용. 전 구간을 새로 생성한 것은 아니다.
- 생성 모델이 혼입한 잘못된 글자는 얼굴과 입을 보존하는 장면별 크롭으로 제외. 서윤·민지·속마음·메시지 표기를 편집 자막에 분리한다. 대사는 Pretendard SemiBold, 2줄 이내.
- e1-05의 생성 영상이 의도한 쉬는 구간보다 약0.067초 짧아, 발화 종료 뒤 마지막 프레임만 보완한다. 발화/입모양을 늘이거나 음성을 배속하지 않는다.

## 생성 비용

| 컷 | 표시 크레딧 |
|---|---:|
| e1-00 | 10 |
| e1-01 | 9 |
| e1-05 | 9 |
| e1-07 | 10 |
| e1-09 | 18 |
| e1-23 | 17 |
| e1-24 | 16 |
| e1-25 | 18 |
| e1-26 | 16 |
| 합계 | **123** |

## 검증과 한계

- 전체 ffmpeg 디코딩 정상, AV 길이 오차0.08초 미만, 검은 화면0.5초 이상 없음. 평균−17.8dB/최대−1.0dB. 2초 이상 저음량은 마지막 의도한 여운 구간뿐이며 중간 장시간 무음 없음. 최종18표본 프레임에서 구도·자막·인물을 확인. SHA-256과 비용/오디오 근거는 `verification.json`.

- 입력 음성과 생성 영상 음성을16kHz 모노로 비교: 9컷 모두 최적 시간 지연0ms, 상관계수 최소0.99972. 원음의 위치/보존을 검증하며, 사람 청음이나 모든 음소의 입모양 정밀 측정과 동일하지 않다.
- 신규 음성12문장에 Whisper medium 독립 전사 수행. e1-04/24/31의 발음 문제가 보여 v4로 보완했고 세 문장 모두 정규화 본문과 전사 일치. 나머지 신규 음성 전사에서 e1-18 ‘물어보길/물어보기’ 인식 차이는 기록한다. 기존 음성은 정확히 동일한 원음·메타데이터만 재사용한다.
- 9개 원본의 앞·중간·끝 표본 프레임을 열어 인물 외형, 표정 변화, 글자 혼입 위치를 검수했다. 전편 연속 사람 시청/청음을 수행했다고 주장하지 않는다.
- 첫 렌더가 일시적 디스크 부족으로 중단되어, 불완전 조각을 프레임 수로 식별하고 원자적 저장 후 재개했다. 이 경우 유료 생성 재접수는 없다.
- 16:9 가로형 숏드라마다. 길이만3분 이하라고 YouTube Shorts 분류라고 부르지 않는다.

## 파일·재현

완성본: `/Users/admin/Downloads/vedio/im-fine-webtoon-episode-1-lipsync-v3.mp4`

작업 캐시: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261005-webtoon-lipsync-episode1`

`inputs/`, `lipsync/`, `higgsfield-generation-ledger.json`, `lipsync-audio-check.json`, `voice-*/`, `alignment/`, `timeline-1.json`, `captions-1.ass`, `render/`, `logs/`를 보관한다. 원화와 기존 모션의 원본은 각각 `20261004-webtoon-psychology/art`, `20261005-webtoon-acting/motion`이다. 인증정보를 문서나 영상 캐시에 복사하지 않는다.

```sh
node docs/videos/20261005-webtoon-lipsync-episode1/produce.mjs validate
python3 docs/videos/20261005-webtoon-lipsync-episode1/render.py render --cache "$VIDEO_CACHE"
python3 docs/videos/20261005-webtoon-lipsync-episode1/render.py verify --cache "$VIDEO_CACHE"
```

기존 생성 결과와 TTS receipt를 보존한다. `prepare`는 입력WAV를 만드는 단계일 뿐 Higgsfield 자동 재접수 명령이 아니다.
