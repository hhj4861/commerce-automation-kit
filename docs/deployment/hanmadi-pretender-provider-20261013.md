# Hanmadi Pretender — 실제 가사 공급 연결 준비

확인일: 2026-10-13. 상태: **공급자 조사·문의 초안 준비, 실제 연동·운영 활성화 미완료**.

## 현재 확인한 것

운영 `f77f853`의 Pretender 화면에는 공식 영상 링크와 “현재 가사 학습 이용 불가”가 표시된다. 운영 설정 이름 조회에서 `HANMADI_MUSIC_CATALOG_URL`, `HANMADI_MUSIC_CATALOG_TOKEN`, `HANMADI_MUSIC_LICENSE_APPROVED`가 없었다. API 키·계약을 새로 발급하거나 설정을 변경하지 않았다.

현재 `lib/music-lyrics-provider.ts`는 Hanmadi 형식의 JSON을 받는 공통 연결부다. 특정 공급자의 실제 API에 연결하는 어댑터는 없다. `lib/music-lyrics.ts`의 계약은 줄별 일본어·한국어 발음·뜻·선택적 시작/끝 시각을 요구한다. `components/v2-lyrics.tsx`는 가사·발음·구간·커서 진도 연습까지만 제공한다. 연습곡에 구현된 단어 퀴즈·개인 저장·AI 회화 연결이 Pretender에도 구현된 것으로 취급하지 않는다.

기존 E2E의 가사 공급자는 자체 작성한 일본어 예문을 사용한 fixture다. 실제 Pretender 제공 여부, 가사 정확성, 계약상 이용 범위, 실제 공급 API 정상 응답을 증명하지 않는다.

## 공식 공급자 조사

### Musixmatch

공식 [API 요금표](https://www.musixmatch.com/pro/api/pricing)를 Chrome에서 직접 확인했다. 월간 표시 가격 기준이며 결제·구독하지 않았다.

| 요금제 | 월 표시 가격 | 일일 가사 호출 | 시간 동기 가사 | 가사 캐싱 |
|---|---:|---:|---|---|
| Basic | USD 49 | 500 | 미포함 | 미포함 |
| Grow | USD 199 | 2,000 | 포함 | 미포함 |
| Scale | USD 499 | 10,000 | 포함 | 미포함 |
| Enterprise | USD 2,000부터, 개별 협의 | 개별 협의 | 포함 | 포함 |

가사 동기화가 필요한 요구에는 Grow가 후보지만 **Pretender 제공·교육용 가공·TTS·개인 저장까지 허용된다는 확인은 아니다**. 구독 선택은 공급자의 답변과 사용자 예산 확정 후에 한다. 가사 캐싱 미포함과 현재 음성 캐시·저장 기능의 관계도 별도로 확인한다.

[공식 시작 안내](https://docs.musixmatch.com/getting-started)는 API 키 발급 후 곡 매칭/검색과 가사 조회를 안내하며, 사업 목적 사용·조건 확인 문의처로 `sales@musixmatch.com`을 제공한다. [구현 지침](https://docs.musixmatch.com/implementation-guidelines)은 정확한 곡 버전 매칭, 조회 추적, 저작권 표시, 출처 로고·backlink, 국가별 제한을 요구한다. [콘텐츠 제한](https://docs.musixmatch.com/content-restrictions)에는 아티스트·곡·국가별 제한으로 본문이 반환되지 않을 수 있다고 설명한다. 따라서 곡명 검색 결과나 결제만으로 Pretender 사용 가능을 판정하지 않는다.

### LyricFind

공식 [가사 표시](https://www.lyricfind.com/products/lyric-display)는 일반·줄별·단어별 동기 가사를 소개하며, [번역](https://www.lyricfind.com/products/translations)은 일본어와 한국어를 지원 언어로 명시한다. 특정 Pretender 번역·발음·학습 이용 권한은 미확인이다. 확인한 공식 제품 페이지에는 견적 금액이 없어 임의 가격을 제시하지 않는다. [공식 문의처](https://www.lyricfind.com/contact)의 판매 문의 이메일은 `sales@lyricfind.com`이다.

## 연결 시 필요한 구현

1. 공급자에게 Pretender의 정확한 버전·국가별 제공 범위·전체 원문·한국어 번역·타임코드·학습 가공 이용 조건을 확인한다. API 접근·평가용 자료·비용을 확정한다.
2. 해당 API의 실제 응답으로 공급자 어댑터를 구현한다. 키는 서버에만 두고 URL·가사·키를 로그에 남기지 않는다. 잘못된 곡·부분 가사·이용 제한·만료·호출 한도를 분리해 처리한다. 현재 고정 JSON 입력에 실제 공급자 응답을 그대로 넣지 않는다.
3. 필요한 출처 표시·지역 제한·조회 집계와 보관 정책을 구현한다. 가사 및 파생 음성의 캐싱·개인 저장 가능 범위를 별도로 반영한다. 현재 공통 계약은 필요한 필드를 추가하는 방식으로 확장한다.
4. 허용된 처리 범위 안에서 한국어 뜻·발음·핵심 단어·회화 예시를 준비하고 검수한다. LLM/TTS에 원문을 전송할 수 있는지도 확인한다. 모델 파인튜닝이나 공용 학습 데이터 편입으로 자동 연결하지 않는다.
5. 실제 곡 한 건으로 원곡 버전/타임코드 → 가사·뜻·발음 → 단어·회화 → 허용된 개인 기록 → 새로고침 복원을 검증한다. 이후 PR 승인을 받아 운영에 반영하고 실제 공급자 응답을 다시 확인한다.

“연동 완료”는 운영 실자료로 위 흐름을 확인했을 때만 사용한다. 계약·키·어댑터가 없거나 테스트 예문만 통과한 상태는 미완료다.

## 공급자 문의 초안 — 아직 발송하지 않음

각 공급자에게 개별 발송할 동일한 초안이다. 수신자끼리 CC하지 않는다. 계약·결제 승인이나 사용자 수/매출 확약을 포함하지 않는다. 공개 앱 정보와 필요한 기능만 전달하며 소스·비밀 키·실제 학습자 데이터는 보내지 않는다.

- 수신 후보: `sales@musixmatch.com`, `sales@lyricfind.com`
- 제목: `Hanmadi: Pretender lyrics availability and language-learning API licensing inquiry`
- 발신: 사용자 지정 개인 메일 계정 확인 후. 현재 연결된 회사 Gmail은 사용하지 않았다.

```text
Hello Sales Team,

I am developing Hanmadi, a language-learning app for Korean-speaking learners:
https://hanmadi-lake.vercel.app/study

We would like to evaluate licensed Japanese lyrics for "Pretender" by
Official HIGE DANdism (Official髭男dism), initially as a one-song pilot.
The official video we intend to use through YouTube's embedded player is:
https://www.youtube.com/watch?v=TQ8WlA2GXbk

Could you please confirm:

1. Availability of the exact recording/version, full Japanese lyrics,
   Korean translations, and line-level timestamps, including territorial
   restrictions for users in South Korea and other available territories.
2. Whether your license permits line-by-line language exercises, Korean
   pronunciation guides, vocabulary explanations, quizzes, and newly
   written everyday conversation examples based on selected expressions.
3. Whether lyrics may be sent to third-party AI/TTS services for inference,
   pronunciation audio, or learner conversations, and under what retention
   conditions. Model training/fine-tuning is outside this pilot.
4. Whether learners may save selected words/expressions and explanations
   for personal review, and the permitted storage/caching of source text,
   translations, pronunciation guides, and generated audio.
5. Required attribution, links, usage/view reporting, geographic handling,
   and removal/expiry procedures.
6. The suitable API plan, minimum fees, rate limits, evaluation access or
   sample responses, and any additional permissions required for this use.

We have not enabled commercial-song lyric learning. We want to confirm
the allowed use and technical requirements before implementation and
before committing to a subscription. No audio download or rehosting is
planned; music playback would remain in the official YouTube player.

Please provide a quote and the relevant API documentation and terms for
this use case. This is an evaluation inquiry, not an order or acceptance
of a contract.

Thank you,
Hanmadi project
```

## 이번 작업의 결과와 다음 단계

운영 장애 원인과 추가 구현 범위를 확인하고 공식 가격·요건·문의 초안을 준비했다. 가사 공급자 계정 생성, 결제, 계약, 이메일 발송, 제품 코드 변경, 운영 설정 변경·재배포는 수행하지 않았다. 다음 단계는 사용자가 지정한 개인 발신 계정으로 위 문의를 보낼지 확인하는 것이다. 외부 수신자에게 메시지를 보내는 작업은 명시적 발송 지시 후 수행한다.
