# Hanmadi 가사 학습 연결 구조 — 운영 배포 검증 (2026-10-08)

## 결과

사용자의 “머지, 배포 해줘” 승인에 따라 [PR #163](https://github.com/hhj4861/commerce-automation-kit/pull/163)을 머지하고 학습 앱 Production에 반영했다. **가사 공급 계약/API는 미연결**이며, 운영에는 `가사 학습 준비 중` 안내와 공식 YouTube 링크가 표시된다. 실제 Pretender 가사·번역·음성 연습이 개방됐다는 뜻이 아니다.

- PR 검증 커밋: `f4e2637ef925c7240949b088ac87c2f56c97285c`
- 머지: `7a7b634bda9764ab348a7caed880e8021772d9ad`, 2026-10-08 08:28:59 UTC
- 운영: https://hanmadi-lake.vercel.app/study
- 배포: https://hanmadi-k688nkrrs-dean-10.vercel.app
- Vercel ID: `dpl_FaC89yXUj6EUWnbk7JGX6b6cP7TT`, target production, READY
- 상세: https://vercel.com/dean-10/hanmadi/FaC89yXUj6EUWnbk7JGX6b6cP7TT
- 원격 Next 16.3.6 빌드 완료: 32초. build/runtime의 learner 모드와 release SHA 일치.

## 머지·배포 근거

CI 5개 모두 성공: study 7m32s, Dify connection 7m29s, connections 1m40s, native-runtime 1m21s, Platform GitOps verification 21s. 정확한 head SHA 일치 조건으로 머지했으며 강제 머지·관리자 우회·브랜치 보호 변경은 없다.

배포용 `/Users/admin/workSpace/commerce-automation-kit-worktrees/hanmadi-lyrics-release`는 머지 SHA의 깨끗한 detached worktree다. `apps/hanmadi`가 검증된 PR head와 동일함을 git diff로 확인하고 기존 공식 Vercel CLI 60.1.3 인증으로 명시한 learner 프로젝트에 배포했다. 관리자 앱·AI 서버·가사 공급 환경변수는 변경하지 않았다.

자동 배포의 기존 활성화 미완료 상태는 유지했다. 조회한 deploy/hanmadi 실행은 초기 브랜치 생성 실행 `37291015909` 하나였고 열린 승격 PR은 없으며, 앱의 Git deploymentEnabled는 false다. 이번은 승인된 수동 CLI 배포이며 새 CI 자격 발급이나 GitOps 활성화 완료로 보고하지 않는다.

## 실제 운영 확인

- production 필수 설정 이름 검사 통과. HANMADI_MUSIC_ 설정 이름은 없음. 키 값을 출력·다운로드·문서화하지 않음.
- `verifyLearnerRelease` 통과: `/api/deployment` 200과 정확한 application/revision, `/study` 200, `/privacy` 200, Google login readiness API 200 및 available/clientId 일치.
- 비로그인 관리자 API 403, 신규 `/api/study/music` 401. 공개 조회가 가사를 노출하지 않음.
- 로그인된 실제 Chrome에서 일본어 오늘 추천 화면과 음악 탭을 확인. Pretender / Official髭男dism, `가사를 한 줄씩 듣고, 뜻을 익히며 따라 불러요.`, 공식 영상 링크와 `가사 학습 준비 중` 안내를 확인. 종전 감상 회화 4개 수업 카드는 없음.
- 브라우저 사용자의 동시 조작을 감지해 이후 추가 클릭 검증은 멈춤. 운영에서 새 계정·진도·단어장·AI 대화를 만들지 않았으며 실제 음악이나 TTS 재생 품질을 검증했다고 주장하지 않음.
- 이번 deployment에 한정한 배포 직후 10분 error-level 로그 조회: `No logs found`. 조회 시점과 필터에 한정한 결과이며 장기 무오류 보장이 아님.

## 남은 단계

실제 가사 서비스 계약과 Pretender의 제공·지역·번역/발음/TTS/보관 허용 범위 확인, 공급자 전용 어댑터, 검수된 실제 자료와 음성 검증 후 활성화한다. 현재 구현의 계약과 승인 조건은 main의 `docs/tasks/20261008-hanmadi-lyrics.md`에 있다.

이 QA 문서는 사용자 지침에 따라 현재 프로젝트 docs의 작업 브랜치에 별도로 보관한다. 문서 커밋 자체가 새로운 운영 빌드를 만드는 것은 아니다.
