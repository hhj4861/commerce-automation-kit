# 웹툰 건축 쇼츠 — 롤링 브리지

## 작업 카드
- 목표: 실제 사례의 시각적 질문 → 분절·관절·유압 → 배의 통로 → 사람의 통로를 그림과 동작으로 이해시키는 목표40–50초, 실제 발화 기준36초 쇼츠.
- 담당/범위: 현 Codex 단독. 기존 webtoon-psychology 전용 worktree, 기준 5b5f955. 운영 앱 및 기존 영상 수정 없음.
- 완료 기준: Kyle 1.1배, 원본 스타일 참조 원화, Higgsfield 도입 6초/최대54크레딧, 동적 원리 설명, 세로1080p, 자막/음성/끝맺음 검증, 최종 Downloads/vedio, 본인 소스만 커밋·push.
- 현재: 최종 영상 생성 및 검증 완료. 운영 웹 앱 변경·YouTube 업로드는 하지 않음. 소스 커밋·upstream push로 완료 처리.
- 원화: built-in imagegen, 사용자 제공 Daily Fortune Drama 포스터는 질감·선화·조명만 참조. 제3자 사진/영상 재사용 없음.
- 근거: story.json의 공식 설계자와 Paddington 지역 안내 자료. 12m, 여덟 분절, 유압 작동. 설명 애니메이션은 시공도/실시간 작동 속도가 아님.

## 드라마 1부 — 이야기 재미 별도 감사
대상: im-fine-webtoon-episode-1-lipsync-v3.mp4, 170.79초와 동일 story/timeline. 기술적 합격을 재미의 증거로 쓰지 않는다. 실제 시청자 반응 실험은 수행하지 않았으므로 인기도 예측은 불가하다.

판정: 현재 구성으로 2부 유료 제작을 권하지 않음. 대사 한 줄·목소리 교체만으로 해결할 문제가 아니라 사건과 선택의 재설계가 필요하다.

| 기준 | 대본에서 확인한 내용 | 판정 |
|---|---|---|
| 초반에 당장 알고 싶은 사건 | 첫 7.7초 ‘말해야만 아는 거였어/나는 안 궁금했어’가 배경 없이 등장. 무엇이 실제로 벌어졌는지보다 감정부터 요구함 | 약함 |
| 정보와 상황의 변화 | 59.8–109.7초 약50초 동안 말 못함·부탁 수락·혼자 케이크·포크로 같은 외로움을 반복 | 실패 |
| 주인공의 행동과 대가 | 괜찮다고 말하고 돕다가 화내고 전화를 끊음. 중요한 결정을 내리고 그 결과가 상황을 바꾸는 사건이 없음 | 약함 |
| 반전/새로운 해석 | 첫 대사가124.5초에 거의 그대로 반복. 새로운 사실로 의미가 뒤집히지 않음 | 실패 |
| 인물에 대한 공감 | 생일을 기억해주길 바라는 마음과 포크 두 개는 구체적. 다만 계속 괜찮다고 한 뒤 상대를 추궁해 시청자가 민지 편에 설 여지도 큼 | 일부 가능 |
| 다음 편을 볼 질문 |157.96초부터 민지가 만나서 듣겠다고 제안, ‘안 피할게’로 갈등 해소를 예고. 답을 꼭 알아야 할 미해결 선택 없음 | 실패 |

‘나는 안 궁금했어?’는 친구 사이 업무 부탁/생일 갈등보다 연인의 사랑 확인처럼 들릴 수 있고 softly 연기 지시가 이를 강화한다. 실제로 일어난 행동을 짚는 짧은 대사로 바꿔야 한다. 내레이션46.38초(27.2%)에 독백까지 합치면70.13초(41.1%)로, 사건을 보는 대신 감정 해설을 듣는 비중도 높다.

수정한다면: 첫 장면부터 ‘친구의 부탁을 거절해야 하는 구체적 상황’을 만들고 → 거절의 실제 손해/관계 변화 → 상대 반응이 예상과 달라지는 사건 → 다음 편에서 해결할 선택을 남긴다. 억지 비밀·과장된 악역·느끼한 대사로 자극만 추가하지 않는다. 그 대본으로 기존 자산 45–60초 시험편을 먼저 평가한다. 현재 요청은 별도 건축 쇼츠이며 드라마 재제작/추가 유료 생성은 실행하지 않음.

## 제작 결과
- 파일: `/Users/admin/Downloads/vedio/rolling-bridge-webtoon-short.mp4`
- 36.00초 ·1080×1920·24fps·H.264/AAC·약11MB. Kyle `RU7aSi6lT4uQBXMLgDxK`, 원음에 atempo 1.1 적용.
- 첫6초: 원화 기반 Higgsfield Seedance2.0 1080p/std, 54크레딧 실견적/접수. 추가 유료 영상 생성 없음. 원화2장은 built-in imagegen, TTS8발화는 기존 ElevenLabs 공식 어댑터.
- 본문: 원본 웹툰 배경 위 8분절·관절·유압 연결 개념도·팔각형 접힘·배 통과·재개방을 직접 애니메이션. 실사 현장 영상 또는 정밀 시공도가 아님을 영상에 표기.
- 원화 프롬프트 요지: 사용자 포스터의 세밀한 선화/반실사 웹툰 질감/앰버 조명/푸른 수면; 런던 Paddington의 작은 강철·목재 접이식 보행교, 8개의 곧은 변, 축 없는 중공 팔각형, 조형물의 인간적 스케일; 별도 텍스트 없는 운하 배경판. 원본/파생 원화는 지정 iCloud 작업 폴더에 저장.
- 검증: 전체 파일 디코딩,864프레임,음성/영상 길이,자막15개 대본 전수 일치·최대2행,기하학적8변 길이보존/닫힘,최종8프레임 시각검토. Whisper-base 별도 전사에서 모든 핵심 설명/끝맺음 확인; 고유명사·동음절 인식 오차 있음.
- 수정 이력: 배경 대비와 접힘 확대,끝의 ‘겁니다’ 자막 단독 분리 제거,배가 실제 기존 다리 선을 통과하도록 이동 방향 수정,낮은 음량을 정규화(mean -17.5dB / peak -1.4dB). 1.5초 이상 무음 및0.5초 이상 검은 화면 미검출.
- 고정된 도입 6초 때문에 두 번째 문장의 앞부분은 도입 영상 위에서 이어짐. 끝 문장을 완결한 뒤 약0.4초 여유, 다음 편 강제 예고 없음.
- 상세 수치·SHA256: `verification.json`. QA/오디오/공식 생성 receipt는 `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261005-rolling-bridge-webtoon/`.

## 재현
```sh
export VIDEO_CACHE='/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261005-rolling-bridge-webtoon'
export CAK_ENGINE_ROOT='/Users/admin/workSpace/shopshorts-production'
# Existing paid receipts and assets are reused. Never erase receipts to retry.
python3 docs/videos/20261005-rolling-bridge-webtoon/render.py plan --cache "$VIDEO_CACHE"
python3 docs/videos/20261005-rolling-bridge-webtoon/render.py render --cache "$VIDEO_CACHE"
python3 docs/videos/20261005-rolling-bridge-webtoon/render.py verify --cache "$VIDEO_CACHE"
```
