# 괜찮다는 거짓말 — 심리학 모션 웹툰 3부작

사용자가 승인한 그림체와 16:9 롱폼 3부작(편당 3–4분)을 실제 MP4로 제작했다. 인물의 거절 두려움, 말하지 않은 기대, 구체적인 부탁과 경계를 다룬 창작 드라마다. 특정 인물의 진단이나 치료 효과를 주장하지 않는다.

## 완성본

| 편 | 제목 | 실제 길이 | 로컬 파일 |
|---|---|---:|---|
| 1 | 괜찮다는 거짓말 | 198.458초 | `/Users/admin/Downloads/vedio/im-fine-webtoon-episode-1.mp4` |
| 2 | 네가 괜찮다고 했잖아 | 212.292초 | `/Users/admin/Downloads/vedio/im-fine-webtoon-episode-2.mp4` |
| 3 | 오늘은 안 괜찮아 | 215.792초 | `/Users/admin/Downloads/vedio/im-fine-webtoon-episode-3.mp4` |

모두 1920×1080, 24fps, H.264/AAC, faststart. **YouTube 업로드·운영 웹 제작실 변경 없음.** 홍보 쇼츠는 이번 산출물에 포함되지 않는다.

## 실제 제작 구성

- 승인된 시안 `exec-d88ad74b-4c82-4f76-8329-b190310cd6f6.png`을 인물·그림체 기준으로 built-in imagegen 사용. 후반 보드에는 먼저 생성한 카페 보드도 참조했다. 4컷 보드 6장, 총 24개 그림. 실제 프롬프트는 `art-prompts.json`.
- 각 편 첫 6초: 해당 그림을 시작 이미지로 넣은 Higgsfield Seedance 2.0, std, 1080p, 16:9, 생성 음성 끔. 3건 모두 성공, 재생성 0건.
- 본문: 그림 컷별 완만한 확대·축소·좌우 재구도와 대사에 따른 컷 전환. **전 구간 인물 동작 애니메이션/립싱크가 아니라 이미지 기반 모션 웹툰**이다. 1672×941 보드의 개별 패널을 1080p 편집 화면으로 확대하므로 원화 자체가 네이티브 1080p 개별 컷인 것은 아니다.
- 내레이션 Kyle `RU7aSi6lT4uQBXMLgDxK`, 서윤 Claire `ZRJMGKt2Okf3o9C38eSq`, 민지 Yooni `n2fbxG88jqAoaVPUy3IG`. 세 배역 모두 ElevenLabs multilingual v2, **1.0배, 템포·피치 변경 없음**. 여성 배역은 기존 프로젝트에서 확인된 한국어 음성으로 이번 제작에서 배정했다.
- 92개 대사/내레이션. 소스와 공급자 음성 메타데이터의 본문·음성 ID 전수 일치 확인. 실제 오디오에 Whisper base forced alignment를 적용했다.
- 자막: Pretendard SemiBold(OFL), 화자 표시, 문장·쉼표 기준 분할, 최대 2줄 균형 줄바꿈, 대비 외곽선. 자막을 원화에 그리지 않고 편집 단계에서 삽입.
- 배경음: `render.py`에서 직접 합성한 낮은 음량의 피아노 계열 화음. 타인 음원이나 참조 영상의 오디오는 사용하지 않았다.
- 분량을 채우기 위한 음성 반복·타임 스트레칭 없음. 편 끝 약 2–2.6초는 의도적인 여운과 다음 화/종료 표시.

## 비용과 실제 실행

Higgsfield 생성 전 공식 견적 각 54크레딧, 총 162. 실제 잔액 829.6 → 667.6으로 162 차감 확인. 추가 결제·플랜 변경 없음. 이미지 생성과 ElevenLabs 사용량의 별도 금액을 이 크레딧에 포함했다고 주장하지 않는다.

| 편 | Higgsfield 작업 ID |
|---|---|
| 1 | `b3521197-3b77-48bc-8d99-be5a7cc1306a` |
| 2 | `d29cd119-1db2-4087-be1a-d0f685747724` |
| 3 | `964b4bb8-fb68-4a2e-bf5f-52520ed523a9` |

TTS 기존 공식 실행 경로(Cloudflare 중앙 인증 → GitHub Actions):
- Kyle: https://github.com/hhj4861/commerce-automation-kit/actions/runs/37207582728
- Claire: https://github.com/hhj4861/commerce-automation-kit/actions/runs/37207584564
- Yooni: https://github.com/hhj4861/commerce-automation-kit/actions/runs/37207586136

세 실행 모두 success. 인증 키·토큰은 제작 문서·작업용 클라우드 자산에 저장하지 않았다. `produce.mjs`는 접수 전 receipt를 쓰며, 응답 불명확 상태에서 자동 재접수하지 않는다.

## 검증 범위와 한계

- 3편 전체 ffmpeg 디코딩 정상, 1080p·24fps, 영상/음성 길이 차이 0.08초 미만, 검은 화면 0.5초 이상 없음, 피크 각 −2.3dB.
- 2초 이상 저음량 검출은 각 편의 의도한 마지막 여운 구간뿐. 중간의 장시간 무음 없음.
- 대본 전체와 자막 전체의 공백 제외 문자열 일치, 자막 시간 범위와 최대 줄 수·폭 검사 통과. 84/79/86개 자막.
- 별도 Whisper small ASR로 배역/편별 주요 대사와 결말 9구간 검사. 의미 누락을 발견하지 않았으며 숫자 표기, 인명·일부 유사음 인식 차이는 그대로 기록했다. **Forced alignment를 독립 발음 검증으로 취급하지 않음.**
- 6개 원화 보드 전부와 각 완성본의 도입·중간·결말 표본 프레임을 실제로 열어 인물, 자막 가독성, 결말을 확인했다. 첫 검토에서 긴 자막의 어색한 줄바꿈을 수정하고 최종 영상에서 적용을 확인했다. 전편 연속 사람 청음/시청을 수행했다고 주장하지 않는다.
- 파일 SHA-256과 상세 확인은 `verification.json`; ASR 원문/로그/프레임은 아래 작업 폴더.

## 파일 및 재현

제작 중간 자산은 사용자 지정 경로:
`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261004-webtoon-psychology`

`art/board-0..5.png`, `art/shot-00..23.png`, `opening-1..3.mp4`, `voice-N/`, `voice-S/`, `voice-M/`, `alignment/`, `timeline-1..3.json`, `captions-1..3.ass`, `render/`, `qa/`, `logs/`를 보관한다. 원본 생성 이미지는 built-in 도구의 기본 generated_images 경로에도 유지했다. Git에는 가벼운 대본·프롬프트·제작 코드·검증 기록만 넣는다.

```sh
export VIDEO_CACHE='/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261004-webtoon-psychology'
export CAK_ENGINE_ROOT='/Users/admin/workSpace/shopshorts-production'
python3 docs/videos/20261004-webtoon-psychology/render.py plan --cache "$VIDEO_CACHE"
python3 docs/videos/20261004-webtoon-psychology/render.py render --cache "$VIDEO_CACHE"
python3 docs/videos/20261004-webtoon-psychology/render.py verify --cache "$VIDEO_CACHE"
```

기존 다운로드·생성 receipt를 보존한다. `tts` 재실행은 중복 방지를 위해 거부된다. 기존 제작 원본이 바뀌면 해당 음성/정렬/렌더 캐시를 점검하거나 별도 작업 폴더에서 재제작한다. 이 문서는 범용 서버 기능의 배포 완료를 뜻하지 않는다.
