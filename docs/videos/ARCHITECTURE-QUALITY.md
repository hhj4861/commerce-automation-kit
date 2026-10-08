# 건축학 기본 품질 — 2026-10-08

목표: Al Bahr 개선 샘플의 재질·빛·동작·구도 기준을 새 건축학 제작의 기본으로 사용한다. Codex 단독 담당. 기준 main `7a7b634`, 구현 `feat/architecture-quality-default`. 기존 영상 재생성·운영 배포·다른 카테고리는 범위 밖이다.

## 적용 범위

새 건축학 프로젝트는 `createProject`에서 `architecture-cycles-v1`을 기록한다. 스타일 미지정 시 웹툰이다. 웹툰의 구조·단면(cutaway)과 명시적 3D 장면은 실제 Blender를 사용한다. 상황·사례·비교·흐름 웹툰은 유지한다. 자동 혼합을 선택하면 기존의 모션 분기도 유지한다. 사용자가 지정한 실사/애니메이션은 변경하지 않는다.

CLI·웹 API·자동제작·워커는 같은 정책과 계획 검증을 사용한다. CLI용 새 프로젝트도 `apps/shopshorts/lib/studio.js`의 `createProject(brief)`로 만들고, 승인된 시나리오를 저장한 뒤 `node apps/shopshorts/studio-hybrid-cli.mjs --project <project.json>`으로 과금 없는 계획을 확인한다. 미디어 실행은 기존 `--action media --approve-script --assets <dir> --work <dir>` 경로다. 오래된 JSON에는 품질 버전을 자동 주입하지 않는다.

## 렌더 기준과 한계

- Cycles 48 samples, denoise, 24fps, 세로 1080×1920/가로 1920×1080. GPU 가능 시 사용하며 CPU에서도 품질을 낮추지 않는다.
- 유리 투과·반사, 금속 모서리, 직조 천, 거친 콘크리트. 따뜻한 주광과 차가운 배경/보조광으로 구분한다.
- 고정점 기반 힌지 회전, 이동, 흐름과 연속 카메라. 움직이는 부품은 처음부터 보이고 결과를 유지한다. 개폐를 부품 크기 변경으로 대신하지 않는다.
- LLM 출력은 허용된 도형·재질·힌지 데이터뿐이다. 고정 Python 렌더러가 처리하며 모델이 만든 코드를 실행하지 않는다.
- 임의 건물의 상세 외형을 자동 복제하는 기능은 아니다. 지원 도형으로 설명할 수 없는 외형은 원화나 별도 모델링이 필요하다. 구조도는 설명용 재구성이며 제작도·물리 해석이 아니다. Al Bahr 원본 개선 샘플은 `feat/al-bahr-webtoon`의 `a8c0e1a`이다.

## 운영 반영 조건

제작 워커에 Blender 4.2 이상(Cycles 포함)을 설치하고 `SHOPSHORTS_BLENDER_BIN`에 실행 파일을 지정하거나 PATH에 `blender`를 둔다. 실행 환경이 없으면 비용 견적·유료 생성·TTS 전에 오류로 중단하며 SVG 저품질 대체를 하지 않는다. 도입 Higgsfield·크레딧 상한·대본 검수·선택 음성과 배속은 그대로다. 완성 자산은 재사용한다.

PR 머지 승인 후 Pages/API와 제작 워커를 함께 배포해야 운영에 적용된다. 코드 저장·로컬 검증만으로 운영 반영을 주장하지 않는다. 배포 후 새 건축학 프로젝트의 계획에 `Blender 건축 구조`가 표시되는지, 실제 자산에 `provider=architecture-blender`, `qualityProfile`, `renderReport`가 저장되는지 확인한다.

## 검증

- 관련 8개 테스트 파일: 60개 중 58 통과, 0 실패, 2 선택적 렌더 검사 기본 생략. 포함 범위: 웹/CLI 동일 분기, 자동제작, 구형 프로젝트, 비용·승인·자산 재사용, 기존 웹툰/시네마틱/설명 애니메이션 실렌더, 로그인 후 정적 모듈 제공.
- 건축학 opt-in 실렌더: 6/6 통과. Blender 4.5.10 / Cycles GPU / 48 samples / denoise / 1080×1920 / 24fps / 1초 24프레임. ffprobe 검사와 전체 디코딩 통과. 회전 전후 프레임을 직접 확인하여 처음부터 부품이 보이고 회전 후 유리 앞을 가리는 결과를 확인했다. 이는 2부품 테스트 도형이며 완성 건물 영상이 아니다.
- paid API 호출 없음. 기존 완성 영상 변경 없음.
- Node 20.19.3 서버와 설치된 Node 24.1.0 모션 런타임을 분리해 검증했다. 기존 의존성은 읽기 전용 재사용. 초기 환경 실패(Node ABI/의존성 탐색/긴 Unix 소켓 경로)를 수정해 정상 종료를 확인했다. 테스트 별칭만 `/private/tmp`에 만들고 실제 산출물은 지정 iCloud에 저장했으며 종료 시 별칭을 제거했다.
- 증적: iCloud `gpt 작업/commerce-automation-kit/20261008-architecture-default/`의 `regression-final.log`, `blender-final.log`, `integration-final.log`, `render-report.json`, `architecture-default-e2e.mp4`, `before.png`, `after.png`.

현재: 구현·실렌더 검증 완료, 작업 브랜치 커밋·푸시 및 PR 준비. main·운영은 아직 미반영.
