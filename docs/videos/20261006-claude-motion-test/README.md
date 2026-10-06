# Claude + 모션그래픽 비교 실험

- 목표: 기존 유리기판 1탄의 warpage 23.208333초 본문을 동일 음성으로 비교. 기존 완성본 보존, 운영 변경 없음.
- 담당: Codex 검토/렌더, 사용자 요청으로 Claude 구독 CLI가 HTML/GSAP 연출 코드 생성. 일반 peer crosscheck/worker OFF 유지.
- 기준: origin/main deec584. 범위: 이 폴더의 비교 소스와 실행 안내만.
- 검증: 원본/개선본 해상도·음성·길이, 실제 렌더 6개 시점의 프레임·자막·움직임 및 세 MP4 전체 디코딩 확인 완료.
- 비용: 신규 Higgsfield/TTS 호출 없이 기존 자산 재사용. Claude 구독 사용량 및 로컬 렌더 자원 사용.
- 현재: 비교 영상 3종 생성·검증 완료. 운영 앱에는 미적용. 사용자의 시각적 비교용 테스트이며 시청자 이해도 측정은 수행하지 않음.

## 실행 기록
- 첫 Claude 구독 요청은 391초 동안 최종 응답을 반환하지 않아 종료(143). 원인 확정 안 됨.
- 재시도는 동일 구독·기본 모델을 유지하고 필요 없는 MCP 연결만 제외. 실제 init 모델 claude-opus-5-5, 응답 스트림 수신 확인.
- 동일 장면/대사/음성/23.208333초·1920×1080·24fps 비교. 3D와 웹툰 도해의 연출·스타일도 달라지므로 Claude 대 Codex 모델 우열 실험으로 해석하지 않음.

- Claude 재시도 최종 종료 코드 0, 276초, 실제 모델 claude-opus-5-5. HTML 약 11.7KB 반환.
- 정적 검토: 외부 요청/타이머/임의 실행 없음, 로컬 GSAP·폰트, 23.208333초 seekable 타임라인과 6개 원본 자막 구간 확인.

## 결과와 판단

완성 파일은 `/Users/admin/Downloads/vedio/claude-motion-test/`에 저장했다.

| 파일 | 용도 | 해상도 | 길이 |
|---|---|---|---|
| A-original.mp4 | 기존 본문 발췌 | 1920×1080 | 23.208333초 |
| B-claude-motion.mp4 | 실제 Claude 작성 HTML/GSAP 렌더 | 1920×1080 | 23.208333초 |
| AB-comparison.mp4 | 왼쪽 기존 / 오른쪽 새 모션, 음성은 한 번만 재생 | 1920×620 | 23.208333초 |

모두 24fps H.264/AAC다. 세 파일의 오디오 패킷 SHA256은 동일하다:
`43d5980d0f9fd41782de7c283aac21d32c737eb0fbd852d9802097ceb316ce1e`.
전체 디코딩 오류 0건, HyperFrames 렌더 및 후처리 종료 코드 0.

검토 의견: 같은 부품을 유지하면서 휨 → 접점 높이 차이 확대 → 허용 범위 측정 → 목표 형상으로 연결하는 구성이 원리를 따라가기 쉽게 한다. 다만 실제 시청자 이해도 향상은 미측정이며, 질감은 실사보다 간결한 잉크선 도해에 가깝다. 풍부한 웹툰 원화나 Higgsfield 실사 연출을 대체한다고 판단하지 않는다. 마지막 평탄화는 설계 목표의 개념 표현이며 실제 소재의 자가 복원 실험이 아니다. 화면에 변형 확대 및 목표 형상을 표시했다.

기존 완성본은 수정하지 않았다. 신규 Higgsfield/TTS 생성 호출은 0건이다. 이번 생성은 실제 Claude 구독 CLI가 담당했지만 연출 요구사항도 달라졌으므로 모델 자체의 우열을 검증한 실험은 아니다.

## 재현

운영 checkout의 기존 Node 22, HyperFrames, GSAP, NanumGothic 폰트와 ffmpeg를 이용한다. 운영 checkout의 파일은 읽기만 한다. 다음 명령은 로컬 렌더를 다시 수행하며 유료 생성 API를 호출하지 않는다.

```sh
python3 docs/videos/20261006-claude-motion-test/render.py \
  --artifacts '/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261006-claude-motion-test' \
  --source '/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261001-glass-substrate-v2/edit/04.mp4'
```

위 artifacts 폴더의 `verification.json`, `hyperframes.log`, `decode-*.log`, `previews/contactsheet.jpg`에 검증 증거가 있다. `composition.html`은 Claude가 반환한 코드이며 `prompt.txt`는 생성 지시다. Claude 원시 응답은 Git에 넣지 않았다.
