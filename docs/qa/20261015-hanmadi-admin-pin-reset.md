# Hanmadi 관리자 PIN 재설정 — 2026-10-15

사용자가 기존 PIN 조회를 요청했으나 Vercel의 Production `TUTOR_PINS`는 `sensitive` 유형이며 공식 단일 변수 조회에서도 값이 반환되지 않았다. 사용자가 이어서 재설정을 승인했다.

## 범위와 적용

- 대상: Vercel `dean-10/hanmadi-admin`, Production `TUTOR_PINS` 한 항목.
- 무작위 10자리 PIN과 로그인 이름 `관리자`로 교체. 기존 값과 이름은 조회할 수 없어 보존 여부를 확인하지 못했다. 로그인 이름 변경에 따른 식별자는 `owner:관리자`다.
- 변수 ID·이름·Production 범위·`sensitive` 보호는 유지했다. 다른 앱 환경변수·서명키·학습 진도·제품 코드는 변경하지 않았다.
- 초기 PATCH는 `key` 필드가 Sensitive 변수에서 금지되어 적용 전 400으로 거부됐다. 이후 `value`만 보낸 PATCH는 2026-10-15T03:13:40Z에 성공했다.
- 새 PIN은 사용자 요청에 따라 대화로 전달했으며 이 문서·Git·작업 산출물에 저장하지 않는다.

## 검증

- 기존 운영 배포 `dpl_8z54UovFqhy12qLXoJTop8993Pyz`의 재배포 `dpl_29Kqp8vjLZjZG5ajyeRnnTSg4xSH`가 Ready가 됐고 두 운영 별칭이 연결됐다.
- 2026-10-15T03:17:04Z 실제 HTTPS `/api/auth` POST에서 새 PIN으로 HTTP 200, `ok=true`, `role=owner` 확인. 세션 쿠키는 프로세스 메모리에서만 사용했다.
- 해당 세션의 `/api/study/admin/music` GET은 HTTP 200. `songs=0`, `collection=0` 확인. 아직 운영에 저장된 수집곡이나 게시곡은 없다.
- Chrome에서는 PIN 입력까지 확인했으나 클릭 제어가 두 방식 모두 응답 시간 초과. 브라우저 화면 로그인 성공으로 세지 않는다.
- 일반 Vercel 재배포는 기존 GitOps가 주입하던 `HANMADI_RELEASE_SHA`를 유지하지 않아 `/api/deployment`의 `revision=null`을 확인했다. 이 상태를 그대로 완료 처리하지 않고 같은 운영 ref `7ef60980a643d9d2ffba3601f6647c729116a29c`의 기존 GitOps를 실행해 복구했다.
- GitOps 실행: https://github.com/hhj4861/commerce-automation-kit/actions/runs/38675577898
- GitOps는 2026-10-15T03:20:24Z에 SUCCESS. 03:21:27Z 최종 운영에서 정확한 application/revision, 새 PIN 로그인 200·owner, 음악 관리자 조회 200을 다시 확인했다. 등록곡·수집 영상은 각 0개였다. 이 시점에 PIN 재설정은 운영 반영·API 검증 완료다.
- 관찰 범위는 GitOps 검사와 실제 로그인·조회 응답이다. Vercel 전체 런타임 오류 로그·Drains·상시 Monitoring 구성은 이번 작업에서 조회하지 않았다.

음악 학습 전체 운영 E2E와 관리자 PIN 재설정 성공은 구분한다. 음악 E2E는 실제 자료 수집·원문 연결·검수·게시 및 검증 계정 학습 확인이 남아 있다.
