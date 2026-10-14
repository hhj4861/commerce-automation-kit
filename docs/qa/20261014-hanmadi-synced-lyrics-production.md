# Hanmadi 가사 동기화 학습 운영 배포 — 2026-10-14

## 결과

사용자의 “머지하고 배포해줘” 승인에 따라 PR #242를 main에 머지하고 학습자·관리자 앱 모두 운영에 배포했다. DB 자료 게시, 학습 진도 변경, 유료 모델 호출은 하지 않았다.

| 대상 | 승격 PR / 배포 revision | 완료 UTC | 결과 |
|---|---|---|---|
| 학습자 | [#245](https://github.com/hhj4861/commerce-automation-kit/pull/245) / `68521aca1abd669d4e090d1e2973d51f5c6b908b` | 2026-10-14 11:06:28 | [Actions SUCCESS](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38553958136) |
| 관리자 | [#246](https://github.com/hhj4861/commerce-automation-kit/pull/246) / `894e0452fc0935f024cf2ad0d59a2b984397ff91` | 2026-10-14 11:05:58 | [Actions SUCCESS](https://github.com/hhj4861/commerce-automation-kit/actions/runs/38553968397) |

- 구현 [#242](https://github.com/hhj4861/commerce-automation-kit/pull/242): `07e47d2929da7f6228f4f9d8f2aa095c09bed791`, main merge `fed6bad1f8363584d6136d644440584aeee68ad8`.
- 고정 승격 브랜치 `release/hanmadi-synced-lyrics`의 `c4fc4b37cbc93e1345419e5d8bd1b155071f74d2`는 기존 운영 브랜치 이력만 합쳤다. main 소스와 두 배포 merge의 Git tree 모두 `49f35ffc590f17550a32b7c92f76d19be76f4cb9`로 일치.
- #242 CI 2개 PASS. 승격 통합 검사도 GitOps·contract·study 모두 PASS(study 6m53s). 단위 263개·타입·린트·빌드·네 언어 음악 E2E 근거는 구현 문서에 있다.

## 직접 확인

- 두 공개 `/api/deployment` 응답이 각각 위 revision과 앱 이름을 반환했다.
- `verifyLearnerRelease`: 학습 진입점·개인정보처리방침 200, Google 로그인 준비 설정 일치, 비로그인 관리자 API 403 PASS.
- `verifyAdminRelease`: 로그인 페이지 200, 관리자 API 403, 학습 API 404 PASS.
- 영어·일본어·태국어·스페인어 기본 음원 각각 Range 0–1023 요청에 206 / audio/mpeg / 1,024 bytes.
- 로그인된 운영 학습 화면에서 일본어 연습곡의 새 가사 목록·발음·번역 토글이 표시됐다.
- 0.75배속 + 두 번째 줄 구간 듣기: 실제 audio.currentTime 8.22 → 12.41144, readyState 4, media error 없음. 화면에 “2번 줄 재생 중”과 해당 줄 강조를 확인했다.
- 줄 반복을 켜고 구간 안으로 재생 위치가 돌아오는 것을 확인했다. 번역 숨기기/다시 표시, 반복 해제 후 구간 끝 15.820121초에서 일시정지를 확인했다. 속도는 1배로 복구했다.
- 따라 부르기·단어·회화 완료와 저장 버튼은 누르지 않았다. 연습 완료 표시는 0/4 그대로였다. 이 브라우저 탭에서 수집된 console error 0개.

## 한계

- 관리자 운영 PIN 로그인 뒤 시간 편집·저장은 이번 배포 확인에서 실행하지 않았다. 해당 흐름은 로컬/CI E2E에서 검증했으며 운영에서는 버전·로그인·접근 제어를 확인했다.
- 실제 Pretender 가사 원문은 여전히 미등록이다. 이번 배포는 자체 시간 편집·동기화 기능을 제공하며 상용 곡 자료를 자동 확보하지 않는다.
- 배포 전 실제 Pretender 임베드에서 재생 불가가 확인됐고 정확한 원인은 미확정이다. 공식 YouTube API 샘플 영상의 실재생 동기화 PASS와 구분한다.
- 이번 운영 화면 검증은 일본어 연습곡에 한정한다. 네 언어 전체 학습 흐름은 CI E2E, 운영에서는 네 음원 응답까지 확인했다. 전체 서비스 로그를 검색한 결과는 아니다.

## 위치

- [학습자 운영 앱](https://hanmadi-lake.vercel.app/study) → 음악 → 한마디 연습곡.
- [관리자 운영 앱](https://hanmadi-admin.vercel.app/study/admin).
- 증적 폴더: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261014-synced-lyrics/`.
- `production-check.json`: 공개 release 검사·음원 응답. `production-synced-lyrics.jpg`: 실제 운영 줄 강조 화면. 브라우저 직접 iCloud 쓰기 제한으로 캡처만 작은 임시 파일로 저장한 뒤 지정 폴더에 복사·해시 확인하고 임시 사본을 삭제했다.
