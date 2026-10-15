# 게이츠헤드 — 전체 Blender 건축 쇼츠

- 목표: 다리를 끊지 않고 회전시켜 배를 통과시키는 원리를 한 질문·한 사례·완결된 답으로 설명한다.
- 소유/범위: Codex 제작 세션, 이 폴더 5개 파일만. 운영 배포/공개 업로드는 포함하지 않는다.
- 사용자 승인: 이번 편은 전체 Blender 3D. Higgsfield 호출 0건. Kyle `RU7aSi6lT4uQBXMLgDxK` 1.1배, modern-v1 자막·헤더.
- 기준: 운영 소스3744873의 공통 대본 검토·TTS·자막 정렬·타이포그래피를 재사용한다. 격리 브랜치 `feat/gateshead-blender-video`.
- 완료 기준: 대본 검토 → 구조/회전축/선박 통과 검증 → 실제 음성 길이 조립 → 소리/자막/결말 확인 → 최종파일 제공.

## 2026-10-15 진행
- 설계자 WilkinsonEyre, 운영기관 Gateshead, 구조 해석 제공사 LUSAS 자료로 사실 검토 통과. 보행로의 옆으로 휜 형태와 회전축의 관계, 수면 기준 통과 높이를 보완한 대본/화면 검토 7항목 통과.
- 구도 잘림과 배·주변 건물 디테일 개선. Blender Cycles48샘플, 1080×1920, 24fps. 실제 객체 변환으로 고정 양끝·일체형 구조·선박 돛대 여유 검사 통과. 형상은 설명용 재현이며 실측 설계도/안전 해석이 아니다.
- 7컷 영상 렌더 진행 중. 시각 장면 계획66초는 렌더용이며 최종 길이는 Kyle 실제 발화에 맞춰 조정한다. 음성 속도를 추가로 올리거나 문장을 자르지 않는다.
- 음성은 아직 미생성. Cloudflare1027 이후 09:38KST 시크릿 조회 HTTP200으로 복구됨. TSX CLI의 긴 임시 경로 IPC 초기화 실패를 Node `--import` 로더로 수정해 실제 TTS 진입까지 확인했다. 이후 ElevenLabs TLS `UNABLE_TO_VERIFY_LEAF_SIGNATURE`에서 실패. 공개 API에서도 Fortinet 발급 인증서와 검증 실패를 확인했으며 Node22 시스템 CA 사용도 실패했다. 검증 해제/임의 CA 신뢰 추가는 하지 않았다.
- 사용자 최신 요청: 운영 Shopshorts를 통해 이 영상을 생성. 운영 제작 워커는 같은 Mac의 `shopshorts-production/apps/shopshorts/studio-service.mjs`다. 웹 기획에는 전체3D 선택이 없으며 기존 Blender 파일 업로드 경로와 3D 자동 생성 통합을 구분해야 한다. 새 기획 입력은 했지만 저장/생성 제출 전이다. 일반 영상 경로 선택은 자동 승인 검토가 제작 방식 변경 우려로 차단해 사용자 확인 대기. 기존 렌더는 유지한다.
- 웹 제작 실패 2건/CI 자격503은 별도 미완료. 로컬 완성을 운영 파이프라인 성공으로 보고하지 않는다.

## 재현
운영 의존성은 `/Users/admin/workSpace/shopshorts-production`, 중간 산출물은 사용자 iCloud 작업 루트의 `commerce-automation-kit/20261014-gateshead/`에 있다.

1. `node produce.mjs --action review --runtime <운영 소스> --work <산출물>`
2. 기존 승인된 시크릿 러너/Whisper 환경에서 `--action voice`. 외부 키를 파일/로그/iCloud에 저장하지 않는다.
3. `Blender -b --python render.py -- --out <산출물>/render --timeline <산출물>/visual-timeline.json`. 소스 해시가 같은 완료 컷은 재사용한다.
4. `--action compose --out /Users/admin/Downloads/vedio/gateshead-blender-short.mp4`. 실제 TTS 길이에 시각 동작을 맞춘다.

검토 증거: 산출물의 `research-review.json`, `review.json`; 렌더 증거: `final-preflight.log`, `render/render-manifest.json`; 인증 오류 증거는 민감 정보 없는 `credential-failure.json`. 최종 검증은 아직 미완료.
