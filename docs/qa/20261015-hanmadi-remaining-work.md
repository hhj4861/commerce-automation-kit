# Hanmadi #267 머지·운영 배포 판단·잔여작업

확인일: 2026-10-15. 범위: 이번 음악/영상 학습 전체 설계 42개 항목과 #267 반영. 담당: 현재 Codex 단독(workers/Claude OFF). 기존 운영 자료를 생성·게시하거나 학습 진도를 변경하지 않았다.

## 결과

[PR #267](https://github.com/hhj4861/commerce-automation-kit/pull/267)은 사용자 승인으로 **2026-10-15 08:27:55 UTC main 머지 완료**. merge `e52dbabde158d3fe11e356187b4966ef17a81b92`, 검증한 head `dde289ba9a9ecbcc85ae35089d522362f5b61be7`. PR의 GitOps 검사는 통과했고, 오디오 도구 검사 6개·자체곡 4개 실행 증거는 해당 PR에 있다.

**이번 PR에 대해 새 운영 배포는 하지 않았다.** 변경은 `tools/hanmadi-audio-proof/` 6개와 문서 2개다. 앱·서버에서 이 도구를 호출하는 API/작업/화면이 없으므로 재배포만으로 사용자가 새 음정 기능을 사용할 수 없다. 운영 기능으로의 통합이 먼저 필요하다. 이는 배포 성공이나 배포 장애로 보고할 항목이 아니다.

- merge 첫 부모와 merge의 `apps/hanmadi` tree는 둘 다 `bb134ab4a57bf856cbce1714e16f35bd030301b5`로 동일.
- `ops/deploy/targets.json`의 Hanmadi/관리자/LiteLLM 대상 경로와 #267의 변경 파일은 일치하지 않는다. production 코드·services·workflow에서 `hanmadi-audio-proof`, `librosa`, `pitchFrames` 연결도 검색되지 않았다.
- 실제 배포 workflow는 `deploy/hanmadi`·`deploy/hanmadi-admin` 등 보호된 release branch의 push 또는 해당 branch의 수동 실행으로 시작한다. release branch가 승격되면 경로와 무관하게 배포한다. main 머지를 운영 배포와 동일시하거나, 위 경로 대조를 실제 workflow의 자동 skip 실행 증거라고 하지 않는다.

머지 후 동일 revision의 [Hanmadi 전체 사용자 흐름 CI](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38705851401)와 [Flutter web/Android/iOS CI](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38705851181)는 모두 성공했다. 이는 해당 CI의 시험 환경 결과이며 신규 음정 기능의 운영 E2E가 아니다.

## 현재 운영 확인

| 대상 | 읽기 전용 확인 | 결과 |
|---|---|---|
| [학습 앱](https://hanmadi-lake.vercel.app) | `/api/deployment` | HTTP 200, `566480da47b19f76a812fecc6ea3291c5567b719` |
| [관리자](https://hanmadi-admin.vercel.app) | `/api/deployment` | HTTP 200, `7ef60980a643d9d2ffba3601f6647c729116a29c` |
| 운영 앱 소스 | 두 배포 revision 및 두 release branch의 `apps/hanmadi` tree | 모두 `bb58c80f6ff42e8ddb58536c85d2b6916a018625` |

이것은 배포 식별 API의 응답 확인이다. 로그인·원곡 청음·게시·사용자 학습·모델 실호출의 성공 검증이 아니다. 운영 DB의 현재 게시곡 수/자료 수·Pretender 원문 상태를 이번에는 다시 읽지 않았다. 앞선 설계의 관리자 관찰은 그 관찰 시점의 기록으로 보존한다.

main과 현재 운영에는 별도 Flutter 변경도 차이가 난다. 확인 시 열린 [PR #269](https://github.com/hhj4861/commerce-automation-kit/pull/269)는 `release/hanmadi-flutter-20261015 → deploy/hanmadi` 승격이며 다른 작업이다. 해당 PR의 명시 승인·검증·배포는 그 담당 흐름에서 처리한다. #267 승인으로 이 승격 PR까지 머지하지 않았다. 이전 root 문서에 적힌 #266 이후 상태를 여기서 별도 조회한 것이다.

## 우선순위

1. **원문·작업 기반:** C01~C06·C10~C11과 O02~O03. source/asset/cue/job을 공통화하고 허용 원문 입력, 재접속·응답 유실·실패 재개를 먼저 완성한다. 외부 계정 없이도 자체 자료로 구현·검증할 수 있다.
2. **실제 학습 연결:** S01~S03·S05, M01~M05·M09, C07~C08, A01~A03, L01~L03·L08. 관리자가 만든 표현 배열을 목표→활동→문항→완료의 수업/음악 자료로 만들고 버전 게시·취소·튜터 검색에 연결한다.
3. **연습·복습:** S04·S06·M06~M07·C09·A04·O04. stable player, 자동 정지/뜻 공개, 단어 문맥 저장, 마이크 녹음·재생·삭제, 진도 복원과 관리자 검증 표시를 연결한다.
4. **외부 공급자 실검증:** C04·C10. 안전한 키 주입 경로·이용 범위·제공곡을 확인한 뒤 실제 자막/가사 응답을 검증한다. Pretender의 실제 원문→녹음 매칭→게시→사용자 학습은 여전히 성공 미입증이다.
5. **음정·리듬 제품화:** M08. 권리 확인된 오디오 입력, 비공개 저장/삭제, 영속 분석 작업, 관리자 기준 멜로디 검수, 사용자 녹음 지연·시간 정렬, 음정/리듬 별도 피드백과 실가창 평가가 남았다. 반주 혼합곡의 원시 F0를 정답으로 쓰지 않는다.
6. **학습 관리와 최종 검증:** L04~L07의 실제 embedding/학습 공급자 연결과 평가·적용·복귀, O01·O02~O04 전 범위 회귀. 재학습은 콘텐츠 게시와 구분하고 자동 실행하지 않는다.

## 42개 기능별 남은 범위

아래는 기존 코드/기존 설계 기준과 #267 증거를 대조한 구현 감사다. 기존 기반이 있다는 뜻은 신규 설계 인수 기준을 통과했다는 뜻이 아니다. 배포 API 확인만으로 아래 항목을 운영 E2E 완료로 올리지 않는다.

| ID | 확인된 기반 | 남은 구현·검증 |
|---|---|---|
| C01 | 영상/음악 수집 경로 각각 존재 | 통합 수집함·중복 source·기존 ID adapter |
| C02 | 언어/일부 입력 설정 | 용도·레벨·목표를 pipeline 전 단계에 보존 |
| C03 | 소유 자막·허용 파일 입력 경로 | 공통 provenance/rights/asset revision·보관 정책 |
| C04 | 공개 SDK/요청 계약 조사 | 실제 공급자 adapter·타깃 자막/가사 실응답·비용 검증 |
| C05 | 기존 lock/cache/checkpoint | 영속 단계 job·lease·provider job ID·실행 불명 상태·재개 |
| C06 | 음악 cue parser·선정 구간 | 원문과 선정 단위 분리·안정 cue ID·전체 타임라인/근거 |
| C07 | LLM/JEV/관리자 검수 | 수업/음악 통합 preview·정확한 source/artifact revision 검수 |
| C08 | 기존 도메인 게시/취소 | 불변 게시 snapshot·CAS·철회 의존 관계·이전 게시본 보존 |
| C09 | 일부 큐/진행 처리 | 일괄 작업·취소·재개·실제 단계 진행 상태 |
| C10 | 기존 설정/진단 일부 | 공급자 기능별 준비·실행 증거·권한/capability 상태 |
| C11 | 일반 영상 분석 rubric | 목적별 preset·학습 목표·성공 기준 계약 |
| S01 | 영상 관찰 기반 1~6개 표현 | 목표별 포인트·원 구간·문법/이해 근거 |
| S02 | 표현 초안 | 완결 LessonArtifact·활동·문항·해설·평가 |
| S03 | 기존 starter/표현 수업 | 게시 수업 카탈로그·목표별 수업 동선 |
| S04 | 일부 듣기/따라 말하기 | cue 섀도잉·이해 확인·모바일 재생/권한 |
| S05 | 게시 표현 지식 검색 | 확장 수업/음악 adapter·실제 튜터 자료 사용 확인 |
| S06 | 기존 단어장/복습/진도 | artifact revision/activity 연결·중복 저장·재로그인 복원 |
| M01 | 영상/음악 metadata | 곡/녹음 버전·공급자 가사/원곡 ID 매칭 |
| M02 | 선정 MusicUnit·cue parser | 원문 전체 가사 asset·학습 단위 분리·보정/범위 정책 |
| M03 | 공식 player·구간 반복 | 줄 이동 때 iframe 유지·ready/seek race·실제 청음 |
| M04 | 뜻/읽기 토글·일부 구간 기능 | listen/practice/shadow 상태·자동 정지·타이밍별 강조 |
| M05 | MusicUnit 뜻/읽기/어휘·문제 | 출처 cue에 근거한 문화/시적 의미·문법·독립 언어 검수 |
| M06 | 어휘 목록 저장 | 단어 클릭·언어별 분절·문맥 의미·기존 단어장 상태 공유 |
| M07 | 자체곡 감상·연습 UI 기반 | 실제 마이크 녹음·내 소리 재생·삭제·권한 거절·재시도 |
| M08 | #267 REA/로컬 음정·박자 실측 | 서버/앱 연결·승인 reference·마이크 정렬·실가창 채점 |
| M09 | 음악 게시/곡 링크·진도 기반 | capability별 진입·게시 revision·전체 학습/복습/복원 E2E |
| A01 | 번역 후보 검토/교재 전환 | 공통 provenance 연결·동의/제외 정책 회귀 |
| A02 | 수동 교재/초안/검수 | 수업 목표·활동 editor·원문 보관 안내·편집 이력 |
| A03 | 검색 preview | 곡/수업 게시본 링크·실제 앱 검증 revision/시각 |
| A04 | 네 언어 AI/음성 진단 | 새 공급자·작업·브라우저 재생 단계별 진단 |
| L01 | ContentDraft 검색 | 음악/완결 수업 KnowledgeEntry adapter와 실제 검색/대화 |
| L02 | 기존 dataset snapshot | source/rights revision·보관 한도·철회 cascade |
| L03 | lexical 평가·버전 검사 | 음악/수업·언어·상황·no-match 독립 평가셋 |
| L04 | 의미 색인 생성/평가/적용 코드 | 운영 embedding 연결·범위 필터·동일 index 평가 후 적용 |
| L05 | dataset 분할/export 코드 | source/recording 분리·허용 데이터/holdout 검증·실공급자 |
| L06 | 학습 job 상태 코드 | 원격 제출/조회/취소·응답 유실·중복 제출 방지 실검증 |
| L07 | review/alias/활성화 일부 | 독립 시험 결과 연결·앱 키 접근·적용 범위·복귀 E2E |
| L08 | 일부 무효화·검토 | source→자료→dataset/index/model 영향 추적·철회·피드백 검수 |
| O01 | 기존 네 언어 fixture/흐름 | 새 수집→생성→학습→복습을 EN/JA/TH/ES 각각 운영 E2E |
| O02 | owner/origin/CAS 등 | 신규 asset/job/녹음/철회 경로 권한·SSRF·사용자 격리 |
| O03 | 일부 비용/실패 정보 | 전 단계 request ID·원장·비용·지연·불명 상태 보존 |
| O04 | 일부 앱 확인 메뉴 | 실제 게시 revision·브라우저/실호출 검증과 fixture를 구분 표시 |

## 관련 PR과 배포 전 인수 기준

조회 시 Hanmadi 관련 열린 작업에는 #269(Flutter 승격), #257(학습 메뉴·UI 개편), #162(JEV 판정 보완)가 있다. 각각의 머지·CI·중복 변경은 해당 작업 담당과 승인 흐름에서 다룬다. 일반 검색에 같이 잡힌 #161은 topic-discovery여서 이 42개 기능의 완료 PR로 세지 않았다.

운영 기능 배포를 완료하려면 적어도 다음이 필요하다.

- 앱/서버에 사용 경로를 구현하고 관련 PR·언어 회귀 검사를 통과한다.
- 검토한 정확한 source를 해당 release branch로 정상 승격한다.
- GitOps 실행 종료와 새 운영 revision을 확인한다.
- 검증용 계정으로 수집→실제 자료 확보→생성/사람 검수→게시→원곡/수업/녹음→저장/복습→진도 복원을 확인한다. 공급자 fixture와 실제 곡, 코드 존재와 실운영 성공을 분리한다.

기술 증거: [#267 QA](https://github.com/hhj4861/commerce-automation-kit/blob/e52dbabde158d3fe11e356187b4966ef17a81b92/docs/qa/20261015-hanmadi-audio-proof.md). 전체 기준: [기능 명세](../plans/20261015-hanmadi-video-learning-build.md), [전체 설계](../design/20261015-hanmadi-admin-learning-architecture.md).

웹 설계 검토 HTML은 앞선 문서 버전의 정적 스냅샷이다. 현재 잔여 상태는 본 문서가 우선하며, HTML을 운영 앱 또는 실검증 완료 화면으로 취급하지 않는다.
