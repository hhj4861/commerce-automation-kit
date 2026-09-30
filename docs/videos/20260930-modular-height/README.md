# 레고처럼 쌓는 집, 몇 층까지 가능할까?

사용자가 승인한 모듈러 건축 설명 쇼츠. 실사풍 외관·공장·인양 장면과 직접 작성한 구조 애니메이션을 결합한다. 애플리케이션 기능 변경이 아닌 독립 영상 산출물이다.

- 9:16 / 1080×1920 / 30fps.
- 기존 고정 음성 **Yooni – Natural & Clear**, `atempo=1.15`로 피치 유지 배속.
- 음성 실측에 맞춘 장면 길이, 중앙 2줄 이내 자막, 어두운 녹색·골드 팔레트 유지.
- 실사풍은 Higgsfield Seedance 2.0 / 1080p. 4개 원본 클립 견적 63+72+72+81=288크레딧. 마지막 장면은 도입부 영상 재사용.
- 참고 파일 `KakaoTalk_Video_2026-09-28-14-16-50.mp4`에서 색감·빛·근접/전경 대비만 참고했다. 픽셀·음원·타인 영상 재사용 없음.
- 실사풍은 **AI 재현**이다. 실제 College Road 현장 촬영이나 정확한 외관 복원으로 제시하지 않는다.
- 철골·기초·코어·하중 경로는 **일반 원리 개념도**다. 실제 College Road 구조도, 연결부 제작 지침, 정량 구조 해석 또는 층수 비율이 아니다.
- 50층은 확인된 준공 사례이며 기술적 최대치나 모든 모듈 제품의 성능을 뜻하지 않는다.

## 근거

1. [Tide — College Road](https://tideconstruction.co.uk/projects/college-road/): 완공, 50층, 높이 163m. 최신 세계 최고 여부는 주장하지 않는다.
2. [HTA — Sustainability & Building Physics](https://hta.co.uk/story/college-road-sustainability-and-building-physics): 층별 하중에 따라 모듈의 철골을 조정, 공장 내 마감.
3. [OBR — College Road](https://obrgroup.co.uk/projects/college-road-croydon): 철근콘크리트 코어·하부 구조 시공.
4. [SCI — Modular construction](https://steelconstruction.info/sectors/healthcare-buildings/modular-construction): 구조 방식·모듈 연결·고층 코어 원리.
5. [Vision Volumetric](https://visionvolumetric.co.uk/): 고층 건물의 풍동 검증과 콘크리트 코어·완성 건물에 작용하는 힘 검토.

출처는 2026-09-30에 확인했다. 제조 방식에 대한 일반적인 설명과 이 프로젝트에서 확인한 사실을 구분했다.

## 재현 및 파일

- `brief.json`: 대본, 장면별 생성 프롬프트, 출처.
- `illustrations.mjs`: 직접 그린 모듈·하중·코어 SVG 애니메이션 원본.
- `produce.mjs`: 내레이션 메타데이터 확인, 1.15배속, 프레임 배분, 생성 접수 기록·재개, 자막·배경음 합성.
- `project.json`: 최종 실측 장면 길이와 자막.
- `modular-height.mp4`: 완성 영상. `storyboard.jpg`: 최종 영상의 장면표.
- `verification.json`: 완성 후 실제 검사 결과.

기존 Cloudflare 연동 TTS [실행 36671592754](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36671592754) 성공. 8개 오디오와 메타데이터의 대본·voice ID 일치 확인. 제작 캐시는 `/private/tmp/cak-modular-height-20260930`, 원본 내레이션은 하위 `remote-narration`이다. 자격 증명은 산출물에 저장하지 않는다.

```sh
CAK_ENGINE_ROOT=/Users/admin/workSpace/shopshorts-production node docs/videos/20260930-modular-height/produce.mjs preview
CAK_ENGINE_ROOT=/Users/admin/workSpace/shopshorts-production node docs/videos/20260930-modular-height/produce.mjs cost
CAK_ENGINE_ROOT=/Users/admin/workSpace/shopshorts-production node docs/videos/20260930-modular-height/produce.mjs render
```

캐시가 없으면 유료 미디어 생성이 발생한다. 원격 접수 ID가 불명확하면 중복 실행하지 않는다. YouTube 업로드와 운영 Studio 등록은 이 영상 제작 범위에 포함되지 않는다.

## 검증 상태

- 완성: **69.000초**, 1080×1920, 30fps, 2,070프레임, H.264/AAC, 31,691,636바이트.
- SHA-256: `6301aeca8bd09267be09919c525d82a7721a77c355f12cd5f9fde34a1274f5c0`.
- `ffmpeg -xerror` 전체 영상·오디오 디코드 통과. 최대 음량 -8.4dB, 평균 -18.5dB.
- 대본 자막 28개, 중앙 x=50/y=50, 최대 2줄·줄당 20자. 공백 제외 내레이션 전체와 일치.
- 음성 합계 66.343초. 장면별 남는 시간은 0.320~0.343초로, 임의의 긴 공백 없이 연결했다. TTS 내부의 자연스러운 쉼까지 없앴다는 뜻은 아니다.
- 8장면의 실제 완성 프레임을 시각 검수했다. 구조 애니메이션 3장면은 자막 영역을 제외한 상단 그림에서 2초/5초 프레임 차이를 확인했다.
- 제공자가 도입부에 생성한 불필요한 글자는 상단 70% 영역을 크롭하여 제외했다. 도입/마지막 컷의 원본 해상도보다 확대한 편집이며, 재생성 비용은 발생하지 않았다.
- 공사 장면에서 구조 그림으로 1.4초 디졸브 전환. 마지막 외관 컷은 음성 길이에 맞춰 카메라 움직임을 느리게 재편집하여 정지 화면 연장을 피했다.
- 실제 Higgsfield 새 생성은 4개·288크레딧. 재접수·추가 유료 생성 없음.
- Chrome 재생 검증은 브라우저의 `file:` URL 보안 정책에 의해 차단되어 수행하지 못했다. 정책 우회는 하지 않았다. 사람 청음·STT 전사 검증도 수행하지 않았다.
- 로컬 완성 파일이며 YouTube 발행·운영 Studio 등록은 하지 않았다.
