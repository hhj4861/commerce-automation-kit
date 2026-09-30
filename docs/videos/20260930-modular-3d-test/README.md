# 모듈러 건축 — 3D 방식 테스트

2026-09-30 사용자 요청: 제작 방식을 **3D 방식**이라고 명명하고 방법 저장·실제 테스트.

## 구성

- 약 17초 세로 테스트: 모듈 조립 → 방 외장 분리 → 보·기둥을 따라 내려가는 힘 강조.
- 모든 건물·가구·재질·조명·카메라를 `scene.py`에서 생성한다. Blender의 실제 3D 렌더이며, 생성형 영상 AI나 외부 모델·텍스처를 사용하지 않는다.
- 기존 모듈러 영상의 s1+s4 내레이션·배경음을 재사용한다. 고정 Yooni 음성, 1.15배속. 개선한 중앙 자막 유지.
- 건물은 9개 층으로 축약한 **일반 원리 모형**이다. 50층 사례인 College Road의 실제 외관·구조·층수 비례나 구조해석을 재현하지 않는다. 영상에도 이를 표기한다.
- 대본 근거는 [원본 README](../20260930-modular-height/README.md)의 공식 출처를 따른다. 50층은 사례이며 보편적 한계라는 주장을 하지 않는다.
- 추가 영상/TTS 유료 호출 0회. 공개 게시·운영 Studio 배포 없음.

## 재현

공식 Blender 4.5.10 macOS ARM64 배포본 SHA-256: `cf3076fd531e74713f858830b558e71ffae7b26f104608c5c2cb2fc123535f16`. 공식 체크섬과 대조 후 사용. 시스템 보안 설정이나 기존 앱을 변경하지 않는다.

이번 실행 파일은 읽기 전용으로 연결한 `/private/tmp/cak-blender-mount/Blender.app/Contents/MacOS/Blender`다. 아래 `blender`는 설치된 실행 파일의 경로로 바꾼다. 렌더 후 임시 디스크 연결을 해제하므로 이 경로가 영구 설치된 것으로 가정하지 않는다. [공식 배포 폴더](https://download.blender.org/release/Blender4.5/)에서 동일 버전과 체크섬을 확인할 수 있다.

```sh
blender -b -t 6 --python-exit-code 1 --python docs/videos/20260930-modular-3d-test/scene.py -- --preview "/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20260930-modular-3d-test"
blender -b -t 6 --python-exit-code 1 --python docs/videos/20260930-modular-3d-test/scene.py -- --render "/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20260930-modular-3d-test"
python3 docs/videos/20260930-modular-3d-test/assemble.py "/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20260930-modular-3d-test"
```

`scene.py`는 카메라/모델/조립 애니메이션 원본, `assemble.py`는 자막·기존 음성 합성 및 디코드 검증이다. 프레임은 임시 캐시에 저장한다. 자막은 macOS 시스템 글꼴 Apple SD Gothic Neo를 사용하며 폰트 파일은 재배포하지 않는다.

재사용 지침: [3D 방식](../../video-methods/3d.md). 실측 결과는 `verification.json`, 최종 영상은 `modular-3d-test.mp4`, 장면표는 `preview.jpg`에 기록한다. 실제 렌더·조립·전체 디코드 검증 완료: 1080×1920, 30fps, 504프레임, 16.8초, AAC 음성. 음성 레벨은 평균 -18.5dB, 최대 -8.7dB로 무음/클리핑이 없음을 확인했다. 장면표를 눈으로 확인했으며, 건축 정확도를 보증하는 구조해석 자료가 아닌 연출 테스트다.

초기 렌더는 디스크 부족으로 420프레임에서 중단됐다. 재생성 가능한 캐시를 정리하고 지정된 iCloud 폴더로 렌더 캐시 426개 파일을 SHA-256 대조 후 이동했다. 남은 프레임을 이어 렌더하고 최종 504프레임을 검증했다. iCloud 원격 동기화 완료 여부는 확인하지 않았다.
