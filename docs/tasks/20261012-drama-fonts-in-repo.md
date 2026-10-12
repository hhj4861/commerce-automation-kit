# 드라마 자막 폰트 저장소 반입 — H

- 목표: 삭제 가능한 Downloads 폴더에 의존하던 파일럿 폰트를 저장소에 보존하고 실행 위치와 관계없이 style을 읽는다.
- 범위/담당: Codex 작업 H, `fix/drama-fonts-in-repo` worktree의 폰트·CLI 로딩·조립 사전 검사·시험·실행 안내.
- 기준: `371876d` (`origin/feat/drama-regression-pilot`).
- 완료 조건: 5개 원본 blob 일치, style 기준 상대경로 해석, 누락/디렉터리 폰트의 외부 호출·출력 생성 차단, 저장소 style 가드, 패키지 전체 시험·runner 시험·typecheck·diff 검사, 로컬 커밋.
- 구현: 폰트·라이선스 5개를 바이트 그대로 반입하고 제공된 blob과 대조했다. CLI style 로더에서 상대 fontFile을 style 폴더 기준으로 해석하고 절대경로를 보존한다. 코어/어댑터의 경로 의미는 유지한다.
- 사전 검사: assembleEpisode에서 기존 회차·출력 보호 검사 다음, 클립 ffprobe와 모든 쓰기 전에 기본 폰트 및 지정된 역할별 폰트(title/kicker/subtitle/caption/label)를 일반 파일인지 검사한다. 어댑터 직접 호출도 보호한다. 오류는 역할·경로를 포함하고 CLI는 기존 관례대로 stderr 및 stdout `{ok:false,error}`와 종료 1을 반환한다.
- 검증: 새 시험 17개는 수정 전 15 실패/2 통과 → 수정 후 17 통과. 기존 출력 보호 시험 11개 포함 28/28, drama-series 전체 23파일 320/320 통과, 건너뜀 없음. contracts/drama-series/drama-runner typecheck 3/3, 원본 blob 5/5 및 style의 fontFile 외 키·값 보존 검사 통과.
- 공백 검사: 기존 추적 파일의 `git diff --check`는 통과했다. 새 파일까지 staging한 `git diff --cached --check`는 `LICENSE-Pretendard.txt:22` 원문 줄 끝 공백 1건으로 실패(종료 2). 요구된 blob 보존을 우선하여 원문을 수정하거나 검사 예외를 추가하지 않았다. 코드·다른 문서에는 공백 오류가 없다.
- 시험 준비 오류: 최초 두 실행의 CLI 시험 2개는 임시 cwd의 tsx 해석 문제, 이어 Vitest의 import.meta.resolve 미지원으로 실패했다. createRequire로 기존 tsx의 파일 URL을 구한 뒤 기능 회귀 실패(15/17)를 별도로 확인했다. 로그를 구분해 남겼다.
- 실제 렌더: 로컬 ffmpeg drawtext로 번들 4역할과 한글·공백 텍스트 경로를 사용해 640×360 PNG 1프레임 생성·ffprobe 확인 통과. `/private/tmp/codex-H-fonts/` 아래 해당 임시 결과는 삭제했다.
- 미완료 검증: `npm test -w @cak/drama-runner`는 legacy 시험 1 통과, runner 시험 파일 1 실패. `@atomworks/kernel`이 현재 node_modules에 없어 로딩에서 중단됨(ERR_MODULE_NOT_FOUND). runner 내부 개별 시험은 실행되지 않았다. 새 설치 금지에 따라 패키지 설치·링크 추가·다른 worktree 수정 없이 보고한다.
- 안내: 실행 스킬은 저장소 폰트와 style 기준 경로를 안내한다. 과거 Downloads 경로 기록은 수정하지 않았다. 목록은 H-report.md에 남긴다. shopshorts 폰트 원본은 변경하지 않았다.
- 환경: Node 22.23.3, 기존 node_modules, worker/Claude 플래그 OFF. 유료 호출·영상 재생성·새 패키지 설치 없음. 로그는 사용자 지정 `20261012-drama-fonts/H/`, SQLite용 경로는 `/private/tmp/codex-H-fonts/`로 지정했다.
- 현재 결과: 폰트 수정과 drama-series 검증 완료. runner 전체 검증은 의존성 누락으로 미완료이며 로컬 커밋으로 인계한다.
- 다음: 오케스트레이터가 승인된 기존 Atomworks 의존성을 준비하고 runner 시험을 재실행한 뒤 `fix/drama-fonts-in-repo`를 push하여 `feat/drama-regression-pilot` 대상 PR을 생성한다. 사용자 지시에 따라 이 작업자는 push·PR 생성·머지를 수행하지 않는다.
- 한계: 일반 파일 검사는 폰트 형식·글리프 완전성 검사나 실행 중 파일 교체 방지를 보장하지 않는다. 삭제된 파일럿 클립은 복구하지 않았으므로 원본 파일럿 전체 재조립은 미확인이다. 삭제 원본과 새 5파일의 398 B 차이는 라이선스 텍스트 판본 차이로 추정할 뿐 확인할 수 없다.
