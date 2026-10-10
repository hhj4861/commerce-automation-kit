# 모세 다리 — 새 건축 쇼츠

- 요청: 다른 영상 제작. 담당: 현재 Codex, worker/Claude OFF. 기준 bb9ea91, feat/architecture-render-kit.
- 범위: 이 폴더의 독립 제작 소스만. Shopshorts 런타임/기존 영상/운영 배포 변경 없음.
- 주제 중복 확인: 루트 docs/videos 및 연결 제작 worktree 목록에 모세 다리 없음. 폴커크는 배의 균형과 회전 승강, 이번은 수면 아래 마른 보행 통로의 방수·부력 고정·배수.
- 승인된 몰입형 현장 3D 연출을 새로운 장소에 적용. 전경/보행 눈높이/구조 단면/배수/결말. 자체 제작 형상, 타사 영상/사진 재사용 없음.
- 제작 조건: 1080×1920/24fps, Kyle RU7aSi6lT4uQBXMLgDxK/1.1×, Higgsfield 도입6초 1회 최대54크레딧, 본문 Blender. TTS 실측 길이를 따라가며 결말2.7초 보존.
- 합격 조건: 자료·대본 별도 검토, 대표 프레임 검수 후 전체 렌더, 원인/변화/결과 가시성, 전체 대사 자막 포함, 디코딩/AV/볼륨/결말 검증, 본인 소스 커밋 및 upstream push.
- 현재: 최종 영상 제작·파일 검증·대표 프레임 검수 완료. 본인 소스 커밋·upstream push 마무리 단계. 운영/YouTube 미게시.
- 작업 캐시: 지정 iCloud 루트/commerce-automation-kit/20261010-moses-bridge. 최종: /Users/admin/Downloads/vedio/moses-bridge-immersive-short.mp4.
- 근거: https://bruggenstichting.nl/112-bruggen/bruggen-2013/bruggen-maart-2013/201-een-loopgraafbrug-in-west-brabant (설계자 제공 공사도면과 저자의 현장 방문). https://www.ro-ad.org/projecten/moses-bridge/ . https://bergenopzoom.nu/en/mozesbrug-fort-de-roovere/ .
- 정확한 구조 치수·지반·펌프 성능을 재현하는 공학 모델이 아니다. 콘크리트 기초 고정과 방수·배수의 개념을 보여주며 홍수 안전 보장/현재 방문 가능 여부를 주장하지 않는다.

- Preview1 rejected before paid video: large water blocks obscured structural details, foreground figure looked toy-like, bank did not meet water cleanly. Corrected water to thin surface, shortened cutaway, exposed front anchors/pump, eye-height POV without toy figure, organic bank detail and actual water-bank contact. TTS reused unchanged; screen-plan review refreshed before generation.

- Preview2 exposes foundation/membrane/pump clearly. Narrow stairs intersected coarse landscape mesh: added explicit corridor-edge terrain vertices, preserving the trough width; adjusted discharge tracer to follow the horizontal outlet rather than disappear at the bend. Final hero rechecked after correction.

## 제작·검증 결과 — 2026-10-10

- Exact TTS alignment complete: Kyle1.1×, 42.583333s/1022frames; final hold2.71034s. Every spoken sentence retained.
- Higgsfield official preflight:172.65credits available; estimated54credits; one accepted job `7d584e03-f359-420c-99f8-3d6b7224df8e`. Completed6s source downloaded. Inspected0.4/2.7/5.5s; rigid trench and dry walkway retained. No regeneration. Final balance debit not independently checked.
- Original self-rendered1080p reference, no borrowed video/photo. Final intro trimmed to2.875s to follow actual question without silent filler;6s source preserved.
- Body full render complete, Cycles Metal64sample cap/1080×1920/24fps, 953frames. Body render elapsed5750.42s; this is render time, not total task time. Render/monitor/assembly/verification/contact commands all exited0. No measured token/cost savings claim.
- Caption position: normal1330; structural cutaways330 to keep foundation anchors and pump unobscured. PretendardSemiBold54.

- Actual anchor clip review: connectors are geometrically present but subdued by shadow. Add an editorial orange pulse at the exact camera-projected front anchor rods after the spoken “그래서”; no new hardware or 3D rerender. Separate projection source and source-hash check keep overlay tied to the authored camera/geometry.

## 재현 순서

작업 폴더를 `VIDEO_CACHE`, 기존 인증 실행기가 설치된 저장소를 `CAK_ENGINE_ROOT`로 지정한다. 인증값을 소스나 캐시에 복사하지 않는다.

1. `story.json`의 근거와 화면·대본을 검토하고 `review.json`을 검증한다. 검토자는 현재 Codex의 별도 편집 검토이며 다른 모델의 독립 검수로 주장하지 않는다.
2. `produce.mjs preflight`로 공식 잔액·가격을 확인한다. `tts`는 기존 음성을 검증 후 재사용하며, `generate`는 불명확한 전송을 자동 반복하지 않는다.
3. `render.py align --cache "$VIDEO_CACHE"`, `render.py plan --cache "$VIDEO_CACHE"`로 실제 음성 길이를 기준으로 자막·타임라인을 만든다.
4. Blender에서 `scene.py -- --out <preview> --preview`로 프레임을 먼저 검토한다. 전체 렌더는 `scene.py -- --out <cache>/clips --timeline <cache>/timeline.json --samples 64 --percent 100`이다. Blender의 `--background --python` 인수를 사용한다.
5. 자기 렌더 이미지 `art/hero.png`로 `produce.mjs generate`를 한 번 호출하고 `poll`로 수신한다. 현재 영수증이 있으면 새 생성하지 않는다.
6. Blender에서 `project-anchors.py -- --cache <cache>`를 실행해 실제 카메라 좌표의 연결부 강조 위치를 계산한다.
7. `render.py assemble --cache <cache>`, `verify --cache <cache>`, `contact --cache <cache>`를 실행하고 실제 최종 프레임을 검토한다. Python 명령에는 이 폴더의 스크립트 경로를 사용한다.

최종 검증은 출처와 설명의 정확성, 실제 파일의 디코딩·오디오·길이·자막·대표 프레임에 한정한다. 사용자 미감 승인이나 시청 성과를 보장하지 않는다. 이 독립 제작 소스를 Shopshorts 운영 기능 반영으로 해석하지 않는다.

## 최종 파일 검증

- `/Users/admin/Downloads/vedio/moses-bridge-immersive-short.mp4` — 42.583333초, 1080×1920, 24fps, 1022프레임, 18,905,819바이트.
- 전체 디코딩 성공, 영상·음성 길이 차이0.00034초. 평균 음량-17.9dB, 피크-1.2dB. 모든 대사가 자막에 포함되어 있고 마지막 대사 뒤2.71034초 여유 유지.
- 최종 대표8프레임과 완료된 각 본문 클립의 시간별 프레임 검토. 자막은 구조를 가리지 않으며 연결부 강조는 실제 카메라 투영 위치를 따른다. 강우·집수·배수는 설명용 단순화다.
- 완성본 SHA256: `8b560b913b137efb190d96004409f3ac5bdf2058cb1b6c7d3062ab5e73a495bc`. 상세 근거는 같은 폴더의 `verification.json`.
- 사용자 미감 승인·조회수·실측 공학 정확성을 합격한 것으로 주장하지 않는다. 본 작업은 새 영상 제작이며 운영 배포나 업로드를 수행하지 않았다.
