# 서윤·민지 립싱크 확인 샘플 — 미완료

사용자 요청: 민지 Voice ID를 JguuvPsf0F2TNXefsblh로 변경하여 15~20초 대화의 목소리와 립싱크를 확인한다. 기존 본편 파일은 보존한다.

- 서윤: UqW1DivwFt1NwUMSGnTn / Suzie - Calm Korean. 단발·아이보리 옷, 주인공.
- 민지: JguuvPsf0F2TNXefsblh / Yuna Kim - Warm, Trustworthy Korean. 묶은 머리·버건디 옷, 친구.
- 공식 ElevenLabs에서 정확한 ID 확인 후 두 문장을 Eleven v3 감정 태그로 생성. 속도 1.0. 목소리 확인용 오디오: `/Users/admin/Downloads/vedio/seoyun-minji-voice-sample.mp3`.
- 원음 6.8초와 8.0초, 각 0.4초 여운 포함 총 15.6초. Whisper medium 독립 전사에서 전체 대사 확인(바랐어/바랬어 표기 차이). 강제 자막 정렬과 별도 검증했다.
- 자체 제작 원본 shot-10.png(서윤), shot-11.png(민지)를 각각 사용한다. 이미지 자체를 수정하지 않는다.
- 공식 웹 Lipsync Studio의 Kling Avatars 2.0 / Pro 선택. 설치 CLI 1.1.26 모델·워크플로 목록에 이 모델은 없다.
- **현재 차단:** Chrome 확장의 fileChooser.setFiles가 Allow access to file URLs 설정을 요구한다. 설정 변경 요청을 사용자에게 보냈다. 기본 UI 시도도 공유 Chrome 활성 화면 변경으로 중단하여 다른 작업을 방해하지 않았다.
- Higgsfield 생성 요청 0, 추가 크레딧 사용 0. 입력 업로드 후 실제 견적 확인 필요. 유료 자동 재시도 금지.
- 준비 코드 문법 및 실제 음성 길이 검증 완료. 영상 생성·렌더·립싱크 시각 검증은 미완료다.

캐시: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261005-webtoon-lipsync-sample`.

업로드할 음성: 캐시의 S-input.wav, M-input.wav. 이미지: 기존 20261004-webtoon-psychology/art/shot-10.png 및 shot-11.png.

다운로드한 실제 립싱크 영상은 캐시의 S-lipsync.mp4, M-lipsync.mp4로 저장한 뒤 lipsync-sample-render.py render / verify --cache <cache> 실행. 예정 완성본 `/Users/admin/Downloads/vedio/im-fine-seoyun-minji-lipsync-sample.mp4`는 아직 생성하지 않았다.

검증 후 사용자에게 완성본을 전달하고 이 기록을 갱신한다. 현 상태를 영상 완료로 보고하지 않는다.
