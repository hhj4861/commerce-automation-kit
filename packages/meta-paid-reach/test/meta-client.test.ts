import { describe, expect, it, vi } from 'vitest';
import { MetaApiError, MetaClient } from '../src/meta-client.js';
import { validConfig } from './fixture.js';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('MetaClient', () => {
  it('campaign을 Bearer 인증 + form body + PAUSED로 생성한다', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: 'campaign-1' }));
    const client = new MetaClient({
      accessToken: 'secret-token',
      adAccountId: '123',
      apiVersion: 'v26.0',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(client.createCampaign(validConfig())).resolves.toBe('campaign-1');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe('https://graph.facebook.com/v26.0/act_123/campaigns');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
    const body = init.body as URLSearchParams;
    expect(body.get('status')).toBe('PAUSED');
    expect(body.get('objective')).toBe('OUTCOME_AWARENESS');
  });

  it('Insights가 비어 있으면 undefined를 반환한다', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ data: [] }));
    const client = new MetaClient({
      accessToken: 'token',
      adAccountId: '123',
      apiVersion: 'v26.0',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(client.getAdInsights('ad-1')).resolves.toBeUndefined();
    const [url] = fetchMock.mock.calls[0] as unknown as [URL];
    expect(url.searchParams.get('fields')).toContain('impressions');
    expect(url.searchParams.get('fields')).toContain('spend');
  });

  it('활성화 전 Ad Set 예산과 종료 시각을 조회한다', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        id: 'adset-1',
        status: 'PAUSED',
        effective_status: 'CAMPAIGN_PAUSED',
        lifetime_budget: '15000',
        end_time: '2026-09-06T00:00:00+09:00',
      }),
    );
    const client = new MetaClient({
      accessToken: 'token',
      adAccountId: '123',
      apiVersion: 'v26.0',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(client.getAdSetSafety('adset-1')).resolves.toMatchObject({
      lifetime_budget: '15000',
    });
    const [url] = fetchMock.mock.calls[0] as unknown as [URL];
    expect(url.searchParams.get('fields')).toContain('lifetime_budget');
    expect(url.searchParams.get('fields')).toContain('end_time');
  });

  it('Meta 오류의 code/subcode/transient/trace를 보존한다', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          error: {
            message: 'rate limited',
            code: 4,
            error_subcode: 99,
            is_transient: true,
            fbtrace_id: 'trace-1',
          },
        },
        400,
      ),
    );
    const client = new MetaClient({
      accessToken: 'token',
      adAccountId: '123',
      apiVersion: 'v26.0',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const error = await client.getAdStatus('ad-1').catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(MetaApiError);
    expect(error).toMatchObject({
      code: 4,
      subcode: 99,
      transient: true,
      traceId: 'trace-1',
    });
  });
});
