import type { MetaPaidReachConfig, MetaPaidReachState } from '@cak/contracts';

export function validConfig(): MetaPaidReachConfig {
  return {
    name: 'Meta paid reach test',
    creative: {
      source: { kind: 'meta-video-id', value: 'video-1' },
      pageId: 'page-1',
      landingPageUrl: 'https://example.com/product',
      message: '검수된 테스트 광고',
      headline: '상품 보기',
      callToAction: 'LEARN_MORE',
    },
    targeting: {
      countries: ['KR'],
      ageMin: 25,
      ageMax: 44,
      publisherPlatforms: ['facebook'],
    },
    budget: {
      lifetimeBudgetMinorUnits: 15_000,
      pauseAtSpendAccountCurrency: 15_000,
      startTime: '2030-01-01T00:00:00+09:00',
      endTime: '2030-01-02T00:00:00+09:00',
    },
    limits: { targetImpressions: 1_000 },
    specialAdCategories: [],
    compliance: {
      creativeRightsConfirmed: true,
      humanApproved: true,
      approvedBy: 'tester',
      approvedAt: '2026-09-04T12:00:00+09:00',
    },
  };
}

export function validState(): MetaPaidReachState {
  return {
    schemaVersion: 1,
    apiVersion: 'v26.0',
    adAccountId: '123',
    config: validConfig(),
    ids: {
      campaignId: 'campaign-1',
      adSetId: 'adset-1',
      videoId: 'video-1',
      creativeId: 'creative-1',
      adId: 'ad-1',
    },
    createdAt: '2026-09-04T00:00:00.000Z',
  };
}
