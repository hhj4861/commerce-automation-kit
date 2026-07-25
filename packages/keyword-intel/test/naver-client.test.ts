/**
 * 어댑터 계층 테스트 — undici MockAgent 로 HTTP 를 목킹해
 * zod 검증(parseResponse/NaverSchemaError)·clamp·요청 가드를 실제 코드 경로로 검증한다.
 * (collect.test.ts 는 어댑터 자체를 목킹하므로 이 계층은 여기서만 실행된다.)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici';
import {
  searchShop,
  searchTrend,
  shoppingCategoryKeywords,
  NaverApiError,
  NaverSchemaError,
  NAVER_LIMITS,
} from '../src/adapters/naver-client.js';

let mockAgent: MockAgent;
let prevDispatcher: Dispatcher;

beforeEach(() => {
  prevDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect(); // 테스트에서 실제 네이버 호출 금지(한도 보호)
  setGlobalDispatcher(mockAgent);
});

afterEach(async () => {
  await mockAgent.close();
  setGlobalDispatcher(prevDispatcher);
});

const cred = { clientId: 'id', clientSecret: 'secret' };
const validItem = {
  title: 't', link: '', image: '', lprice: '19900', hprice: '', mallName: 'M',
  productId: '1', productType: '1', brand: '', maker: '',
  category1: '', category2: '', category3: '', category4: '',
};

describe('searchShop — zod 검증 계층', () => {
  it('200 + 유효 스키마 → 파싱 성공 (lprice 는 문자열 그대로)', async () => {
    mockAgent
      .get('https://openapi.naver.com')
      .intercept({ path: /\/v1\/search\/shop\.json.*/, method: 'GET' })
      .reply(200, { total: 10, start: 1, display: 1, items: [validItem] });

    const r = await searchShop(cred, '루테인');
    expect(r.total).toBe(10);
    expect(r.items[0]!.lprice).toBe('19900');
  });

  it('200 이지만 스키마 불일치(lprice 가 숫자로 변경) → NaverSchemaError 표면화', async () => {
    mockAgent
      .get('https://openapi.naver.com')
      .intercept({ path: /\/v1\/search\/shop\.json.*/, method: 'GET' })
      .reply(200, { total: 10, start: 1, display: 1, items: [{ ...validItem, lprice: 19900 }] });

    await expect(searchShop(cred, 'kw')).rejects.toThrow(NaverSchemaError);
  });

  it('429 → NaverApiError, rateLimited=true (일일/초당 판별은 Phase 2 ledger)', async () => {
    mockAgent
      .get('https://openapi.naver.com')
      .intercept({ path: /\/v1\/search\/shop\.json.*/, method: 'GET' })
      .reply(429, { errorMessage: 'quota exceeded', errorCode: '429' });

    const err = await searchShop(cred, 'kw').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NaverApiError);
    expect((err as NaverApiError).rateLimited).toBe(true);
  });

  it('display/start 를 공식 허용범위로 clamp — SE02/SE03 사전 차단', async () => {
    let capturedPath = '';
    mockAgent
      .get('https://openapi.naver.com')
      .intercept({
        path: (p: string) => {
          capturedPath = p;
          return p.startsWith('/v1/search/shop.json');
        },
        method: 'GET',
      })
      .reply(200, { total: 0, start: 1, display: 0, items: [] });

    await searchShop(cred, 'kw', { display: 999, start: 99999 });

    const params = new URLSearchParams(capturedPath.split('?')[1]);
    expect(params.get('display')).toBe(String(NAVER_LIMITS.SEARCH_DISPLAY_MAX));
    expect(params.get('start')).toBe(String(NAVER_LIMITS.SEARCH_START_MAX));
  });
});

describe('searchTrend — D1-3 요청 가드 (호출 전 차단 → 쿼터 낭비 방지)', () => {
  const base = { startDate: '2026-04-01', endDate: '2026-07-01', timeUnit: 'week' as const };

  it('keywordGroups 0개/6개 거부', async () => {
    await expect(searchTrend(cred, { ...base, keywordGroups: [] })).rejects.toThrow(/keywordGroups/);
    const six = Array.from({ length: 6 }, (_, i) => ({ groupName: `g${i}`, keywords: ['k'] }));
    await expect(searchTrend(cred, { ...base, keywordGroups: six })).rejects.toThrow(/keywordGroups/);
  });

  it('그룹당 keywords 0개/21개 거부', async () => {
    const over = { groupName: 'g', keywords: Array.from({ length: 21 }, (_, i) => `k${i}`) };
    await expect(searchTrend(cred, { ...base, keywordGroups: [over] })).rejects.toThrow(/keywords/);
    await expect(
      searchTrend(cred, { ...base, keywordGroups: [{ groupName: 'g', keywords: [] }] }),
    ).rejects.toThrow(/keywords/);
  });

  it('startDate < 2016-01-01 거부', async () => {
    await expect(
      searchTrend(cred, {
        ...base,
        startDate: '2015-12-31',
        keywordGroups: [{ groupName: 'g', keywords: ['k'] }],
      }),
    ).rejects.toThrow(/2016-01-01/);
  });

  it('유효 요청은 통과하고 응답이 zod 검증된다', async () => {
    mockAgent
      .get('https://openapi.naver.com')
      .intercept({ path: '/v1/datalab/search', method: 'POST' })
      .reply(200, {
        startDate: '2026-04-01',
        endDate: '2026-07-01',
        timeUnit: 'week',
        results: [{ title: 'g', keywords: ['k'], data: [{ period: '2026-07-01', ratio: 42.5 }] }],
      });

    const r = await searchTrend(cred, {
      ...base,
      keywordGroups: [{ groupName: 'g', keywords: ['k'] }],
    });
    expect(r.results[0]!.data[0]!.ratio).toBe(42.5);
  });
});

describe('shoppingCategoryKeywords — D1-4 요청 가드 + 쇼핑인사이트 zod 검증', () => {
  const base = {
    startDate: '2020-01-01',
    endDate: '2026-07-01',
    timeUnit: 'week' as const,
    category: '50000002', // 화장품/미용 (D1-4 문서 예시)
  };
  const grp = (name: string, param: string[]) => ({ name, param });

  // ⚠️ 정규식은 가드 고유 메시지로 (URL 경로 '/…/category/keywords' 와 겹치는 /category/·/keyword/ 를
  //    쓰면, 가드를 지워도 undici MockNotMatchedError 메시지가 그 경로를 담아 테스트가 거짓 통과한다 — 적대적 리뷰 회귀)
  it('category 누락 거부 (호출 전 차단)', async () => {
    await expect(
      shoppingCategoryKeywords(cred, { ...base, category: '', keyword: [grp('k', ['k'])] }),
    ).rejects.toThrow(/cat_id/);
  });

  it('keyword 0개/6개 거부', async () => {
    await expect(shoppingCategoryKeywords(cred, { ...base, keyword: [] })).rejects.toThrow(/1~5개/);
    const six = Array.from({ length: 6 }, (_, i) => grp(`g${i}`, ['k']));
    await expect(shoppingCategoryKeywords(cred, { ...base, keyword: six })).rejects.toThrow(/1~5개/);
  });

  it('ages 코드 10~60 외(예: 트렌드식 3) 거부 (호출 전 차단)', async () => {
    await expect(
      shoppingCategoryKeywords(cred, { ...base, keyword: [grp('g', ['k'])], ages: ['3'] }),
    ).rejects.toThrow(/ages/);
  });

  it('param 이 정확히 1개가 아니면 거부 (0개·2개)', async () => {
    await expect(
      shoppingCategoryKeywords(cred, { ...base, keyword: [grp('g', [])] }),
    ).rejects.toThrow(/param/);
    await expect(
      shoppingCategoryKeywords(cred, { ...base, keyword: [grp('g', ['a', 'b'])] }),
    ).rejects.toThrow(/param/);
  });

  it('startDate < 2017-08-01 거부 (트렌드의 2016-01-01 과 다름)', async () => {
    await expect(
      shoppingCategoryKeywords(cred, {
        ...base,
        startDate: '2017-07-31',
        keyword: [grp('g', ['k'])],
      }),
    ).rejects.toThrow(/2017-08-01/);
  });

  it('유효 요청 통과 + 응답의 단수 keyword 필드가 zod 검증된다', async () => {
    mockAgent
      .get('https://openapi.naver.com')
      .intercept({ path: '/v1/datalab/shopping/category/keywords', method: 'POST' })
      .reply(200, {
        startDate: '2020-01-01',
        endDate: '2026-07-01',
        timeUnit: 'week',
        // ⚠️ 쇼핑인사이트는 keyword(단수). 검색 트렌드의 keywords(복수)로 오면 스키마 불일치여야 한다.
        results: [{ title: '크레아틴', keyword: ['크레아틴'], data: [{ period: '2026-07-01', ratio: 77.7 }] }],
      });

    const r = await shoppingCategoryKeywords(cred, { ...base, keyword: [grp('크레아틴', ['크레아틴'])] });
    expect(r.results[0]!.keyword).toEqual(['크레아틴']);
    expect(r.results[0]!.data[0]!.ratio).toBe(77.7);
  });

  it('응답 스키마 불일치(keyword 누락)는 NaverSchemaError 로 표면화', async () => {
    mockAgent
      .get('https://openapi.naver.com')
      .intercept({ path: '/v1/datalab/shopping/category/keywords', method: 'POST' })
      .reply(200, {
        startDate: '2020-01-01',
        endDate: '2026-07-01',
        timeUnit: 'week',
        results: [{ title: '크레아틴', data: [{ period: '2026-07-01', ratio: 77.7 }] }], // keyword 없음
      });
    await expect(
      shoppingCategoryKeywords(cred, { ...base, keyword: [grp('크레아틴', ['크레아틴'])] }),
    ).rejects.toThrow(NaverSchemaError);
  });
});
