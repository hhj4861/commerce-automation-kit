# Hanmadi 음정·리듬 기술 검증

- 목표: 설계 M08의 엔진 근거와 자체 오디오 실행 증거 확보. 사용자 채점·운영 기능 구현은 아님.
- 담당: 현재 Codex 단독. workers/Claude crosscheck OFF(제어 파일 없음).
- 기준: `bf2bdfdc4f6dfa74003e0b4e606ba0da1fbd1973`, `spike/hanmadi-audio-feasibility` 격리 worktree.
- 범위: 공식 Basic Pitch 배포물 REA 정적 분석, librosa pYIN/onset/beat 로컬 검증 도구, 자체 제작 4개 MP3.
- 완료 기준: 고정 배포물·해시·REA 한계 기록, 정답 음정/박자·무음/잘못된 입력 검사, 4개 MP3 실행 결과, 재현 명령·한계 문서, 본인 변경 커밋·push.
- 제한: 새로운 유료 API 호출/확장 설치/음원 추출/운영 변경 없음. 소스 코드는 로컬, 로그·분석 산출물은 지정 iCloud 작업 폴더.
- 현재: 영향 검사 6개·pip check 통과, 자체곡 4개 분석 성공. 첫 MP3 overshoot 실패 기록은 보존했고 정규화·회귀 검사로 보완했다.
- 브랜치: root 브랜치의 unrelated 변경을 포함하지 않도록 본인 파일이 미추적인 상태에서 origin/main 기반 `spike/hanmadi-audio-feasibility`로 옮김. root 및 다른 작업 보존.
- 다음: 코드/근거 검토 후 제품 통합은 별도 범위로 진행. 혼합곡 자동 채점은 미검증이며 공급자 운영 설정 유무도 이번 로컬 점검만으로 판단하지 않는다.

## 검증 결과

- Basic Pitch REA Evidence ev_2969d45a16a0eb138de0c844ad75b4df86eff9708ba0cd23395084ffdcfc6967. 모델 실행은 아님.
- librosa 실측: 합성 음계/반음, 클릭, 무음, 혼합음 반례와 자체곡 4개. run-2 성공. 실제 보컬 정답/채점 검증은 아님.
- 영향 검사 6개 및 pip check 통과. 상세는 docs/qa/20261015-hanmadi-audio-proof.md.
- 전달: 본인 파일만 커밋하고 `origin/spike/hanmadi-audio-feasibility`에 push해 PR로 검토한다. 운영·공급자 키·유료 호출 변경 없음.
