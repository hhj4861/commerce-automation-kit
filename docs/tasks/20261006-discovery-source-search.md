# 원문 대상명과 조사 검색어 분리

- 목표/소유: JEV 세션. 실계정 보류 2건의 조사 입력을 보완하되 근거 검증 기준·예산·사람 승인을 유지한다.
- 기준: main `deec584d9cb7f75ff31835710c4c910de3be0a08` (#154 포함), `fix/discovery-source-focused-search`.
- 범위: research lead의 선택적 `searchQuery`, 원문 대상명 복사 안내, 후속 검색의 호출자 `site:` 힌트 보존, 회귀/실제 HTTP 대역 검증. 새 검색 공급자·크롤링·추가 검색/생성/JEV 재시도 없음.
- 계약: 기존 lead 출력은 그대로 허용한다. `searchQuery`는 300자 이하 검색 가설이며 identity/출처/사실 증거로 쓰지 않는다. 실제 제목·발췌에 없는 대상명, 인용 불일치, 근거 부족은 계속 보류한다. 원출처 확인은 별도 판단이며 도메인·공식 키워드만으로 승인하지 않는다.
- 완료 기준: 검색어가 정확히 전달되어 증거가 JEV에 도달하는 HTTP 흐름, 원문 entity 유지, 기존 adapter·replay·예산 회귀 통과 후 본인 변경 commit/push/PR. 실모델 성공과 운영 적용은 별도다.

## 실제 검색 비교 (2026-10-06)

기존 discovery 컨테이너의 NaverSearch로 공식 API 검색 총 8회. 자격은 서버 내부에서만 사용했고 설정·DB·키·예산은 변경하지 않았다. JEV/LLM 호출 0회.

- `에펠탑 금속 골조`: 상위 10개에 toureiffel.paris 없음. `… 공식`도 없음(9개). 단순 키워드 추가는 채택하지 않았다.
- `에펠탑 금속 골조 site:toureiffel.paris`: 공식 사이트를 찾지만 티켓·일반 안내 중심이었다.
- `Eiffel Tower iron structure weight official`: 상위 10개 중 www.toureiffel.paris 5개. 재료 설명의 발췌가 추가됐다. 상세 무게 수치의 검증이나 완전한 추천 성공을 뜻하지 않는다.
- 같은 영어 검색에 `site:toureiffel.paris`를 사용해도 타 도메인 결과가 섞였다. 따라서 site:는 검색 힌트로만 취급하며 강제 출처 필터라고 보고하지 않는다.
- 판테온 한국어 기본/공식 및 영어 검색도 비교했다. 영어로 바꾸어도 여행·티켓 결과가 남았으므로 일반적인 1차 출처 확보 성공률 향상은 입증하지 않았다.
- [네이버 공식 웹 검색 문서](https://developers.naver.com/docs/serviceapi/search/web/web.md): query와 title/link/description 계약 확인. 반환 description은 검색 패시지이며 원문 전체를 확보한 것이 아니다.

## 검증·현재 상태

- Python 전체 77개, JavaScript/Shopshorts 관련 24개 통과. 실제 HTTP 서버·DB를 사용하되 생성·검색·JEV는 대역인 통합 검사다. 검색어 분리 → 후속 발췌 전달 → JEV 판정 → 중복 호출 없는 재생을 확인했다.
- 최초 신규 HTTP 테스트는 테스트 콜백의 runtime 인자 누락으로 실패했고, 기존 client 계약에 맞춰 수정 후 통과했다.
- 실제 검색 8건 비교와 통합 대역 검증을 구분한다. 실제 LLM이 새 검색어를 적절히 생성하고 JEV가 받아들이는 실계정 추천 성공은 아직 미검증이다.
- #154는 승인 후 main에 머지됐지만 운영 워커 반영은 아직이다. 이번 검색 개선 역시 운영 미반영이며 새 PR 머지 승인이 필요하다.
- 다음: PR 승인·서비스 배포 후 제한된 실계정 1건으로 JEV까지 도달하는지 확인. 자료 부족이면 그대로 보류하고 임계값을 낮추지 않는다.
