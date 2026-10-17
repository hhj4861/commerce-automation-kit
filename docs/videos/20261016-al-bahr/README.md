# 알바하르 타워 — 움직이는 외부 차양

- 목표·결과: “이 빌딩의 외벽은 왜 접혔다 펴질까?” 신규 Blender 3D 건축 쇼츠 제작·검증 완료.
- 소유·범위: Codex 직접, worker/Claude OFF. `feat/architecture-al-bahr-3d`, 기준 main02349c7. 신규 영상과 재현 소스만 변경했다. 기존 완성본·운영 웹앱·공개 업로드는 변경하지 않았다.
- 완성본: `/Users/admin/Downloads/vedio/al-bahr-blender-short.mp4` — 55.531초, 29,339,931바이트.
- SHA-256: `a5e022a7c5eaa06b241de7671758baab31c208e43a8378400475dafbdb821d1a`.
- 형식: 1080×1920, 24fps, H.264/AAC48kHz. 전체 Blender 3D, Higgsfield0건.
- 음성: Kyle `RU7aSi6lT4uQBXMLgDxK`, 최종1.1배. Pretendard SemiBold·차콜 자막·민트 헤더를 공통 제작 모듈로 적용했다.
- 중간 산출물: 지정 iCloud 루트 `commerce-automation-kit/20261016-al-bahr/`. 완성본은 사용자 지정 Downloads/vedio에 저장했다. iCloud 동기화 완료를 주장하지 않는다.

## 조사·구성

- 같은 대상 제작 기록을 docs/videos와 연결 worktree에서 확인해 중복을 피했다.
- Arup·AHR·Diar의 1차 자료로 외부 차양, 동·남·서향 적용, 전통 격자창의 그늘과 현대적 동적 외피, 자연광·눈부심·열의 균형을 확인했다. 출처·확인한 사실은 story.json에 있다.
- 핵심 흐름: 창문으로 들어오는 햇빛 → 외부 차양 펼침 → 같은 책상에 생기는 그늘 → 태양 방향 변화와 차양 접힘 → 빛·열의 균형이라는 답.
- 자체 제작한 설명용 형상이다. 정확한 시공도·실측 조도·에너지 절감률은 주장하지 않는다. 내레이션과 하단 표기로 빠른 원리 재현임을 알린다.

## 제작·검증

- 자료 검토 통과. 첫 대본 검토에서 같은 창문의 재개방 결과·재현 한계가 빠진 점을 보완한 뒤 exact-input 7항목 검토를 통과했다. `research-review.json`, `review.json`, `review-first-failed.json`에 실제 기록이 있다.
- 카메라의 벽 가림과 직사광선 비교 구도를 본 렌더 전에 수정했다. 최신 시안은 `preview-room-v3`, 실제 동작 확인은 `mechanism-check.png`, `example-check.png`다.
- 검토된 60초 계획으로 렌더한 장면6개를 실제 음성에 맞춰 최종55.4583초 타임라인으로 조정했다. 내레이션을 잘라내거나 부수 배속하지 않았다. MP4 컨테이너 길이는 55.531초다.
- 렌더6개 모두1080p·24fps·프레임 수·SHA-256·전체 디코딩 통과. `render-final-check.json`, `render/render-manifest.json`에 기록했다.
- 원래 API 시도는 Cloudflare1027/HTTP429 시크릿 조회에서 실패해 유료 생성까지 도달하지 않았다. 공식 웹에서 전체 대본을 한 번 생성했으며, 이후 인증서 오류와 브라우저 다운로드 문제로 회수가 지연됐다. 사용자 중단 시 렌더를 종료했고 재개 후 완료된3개 장면의 해시를 확인해 나머지만 렌더했다.
- 연결 복구 후 승인된 기존 실행기 키 경로로 공식 History API에서 **대본·voice ID가 정확히 일치하는 기존 음성 한 개**를 회수했다. 새 음성 생성0건. 비밀 값은 프로세스 메모리에만 사용했다. 회수 기록은 `website-download-receipt.json`이다. 임시 브라우저 MP3는 생성되지 않았다.
- 생성 기록의 실제 원래 속도0.98을 확인해 `atempo=1.1/0.98`로 최종1.1배를 맞췄다. 원래 웹 화면에서 관찰한 정배속 설명보다 이 실제 생성 기록을 우선한다.
- 로컬 Whisper small 전사 후 공통 정렬 코드로 전체·장면별 자막을 검증했다. 장면별 최소 일치율 0.9464. 공통 전체0.8·구문0.65 기준을 낮추지 않았다.
- 최종 전체 디코딩 종료0, 검은 화면0. 6장면 모두 음성 확인(평균 -18.9~-17.3dB). 0.7초 이상 무음은 마지막53.837초 이후 의도한 약1.694초 여유뿐이다. `final-check.json`, `final-decode.log`, `final-contact.png`에 실제 결과가 있다.
- 제목·본문 자막과 마지막 답까지 실제 합성 프레임을 확인했다. 3D 렌더는 EEVEE64샘플이며 동작 프레임을 생략해 단순 정지 슬라이드로 만들지 않았다.

## 재현

공통 제작 모듈은 `/Users/admin/workSpace/shopshorts-production`의 검증된 모듈을 사용한다. 비밀 값은 소스에 넣지 않는다. 이미 회수한 파일에 `produce.mjs --action import-voice --source-speed 0.98 --voice-input <raw.mp3>`를 적용한 뒤 `--action compose`로 조립했다. 기존 음성을 다시 유료 생성하지 않는다.

현재 결과는 로컬 완성본과 작업 브랜치의 제작 소스다. 운영 제작실 배포·YouTube 게시 완료를 뜻하지 않는다.
