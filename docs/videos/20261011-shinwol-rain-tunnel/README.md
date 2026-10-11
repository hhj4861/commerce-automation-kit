# 신월 빗물터널 — 침수를 막으려고 터널에 물을 채운다고?

## 작업 카드
- 목표: 생활 문제인 도시 침수에서 출발해 의외의 실제 시설과 작동 원리를 보여주는 건축·토목 쇼츠 제작.
- 소유/범위: Codex 단독, 이 디렉터리의 영상 소스만. 원격 운영 앱·다른 영상·다른 세션 파일은 수정하지 않음.
- 기반: b180295, 작업 브랜치 feat/shinwol-rain-tunnel.
- 완료 기준: 대본 사실/깊이 검토, 전경·작동·근접 화면 검토, 전체 영상과 Kyle 음성 및 자막 검증, 완성본 Downloads/vedio 저장, 본인 소스 커밋·push.
- 현재: 완성본 60.167초·8개 장면·19개 자막, 1080×1920/24fps. 전체 디코딩, 음성 포함·원본 믹스 일치, 검은 화면 없음 검증 및 실제 완성본 화면 검토 완료. 소스 커밋·push는 Git 이력으로 확인한다.
- 도입: Higgsfield 웹 계정 잔액 약10 확인. 기존6초 설정54크레딧은 이전 실측. 사용자가 이번 편은 전체 Blender 3D로 제작하도록 승인함. Higgsfield 요청·추가 결제 없음.
- 다음: 사용자가 완성본을 시청해 첫 장면의 궁금증과 설명의 이해도를 확인한다. YouTube 업로드·Shopshorts 배포는 수행하지 않았다.

## 선정 근거
2026년10월 서울시의회 자료에서도 도림천 빗물배수터널 공사 점검을 확인했다. 이는 최신 도시방재 문제와의 관련성이다. 검색량·유튜브 인기 급등을 확인했다는 뜻은 아니다. 기존 건물 아래 지하철 영상은 굴착·지반 지지, 이번 편은 빗물의 유입/저류/배출 속도 차이를 다뤄 핵심 답이 다르다.

## 자료와 한계
- https://www.korea.kr/news/policyNewsView.do?newsId=148906263
- https://jkwra.or.kr/articles/xml/g9Nm/
- https://webzine.smc.seoul.kr/2026/10/02.html

건축·설비 모습은 원리 이해를 위한 자체 3D 재구성이며 실제 설계 도면/수리 시뮬레이션이 아니다. 홍수 완전 방지나 모든 지역에 같은 성능을 약속하지 않는다. 원본 사진·영상 다운로드/재사용 없음.

## 제작 설정
1080×1920, Kyle RU7aSi6lT4uQBXMLgDxK, 1.1배. Pretendard SemiBold 흰색+둥근 차콜 배경, 민트 도입 헤더. 최종 분량은 발화 길이를 따르며 결말을 자르지 않는다. 중간산출물 iCloud 전용 캐시, 완성본 /Users/admin/Downloads/vedio/shinwol-rain-tunnel-short.mp4 저장 완료.


## 재현과 검증
- `story.json`: 출처, 대본, 장면 계획, 제작 전 설명 깊이 검토.
- `produce.mjs`: 기존 시크릿 서비스와 ElevenLabs 공식 API로 Kyle 음성 생성. `VIDEO_CACHE` 환경변수로 아래 캐시 경로를 지정한다. 기존 요청 영수증을 확인하며 유료 재요청은 자동 반복하지 않는다.
- `finish.py prepare --cache <캐시>` → `finish.py align --cache <캐시>` → Blender background에서 `scene.py -- --cache <캐시> --shot all` → `finish.py assemble --cache <캐시>` → `finish.py verify --cache <캐시>` 순서다. Python으로 `.py` 파일을 실행한다. Blender 4.5.10, FFmpeg, Pillow, NumPy, local Whisper small과 Pretendard SemiBold가 필요하다.
- 정렬 뒤 `prepare`를 다시 실행하면 정렬도 다시 실행해야 한다. 렌더 영수증이 소스·프레임 수·영상 해시와 일치해야 최종 조립한다.
- 캐시: `/Users/admin/Library/Mobile Documents/com~apple~CloudDocs/gpt 작업/commerce-automation-kit/20261011-shinwol-rain-tunnel`
- 글꼴: `/Users/admin/Downloads/vedio/drama/fonts/Pretendard-SemiBold.otf`
- 검증 결과: `verification.json`. 전체 영상 디코딩 통과, 8개 발화 구간 모두 음성 확인, 완성본 오디오와 원본 믹스 상관계수 0.99945, 검은 화면 검출 없음. 마지막 발화 뒤 0.75초 이상 유지.
- 실제 완성본 프레임: 캐시의 `qa/final-contact.jpg`, `qa/final-first.jpg`, `qa/final-ending.jpg`. 자동 전사는 일부 단어를 서로 다르게 인식했으므로 완벽한 발음 검증으로 주장하지 않는다.
- 렌더 중 한 도구 훅이 디스크 부족을 보고했다. 이후 여유 공간이 회복됐고, 삭제 없이 모든 클립의 정상 종료·디코딩 및 최종 출력을 확인했다.
- 이 작업은 제작 소스와 로컬 완성본이다. 운영 웹 제작실 적용·유튜브 게시·흥행 검증 완료를 뜻하지 않는다.
