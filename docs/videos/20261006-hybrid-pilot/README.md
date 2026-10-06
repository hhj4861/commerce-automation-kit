# 자동 혼합 시각 검증본
기존 유리기판 1탄 전체 내용과 음성은 보존하고, 휨 설명 구간(92.1667~115.375초)만 실제 Claude가 작성한 모션그래픽으로 교체한다. 기존 Higgsfield 도입 6초와 3D 본문은 재사용한다. 기존 완성본을 덮어쓰지 않는 별도 결과물이다.

이 검증본은 연출 조합과 자산 재사용의 시각 확인용이다. 새 웹/CLI hybrid 데이터 렌더러의 모든 장면이 이 완성본을 자동 생성했다고 주장하지 않는다. 원본은 기존 크림색 3D라 장면 간 팔레트가 완전히 통일되지 않는 한계가 있다. 새 생성 경로는 남색/청록/앰버 공통 지시를 사용한다.

실행: `python3 compose.py --source <기존 전체 MP4> --motion <B-claude-motion.mp4> --artifacts <iCloud 작업 폴더> --out <Downloads/vedio/새 MP4>`.
실행 결과와 음성 동일성은 artifacts의 pilot-verification.json으로 확인한다. 신규 Higgsfield/TTS 요청 없음.

## 새 제작 경로
수동/자동 제작에서 **자동 혼합**을 선택합니다. 기존 웹툰 기본값과 기존 완성본은 유지합니다. 생성한 대본을 확인하면 장면별 선택 이유와 새 원화/영상 수, 크레딧 상한이 보입니다. 첫 장면은 Higgsfield, 사례는 웹툰, 단면은 개념 3D, 비교/흐름은 모션입니다. 목소리 기본 Kyle, 숏폼 1.1/롱폼 1.0, 자막/대본 검토·발행 검수는 기존 경로를 따릅니다.

연결된 Claude 또는 Codex가 장면 데이터와 동작을 작성합니다. 임의 HTML/JS를 받아 실행하지 않습니다. 모션은 검증된 레이어·흐름·초점 확대를 조합하며, 3D는 사각 부품의 평행 투영 구조도입니다. 맞춤 모델링/변형/물리 시뮬레이션이나 수작업 Claude HTML의 모든 연출을 재현한다고 주장하지 않습니다.

워커: 기존 Higgsfield/ElevenLabs 설정과 HyperFrames/GSAP 의존성, `SHOPSHORTS_MOTION_NODE`에 Node 22 이상 실행파일이 필요합니다. 앱 자체 Node 20과 렌더 Node 22를 분리할 수 있습니다. 렌더 Node/패키지 사전검사는 견적·음성·유료 미디어 생성 전에 수행됩니다. 예산은 실견적과 기존 유료 접수 내역을 합산하며 음성 사용량은 별도입니다.

CLI는 동일한 검토 완료 프로젝트 JSON과 로컬 자산 폴더를 사용합니다. 계획 조회는 무과금이며 media는 명시적 대본 승인이 필요합니다. 체크포인트는 프로젝트 파일에 원자적으로 저장되고 동시 실행은 lock으로 차단됩니다. 비정상 종료 후 남은 lock은 실행 중인 작업/접수 내역을 확인한 뒤 복구해야 합니다. 자동 업로드는 없습니다.

```sh
node apps/shopshorts/studio-hybrid-cli.mjs --project "$PROJECT_JSON" --action plan
node apps/shopshorts/studio-hybrid-cli.mjs --project "$PROJECT_JSON" --action media --approve-script --assets "$ASSET_DIR" --work "$WORK_DIR"
node apps/shopshorts/studio-hybrid-cli.mjs --project "$PROJECT_JSON" --action render --assets "$ASSET_DIR" --work "$WORK_DIR"
```

기존 웹 프로젝트에서 파일을 옮겨 쓰려면 JSON에 참조된 자산도 함께 로컬 ASSET_DIR에 있어야 합니다. `ASSET_DIR`와 `WORK_DIR`은 승인된 iCloud 작업 폴더 하위로 지정하고 완성본은 Downloads/vedio에 보관합니다. `media`는 대본을 새로 쓰지 않습니다. CLI에서 먼저 기존 계정 기반 시나리오 경로로 연구/검토된 프로젝트를 준비해야 합니다.

검증 상세: [QA.md](QA.md). 준비된 소스는 구현 브랜치에만 있으며 머지/운영 배포는 별도입니다.
