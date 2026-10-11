# Shopshorts 검증 영상 제작 방식 통합

목표: 삿포로 돔 영상의 실제 전용 모델·검수된 대본·최신 자막을 공통 웹/CLI/워커 파이프라인에서 재현.
소유자: 현재 Codex, 이 worktree. 기준5ae449c(PR174, 미머지). 다른 세션 코드/운영은 변경하지 않음.
범위: 고정 허용 목록의 제작 레시피, 공통3D 라우트, 재사용 도입/음성, 검수·비용·작업상태 유지. 임의 Python 실행/서버경로 입력 금지.
완료 기준: 악성/불일치 입력 거부, 기존 제작 회귀, 실제 common runner media→render, 음성/자막/결말 검증, own commit/push, PR.
운영 관찰: 최초 추천 UNKNOWN 실패. 워커 로그 Cloudflare 연결 실패 이력. 1회 재시도는 추천 성공, 운영 삿포로 프로젝트의 시나리오 요청까지 진행. 잔액10.65크레딧, 신규 유료 요청0회. 운영은cf73676, PR174 미머지.
현재: 구현 중. 운영 반영은 PR 명시 승인 이후.


## 통합 경로와 현재 검증

- 웹: 자동 제작 → 검증된 영상 포맷으로 시작 → 삿포로 돔. `POST /api/studio/recipes`는 초안만 만든다. 기존 승인·검수·비용 상한·발행 검수는 유지한다.
- CLI: `studio-recipe-cli.mjs --project <file> --action create|import|plan|media|render`. `import`는 소유 도입 영상과 정확히 일치하는 음성 메타데이터만 재사용한다. `media --approve-script` 이후 공통 `runHybridCli → executeStudioTask → prepareWebtoon → renderHybridScene → renderAuthoredScene`을 사용한다.
- 등록된 고정 ID/장면과 번들 Python만 실행한다. 사용자 Python·경로·임의 코드 실행은 없다. 현재 모델은 삿포로 돔 전용이다. 다른 주제 전체에 같은 건축물이 생성된다고 주장하지 않는다.
- 원본 Higgsfield 도입6초 재사용, 기존 음성5개 재사용. 대본 검수에서 공기 주입→압력이 넓은 바닥을 미는 인과 연결을 보완했고 air 음성1개만 공식 ElevenLabs로 생성했다. Higgsfield 추가 생성0회.
- 독립 대본 검토: 초기 계획49초/목표45초 불일치 및 air의 인과 연결, ending 여유 불일치를 각각 수정. 최종 입력은 계획46.5초/상한48초이며 검토7항목 통과. 실제 길이는 음성을 측정해 편집하며 짧게 잘라 맞추지 않는다.
- 공통 제작 관련 회귀31검사 중29통과, 선택적 실렌더2건은 별도 플래그로 생략. 이번 레시피 전용7검사 통과. 대본 검토가 없거나 변조되면 유료 요청/렌더 전에 실패한다.
- 실제 브라우저: 로컬5199에서 포맷 버튼→초안 생성→출처/6장면/검수 승인 표시 확인. 초안ID b1d9751a-364f-477d-be38-1a306179ea9d. 별도 자동 생성 요청/과금 없음. 브라우저 파일 선택은 확장프로그램에서 시간 초과되어 업로드 완료는 미확인.
- 운영 기존 추천의 프로젝트 cfb5427a-2686-5652-8b40-3763eea54340은 시나리오 시간 초과 상태. 새 통합은 아직 운영 미반영이며 이 실패를 성공으로 보고하지 않는다.
- 실제 CLI 프로젝트5f0c9b2c-b3f7-4c47-a00b-47a4246698dc: 3/5 본문이 Cycles GPU/48samples/1080×1920로 생성, 남은2컷 진행 중. 작업·로그는 iCloud `commerce-automation-kit/20261011-shopshorts-sapporo`에 저장.

## 재현

```sh
node apps/shopshorts/studio-recipe-cli.mjs --project "$PROJECT" --action create
node apps/shopshorts/studio-recipe-cli.mjs --project "$PROJECT" --action import --opening "$OPENING" --voice-dir "$VOICES" --assets "$ASSETS"
node apps/shopshorts/studio-recipe-cli.mjs --project "$PROJECT" --action media --approve-script --assets "$ASSETS" --work "$WORK"
node apps/shopshorts/studio-recipe-cli.mjs --project "$PROJECT" --action render --assets "$ASSETS" --work "$WORK"
```

`SHOPSHORTS_BLENDER_BIN`에는 Blender4.2+ 실행 파일을 지정한다. 작업 폴더는 iCloud 작업 루트, 최종 영상은 Downloads/vedio. 실행 전 node_modules를 설치한다. 테스트 명령은 `TMPDIR=<작업용임시폴더> node --test apps/shopshorts/test/authored-recipes.test.mjs`.
