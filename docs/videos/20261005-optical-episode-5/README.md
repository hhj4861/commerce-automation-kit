# AI의 숨은 기반 5탄 — 광통신

## 작업 카드
- 목표: 질문 → 여러 GPU의 결과 교환 → 구리 연결 한계 → 전기/빛 변환 → 파장 다중화 → CPO → 한계와 일상 영향. 대본 밀도와 눈으로 보는 인과관계 우선.
- 담당: 현재 Codex 단독, worker/Claude OFF. 전용 optical-episode-5 worktree, 기준 f2e7118.
- 범위: 롱폼16:9/Kyle1.0, 숏폼9:16/Kyle1.1. 숏폼은 같은 도입/3D 구조/완결된 다섯 발화 재사용. 신규 유료 영상은 롱폼 도입6초·54크레딧 상한1건.
- 완료 기준: 대표 3D 구간 선검토, 실제 음성 정렬·자막, 완결된 숏폼, 전체 디코딩·음량·긴 무음 검증, 두 최종 MP4를 Downloads/vedio에 저장, 자체 소스 검증·커밋·upstream push.
- 현재: 롱폼355.875초·숏폼39.833초 생성 및 최종 QA 완료. 다음: 사용자 영상 확인.
- 이전 완성본과 운영 앱은 수정하지 않음. 공개 업로드/PR 머지는 이번 요청에 포함되지 않음.

## 사실 검토
story.json에 주장별 공식 근거를 기록. NVIDIA의 제품 장점은 일반 법칙이나 실측값으로 확대하지 않음. 인텔2024 발표는 시연이었다는 상태를 유지. 모든 GPU가 CPO를 장착했다는 표현 없음. 일반적 물리·연결 원리와 비유는 자체 설명이며 신호·파장 색상·크기·속도는 개념화. 광학 연결과 광학 연산을 구분. 일상 영향은 조건부 설명.

## 제작 경로
- 최종: /Users/admin/Downloads/vedio/optical-episode-5-long.mp4 및 optical-episode-5-short.mp4
- 렌더/캐시: /Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261005-optical-episode-5
- 공식 생성 receipt를 보존하고 불명확한 유료 접수를 자동 재시도하지 않음. 인증은 기존 안전한 runner 경로에서 메모리로만 사용.

## 제작 재현
`CAK_ENGINE_ROOT`는 기존 shopshorts-production 경로, `VIDEO_CACHE`는 위 전용 캐시로 지정한다. 인증은 기존 credential runner만 사용한다.

1. `node produce.mjs preflight` → 공식 잔액/비용 확인. 이번 비용54, 사전잔액299.68.
2. 기존 런타임 `node_modules/.bin/tsx produce.mjs tts`, `node produce.mjs generate`, `node produce.mjs poll`. 접수 receipt가 있으면 새 유료 요청을 하지 않는다.
3. `python3 assemble.py plan --cache "$VIDEO_CACHE"`, `python3 assemble.py align --cache "$VIDEO_CACHE"`.
4. Blender4.5 `-b --python scene.py -- --cache "$VIDEO_CACHE" --variant long|short --preview` 대표 검토 후 preview 없이 전체 렌더.
5. **Node24** `motion.mjs "$VIDEO_CACHE"` (HyperFrames는Node22이상 필요). 시스템Node20에서는 실패한 것을 확인하여 기존Node24로 실행했다.
6. `python3 assemble.py assemble --cache "$VIDEO_CACHE" --variant long|short --font-dir "$VIDEO_CACHE/fonts"`, 이어 `verify`.

## 검토 범위
- 전광변환과 WDM/CPO의 원본 3D 대표 프레임, 가로·세로 구도를 선검토했다. 화면의 이동 표시는 데이터 흐름을 설명하는 기호이며 실제 빛의 가시광 촬영/물리 시뮬레이션이 아니다.
- 도입은 Higgsfield 6초1건(b6cd4cd0-6fd2-460b-a28d-ec6f426f90d9); 숏폼 유료 영상 생성0건. 본문은 동일 모형을 세로 화면에 다시 배치한다.
- 숏폼의 다섯 발화는 문장 중간을 잘라내지 않는다. 전체 음성과 같은 원문을 Whisper 강제정렬하고, 별도 ASR로 핵심 구간도 확인한다. ASR 결과는 발음의 완전한 청음 검증과 같지 않다.
- 공간 부족으로 HyperFrames가 중단되어, 해시가 일치한 이전 4탄 완성본과 유료 원본은 보존하고 그 작업의 사용되지 않는 재생성 가능한 중간 MP4 50개(716,420,568bytes)만 정리했다. 확인 기록은 캐시 `qa/cache-cleanup.json`.

## 롱폼 탐색용 챕터
00:00 AI칩끼리 왜 기다릴까?
00:48 여러 칩이 함께 계산하는 방식
01:21 구리 연결의 거리·용량·전력
02:20 전기에서 빛으로, 다시 전기로
03:01 한 광섬유에 여러 통로
03:24 이미 쓰는 광통신과 CPO
04:13 기업 사례와 아직 풀어야 할 문제
05:07 우리의 AI 사용에는 어떤 영향일까?

## 최종 결과
- 롱폼: 1920×1080 / 24fps / 5분55.875초 / Kyle1.0배.
- 숏폼: 1080×1920 / 24fps / 39.833초 / Kyle1.1배.
- 롱폼118개·숏폼16개 자막의 원문 전체 일치, 폭과 타이밍 검증. 마지막 발화 및 자막은 잘리지 않고 끝까지 유지.
- 전체 디코딩 통과. 1.3초 이상 무음0건, 검은 화면0건. 음성/영상 길이 차이0.001초 미만, 최대 음량은 롱폼-1.2dB/숏폼-0.9dB.
- 최종 롱폼24개 장면과 숏폼6개 대표 화면을 표본 검토. 첫 질문 확대, 요약 자막 겹침 제거, 메모리/네트워크·배선 장면 접점 보완을 실제 최종 파일에서 확인했다.
- HyperFrames 요약5초를 두 영상에 실제 합성했다. 도입은 Higgsfield54크레딧1건, 숏폼 추가 유료 영상0건. TTS는24구간을 생성해 양쪽에 재사용했다.
- 검증 세부와 파일SHA-256은 `verification.json`. 연속 전편 수동 감상이나 물리 시뮬레이션 검증으로 보고하지 않는다.

## 웹툰 재제작 — 완료
사용자2026-10-05 요청. 기존 원문·Kyle음성과 자막 정렬 재사용. 새 웹툰 원화·동작·Higgsfield 도입으로 롱/숏 재제작. 기존 3D 완성본 보존. 작업 기준3ee052d. 기본 웹툰 지침은 프로젝트/전역 메모리에 기록; 운영 앱 배포는 범위 밖. 완료 기준: 전광변환·다중파장·CPO의 그림/동작 검토, 두 파일 전체 디코딩·AV/자막 검증, 소스 커밋·push.

### 웹툰 최종 결과
- 롱폼: `/Users/admin/Downloads/vedio/optical-episode-5-webtoon-long.mp4` — 355.875초, Kyle1.0배.
- 숏폼: `/Users/admin/Downloads/vedio/optical-episode-5-webtoon-short.mp4` — 39.833초, Kyle1.1배.
- 기존 3D 완성본 SHA-256은 이전 검증값과 동일. 새 영상의 AAC 음성 데이터도 기존 파일과 완전히 일치한다. TTS 추가 생성0건.
- 새 원화6종은 내장 image_gen으로 생성. 프롬프트는 `webtoon-prompts.json`, 자산 위치와 해시는 `webtoon-verification.json`.
- Higgsfield 웹툰 도입6초1건(54크레딧)을 양쪽에 사용. 접수ID6c738aa8-104a-47d2-9f53-1ded4e759c15.
- GPU 결과 교환, 신호 감쇠/보정, 전기→빛→전기, 파장 다중화, 변환장치 위치 변화와 발열을 별도 그리기 레이어로 움직인다. 기존3D/HyperFrames 마무리 카드는 재사용하지 않고 웹툰 연결 장면에서 완결한다.
- 전체 디코딩 통과, 긴 무음/검은 프레임0건, 롱118개/숏16개 자막 원문 대응·배치·마지막 자막 유지 확인. 롱24장면/숏5장면 최종프레임 표본검토. 연속 전편 청음/감상 검증으로 보고하지 않는다.
- 원본 그림은 가로1672×941. 코드 합성 캔버스1280×720/720×1280을 Lanczos로 최종1080p출력한다. 원본 일러스트·Higgsfield·음성은 캐시에 보존한다.

### 웹툰 재현
`webtoon.py preview|render|verify --cache <20261005-optical-episode-5-webtoon 캐시> --original <20261005-optical-episode-5 캐시> --variant long|short`. `render`는 기존 최종3D 파일의 검증된 음성을 읽기 전용으로 사용한다. 원본 음성을 바꿀 때는 별도 승인된 제작 절차로 원본을 갱신하고 검증한다. 새 도입이 필요한 경우만 `webtoon-produce.mjs preflight|generate|poll`을 사용하며 기존 접수 기록이 있으면 새로 제출하지 않는다. 기본 웹툰 지침은 루트AGENTS/PRODUCTION-STYLE와 전역 메모리에 기록·프로젝트지침push; 운영 웹앱은 변경하지 않았다.
