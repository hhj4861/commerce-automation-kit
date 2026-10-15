# Shopshorts 전체 Blender 3D 통합

- 목표: 웹/CLI 공통 제작 경로에 전체 Blender 3D를 추가하고 게이츠헤드를 전용 검토 포맷으로 생성.
- 소유: Codex, `feat/shopshorts-full-blender`. worker/Claude OFF. 기준 `origin/main f99d1e8`.
- 범위: 선택 UI → 자료·대본 검토 → Blender 장면 → Kyle 음성 → 측정 자막·최종 렌더. 기존 혼합 제작과 발행 검수 유지.
- 현재: 구현·로컬 검증 완료. 새 PR의 머지 및 Pages/제작 워커 반영은 승인 대기. 운영 최종 생성은 아직 미검증.

## 동작과 범위

자동/수동 제작에서 `전체 Blender 3D`를 선택한다. 현재 건축학에 한정하며 첫 장면도 Blender다. Higgsfield 견적·원화·영상 API 호출은 하지 않는다. 음성과 LLM의 사용량은 별도다. 다른 카테고리나 2D/유료 장면으로 조용히 대체하지 않는다.

일반 주제는 제한된 데이터 도형·재질·힌지로 표현하는 **원리 구조도**다. 임의 건물의 정밀 모델 생성까지 제공한다고 표시하지 않는다. 자동 제작의 ‘검증된 영상 포맷’에서 게이츠헤드를 선택하면 등록된 전용 모델 7컷, 공식 자료, 검토된 대본, Kyle 1.1배, modern-v1 자막을 함께 만든다. 기존 삿포로 포맷과 Higgsfield 도입 정책은 유지한다.

CLI도 같은 factory와 runner를 사용한다:

```sh
node apps/shopshorts/studio-recipe-cli.mjs --action create --recipe gateshead-tilting-v1 --project "$WORK/project.json"
node apps/shopshorts/studio-recipe-cli.mjs --project "$WORK/project.json" --action plan
# 대본 검수 후 기존 공통 CLI의 media/render 단계 사용. WORK는 지정 산출물 폴더.
```

실행 코드/파일 경로는 입력으로 받지 않는다. 등록 장면 ID와 대본/프롬프트 일치, 소스 해시, 48샘플, 해상도 비율 설정, 프레임 수, 결과 해시를 확인한다. TTS 실측 길이로 렌더하며 마지막 대사 뒤 최소 1.5초를 확보한다. iCloud 긴 TMPDIR에서 tsx CLI의 Unix 소켓 경로 제한으로 시작하지 못하는 문제는 `node --import tsx`로 동일 원자 CLI를 호출해 해결했다.

## 검증 — 2026-10-15

- 관련 74검사: **72 통과, 0 실패, 2 선택적 기존 E2E 제외**. 신규 full-blender 8검사는 모두 통과. 웹/CLI 동일 초안, 전 컷 3D·유료 미디어 호출 0, 범용 시나리오, 변조/검토 만료 거부, 기존 혼합·삿포로·자동 제작·자막 회귀 포함.
- 실제 공통 `renderAuthoredScene` 어댑터: Gateshead tilt 1초, **1080×1920 / 24fps / Cycles 48 / GPU**, 출력 24프레임. 소스 해시 `cda0893d41118a1fdc0a689635b7db685ca55b6883003854d9de860d38ce53d9`. ffprobe·전체 디코딩·첫/끝 프레임 시각 검사 통과. 양끝 고정/강체 회전/선박 여유 검증 포함. 실측 설계도나 구조 안전 해석은 아니다.
- 독립 Codex 대본 검토: 첫 검토에서 같은 배의 전후 연결 지적 → 2개 대사 보완 → exact-input 7개 항목 통과. 실제 보고서 `apps/shopshorts/recipes/gateshead-review.js`.
- Chrome 로컬 5496: 전체3D 옵션, 예산 입력 숨김, 게이츠헤드 초안 생성, 7컷 Blender 계획, Higgsfield 0크레딧 안내 확인. 메모리 fixture이며 운영 생성 결과가 아니다. 브라우저 연결은 간헐적 timeout이 있었다.
- 산출물: 지정 iCloud 작업 루트의 `commerce-automation-kit/20261014-gateshead/`; `full-blender-verified-tests.log`, `adapter-qa/verified-report.json`, `adapter-qa/before-after.png`.

## 남은 운영 작업

1. 해당 PR 명시 승인 후 main → deploy/shopshorts 승격, Pages와 제작 워커 각각 반영.
2. 워커의 `SHOPSHORTS_BLENDER_BIN`, Whisper/ffmpeg/Pretendard와 음성 연결 확인. 설치 경로를 소스에 고정하지 않는다.
3. ElevenLabs TLS 인증서 문제 해결 후 운영 등록 포맷으로 대본 승인 → 미디어/음성 → 자동 렌더 → 최종 음성·자막·종료 확인. 운영 워커도 같은 Mac이므로 웹 실행만으로 TLS 문제가 해결되지는 않는다. 인증서 검증은 끄지 않았다.
4. 기존 별도 렌더는 보존한다. 통합 완료와 운영 최종 MP4 완성을 혼동하지 않는다. YouTube 업로드는 이번 범위가 아니다.
