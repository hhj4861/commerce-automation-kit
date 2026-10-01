# Hanmadi Admin 운영 배포 검증 — 2026-10-01

관리자 앱의 첫 GitOps 운영 배포와 소유자 로그인·자료 조회 검증을 완료했다.

- 운영 주소: https://hanmadi-admin.vercel.app
- 기존 학습 앱: https://hanmadi-lake.vercel.app
- 흐름: 승인된 기능 PR → main → 승인된 승격 PR → deploy/hanmadi-admin → GitHub Actions → Cloudflare 자격 broker → Vercel hanmadi-admin
- 수정 PR: https://github.com/hhj4861/commerce-automation-kit/pull/96
- 운영 승격 PR: https://github.com/hhj4861/commerce-automation-kit/pull/97
- 성공한 자동 배포: https://github.com/hhj4861/commerce-automation-kit/actions/runs/36809186441
- 운영 revision: `9e9354b1886a55837833bb40d0d0a719ea0d558d`

## 확인 결과

| 검사 | 실제 결과 |
|---|---|
| 중앙 자격 수신 | 보호된 관리자 배포 ref의 GitHub OIDC로 성공 |
| Vercel 원격 production 빌드 | 프로젝트 전용 토큰으로 성공, Ready |
| GET /api/deployment | 200, application=hanmadi-admin, 위 revision 일치 |
| GET /admin-login | 200, Hanmadi Admin 표시 |
| 비로그인 GET /api/study/admin | 403 |
| 소유자 PIN 로그인 | 200, ok=true, role=owner |
| 로그인 후 GET /study/admin | 200 |
| 로그인 후 GET /api/study/admin | 200, searchConfigured=true |
| 로그인 후 GET /api/study/admin/learning | 200 |
| 관리자 호스트의 GET /api/study | 비로그인·소유자 모두 404 |
| 기존 학습 앱 GET /api/deployment | 200, application=hanmadi, revision=d09ce02d03f9087ca00f53d5fff8d6a477bda9c2 |

소유자 PIN과 발급된 세션 쿠키는 승인된 파일/프로세스 메모리에서만 사용했고 문서·일반 로그·Git에 저장하지 않았다. 검증은 로그인과 조회만 수행했으며 자료 생성·공개·유료 학습을 실행하지 않았다.

## 학습 기능의 운영 상태

조회 시 자료 초안·번역 후보·데이터셋·파인튜닝 작업은 각 0개였다. 학습 관리 API는 동작하지만 임베딩/파인튜닝 제공자 설정과 유료 학습 실행은 비활성 상태다(`embeddingConfigured=false`, `trainingConfigured=false`, `enabled=false`). 웹 자동 배포 완료가 모델 추가 학습 실행 완료를 뜻하지 않는다.

관리자 프로젝트 전용 CI 토큰의 현재 만료일은 **2026-12-30**이다. 갱신 시 같은 관리자 프로젝트 범위로 발급해 Cloudflare의 기존 관리자 secret을 교체한다. 다른 앱 토큰과 공유하지 않는다.

## 구현 검증과 수정 범위

배포 테스트 26개·Python 테스트 8개, PR 필수 GitOps 검증, 공식 CLI dry run을 통과했다. 관리자는 프로젝트 전용 토큰에서 실패하던 Vercel pull 대신 소스 업로드·원격 빌드를 사용한다. 앱 모드·학습 앱 URL·release SHA는 빌드와 런타임에 같이 전달하며 기존 학습 앱의 prebuilt 방식은 유지한다.

이 문서는 실제 운영 결과 기록이다. [관리자 배포 안내](hanmadi-admin.md)의 첫 배포 대기/실패 기록 이후 상태를 보완한다. 저장소의 다른 플랫폼 배포 완료를 주장하지 않는다.

## 검색과 자료 저장 설정 분리 — PR #99 / #100

2026-10-01 승인된 [기능 PR #99](https://github.com/hhj4861/commerce-automation-kit/pull/99)를 main에 머지하고, [승격 PR #100](https://github.com/hhj4861/commerce-automation-kit/pull/100)을 `deploy/hanmadi-admin`에 머지했다. [자동 배포 실행](https://github.com/hhj4861/commerce-automation-kit/actions/runs/36812438129)은 성공했으며 운영 앱의 revision은 `a1424fd48085e441cf0556be6583a3c5bd379e76`과 일치했다.

검색 화면은 검색어만 입력한다. 학습 언어·상황·레벨은 영상을 자료 준비 목록에 담은 뒤 저장 전에 설정한다. 완료한 초안의 분류는 이후 공통 설정 변경으로 바뀌지 않는다.

| 운영 검사 | 실제 결과 |
|---|---|
| 소유자 PIN 로그인 및 관리자 자료·학습 API | 모두 200 |
| 비로그인 관리자 API / 관리자 호스트의 학습 API | 403 / 404 |
| 검색 입력 영역 / 비어 있는 준비 목록의 선택 필드 | 각각 0개 |
| 공식 YouTube 실제 검색 | 200, 요청 필드는 action·query만 포함, 첫 페이지 영상 5개 |
| 영상 선택 후 저장 설정 | 준비 목록 5개, 학습 언어·상황·레벨 선택 가능 |
| 자료 설정 변경 | 추가 검색 요청 없음 |
| 원문 없는 자료 생성 | 버튼 비활성 유지 |
| 320·390·768·1440px 화면 | 가로 넘침 없음, 페이지 JavaScript 예외 0개 |
| 확인 후 정리 | 준비 목록 해제 및 로그아웃 200 |
| 기존 학습 앱 | revision `d09ce02d03f9087ca00f53d5fff8d6a477bda9c2` 유지 |

운영에서는 실제 검색 1회와 화면 설정·로그인·조회만 수행했다. 자료 생성·게시·유료 학습은 실행하지 않았다. 영상별 초안 일괄 저장과 저장된 분류 유지, 모든 페이지 선택·중단·재시도는 격리된 fixture E2E에서 확인했다. 단위 테스트 108개, 타입 검사, lint(기존 경고 4개·오류 0개), 운영 빌드, 전체 사용자 흐름·관리자 전용 E2E, PR #99의 CI 5개 및 승격 필수 GitOps 검사를 통과했다.

운영 화면 캡처와 비밀정보를 포함하지 않는 `verification.json`은 사용자 공용 작업 루트의 `commerce-automation-kit/hanmadi-admin-save-metadata-20261001/production/`에 저장했다. PIN·세션 쿠키는 출력·파일 저장하지 않았다.
