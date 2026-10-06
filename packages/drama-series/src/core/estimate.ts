/** 힉스필드 get_cost 조회일. 생성 직전에 다시 조회해 이 표를 갱신한다. */
export const RATE_MEASURED_AT = '2026-10-06';

/** 크레딧/초. 표에 없는 조합은 미실측(null) — 지어내지 않는다. */
export const CREDIT_RATES: Readonly<Record<string, number>> = {
  'seedance_2_5|480p|draft': 3,
  'seedance_2_5|480p|final': 3,
  'seedance_2_5|720p|final': 7,
};

export function creditsFor(model: string, resolution: string, draft: boolean, seconds: number): number | null {
  const rate = CREDIT_RATES[`${model}|${resolution}|${draft ? 'draft' : 'final'}`];
  return rate === undefined ? null : rate * seconds;
}
