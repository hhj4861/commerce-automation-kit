// meta-paid-reach ↔ 소비자 계약.
// Meta 공식 Marketing API로 PAUSED 상태의 광고 구조를 만들고, 사람 승인 후에만
// 활성화한다. 노출 목표 또는 지출 상한에 닿으면 캠페인부터 PAUSE한다.

export type MetaCreativeSource =
  | { kind: 'local-file'; value: string }
  | { kind: 'hosted-url'; value: string }
  | { kind: 'meta-video-id'; value: string };

export interface MetaPaidReachConfig {
  name: string;
  creative: {
    source: MetaCreativeSource;
    pageId: string;
    instagramActorId?: string;
    landingPageUrl: string;
    message: string;
    headline?: string;
    thumbnailUrl?: string;
    callToAction?: 'LEARN_MORE' | 'SHOP_NOW';
  };
  targeting: {
    countries: string[];
    ageMin: number;
    ageMax: number;
    publisherPlatforms?: Array<'facebook' | 'instagram'>;
  };
  budget: {
    // Meta 광고 생성 API에 전달하는 최소 화폐 단위 정수.
    lifetimeBudgetMinorUnits: number;
    // Insights spend가 사용하는 광고 계정 통화 단위.
    pauseAtSpendAccountCurrency: number;
    startTime: string;
    endTime: string;
  };
  limits: {
    targetImpressions: number;
  };
  specialAdCategories: string[];
  compliance: {
    creativeRightsConfirmed: boolean;
    humanApproved: boolean;
    approvedBy?: string;
    approvedAt?: string;
    notes?: string;
  };
}

export interface MetaPaidReachIds {
  campaignId?: string;
  adSetId?: string;
  videoId?: string;
  creativeId?: string;
  adId?: string;
}

export interface MetaPaidReachSnapshot {
  checkedAt: string;
  adId: string;
  status: string;
  effectiveStatus: string;
  impressions: number;
  spendAccountCurrency: number;
  accountCurrency?: string;
  targetImpressions: number;
  pauseAtSpendAccountCurrency: number;
  targetReached: boolean;
  spendLimitReached: boolean;
  shouldPause: boolean;
}

export interface MetaPaidReachState {
  schemaVersion: 1;
  apiVersion: string;
  adAccountId: string;
  config: MetaPaidReachConfig;
  ids: MetaPaidReachIds;
  createdAt: string;
  activatedAt?: string;
  pausedAt?: string;
  pauseReason?: 'target-impressions' | 'spend-limit' | 'monitor-failure' | 'monitor-timeout' | 'manual';
  lastSnapshot?: MetaPaidReachSnapshot;
  failures?: string[];
}
