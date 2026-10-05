# 영상 과도한 압축 방지

- 목표: 다음 영상부터 인과·사례·결말 누락을 검토하고 쇼츠의 첫 장면/완결성을 함께 개선한다. 기존 영상 변경·유료 생성·운영 배포 제외.
- 소유: 현재 Codex 단독, `fix/video-explanation-depth`. 기준 `c7ef3e2c411785c8e852f24a54ea867016370dc4`.
- 원인: 수동 영상 파이프라인의 내용 검토 부재와 여러 절의 문장 추출, 웹 생성기의 자기 검토 프롬프트만 존재. 근거와 제작 계약: `docs/videos/EXPLANATION-DEPTH.md`.
- 구현: 공통 검토 rubric, 별도 LLM 검토·최대 1회 수정·재검토, 원문 인용/입력 해시, 수동 CLI. 구형 저장 프로젝트는 읽기 호환. 검토를 포함한 새 시나리오의 broker/project 제한 시간 15분 일치.
- 검증 완료: 코어/계정/CLI 58개 + 영향받는 연출/음성/애니메이션/시네마틱 8개 = 66개 통과, 선택 범위 밖 25개 미실행. 실제 fixture 렌더 2건 포함, 유료 미디어 호출 없음. `git diff --check` 통과.
- 검증 환경 재작업: 최초 sparse 의존 소스와 SQLite/tsx 누락을 준비. iCloud TMPDIR가 Unix 소켓 경로 한도를 넘은 문제는 실제 파일 저장은 iCloud에 유지하고 짧은 symlink 경로로 해결. 제품 코드 우회 없음.
- 실제 연결 Codex 검토: 기존 5탄 숏폼 5비트의 원문 대사를 별도 검토 호출로 검사. why 통과, focus/mechanism/example/payoff/pacing 실패. 핵심 발견: 전기→빛 변환 순서를 말해도 그 변화가 앞의 병목을 어떻게 줄이는지 연결이 없고, 파장 소개가 구체적 사례를 대신함. 원본 화면 계획 전체를 넣지 않았으므로 visuals 실패는 완성 영상의 품질 판정으로 사용하지 않는다.
- 증적: 지정 iCloud `commerce-automation-kit/20261005-explanation-depth/`의 `core-tests.log`, `integration-tests.log`, `episode5-short-review-input.json`, `episode5-short-review-prompt.txt`, `episode5-short-live-review.json`. 실제 검토 한 건은 모든 향후 대본의 정확도/조회수 개선을 보장하지 않는다.
- 완료 기준: 관련 회귀·CLI 성공/거부/오래된 검토 거부, 실제 기존 5탄 입력 검토 결과 기록, 본인 변경 커밋·upstream push·PR 준비. 머지/운영은 승인 전 미반영.
- 상태: 구현·검증·제작 지침 연결 완료, 커밋·push/PR 준비. 운영 배포 미실행. 독립 검토는 동일 연결 모델의 새 호출이며 다른 모델/사람 심사 또는 품질 보장은 아니다.
