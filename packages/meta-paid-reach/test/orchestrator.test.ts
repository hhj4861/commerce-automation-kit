import { describe, expect, it, vi } from 'vitest';
import type { MetaPaidReachConfig, MetaPaidReachState } from '@cak/contracts';
import {
  checkAndPause,
  createPaused,
  runGuarded,
  type MetaOperations,
} from '../src/orchestrator.js';
import { validState } from './fixture.js';

function fakeApi(
  insights: Array<{ impressions?: string; spend?: string; account_currency?: string } | undefined>,
): MetaOperations & { statuses: Array<[string, 'ACTIVE' | 'PAUSED']> } {
  let read = 0;
  const statuses: Array<[string, 'ACTIVE' | 'PAUSED']> = [];
  return {
    statuses,
    createCampaign: vi.fn(async () => 'campaign-1'),
    createAdSet: vi.fn(async (_config: MetaPaidReachConfig, _campaignId: string) => 'adset-1'),
    uploadVideo: vi.fn(async () => 'video-1'),
    getVideoStatus: vi.fn(async () => ({ status: { video_status: 'ready' } })),
    createCreative: vi.fn(async () => 'creative-1'),
    createAd: vi.fn(async () => 'ad-1'),
    getAdStatus: vi.fn(async () => ({
      id: 'ad-1',
      status: 'ACTIVE',
      effective_status: 'ACTIVE',
    })),
    getAdSetSafety: vi.fn(async () => ({
      id: 'adset-1',
      status: 'PAUSED',
      effective_status: 'CAMPAIGN_PAUSED',
      lifetime_budget: '15000',
      end_time: '2026-09-06T00:00:00+09:00',
    })),
    getAdInsights: vi.fn(async () => {
      const value = insights[Math.min(read, insights.length - 1)];
      read += 1;
      return value;
    }),
    setStatus: vi.fn(async (id: string, status: 'ACTIVE' | 'PAUSED') => {
      statuses.push([id, status]);
    }),
  };
}

const persist = vi.fn((_state: MetaPaidReachState) => undefined);

describe('PAUSED 생성과 자동 중지', () => {
  it('중간 상태를 매 단계 저장하며 전체 객체 ID를 만든다', async () => {
    const api = fakeApi([]);
    const state = validState();
    state.ids = {};
    const save = vi.fn();
    await createPaused(api, state, save);
    expect(state.ids).toEqual({
      campaignId: 'campaign-1',
      adSetId: 'adset-1',
      videoId: 'video-1',
      creativeId: 'creative-1',
      adId: 'ad-1',
    });
    expect(save).toHaveBeenCalledTimes(5);
  });

  it('새 영상은 ready가 된 뒤에만 creative를 만든다', async () => {
    const api = fakeApi([]);
    const state = validState();
    state.ids = {};
    state.config.creative.source = {
      kind: 'hosted-url',
      value: 'https://cdn.example.com/ad.mp4',
    };
    vi.mocked(api.getVideoStatus)
      .mockResolvedValueOnce({ status: { video_status: 'processing' } })
      .mockResolvedValueOnce({ status: { video_status: 'ready' } });
    await createPaused(api, state, vi.fn(), {
      videoPollMs: 0,
      videoMaxChecks: 2,
      sleep: async () => undefined,
    });
    expect(api.getVideoStatus).toHaveBeenCalledTimes(2);
    const videoReadyOrder = vi.mocked(api.getVideoStatus).mock.invocationCallOrder.at(-1) ?? 0;
    const creativeOrder = vi.mocked(api.createCreative).mock.invocationCallOrder[0] ?? 0;
    expect(creativeOrder).toBeGreaterThan(videoReadyOrder);
  });

  it('1,000 impressions면 campaign부터 PAUSE한다', async () => {
    const api = fakeApi([{ impressions: '1000', spend: '7300', account_currency: 'KRW' }]);
    const state = validState();
    const result = await checkAndPause(api, state, persist, true);
    expect(result.paused).toBe(true);
    expect(result.snapshot.targetReached).toBe(true);
    expect(state.pauseReason).toBe('target-impressions');
    expect(api.statuses).toEqual([
      ['campaign-1', 'PAUSED'],
      ['adset-1', 'PAUSED'],
      ['ad-1', 'PAUSED'],
    ]);
  });

  it('노출 전이라도 지출 상한이면 PAUSE한다', async () => {
    const api = fakeApi([{ impressions: '700', spend: '15000', account_currency: 'KRW' }]);
    const state = validState();
    const result = await checkAndPause(api, state, persist, true);
    expect(result.snapshot.spendLimitReached).toBe(true);
    expect(state.pauseReason).toBe('spend-limit');
  });

  it('run은 자식부터 ACTIVE하고 목표 도달 시 campaign부터 PAUSE한다', async () => {
    const api = fakeApi([
      { impressions: '0', spend: '0' },
      { impressions: '1001', spend: '8000' },
    ]);
    const state = validState();
    const result = await runGuarded(api, state, persist, {
      intervalMs: 0,
      maxChecks: 1,
      sleep: async () => undefined,
    });
    expect(result.pauseReason).toBe('target-impressions');
    expect(api.statuses).toEqual([
      ['ad-1', 'ACTIVE'],
      ['adset-1', 'ACTIVE'],
      ['campaign-1', 'ACTIVE'],
      ['campaign-1', 'PAUSED'],
      ['adset-1', 'PAUSED'],
      ['ad-1', 'PAUSED'],
    ]);
  });

  it('원격 Ad Set 예산이 승인값보다 커졌으면 활성화하지 않는다', async () => {
    const api = fakeApi([{ impressions: '0', spend: '0' }]);
    vi.mocked(api.getAdSetSafety).mockResolvedValueOnce({
      id: 'adset-1',
      status: 'PAUSED',
      effective_status: 'CAMPAIGN_PAUSED',
      lifetime_budget: '15001',
      end_time: '2026-09-06T00:00:00+09:00',
    });
    const state = validState();
    await expect(
      runGuarded(api, state, persist, {
        intervalMs: 0,
        maxChecks: 1,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow('승인 설정');
    expect(api.statuses.every(([, status]) => status === 'PAUSED')).toBe(true);
  });

  it('원격 Ad Set이 이미 ACTIVE이면 중지하고 재활성화하지 않는다', async () => {
    const api = fakeApi([{ impressions: '0', spend: '0' }]);
    vi.mocked(api.getAdSetSafety).mockResolvedValueOnce({
      id: 'adset-1',
      status: 'ACTIVE',
      effective_status: 'ACTIVE',
      lifetime_budget: '15000',
      end_time: '2026-09-06T00:00:00+09:00',
    });
    const state = validState();
    await expect(
      runGuarded(api, state, persist, {
        intervalMs: 0,
        maxChecks: 1,
        sleep: async () => undefined,
      }),
    ).rejects.toThrow('PAUSED가 아님');
    expect(api.statuses).toEqual([
      ['campaign-1', 'PAUSED'],
      ['adset-1', 'PAUSED'],
      ['ad-1', 'PAUSED'],
    ]);
  });
});
