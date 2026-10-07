# 이 공연장, 스프링 위에 있다고?

새 건축학 웹툰 영상. 이전 벨뤼베이메르 영상은 수정하지 않았다. 사용자의 “내용을 압축하지 말고 시작–연결–종료를 자연스럽게” 요청에 맞춘 별도 제작이다.

## 완성본

- `/Users/admin/Downloads/vedio/elbphilharmonie-webtoon-short.mp4`
- 75.833초, 1080×1920, 24fps, 1,820프레임, 약20.1MB.
- Kyle `RU7aSi6lT4uQBXMLgDxK`, ElevenLabs multilingual v2, 기존 선택1.1배. 신규 내레이션6클립만 생성하고 재편집에는 캐시를 사용했다.
- Pretendard SemiBold50px, 최대2줄,21개 문장 중심 자막. 문장 끝에서 끊고 다음 문장의 시작을 앞 자막에 섞지 않는다.
- Higgsfield Seedance2.0 도입6초, 견적54크레딧의1회 생성. 생성전 잔액195.9. 새 결제·요금제 변경 없음. 접수ID와 실제 완료상태는 verification.json.
- YouTube 업로드 및 운영 Shopshorts 배포는 하지 않았다. 이번 소스는 독립 영상 제작용이다.

## 이야기와 종료 개선

스프링 위 공연장 질문 → 항구 소음이 구조를 타는 문제 → 독립된 안쪽 방 → 같은 바닥을 입력한 단단한 받침/스프링 비교 → 설계 조건과 공기음의 구분 → 관객의 작은 연주 경험 → 첫 질문에 대한 답으로 끝난다.

고정45초에 맞추지 않고 실제 TTS 샘플 길이로 장면을 정한다. 인과 설명·비교 예시·한계·결말을 유지했다. 각 음성 뒤0.28초 연결 여유, 마지막 음성파일 종료 뒤2.717초의 여유를 둔다. 그중 끝0.6초만 페이드해 발화 후2초 이상 온전한 결과 화면을 유지한다. 마지막 자막은 완결된 한 문장 전체를 페이드 직전까지 유지한다. 첫 질문과 다른 새 떡밥으로 마감하지 않는다.

## 사실과 표현

- 공연장 공식 설명: https://www.elbphilharmonie.de/en/mediatheque/the-acoustics-at-the-elbphilharmonie/221
- 방진장치 공급사 GERB: https://www.gerb.com/protecting-elbphilharmonie-from-sound-transmissions/
- 설계자: https://www.herzogdemeuron.com/projects/230-elbphilharmonie-hamburg/

대공연장의362는 스프링 **묶음** 수다. 전체 외부 건물이 아니라 내부 공연장 구조를 탄성 지지한다. 효과는 하중과 진동 주파수·설계에 따른다. 스프링이 에너지를 전부 소멸시키거나 모든 소음을0으로 만든다고 설명하지 않는다. 공기음 차음과 구조 전달 진동의 분리를 구분한다. 단면·스프링 배치·변위·파형은 설명용 재구성이고 실제 도면/실측 진동이 아니다. 공급사의 절대적 차단 표현도 영상에서는 “줄인다”로 한정했다.

## 제작과 검증

첫 별도 대본검토에서 실제 작동 과정·예시·초반 시각질문 누락이 발견되어 불합격했다. 받침의 변형과 방의 관성을 내레이션에 넣고 첫 프레임부터 단면/질문을 보이도록 보완했다. 두 번째 검토7항목 모두 합격한 뒤 유료생성을 진행했다. review digest 및 인용 근거는 verification.json에 보존했다.

최종 전체디코딩, 음성/영상길이, 모든 대사 자막포함, 최대2줄자막,6장면, 마지막발화 후2.717초 여유 검사 통과. 실제 도입6시점과 최종10시점 접촉시트를 확인했다. 독립 Whisper 전사에서 원리 설명과 마지막 문장을 회수했다. 고유명사/기술용어 전사오류가 있으므로 완벽한 발음·청음확인으로 보고하지 않는다. 조회수/시청자 흥미는 아직 미검증이다.

로컬 ElevenLabs 인증서 오류를 우회하거나 TLS검증을 끄지 않았다. 기존main의 `tts-remote.yml`과 Cloudflare 시크릿 브로커를 이용해 정상원격API호출한 결과다. run: https://github.com/hhj4861/commerce-automation-kit/actions/runs/37575640693

## 소스와 자산

- `story.json`: 승인범위 내 신규 대본·화면계획·공식근거·Higgsfield프롬프트.
- `produce.mjs`: 별도 대본검토와 공식 Higgsfield/TTS어댑터. 검토불합격이면 유료생성 금지, 불명확한 접수 자동재시도 금지.
- `render.py`: 스프링 상대변형/관성 비교모션, 실제 음성길이 기반 타임라인, 문장별자막, 종료여유, MP4검증.
- 캐시: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261007-elbphilharmonie`. 원화·도입·음성·검토·alignment·qa·로그 저장. 인증정보는 저장하지 않는다.
- 이미지 생성은 내장 imagegen을 사용했다. 외부영상 다운로드/재사용 없음. 첫 내부 원화에 잘못 생긴 외부 전망 유리창은 사용하지 않고, 완전히 닫힌 흡음패널 벽으로 수정한 원화만 사용했다.

원화 프롬프트:9:16 함부르크 엘프필하모니의 붉은 벽돌기단과 물결모양 파란유리 외관, 중앙 부분단면으로 분리된 따뜻한 공연장·그 아래 스프링묶음, 어두운 틈과 이중구조, 섬세한 웹툰선·수채질감·앰버/청록대비, 글자·전체건물 떠오름 없음. 최종 `art/hero.png`.

내부 프롬프트:9:16 관객석에서 본 중앙무대의 바이올린연주자, 포도밭형 테라스 객석과 크림색 음향패널, 따뜻한 조명과 어두운청록그림자, 섬세한웹툰선,글자없음. 수정프롬프트:연주자·객석·구도·조명유지,외부전망유리창만 창없는 연속크림색 음향패널로 교체. 최종 `art/interior.png`.

## 재현

`VIDEO_CACHE`를 위캐시로, `CAK_ENGINE_ROOT=/Users/admin/workSpace/shopshorts-production`으로 지정하고 `node produce.mjs review|preflight|generate|poll`. generate는 신규캐시에 비용이 발생한다. 내레이션은 검토합격 후 story.scenes를 beats의index/role/narration/durationSec으로 매핑한JSON을base64로 만들어 기존 `tts-remote.yml` main에 `script_b64`, `voice_id`, `verify_secrets_only=false`로1회 전달했다. narration아티팩트를 회수한뒤 대본/voiceId/modelId 일치를 검증해voice/<scene-id>.mp3로 매핑한다. 이미접수된요청은 재전송하지 않는다.

`python3 render.py align|plan|preview|render|verify --cache <cache>` 순서. ffmpeg, Pillow, numpy, Whisper base 사용. Pretendard와 Whisper모델은 기존지정캐시를 재사용. 프레임은 encoder로 스트리밍해대용량프레임캐시를 만들지 않는다. 완성본은Downloads/vedio,중간파일은iCloud. 기존영상은덮어쓰지 않는다.
