import type {
  MetaPaidReachConfig,
  MetaPaidReachSnapshot,
  MetaPaidReachState,
} from '@cak/contracts';
import { evaluateDelivery, pauseReason } from './limits.js';

export interface MetaOperations {
  createCampaign(config: MetaPaidReachConfig): Promise<string>;
  createAdSet(config: MetaPaidReachConfig, campaignId: string): Promise<string>;
  uploadVideo(source: MetaPaidReachConfig['creative']['source'], name: string): Promise<string>;
  getVideoStatus(videoId: string): Promise<{
    status?: {
      video_status?: string;
      processing_phase?: { status?: string; errors?: unknown };
    };
  }>;
  createCreative(config: MetaPaidReachConfig, videoId: string): Promise<string>;
  createAd(config: MetaPaidReachConfig, adSetId: string, creativeId: string): Promise<string>;
  getAdStatus(adId: string): Promise<{
    id: string;
    status: string;
    effective_status: string;
  }>;
  getAdSetSafety(adSetId: string): Promise<{
    id: string;
    status: string;
    effective_status: string;
    lifetime_budget?: string;
    end_time?: string;
  }>;
  getAdInsights(adId: string): Promise<
    | {
        impressions?: string;
        spend?: string;
        account_currency?: string;
      }
    | undefined
  >;
  setStatus(objectId: string, status: 'ACTIVE' | 'PAUSED'): Promise<void>;
}

export type Persist = (state: MetaPaidReachState) => void;

function requireId(value: string | undefined, label: string): string {
  if (value === undefined) throw new Error(`${label} ID가 상태 파일에 없음`);
  return value;
}

function appendFailure(state: MetaPaidReachState, message: string): void {
  state.failures = [...(state.failures ?? []), message];
}

export function initialState(
  config: MetaPaidReachConfig,
  adAccountId: string,
  apiVersion: string,
): MetaPaidReachState {
  return {
    schemaVersion: 1,
    apiVersion,
    adAccountId,
    config,
    ids: {},
    createdAt: new Date().toISOString(),
  };
}

export async function createPaused(
  api: MetaOperations,
  state: MetaPaidReachState,
  persist: Persist,
  options: { videoPollMs?: number; videoMaxChecks?: number; sleep?: (milliseconds: number) => Promise<void> } = {},
): Promise<MetaPaidReachState> {
  state.ids.campaignId = await api.createCampaign(state.config);
  persist(state);
  state.ids.adSetId = await api.createAdSet(state.config, state.ids.campaignId);
  persist(state);
  state.ids.videoId = await api.uploadVideo(state.config.creative.source, `${state.config.name} / video`);
  persist(state);
  if (state.config.creative.source.kind !== 'meta-video-id') {
    const sleep = options.sleep ?? defaultSleep;
    const maxChecks = options.videoMaxChecks ?? 60;
    let ready = false;
    let lastStatus = 'unknown';
    for (let check = 0; check < maxChecks; check += 1) {
      const video = await api.getVideoStatus(state.ids.videoId);
      lastStatus =
        video.status?.video_status ?? video.status?.processing_phase?.status ?? 'unknown';
      if (lastStatus === 'ready' || lastStatus === 'complete') {
        ready = true;
        break;
      }
      if (lastStatus === 'error' || lastStatus === 'failed') {
        throw new Error(
          `Meta 영상 처리 실패: ${JSON.stringify(video.status?.processing_phase?.errors ?? video.status)}`,
        );
      }
      if (check + 1 < maxChecks) await sleep(options.videoPollMs ?? 5_000);
    }
    if (!ready) throw new Error(`Meta 영상 처리 시간 초과: 마지막 상태=${lastStatus}`);
  }
  state.ids.creativeId = await api.createCreative(state.config, state.ids.videoId);
  persist(state);
  state.ids.adId = await api.createAd(state.config, state.ids.adSetId, state.ids.creativeId);
  persist(state);
  return state;
}

export async function readSnapshot(
  api: MetaOperations,
  state: MetaPaidReachState,
): Promise<MetaPaidReachSnapshot> {
  const adId = requireId(state.ids.adId, 'ad');
  const [status, insights] = await Promise.all([
    api.getAdStatus(adId),
    api.getAdInsights(adId),
  ]);
  const impressions = Number(insights?.impressions ?? 0);
  const spend = Number(insights?.spend ?? 0);
  if (!Number.isFinite(impressions) || !Number.isFinite(spend)) {
    throw new Error('Meta Insights의 impressions/spend가 숫자가 아님');
  }
  const raw = {
    adId,
    status: status.status,
    effectiveStatus: status.effective_status,
    impressions,
    spendAccountCurrency: spend,
  };
  return evaluateDelivery(
    insights?.account_currency === undefined
      ? raw
      : { ...raw, accountCurrency: insights.account_currency },
    state.config,
  );
}

export async function pauseAll(
  api: MetaOperations,
  state: MetaPaidReachState,
  reason: NonNullable<MetaPaidReachState['pauseReason']>,
  persist: Persist,
): Promise<{ ok: boolean; deliveryStopped: boolean; failures: string[] }> {
  const targets: Array<[string, string | undefined]> = [
    ['campaign', state.ids.campaignId],
    ['ad set', state.ids.adSetId],
    ['ad', state.ids.adId],
  ];
  const failures: string[] = [];
  const pausedIds = new Set<string>();
  for (const [label, id] of targets) {
    if (id === undefined) continue;
    try {
      await api.setStatus(id, 'PAUSED');
      pausedIds.add(id);
    } catch (error) {
      const message = `${label} ${id} PAUSE 실패: ${error instanceof Error ? error.message : String(error)}`;
      failures.push(message);
      appendFailure(state, message);
    }
  }
  const deliveryStopped = targets.some(([, id]) => id !== undefined && pausedIds.has(id));
  if (deliveryStopped) {
    state.pausedAt = new Date().toISOString();
    state.pauseReason = reason;
  }
  persist(state);
  return { ok: failures.length === 0, deliveryStopped, failures };
}

export async function activateAll(
  api: MetaOperations,
  state: MetaPaidReachState,
  persist: Persist,
): Promise<void> {
  const adId = requireId(state.ids.adId, 'ad');
  const adSetId = requireId(state.ids.adSetId, 'ad set');
  const campaignId = requireId(state.ids.campaignId, 'campaign');

  try {
    // Ads Manager에서 검수 후 예산/종료 시각이 늘어난 경우 로컬 승인 범위를 벗어나므로
    // 어떤 객체도 ACTIVE로 바꾸기 전에 중단한다.
    const remoteAdSet = await api.getAdSetSafety(adSetId);
    const remoteBudget = Number(remoteAdSet.lifetime_budget);
    const remoteEndTime = Date.parse(remoteAdSet.end_time ?? '');
    if (remoteAdSet.status !== 'PAUSED') {
      throw new Error(`Meta Ad Set이 PAUSED가 아님: ${remoteAdSet.status}`);
    }
    if (!Number.isSafeInteger(remoteBudget) || remoteBudget <= 0) {
      throw new Error('Meta Ad Set의 lifetime_budget을 확인할 수 없음');
    }
    if (remoteBudget > state.config.budget.lifetimeBudgetMinorUnits) {
      throw new Error(
        `Meta Ad Set lifetime_budget(${remoteBudget})가 승인 설정(${state.config.budget.lifetimeBudgetMinorUnits}) 초과`,
      );
    }
    if (!Number.isFinite(remoteEndTime)) {
      throw new Error('Meta Ad Set의 end_time을 확인할 수 없음');
    }
    if (remoteEndTime > Date.parse(state.config.budget.endTime)) {
      throw new Error('Meta Ad Set end_time이 승인 설정보다 늦음');
    }

    // 부모가 PAUSED인 동안 자식부터 켠다. 마지막 campaign 호출 전에는 배달되지 않는다.
    await api.setStatus(adId, 'ACTIVE');
    await api.setStatus(adSetId, 'ACTIVE');
    await api.setStatus(campaignId, 'ACTIVE');
    state.activatedAt = new Date().toISOString();
    persist(state);
  } catch (error) {
    appendFailure(state, `활성화 실패: ${error instanceof Error ? error.message : String(error)}`);
    await pauseAll(api, state, 'monitor-failure', persist);
    throw error;
  }
}

export async function checkAndPause(
  api: MetaOperations,
  state: MetaPaidReachState,
  persist: Persist,
  executePause: boolean,
): Promise<{ snapshot: MetaPaidReachSnapshot; paused: boolean; wouldPause: boolean }> {
  const snapshot = await readSnapshot(api, state);
  state.lastSnapshot = snapshot;
  persist(state);
  if (!snapshot.shouldPause) return { snapshot, paused: false, wouldPause: false };
  if (!executePause) return { snapshot, paused: false, wouldPause: true };
  const paused = await pauseAll(api, state, pauseReason(snapshot) ?? 'monitor-failure', persist);
  if (!paused.deliveryStopped) {
    throw new Error(`Meta PAUSE가 모든 계층에서 실패함: ${paused.failures.join('; ')}`);
  }
  return { snapshot, paused: true, wouldPause: true };
}

export interface MonitorOptions {
  intervalMs: number;
  maxChecks: number;
  maxConsecutiveFailures?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

const defaultSleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function runGuarded(
  api: MetaOperations,
  state: MetaPaidReachState,
  persist: Persist,
  options: MonitorOptions,
): Promise<{ snapshot?: MetaPaidReachSnapshot; pauseReason: MetaPaidReachState['pauseReason'] }> {
  const sleep = options.sleep ?? defaultSleep;
  const maxFailures = options.maxConsecutiveFailures ?? 3;
  let failures = 0;

  const before = await checkAndPause(api, state, persist, true);
  if (before.paused) return { snapshot: before.snapshot, pauseReason: state.pauseReason };

  await activateAll(api, state, persist);
  for (let check = 0; check < options.maxChecks; check += 1) {
    try {
      const result = await checkAndPause(api, state, persist, true);
      failures = 0;
      if (result.paused) return { snapshot: result.snapshot, pauseReason: state.pauseReason };
    } catch (error) {
      failures += 1;
      appendFailure(state, `모니터 조회 실패 ${failures}/${maxFailures}: ${error instanceof Error ? error.message : String(error)}`);
      persist(state);
      if (failures >= maxFailures) {
        await pauseAll(api, state, 'monitor-failure', persist);
        throw error;
      }
    }
    if (check + 1 < options.maxChecks) await sleep(options.intervalMs);
  }

  const stopped = await pauseAll(api, state, 'monitor-timeout', persist);
  if (!stopped.deliveryStopped) {
    throw new Error(`모니터 시간 초과 후 PAUSE 실패: ${stopped.failures.join('; ')}`);
  }
  return state.lastSnapshot === undefined
    ? { pauseReason: state.pauseReason }
    : { snapshot: state.lastSnapshot, pauseReason: state.pauseReason };
}
