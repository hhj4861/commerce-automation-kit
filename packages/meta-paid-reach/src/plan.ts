import type { MetaPaidReachConfig } from '@cak/contracts';

export interface PlannedCall {
  label: string;
  method: 'GET' | 'POST';
  url: string;
  body?: Record<string, unknown>;
  safety: string;
}

function accountNode(accountId: string): string {
  return `act_${accountId}`;
}

export function campaignParams(config: MetaPaidReachConfig): Record<string, unknown> {
  return {
    name: `${config.name} / campaign`,
    objective: 'OUTCOME_AWARENESS',
    buying_type: 'AUCTION',
    special_ad_categories: config.specialAdCategories,
    is_adset_budget_sharing_enabled: false,
    status: 'PAUSED',
  };
}

export function adSetParams(config: MetaPaidReachConfig, campaignId: string): Record<string, unknown> {
  const targeting: Record<string, unknown> = {
    age_min: config.targeting.ageMin,
    age_max: config.targeting.ageMax,
    geo_locations: { countries: config.targeting.countries },
  };
  if (config.targeting.publisherPlatforms !== undefined) {
    targeting.publisher_platforms = config.targeting.publisherPlatforms;
  }
  return {
    name: `${config.name} / ad set`,
    campaign_id: campaignId,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'IMPRESSIONS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    lifetime_budget: config.budget.lifetimeBudgetMinorUnits,
    start_time: config.budget.startTime,
    end_time: config.budget.endTime,
    targeting,
    status: 'PAUSED',
  };
}

export function creativeParams(config: MetaPaidReachConfig, videoId: string): Record<string, unknown> {
  const videoData: Record<string, unknown> = {
    video_id: videoId,
    message: config.creative.message,
    call_to_action: {
      type: config.creative.callToAction ?? 'LEARN_MORE',
      value: { link: config.creative.landingPageUrl },
    },
  };
  if (config.creative.headline !== undefined) videoData.title = config.creative.headline;
  if (config.creative.thumbnailUrl !== undefined) videoData.image_url = config.creative.thumbnailUrl;
  else videoData.video_thumbnail_source = 'generated_default';

  const storySpec: Record<string, unknown> = {
    page_id: config.creative.pageId,
    video_data: videoData,
  };
  if (config.creative.instagramActorId !== undefined) {
    storySpec.instagram_actor_id = config.creative.instagramActorId;
  }
  return {
    name: `${config.name} / creative`,
    object_story_spec: storySpec,
  };
}

export function adParams(config: MetaPaidReachConfig, adSetId: string, creativeId: string): Record<string, unknown> {
  return {
    name: `${config.name} / ad`,
    adset_id: adSetId,
    creative: { creative_id: creativeId },
    status: 'PAUSED',
  };
}

export function buildDryRunPlan(
  config: MetaPaidReachConfig,
  adAccountId: string,
  apiVersion: string,
): { dryRun: true; spendsMoney: false; calls: PlannedCall[]; activation: string } {
  const base = `https://graph.facebook.com/${apiVersion}`;
  const account = accountNode(adAccountId);
  const calls: PlannedCall[] = [
    {
      label: 'campaign',
      method: 'POST',
      url: `${base}/${account}/campaigns`,
      body: campaignParams(config),
      safety: 'status=PAUSED',
    },
    {
      label: 'ad-set',
      method: 'POST',
      url: `${base}/${account}/adsets`,
      body: adSetParams(config, '<campaign-id>'),
      safety: 'status=PAUSED + lifetime_budget + end_time',
    },
  ];
  if (config.creative.source.kind !== 'meta-video-id') {
    calls.push({
      label: 'video',
      method: 'POST',
      url: `${base}/${account}/advideos`,
      body:
        config.creative.source.kind === 'hosted-url'
          ? { file_url: config.creative.source.value }
          : { source: `<binary:${config.creative.source.value}>` },
      safety: '광고 집행 없음; 자산 업로드만 수행',
    });
  }
  calls.push(
    {
      label: 'creative',
      method: 'POST',
      url: `${base}/${account}/adcreatives`,
      body: creativeParams(config, '<video-id>'),
      safety: '광고 집행 없음; 소재 객체만 생성',
    },
    {
      label: 'ad',
      method: 'POST',
      url: `${base}/${account}/ads`,
      body: adParams(config, '<ad-set-id>', '<creative-id>'),
      safety: 'status=PAUSED',
    },
  );
  return {
    dryRun: true,
    spendsMoney: false,
    calls,
    activation:
      'create는 절대 활성화하지 않음. run은 --execute --confirm LIVE_SPEND 및 두 환경 안전장치가 모두 필요.',
  };
}
