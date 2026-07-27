# Preply 한국어 튜터 운영 문서 (Ops)

이 폴더는 Preply 한국어 튜터 활동을 위한 운영 문서 세트입니다. 체험수업부터 정규수업, 리텐션, 마케팅, 프로필 최적화까지 실전에서 그대로 사용할 수 있도록 대본·체크리스트·복붙 메시지 템플릿 형태로 작성했습니다.

## 문서 목록

| 파일 | 제목 | 용도 |
|---|---|---|
| [`trial-lesson-script.md`](./trial-lesson-script.md) | 체험수업 30분 대본 | 첫 만남 30분을 시간대별 대사·화면공유 큐로 그대로 진행 |
| [`regular-lesson-flow.md`](./regular-lesson-flow.md) | 정규수업 운영 플로우 | 수업 전·중·후 루틴, 50분 타임박스, 레벨별 커리큘럼 매핑 |
| [`live-dictation-feedback-template.md`](./live-dictation-feedback-template.md) | 실시간 받아쓰기 & 피드백 템플릿 | 라이브 노트 표준 양식, 교정 표기 규칙, 단어장/숙제 템플릿 |
| [`retention-playbook.md`](./retention-playbook.md) | 재수강·리텐션 플레이북 | 체험→결제 전환, 이탈 신호 대응, 리뷰 요청 전략, 지표 추적 |
| [`tiktok-shortform-funnel.md`](./tiktok-shortform-funnel.md) | 틱톡·숏폼 유입 퍼널 가이드 | 콘텐츠 필러, 스크립트 공식, 30일 콘텐츠 캘린더 |
| [`preply-profile-checklist.md`](./preply-profile-checklist.md) | Preply 프로필·수수료 최적화 체크리스트 | 가격 전략, 자기소개 영상 스크립트, 랭킹 요인 관리 |
| [`classroom-english-phrasebook.md`](./classroom-english-phrasebook.md) | 수업 진행 영어 표현집 | 영어가 유창하지 않아도 수업 진행 가능한 표현 모음 |
| [`student-onboarding-assessment.md`](./student-onboarding-assessment.md) | 신규 학생 온보딩 & 레벨 진단 가이드 | 첫 정규수업에서 레벨 진단·목표 합의·포털 세팅 완료 |

## 문서 간 연결 구조

```
trial-lesson-script.md ──▶ live-dictation-feedback-template.md ──▶ retention-playbook.md
        │                                                              ▲
        └──────────────▶ student-onboarding-assessment.md ──▶ regular-lesson-flow.md
                                                                        │
classroom-english-phrasebook.md (수업 중 상시 참조) ◀────────────────────┘
preply-profile-checklist.md ◀──▶ tiktok-shortform-funnel.md (유입-프로필 연동)
```

핵심 루프: **수업 중 라이브 노트 작성 → 학생 포털 링크 전달 → 재수강 전환** — 이 루프가 재수강률의 핵심이며, 위 3개 문서가 이를 순서대로 다룹니다.

## 재확인 필요 항목 (⚠️)

Preply 수수료율(최저 약 18%), 노쇼·취소 정책, 외부 유입 관련 플랫폼 정책은 모두 **유튜브 인터뷰(2026) 출처**입니다. Preply 가입 시 공식 정보로 반드시 재확인하세요. 재확인 체크리스트는 `preply-profile-checklist.md`의 "재검증 필요 항목 목록" 섹션에 정리되어 있습니다.

## Notion에 import하는 법

1. Notion에서 새 페이지를 만들고, 페이지 상단 메뉴(`•••`) → **Import** → **Text & Markdown**을 선택합니다. (또는 새 빈 페이지를 연 뒤 마크다운 파일 내용을 그대로 복사해 붙여넣어도 Notion이 헤더/표/체크리스트/굵은 글씨를 자동으로 블록으로 변환합니다.)
2. 이 폴더의 `.md` 파일 8개를 한 번에 선택해 업로드하면 각각 별도 하위 페이지로 생성됩니다 — 파일명이 페이지 제목이 되므로, 필요하면 import 후 제목을 위 표의 "제목" 컬럼 값으로 바꿔주세요.
3. 표(table)와 체크리스트(`- [ ]`)는 Notion에서 각각 테이블 블록/To-do 블록으로 자동 변환됩니다. 코드블록(```)으로 감싼 다이어그램·양식 예시는 코드 블록으로 유지되니, 필요 시 Notion에서 "텍스트로 변환" 후 재구성하세요.
4. 문서 간 상대경로 링크(`[텍스트](./파일명.md)`)는 import 후 깨질 수 있습니다 — 모든 문서를 같은 상위 페이지 아래로 import한 뒤, Notion 내에서 `@페이지명` 멘션으로 링크를 다시 걸어주는 것을 권장합니다.
5. 이후 갱신은 이 폴더의 원본 마크다운을 수정 → 재import(덮어쓰기) 방식으로 관리하면 버전 관리가 쉽습니다.
