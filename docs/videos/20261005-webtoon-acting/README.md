# 괜찮다는 거짓말 — 1편 감정 연기 수정본 (완료)

사용자 승인: 2026-10-05, **1편 먼저 / Higgsfield 최대 140크레딧**. 2·3편 수정 렌더는 아직 진행하지 않는다.

| 역할 | 사용자 지정 Voice ID | 공식 라이브러리 이름 |
|---|---|---|
| 서윤 | UqW1DivwFt1NwUMSGnTn | Suzie - Calm Korean |
| 민지 | DlU3oDWG5pC5PBITbfga | Sori - Warm, Clear & Trustworthy |
| 남성 내레이션 | CxErO97xpQgQXYmapDKX | Theo - Warm, Smooth and Soft |

세 음성은 공식 공개 라이브러리에서 정확한 ID·기본 요율 1을 확인한 뒤 제작 계정에 추가했다. Eleven v3의 감정 태그가 포함된 `ttsText`와 화면 자막용 `text`를 분리한다. 감정은 대사의 의미를 기준으로 지시하며 모델 해석은 비결정적이다. 두 문장(e1-12, e1-24)은 독립 ASR에서 발음이 불명확하여 Eleven v4로 비교 생성했고, 정확한 전사를 확인해 해당 문장만 교체했다. 1.0배속 유지. 발화별 RMS를 강제로 같게 만들지 않고 역할별 고정 음량(남성 1.25, 서윤 1.0, 민지 0.9)과 피크 제한으로 감정의 강약을 보존한다. 이는 재생 속도가 아닌 음량이다.

기존 20261004 제작물과 완성본을 보존한다. 새 캐시: iCloud `gpt 작업/commerce-automation-kit/20261005-webtoon-acting`. 최종 파일: `/Users/admin/Downloads/vedio/im-fine-webtoon-episode-1-acting-v2.mp4` (208.875초, 1920×1080, 24fps).

본문은 자체 제작 8개 그림을 Higgsfield Kling 3.0 Pro, 10초, 소리 없음으로 애니메이션화한다. 실견적 장면당 17.5크레딧, 총 140크레딧. 기존 6초 도입 재사용. 대사/반응 컷으로 나눠 재사용하며 전체 길이를 새로 생성하는 방식은 아니다. 눈·시선·고개·어깨·손의 연기이며 정확한 대사 입모양 동기화는 포함하지 않는다. 정지 이미지 줌/팬을 본문으로 대체하는 fallback은 없다. 실제 영상 누락 시 렌더를 중단한다.

## 재현

기존 운영 설치의 의존성만 사용하고 운영 코드·인증 정책은 변경하지 않는다. 아래 환경변수를 명시한다.

```sh
export CAK_ENGINE_ROOT=/Users/admin/workSpace/shopshorts-production
export SOURCE_CACHE='/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261004-webtoon-psychology'
export VIDEO_CACHE='/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261005-webtoon-acting'
node docs/videos/20261005-webtoon-acting/produce.mjs validate
"$CAK_ENGINE_ROOT/node_modules/.bin/tsx" docs/videos/20261005-webtoon-acting/produce.mjs voices
# sample 또는 tts와 역할 N/S/M: 기존 음성은 메타데이터 확인 후 재사용
"$CAK_ENGINE_ROOT/node_modules/.bin/tsx" docs/videos/20261005-webtoon-acting/produce.mjs tts N
node docs/videos/20261005-webtoon-acting/motion.mjs poll
python3 docs/videos/20261005-webtoon-acting/render.py align --cache "$VIDEO_CACHE"
python3 docs/videos/20261005-webtoon-acting/render.py render --cache "$VIDEO_CACHE"
python3 docs/videos/20261005-webtoon-acting/render.py verify --cache "$VIDEO_CACHE"
```

`motion.mjs generate`는 유료 명령으로 기존 receipt와 140크레딧 상한을 검사한다. 응답 유실은 자동 재전송하지 않는다. 한 장면씩 완료를 기다려 계정 동시 생성 제한을 지킨다. 1번 장면의 첫 미확인 요청은 공식 작업 내역에 없고 잔액도 차감되지 않은 것을 확인한 뒤 복구했으며 별도 기록을 남겼다. 접수된 작업의 실패·품질 재생성은 자동 수행하지 않는다.

원격 GitHub 샘플 3건은 브랜치 인증 정책의 403으로 TTS 호출 전에 실패했다. 정책을 완화하지 않고 기존 승인된 제작 서버 연결로 전환했으며, 이번 작업의 원격 workflow 변경도 되돌렸다. 자격정보는 Cloudflare에서 메모리로만 읽고 산출물 경로에 저장하지 않는다.

현재 검증: 기존 TTS 원자 회귀 14개 통과(`--no-cache`), 문법·설정 검사 통과. 신규 음성 32문장 생성 및 독립 medium ASR 전수 확인 완료(이름 연음·숫자 표기·일부 동음 전사 차이는 남음, 인간 청음 검증과 구분). 자막 84개, 타임라인 208.875초. 동작 영상 8개 생성·검수 완료. 최종 파일 전체 디코딩 및 AV 길이 일치 통과, 기준상 2초 이상 무음·0.5초 이상 검은 화면 없음. 평균 음량 -18.1dB, 최대 -1.0dB. 도입·초 장면·반응·갈등·끝부분의 자막 번인을 실제 프레임으로 확인했다. 새 1편 파일에만 반영했다. 운영 사이트·기존 1~3편 파일은 변경하지 않았다.

근거: https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices

디스크 대응: 렌더 전 여유 공간이 약 200MiB로 줄어들어 이전 1·2·3편 완성본의 SHA256이 기존 검증값과 같고 실행 중인 이전 렌더가 없는 것을 확인했다. 이후 본인 소유 v1 `render/`의 재생성 가능한 중간 파일 101개, 약 431.8MiB만 정리했다. 원본 그림·음성·도입 영상·타임라인·자막·완성 영상은 보존했다. 정리 내역은 새 캐시 `removed-own-intermediates.json`에 있다.

장면 검수에서 5번 클립 후반에 지시와 달리 촛불이 생긴 것을 발견했다. 대사와 맞추기 위해 이 클립은 검수한 0–4초만 사용하고 인물 반응 컷으로 연결한다. 해당 대사·음성을 바꾸거나 새 유료 영상을 만들지 않았다. 편집 캐시는 원본 시각·시작점·길이·구도 서명으로 구분하여 수정 전 컷이 재사용되는 것을 방지한다.

최종 검증은 `verification.json`에 저장했다. Higgsfield 접수 8건, 합계 140크레딧, 최종 확인 잔액 526.68크레딧. 음성은 최종 32문장 외 발음 비교 2문장을 추가 생성했다. 정확한 입모양 동기화와 매 순간 새로운 동작 생성은 범위 밖이며, 8개 동작 클립을 대사/반응 컷으로 편집·재사용했다.
