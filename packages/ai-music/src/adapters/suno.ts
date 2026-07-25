/**
 * Suno 어댑터 — 가드 스텁.
 *
 * Suno 는 공식 API 가 없다(2026-07, 파트너 대상 "탐색 중"). 자동화하려면 비공식
 * 계정풀 래퍼밖에 없는데, 그건 Suno ToS 위반 + 이 프로젝트의 하드 금지선 #2
 * (플랫폼 API 우회 / 비공식 클라이언트) 위반이다. 따라서 자동 생성은 지원하지 않는다.
 *
 * 이 파일은 "공식 API 슬롯"을 예약해 둔 것이다 — 공식 API 가 나오면 여기에 구현한다.
 * 그 전까지 generateSuno() 는 비공식 엔드포인트에 절대 연결하지 않고, 명확한 안내로 실패한다.
 */

export const SUNO_OFFICIAL_API_AVAILABLE = false as const;

/** suno-auto 자동 생성 시도 → 항상 명확한 안내와 함께 실패(비공식 우회 금지). */
export async function generateSuno(): Promise<never> {
  throw new Error(
    'suno-auto: 공식 Suno API 가 없어 자동 생성을 지원하지 않습니다(비공식 래퍼는 ToS·프로젝트 금지선 위반). ' +
      '대신 suno-manual 을 쓰세요 — `ai-music prompt --backend suno-manual` 로 프롬프트를 받아 ' +
      'Suno UI(유료)에서 생성·다운로드한 뒤 `ai-music mix` 로 광고에 입히면 됩니다. ' +
      '공식 Suno API 가 출시되면 이 어댑터에 구현됩니다.',
  );
}
