# Hanmadi 실제 곡 가사 학습 연결 확인 — 2026-10-14

## 현재 결론

사용자 요청은 자체 연습곡 안내 개선이 아니라 Pretender 등 실제 곡의 가사 학습 연결이다. 현재 운영에는 실제 Pretender 가사가 없다. 공급 계정·이용권 확인이 필요하며, 이 문서 작성 시 실제 연결·결제·가사 게시·운영 변경은 하지 않았다.

- 담당: 호출한 Codex 세션. 이번 변경은 조사·연결 조건 문서만이다.
- 확인한 소스: 운영에 반영된 main `e5848e714514a16088958f9b84d901f4cc5d8bbf`와 동일한 Hanmadi 코드가 있는 작업본 `05488b8d39f38418a7535ed0b46adea545f5a38d`.
- 완료 기준: 정확한 곡/영상 버전과 이용 지역의 공급 가능 여부 → 이용 범위 확인 → 공급사별 연결 → 실자료 검수 → 승인된 배포 → 실제 가사 학습 E2E. 현재는 공급사별 연결 이전이다.

## 이미 있는 기능과 없는 기능

1. `lib/music-lyrics-provider.ts`는 Hanmadi 자체 JSON 형식의 검수된 자료를 받는다. Musixmatch/LyricFind API를 그대로 꽂는 연결기가 아니다. `HANMADI_MUSIC_CATALOG_URL`과 승인 설정만 만들어 실제 공급 없이 켜는 것은 해결이 아니다.
2. `lib/music-lyrics.ts`는 가사·한국어 발음·뜻·선택적 시간 정보를 요구한다. 유효 기간과 사용권 참조도 필요하다. 공급사 고유 국가 제한·조회 기록 등은 아직 구현되지 않았다.
3. 관리자 `components/music-admin.tsx`에는 권한 있는 TXT/SRT/VTT 원문 등록 → AI 자료 생성 → JEV 평가 → 사람 검수 → 게시 기능이 있다. `lib/owned-music.ts`에서 게시한 공식 영상 ID가 Pretender와 같으면 학습자 음악 화면에 연결된다.
4. 이 관리자 경로는 원문과 가공 자료를 저장하고 AI에 전달한다. **단순 가사 표시 계약을 이 경로의 사용권으로 간주할 수 없다.** 공급사 허용 범위 확인 전에는 상용 가사를 이 경로에 넣지 않는다.
5. 기존 연동/음악 E2E는 자체 작성한 문장과 모의 응답을 사용했다. Pretender 공급·실제 가사 정확성·그 가사의 학습 이용권을 검증한 증거가 아니다.

## 공식 공급처 확인

확인일은 2026-10-14. Musixmatch 페이지는 웹 검색 도구에서 열리지 않아 Chrome의 실제 공개 페이지에서 확인했다. 로그인·가입·결제·외부 문의 발송은 하지 않았다.

| 공급처 | 확인한 기능·금액 | 이번 요구에서 남는 확인 |
|---|---|---|
| Musixmatch Basic | 월 결제 $49, 가사 500회/일·번역 500회/일, 정적 가사. 시간 동기화·가사 캐싱 미포함 | Pretender/한국어 번역 공급, 공개 앱 이용, AI 입력·발음 음성·학습 자료 저장 허용 |
| Musixmatch Grow | 월 결제 $199, 가사 2,000회/일·번역 2,000회/일, 시간 동기화 포함. 가사 캐싱 미포함 | 위 항목과 공식 YouTube 영상 버전의 시간 정합성 |
| Musixmatch Enterprise | 맞춤 계약, 월 $2,000부터. 캐싱 포함으로 안내 | Hanmadi에 필요한 계약/가격이라고 확정한 것이 아님. 더 작은 학습용 별도 허가 가능 여부 문의 필요 |
| LyricFind | 정적·줄별·단어별 가사 표시 및 일본어/한국어 번역 제품 제공 | 확인한 제품 페이지에 고정 요금 없음. Pretender 지원·학습용 범위·견적 별도 문의 |

요금표는 가격과 API 한도를 보여 줄 뿐 특정 곡 또는 모든 학습 기능의 이용 허가를 증명하지 않는다. 위 금액은 표시된 USD 월 요금이며 세금·추가 계약 비용을 포함한 견적이 아니다. Basic을 결제하면 기존 Hanmadi AI 파이프라인까지 사용할 수 있다고 추천하지 않는다.

- [Musixmatch 공식 요금표](https://www.musixmatch.com/pro/api/pricing)
- [Musixmatch 시작 안내](https://docs.musixmatch.com/getting-started)
- [LyricFind 가사 표시](https://www.lyricfind.com/products/lyric-display), [번역](https://www.lyricfind.com/products/translations), [영업 문의](https://www.lyricfind.com/contact)

## 연결 방식을 결정하는 조건

[Musixmatch API 약관](https://about.musixmatch.com/apiterms) 페이지는 최종 갱신일을 2025-06-24로 표시한다. 일반 약관과 별도 서면 계약이 함께 적용될 수 있다. 확인한 조항:

- 2.1.4: 데이터를 담은 웹 페이지의 공개 전 서면 승인 요구.
- 2.2.1: 상업 이용은 명시적 사전 서면 승인 요구.
- 2.2.12~13: 새 음성·영상 작품에 데이터 편입 및 karaoke 관련 제한.
- 2.2.14: AI와 함께 사용하거나 AI에 프롬프트로 넣는 데 사전 서면 승인 요구. **학습 모델 훈련만의 제한이 아니다.** 현재 AI/JEV 입력·TTS·따라 부르기 기능을 그대로 허용한다고 가정하지 않는다.

[공식 구현 지침](https://docs.musixmatch.com/implementation-guidelines)은 저작권 표시, 제공사 표시/링크, 국가 제한, 가사 조회 추적을 요구한다. 기존 JSON 피드에 회사명 링크 하나를 넣는 것만으로 이 조건을 충족했다고 할 수 없다.

따라서 다음 중 실제 허용된 경로를 사용한다.

1. 공급사 API: 정확한 곡을 식별하고, 허용된 지역의 요청만 처리하며, 필수 표시·조회 기록과 계약상 보관 기간을 구현한다. AI/저장이 허용되지 않으면 기존 관리자 저장·AI 경로에 투입하지 않고 별도 실시간 표시 경로를 쓴다. 학습 기능 제한을 사용자에게 먼저 설명한다.
2. 권리자로부터 학습용 원문·가공·저장 권한을 직접 확보한 자료: 기존 관리자 파이프라인을 이용할 수 있다. 실제 제공 자료와 허용 범위를 확인한 뒤 등록·검수한다.

## 공급사 문의 초안 — 아직 발송하지 않음

대상 후보: Musixmatch sales@musixmatch.com 또는 LyricFind sales@lyricfind.com. 서비스 목적과 공개 URL 외 계정·사용자 데이터·코드·비밀값은 포함하지 않는다. 발송은 별도 사용자 지시가 필요하다.

> Subject: Licensing inquiry — Japanese lyrics learning for Hanmadi (Pretender pilot)
>
> We are evaluating a small language-learning pilot at https://hanmadi-lake.vercel.app. Our first requested track is “Pretender” by Official HIGE DANDism (Official髭男dism), using its official YouTube video TQ8WlA2GXbk for playback; we will not download or redistribute the recording.
>
> Could you confirm availability of this exact track/version and Korean translations for learners in South Korea, and quote the smallest suitable pilot plan? Please distinguish static lyrics from time-synced lyrics and identify any required territory restrictions.
>
> The intended features are lyric display, Korean meaning/pronunciation guidance, segment replay and repetition practice, vocabulary and conversation exercises, and learner review/progress. Please specify whether your agreement permits sending lyrics to external AI services for educational explanations and quality review, synthesized pronunciation, and storage of source or derived learning material. If these require separate written approval, please include the applicable terms and cost. Please also specify attribution, view reporting, retention, and removal obligations.
>
> We have not enabled these uses for your catalog. Please provide sample API documentation/data without assuming a purchase or recurring subscription. Usage volume and budget will be agreed before activation.

## 검증과 다음 단계

- 소스의 현재 자료 공급 경계와 관리자 등록/게시 경로를 읽어 확인했다. 코드 변경이 없어 테스트 재실행은 하지 않았다.
- 공식 공개 요금표·약관·구현 지침과 LyricFind 제품 설명을 확인했다. API 키가 없어 Pretender 카탈로그 응답을 호출하지 않았으며 지원 여부는 미확인이다.
- 사용자에게 기존 API 계정 또는 이용 허락의 유무를 질문했다. 답변 전 신규 가입·결제·공급사 연락·가사 수집은 진행하지 않는다.
- 다음 행동: 기존 공급 계정/자료가 있으면 그 계약과 API로 연결한다. 없다면 위 문의를 통해 Pretender 한 곡의 학습용 범위와 비용을 먼저 확정한다. 운영의 이용 불가 상태는 아직 해소되지 않았다.
