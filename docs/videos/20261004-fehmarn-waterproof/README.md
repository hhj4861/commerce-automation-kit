# 페마른벨트 해저터널 — 연결부의 물은 어디로 갈까?

사용자가 최신 실제 사례로 선정·제작을 승인한 건축/토목 쇼츠다. 확정 파일 길이는 실제 음성 기준 41.25초, 1080×1920, 24fps. Kyle `RU7aSi6lT4uQBXMLgDxK`, 1.1배속. 전체 디코드·A/V 길이·자막 폭/시각·검은 화면·긴 무음 검사를 통과했다. 대표 10개 시점과 보정 후 첫 질문·수압·마무리 프레임을 확인했다. 최종 해시와 상세 검증은 verification.json에 기록했다.

## 설명 구조

첫 질문 → 현재 덴마크·독일 사이 공사 → 217m 조각 운반 → 임시 차단벽 → 벽 사이의 물 → 연결 공간 배수 → 수압으로 패킹 압착 → 추가 방수·검사 후 통로 연결 → 완결된 답.

첫 0–3초 질문 자막, 첫 6초 Higgsfield, 이후 자체 3D 단면을 사용한다. 8구간을 음성 길이에 맞췄고 시간을 채우기 위한 공백·강제 배속 변경은 하지 않는다. 6구간 초안이 약 30초로 짧아 두 구간을 보강했으며, 원래 6구간 음성은 그대로 재사용했다. 최종 컷을 문장 중간에서 자르지 않는다. 글씨 판 대신 같은 모형의 물·패킹·차단벽 상태 변화를 따라간다.

## 검증한 사실과 생략

- 2026-09-28 사업 주체 발표: 네 번째 침매 구조물 설치, 약 900m 연결. 전체 18km 터널은 공사 중이다. 이 영상을 완공·개통 장면으로 표시하지 않는다.
- 운반 전 양 끝을 임시 방수벽으로 막는다. 연결부를 밀폐하고 두 방수벽 사이의 물을 빼면 외부 수압으로 구조물을 밀착시킨다. 터널 전체를 물로 채웠다가 빼는 것으로 설명하지 않는다.
- Trelleborg 자료로 Gina/Omega 씰의 이 프로젝트 적용을 확인했다. 영상은 접합의 핵심 원리만 다루며, 추가 씰·구조 연결·검사 과정을 생략한 시공 지침이 아니다. 임시 벽 철거 장면에 ‘추가 방수·검사 후’를 명시한다.
- 원래 여러 통로를 단일 통로 종단면으로 단순화했다. 주황색은 패킹 식별용, 화살표와 물 입자는 설명용이다. 실제 촬영·측량 복원·유체 시뮬레이션이 아니다.

출처:
- https://femern.com/press/news/the-fehmarnbelt-tunnel-is-approaching-its-first-kilometre/
- https://femern.com/the-construction/building-the-tunnel
- https://www.trelleborg.com/de-de/medien/nachrichten-zu-produkten-und-losungen/tailor-made-sealing-systems-for-the-fehmarnbelt-immersed-tunnel

## 생성 기록

- Higgsfield Seedance 2.0 std / 1080p / 9:16 / 6초 / 생성 오디오 없음.
- 작업 ID `9563f93c-cb49-4a7d-8f32-ea09cfa30c2a`, 다운로드 성공. 생성 1회, 재생성 0회.
- 비용 조회 54크레딧, 잔액 901.1 → 847.1로 차감 확인. TTS 사용량은 별도다. 요금제·결제 변경 없음.
- TTS 기본 6구간: https://github.com/hhj4861/commerce-automation-kit/actions/runs/37202524125
- TTS 보강 2구간: https://github.com/hhj4861/commerce-automation-kit/actions/runs/37202870586
- 첫 요청의 6개 음성과 보강 요청의 2개 음성만 사용한다. 재현 시 새 TTS를 요청하지 말고 보존한 artifact를 사용한다.
- 폰트: Pretendard SemiBold, 공식 저장소 공개 폰트. 폰트 파일과 OFL 라이선스는 작업 자산의 fonts에 보관한다.

## 재현

`VIDEO_CACHE`는 `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261004-fehmarn-waterproof`, `CAK_ENGINE_ROOT`는 검증된 Shopshorts 엔진 checkout으로 지정한다. 인증은 기존 로컬 보안 키/Cloudflare를 사용하며 소스·클라우드 자산에 비밀을 복사하지 않는다.

1. `produce.mjs balance|cost`로 비용 조회. `generate`는 같은 media-receipts.json의 ID를 재사용한다. 불명확한 접수는 자동 재제출하지 않는다.
2. 기존 두 TTS run의 narration artifact를 각각 remote-narration, extra-narration으로 회수한다. 보강 beat-00/01의 MP3와 JSON만 remote-narration의 beat-06/07로 복사한다. brief.scenes는 원본 순서, shortIds는 최종 재생 순서다.
3. `assemble.py plan --cache ...`로 실제 음성 길이를 계산하고 `align.py --cache ... --model-dir ...`로 원문 자막을 정렬한다. 30초 초과 단일 발화는 분할 필요 오류로 중단한다.
4. Blender 4.5에서 `scene.py -- --cache ... --preview`로 대표 프레임을 먼저 확인한다. 전체 렌더는 --preview를 제거한다. 기존 파일은 보존하며 --force는 본인 파일을 명시적으로 다시 렌더할 때만 사용한다.
5. `assemble.py assemble --cache ... --font-dir .../fonts`, 이어서 `assemble.py verify --cache ...`로 전체 디코드·A/V·검은 화면·긴 무음·해시를 검증한다. 독립 음성 전사와 실제 자막/동작 프레임을 별도 확인한다.

완성 경로: `/Users/admin/Downloads/vedio/fehmarnbelt-waterproof-short.mp4`. 기존 영상·웹 제작실·운영 설정은 수정하지 않는다. YouTube 업로드·공개 발행은 수행하지 않는다.
