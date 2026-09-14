import { describe, expect, it } from 'vitest';
import type { AdConcept } from '@cak/contracts';
import { buildVideoGenerationPlan, estimateGeneration } from '../src/core/generation.js';
import { buildSpotPrompt, STYLE_GUIDE } from '../src/core/prompt.js';
import { parseVideoGenerationRequest } from '../src/adapters/schemas.js';

const concept = (): AdConcept => ({
  subject: '테스트 머그', sellingPoints: ['분리형 손잡이'], evidence: ['테스트 제품 명세'],
  uniqueness: { passed: true, rationale: 'Detachable handle shown in a single continuous motion.' },
  narrativeComplete: true, humanApproved: true,
  beats: [
    { index: 0, durationSec: 3, description: 'A travel mug on a sculptural stone surface.' },
    { index: 1, durationSec: 5, description: 'The handle detaches and locks back into place.' },
    { index: 2, durationSec: 5, description: 'A close-up of the finished product.', emphasis: 'hero' },
  ],
});

describe('광고 기반 공통 영상 생성', () => {
  it('광고의 기존 전체 스팟 프롬프트와 품질을 그대로 유지한다', () => {
    const c = concept();
    const r = buildVideoGenerationPlan({ target: 'ad', concept: c });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.plan.clips).toHaveLength(1);
    expect(r.plan.clips[0]).toMatchObject({ prompt: buildSpotPrompt(c), model: 'seedance_2_0', resolution: '1080p', durationSec: 13 });
  });

  it('쇼츠도 광고와 같은 품질/연출을 사용하고 세로 프레이밍만 바꾼다', () => {
    const ad = buildVideoGenerationPlan({ target: 'ad', concept: concept(), splitByBeat: true });
    const shorts = buildVideoGenerationPlan({ target: 'shorts', concept: concept() });
    if (!ad.ok || !shorts.ok) throw new Error('정상 컨셉 거부');
    expect(shorts.plan.clips).toHaveLength(3);
    for (const [i, clip] of shorts.plan.clips.entries()) {
      const wide = ad.plan.clips[i]!;
      expect(clip.model).toBe(wide.model);
      expect(clip.resolution).toBe(wide.resolution);
      expect(clip.prompt.split('\n').slice(0, -1)).toEqual(wide.prompt.split('\n').slice(0, -1));
      expect(clip.prompt).toContain(STYLE_GUIDE);
      expect(clip.prompt).toContain('central safe area');
      expect(clip.beatIndices).toEqual([i]);
    }
    expect(shorts.plan.clips[2]!.prompt).toContain('GLORIFY PRODUCT');
    expect(shorts.plan.referenceCredits).toBe(126);
    expect(shorts.plan.clips[0]).toMatchObject({ durationSec: 3, generationDurationSec: 4, referenceCredits: 36 });
    expect(shorts.plan.warnings.join()).toContain('4초 생성 후 3초');
    expect(shorts.plan.costPreflightRequired).toBe(true);
  });

  it.each(['ad', 'shorts'] as const)('사람 승인 없는 %s 계획은 발급하지 않는다', (target) => {
    const r = buildVideoGenerationPlan({ target, concept: { ...concept(), humanApproved: false } });
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty('plan');
  });

  it.each([
    { evidence: [] },
    { evidence: ['   '] },
    { sellingPoints: [''] },
    { uniqueness: { passed: false, rationale: 'Generic' } },
    { uniqueness: { passed: true, rationale: '  ' } },
    { narrativeComplete: false },
  ])('광고 기획 게이트 실패를 채널 공통으로 거부한다: %j', (invalid) => {
    expect(buildVideoGenerationPlan({ target: 'shorts', concept: { ...concept(), ...invalid } }).ok).toBe(false);
  });

  it('장면 하나에 금지된 프롬프트가 있으면 배치 전체를 거부한다', () => {
    const c = concept();
    c.beats[1]!.description = 'Display the text BUY NOW';
    const r = buildVideoGenerationPlan({ target: 'shorts', concept: c });
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty('plan');
  });

  it('중복 인덱스와 비유한 길이를 거부한다', () => {
    const c = concept();
    c.beats[1]!.index = 0;
    c.beats[0]!.durationSec = Infinity;
    expect(buildVideoGenerationPlan({ target: 'shorts', concept: c }).ok).toBe(false);
  });

  it('쇼츠의 가로 화면/전체 스팟 설정을 거부한다', () => {
    expect(buildVideoGenerationPlan({ target: 'shorts', concept: { ...concept(), aspectRatio: '16:9' } }).ok).toBe(false);
    expect(buildVideoGenerationPlan({ target: 'shorts', concept: concept(), splitByBeat: false }).ok).toBe(false);
  });

  it('draft를 명시한 경우에만 시안 설정으로 바꾸고 미실측 견적은 null이다', () => {
    const r = buildVideoGenerationPlan({ target: 'shorts', concept: concept(), tier: 'draft' });
    if (!r.ok) throw new Error(r.problems.join());
    expect(r.plan.clips[0]!.model).toBe('seedance_2_0_fast');
    expect(r.plan.referenceCredits).toBeNull();
    expect(r.plan.warnings.join()).toContain('TODO(D1)');
    expect(estimateGeneration('draft', [3, 5, 5]).referenceCredits).toBeNull();
  });

  it('JSON 경계에서 잘못된 티어와 개별 모델 우회를 거부한다', () => {
    expect(() => parseVideoGenerationRequest({ target: 'shorts', concept: concept(), tier: 'cheap' })).toThrow();
    expect(() => parseVideoGenerationRequest({ target: 'shorts', concept: concept(), model: 'kling3_0' })).toThrow();
  });

  it('최대 길이를 넘는 스팟은 분할을 요구하고 견적을 지어내지 않는다', () => {
    const c = concept();
    c.beats[0]!.durationSec = 10;
    const r = buildVideoGenerationPlan({ target: 'ad', concept: c });
    expect(r.ok).toBe(false);
    expect(buildVideoGenerationPlan({ target: 'ad', concept: c, splitByBeat: true }).ok).toBe(true);
    expect(estimateGeneration('standard', [16]).referenceCredits).toBeNull();
    for (const invalid of [0, -1, NaN, Infinity]) expect(estimateGeneration('standard', [invalid]).referenceCredits).toBeNull();
  });
});
