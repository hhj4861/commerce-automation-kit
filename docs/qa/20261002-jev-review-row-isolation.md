# JEV 교차 검수 후보별 응답 오류 격리 — 2026-10-02

상태: `fix/jev-review-row-isolation` 구현·로컬 검증. 기준 main `918133b` (#124 문맥 검수와 #125 처리 결과 UX 포함). 이 후속 수정의 main 머지·운영 반영은 별도다.

## 원인과 변경

v8 실제 평가의 영어 호텔 배치에서 후보 0은 올바른 검수 응답이었지만 후보 1에 금지된 `text` 필드가 추가되어 둘 다 `context_review_error`로 보류됐다. 응답 원문은 합성 데이터이며 `fixtures/20261002-jev-context-invalid-row.json`에 reviews JSON만 보존했다. 제공사 메타데이터·키·사용자 자료는 포함하지 않는다.

v9는 먼저 전체 응답의 형태와 후보 번호를 검증한 다음 각 행을 검증한다.

- JSON 파싱 실패, 최상위 추가 필드, 후보 수 불일치, 후보 번호 누락·중복·범위 밖·잘못된 타입은 전체 응답을 거부한다. 번호로 대응할 수 없는 결과를 일부 채택하지 않는다.
- 번호 대응이 모두 확정된 뒤에는 추가 필드, 체크 누락, 잘못된 언어/판정/근거 형식/중복 참조를 가진 해당 행만 `outcome=error`로 보류한다. 올바른 다른 행은 기존 품질·중복 검사를 계속 거친다.
- 추가 필드를 제거하거나 모델 답을 고쳐 통과시키지 않는다. 오류 행의 검증되지 않은 내용은 저장하지 않고 고정 `responseIssue`와 모델·비교 범위만 보존한다. 관리자에게 후보 응답 또는 중복 참조의 형식 확인이 필요하다고 표시한다.
- 의미·발음·근거·상황·신규성 기준, JEV 신뢰도/확률 문턱, 언어 불일치 보류, 확실한 JEV 실패/정확 중복/마지막 의미 중복 차단은 그대로다. 모델 요청·프롬프트·호출 수·제한시간·출력 한도·재시도 0 정책도 변경하지 않았다.
- rubric v9로 기존 캐시와 구분한다. 기존 저장 자료를 자동 재검수하거나 게시하지 않는다.

## 검증

- 앱 테스트 208개 통과(기존 205 + 회귀 3). 후보별 오류 20종을 응답 순서 2가지로 확인했다. 정상 형제 후보 보호, 오류 행 내용 미보존, 비연속 번호, 모호한 배치 전체 거부, 재시도 없음, 마지막 JEV 중복 차단을 포함한다.
- 새 Next route typegen 후 `tsc --noEmit --incremental false`, 변경 TypeScript 3파일 ESLint, `git diff --check` 통과. 의존성은 잠금 파일이 같은 기존 worktree의 node_modules를 임시 참조했다. 생성 타입은 지정 iCloud 작업 폴더에 두었으며 임시 링크는 커밋하지 않는다.
- 실제 실패 응답을 사용한 통합 회귀에서 정상 수건 요청만 통과하고 잘못된 두 번째 행은 보류된다. 이 회귀의 JEV 응답은 합성 응답이며 실제 모델 평가와 구분한다.
- 별도로 과거 r2 실응답 25개를 현재 앱 함수에 오프라인 재생했다. 실제 네트워크 fetch를 금지하고 요청 JSON 25개가 원본과 완전히 같은지 검사했다. 전체 후보 48개와 보조 검수 단독 12개를 실행했고 정상 수건 요청의 회복 및 두 번째 행의 오류 코드 외 나머지 판정이 같음을 확인했다. 원 JEV checks는 모든 후보에서 그대로다.

| 저장된 실응답 재생 결과 | v8 | v9 |
|---|---:|---:|
| 전체 후보 | 48 | 48 |
| 채택 | 14 | 15 |
| 검토 대기 | 3 | 2 |
| 제외 | 31 | 31 |
| 정상 후보 채택 | 14/16 | 15/16 |
| 고정 라벨 기준 오채택 / 정상 오제외 | 0 / 0 | 0 / 0 |

새 유료 호출은 0회다. 위 수치는 새 모델 평가나 독립 표본 정확도가 아니라 동일한 기존 실응답에 대한 코드 수정 효과다. 실제 모델이 부가 필드를 다시 출력하지 않게 된 것은 아니다.

남은 두 보류는 의도적으로 유지한다. `towel-paraphrase`는 잘못된 응답 형식이며 승인하지 않는다. `napkin-request`는 마지막 JEV 의미 중복 판단의 확신 부족이므로 이번 형식 처리 수정으로 해결하거나 임계값을 낮추지 않는다. 후자는 새로운 독립 품질 평가의 대상이다.

## 재현·증적

```sh
cd apps/hanmadi
node --import tsx --test lib/video-context-review.test.ts
npm test
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js lib/video-language-review.ts lib/video-policy.ts lib/video-context-review.test.ts
```

실응답 원본: 사용자 지정 iCloud `gpt 작업/hanmadi-admin/jev-context-20261002/live-r2/live-results.json`. 비교 기준: 같은 폴더 `final-replay.json`. 최신 동작을 이전 보고서 파일에 덮어쓰지 않았다.

코드 해시(검증 당시 SHA-256):

- video-language-review.ts: `b58b023bdf119400a1094d980a8f33f55bdc8da4c18b5fb6c97dd1991fa5c05d`
- video-policy.ts: `3f761aa24ef4c0aac2cd629963d45c1cad1e985fb0b5d9f3cc2d7e43b50c3e5b`
- video-provider.ts(이번 변경 없음): `a0045e4610e728ec13a6b04be45e889c9bc90ae1e39413b28cd45f639a72e119`
