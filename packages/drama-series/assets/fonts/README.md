# 드라마 자막 폰트 원본

`~/Downloads/vedio`는 디스크 정리로 지워질 수 있어 재사용 원본은 저장소에 둔다.

## 출처와 바이트 확인

아래 값은 `git hash-object <파일>`로 확인한 Git blob SHA-1이다. 파일은 수정 없이 복사했다.

| 파일 | 출처 저장소·버전·경로 | blob |
|---|---|---|
| `Pretendard-SemiBold.otf` | `orioncactus/pretendard`, tag `v1.3.9`, `packages/pretendard/dist/public/static/Pretendard-SemiBold.otf` | `e7e36abc474796c8b6c383380ddd9f87655682ec` |
| `Pretendard-ExtraBold.otf` | `orioncactus/pretendard`, tag `v1.3.9`, `packages/pretendard/dist/public/static/Pretendard-ExtraBold.otf` | `388f3ca4ee6e949cd4e7aa25cd0a5995c2a90f70` |
| `LICENSE-Pretendard.txt` | `orioncactus/pretendard`, tag `v1.3.9`, `packages/pretendard/dist/LICENSE.txt` | `497b88f9fa7623ba9f8fdac86b43dec5621984ed` |
| `BlackHanSans-Regular.ttf` | `hhj4861/commerce-automation-kit`, commit `371876d`, `apps/shopshorts/public/BlackHanSans-Regular.ttf` | `e0d7584294610df5ca721096e03a5c0b1dd2894e` |
| `OFL-BlackHanSans.txt` | `hhj4861/commerce-automation-kit`, commit `371876d`, `apps/shopshorts/public/font-licenses/blackhansans-OFL.txt` | `b403e7c7df6448d4476d0e99a77de911c8d4fa23` |

Pretendard는 오케스트레이터가 준비한 `v1.3.9` 원본을 사용했다. Black Han Sans의 라이선스 원문은 상위 저장소 `zesstype/Black-Han-Sans`를 가리킨다. 이번 반입의 직접 출처는 위 commerce 기존 파일이며, 그 파일의 상위 tag는 확인하지 않았다. shopshorts 원본은 변경하지 않았다.

두 폰트의 라이선스는 **SIL Open Font License 1.1**이다. 조건은 [Pretendard 원문](LICENSE-Pretendard.txt)과 [Black Han Sans 원문](OFL-BlackHanSans.txt)을 따른다. Pretendard 원문에는 Reserved Font Name `Pretendard`가 명시되어 있다.

## 파일럿 역할별 사용

`docs/videos/20261006-regression-pilot/shorts-style.json`에서 다음과 같이 사용한다.

| 역할 | 파일 |
|---|---|
| title — 고정 제목 | `BlackHanSans-Regular.ttf` |
| kicker — 제목 위 머리글 | `Pretendard-SemiBold.otf` |
| subtitle — 대사 자막 | `Pretendard-ExtraBold.otf` |
| caption — 장면 자막 | `Pretendard-SemiBold.otf` |

style의 상대 `fontFile`은 style 파일의 폴더를 기준으로 CLI에서 해석한다. 기본 `--font`에는 저장소 루트 실행 기준 `packages/drama-series/assets/fonts/Pretendard-SemiBold.otf`를 사용할 수 있다. 조립 어댑터는 전달받은 기본 폰트와 지정된 역할별 폰트(label 포함)를 ffprobe/ffmpeg 호출이나 출력 생성 전에 일반 파일인지 검사한다. 폰트 내부 형식 검증은 ffmpeg가 담당한다.
