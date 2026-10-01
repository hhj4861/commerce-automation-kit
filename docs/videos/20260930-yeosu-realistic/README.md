# 여수 원오션 — 실사풍 건축 쇼츠 제작

사용자 요청: 이전 지하철 3D 영상보다 실사풍을 강하게 표현. 건물 외관·실내·야경은 Higgsfield Seedance 2.0 1080p, 원리 설명 두 컷은 Blender의 원본 3D 모델로 제작한다. 타인의 영상·사진·음원을 다운로드하거나 재사용하지 않는다.

## 현재 상태

최신 전달본은 `/Users/admin/Downloads/vedio/yeosu-realistic-refined-110x.mp4`다. 사용자의 후속 요청에 따라 **Pretendard SemiBold 66px**, 얇은 외곽선(1.2px)과 그림자(2px)를 적용하고 자막 중심을 (540,970)에서 **(540,1110)**으로 140px 내렸다. Kyle 목소리는 **1.1배속**, 영상과 자막도 함께 조정해 **57.633초**로 완성했다. 기존 1.0배 영상은 보존한다.

- `captions-refined.ass`: 1.1배속 타임라인과 새 자막 디자인 원본.
- `captions-refined-verification.json`: 최종 로컬 파일, SHA-256, 실제 폰트 선택, 전체 디코딩, 음성 길이와 음량 검증.
- 기존 작업 자산 `silent.mp4`와 `narration.wav`를 재사용했으며 TTS·영상 생성 API 재호출은 없다. 영상은 `setpts=PTS/1.1,fps=30`, 음성은 `atempo=1.1`, ASS 이벤트 시간은 원래 시간/1.1이다.
- [Pretendard 공식 배포](https://github.com/orioncactus/pretendard)의 SemiBold OTF와 SIL OFL 1.1 라이선스를 작업 자산 `fonts/`에 보관했다. `ass=captions-refined.ass:fontsdir=fonts`로 폰트 fallback 없이 적용되는지 확인했다.
- 변경 전 타임라인 4·24·49초에 해당하는 장면에서 자막 가독성·위치를 검수했고 최종 영상 프레임도 확인했다. 오디오·비디오 길이 차이 0.02초 미만, 전체 디코딩 통과, -45dB 기준 0.8초 이상 무음 없음. 자막은 문장별 비례 타이밍이며 강제 전사 정렬은 아니다.

### 이전 1.0배 전달본

2026-10-01 최종 `yeosu-realistic.mp4` 제작 완료. **63.4초, 1080×1920, 30fps, H.264/AAC**이며 실사풍 AI 4컷과 원본 3D 2컷에 Kyle 한국어 내레이션과 중앙 자막을 합쳤다. 이전 `yeosu-visual-preview.mp4`는 48초 무음 화면 검토본으로 별도 보존한다.

2026-10-01 사용자가 ElevenLabs **Kyle - Friendly, Natural and Guttural** 및 Voice ID `RU7aSi6lT4uQBXMLgDxK`를 직접 지정했다. 기존 유튜브 참고 영상과 동일한 목소리일 필요는 없으며, 진중하고 호기심을 유도하면서 듣기 편한 한국어 설명을 원한다. **1.0배** 내레이션을 기존 [tts-remote 실행 36811778013](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36811778013)으로 생성했다. 6개 음성의 메타데이터에서 지정 ID와 대본 일치를 확인하고, 실측 길이에 영상과 중앙 자막을 맞췄다. 영상 클립은 재생성하지 않았다.

검증: 최종 영상 전체 FFmpeg 디코딩 통과, 비디오·AAC 오디오 모두 63.4초, 평균 음량 -17.6 dBFS/최대 -1.1 dBFS. -45 dB 기준 0.8초 이상 무음은 검출되지 않았다. 4·24·49초 프레임에서 중앙 자막의 가독성과 화면 내 위치를 확인했다. 자동 전사·전 구간 청음 검증은 수행하지 않았으며 자막은 문장 글자 수에 비례한 타이밍이다.

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
