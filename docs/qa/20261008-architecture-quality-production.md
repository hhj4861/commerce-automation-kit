# 건축학 기본 Blender 품질 운영 반영 — 2026-10-08

사용자 승인: PR #166 머지와 운영 반영. [운영 제작실](https://shopshorts-dash.pages.dev/studio/dashboard?mode=auto)에 배포했다.

## 반영한 버전

- [PR #166](https://github.com/hhj4861/commerce-automation-kit/pull/166): main merge `7c257fe417c0ac9df47501e3b53672985fd5c384`.
- 동일 변경의 운영 승격 [PR #167](https://github.com/hhj4861/commerce-automation-kit/pull/167): deploy/shopshorts merge `cf73676a46f29fd539e45af57767b49c64c5c0fa`. 필수 GitOps 검사 통과, 정상 merge, 보호 우회 없음.
- Pages 배포 성공: https://ee244ee6.shopshorts-dash.pages.dev . 공식 Wrangler 4.143.0, production branch `deploy/shopshorts`, 위 SHA 및 clean 상태로 업로드했다.
- 제작 워커 checkout `/Users/admin/workSpace/shopshorts-production`도 같은 SHA. lockfile 변경 없음. 실행·대기 작업 0건을 확인한 뒤 `com.cak.studio-production`만 정상 종료·갱신·재시작했다. 새 PID 87650, running 상태와 최신 운영 heartbeat 확인.
- 기존 plist는 로컬 비공개 `~/Library/Application Support/Shopshorts/studio-production-before-architecture-20261008.plist`에 백업했다. `SHOPSHORTS_BLENDER_BIN`만 설치된 Blender 4.5.10 경로로 추가했으며 자격 값은 변경·출력·새 클라우드 저장하지 않았다. 소스 복구 기준은 이전 `7e03f5a2e15261c06d09740bab5fb12890260217`, Pages 이전 deployment는 `2196032c-326a-4aa5-92a6-ee544abd0e0a`다.

## 실제 검증

- 운영 architecture-quality.js / hybrid-plan.js / automatic-creation.js가 배포 checkout의 SHA-256과 일치한다. 인증된 HTTP 200으로 확인했다.
- 2026-10-08T13:12:02Z 운영 API에 빈 검증 프로젝트를 생성해 category=건축학, productionStyle=webtoon, architectureQuality=architecture-cycles-v1, narrationSpeed=1.1, task=null 확인. ID `b3a3a168-77f6-4240-ae05-401e7064cb5f`, 제목에 `[운영 검증용]`과 `제작하지 않음`을 표시했다. 시나리오·유료 미디어·TTS·업로드는 실행하지 않았다.
- 워커 heartbeat 2026-10-08T13:11:59Z, webtoon/hybrid=true. 배포 전 audioAccount=ready도 확인했다. 음성 실제 생성 품질 검증을 뜻하지 않는다.
- 운영 checkout과 LaunchAgent 환경으로 건축학 검사 **6/6 pass, skip 0**, 실제 Blender GPU/Cycles/48samples/denoise/1080×1920/24fps/1초 24프레임 렌더·ffprobe·전체 디코딩 통과. 운영 큐 전체 유료 제작을 실행한 검증과 구분한다.
- 증적: 지정 iCloud `gpt 작업/commerce-automation-kit/20261008-architecture-default/production/`의 `blender-production.log`, `render-report.json`, `architecture-default-e2e.mp4`, `api-verification.json`.

## 적용 범위와 남은 별도 문제

새 건축학 프로젝트의 웹툰 구조·단면/명시적 3D는 Blender를 기본 사용한다. 상황·사례 웹툰, 직접 선택한 실사/애니메이션, 기존 프로젝트·완성본은 보존한다. 임의 건물의 정밀 모델이나 물리 해석은 아니며 지원 데이터 도형에 한한 설명용 재구성이다.

GitHub 자동 배포 [37781416366](https://github.com/hhj4861/commerce-automation-kit/actions/runs/37781416366)은 Cloudflare broker 자격 요청 403으로 실패했다. 이번 릴리스는 기존 승인된 공식 Wrangler 로컬 인증으로 배포·검증했으며, CI 토큰·broker 신뢰 설정을 우회하거나 변경하지 않았다. **이번 운영 반영 완료와 GitOps 자동 배포 자격 문제는 별개**다.

완료 훅의 일시 DB 잠금으로 운영 API 검증 한 호출이 실행 전에 차단됐다. 해당 호출은 실행되지 않은 것을 확인하고 정상 훅 경로로 재시도했다. 훅 비활성화·상태 조작은 하지 않았다. LaunchAgent는 Git 밖의 로컬 설정이므로 gate track은 등록 대상 아님을 반환했고, 실제 파일은 별도 백업·plutil 검증·running/heartbeat로 확인했다.
