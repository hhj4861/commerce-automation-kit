# 자막·목소리 편집 개선 검증 (2026-09-26)

브랜치: `fix/caption-voice-controls`. 운영 미반영; PR 승인 후 Pages와 제작 워커를 함께 갱신해야 한다.

## 변경

- 하단 자막 트랙 클릭 시 바로 열리는 편집 바: 내용·글꼴·스타일·크기·색·복제·삭제.
- 영상 위 자막 드래그, 가로/세로 조절, 외곽선·배경색·농도. 자막 선택 시 삭제·잘라내기·복사·붙여넣기·분할은 자막만 대상으로 처리.
- 기존 프로젝트 형식을 유지하면서 선택적 위치·스타일 필드를 저장하고 FFmpeg 렌더에도 사용.
- 한국어 음성 2종 → 5종. 선택과 무료 샘플 미리듣기 분리, 새 음성 생성 필요 상태 표시, 오래된 재생 실패 무시, 중복 생성 요청 차단, 음성 실패 원인별 안내.

## 검증

- 앱 전체 Node 회귀 테스트: 223 통과, 실패 0.
- 실제 FFmpeg로 7개 번들 글꼴/6개 스타일 렌더. 좌상단·우하단 픽셀 위치 검사 통과.
- 네이티브 Chrome + 격리 localhost:5203 fixture: 하단 트랙 선택, 하단 편집 바에서 한글 변경, 강조 스타일 선택, 화면 드래그, 자막 삭제 후 영상 3클립 유지, 실행 취소, 저장/API 대조.
- 저장 결과: 한글 자막, blackhan 76px, #ffda55, x=88/y=37, 외곽선 4px, 3클립 유지.
- 추가한 진건 목소리 선택·저장 및 공식 무료 샘플 재생(브라우저 일시중지 컨트롤과 진행 상태) 확인. 유료 TTS 신규 생성은 이번 검증에서 호출하지 않았다.
- Korean text entry used native accessibility setValue; native paste/typeText emitted empty/non-Korean text in this environment. Composed-input handling is guarded, but physical Korean IME typing was not verified.
- 운영 읽기 전용 조회 시 최근 프로젝트 narration task는 done. 사용자가 겪은 원본 음성 오류의 정확한 응답은 확보되지 않아 특정 공급자 장애가 복구됐다고 단정하지 않는다.

## 출처와 배포

- 음성: https://elevenlabs.io/docs/api-reference/voices/search 공식 /v2/voices 응답(200), 현재 계정에 등록된 ko professional 음성 중 Yooni/Claire/Jin/진건/Rumi. 토큰·키는 소스에 저장하지 않음.
- 폰트: https://github.com/google/fonts 의 ofl/dohyeon, ofl/jua, ofl/blackhansans, ofl/gowundodum. 각 OFL.txt를 public/font-licenses에 포함.
- Pages 정적 파일과 서버 검증 모듈, 제작 워커의 captionFilter를 동일 커밋으로 배포할 것. 워커 갱신 누락 시 새로운 좌표·스타일이 최종 렌더에 적용되지 않는다.

추가 폰트 SHA-256:

- `DoHyeon-Regular.ttf`: `35644be7f28e0a68a447b1f7af351dcde5674b870f24f7b5f43e26d00b4ab653`
- `Jua-Regular.ttf`: `769677aef240bfc3b9965f2b50748075bff885e6c6992fc591a3fb268279f898`
- `BlackHanSans-Regular.ttf`: `31960809284026681774a8e52dc19ebcad26cf69b0ad9d560f288296fbb52739`
- `GowunDodum-Regular.ttf`: `a6e457933227483a11758fd0947bc74422a106d46f0bf057fdaa5af94a30067d`
