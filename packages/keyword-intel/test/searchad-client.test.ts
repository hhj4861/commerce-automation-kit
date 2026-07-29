/**
 * 검색광고 keywordstool 어댑터 테스트 — undici MockAgent 로 HTTP 목킹.
 * 파싱("<10" 마스킹·compIdx 한국어 매핑·정렬), HMAC 서명 헤더, 오류 표면화를 실제 코드 경로로 검증.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, type Dispatcher } from 'undici';
import {
  keywordTool,
  loadSearchAdCredentials,
  SearchAdApiError,
} from '../src/adapters/searchad-client.js';

let mockAgent: MockAgent;
let prevDispatcher: Dispatcher;

beforeEach(() => {
  prevDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
});

afterEach(async () => {
  await mockAgent.close();
  setGlobalDispatcher(prevDispatcher);
});

const cred = { customerId: 'C1', apiKey: 'K1', secretKey: 'S1' };

function reply(body: unknown, status = 200): { captured: { headers?: unknown } } {
  const captured: { headers?: unknown } = {};
  mockAgent
    .get('https://api.searchad.naver.com')
    .intercept({ path: (p) => p.startsWith('/keywordstool'), method: 'GET' })
    .reply((opts) => {
      captured.headers = opts.headers;
      return { statusCode: status, data: JSON.stringify(body) };
    });
  return { captured };
}

describe('keywordTool — 파싱', () => {
  it('절대검색수/경쟁도 파싱 + 검색량 내림차순 정렬', async () => {
    reply({
      keywordList: [
        { relKeyword: '알부틴', monthlyPcQcCnt: 100, monthlyMobileQcCnt: 250, compIdx: '중간' },
        { relKeyword: '데오드란트', monthlyPcQcCnt: 12300, monthlyMobileQcCnt: 33710, compIdx: '높음' },
      ],
    });
    const rows = await keywordTool(cred, '알부틴');
    expect(rows[0]!.relKeyword).toBe('데오드란트'); // 검색량 큰 게 먼저
    expect(rows[0]!.monthlyPc).toBe(12300);
    expect(rows[0]!.compIdx).toBe('high');
    expect(rows[1]!.compIdx).toBe('mid');
  });

  it('"< 10" 마스킹 → null + masked=true (진짜 0 과 구분)', async () => {
    reply({
      keywordList: [{ relKeyword: '희귀어', monthlyPcQcCnt: '< 10', monthlyMobileQcCnt: '< 10', compIdx: '낮음' }],
    });
    const rows = await keywordTool(cred, '희귀어');
    expect(rows[0]!.monthlyPc).toBeNull();
    expect(rows[0]!.masked).toBe(true);
    expect(rows[0]!.compIdx).toBe('low');
  });

  it('알 수 없는 compIdx 는 null(투명화)', async () => {
    reply({ keywordList: [{ relKeyword: 'x', monthlyPcQcCnt: 5, monthlyMobileQcCnt: 5, compIdx: '???' }] });
    const rows = await keywordTool(cred, 'x');
    expect(rows[0]!.compIdx).toBeNull();
  });

  it('빈 keywordList 도 안전', async () => {
    reply({ keywordList: [] });
    expect(await keywordTool(cred, 'x')).toEqual([]);
  });
});

describe('keywordTool — 서명/오류', () => {
  it('HMAC 서명 헤더를 모두 실어 보낸다', async () => {
    const { captured } = reply({ keywordList: [] });
    await keywordTool(cred, '알부틴', () => 1_700_000_000_000);
    // 헤더 키 대소문자는 undici 판본에 따라 다를 수 있어 소문자 정규화 후 검증.
    const raw = (captured.headers ?? {}) as Record<string, string>;
    const h: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) h[k.toLowerCase()] = v;
    expect(h['x-timestamp']).toBe('1700000000000');
    expect(h['x-api-key']).toBe('K1');
    expect(h['x-customer']).toBe('C1');
    expect(typeof h['x-signature']).toBe('string');
    expect((h['x-signature'] ?? '').length).toBeGreaterThan(0);
  });

  it('비200 → SearchAdApiError (429 는 rateLimited)', async () => {
    reply({ msg: 'too many' }, 429);
    await expect(keywordTool(cred, 'x')).rejects.toMatchObject({ status: 429, rateLimited: true });
  });
});

describe('loadSearchAdCredentials', () => {
  const KEYS = ['NAVER_AD_CUSTOMER_ID', 'NAVER_AD_API_KEY', 'NAVER_AD_SECRET_KEY'] as const;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it('일부라도 없으면 null', () => {
    delete process.env.NAVER_AD_SECRET_KEY;
    process.env.NAVER_AD_CUSTOMER_ID = 'c';
    process.env.NAVER_AD_API_KEY = 'k';
    expect(loadSearchAdCredentials()).toBeNull();
  });

  it('셋 다 있으면 로드', () => {
    process.env.NAVER_AD_CUSTOMER_ID = 'c';
    process.env.NAVER_AD_API_KEY = 'k';
    process.env.NAVER_AD_SECRET_KEY = 's';
    expect(loadSearchAdCredentials()).toEqual({ customerId: 'c', apiKey: 'k', secretKey: 's' });
  });
});
