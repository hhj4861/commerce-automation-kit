# Mac 제작 워커 이관 패키지

- 목표: Docker를 설치할 수 없는 회사 Mac에서 준비하고 새 개인 Mac에서 실행하는 네이티브 이관 패키지.
- 담당/범위: 현재 Codex. `apps/shopshorts/mac-worker/`와 전용 테스트만 작성. 기존 제작·계정 워커와 운영 상태는 변경하지 않는다.
- 기준: origin/main 57da805. 전체 Blender PR #260·운영 승격 #261은 별도 승인 대기이며 이 패키지가 머지·배포하지 않는다.
- 완료 조건: 인증 없는 소스 ZIP 생성, source commit·SHA 기록, 설치 전 회사 Mac 차단, 안전한 인증 선택, 환경/연결 점검, 기존 워커 종료 후 별도 시작, 변조·비공개 파일 배제 검사.
- 검증: 전용 unittest 7개 통과. 실제 Git 소스 ZIP 생성·압축 해제·전체 SHA 확인·회사 Mac 설치 거부 통과. 기존 운영 의존성을 임시 링크한 패키지의 제작 서비스 import 및 Pretendard 폰트 포함 확인. Bash/Node 구문 검사 통과. 새 개인 Mac의 npm/Python 설치·실제 음성/영상 제작은 아직 수행하지 않았다.
- 산출물: 지정 iCloud `commerce-automation-kit/20261015-mac-worker/`에 ZIP/DMG를 작성한다. 배포할 제작 소스는 전체 Blender PR #260의 8e54c520eb2cb4a5865d3a834a19acad80827d2a이며, 설치 도구 버전은 manifest의 packagerRevision과 각 파일 SHA로 구분한다. 승인 전 운영 반영을 뜻하지 않는다.
- 현재: 패키지 구현·로컬 검증·커밋·푸시 완료, 검토 PR #262 준비: https://github.com/hhj4861/commerce-automation-kit/pull/262 . 회사 Mac의 설치·자동 실행·인증·기존 워커 상태는 변경하지 않았다.
- 전달본: `Shopshorts-Mac-Worker-19c9ffe.dmg` (11,437,792 bytes). hdiutil verify 및 회사 Mac의 `/usr/bin/python3` 차단 검사 통과. SHA256 `6dda023d280e3f691462668b0f47ab8cb4892a301bc18b796cd0252f6131943a`. ZIP 및 검사 상세는 지정 작업 루트의 `20261015-mac-worker/package-verification.json`. 설치 도구 소스는 19c9ffe이며, 이 문서의 이후 갱신은 패키지 코드 변경이 아니다.
- 다음: 개인 Mac에서 설치/연결 점검 → 기존 Mac 실행 작업 종료·워커 중지 → 새 Mac 별도 시작 → 실제 시험 제작. 이 순서의 실제 이관은 아직 미완료.
