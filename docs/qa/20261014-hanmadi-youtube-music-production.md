# Hanmadi YouTube 음악 수집 운영 배포 — 2026-10-14

## 결과

사용자의 “머지하고 배포해줘” 승인에 따라 PR #249를 main에 머지하고 관리자·학습자 앱에 운영 배포했다. 운영 설정·자격은 변경하지 않았고 학습 자료를 게시하거나 사용자 진도를 변경하지 않았다.

사용 위치: [관리자](https://hanmadi-admin.vercel.app/study/admin) → 음악 관리 → YouTube 음악 수집함. 영상 검색/주소 등록, 공식 플레이어, 자막 파일 보관, 학습 원문 등록을 제공한다. 자막 자동 가져오기는 별도 채널 OAuth와 해당 영상의 편집 권한이 필요하다.

| 대상 | 승격 PR / 운영 revision | Actions 완료 UTC | 결과 |
|---|---|---|---|
| 학습자 | [#251](https://github.com/hhj4861/commerce-automation-kit/pull/251) / `9d6a22205e5f5f50476f495c77b075ff8b2901cf` | 2026-10-14 14:05:49 | [SUCCESS](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38577149600) |
| 관리자 | [#252](https://github.com/hhj4861/commerce-automation-kit/pull/252) / `7c6dd3cbd4174bbcc1a289fd79daa520fc0d7928` | 2026-10-14 14:06:02 | [SUCCESS](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38577164931) |

- 구현 [#249](https://github.com/hhj4861/commerce-automation-kit/pull/249): `27e599169bef365fb61a2b51c90c14d209f86115`; main merge `8665b0c1187f779cf1689148e193b2ea364b5c5a` (13:54:08Z).
- `release/hanmadi-youtube-collection`의 `efd97027104d7d67356fcd5298cf7d650f6af8e4`는 기존 운영 이력만 합쳤다. main·release·두 배포 merge의 전체 Git tree가 `b3c96086261b51bc72cb536b6d025735520fe78a`로 일치했다. 앱 소스는 구현 CI 통과 커밋과 일치한다.

## 검증

- 구현 검증: 단위 275개·전체 타입·린트·Next 빌드, 새 음악 수집 E2E와 기존 owned-music E2E PASS. 구현 [study CI](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38573829689) 및 GitOps CI PASS.
- 승격 통합: 로컬 GitOps 단위 39개 PASS. [study 7분 32초](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38575951842) 및 [GitOps 19초](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38575951441) PASS. 배포 워크플로도 각 앱 테스트·원격 운영 빌드·공개 버전 검사를 통과했다.
- 14:08:17Z 시작한 직접 운영 검사에서 두 `/api/deployment`가 표의 revision과 앱 이름을 반환했다.
- 학습자 release 검사: `/study`, `/privacy` 200, Google 로그인 준비 설정 일치, 비로그인 관리자 API 403.
- 관리자 release 검사: `/admin-login` 200, 비로그인 관리자 API 403, 학습 API 404.
- 두 앱 `/api/study/admin/music`가 비로그인 요청에 403을 반환했다.
- 실제 Chrome에서 새 배포의 관리자 PIN 로그인 화면을 확인했다.
- 첫 보조 점검은 존재하지 않는 `/api/study/admin/youtube`에 403을 잘못 기대해 404에서 중단됐다. 코드의 실제 경로 `/api/study/admin/music`만 대상으로 수정한 읽기 전용 검사를 다시 실행해 위 결과를 기록했다. 서비스 수정이나 우회는 없었다.

## 확인 범위와 남은 설정

- 관리자 운영 PIN을 입력하지 않았으므로 운영 로그인 뒤 수집·자막 저장은 미실행이다. 해당 기능은 실제 Next/API/저장소를 사용하는 로컬·CI E2E로 검증했다. 그 시험의 YouTube HTTP와 플레이어는 fixture이며 실제 YouTube 자막 확보 증거가 아니다.
- 이번 배포에서 `YOUTUBE_CAPTIONS_*` OAuth 자격을 발급하거나 운영에 주입하지 않았다. 공식 자막 실호출은 연결된 채널의 편집 가능한 검증용 영상으로 별도 확인해야 한다. TXT/SRT/VTT/LRC 입력 경로를 함께 제공한다.
- 임의 공개 곡의 자막·MP3를 추출하지 않는다. Pretender 가사 원문 확보·게시 완료로 보고하지 않는다.
- 이번 운영 검사는 버전·로그인 진입·접근 제어에 한정하며 전체 서비스 오류 로그 검사나 운영 전체 E2E를 뜻하지 않는다.

## 증적

- `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261014-youtube-music-deployment/`
- `production-check.json`: 두 운영 버전·release 검사·음악 API 접근 제어 결과.
- `promotion-checks.log`, `deploy-38577149600.log`, `deploy-38577164931.log`: CI/배포 관찰.
- 구현 시험 산출물은 같은 프로젝트의 `20261014-youtube-music-collection/`에 있다.
