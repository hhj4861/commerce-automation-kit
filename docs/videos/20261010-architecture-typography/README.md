# 기존 건축 영상 자막·헤더 적용

- 요청: bathroom-pipes v2의 자막/헤더를 지정한 모세 다리와 폴커크 휠 v3 영상에 적용.
- 담당/범위: 현재 Codex 단독, 이 폴더 3개 소스·문서만. 기준 8e93332, feat/architecture-render-kit.
- 처리: 자막 없는 기존 렌더 클립으로 재합성. 원본 MP4 보존, 기존 음성 AAC 패킷 그대로 복사. 신규 TTS/Higgsfield/Blender 렌더 없음.
- 디자인: Pretendard SemiBold, 제목 88px 좌측 정렬·흰색/민트, 자막 62px·둥근 반투명 차콜 배경·외곽선 없음. 모세 구조 설명은 상단에 두어 연결부·배수를 가리지 않음.
- 보존: 모세의 실제 투영 연결부 강조, 폴커크의 10톤 가정 예시 표기, 전체 대사·영상 길이·엔딩 여유.
- 합격 기준: 원본/클립 해시, 프레임 수, 전체 디코딩, 원본과 음성 패킷 일치, 모든 대사 자막·실제 표시 시점 픽셀 확인, 대표 화면 검수, 본인 변경 커밋·upstream push.
- 현재: 두 수정본 합성·디코딩·음성 패킷 동일성·모든 자막 시점 검사 통과. 대표 프레임에서 헤더/자막/설명 강조/결말 확인. 원본 보존.
- 산출물: `/Users/admin/Downloads/vedio/moses-bridge-immersive-short-v2.mp4`, `/Users/admin/Downloads/vedio/falkirk-wheel-immersive-full-v4.mp4`.
- 캐시: 지정 iCloud 루트/commerce-automation-kit/20261010-architecture-typography/{moses,falkirk}.
- Shopshorts 운영 기본값·게시 영상·공용 렌더러 변경 없음. 사용자 미감 승인이나 실제 기기 청취를 파일 검증으로 대체하지 않음.

- 검증 보정: YUV420 자막 크롭 좌표가 홀수일 때 FFmpeg가 짝수로 내리므로, 비교 이미지도 동일한 짝수 좌표로 맞춤. 판정 임계값은 유지하며 영상 자체는 바꾸지 않음.
