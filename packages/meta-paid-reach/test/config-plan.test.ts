import { describe, expect, it } from 'vitest';
import {
  assertCreateReady,
  assertLiveSafety,
  ConfigError,
  configSchema,
  normalizeAdAccountId,
  normalizeApiVersion,
} from '../src/config.js';
import { buildDryRunPlan } from '../src/plan.js';
import { validConfig } from './fixture.js';

describe('설정 및 라이브 안전장치', () => {
  it('1,000 impressions 미만 목표는 거부한다', () => {
    const config = validConfig();
    config.limits.targetImpressions = 999;
    expect(configSchema.safeParse(config).success).toBe(false);
  });

  it('Instagram placement에는 Instagram actor가 필요하다', () => {
    const config = validConfig();
    config.targeting.publisherPlatforms = ['instagram'];
    expect(configSchema.safeParse(config).success).toBe(false);
  });

  it('사용권과 사람 승인이 모두 있어야 PAUSED 객체도 생성할 수 있다', () => {
    const config = validConfig();
    assertCreateReady(config);
    config.compliance.humanApproved = false;
    expect(() => assertCreateReady(config)).toThrow(ConfigError);
  });

  it('라이브 환경 플래그와 하드 예산 상한을 모두 강제한다', () => {
    const config = validConfig();
    expect(() => assertLiveSafety(config, {}, Date.parse('2026-09-04T00:00:00Z'))).toThrow(
      'META_POC_ALLOW_LIVE_SPEND',
    );
    expect(() =>
      assertLiveSafety(
        config,
        {
          META_POC_ALLOW_LIVE_SPEND: 'I_UNDERSTAND',
          META_POC_HARD_SPEND_CAP_MINOR: '10000',
        },
        Date.parse('2026-09-04T00:00:00Z'),
      ),
    ).toThrow('하드 상한');
    expect(
      assertLiveSafety(
        config,
        {
          META_POC_ALLOW_LIVE_SPEND: 'I_UNDERSTAND',
          META_POC_HARD_SPEND_CAP_MINOR: '15000',
        },
        Date.parse('2026-09-04T00:00:00Z'),
      ),
    ).toEqual({ hardSpendCapMinorUnits: 15_000 });
  });

  it('계정 ID와 API 버전을 보수적으로 정규화한다', () => {
    expect(normalizeAdAccountId('act_123')).toBe('123');
    expect(normalizeApiVersion(undefined)).toBe('v26.0');
    expect(() => normalizeAdAccountId('abc')).toThrow();
    expect(() => normalizeApiVersion('latest')).toThrow();
  });
});

describe('dry-run 계획', () => {
  it('모든 집행 객체를 PAUSED로 계획하며 토큰을 요구하지 않는다', () => {
    const plan = buildDryRunPlan(validConfig(), '123', 'v26.0');
    expect(plan.dryRun).toBe(true);
    expect(plan.spendsMoney).toBe(false);
    expect(plan.calls.map((call) => call.label)).toEqual([
      'campaign',
      'ad-set',
      'creative',
      'ad',
    ]);
    for (const call of plan.calls.filter((item) => ['campaign', 'ad-set', 'ad'].includes(item.label))) {
      expect(call.body?.status).toBe('PAUSED');
    }
    expect(JSON.stringify(plan)).not.toContain('access_token');
  });

  it('hosted URL 영상이면 advideos 업로드 단계를 포함한다', () => {
    const config = validConfig();
    config.creative.source = { kind: 'hosted-url', value: 'https://cdn.example.com/ad.mp4' };
    const plan = buildDryRunPlan(config, '123', 'v26.0');
    expect(plan.calls.find((call) => call.label === 'video')?.body).toEqual({
      file_url: 'https://cdn.example.com/ad.mp4',
    });
  });
});
