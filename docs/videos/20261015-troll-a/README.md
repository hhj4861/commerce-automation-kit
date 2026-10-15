# 트롤 A — 바다에 띄워 옮긴 콘크리트 구조물

신규 건축 쇼츠 「472m 구조물을 바다에 띄웠다고?」. 벨루베메르 수로교는 사용자의 제작 이력 확인으로 제외했다. 이번 요청은 도입부터 전체 Blender 3D다.

- 제작: Kyle `RU7aSi6lT4uQBXMLgDxK`, 1.1배. Pretendard SemiBold·차콜 자막·민트 헤더. Higgsfield 호출 0건.
- 범위: 새 로컬 영상과 재현 가능한 제작 소스. 공개 업로드·운영 웹앱 변경 제외.
- 소유: Codex 직접, workers/Claude OFF. `feat/troll-a-3d-short`, 기준 origin/main `6611970`.
- 중복 확인: 현재 docs 및 연결 worktree 문서에서 동일 대상·핵심 원리의 제작 기록을 발견하지 못했다. 완성 파일 전수 대조는 하지 못했다.
- 설명: 같은 시설을 따라 부유→예인→밸러스트 주입→해저 지지. 실사 기록이 아닌 설명용 3D 재현이며, 단면 구획·배관·화살표는 실제 설계도와 구분한다.
- 자료: `story.json`의 Norwegian Petroleum Museum 이동 기록, NDLA의 Condeep 설명, Equinor·Aker Solutions 자료.

## 검증 — 2026-10-15

- 자료 검토는 첫 실패 후 Troll A 적용 근거를 보강해 통과했다. 별도 대본 검토는 이유·부력 평형·설계 한계와 시간 합계를 보완한 exact-input 7개 항목을 통과했다. 실패를 수동 합격 처리하지 않았다.
- 실제 Kyle 음성에 맞춘 총 길이는 마지막 여유 포함 **56.9167초**다. 75초 초안의 대사를 생략하거나 추가 배속하지 않았다. 마지막 음성 뒤에는 1.5초 이상 남긴다.
- 음성 7개 생성·정렬 완료. 최소 전사 일치율 0.8793, 공통 전체 0.8·구문별 0.65 기준 유지. Whisper의 `472m`를 같은 발음인 `사백칠십이 미터`로 정규화하고 측정 시각을 보존했다. 이 차이 때문에 유료 음성을 재생성하지 않았다.
- 실제 객체 42개 시점 검사: 직립 유지, 구획 수위 범위, 해저 안착 통과. 단정밀도 좌표 오차 7.63e-7, 허용 1e-5 이내. 구조 안전 해석을 뜻하지 않는다.
- 1080×1920 실제 렌더 비교 후 EEVEE 광선추적을 사용했다. 핵심 밸러스트 9.25초는 128 samples, 나머지는 실제 비교한 64 samples다. 운영 건축 렌더 기본값은 바꾸지 않았다.
- 자막 24개를 실제 폰트로 검사해 두 줄 이내·화면 경계 내 배치 확인. 도입 자막은 기초를 피하도록 86%, 본문은 기본 74% 위치다.
- 부력 화살표 잘림을 발견해 해당 장면만 35mm 화각으로 보완했다. 실제 카메라의 시작·중간·끝 5개 시점에서 모든 화살표가 화면 안에 있는지 검증했다.
- 교체 장면까지 모든 렌더·합성 종료 코드 0 확인. 최종 7개 장면의 해시·프레임 수·24fps·1080×1920 확인. 총 1,366프레임이다.

## 재현

`produce.mjs --runtime <동일 제작 모듈 checkout> --work <지정 iCloud 작업 폴더> --action review|voice|compose`를 사용한다. `voice`는 exact-input 검토 통과를 요구하고 기존 유료 음성 완료 영수증을 재사용한다. 비밀값은 Cloudflare 실행기 연결을 통해 프로세스에만 주입한다.

Blender 실행 시 `--python render.py -- --out <작업>/render128 --timeline <작업>/timeline.json --shot ballast --engine EEVEE --samples 128 --percent 100`, 나머지는 별도 `render64` 폴더에 `--shot hook,harbour,buoyancy,tow,foundation,payoff --samples 64`로 렌더한다. 최종 합성은 `produce.mjs --action compose --render-dir <작업>/render64 --secondary-render-dir <작업>/render128 --out /Users/admin/Downloads/vedio/troll-a-blender-short.mp4`다. 원본 소스·대사·렌더 설정 변경 시 기존 검토/캐시가 그대로 유효하다고 가정하지 않는다.

중간 산출물과 검증 증거는 지정 iCloud 루트의 `commerce-automation-kit/20261015-troll-a/`에 저장한다. 최종 파일은 `/Users/admin/Downloads/vedio/troll-a-blender-short.mp4`에 실제 저장 완료했다.

## 최종 검사

- 실제 MP4 길이 **56.985초**, H.264 1080×1920/24fps, AAC 48kHz 모노, 13,688,462바이트.
- 전체 디코딩 종료 0, 검은 화면 없음. 7개 장면 모두 음성 검출(평균 -18.5~-16.7dB). 0.7초 이상 무음은 마지막 55.295초부터의 의도한 약 1.7초 여유뿐이다.
- 도입·부력·물 주입·해저 안착·기초·마지막 자막·최종 화면을 실제 추출 이미지로 확인했다.
- 검증 파일: iCloud 작업 폴더의 `render-verification.json`, `caption-preflight.json`, `arrow-framing-check.json`, `final-probe.json`, `final-decode.log`, `final-qa.json`.
- 최종 SHA-256: `35d72f14a0f8e74595ffe75869aaa410b29cdfbd8a156ec80fd8d011c2414b18`.
- 완성 영상의 로컬 저장까지 완료했다. 공개 업로드나 운영 제작실 배포는 수행하지 않았다.
