# 샘플 프레임 시각 판정

- 목적: 컷별 시각 판정 요청·응답을 실제 클립과 고정 프레임에 묶는다.
- 기준: PR179 `44f8826f17cc634eec7ef1e71a1691876577bb36`, 미머지 stacked branch `feat/drama-visual-verdict`. 사용자 계속 요청은 PR179 머지 승인으로 해석하지 않음.
- 담당: 리드 Codex 단독 구현, 사용자 승인 독립 Codex 검토. worker/Claude OFF.
- 범위: 임의 컷 합성/권한 보유 클립 사본, full decode ordinal 첫·중간·마지막 고정 PNG; 대본 기반 action/cast/look/background 질문; strict 응답과 현재 파일 재검증. 새 출력만 생성.
- 경계: sample pass는 전체 clip verdict가 아님. 비트·참조 이미지·시각 연결·대사·실행/출시 승인 미구현. 항상 authorized=false, plan/assemble 차단 유지. 실제 미디어 제작·유료 호출 없음.
- 완료 조건: 실제 파일 교체/옛 응답/질문 변조/누락·중복/unknown 거부 시험, 기존157 유지, 독립 리뷰, 본인 커밋·push·stacked PR. 산출물은 지정 iCloud `commerce-automation-kit/20261011-drama-visual-verdict/`.
- 상태: 구현·통합 검증·독립 재검토 PASS. 커밋·push·stacked PR 진행.

## 결과

- 신규37개를 포함 drama-series172/172 + drama-runner22/22 =194/194. contracts/drama-series/drama-runner 타입·구문 검사와 diffcheck 통과(Node22.23.3, lockfile 변경 없음).
- 합성 실제 ffmpeg·CLI, 옛 job/문맥/질문/응답 지문, 동일 크기 클립 변조, ordinal PNG 교체, 1/2프레임, 실제 회전/VFR, unknown·누락·중복·다른 질문 프레임을 검증했다. 기존 source/continuation/legacy/runner 회귀 유지.
- 독립 Codex `/root/wiki_semantic` 첫 검토 changes(S2중복JSON키). fail/pass 중복키가 마지막값 pass로 덮이는 CLI 재현을 받고 새 프로토콜의 입력에 strict parser·bounded descriptor reader를 적용했다. 추가로 FIFO 입력의 open 대기를 nonblocking으로 막았다.
- 독립 재검토 PASS: 동일 원재현 거부, 정상 pass/authorizedfalse, unknown exit1, response FIFO 즉시 거부, escaped·nested duplicate keys/비유한 숫자/깊이 제한 확인. 추가 S1/S2 없음. 전체194는 리드 실행 증거다.
- 검토 고정 SHA256: core `8bc9590abdd27553ef38758359ca12dd8ca022b1735d744f1a06465c39258667`, parser `8479a8c631a9709464b63a1b90572becd17d1534f98034c2b2c2864772d23249`, adapter `125dd18f008f045944e172e3d3bd81c5bb9cce22f8b5e8080baf8f21d1420a09`, media helper `b966fce53efd244f31a7969cbf480ceb6c8418159060736cdf675e7f8b7d566e`, CLI `34e46c97e31c78cfe822d781dc10b6c10b03740a187160a2017b5ead7b8848c7`.
- 근거: 지정 iCloud 작업 폴더 `typecheck.log`, `drama-tests.log`, `runner-tests.log`, `target-fix.log`, `review/duplicate-verdict-l5rAnL`.
- 다음: PR179 다음 순서로 사용자 머지 승인 필요. 전체 출시 관문에는 shot-v1 비트/키프레임 참조·대사 결합 판정·실행 상태·사람 승인이 여전히 필요하다. 이 샘플 보고서를 전체 컷 released로 승격하지 않는다.
