# 한마디 콘텐츠 스튜디오 운영 배포 — 2026-09-29

사용자가 PR #77 머지를 승인한 뒤 운영 배포를 요청했다. **운영 배포 완료**, GitOps 자동 배포 연결은 미완료다.

## 실제 운영 반영

- 관리자: https://hanmadi-lake.vercel.app/study/admin — 기존 소유자 PIN으로 로그인한다.
- 학습 앱: https://hanmadi-lake.vercel.app/study
- 프로젝트: `dean-10/hanmadi` (`prj_xJ5tTXyMYNV6qL1fVnWxFBuIRoRf`).
- 소스: main 머지 커밋 `ad7b8dc355a587f9f0f3377ee86101c7db745071`, [PR #77](https://github.com/hhj4861/commerce-automation-kit/pull/77).
- 최종 deployment: `dpl_2rezSKJh1Lj28U8Hg35tpxijQSki`, 상태 `READY`, production.
- 고유 URL: https://hanmadi-n5olxq2r2-dean-10.vercel.app
- 운영 별칭: `hanmadi-lake.vercel.app`, `hanmadi-dean-10.vercel.app`을 최종 deployment에 연결했다. `promote`만으로 lake 별칭이 이동하지 않아 명시적인 `alias set` 후 확인했다.
- [Vercel 배포 상세](https://vercel.com/dean-10/hanmadi/2rezSKJh1Lj28U8Hg35tpxijQSki). 최종 Next.js 운영 빌드는 47개 페이지를 생성했고 Build Output 완료는 9초였다.

별도 worktree에서 위 main 커밋 그대로 Vercel에 직접 배포했다. 앱 소스 추가 변경, LiteLLM/Dify 서버 재배포, 모델 가중치 학습은 하지 않았다. 첫 번째 준비용 deployment `dpl_2TwyGgr7TSkY9giNbemqhEtaM42A`는 최종 버전이 아니다.

기존 프로젝트의 YouTube 키를 공식 검색 API로 검증한 후 Vercel production의 `YOUTUBE_API_KEY` Secret으로 추가했다. 키 값은 문서·소스에 저장하지 않았다. 최종 deployment에는 이 설정이 포함된다. YouTube 검색과 사용권 있는 원문 입력이 동작하며, 임의 영상의 자막 자동 수집은 이번 범위에 포함되지 않는다.

## 저장 형식 전환과 보호

운영 Redis `hanmadi:v2`의 `curriculum`은 전환 전 존재하지 않았다. 같은 보호된 Redis에 원자적 백업을 남겼다.

- 백업 키: `hanmadi:ops:backup:knowledge:20260929:ad7b8dc`
- 내용: 전환 전 필드 부재 및 시점 기록. 실제 교재 원문은 없었다.
- 보관: 604800초(7일) 후 자동 만료. 접근 권한은 기존 Redis 운영 자격과 동일하며 복구 책임은 한마디 운영자에게 있다.

전환 중 `/api/study`로 시작하는 비-GET 요청을 잠시 차단하고, 기존 요청 최대 실행 시간 90초보다 길게 기다린 뒤 운영 도메인을 전환했다. 전환 후 쓰기를 재개했으며 실제 Redis CAS와 새 `version: 1` 저장 형식은 운영 검증 요청으로 확인했다.

구버전 고유 URL이 새 저장 형식에 접근하지 않도록 Vercel 프로젝트 방화벽 규칙을 유지한다.

- 규칙 ID: `rule_hanmadi_knowledge_cutover_Gw1Ejc`
- 표시 이름: `Hanmadi current knowledge API only`
- 조건: path가 `/api/study`로 시작하고 host가 아래 허용 목록에 없으면 deny.
- 허용 host: `hanmadi-lake.vercel.app`, `hanmadi-dean-10.vercel.app`, `hanmadi-n5olxq2r2-dean-10.vercel.app`.
- 기존 일반 배포 보호 설정은 유지했다. 예전 deployment의 `/api/study`에 실제 요청해 HTTP 403을 확인했다.

**다음 배포 시** 운영 별칭은 유지하고 검증할 새 고유 URL을 이 규칙의 허용 목록에 추가한다. 검증·전환 후 더 이상 사용할 이전 고유 URL은 목록에서 제거한다. 다른 경로나 다른 프로젝트에 이 규칙을 확대하지 않는다.

이전 앱은 새 curriculum 객체를 읽지 못한다. 구버전 바이너리로 단순 rollback하거나 과거 백업으로 덮어쓰지 않는다. 철회 상태를 보존하는 수정 릴리스로 전진 복구한다.

## 실제 운영 검증

테스트용 AI 서버가 아닌 production 도메인·운영 Redis·실제 모델 호출로 다음 흐름이 통과했다.

1. 기존 소유자 로그인 → 새 관리자 화면 및 후보함 조회.
2. 임시 학습자 가입 → 학습 API 조회, 관리자 접근 HTTP 403.
3. 관리자에서 YouTube 공식 검색 결과 조회.
4. 일반 한국어 문장 번역 → 명시적 제공 동의 → 번역 후보 저장.
5. 실제 모델로 후보에서 초안 생성 → 알려진 검증용 표현으로 검수·게시.
6. 학습 앱에서 게시된 수업 조회 → 동일 검색 함수의 참고 예시 조회.
7. 테스트 레벨 설정 → 게시 예시가 있는 카페 상황에서 실제 AI 대화 응답 HTTP 200.
8. 제공 철회 → 후보 및 연결 교재 제거 → 임시 계정·개인 학습 상태만 삭제.

공용 저장소 전체를 초기화하거나 기존 사용자 상태를 덮어쓰지 않았다. 철회 세대 및 개인정보 없는 운영 이력은 정상 보존한다. 배포 후 오류 레벨 로그 조회 결과는 0건이었다. 별도의 지속 모니터링·drain 설정 여부까지 검증한 것은 아니다.

main 머지 커밋의 [학습 E2E](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36582929869), [개인 모델 연결](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36582929807), [Dify 연결](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36582929819) CI도 모두 성공했다.

## 자동 배포 연결의 남은 조건

현재 `deploy/hanmadi` 브랜치는 없으며 Cloudflare broker의 Hanmadi 배포 자격 연결도 활성화되지 않았다. 기존 Vercel 로그인은 프로젝트 조회·배포 권한이 있지만, 한마디 프로젝트로 범위를 제한한 새 CI 토큰 발급은 `Cannot create tokens for this app`으로 거부됐다. 이 호출로 발급된 토큰은 없고 기존 로그인 토큰을 중앙 저장소로 복사하지 않았다.

따라서 이번 결과를 GitOps 자동 배포 성공으로 보고하지 않는다. 이후 권한 있는 계정에서 전용 CI 토큰을 발급해 중앙 비밀관리·정확한 OIDC 정책에 연결하고, 보호된 `deploy/hanmadi` 브랜치와 첫 Actions 배포를 완료해야 한다. [공용 GitOps 절차](https://github.com/hhj4861/commerce-automation-kit/blob/main/docs/deployment/platform-gitops.md)를 따른다. 새 PR 머지에는 해당 PR의 사용자 승인이 필요하다.
