# 발견 중심 카드뉴스·음성 미리보기

- 목표: 주목 플러그인·실전 Agent 활용·신규 오픈소스를 공식 자료로 수집해 카드별 원문과 한국어 음성·동기화 자막을 제공한다.
- 담당/범위: 현재 세션 단독, `feat/card-news-discovery-narration`, 기존 격리 worktree. 기준 main `c5bfa2d`(승인된 PR #285 머지 완료).
- 완료 기준: 수집·순위 근거·출처 매핑·대본 별도 검토·TTS/자막 검증, 실제 새 미리보기, 관련 회귀/타입/보안 검사, 본인 커밋·정상 push·PR.
- 정책: 공개 게시·live 활성화 보류. 새 기능 PR 머지는 별도 승인 후. 외부 API만 사용하며 설치·크롤링·자동 재게시 없음.
- 현재: 구현·로컬 미리보기 검증 완료, 새 PR 준비. 기존 음성 Yooni 유지, 공식 TTS 글자 타임스탬프로 자막 정렬. 실패 시 무음으로 조용히 대체하지 않는다.
- 승인 제약: 자동 승인 검토가 릴스 workflow의 ELEVENLABS_API_KEY 지속 접근 추가를 거부했다(음성 요청과 별도 권한 확대 승인 필요). broker 정책/운영 credential loader는 변경하지 않았다. 기존 로컬 제작 경로에서만 미리보기 검증을 진행하며, 예약 음성 통합은 명시 승인 전 미적용이다.
- 자료: `docs/tasks/20261016-card-news-content-discovery-brief.md`(현재 프로젝트 checkout), 공식 GitHub starring API와 ElevenLabs with-timestamps 계약 확인.
- 결과: Superpowers / GitHub 공식 Playwright MCP 활용 / Talorys의 세 카드. 입력→처리→확인 단계의 강조 시점을 실제 발화에 맞춘다. 카드·설명란의 원문 URL을 1:1 연결한다. 초기 플러그인 비교 표본은 3개이며 전체 시장 순위가 아니다.
- 로컬 산출물: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/card-news-discovery-20261016/preview-v3/reel.mp4` (95.770초, 1080×1920 H264/AAC, 약 3.18 MB). 중간 파일이며 iCloud 동기화 완료를 주장하지 않는다. 공개 게시·최종 다운로드 폴더 배포 없음.
- 대본 검토: v1/v2의 구체적 예·가독성 부족을 보완하고 v3의 3카드 × 7기준 독립 검토 통과. 원문·대사·단계 이미지 SHA가 검토 digest에 묶인다. 불합격 기록은 같은 작업 루트에 보존했다. 유료 음성은 v3 통과 이후에만 생성했다.
- 시청각 확인: 20/50/80초 실제 프레임에서 원문·예시·공유 modern-v1 자막을 확인. 43개 자막, 최대 두 줄(192px). 출처를 피해 중심 높이 80%. 음성 평균 -13.6dB, 최대 -3.6dB로 클리핑 없음. QuickTime에서 사용자 미리보기로 열었다. 직접 청음 완료로 보고하지 않는다.
- 인증 구분: 일반 중앙 Codex 자격의 refresh_failed로 새 자격을 복사하지 않고, 기존 native ChatGPT 로그인으로 로컬 미리보기 대본을 검토했다. 운영 전용 카드뉴스 로그인은 변경하지 않았으며 이 결과로 운영 인증 장애를 단정하지 않는다. 로컬 음성은 기존 허용된 runner 범위만 사용했다.
- 검증: Python 카드뉴스/수집/검토/릴스 77개, TTS 16개와 타입 검사, 기존 shorts-publish 45개와 타입 검사, broker 경계 25개 통과. workflow 2개 YAML 파싱·diff whitespace 검사 통과. GitHub CI는 PR 생성 후 확인한다.
- 다음: 본인 변경 커밋·push·PR → 사용자 영상 검토. 운영 예약 음성 권한 확대 및 새 PR 머지는 별도 승인 후 진행한다. 공개 게시 보류를 유지한다.
