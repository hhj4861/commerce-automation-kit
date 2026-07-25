/**
 * 비용 견적 테스트 — 실측 검증점 정확 일치 + 미실측 조합 null(지어내지 않음) + 티어 기본값.
 */
import { describe, it, expect } from 'vitest';
import { USD_PER_CREDIT, estimateCredits, pickTierDefaults } from '../src/core/cost.js';

describe('estimateCredits — 실측 검증점', () => {
  it('seedance_2_0 1080p 5s = 45cr', () => {
    expect(estimateCredits('seedance_2_0', '1080p', 5).credits).toBe(45);
  });

  it('seedance_2_0 1080p 15s = 135cr, usd = 135×0.0475', () => {
    const r = estimateCredits('seedance_2_0', '1080p', 15);
    expect(r.credits).toBe(135);
    expect(r.usd).toBeCloseTo(135 * USD_PER_CREDIT, 4);
    expect(r.note).toContain('4000크레딧');
  });

  it('marketing_studio_video 1080p 12s = 120cr / 15s = 150cr', () => {
    expect(estimateCredits('marketing_studio_video', '1080p', 12).credits).toBe(120);
    expect(estimateCredits('marketing_studio_video', '1080p', 15).credits).toBe(150);
  });

  it('marketing_studio_video 720p 15s = 75cr', () => {
    expect(estimateCredits('marketing_studio_video', '720p', 15).credits).toBe(75);
  });
});

describe('estimateCredits — 미실측 조합은 null (지어내지 않음)', () => {
  it.each([
    ['veo3_1', '4k'],
    ['kling3_0', '1080p'],
    ['seedance_2_0_fast', '480p'],
    ['seedance_2_0', '720p'],
  ] as const)('%s %s → credits:null + 프리플라이트 안내', (model, resolution) => {
    const r = estimateCredits(model, resolution, 15);
    expect(r.credits).toBeNull();
    expect(r.usd).toBeNull();
    expect(r.note).toContain('get_cost 프리플라이트 필수');
  });

  it('durationSec 0 이하도 null (무효 입력 투명화)', () => {
    expect(estimateCredits('seedance_2_0', '1080p', 0).credits).toBeNull();
  });
});

describe('pickTierDefaults', () => {
  it('draft → seedance_2_0_fast / 480p / 5s (시안은 싸게)', () => {
    const d = pickTierDefaults('draft');
    expect(d).toMatchObject({ model: 'seedance_2_0_fast', resolution: '480p', durationSec: 5 });
    expect(d.rationale).toContain('시안은 싸게');
  });

  it('standard → seedance_2_0 / 1080p / 15s', () => {
    expect(pickTierDefaults('standard')).toMatchObject({
      model: 'seedance_2_0',
      resolution: '1080p',
      durationSec: 15,
    });
  });

  it('broadcast → veo3_1 / 4k / 15s (TV 송출급 최종 1컷만)', () => {
    const d = pickTierDefaults('broadcast');
    expect(d).toMatchObject({ model: 'veo3_1', resolution: '4k', durationSec: 15 });
    expect(d.rationale).toContain('TV 송출급 최종 1컷만');
  });
});
