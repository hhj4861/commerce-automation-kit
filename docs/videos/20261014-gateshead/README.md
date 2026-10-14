# 게이츠헤드 밀레니엄 브리지 — 건축 쇼츠 제작

## 목표와 범위
- 사용자 요청: 잔여 작업 확인 및 건축 영상 생성. 운영 Shopshorts 공통 파이프라인으로 제작, 공개 업로드는 포함하지 않는다.
- 가제: 다리를 끊지 않고 통째로 기울여 배를 통과시킨다고?
- 설정: 건축학, 세로 9:16, 45초 목표(설명/결말 절단 금지), 자동 혼합, Kyle `RU7aSi6lT4uQBXMLgDxK` 1.1배, modern-v1 자막/민트 헤더. Higgsfield 도입6초 및 총54크레딧 상한. 별도 추가 결제 없음.
- 차별점: 폴커크는 배를 수조째 들어 올리고, 롤링브리지는 마디를 접는다. 이번 영상은 연결된 두 아치와 교량 전체가 공통 축을 중심으로 기울어지는 구조를 보여준다. 현재 checkout docs/videos에서 동일 대상 기록은 발견하지 못했다. 전 세션의 미머지 자산 전수검증은 아니다.

## 실제 확인한 근거
- 설계자 https://wilkinsoneyre.com/projects/gateshead-millennium-bridge : 두 강철 아치(보행·자전거 데크/지지 아치), 공통 회전점을 중심으로 함께 회전해 선박 공간 확보, 영국 Gateshead·Tyne강. 2026-10-14 확인.
- 운영기관 https://www.gateshead.gov.uk/article/4610/Bridge-design 는 검색 결과로 확인했으나 본문 조회는 실패했다. 추천 LLM이 읽었다는 진술과 이번 세션의 직접 확인을 구분한다. 개방 각도/중량/시간/현재 운영 일정 수치는 대본에서 제외한다.
- 대상 외형·작동을 설명하는 자체 제작 재현. 타인 영상·이미지를 다운로드해 재사용하지 않는다.

## 장면 구성 기준
1. 첫 프레임부터 배 앞에서 다리 전체가 기울어지는 의외의 동작과 짧은 질문.
2. 강둑·보행자·배를 같은 공간에서 보여줘 두 통행의 충돌을 이해시킨다.
3. 아래 보행로 아치와 위 지지 아치를 구별하고 양 끝의 공통 회전축을 보여준다.
4. 축을 고정한 채 두 아치가 함께 회전, 낮던 보행로 중앙이 올라가 선박 공간이 생긴다.
5. 배가 통과한 뒤 복귀해 보행자가 건너는 완결된 답. 빈 파란 배경/정지 그림 확대/글자 나열 금지.

## 진행과 완료 기준
- 운영 추천 요청 `eb3e61b1-35b4-4e6c-9683-1707d2bad753` 성공. 근거7개와 게이츠헤드 후보 확인. 실제 Codex 요청 성공이며 과거 한도 오류가 현재도 지속된다고 단정하지 않는다.
- 해당 후보를 선택해 조사→대본 요청 접수. 프로젝트 https://shopshorts-dash.pages.dev/studio/automatic?project=3c7f90b5-6eeb-2f43-ed12-fbe24cb94ca9 . 첫 45초 대본은 검토 실패했다. 완결된 답·설명 호흡·화면 연결이 보완 항목이며 TTS/미디어는 생성하지 않았다.
- 완료 기준: 설명 검토 통과 및 실제 대본 독립 확인 → 예산 내 미디어/TTS → 렌더 → 소리/자막/동작/결말 확인 → 최종파일 `/Users/admin/Downloads/vedio/` 제공.
- 운영 제작 워커 소스3744873. 다른 세션의 deploy/shopshorts 최신ab77a7a를 본인 배포로 보고하거나 덮어쓰지 않는다.

## 확인한 잔여 작업
- 자동 배포: 최신 run38570102849도 `Cloudflare credential request failed (503)`. CI용 자격 설정 미완료; 기존 수동 배포 성공과 별개.
- 전체 영상 실생성 E2E: 이번 프로젝트로 검증 진행 중. 이전 수원 QA는 보존.
- 완료 게이트: 직전 reconcile exit0이나 종료 증거 미확인3건 잔존. 전역 훅 상태를 임의 수정하지 않는다.

## 60초 보완 기획 — 운영 저장
- 수정 가설: 6~8초 안에 운영 절차/부품/축 설명이 밀집했다. 운영 절차를 줄이고 원리와 동일 배의 통과·복귀 장면에 시간을 배정한다. 제목·대본은 한국어로 명시했다.
- 원본 프로젝트의 기획은 저장 후 수정 불가하므로 별도 보완 프로젝트를 생성했다. 원본 실패 증거는 보존한다.
- 보완 프로젝트: https://shopshorts-dash.pages.dev/studio?id=fa445d71-da24-4da0-b90c-ef75db91dc9e . 60초 목표, 동일 54크레딧 상한, 자동 혼합. 회전 구간은 renderer=3d 명시. 2026-10-14 22:46 KST 시나리오 요청, 자료 적합성 검토에서 실패해 종료. TTS/미디어 호출 없음.
- 검토기가 지적한 pivot 불일치는 아직 확정 오류가 아니다. `renderers/architecture.py`는 pivot을 layer.size 기준 부품 로컬 좌표로 변환해 layer.from 위치에 더한다. 화면 좌표와 수치만 직접 비교하면 오판할 수 있다. 재생성 구조값의 실제 세계 회전축과 연결성을 확인해야 한다.
- `motion` 경로에 3D hinge만 넣는 것은 실제 Blender 회전을 보장하지 않는다. 이번 기획에 회전 장면의 3D 경로를 명시했다. 최종 장면 데이터/렌더 검증 전에는 해결 완료라고 하지 않는다.

## 2026-10-15 이어서 진행 — 전체 Blender 사용자 승인
- 이번 편은 전체 Blender 3D로 제작하도록 명시적으로 승인받았다. 기존 54크레딧/Higgsfield 도입 조건은 이번 편에 한해 변경. 실제 Higgsfield 과금 호출0건.
- 제작 소스: `/Users/admin/workSpace/commerce-automation-kit-worktrees/gateshead-video/docs/videos/20261014-gateshead/`, 브랜치 `feat/gateshead-blender-video`, 기준3744873.
- 설계자·운영기관 외 LUSAS 구조 해석 사례(https://www.lusas.com/case/analyst/kvaerner.html)를 확인해 유압→공통 회전축→전체 회전의 근거를 보강했다. 보행로가 옆으로 휘어 있어 축에서 떨어진 중앙이 올라가는 관계를 대사에 추가했다. 자료 적합성/설명 검토 통과.
- 3D 미리보기와 평가된 객체 변환으로 양끝 고정·일체 회전·배 높이 여유 확인. 본 렌더1080×1920/24fps/Cycles48샘플 진행 중. 최종 영상 길이는 실제 Kyle1.1 음성에 맞춘다.
- 음성 생성 전 시크릿 조회가 HTTP429. 07:53KST 이전 진단에서 Cloudflare 오류1027과 HTML 일시 제한 문구 확인, Retry-After 없음. 무료 Workers 일일 요청 한도 초과로 확인됐다. 계정/키 만료나 ElevenLabs 한도 문제가 아니다. 공식 문서: https://developers.cloudflare.com/workers/platform/limits/ (00:00UTC/09:00KST 초기화). 초기화 전 반복 요청하지 않는다.
- ElevenLabs 브라우저 대체 경로도 자동 승인 검토가 workspace requirements 로드 실패로 실행되지 않았다. 보안/승인 우회하지 않는다.
- 중간 산출물: 사용자 iCloud gpt 작업 루트의 `commerce-automation-kit/20261014-gateshead/`. 최종 `/Users/admin/Downloads/vedio/gateshead-blender-short.mp4`는 아직 없음.
- **미완료**: 음성, 최종 조립·음성/자막/결말 검증, 완성 파일 전달. 운영 실생성 E2E와 GitOps 자격503은 별개 미완료.
