/**
 * 네이버 공식 API 어댑터 — 이 모듈에서 "외부 세계"와 닿는 유일한 지점.
 *
 * ⚠️ 스크래핑/에뮬레이터/비공식 엔드포인트는 이 파일에 절대 추가하지 않는다.
 *    (blueprint-review 감사: 스크래핑=저작권법 §136 비친고죄 / 우회=플랫폼 ToS 위반)
 *    공식 openapi.naver.com 엔드포인트만 사용한다.
 *
 * ✅ [D1 실측 완료 2026-07-23] 엔드포인트/파라미터/한도는 developers.naver.com 공식 문서
 *    원문으로 검증됨(실측→회의적 재대조 2패스). 근거: docs/IMPLEMENTATION.md §0 (D1-1~D1-4).
 *    단, 이용약관(D1-5)은 자동 접근 차단으로 미확정 → compliance 기본값은 보수적으로 유지한다.
 */
import { Agent, request } from 'undici';
import { z } from 'zod';

/**
 * 네이버 API 전용 커넥션 정책. G2 실수집에서 ~61초 간격 ECONNRESET 버스트가 관측됐는데,
 * 서버가 닫은 keep-alive 소켓을 재사용하다 죽은 연결에서 긴 행(hang) 후 리셋되는 전형 패턴이다.
 * (1) 유휴 1초 넘은 소켓은 재사용하지 않고, (2) 요청도 15초에서 끊어 행 대신
 * 빠른 실패→백오프 재시도로 전환한다(회복은 collect 의 withRetry 담당).
 *
 * 적용: CLI 진입점(cli/index.ts)이 setGlobalDispatcher 로 전역 설정한다.
 * (어댑터가 dispatcher 를 직접 지정하면 테스트의 MockAgent 전역 주입이 우회되기 때문)
 * 라이브러리로 조합하는 소비자도 동일하게 setGlobalDispatcher(tunedNaverAgent) 권장.
 */
export const tunedNaverAgent = new Agent({
  keepAliveTimeout: 1_000,
  keepAliveMaxTimeout: 1_000,
  // datalab 은 실측상 응답이 느리다(15초는 과도해 대량 타임아웃 유발). 60초 행은 막되
  // 정상 응답은 기다린다. 타임아웃은 재시도 대상이며 환불 대상은 아니다(요청은 서버에 도달).
  headersTimeout: 30_000,
  bodyTimeout: 30_000,
});
import {
  shopSearchResultSchema,
  datalabResultSchema,
  shoppingInsightResultSchema,
  type ShopSearchResult,
  type DatalabResult,
  type ShoppingInsightResult,
} from './schemas.js';

// 응답 타입은 zod 스키마에서 파생(단일 소스). 소비 모듈(core/test)은 계속 이 파일에서 import 한다.
export type { ShopItem, ShopSearchResult, DatalabResult, ShoppingInsightResult } from './schemas.js';

const SEARCH_SHOP_URL = 'https://openapi.naver.com/v1/search/shop.json'; // D1-1 (GET)
const DATALAB_SEARCH_URL = 'https://openapi.naver.com/v1/datalab/search'; // D1-3 (POST, application/json)
const DATALAB_SHOPPING_KEYWORDS_URL = 'https://openapi.naver.com/v1/datalab/shopping/category/keywords'; // D1-4 (POST)
// 데이터랩 쇼핑인사이트(D1-4, 각 POST): /v1/datalab/shopping/{categories | category/device | category/gender
//   | category/age | category/keywords | category/keyword/device | category/keyword/gender | category/keyword/age}
//   category 코드 = 네이버쇼핑 URL 의 cat_id (예: 패션의류 50000000, 화장품/미용 50000002). Phase 2+ 에서 추가.

/**
 * 공식 문서 실측 상수 (D1-1~D1-4 검증 완료). 한도 우회 금지 — LEGAL-BOUNDARY 경계 4.
 * 이 값들은 예산 게이트(budget/)와 zod 스키마의 단일 진실 소스로 쓴다.
 */
export const NAVER_LIMITS = {
  SEARCH_DISPLAY_DEFAULT: 10,
  SEARCH_DISPLAY_MAX: 100, // 오류코드 SE02: display 허용범위 1~100
  SEARCH_START_DEFAULT: 1,
  SEARCH_START_MAX: 1000, // 오류코드 SE03: start 허용범위 1~1000
  SEARCH_DAILY_CALL_LIMIT: 25000, // 검색 API 통합, client ID별 합산. 초과 시 HTTP 429
  DATALAB_MAX_KEYWORD_GROUPS: 5,
  DATALAB_MAX_KEYWORDS_PER_GROUP: 20,
  DATALAB_DAILY_CALL_LIMIT: 1000, // 트렌드·쇼핑인사이트 각각 1,000/일 (별도 카운터)
  DATALAB_SEARCH_START_MIN: '2016-01-01', // 트렌드 조회 가능 최초일
  DATALAB_SHOPPING_START_MIN: '2017-08-01', // 쇼핑인사이트 조회 가능 최초일 (D1-4, 트렌드와 다름)
} as const;

/** 쇼핑인사이트 ages 허용 코드 (D1-4: 10~60 10단위, 트렌드의 1~11 과 코드 체계가 다름). */
const SHOPPING_AGE_CODES: readonly string[] = ['10', '20', '30', '40', '50', '60'];

export interface NaverCredentials {
  clientId: string;
  clientSecret: string;
}

function authHeaders(c: NaverCredentials): Record<string, string> {
  return {
    'X-Naver-Client-Id': c.clientId,
    'X-Naver-Client-Secret': c.clientSecret,
  };
}

/**
 * 쇼핑 검색 (D1-1 검증). display 1~100(기본 10), start 1~1000(기본 1).
 * sort: sim(정확도, 기본)|date(날짜)|asc(가격오름)|dsc(가격내림).
 * display/start 는 허용범위로 clamp 해 SE02/SE03 오류를 사전 차단한다.
 */
export async function searchShop(
  cred: NaverCredentials,
  query: string,
  opts: { display?: number; start?: number; sort?: 'sim' | 'date' | 'asc' | 'dsc' } = {},
): Promise<ShopSearchResult> {
  const display = clampInt(opts.display ?? 40, 1, NAVER_LIMITS.SEARCH_DISPLAY_MAX);
  const start = clampInt(opts.start ?? NAVER_LIMITS.SEARCH_START_DEFAULT, 1, NAVER_LIMITS.SEARCH_START_MAX);
  const params = new URLSearchParams({
    query,
    display: String(display),
    start: String(start),
    sort: opts.sort ?? 'sim',
  });
  const res = await request(`${SEARCH_SHOP_URL}?${params.toString()}`, {
    method: 'GET',
    headers: authHeaders(cred),
  });
  if (res.statusCode !== 200) {
    const body = await res.body.text();
    throw new NaverApiError('search_shop', res.statusCode, body);
  }
  return parseResponse('search_shop', shopSearchResultSchema, await res.body.json());
}

export interface DatalabKeywordGroup {
  groupName: string;
  keywords: string[]; // D1-3 확정: 그룹당 최대 20 — searchTrend 요청 가드로 강제
}

/**
 * 통합검색어 트렌드 (D1-3 검증). POST application/json.
 * keywordGroups 최대 5, 그룹당 keywords 최대 20, startDate ≥ 2016-01-01.
 * ratio 는 기간 내 상대값(0~100)이며 절대 검색량이 아니다 — 계약에서 RelativeIndex 로 강제.
 */
export async function searchTrend(
  cred: NaverCredentials,
  body: {
    startDate: string;
    endDate: string;
    timeUnit: 'date' | 'week' | 'month';
    keywordGroups: DatalabKeywordGroup[];
    device?: 'pc' | 'mo';
    ages?: string[];
    gender?: 'm' | 'f';
  },
): Promise<DatalabResult> {
  if (
    body.keywordGroups.length === 0 ||
    body.keywordGroups.length > NAVER_LIMITS.DATALAB_MAX_KEYWORD_GROUPS
  ) {
    throw new Error(`keywordGroups 는 1~${NAVER_LIMITS.DATALAB_MAX_KEYWORD_GROUPS}개여야 한다 (D1-3)`);
  }
  for (const g of body.keywordGroups) {
    if (g.keywords.length === 0 || g.keywords.length > NAVER_LIMITS.DATALAB_MAX_KEYWORDS_PER_GROUP) {
      throw new Error(
        `keywords 는 그룹당 1~${NAVER_LIMITS.DATALAB_MAX_KEYWORDS_PER_GROUP}개여야 한다 (D1-3, group=${g.groupName})`,
      );
    }
  }
  if (body.startDate < NAVER_LIMITS.DATALAB_SEARCH_START_MIN) {
    throw new Error(`startDate 는 ${NAVER_LIMITS.DATALAB_SEARCH_START_MIN} 이후여야 한다 (D1-3)`);
  }
  const res = await request(DATALAB_SEARCH_URL, {
    method: 'POST',
    headers: { ...authHeaders(cred), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.statusCode !== 200) {
    const text = await res.body.text();
    throw new NaverApiError('datalab_search', res.statusCode, text);
  }
  return parseResponse('datalab_search', datalabResultSchema, await res.body.json());
}

export interface ShoppingKeywordGroup {
  name: string; // 그룹 이름(우리는 키워드 자체를 넣음)
  param: string[]; // D1-4 확정: 그룹당 정확히 1개(비교 검색어) — 요청 가드로 강제
}

/**
 * 쇼핑인사이트 분야별 키워드 트렌드 (D1-4 실측). POST application/json.
 * 일반 검색 트렌드(searchTrend)와 달리 **네이버쇼핑/쇼핑영역의 검색 클릭 추이**를 준다
 * → "커머스 맥락 수요" 축. category(cat_id) 스코프 필수(전체 목록/조회 API 없음 — 수동 확인, D1-4).
 * keyword 그룹 최대 5, 그룹당 param 정확히 1개, startDate ≥ 2017-08-01, ratio 는 상대값(0~100).
 * 별도 1,000/일 카운터(source: naver_datalab_shopping).
 */
export async function shoppingCategoryKeywords(
  cred: NaverCredentials,
  body: {
    startDate: string;
    endDate: string;
    timeUnit: 'date' | 'week' | 'month';
    category: string; // cat_id
    keyword: ShoppingKeywordGroup[];
    device?: 'pc' | 'mo';
    gender?: 'm' | 'f';
    ages?: string[]; // D1-4: 10~60 (트렌드의 1~11 과 코드 체계가 다름)
  },
): Promise<ShoppingInsightResult> {
  if (!body.category) throw new Error('category(cat_id) 는 필수다 (D1-4)');
  if (
    body.keyword.length === 0 ||
    body.keyword.length > NAVER_LIMITS.DATALAB_MAX_KEYWORD_GROUPS
  ) {
    throw new Error(`keyword 는 1~${NAVER_LIMITS.DATALAB_MAX_KEYWORD_GROUPS}개여야 한다 (D1-4)`);
  }
  for (const g of body.keyword) {
    if (g.param.length !== 1) {
      throw new Error(`param 은 그룹당 정확히 1개여야 한다 (D1-4, group=${g.name})`);
    }
  }
  // ages 코드 검증 — 쇼핑인사이트는 10~60(10 단위), 트렌드의 1~11 과 다르다(D1-4). 잘못된 코드를
  // 넘기면 라이브 API 400 으로만 드러나므로(쿼터 소비) 호출 전 차단한다.
  if (body.ages && body.ages.some((a) => !SHOPPING_AGE_CODES.includes(a))) {
    throw new Error(`ages 코드는 ${SHOPPING_AGE_CODES.join('/')} 만 허용된다 (D1-4, 트렌드의 1~11 과 다름)`);
  }
  if (body.startDate < NAVER_LIMITS.DATALAB_SHOPPING_START_MIN) {
    throw new Error(`startDate 는 ${NAVER_LIMITS.DATALAB_SHOPPING_START_MIN} 이후여야 한다 (D1-4)`);
  }
  const res = await request(DATALAB_SHOPPING_KEYWORDS_URL, {
    method: 'POST',
    headers: { ...authHeaders(cred), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.statusCode !== 200) {
    const text = await res.body.text();
    throw new NaverApiError('datalab_shopping', res.statusCode, text);
  }
  return parseResponse('datalab_shopping', shoppingInsightResultSchema, await res.body.json());
}

export class NaverApiError extends Error {
  constructor(
    public readonly api: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`[naver:${api}] HTTP ${status} — ${body.slice(0, 200)}`);
    this.name = 'NaverApiError';
  }

  /**
   * HTTP 429 = 호출 한도 초과(일일 또는 초당). 상태코드만으로는 둘을 구분할 수 없어(D1-2),
   * 일일 소진 vs 초당 스로틀 판별은 budget/ledger 로 한다(Phase 2). 재시도 정책의 분기점.
   */
  get rateLimited(): boolean {
    return this.status === 429;
  }
}

/** 파라미터를 공식 허용범위로 clamp (SE02/SE03 오류 사전 차단). */
function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}

/** 응답 스키마 불일치를 표면화하는 오류(외부 API 스키마 변경 감지 — silent drop 금지). */
export class NaverSchemaError extends Error {
  constructor(
    public readonly api: string,
    public readonly issues: string,
  ) {
    super(`[naver:${api}] 응답 스키마 불일치 — ${issues.slice(0, 300)}`);
    this.name = 'NaverSchemaError';
  }
}

/** zod 로 원응답을 검증. 실패 시 NaverSchemaError 로 던져 collect 의 failures 로 잡히게 한다. */
function parseResponse<S extends z.ZodTypeAny>(api: string, schema: S, raw: unknown): z.infer<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new NaverSchemaError(api, r.error.message);
  return r.data;
}
