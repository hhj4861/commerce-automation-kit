import type { MetaPaidReachConfig, MetaPaidReachSnapshot } from '@cak/contracts';

export interface RawDelivery {
  checkedAt?: string;
  adId: string;
  status: string;
  effectiveStatus: string;
  impressions: number;
  spendAccountCurrency: number;
  accountCurrency?: string;
}

export function evaluateDelivery(
  raw: RawDelivery,
  config: MetaPaidReachConfig,
): MetaPaidReachSnapshot {
  const targetReached = raw.impressions >= config.limits.targetImpressions;
  const spendLimitReached =
    raw.spendAccountCurrency >= config.budget.pauseAtSpendAccountCurrency;
  const snapshot: MetaPaidReachSnapshot = {
    checkedAt: raw.checkedAt ?? new Date().toISOString(),
    adId: raw.adId,
    status: raw.status,
    effectiveStatus: raw.effectiveStatus,
    impressions: raw.impressions,
    spendAccountCurrency: raw.spendAccountCurrency,
    targetImpressions: config.limits.targetImpressions,
    pauseAtSpendAccountCurrency: config.budget.pauseAtSpendAccountCurrency,
    targetReached,
    spendLimitReached,
    shouldPause: targetReached || spendLimitReached,
  };
  if (raw.accountCurrency !== undefined) snapshot.accountCurrency = raw.accountCurrency;
  return snapshot;
}

export function pauseReason(
  snapshot: MetaPaidReachSnapshot,
): 'target-impressions' | 'spend-limit' | undefined {
  if (snapshot.spendLimitReached) return 'spend-limit';
  if (snapshot.targetReached) return 'target-impressions';
  return undefined;
}
