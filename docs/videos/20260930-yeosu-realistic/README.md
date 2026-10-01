# 여수 원오션 — 실사풍 건축 쇼츠 제작

사용자 요청: 이전 지하철 3D 영상보다 실사풍을 강하게 표현. 건물 외관·실내·야경은 Higgsfield Seedance 2.0 1080p, 원리 설명 두 컷은 Blender의 원본 3D 모델로 제작한다. 타인의 영상·사진·음원을 다운로드하거나 재사용하지 않는다.

## 현재 상태

실사풍 AI 4컷과 원본 3D 2컷의 생성·프레임 검수를 마쳤다. `yeosu-visual-preview.mp4`는 **48초 무음 화면 검토본**이며 1080×1920, H.264, 전체 FFmpeg 디코딩을 통과했다. 최종 음성 영상은 미완료다.

2026-10-01 사용자가 ElevenLabs **Kyle - Friendly, Natural and Guttural**을 직접 선택했다. 기존 유튜브 참고 영상과 동일한 목소리일 필요는 없으며, 진중하고 호기심을 유도하면서 듣기 편한 한국어 설명을 원한다. 배속은 **1.0배**다. 정확한 공유 링크 또는 Voice ID 확인 전이므로 `brief.voice`는 아직 `null`이며 음성 합성은 시작하지 않았다. 이름만 보고 동명 음성을 추정하거나 기존 Yooni로 대체하지 않는다. 음성 ID를 확인한 뒤 기존 실사풍 AI 4컷·3D 2컷을 재사용하고, 실측 음성 길이에 장면과 자막을 재배치한다.

Higgsfield 네 건 모두 다운로드 완료. 호출별 견적 72크레딧, 합계 288크레딧이며 유료 재생성은 하지 않았다. 접수 ID와 원본 클립은 작업 폴더 `media-receipts.json` 및 각 mp4에 보존했다. Blender 렌더는 정상 종료했고 이번 작업의 읽기 전용 마운트는 해제했다.

작업/영상 경로:
`/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20260930-yeosu-realistic`

- `brief.json`: 근거, 한국어 대본, 실사풍 컷 지시, 288크레딧 상한.
- `produce.mjs`: 기존 Cloudflare 인증과 공식 Higgsfield CLI 사용. 유료 접수 전에 상태 기록; 재실행은 기존 접수 재조회. TTS는 기존 공식 ElevenLabs GitHub 워크플로 사용.
- `scene.py`: 설명용 복합재 패널과 지지 프레임 모델. 변형은 단순화한 시각화이며 실제 설계 치수·시공 상세·구조해석이 아니다.
- `assemble.py`: TTS 텍스트/음성 ID 검증, 1.0배 실제 음성 길이에 장면 조정, 중앙 2줄 자막, FFmpeg 전체 디코딩 검사. 자막은 문자량 비례 타이밍이며 강제 단어 정렬은 아니다.
- `verification.json`: 실제 산출 단계와 검증 결과. `visual-preview-awaiting-voice`는 완성 음성 영상이 아니다.

## 확인한 근거

- [soma 설계사](https://www.soma-architecture.com/index.php?page=theme_pavilion&parent=2): 2012년 완공, 전시장 입구 쪽 움직이는 외벽, 낮의 채광 조절과 밤의 LED 효과.
- [Knippers Helbig](https://www.knippershelbig.com/projekte/themenpavillon-expo-2012/): 유리섬유 강화 플라스틱 패널 100개 이상, 최대 약 14m, 위아래 구동장치와 패널 변형.

현재 가동 상태는 검증하지 않았다. 영상은 **2012년 설계 원리의 AI 재현/개념 설명**으로 표시하며 실제 촬영 기록으로 제시하지 않는다.

## 재현

CAK_ENGINE_ROOT는 Higgsfield 모듈과 credential-broker가 있는 checkout, VIDEO_CACHE는 위 iCloud 작업 경로, SHOPSHORTS_HIGGSFIELD_CLI는 설치된 공식 hf 실행 파일로 설정한다. 인증 값은 Git/이 폴더에 저장하지 않는다. OAuth 실행기가 사용하는 단기 보안 파일에는 iCloud TMPDIR을 적용하지 않는다.

```sh
node produce.mjs cost
node produce.mjs generate  # 기존 receipt가 있으면 재사용; 신규 유료 요청은 상한 적용
"$BLENDER" --background --python-exit-code 1 --python scene.py -- --cache "$VIDEO_CACHE"
python3 assemble.py --cache "$VIDEO_CACHE" --silent-preview
# 허가된 음성 ID를 brief.voice에 확정한 뒤:
node produce.mjs tts
# 해당 워크플로 narration artifact를 VIDEO_CACHE/remote-narration에 받는다.
python3 assemble.py --cache "$VIDEO_CACHE"
```

YouTube 업로드 또는 운영 앱 변경은 이 제작에 포함하지 않는다.
