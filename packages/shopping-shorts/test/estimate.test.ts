import { describe, expect, it } from 'vitest';
import { estimateShort } from '../src/core/estimate.js';

describe('estimateShort', () => {
  it('kling3_0-pro 실측 단가(1.75cr/s)로 견적', () => {
    const r = estimateShort([5, 5, 5], 'kling3_0-pro', true);
    expect(r.perClip).toEqual([8.75, 8.75, 8.75]);
    expect(r.clipsTotal).toBe(26.25);
    expect(r.ttsCredits).toBe(1.1);
    expect(r.grandTotal).toBe(27.35);
  });

  it('미실측 모델은 null — 지어내지 않음', () => {
    const r = estimateShort([5], 'veo3_1', true);
    expect(r.perClip).toEqual([null]);
    expect(r.clipsTotal).toBeNull();
    expect(r.grandTotal).toBeNull();
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it('no-tts 면 TTS 비용 0', () => {
    const r = estimateShort([15], 'seedance-std-1080', false);
    expect(r.ttsCredits).toBe(0);
    expect(r.grandTotal).toBe(135);
  });
});
