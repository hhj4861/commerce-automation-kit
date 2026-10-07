# HVDC × AI 롱폼 제작

- 요청: AI와 연결한 HVDC 설명영상. 기본 웹툰, Kyle 정배속, 16:9 1080p.
- 범위/작성자: Codex, 이 폴더의 독립 제작 소스만. 운영 앱 변경/게시 없음.
- 기준: origin/main 985831e; feat/hvdc-ai-longform.
- 완료 기준: 출처검증, 대본 별도검토, Higgsfield6초 ≤54크레딧, 실제 본문 작동 시각검토, TTS·자막·마지막문장 완결, 전체디코딩, 소스커밋/푸시.
- 현재: 23구간 렌더·합본 완료. 전체 디코딩, 대표 프레임·스위치 전환·자막 검토 통과. 작업 브랜치 커밋/푸시 후 전달.
- 최종 영상: /Users/admin/Downloads/vedio/hvdc-ai-longform.mp4
- 캐시: /Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261007-hvdc-ai

## 자료
- https://www.iea.org/reports/energy-and-ai/energy-demand-from-ai — 2025 보고서 기본 시나리오. 데이터센터 전체 전력 소비 전망이며 AI 단독 실적 아님.
- https://www.siemens-energy.com/us/en/home/products-services/product-offerings/high-voltage-direct-current-transmission-solutions.html — 장거리 HVDC·변환소·제어·초기투자와 경제성.
- https://www.eia.gov/analysis/studies/electricity/hvdctransmission/pdf/transmission.pdf — 고전압과 전류·열손실, 교류/직류 송전 비교.
- https://www.hitachi.com/en-us/insights/articles/renewable-energy-transmission-technology-power-ny-homes/ — 긴 케이블의 정전용량성 충전 전류와 HVDC.
- https://www.hitachienergy.com/us/en/news-and-events/features/2024/12/hitachi-energy-strengthens-jeju-island-s-grid-with-south-korea-s-first-vsc-converter-technology-installation — 2024-12-10 준공 발표, 완도-동제주#3 200MW 양방향 VSC. AI용 사업이라는 증거 아님.

## 연출 주의
가상 경로와 제주 실사례는 분리한다. 전류 입자는 에너지/전류의 개념표시이며 전자 이동 속도의 재현이 아니다. 높은 전압의 이점은 교류에도 적용된다. 반응성 전력 교환 전체를 소모 에너지로 그리지 않는다. 손실·설비비용·지역망 병목은 남는다.

## 제작 이력
- 1차 검토: 변환기 작동 예시와 도입 작은 답 부족. 2차: 극성 전환 설명과 중복 도입 개선 요구. 실패 기록은 캐시에 보존.
- 3차 검토: focus/why/mechanism/example/payoff/pacing/visuals 모두 통과. 실제 렌더 품질까지 검증된다는 뜻은 아님.
- 확정 대본: 23구간, Kyle RU7aSi6lT4uQBXMLgDxK / eleven_multilingual_v2 / 1.0배.
- TTS 공식 원격 작업: https://github.com/hhj4861/commerce-automation-kit/actions/runs/37640962300 (success), 23파일의 원문·Voice ID·모델 확인.
- 음성 기준 편집: 408.833333초 / 9,812프레임 / 142자막 / 마지막 발화 뒤 2.732초.
- Higgsfield: Seedance 2.0 1080p 16:9 6초, 공식 조회 견적54크레딧, 조회 당시 잔액334.65. 접수ID 2c07bdf3-d666-404b-a8e0-89e668b5739c. 1회 접수, 다운로드 완료. 다른 세션 사용량을 포함한 잔액 차이를 이 작업 실제 차감으로 단정하지 않음.
- 원화: native imagegen, 별도 OpenAI API 키 사용 없음. 원본 `/Users/admin/.codex/generated_images/01a0b3ac-df1b-7293-a99c-74f3c6e650d0/exec-f3b4f12b-608a-4a61-8eb8-0bf403e79267.png` 보존, 캐시 art/hero.png 사용.
- 원화 프롬프트 요지: fine ink Korean editorial webtoon, detailed AI server hall awaiting grid connection, copper busbars and amber standby lights against cool twilight substation, wide16:9, no text/logo/sparks, lower fifth calm for captions. 실제 도입 영상 프롬프트 전문은 story.json의 openingPrompt.
- 본문: 자체 Blender4.5.10 EEVEE 입체 환경·케이블 층·전기장·스위치·변환소·서버. 24fps, 24samples, 프레임 이미지 대량 캐시 없이 H.264 직접 출력. 물리량·배선은 교육용 단순화이며 엔지니어링 도면/실측영상이 아님.
- 대표 프레임 검토로 서버 과확대, 연속 배선이 스위치를 우회하는 오해, 가려진 레버와 유색 테두리 수정. 실제 스위치5초 시험 렌더 수행.

## 추가 기술 근거
- https://www.ti.com/lit/ug/tiduay6e/tiduay6e.pdf — 전압형 인버터의 4스위치 및 출력 극성 전환. 영상은 이 기초 예와 실제 HVDC 설비를 명시적으로 구분한다.

## 재현
`VIDEO_CACHE`는 위 캐시 경로, `CAK_ENGINE_ROOT=/Users/admin/workSpace/shopshorts-production` (공식 Higgsfield CLI 설치 확인된 런타임).
1. `node produce.mjs review` → 대본 변경 시 반드시 재검토. 승인된 digest와 일치해야 유료생성 허용.
2. `node produce.mjs preflight` / `generate` / `poll`: receipt가 존재하면 재접수하지 않음.
3. `node media.mjs tts-submit` → 공식 GitHub 실행 확인 → `tts-fetch RUN`.
4. `python3 assemble.py align --cache ...` → `plan`.
5. Blender `-b -t 6 --python scene.py -- --cache ... --preview`; 실제 동작 시험 후 전체렌더.
6. `python3 assemble.py assemble --cache ...` → `verify` → `contact`; 대표 프레임과 핵심 작동/자막을 별도로 검토.

현재 운영 웹앱·YouTube에는 게시하지 않았으며 기존 완성 영상은 변경하지 않았다.

- 보드 원화: native imagegen `exec-b00505b6-10b9-4dbc-b929-d70e8c97e970.png`, 캐시 art/board.png. 서버 전원→전원부→칩의 그림과 이동하는 광점을 chip/ending에 삽입. 실제 제품 회로가 아닌 개념 일러스트.
- 재작업: 전체 렌더 전환 시 레버 노출·색 테두리 수정 후 한 차례 재시작. 이전 본인 렌더/편집 프로세스 종료(143) 확인, v2 로그 사용. 파형 0 기준선과 짧은 자막(52px/142개) 검토.

## 최종 검증 · 2026-10-08
- 1920×1080 / 24fps / 408.833초 / 159,437,071바이트. 전체 디코딩 오류 없음, 검은 화면 구간 없음.
- 음성 최대 -1.2dB, 1.5초 이상 무음은 종료 여유 구간 약2.98초만. 마지막 음성 파일 뒤 2.732초 보존. Kyle 1.0배.
- 23구간 접촉시트와 도입·케이블·파형·3개 스위치 상태·AI칩·제주·407.5초 종료 화면 검토. 모든 프레임의 수동 시청 또는 전체 음성 청음을 주장하지 않음.
- 자막142개, 시간 겹침0. 연도·용량 표시는 숫자로 정규화. SRT는 영상 옆 hvdc-ai-longform.ko.srt.
- 썸네일: /Users/admin/Downloads/vedio/hvdc-ai-thumbnail.png. native imagegen, 원본 exec-bc519640-4d8b-4590-9cda-edf9f579506d.png 보존.
- SHA256: 0545126d8d051253be3047e900d1e51e2f5dc64fcfc72ddf0fce23e897e4b2c5
- 렌더·편집·검증 프로세스 종료코드0 확인. 본인 Blender 읽기전용 마운트 disk4 해제.
- 재현시 board.py를 실행해 board-motion.mp4를 만든 뒤 assemble을 실행한다. 영상은 교육용 도식·원화·생성 도입의 조합이며 실물 촬영 또는 완전한 설비 모델이 아니다.
