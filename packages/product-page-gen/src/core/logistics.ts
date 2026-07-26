/**
 * Qxpress 물류 게이트 — 발송 가능성 판정 + 배송비 추정.
 *
 * 요율 출전: Qxpress DPC 해외배송 안내문 Ver.2023.9.21 (요율 2023-08-01 적용).
 * ⚠️ TODO(D1): 요율표가 2023년판 — 입점 후 J'QSM 에서 현행 요율 재확인 전까지 "추정치"로만 취급.
 * 규칙(안내문 원문 확인):
 * - Economy: 우편함 투함. 1kg & A4(31.2×22.8cm) & 두께 2.5cm 이내만. 초과 시 Standard 전환.
 *   분실·파손 보상 불가. 셀러 등급 Silver/Green 요율.
 * - Standard: 등급 Gold/Silver/Green 요율. 규격 초과 시 Express 전환.
 * - 부피무게 = (가로×세로×높이 cm)/6,000 kg — 실측과 비교해 무거운 쪽 적용.
 * - 오키나와/낙도 +500엔(주소별이라 여기선 note 처리), 관세·세금 발생 시 셀러 부담. 최대 30kg.
 */
import type { LogisticsCheck } from '@cak/contracts';

export type QxService = 'economy' | 'standard' | 'express';
/** 셀러 등급. 신규 셀러의 시작 등급은 미확인 — 보수적으로 최고가인 green 기본. TODO(D1) */
export type QxGrade = 'gold' | 'silver' | 'green';

/** [무게상한g, 요금] 오름차순. 2023-08-01 요율. */
const ECONOMY: Record<Exclude<QxGrade, 'gold'>, Array<[number, number]>> = {
  silver: [[100, 397], [300, 418], [500, 480], [750, 553], [1000, 625]],
  green: [[100, 405], [300, 425], [500, 485], [750, 558], [1000, 630]],
};

const STANDARD: Record<QxGrade, Array<[number, number]>> = {
  gold: [[100, 440], [300, 559], [500, 619], [750, 685], [1000, 727], [1500, 829], [2000, 929], [2500, 1030], [3000, 1078], [3500, 1173], [4000, 1268], [4500, 1363], [5000, 1458]],
  silver: [[100, 490], [300, 609], [500, 669], [750, 735], [1000, 777], [1500, 879], [2000, 979], [2500, 1080], [3000, 1178], [3500, 1273], [4000, 1368], [4500, 1463], [5000, 1558]],
  green: [[100, 540], [300, 648], [500, 730], [750, 833], [1000, 935], [1500, 970], [2000, 1010], [2500, 1115], [3000, 1220], [3500, 1325], [4000, 1430], [4500, 1535], [5000, 1610]],
};

const EXPRESS: Array<[number, number]> = [
  [500, 1927], [750, 2009], [1000, 2091], [1250, 2255], [1500, 2337], [1750, 2542],
  [2000, 2706], [2500, 2829], [3000, 2993], [3500, 3116], [4000, 3280], [4500, 3403], [5000, 3526],
];

/** Economy 규격 상수 (안내문 원문). */
export const ECONOMY_LIMIT = { maxG: 1000, maxWcm: 31.2, maxHcm: 22.8, maxTcm: 2.5 } as const;

const FLAMMABLE_PATTERNS: RegExp[] = [
  /スプレー|ミスト|香水|フレグランス|ヘアカラー|染毛剤?/u,
  /스프레이|미스트|향수|퍼퓸|염색약?|염모제?/u,
  /\b(spray|mist|perfume|fragrance|hair\s?color)\b/iu,
];

export interface Dims {
  wCm: number;
  hCm: number;
  tCm: number;
}

/** 부피무게(g). */
export function volumetricG(d: Dims): number {
  return ((d.wCm * d.hCm * d.tCm) / 6000) * 1000;
}

/** 청구 무게(g) = max(실측, 부피). */
export function billedWeightG(actualG: number, dims?: Dims): number {
  if (!dims) return actualG;
  return Math.max(actualG, volumetricG(dims));
}

function lookup(table: Array<[number, number]>, weightG: number): number | null {
  for (const [cap, fee] of table) {
    if (weightG <= cap) return fee;
  }
  return null; // 표 범위 초과 — 5kg 초과는 상세 요금표(16p) 별도
}

/** 서비스·등급별 배송비 추정 (JPY). 표 범위 밖이면 null. */
export function estimateJpy(service: QxService, weightG: number, grade: QxGrade = 'green'): number | null {
  if (grade !== 'gold' && grade !== 'silver' && grade !== 'green') {
    throw new Error(`grade 는 gold|silver|green 중 하나여야 함: ${String(grade)}`);
  }
  if (weightG <= 0) return null;
  if (service === 'economy') {
    const g = grade === 'gold' ? 'silver' : grade; // economy 에는 gold 요율이 없다
    return lookup(ECONOMY[g], weightG);
  }
  if (service === 'standard') return lookup(STANDARD[grade], weightG);
  return lookup(EXPRESS, weightG);
}

export interface LogisticsInput {
  /** 상품명(+옵션 설명) — 인화성 키워드 검사 대상. */
  name: string;
  weightG?: number;
  dims?: Dims;
  grade?: QxGrade;
}

/** 물류 게이트 실행. */
export function checkLogistics(input: LogisticsInput): LogisticsCheck {
  const notes: string[] = [];
  const flammableMatches: string[] = [];
  for (const p of FLAMMABLE_PATTERNS) {
    const m = input.name.match(p);
    if (m && m[0]) flammableMatches.push(m[0]);
  }
  const flammable = flammableMatches.length > 0;
  if (flammable) notes.push('인화성/압력용기 의심 품목 — Qxpress 발송 불가 목록(스프레이·미스트·향수·염색약) 해당 여부를 사람이 확인할 것');

  // 잘못된 중량 입력은 미제공과 동일 취급하되 원인을 정확히 남긴다.
  let weightG = input.weightG;
  if (weightG !== undefined && weightG <= 0) {
    notes.push(`중량 값이 유효하지 않음(${weightG}g ≤ 0) — 미제공으로 처리`);
    weightG = undefined;
  }

  // Economy A4 판정: 우편함 투함에서 평면 회전은 항상 가능하므로 가로/세로는 정렬 후 비교(두께 축은 고정).
  const fitsA4 = (d: Dims): boolean => {
    const long = Math.max(d.wCm, d.hCm);
    const short = Math.min(d.wCm, d.hCm);
    return long <= ECONOMY_LIMIT.maxWcm && short <= ECONOMY_LIMIT.maxHcm && d.tCm <= ECONOMY_LIMIT.maxTcm;
  };

  let economyEligible: boolean | null = null;
  let billed: number | undefined;
  if (weightG !== undefined) {
    billed = billedWeightG(weightG, input.dims);
    if (billed > ECONOMY_LIMIT.maxG) {
      economyEligible = false;
    } else if (input.dims) {
      economyEligible = fitsA4(input.dims);
    } else {
      economyEligible = null;
      notes.push('치수 미제공 — Economy(A4·두께 2.5cm) 규격 판정 불가. 튜브·병 제형은 대부분 Standard 대상');
    }
  } else if (input.dims) {
    // 실측 중량이 없어도 치수만으로 확정 가능한 판정·하한 추정은 수행한다.
    billed = volumetricG(input.dims);
    economyEligible = billed > ECONOMY_LIMIT.maxG ? false : fitsA4(input.dims);
    notes.push('실측 중량 미제공 — 부피무게를 하한 청구무게로 사용한 최소 추정치(실측이 더 무거우면 상승)');
  } else {
    notes.push('중량·치수 모두 미제공 — 배송비 추정 불가');
  }

  const service: QxService = economyEligible === true ? 'economy' : 'standard';
  const estimated = billed !== undefined ? estimateJpy(service, billed, input.grade ?? 'green') : null;
  if (estimated === null && billed !== undefined && billed > 5000) notes.push('요율표(≤5kg) 범위 초과 — 상세 요금표 별도 확인 필요');
  notes.push('요율 2023-08-01판 추정치 — TODO(D1): J\'QSM 현행 요율 재확인 전 판매가 확정 금지');
  notes.push('오키나와·낙도 +500엔, 통관 관세·세금 발생 시 판매자 부담(미반영)');

  return { flammable, flammableMatches, economyEligible, estimatedJpy: estimated, notes };
}
